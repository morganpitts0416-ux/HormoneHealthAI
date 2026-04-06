import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import multer from "multer";
import OpenAI from "openai";
import { interpretLabsRequestSchema, femaleLabValuesSchema, type InterpretationResult, type LabValues, type FemaleLabValues, type InsertLabResult, insertSavedInterpretationSchema, insertPatientSchema } from "@shared/schema";
import { ClinicalLogicEngine } from "./clinical-logic";
import { FemaleClinicalLogicEngine } from "./clinical-logic-female";
import { AIService } from "./ai-service";
import { PDFExtractionService } from "./pdf-extraction";
import { ASCVDCalculator } from "./ascvd-calculator";
import { PREVENTCalculator } from "./prevent-calculator";
import { StopBangCalculator } from "./stopbang-calculator";
import { evaluateSupplements } from "./supplements-female";
import { evaluateMaleSupplements } from "./supplements-male";
import { screenInsulinResistance } from "./insulin-resistance";
import {
  forwardMessageToExternalProvider,
  parseInboundWebhook,
  generateWebhookSecret,
  type ExternalProvider,
} from "./external-messaging";
import { storage } from "./storage";
import { passport, hashPassword } from "./auth";
import { logAudit } from "./audit";
import { validatePasswordStrength } from "@shared/password-policy";
import { LAB_MARKER_DEFAULTS, SYMPTOM_KEYS, SUPPLEMENT_CATEGORIES, LAB_MARKER_KEYS } from "./lab-marker-defaults";
import { sendInviteEmail, sendPasswordResetEmail, sendPatientPortalInviteEmail, sendProtocolPublishedEmail, sendNewPortalMessageEmail, sendStaffInviteEmail, sendPortalPasswordResetEmail } from "./email-service";
import { buildMedicalTermsList, buildNormalizationRules, NORMALIZATION_EXAMPLES } from "./clinical-lexicon";
import bcrypt from "bcrypt";

// ── Auth middleware ────────────────────────────────────────────────────────────

// Returns the effective clinician ID — either the staff member's owning clinician
// or the logged-in clinician's own ID.
function getClinicianId(req: Request): number {
  const sess = req.session as any;
  if (sess.staffClinicianId) return sess.staffClinicianId as number;
  return (req.user as any).id;
}

// Allows both clinicians (passport) and staff (session.staffId) through.
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sess = req.session as any;
  if (sess.staffId && sess.staffClinicianId) return next();
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Authentication required" });
}

// Blocks staff from reaching clinician-only endpoints (account settings, admin).
function requireClinicianOnly(req: Request, res: Response, next: NextFunction) {
  const sess = req.session as any;
  if (sess.staffId) {
    return res.status(403).json({ message: "Staff members cannot modify clinic account settings." });
  }
  return requireAuth(req, res, next);
}

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Auth routes ────────────────────────────────────────────────────────────

  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, username, password, firstName, lastName, title, npi, clinicName, phone, address } = req.body;
      if (!email || !username || !password || !firstName || !lastName || !title || !clinicName) {
        return res.status(400).json({ message: "All required fields must be provided" });
      }
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ message: "Password does not meet requirements: " + pwCheck.errors.join("; ") });
      }
      const existingByUsername = await storage.getUserByUsername(username);
      if (existingByUsername) {
        return res.status(409).json({ message: "Username already taken" });
      }
      const existingByEmail = await storage.getUserByEmail(email);
      if (existingByEmail) {
        return res.status(409).json({ message: "Email already registered" });
      }
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        title,
        npi: npi || null,
        clinicName,
        phone: phone || null,
        address: address || null,
      });
      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login after registration failed" });
        const { passwordHash: _ph, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login — checks clinician accounts first (via passport), then staff accounts
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);

      if (user) {
        // Clinician login succeeded
        return req.login(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          logAudit(req, { action: "LOGIN", clinicianId: user.id });
          const { passwordHash: _ph, externalMessagingApiKey, ...safeUser } = user;
          res.json({ ...safeUser, externalMessagingApiKeySet: !!(externalMessagingApiKey) });
        });
      }

      // Try staff login (email-only, no username)
      try {
        const { username: emailOrUsername, password } = req.body;
        const staff = await storage.getClinicianStaffByEmail(emailOrUsername?.trim?.() || '');
        if (staff && staff.isActive && staff.passwordHash) {
          // HIPAA: Check lockout
          if (staff.lockedUntil && new Date(staff.lockedUntil) > new Date()) {
            const minutesLeft = Math.ceil((new Date(staff.lockedUntil).getTime() - Date.now()) / 60000);
            logAudit(req, { action: "LOGIN_LOCKED", clinicianId: staff.clinicianId, staffId: staff.id, details: { email: emailOrUsername } });
            return res.status(401).json({ message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` });
          }

          const valid = await bcrypt.compare(password, staff.passwordHash);
          if (valid) {
            await storage.recordStaffLoginAttempt(staff.id, true);
            const sess = req.session as any;
            sess.staffId = staff.id;
            sess.staffClinicianId = staff.clinicianId;
            return req.session.save((saveErr) => {
              if (saveErr) return next(saveErr);
              logAudit(req, { action: "LOGIN", clinicianId: staff.clinicianId, staffId: staff.id });
              const { passwordHash: _ph, inviteToken: _it, ...safeStaff } = staff;
              return res.json({ ...safeStaff, isStaff: true });
            });
          } else {
            storage.recordStaffLoginAttempt(staff.id, false).catch(() => {});
            logAudit(req, { action: "LOGIN_FAILED", clinicianId: staff.clinicianId, staffId: staff.id, details: { email: emailOrUsername } });
          }
        }
      } catch (staffErr) {
        console.error('[AUTH] Error checking staff login:', staffErr);
      }

      return res.status(401).json({ message: info?.message || "Invalid credentials" });
    })(req, res, next);
  });

  // Logout — handles both clinician (passport) and staff (session) logout
  app.post("/api/auth/logout", (req, res) => {
    const sess = req.session as any;
    if (sess.staffId) {
      delete sess.staffId;
      delete sess.staffClinicianId;
      return req.session.save((err) => {
        if (err) return res.status(500).json({ message: "Logout failed" });
        res.json({ success: true });
      });
    }
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ success: true });
    });
  });

  // Current user — returns clinician info for both clinician and staff sessions.
  // When staff is logged in, augments with isStaff/staffId/staffFirstName/staffLastName/staffRole.
  app.get("/api/auth/me", async (req, res) => {
    const sess = req.session as any;

    // Staff session
    if (sess.staffId && sess.staffClinicianId) {
      try {
        const [clinician, staff] = await Promise.all([
          storage.getUserById(sess.staffClinicianId),
          storage.getClinicianStaffById(sess.staffId),
        ]);
        if (!clinician || !staff || !staff.isActive) {
          delete sess.staffId;
          delete sess.staffClinicianId;
          return res.status(401).json({ message: "Not authenticated" });
        }
        const { passwordHash: _ph, externalMessagingApiKey, ...safeClinician } = clinician as any;
        return res.json({
          ...safeClinician,
          externalMessagingApiKeySet: !!(externalMessagingApiKey),
          isStaff: true,
          staffId: staff.id,
          staffFirstName: staff.firstName,
          staffLastName: staff.lastName,
          staffRole: staff.role,
        });
      } catch {
        return res.status(500).json({ message: "Error fetching session" });
      }
    }

    // Clinician session
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { passwordHash: _ph, externalMessagingApiKey, ...safeUser } = req.user as any;
    res.json({ ...safeUser, externalMessagingApiKeySet: !!(externalMessagingApiKey) });
  });

  // Update profile (clinicians only — staff cannot change clinic settings)
  app.patch("/api/auth/profile", requireClinicianOnly, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const {
        firstName, lastName, title, npi, clinicName, phone, address, email,
        messagingPreference, messagingPhone,
        externalMessagingProvider, externalMessagingApiKey, externalMessagingChannelId,
      } = req.body;

      // Auto-generate a webhook secret the first time external_api is enabled
      let webhookSecretUpdate: { externalMessagingWebhookSecret?: string } = {};
      if (messagingPreference === 'external_api') {
        const current = await storage.getUserById(userId);
        if (!current?.externalMessagingWebhookSecret) {
          webhookSecretUpdate = { externalMessagingWebhookSecret: generateWebhookSecret() };
        }
      }

      const updated = await storage.updateUser(userId, {
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(npi !== undefined ? { npi } : {}),
        ...(clinicName !== undefined ? { clinicName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(messagingPreference !== undefined ? { messagingPreference } : {}),
        ...(messagingPhone !== undefined ? { messagingPhone } : {}),
        ...(externalMessagingProvider !== undefined ? { externalMessagingProvider } : {}),
        ...(externalMessagingApiKey !== undefined ? { externalMessagingApiKey } : {}),
        ...(externalMessagingChannelId !== undefined ? { externalMessagingChannelId } : {}),
        ...webhookSecretUpdate,
      });
      if (!updated) return res.status(404).json({ message: "User not found" });
      // Never expose the raw API key to the client — only confirm it's set
      const { passwordHash: _ph, externalMessagingApiKey: _key, ...safeUser } = updated;
      res.json({ ...safeUser, externalMessagingApiKeySet: !!(updated.externalMessagingApiKey) });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });
  // Forgot password — sends reset link to email
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      // Always return 200 to avoid email enumeration
      if (!user) return res.json({ message: "If that email is registered, a reset link has been sent." });

      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.savePasswordResetToken(user.id, token, expires);

      try {
        await sendPasswordResetEmail(user.email, user.firstName, token, req);
      } catch (emailErr) {
        console.error("[EMAIL] Failed to send password reset email:", emailErr);
      }

      res.json({ message: "If that email is registered, a reset link has been sent." });
    } catch (error) {
      console.error("Error in forgot-password:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Validate a reset/invite token (check it's valid + not expired)
  app.get("/api/auth/validate-reset-token/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const user = await storage.getUserByResetToken(token);
      if (!user || !user.passwordResetExpires) {
        return res.status(400).json({ valid: false, message: "Invalid or expired link" });
      }
      if (new Date() > user.passwordResetExpires) {
        return res.status(400).json({ valid: false, message: "This link has expired" });
      }
      res.json({ valid: true, email: user.email, firstName: user.firstName });
    } catch (error) {
      console.error("Error validating reset token:", error);
      res.status(500).json({ valid: false, message: "Failed to validate link" });
    }
  });

  // Reset password using a valid token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
      }
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ message: "Password does not meet requirements: " + pwCheck.errors.join("; ") });
      }

      const user = await storage.getUserByResetToken(token);
      if (!user || !user.passwordResetExpires) {
        return res.status(400).json({ message: "Invalid or expired link" });
      }
      if (new Date() > user.passwordResetExpires) {
        return res.status(400).json({ message: "This link has expired. Please request a new one." });
      }

      const passwordHash = await hashPassword(password);
      await storage.updatePassword(user.id, passwordHash);

      res.json({ message: "Password updated successfully. You can now log in." });
    } catch (error) {
      console.error("Error in reset-password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Lab interpretation endpoint
  app.post("/api/interpret-labs", async (req, res) => {
    console.log('[API] POST /api/interpret-labs - Received request');
    console.log('[API] Request body:', JSON.stringify(req.body, null, 2));
    try {
      // Validate request body
      const parseResult = interpretLabsRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid lab values", 
          details: parseResult.error.errors 
        });
      }

      const labs = parseResult.data;
      const patientId = req.body.patientId ? parseInt(req.body.patientId) : undefined;

      let trendContext = '';
      if (patientId) {
        const priorLabs = await storage.getLabResultsByPatient(patientId);
        if (priorLabs.length > 0) {
          trendContext = AIService.buildTrendContext(labs, priorLabs.map(l => ({ labDate: l.labDate, labValues: l.labValues as LabValues })));
          console.log('[API] Trend context built from', priorLabs.length, 'prior labs');
        }
      }

      // Step 1: Detect red flags
      const redFlags = ClinicalLogicEngine.detectRedFlags(labs);

      // Step 2: Generate detailed interpretations
      const interpretations = ClinicalLogicEngine.interpretLabValues(labs);

      // Step 3: Calculate PREVENT cardiovascular risk (replaces legacy ASCVD)
      // PREVENT uses sex-specific, race-free equations with eGFR and BMI
      const preventLabData = {
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'male' as const } : undefined
      };
      const preventRisk = PREVENTCalculator.calculateRisk(preventLabData) || undefined;
      console.log('[API] Male PREVENT calculation result:', preventRisk ? `10yr CVD: ${preventRisk.tenYearCVDPercentage}, ASCVD: ${preventRisk.tenYearASCVDPercentage}, HF: ${preventRisk.tenYearHFPercentage}` : 'Not calculated');

      // Step 3a: Add PREVENT risk metrics to interpretations if calculated
      if (preventRisk) {
        console.log('[API] Adding PREVENT to male interpretations array');
        const getRiskStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'borderline': return 'borderline';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
          (interp.category.toLowerCase().includes('cholesterol') || 
           interp.category.toLowerCase().includes('triglyceride') ||
           interp.category.toLowerCase().includes('ldl') ||
           interp.category.toLowerCase().includes('hdl')) &&
          (!arr[idx + 1] || 
           (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
            !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
            !arr[idx + 1].category.toLowerCase().includes('ldl') &&
            !arr[idx + 1].category.toLowerCase().includes('hdl')))
        );

        // Add CVD risk interpretation
        const cvdInterpretation = {
          category: '10-Year Total CVD Risk (PREVENT)',
          value: preventRisk.tenYearTotalCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Low <5%, Borderline 5-7.4%, Intermediate 7.5-19.9%, High ≥20%',
          interpretation: `10-year cardiovascular disease risk: ${preventRisk.tenYearCVDPercentage} (${preventRisk.riskCategory.toUpperCase()} RISK). Includes ASCVD and heart failure.`,
          recommendation: preventRisk.recommendations,
          recheckTiming: 'Annual',
        };

        // Add ASCVD-specific risk
        const ascvdInterpretation = {
          category: '10-Year ASCVD Risk (PREVENT)',
          value: preventRisk.tenYearASCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Heart attack & stroke risk',
          interpretation: `10-year ASCVD risk (heart attack, stroke): ${preventRisk.tenYearASCVDPercentage}`,
          recommendation: preventRisk.statinRecommendation || '',
          recheckTiming: 'Annual',
        };

        // Add Heart Failure risk
        const hfStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.tenYearHeartFailure >= 0.1 ? 'abnormal' : preventRisk.tenYearHeartFailure >= 0.05 ? 'borderline' : 'normal';
        const hfInterpretation = {
          category: '10-Year Heart Failure Risk (PREVENT)',
          value: preventRisk.tenYearHeartFailure * 100,
          unit: '%',
          status: hfStatus,
          referenceRange: 'Heart failure risk',
          interpretation: `10-year heart failure risk: ${preventRisk.tenYearHFPercentage}`,
          recommendation: preventRisk.tenYearHeartFailure >= 0.075 ? 'Consider SGLT2 inhibitor or GLP-1 agonist for cardioprotection if diabetic or high-risk.' : 'Monitor for symptoms: shortness of breath, fatigue, leg swelling.',
          recheckTiming: 'Annual',
        };

        // Insert after lipid panel if found, otherwise append at end
        if (lipidEndIndex !== -1) {
          interpretations.splice(lipidEndIndex + 1, 0, cvdInterpretation, ascvdInterpretation, hfInterpretation);
        } else {
          interpretations.push(cvdInterpretation, ascvdInterpretation, hfInterpretation);
        }

        // Add 30-year risks if available (ages 30-59)
        if (preventRisk.thirtyYearTotalCVD !== undefined) {
          const thirtyYearStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.thirtyYearTotalCVD >= 0.30 ? 'abnormal' : preventRisk.thirtyYearTotalCVD >= 0.15 ? 'borderline' : 'normal';
          const thirtyYearInterpretation = {
            category: '30-Year CVD Risk (PREVENT)',
            value: preventRisk.thirtyYearTotalCVD * 100,
            unit: '%',
            status: thirtyYearStatus,
            referenceRange: 'Long-term cardiovascular risk',
            interpretation: `30-year risks: CVD ${preventRisk.thirtyYearCVDPercentage}, ASCVD ${preventRisk.thirtyYearASCVDPercentage}, Heart Failure ${preventRisk.thirtyYearHFPercentage}`,
            recommendation: 'Long-term lifestyle modifications and risk factor management are critical for reducing lifetime cardiovascular risk.',
            recheckTiming: 'Annual',
          };
          const hfIdx = interpretations.findIndex(i => i.category === '10-Year Heart Failure Risk (PREVENT)');
          if (hfIdx !== -1) {
            interpretations.splice(hfIdx + 1, 0, thirtyYearInterpretation);
          } else {
            interpretations.push(thirtyYearInterpretation);
          }
        }
      }

      // Step 3b: Calculate STOP-BANG sleep apnea risk if demographics data available
      const stopBangRisk = StopBangCalculator.calculateRisk(labs) || undefined;
      console.log('[API] Male STOP-BANG calculation result:', stopBangRisk ? `Score: ${stopBangRisk.score}/8, Risk: ${stopBangRisk.riskCategory}` : 'Not calculated (missing demographics data)');

      // Step 3c: Add STOP-BANG to interpretations if calculated
      if (stopBangRisk) {
        console.log('[API] Adding STOP-BANG to interpretations array');
        // Map STOP-BANG risk category to interpretation status
        const getStopBangStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical'; // High OSA risk is critical due to CV/erythrocytosis complications
            default: return 'abnormal';
          }
        };

        const stopBangInterpretation = {
          category: 'Sleep Apnea Risk (STOP-BANG)',
          value: stopBangRisk.score,
          unit: 'points',
          status: getStopBangStatus(stopBangRisk.riskCategory),
          referenceRange: 'Low 0-2, Intermediate 3-4, High 5-8',
          interpretation: stopBangRisk.riskDescription,
          recommendation: stopBangRisk.recommendations,
          recheckTiming: stopBangRisk.riskCategory === 'low' ? 'Annual' : 'Follow-up in 1-3 months after sleep study',
        };

        // Insert after 30-year CVD risk if exists, otherwise after HF risk, otherwise after lipid panel
        const thirtyYearIndex = interpretations.findIndex(interp => interp.category === '30-Year CVD Risk (PREVENT)');
        const hfRiskIndex = interpretations.findIndex(interp => interp.category === '10-Year Heart Failure Risk (PREVENT)');
        if (thirtyYearIndex !== -1) {
          interpretations.splice(thirtyYearIndex + 1, 0, stopBangInterpretation);
        } else if (hfRiskIndex !== -1) {
          interpretations.splice(hfRiskIndex + 1, 0, stopBangInterpretation);
        } else {
          const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
            (interp.category.toLowerCase().includes('cholesterol') || 
             interp.category.toLowerCase().includes('triglyceride') ||
             interp.category.toLowerCase().includes('ldl') ||
             interp.category.toLowerCase().includes('hdl')) &&
            (!arr[idx + 1] || 
             (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
              !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
              !arr[idx + 1].category.toLowerCase().includes('ldl') &&
              !arr[idx + 1].category.toLowerCase().includes('hdl')))
          );
          if (lipidEndIndex !== -1) {
            interpretations.splice(lipidEndIndex + 1, 0, stopBangInterpretation);
          } else {
            interpretations.push(stopBangInterpretation);
          }
        }
      }

      // Step 3d: Calculate Adjusted Risk Assessment based on ApoB and Lp(a)
      let adjustedRisk = undefined;
      if (preventRisk && (labs.apoB !== undefined || labs.lpa !== undefined)) {
        adjustedRisk = PREVENTCalculator.calculateAdjustedRisk(
          preventRisk.tenYearASCVD,
          labs.apoB,
          labs.lpa
        ) || undefined;
        console.log('[API] Male Adjusted Risk Assessment:', adjustedRisk ? 
          `Base: ${adjustedRisk.baseASCVDRisk.toFixed(1)}%, Category: ${adjustedRisk.riskCategory} → ${adjustedRisk.adjustedCategory}` : 
          'Not calculated');
      }

      // Steps 4 & 5: Generate AI recommendations and patient summary in parallel
      const [aiRecommendations, patientSummary] = await Promise.all([
        AIService.generateRecommendations(labs, redFlags, interpretations, 'male', trendContext || undefined),
        AIService.generatePatientSummary(labs, interpretations, redFlags.length > 0, preventRisk),
      ]);

      // Step 6: Determine recheck window
      const recheckWindow = ClinicalLogicEngine.determineRecheckWindow(
        redFlags,
        interpretations
      );

      // Step 7: Evaluate supplement recommendations
      const supplements = evaluateMaleSupplements(labs);
      console.log('[API] Male supplement recommendations:', supplements.length);

      // Step 8: Insulin Resistance Screening
      const insulinResistance = screenInsulinResistance(labs, 'male') || undefined;
      console.log('[API] Male IR Screening:', insulinResistance ? `${insulinResistance.positiveCount} positive markers, ${insulinResistance.likelihoodLabel}` : 'Not calculated (insufficient markers)');

      if (insulinResistance && insulinResistance.likelihood !== 'none') {
        const irStatus: 'normal' | 'borderline' | 'abnormal' | 'critical' = 
          insulinResistance.likelihood === 'high' ? 'critical' : 'abnormal';
        const irInterpretation = {
          category: 'Insulin Resistance Screening',
          value: insulinResistance.positiveCount,
          unit: 'of 6 markers positive',
          status: irStatus,
          referenceRange: '0-1 Low, 2 Moderate, 3+ High Likelihood',
          interpretation: insulinResistance.providerSummary,
          recommendation: insulinResistance.phenotypes.length > 0 
            ? `Phenotype(s): ${insulinResistance.phenotypes.map(p => p.name).join('; ')}. ${insulinResistance.confirmationTests}`
            : insulinResistance.confirmationTests || 'Consider fasting insulin + fasting glucose for confirmation.',
          recheckTiming: '3-6 months',
        };
        interpretations.push(irInterpretation);
      }

      // Step 9: Generate SOAP note
      const soapNote = await AIService.generateSOAPNote(
        labs, redFlags, interpretations, aiRecommendations, recheckWindow,
        'male', preventRisk, supplements, insulinResistance, trendContext || undefined
      );

      const result: InterpretationResult = {
        redFlags,
        interpretations,
        aiRecommendations,
        patientSummary,
        recheckWindow,
        preventRisk,
        adjustedRisk,
        supplements,
        insulinResistance,
        soapNote,
      };

      console.log('[API] Response summary:');
      console.log('  - Red flags:', redFlags.length);
      console.log('  - Interpretations:', interpretations.length);
      console.log('  - AI recommendations length:', aiRecommendations.length);
      console.log('  - Patient summary length:', patientSummary.length);
      console.log('  - Recheck window:', recheckWindow);
      console.log('  - Supplements:', supplements.length);
      console.log('  - SOAP note length:', soapNote.length);

      res.json(result);
    } catch (error) {
      console.error("Error interpreting labs:", error);
      res.status(500).json({ 
        error: "Failed to interpret lab results", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Female lab interpretation endpoint
  app.post("/api/interpret-labs-female", async (req, res) => {
    console.log('[API] POST /api/interpret-labs-female - Received request');
    console.log('[API] Request body:', JSON.stringify(req.body, null, 2));
    try {
      // Validate request body
      const parseResult = femaleLabValuesSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid lab values", 
          details: parseResult.error.errors 
        });
      }

      const labs = parseResult.data;
      const patientId = req.body.patientId ? parseInt(req.body.patientId) : undefined;

      let trendContext = '';
      if (patientId) {
        const priorLabs = await storage.getLabResultsByPatient(patientId);
        if (priorLabs.length > 0) {
          trendContext = AIService.buildTrendContext(labs, priorLabs.map(l => ({ labDate: l.labDate, labValues: l.labValues as FemaleLabValues })));
          console.log('[API] Female trend context built from', priorLabs.length, 'prior labs');
        }
      }

      // Debug: Log hormone values received
      console.log('[API] Female hormone values received:', {
        estradiol: labs.estradiol,
        progesterone: labs.progesterone,
        fsh: labs.fsh,
        lh: labs.lh,
        testosterone: labs.testosterone,
        menstrualPhase: labs.menstrualPhase,
        onHRT: labs.onHRT
      });

      // Step 1: Detect red flags using female-specific logic
      const redFlags = FemaleClinicalLogicEngine.detectRedFlags(labs);

      // Step 2: Generate detailed interpretations with female reference ranges
      const interpretations = FemaleClinicalLogicEngine.interpretLabValues(labs);
      
      // Debug: Log categories of all interpretations generated
      console.log('[API] Female interpretation categories:', interpretations.map(i => i.category));

      // Step 3: Calculate PREVENT cardiovascular risk if demographics and lipid data are available
      // PREVENT uses sex-specific, race-free equations with eGFR and BMI
      const preventLabData = {
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'female' as const } : undefined
      };
      const preventRisk = PREVENTCalculator.calculateRisk(preventLabData) || undefined;
      console.log('[API] Female PREVENT calculation result:', preventRisk ? `10yr CVD: ${preventRisk.tenYearCVDPercentage}, ASCVD: ${preventRisk.tenYearASCVDPercentage}, HF: ${preventRisk.tenYearHFPercentage}` : 'Not calculated');

      // Step 3a: Add PREVENT risk metrics to interpretations if calculated
      if (preventRisk) {
        console.log('[API] Adding PREVENT to female interpretations array');
        const getRiskStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'borderline': return 'borderline';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        const lipidEndIndex = interpretations.findIndex((interp, idx, arr) => 
          (interp.category.toLowerCase().includes('cholesterol') || 
           interp.category.toLowerCase().includes('triglyceride') ||
           interp.category.toLowerCase().includes('ldl') ||
           interp.category.toLowerCase().includes('hdl')) &&
          (!arr[idx + 1] || 
           (!arr[idx + 1].category.toLowerCase().includes('cholesterol') &&
            !arr[idx + 1].category.toLowerCase().includes('triglyceride') &&
            !arr[idx + 1].category.toLowerCase().includes('ldl') &&
            !arr[idx + 1].category.toLowerCase().includes('hdl')))
        );

        // Add CVD risk interpretation
        const cvdInterpretation = {
          category: '10-Year Total CVD Risk (PREVENT)',
          value: preventRisk.tenYearTotalCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Low <5%, Borderline 5-7.4%, Intermediate 7.5-19.9%, High ≥20%',
          interpretation: `10-year cardiovascular disease risk: ${preventRisk.tenYearCVDPercentage} (${preventRisk.riskCategory.toUpperCase()} RISK). Includes ASCVD and heart failure.`,
          recommendation: preventRisk.recommendations,
          recheckTiming: 'Annual',
        };

        // Add ASCVD-specific risk
        const ascvdInterpretation = {
          category: '10-Year ASCVD Risk (PREVENT)',
          value: preventRisk.tenYearASCVD * 100,
          unit: '%',
          status: getRiskStatus(preventRisk.riskCategory),
          referenceRange: 'Heart attack & stroke risk',
          interpretation: `10-year ASCVD risk (heart attack, stroke): ${preventRisk.tenYearASCVDPercentage}`,
          recommendation: preventRisk.statinRecommendation || '',
          recheckTiming: 'Annual',
        };

        // Add Heart Failure risk
        const femaleHfStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.tenYearHeartFailure >= 0.1 ? 'abnormal' : preventRisk.tenYearHeartFailure >= 0.05 ? 'borderline' : 'normal';
        const hfInterpretation = {
          category: '10-Year Heart Failure Risk (PREVENT)',
          value: preventRisk.tenYearHeartFailure * 100,
          unit: '%',
          status: femaleHfStatus,
          referenceRange: 'Heart failure risk',
          interpretation: `10-year heart failure risk: ${preventRisk.tenYearHFPercentage}`,
          recommendation: preventRisk.tenYearHeartFailure >= 0.075 ? 'Consider SGLT2 inhibitor or GLP-1 agonist for cardioprotection if diabetic or high-risk.' : 'Monitor for symptoms: shortness of breath, fatigue, leg swelling.',
          recheckTiming: 'Annual',
        };

        // Insert after lipid panel if found, otherwise append at end
        if (lipidEndIndex !== -1) {
          interpretations.splice(lipidEndIndex + 1, 0, cvdInterpretation, ascvdInterpretation, hfInterpretation);
        } else {
          interpretations.push(cvdInterpretation, ascvdInterpretation, hfInterpretation);
        }

        // Add 30-year risks if available (ages 30-59)
        if (preventRisk.thirtyYearTotalCVD !== undefined) {
          const femaleThirtyYearStatus: 'normal' | 'borderline' | 'abnormal' = preventRisk.thirtyYearTotalCVD >= 0.30 ? 'abnormal' : preventRisk.thirtyYearTotalCVD >= 0.15 ? 'borderline' : 'normal';
          const thirtyYearInterpretation = {
            category: '30-Year CVD Risk (PREVENT)',
            value: preventRisk.thirtyYearTotalCVD * 100,
            unit: '%',
            status: femaleThirtyYearStatus,
            referenceRange: 'Long-term cardiovascular risk',
            interpretation: `30-year risks: CVD ${preventRisk.thirtyYearCVDPercentage}, ASCVD ${preventRisk.thirtyYearASCVDPercentage}, Heart Failure ${preventRisk.thirtyYearHFPercentage}`,
            recommendation: 'Long-term lifestyle modifications and risk factor management are critical for reducing lifetime cardiovascular risk.',
            recheckTiming: 'Annual',
          };
          const hfIdx = interpretations.findIndex(i => i.category === '10-Year Heart Failure Risk (PREVENT)');
          if (hfIdx !== -1) {
            interpretations.splice(hfIdx + 1, 0, thirtyYearInterpretation);
          } else {
            interpretations.push(thirtyYearInterpretation);
          }
        }
      }

      // Step 3b: Calculate STOP-BANG sleep apnea risk (female-adjusted - no automatic male point)
      // For females, we don't add the automatic "male gender" point
      const stopBangRisk = StopBangCalculator.calculateRisk({
        ...labs,
        demographics: labs.demographics ? { ...labs.demographics, sex: 'female' as const } : undefined
      }) || undefined;
      console.log('[API] Female STOP-BANG calculation result:', stopBangRisk ? `Score: ${stopBangRisk.score}/8, Risk: ${stopBangRisk.riskCategory}` : 'Not calculated');

      // Step 3c: Add STOP-BANG to interpretations if calculated
      if (stopBangRisk) {
        console.log('[API] Adding STOP-BANG to female interpretations array');
        const getStopBangStatus = (category: string): 'normal' | 'borderline' | 'abnormal' | 'critical' => {
          switch (category.toLowerCase()) {
            case 'low': return 'normal';
            case 'intermediate': return 'abnormal';
            case 'high': return 'critical';
            default: return 'abnormal';
          }
        };

        const stopBangInterpretation = {
          category: 'Sleep Apnea Risk (STOP-BANG)',
          value: stopBangRisk.score,
          unit: 'points',
          status: getStopBangStatus(stopBangRisk.riskCategory),
          referenceRange: 'Low 0-2, Intermediate 3-4, High 5-8',
          interpretation: stopBangRisk.riskDescription,
          recommendation: stopBangRisk.recommendations,
          recheckTiming: stopBangRisk.riskCategory === 'low' ? 'Annual' : 'Follow-up in 1-3 months after sleep study',
        };

        // Find the last PREVENT risk category or 30-year risk to insert STOP-BANG after
        const preventIndex = interpretations.findIndex(interp => 
          interp.category === '30-Year CVD Risk (PREVENT)' || 
          interp.category === '10-Year Heart Failure Risk (PREVENT)'
        );
        if (preventIndex !== -1) {
          interpretations.splice(preventIndex + 1, 0, stopBangInterpretation);
        } else {
          interpretations.push(stopBangInterpretation);
        }
      }

      // Steps 4 & 5: Generate AI recommendations and patient summary in parallel
      const [aiRecommendations, patientSummary] = await Promise.all([
        AIService.generateRecommendations(labs, redFlags, interpretations, 'female', trendContext || undefined),
        AIService.generatePatientSummary(labs, interpretations, redFlags.length > 0, preventRisk, 'female'),
      ]);

      // Step 6: Determine recheck window using female-specific logic
      const recheckWindow = FemaleClinicalLogicEngine.determineRecheckWindow(labs, redFlags);

      // Step 7: Insulin Resistance Screening (moved before supplements for phenotype input)
      const insulinResistance = screenInsulinResistance(labs, 'female') || undefined;
      console.log('[API] Female IR Screening:', insulinResistance ? `${insulinResistance.positiveCount} positive markers, ${insulinResistance.likelihoodLabel}` : 'Not calculated (insufficient markers)');

      if (insulinResistance && insulinResistance.likelihood !== 'none') {
        const irStatus: 'normal' | 'borderline' | 'abnormal' | 'critical' = 
          insulinResistance.likelihood === 'high' ? 'critical' : 'abnormal';
        const irInterpretation = {
          category: 'Insulin Resistance Screening',
          value: insulinResistance.positiveCount,
          unit: 'of 6 markers positive',
          status: irStatus,
          referenceRange: '0-1 Low, 2 Moderate, 3+ High Likelihood',
          interpretation: insulinResistance.providerSummary,
          recommendation: insulinResistance.phenotypes.length > 0 
            ? `Phenotype(s): ${insulinResistance.phenotypes.map(p => p.name).join('; ')}. ${insulinResistance.confirmationTests}`
            : insulinResistance.confirmationTests || 'Consider fasting insulin + fasting glucose for confirmation.',
          recheckTiming: '3-6 months',
        };
        interpretations.push(irInterpretation);
      }

      // Step 8: Evaluate supplement recommendations based on lab values, phenotypes, and IR screening
      const supplementResult = evaluateSupplements(labs, insulinResistance);
      const supplements = supplementResult.recommendations;
      const clinicalPhenotypes = supplementResult.phenotypes;
      console.log('[API] Supplement recommendations:', supplements.length);
      console.log('[API] Clinical phenotypes detected:', clinicalPhenotypes.map(p => `${p.name} (${p.confidence})`).join(', ') || 'None');

      // Step 9: Compute cardiovascular risk stratification flags
      const cvRiskFlags = FemaleClinicalLogicEngine.computeCardiovascularRiskFlags(labs);
      console.log('[API] CV Risk Flags:', JSON.stringify(cvRiskFlags, null, 2));

      // Step 10: Generate CAC and statin recommendations
      const cacStatinRec = FemaleClinicalLogicEngine.generateCacStatinRecommendations(labs, cvRiskFlags);
      console.log('[API] CAC/Statin Recommendations generated');

      // Step 11: Calculate Adjusted Risk Assessment based on ApoB and Lp(a)
      let adjustedRisk = undefined;
      if (preventRisk && (labs.apoB !== undefined || labs.lpa !== undefined)) {
        adjustedRisk = PREVENTCalculator.calculateAdjustedRisk(
          preventRisk.tenYearASCVD,
          labs.apoB,
          labs.lpa
        ) || undefined;
        console.log('[API] Adjusted Risk Assessment:', adjustedRisk ? 
          `Base: ${adjustedRisk.baseASCVDRisk.toFixed(1)}%, Category: ${adjustedRisk.riskCategory} → ${adjustedRisk.adjustedCategory}` : 
          'Not calculated');
      }

      // Step 10: Generate SOAP note
      const soapNote = await AIService.generateSOAPNote(
        labs, redFlags, interpretations, aiRecommendations, recheckWindow,
        'female', preventRisk, supplements, insulinResistance, trendContext || undefined
      );

      const result: InterpretationResult = {
        redFlags,
        interpretations,
        aiRecommendations,
        patientSummary,
        recheckWindow,
        preventRisk,
        adjustedRisk,
        supplements,
        cvRiskFlags,
        cacStatinRec,
        insulinResistance,
        clinicalPhenotypes,
        soapNote,
      };

      console.log('[API] Female interpretation response summary:');
      console.log('  - Red flags:', redFlags.length);
      console.log('  - Interpretations:', interpretations.length);
      console.log('  - AI recommendations length:', aiRecommendations.length);
      console.log('  - Patient summary length:', patientSummary.length);
      console.log('  - Recheck window:', recheckWindow);
      console.log('  - Supplements:', supplements.length);
      console.log('  - CV Risk Flags computed');
      console.log('  - Insulin Resistance:', insulinResistance ? insulinResistance.likelihoodLabel : 'Not screened');
      console.log('  - SOAP note length:', soapNote.length);

      res.json(result);
    } catch (error) {
      console.error("Error interpreting female labs:", error);
      res.status(500).json({ 
        error: "Failed to interpret lab results", 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Generate patient wellness plan endpoint
  app.post("/api/generate-wellness-plan", async (req, res) => {
    console.log('[API] POST /api/generate-wellness-plan - Received request');
    
    try {
      const { labs, interpretations, supplements, preventRisk } = req.body;
      
      if (!labs || !interpretations) {
        return res.status(400).json({ error: 'Missing required fields: labs, interpretations' });
      }

      console.log('[API] Generating wellness plan with:', {
        labsProvided: !!labs,
        interpretationsCount: interpretations?.length,
        supplementsCount: supplements?.length,
        preventRiskProvided: !!preventRisk
      });

      const wellnessPlan = await AIService.generatePatientWellnessPlan(
        labs,
        interpretations,
        supplements || [],
        preventRisk || null
      );

      console.log('[API] Wellness plan generated successfully');
      
      res.json({ 
        success: true, 
        wellnessPlan 
      });
    } catch (error) {
      console.error('[API] Error generating wellness plan:', error);
      res.status(500).json({ 
        error: 'Failed to generate wellness plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Auto-generate dietary guidance from stored AI recommendations for the portal publish dialog
  app.post("/api/generate-dietary-guidance", requireAuth, async (req, res) => {
    try {
      const { labResultId } = req.body;
      if (!labResultId) return res.status(400).json({ message: "labResultId is required" });

      const labResult = await storage.getLabResult(labResultId);
      if (!labResult) return res.status(404).json({ message: "Lab result not found" });

      const aiRecommendations = (labResult.interpretationResult as any)?.aiRecommendations;
      if (!aiRecommendations) {
        return res.status(422).json({ message: "No AI recommendations available for this lab result" });
      }

      const client = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const prompt = `You are a clinical nutritionist. A clinician has generated AI recommendations for a patient. Extract and reformat ONLY the dietary/nutrition guidance into a clear, patient-friendly format for their wellness portal.

Format your response EXACTLY like this (use these exact section headers):

Goal: [One clear sentence about the patient's primary nutritional goal based on their specific lab findings]

Diet: [Recommended dietary pattern in 3-8 words, e.g. "Mediterranean-style diet with emphasis on iron-rich foods"]

Foods to Emphasize:
[Food name] - ([serving size and frequency, e.g. "3-4 oz, 2-3x/week"]) - [plain-language explanation of why this specific food helps their specific lab results]
[Food name] - ([serving size and frequency]) - [explanation]
[Food name] - ([serving size and frequency]) - [explanation]
[Food name] - ([serving size and frequency]) - [explanation]
[Food name] - ([serving size and frequency]) - [explanation]

Rules:
- List exactly 5-7 specific foods
- Tie each food to their SPECIFIC lab findings (e.g. "to help raise your low ferritin", "to support your elevated LDL")  
- Write in plain language a patient can understand — no jargon
- Keep each food entry on ONE line only
- Format exactly: Food Name - (serving info) - reason (include the dashes and parens)
- Do NOT include supplement recommendations — foods only
- Do NOT include "Foods to Avoid" or other sections — only the three sections above

CLINICAL RECOMMENDATIONS TO EXTRACT FROM:
${aiRecommendations}`;

      const completion = await client.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "You are a clinical nutritionist. Extract and format dietary guidance from clinical recommendations into a clear, patient-friendly structure. Always respond with the exact format requested." },
          { role: "user", content: prompt },
        ],
      });

      const dietaryGuidance = completion.choices[0]?.message?.content?.trim() || "";
      console.log('[Dietary] finish_reason:', completion.choices[0]?.finish_reason, 'content length:', dietaryGuidance.length);
      res.json({ dietaryGuidance });
    } catch (error) {
      console.error("[API] Error generating dietary guidance:", error);
      res.status(500).json({ message: "Failed to generate dietary guidance" });
    }
  });

  // Generate male patient wellness plan endpoint
  app.post("/api/generate-wellness-plan-male", async (req, res) => {
    console.log('[API] POST /api/generate-wellness-plan-male - Received request');
    
    try {
      const { labs, interpretations, supplements, preventRisk } = req.body;
      
      if (!labs || !interpretations) {
        return res.status(400).json({ error: 'Missing required fields: labs, interpretations' });
      }

      console.log('[API] Generating male wellness plan with:', {
        labsProvided: !!labs,
        interpretationsCount: interpretations?.length,
        supplementsCount: supplements?.length,
        preventRiskProvided: !!preventRisk
      });

      const wellnessPlan = await AIService.generateMalePatientWellnessPlan(
        labs,
        interpretations,
        supplements || [],
        preventRisk || null
      );

      console.log('[API] Male wellness plan generated successfully');
      
      res.json({ 
        success: true, 
        wellnessPlan 
      });
    } catch (error) {
      console.error('[API] Error generating male wellness plan:', error);
      res.status(500).json({ 
        error: 'Failed to generate male wellness plan',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Configure multer for PDF uploads (memory storage)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    },
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    }
  });

  // PDF upload and extraction endpoint
  app.post("/api/extract-pdf-labs", upload.single('pdf'), async (req, res) => {
    console.log('[API] POST /api/extract-pdf-labs - Received PDF upload');
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No PDF file provided' });
      }

      console.log('[API] PDF file received:', {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // Extract lab values from PDF using AI
      const extractedValues = await PDFExtractionService.extractLabValues(req.file.buffer);

      console.log('[API] Extraction complete, extracted fields:', Object.keys(extractedValues));

      res.json({ 
        success: true, 
        data: extractedValues,
        message: 'Lab values extracted successfully. Please review and edit before submitting.'
      });
    } catch (error) {
      console.error('[API] Error extracting PDF:', error);
      res.status(500).json({ 
        error: 'Failed to extract lab values from PDF',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== PATIENT PROFILE ENDPOINTS =====

  // GET /api/clinician/notifications — unread messages + pending supplement orders
  app.get("/api/clinician/notifications", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const [unreadMessages, pendingOrders] = await Promise.all([
        storage.getUnreadMessageSummaryForClinician(clinicianId),
        storage.getPendingOrdersForClinician(clinicianId),
      ]);
      res.json({ unreadMessages, pendingOrders });
    } catch (error) {
      console.error("Clinician notifications error:", error);
      res.json({ unreadMessages: [], pendingOrders: [] });
    }
  });

  app.post("/api/patients", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const parseResult = insertPatientSchema.safeParse({ ...req.body, userId: clinicianId });
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid patient data", details: parseResult.error.errors });
      }
      const patient = await storage.createPatient(parseResult.data);
      res.json(patient);
    } catch (error) {
      console.error("Error creating patient:", error);
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  app.get("/api/patients/search", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const q = (req.query.q as string) || '';
      const gender = req.query.gender as string | undefined;
      if (!q || q.length < 1) {
        const allPatients = await storage.getAllPatients(clinicianId);
        return res.json(allPatients);
      }
      const patients = await storage.searchPatients(q, clinicianId, gender);
      res.json(patients);
    } catch (error) {
      console.error("Error searching patients:", error);
      res.status(500).json({ error: "Failed to search patients" });
    }
  });

  app.get("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, clinicianId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const labHistory = await storage.getLabResultsByPatient(id);
      res.json({ patient, labHistory });
    } catch (error) {
      console.error("Error getting patient:", error);
      res.status(500).json({ error: "Failed to get patient" });
    }
  });

  // Delete a patient profile (and all their lab results, portal data, etc. via cascade)
  app.delete("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid patient ID" });
      const deleted = await storage.deletePatient(id, clinicianId);
      if (!deleted) return res.status(404).json({ error: "Patient not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  app.get("/api/patients/:id/labs", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, clinicianId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      const labs = await storage.getLabResultsByPatient(id);
      res.json(labs);
    } catch (error) {
      console.error("Error getting patient labs:", error);
      res.status(500).json({ error: "Failed to get patient labs" });
    }
  });

  app.post("/api/patients/:id/trend-narrative", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, clinicianId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });

      const { trendData, gender } = req.body;
      if (!trendData || !Array.isArray(trendData) || trendData.length === 0) {
        return res.status(400).json({ error: "trendData array required" });
      }

      const result = await AIService.generateTrendNarrative(
        trendData,
        gender || 'male',
        patient.firstName ? `${patient.firstName} ${patient.lastName}` : undefined
      );
      res.json(result);
    } catch (error) {
      console.error("Error generating trend narrative:", error);
      res.status(500).json({ error: "Failed to generate trend narrative" });
    }
  });

  app.post("/api/patients/:id/labs", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      const { labValues: bodyLabValues, interpretationResult: bodyInterpretation, notes, labDate: bodyLabDate } = req.body;
      const labResult = await storage.createLabResult({
        patientId,
        labDate: bodyLabDate ? new Date(bodyLabDate) : new Date(),
        labValues: bodyLabValues as LabValues | FemaleLabValues,
        interpretationResult: bodyInterpretation as InterpretationResult,
        notes,
      } as InsertLabResult);
      await storage.updatePatient(patientId, {}, clinicianId);
      res.json(labResult);
    } catch (error) {
      console.error("Error saving patient labs:", error);
      res.status(500).json({ error: "Failed to save patient labs" });
    }
  });

  app.delete("/api/lab-results/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid lab result ID" });
      }
      // Remove any portal protocols tied to this lab result before deleting
      await storage.deleteProtocolsByLabResultId(id);
      const deleted = await storage.deleteLabResult(id);
      if (!deleted) {
        return res.status(404).json({ error: "Lab result not found" });
      }
      console.log('[API] Deleted lab result and associated portal protocols:', id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting lab result:", error);
      res.status(500).json({ error: "Failed to delete lab result" });
    }
  });

  // ===== SAVED INTERPRETATIONS ENDPOINTS =====
  
  // Get all saved interpretations (with optional gender filter)
  app.get("/api/saved-interpretations", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const gender = req.query.gender as string | undefined;
      const interpretations = await storage.getAllSavedInterpretations(clinicianId, gender);
      res.json(interpretations);
    } catch (error) {
      console.error('[API] Error fetching saved interpretations:', error);
      res.status(500).json({ error: 'Failed to fetch saved interpretations' });
    }
  });

  // Search saved interpretations by patient name
  app.get("/api/saved-interpretations/search", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const searchTerm = req.query.q as string;
      const gender = req.query.gender as string | undefined;
      if (!searchTerm) {
        return res.status(400).json({ error: 'Search term (q) is required' });
      }
      const interpretations = await storage.searchSavedInterpretations(searchTerm, clinicianId, gender);
      res.json(interpretations);
    } catch (error) {
      console.error('[API] Error searching saved interpretations:', error);
      res.status(500).json({ error: 'Failed to search saved interpretations' });
    }
  });

  // Get a single saved interpretation by ID
  app.get("/api/saved-interpretations/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid interpretation ID' });
      const interpretation = await storage.getSavedInterpretation(id, clinicianId);
      if (!interpretation) return res.status(404).json({ error: 'Interpretation not found' });
      res.json(interpretation);
    } catch (error) {
      console.error('[API] Error fetching saved interpretation:', error);
      res.status(500).json({ error: 'Failed to fetch saved interpretation' });
    }
  });

  // Save a new interpretation
  app.post("/api/saved-interpretations", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const { patientName, gender, labValues, interpretation, labDate } = req.body;
      if (!patientName || !gender || !labValues || !interpretation) {
        return res.status(400).json({ 
          error: 'Missing required fields: patientName, gender, labValues, interpretation' 
        });
      }
      const saved = await storage.createSavedInterpretation({
        userId: clinicianId,
        patientName,
        gender,
        labValues,
        interpretation,
        labDate: labDate ? new Date(labDate) : new Date(),
      });

      // Also create/find patient profile and link lab result
      try {
        const nameParts = patientName.trim().split(/\s+/);
        const firstName = nameParts[0] || patientName.trim();
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
        if (firstName) {
          let patient = await storage.getPatientByName(firstName, lastName, clinicianId);
          if (!patient) {
            patient = await storage.createPatient({
              userId: clinicianId,
              firstName,
              lastName,
              gender: gender as 'male' | 'female',
            });
          }
          await storage.createLabResult({
            patientId: patient.id,
            labDate: labDate ? new Date(labDate) : new Date(),
            labValues,
            interpretationResult: interpretation,
          } as InsertLabResult);
        }
      } catch (linkError) {
        console.error('[API] Error auto-linking patient profile (non-fatal):', linkError);
      }
      res.status(201).json(saved);
    } catch (error) {
      console.error('[API] Error saving interpretation:', error);
      res.status(500).json({ error: 'Failed to save interpretation' });
    }
  });

  // Delete a saved interpretation
  app.delete("/api/saved-interpretations/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid interpretation ID' });
      const deleted = await storage.deleteSavedInterpretation(id, clinicianId);
      if (!deleted) return res.status(404).json({ error: 'Interpretation not found' });
      res.json({ success: true, message: 'Interpretation deleted' });
    } catch (error) {
      console.error('[API] Error deleting interpretation:', error);
      res.status(500).json({ error: 'Failed to delete interpretation' });
    }
  });

  // ── Admin routes ────────────────────────────────────────────────────────────

  // Middleware: must be logged in AND have role === 'admin'
  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Authentication required" });
    if ((req.user as any).role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
  }

  // Bootstrap: promote logged-in user to admin (one-time, requires env token)
  app.post("/api/admin/bootstrap", requireClinicianOnly, async (req, res) => {
    const token = req.body?.token;
    const envToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
    if (!envToken) return res.status(503).json({ message: "Bootstrap not configured" });
    if (token !== envToken) return res.status(403).json({ message: "Invalid bootstrap token" });
    const userId = (req.user as any).id;
    const updated = await storage.promoteToAdmin(userId);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Account promoted to admin", user: { id: updated.id, username: updated.username, role: updated.role } });
  });

  // One-time first-admin setup — no login required, only works when zero admins exist
  app.post("/api/admin/auto-bootstrap", async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ message: "Username required" });

    // Only allowed when no admins exist yet
    const allUsers = await storage.getAllUsers();
    const hasAdmin = allUsers.some((u) => u.role === "admin");
    if (hasAdmin) return res.status(403).json({ message: "An admin already exists. This endpoint is disabled." });

    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(404).json({ message: "No account found with that username" });

    const updated = await storage.promoteToAdmin(user.id);
    res.json({ message: "Account promoted to admin", user: { id: updated!.id, username: updated!.username, role: updated!.role } });
  });

  // Get all users + patient counts (admin only)
  app.get("/api/admin/clinicians", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const withCounts = await Promise.all(
        users.map(async (u) => ({
          id: u.id,
          email: u.email,
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          title: u.title,
          clinicName: u.clinicName,
          phone: u.phone,
          npi: u.npi,
          role: u.role,
          subscriptionStatus: u.subscriptionStatus,
          notes: u.notes,
          createdAt: u.createdAt,
          patientCount: await storage.getPatientCountByUser(u.id),
        }))
      );
      res.json(withCounts);
    } catch (error) {
      console.error("[ADMIN] Error fetching clinicians:", error);
      res.status(500).json({ message: "Failed to fetch clinicians" });
    }
  });

  // Create a new clinician account via invite (admin only — no password required)
  app.post("/api/admin/clinicians", requireAdmin, async (req, res) => {
    try {
      const { email, username, firstName, lastName, title, npi, clinicName, phone, address, subscriptionStatus, notes } = req.body;
      if (!email || !username || !firstName || !lastName || !title || !clinicName) {
        return res.status(400).json({ message: "All required fields must be provided" });
      }
      const existingByUsername = await storage.getUserByUsername(username);
      if (existingByUsername) return res.status(409).json({ message: "Username already taken" });
      const existingByEmail = await storage.getUserByEmail(email.trim().toLowerCase());
      if (existingByEmail) return res.status(409).json({ message: "Email already registered" });

      // Create account with a random placeholder password — invite token required to activate
      const placeholderHash = await hashPassword(crypto.randomBytes(32).toString("hex"));
      const user = await storage.createUser({
        email: email.trim().toLowerCase(),
        username,
        passwordHash: placeholderHash,
        firstName, lastName, title,
        npi: npi || null, clinicName, phone: phone || null, address: address || null,
        role: "clinician",
        subscriptionStatus: subscriptionStatus || "active",
        notes: notes || null,
      } as any);

      // Generate invite token (72-hour expiry)
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await storage.savePasswordResetToken(user.id, token, expires);

      // Send invite email (best-effort — don't fail if email errors)
      try {
        await sendInviteEmail(user.email, user.firstName, token, req);
        console.log(`[ADMIN] Invite email sent to ${user.email}`);
      } catch (emailErr) {
        console.error("[ADMIN] Failed to send invite email:", emailErr);
      }

      res.status(201).json({
        message: "Clinician account created and invite email sent",
        user: { id: user.id, username: user.username, email: user.email },
        inviteToken: process.env.NODE_ENV === "development" ? token : undefined,
      });
    } catch (error) {
      console.error("[ADMIN] Error creating clinician:", error);
      res.status(500).json({ message: "Failed to create clinician" });
    }
  });

  // Update a clinician's subscription status, role, or notes (admin only)
  app.patch("/api/admin/clinicians/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
      const { subscriptionStatus, role, notes } = req.body;
      const updated = await storage.updateUserAdmin(id, { subscriptionStatus, role, notes });
      if (!updated) return res.status(404).json({ message: "User not found" });
      res.json({ message: "Updated successfully", user: updated });
    } catch (error) {
      console.error("[ADMIN] Error updating clinician:", error);
      res.status(500).json({ message: "Failed to update clinician" });
    }
  });

  // Delete a clinician account (admin only) — also deletes all their patients/data via cascade
  app.delete("/api/admin/clinicians/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid user ID" });
      const adminId = (req.user as any).id;
      if (id === adminId) return res.status(400).json({ message: "Cannot delete your own account" });
      const deleted = await storage.deleteUserAdmin(id);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      res.json({ message: "Account and all associated data deleted" });
    } catch (error) {
      console.error("[ADMIN] Error deleting clinician:", error);
      res.status(500).json({ message: "Failed to delete clinician" });
    }
  });

  // ── Portal auth middleware ──────────────────────────────────────────────────
  function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
    if ((req.session as any).portalPatientId) return next();
    res.status(401).json({ message: "Portal authentication required" });
  }

  // ── Portal: Clinician invites patient ─────────────────────────────────────
  app.post("/api/portal/invite/:patientId", requireAuth, async (req, res) => {
    try {
      const patientId = parseInt(req.params.patientId);
      const clinicianId = getClinicianId(req);
      const clinicianUser = await storage.getUserById(clinicianId);
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Patient email is required" });

      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      // Update patient email on record
      await storage.updatePatient(patientId, { email }, clinicianId);

      // Check if portal account already exists
      let portalAccount = await storage.getPortalAccountByPatientId(patientId);
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 72 * 60 * 60 * 1000);

      if (portalAccount) {
        await storage.updatePortalAccount(patientId, { email, inviteToken: token, inviteExpires: expires });
      } else {
        await storage.createPortalAccount({ patientId, email, inviteToken: token, inviteExpires: expires, isActive: true });
      }

      // Build base URL: APP_URL env var takes highest priority (custom domain),
      // then REPLIT_DOMAINS, then fall back to request headers.
      const base = (() => {
        if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
        const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
        if (replitDomain && !replitDomain.startsWith("localhost")) return `https://${replitDomain}`;
        if (req.get) return `${req.get("x-forwarded-proto") || req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`;
        return "";
      })();
      const inviteUrl = `${base}/portal/set-password?token=${token}`;

      let emailSent = false;
      try {
        await sendPatientPortalInviteEmail(email, patient.firstName, clinicianUser?.clinicName || "Your Care Team", token, req);
        emailSent = true;
      } catch (emailErr) {
        console.error("[PORTAL] Failed to send invite email:", emailErr);
        console.log(`[PORTAL EMAIL FALLBACK] Invite link for ${email}: ${inviteUrl}`);
      }

      res.json({ message: "Invitation sent", inviteUrl, emailSent });
    } catch (error) {
      console.error("[PORTAL] Error sending invite:", error);
      res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  // ── Portal: Patient sets password from invite ──────────────────────────────
  app.post("/api/portal/set-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password are required" });
      if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

      const account = await storage.getPortalAccountByInviteToken(token);
      if (!account) return res.status(400).json({ message: "Invalid or expired invite link" });
      if (account.inviteExpires && account.inviteExpires < new Date()) {
        return res.status(400).json({ message: "This invite link has expired. Please ask your clinic to resend the invitation." });
      }

      const passwordHash = await hashPassword(password);
      await storage.updatePortalAccount(account.patientId, { passwordHash, inviteToken: null, inviteExpires: null });

      res.json({ message: "Password set successfully. You can now log in." });
    } catch (error) {
      console.error("[PORTAL] Error setting password:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // ── Portal: Patient login ──────────────────────────────────────────────────
  app.post("/api/portal/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

      const account = await storage.getPortalAccountByEmail(email);
      if (!account || !account.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (!account.isActive) {
        return res.status(403).json({ message: "Your portal access has been disabled. Please contact your clinic." });
      }

      const valid = await bcrypt.compare(password, account.passwordHash);
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });

      (req.session as any).portalPatientId = account.patientId;
      await new Promise<void>((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));

      // Stamp last login time
      storage.updatePortalAccount(account.patientId, { lastLoginAt: new Date() }).catch(() => {});

      res.json({ message: "Logged in", patientId: account.patientId });
    } catch (error) {
      console.error("[PORTAL] Error logging in:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ── Portal: Patient logout ─────────────────────────────────────────────────
  app.post("/api/portal/logout", (req, res) => {
    delete (req.session as any).portalPatientId;
    req.session.save(() => res.json({ message: "Logged out" }));
  });

  // ── Portal: Forgot password ────────────────────────────────────────────────
  app.post("/api/portal/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const account = await storage.getPortalAccountByEmail(email);
      // Always return success so we don't reveal whether an email is registered
      if (!account || !account.isActive) {
        return res.json({ message: "If that email is registered, you'll receive a reset link shortly." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.updatePortalAccount(account.patientId, {
        passwordResetToken: token,
        passwordResetExpires: expires,
      } as any);

      // Look up patient and their clinician for branded email
      const patient = await storage.getPatientById(account.patientId);
      const firstName = patient?.firstName || "there";
      let clinicName: string | undefined;
      let clinicianName: string | undefined;
      if (patient?.userId) {
        const clinician = await storage.getUserById(patient.userId);
        if (clinician) {
          clinicName = clinician.clinicName;
          clinicianName = `${clinician.title ? clinician.title + ' ' : ''}${clinician.firstName} ${clinician.lastName}`.trim();
        }
      }

      try {
        await sendPortalPasswordResetEmail(email, firstName, token, req, clinicName, clinicianName);
        console.log(`[PORTAL] Password reset email sent to ${email}`);
      } catch (emailErr) {
        console.error("[PORTAL] Failed to send reset email:", emailErr);
        // Log the link as fallback so it's visible in server console
        const base = (req as any).get ? `${(req as any).get("x-forwarded-proto") || req.protocol}://${(req as any).get("host")}` : "";
        console.log(`[PORTAL EMAIL FALLBACK] Reset link: ${base}/portal/reset-password?token=${token}`);
      }

      res.json({ message: "If that email is registered, you'll receive a reset link shortly." });
    } catch (error) {
      console.error("[PORTAL] Error in forgot-password:", error);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // ── Portal: Reset password ─────────────────────────────────────────────────
  app.post("/api/portal/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password are required" });
      if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

      const account = await storage.getPortalAccountByResetToken(token);
      if (!account) return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
      if (account.passwordResetExpires && account.passwordResetExpires < new Date()) {
        return res.status(400).json({ message: "This reset link has expired. Please request a new one." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await storage.updatePortalAccount(account.patientId, {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
      } as any);

      res.json({ message: "Password reset successfully. You can now sign in." });
    } catch (error) {
      console.error("[PORTAL] Error in reset-password:", error);
      res.status(500).json({ message: "Failed to reset password. Please try again." });
    }
  });

  // ── Portal: Get current patient info ──────────────────────────────────────
  app.get("/api/portal/me", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const [patient, account] = await Promise.all([
        storage.getPatientById(patientId),
        storage.getPortalAccountByPatientId(patientId),
      ]);
      if (!patient) return res.status(404).json({ message: "Patient record not found" });
      // Get clinician info for display
      const clinician = patient.userId ? await storage.getUserById(patient.userId) : null;
      res.json({
        patientId,
        email: account?.email,
        firstName: patient.firstName,
        lastName: patient.lastName,
        gender: patient.gender,
        dateOfBirth: patient.dateOfBirth,
        clinicName: clinician?.clinicName,
        clinicianName: clinician ? `${clinician.title} ${clinician.firstName} ${clinician.lastName}` : null,
      });
    } catch (error) {
      console.error("[PORTAL] Error fetching me:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // ── Portal: Get lab history ────────────────────────────────────────────────
  app.get("/api/portal/labs", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const labs = await storage.getLabResultsByPatient(patientId);
      // Load all protocols for this patient so we can attach clinicianNotes per lab
      const protocols = await storage.getAllPublishedProtocols(patientId);
      const notesByLabId = new Map<number, string | null>();
      for (const p of protocols) {
        if (p.labResultId && p.clinicianNotes) notesByLabId.set(p.labResultId, p.clinicianNotes);
      }
      // Return labs with patient-safe fields (no raw clinical scoring text)
      const safeLabs = labs.map((lab) => ({
        id: lab.id,
        labDate: lab.labDate,
        createdAt: lab.createdAt,
        labValues: lab.labValues || null,
        interpretations: (lab.interpretationResult as any)?.interpretations || [],
        supplements: (lab.interpretationResult as any)?.supplements || [],
        patientSummary: (lab.interpretationResult as any)?.patientSummary || null,
        preventRisk: (lab.interpretationResult as any)?.preventRisk || null,
        insulinResistance: (lab.interpretationResult as any)?.insulinResistance || null,
        clinicianNotes: notesByLabId.get(lab.id) ?? null,
      }));
      res.json(safeLabs);
    } catch (error) {
      console.error("[PORTAL] Error fetching labs:", error);
      res.status(500).json({ message: "Failed to fetch lab history" });
    }
  });

  // ── Portal: Get latest published protocol ─────────────────────────────────
  app.get("/api/portal/protocol", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const protocol = await storage.getLatestPublishedProtocol(patientId);
      if (!protocol) return res.json(null);
      // Stamp first viewed timestamp (no-op if already set)
      if (!protocol.firstViewedAt) {
        storage.markProtocolViewed(protocol.id).catch(() => {});
      }
      // Get clinician info
      const clinician = await storage.getUserById(protocol.clinicianId);
      res.json({ ...protocol, clinicName: clinician?.clinicName, clinicianName: clinician ? `${clinician.title} ${clinician.firstName} ${clinician.lastName}` : undefined });
    } catch (error) {
      console.error("[PORTAL] Error fetching protocol:", error);
      res.status(500).json({ message: "Failed to fetch protocol" });
    }
  });

  // ── Portal: Get all published protocol history ────────────────────────────
  app.get("/api/portal/protocols", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const protocols = await storage.getAllPublishedProtocols(patientId);
      res.json(protocols);
    } catch (error) {
      console.error("[PORTAL] Error fetching protocols:", error);
      res.status(500).json({ message: "Failed to fetch protocol history" });
    }
  });

  // ── Clinician: Publish protocol to patient portal ─────────────────────────
  app.post("/api/protocols/publish", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const { patientId, labResultId, supplements, clinicianNotes, dietaryGuidance, labDate } = req.body;
      if (!patientId || !supplements) return res.status(400).json({ message: "patientId and supplements are required" });

      // Verify clinician owns this patient
      const patient = await storage.getPatient(parseInt(patientId), clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      // Verify patient has a portal account
      const portalAccount = await storage.getPortalAccountByPatientId(parseInt(patientId));
      if (!portalAccount) return res.status(400).json({ message: "Patient does not have a portal account. Please invite them first." });

      const protocol = await storage.publishProtocol({
        patientId: parseInt(patientId),
        labResultId: labResultId ? parseInt(labResultId) : null,
        clinicianId,
        supplements,
        clinicianNotes: clinicianNotes || null,
        dietaryGuidance: dietaryGuidance || null,
        labDate: labDate ? new Date(labDate) : null,
      });

      // Fire-and-forget: notify patient via email
      const clinician = await storage.getUserById(clinicianId);
      if (portalAccount.email && clinician) {
        sendProtocolPublishedEmail(
          portalAccount.email,
          patient.firstName,
          clinician.clinicName,
          `${clinician.title} ${clinician.firstName} ${clinician.lastName}`,
          supplements.length,
          req,
        ).catch((err) => console.error('[PORTAL] Error sending protocol email:', err));
      }

      res.json({ message: "Protocol published to patient portal", protocol });
    } catch (error) {
      console.error("[PORTAL] Error publishing protocol:", error);
      res.status(500).json({ message: "Failed to publish protocol" });
    }
  });

  // ── Portal: Check portal account status for a patient ─────────────────────
  app.get("/api/portal/status/:patientId", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = parseInt(req.params.patientId);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const portalAccount = await storage.getPortalAccountByPatientId(patientId);
      const allProtocols = await storage.getAllPublishedProtocols(patientId);
      const latestProtocol = allProtocols[0] || null;
      // Collect the set of lab result IDs that have already been published
      const publishedLabResultIds = allProtocols
        .map((p) => p.labResultId)
        .filter((id): id is number => id !== null && id !== undefined);

      // Derive engagement status
      let portalStatus: 'not_invited' | 'invite_pending' | 'active' = 'not_invited';
      if (portalAccount) {
        portalStatus = portalAccount.passwordHash ? 'active' : 'invite_pending';
      }

      res.json({
        hasPortalAccount: !!portalAccount,
        hasPassword: !!(portalAccount?.passwordHash),
        email: portalAccount?.email || patient.email || null,
        lastProtocolPublished: latestProtocol?.publishedAt || null,
        publishedLabResultIds,
        // Engagement fields
        portalStatus,
        lastLoginAt: portalAccount?.lastLoginAt || null,
        latestReportViewedAt: latestProtocol?.firstViewedAt || null,
        latestReportPublishedAt: latestProtocol?.publishedAt || null,
        inviteSentAt: portalAccount?.createdAt || null,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch portal status" });
    }
  });

  // ── Portal Messaging ──────────────────────────────────────────────────────────

  // GET /api/portal/messaging-config — patient fetches their clinician's messaging preference
  app.get("/api/portal/messaging-config", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const patient = await storage.getPatientById(patientId);
      if (!patient || !patient.userId) return res.status(404).json({ message: "Patient not found" });
      const clinician = await storage.getUserById(patient.userId);
      if (!clinician) return res.status(404).json({ message: "Clinician not found" });
      res.json({
        messagingPreference: clinician.messagingPreference || 'none',
        messagingPhone: clinician.messagingPhone || null,
        externalMessagingProvider: clinician.externalMessagingProvider || null,
        clinicianId: clinician.id,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messaging config" });
    }
  });

  // GET /api/portal/messages — patient fetches their message thread
  app.get("/api/portal/messages", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const messages = await storage.getPortalMessages(patientId);
      // Mark clinician messages as read
      await storage.markPortalMessagesRead(patientId, 'patient');
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // POST /api/portal/messages — patient sends a message
  app.post("/api/portal/messages", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "Message content is required" });
      const patient = await storage.getPatientById(patientId);
      if (!patient || !patient.userId) return res.status(404).json({ message: "Patient not found" });

      // Store the message in the DB first
      const msg = await storage.createPortalMessage({
        patientId,
        clinicianId: patient.userId,
        senderType: 'patient',
        content: content.trim(),
        readAt: null,
        externalMessageId: null,
      });

      // Forward to external API if configured (fire-and-forget — don't block patient response)
      const clinician = await storage.getUserById(patient.userId);
      if (
        clinician?.messagingPreference === 'external_api' &&
        clinician.externalMessagingApiKey &&
        clinician.externalMessagingProvider
      ) {
        forwardMessageToExternalProvider(
          clinician.externalMessagingProvider as ExternalProvider,
          clinician.externalMessagingApiKey,
          {
            patientName: `${patient.firstName} ${patient.lastName}`,
            content: content.trim(),
            channelId: clinician.externalMessagingChannelId || '',
          },
        ).then((result) => {
          if (!result.success) {
            console.warn('[ExternalMessaging] Outbound forward failed:', result.error);
          }
        }).catch((err) => {
          console.error('[ExternalMessaging] Unexpected error forwarding message:', err);
        });
      }

      res.json(msg);
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // GET /api/patients/:id/messages — clinician fetches message thread
  app.get("/api/patients/:id/messages", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const messages = await storage.getPortalMessages(patientId);
      // Mark patient messages as read
      await storage.markPortalMessagesRead(patientId, 'clinician');
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // POST /api/patients/:id/messages — clinician replies to patient
  app.post("/api/patients/:id/messages", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ message: "Message content is required" });
      const msg = await storage.createPortalMessage({
        patientId,
        clinicianId,
        senderType: 'clinician',
        content: content.trim(),
        readAt: null,
      });

      // Fire-and-forget: notify patient via email (only if they have a portal account with an email)
      const portalAccount = await storage.getPortalAccountByPatientId(patientId);
      const clinician = await storage.getUserById(clinicianId);
      if (portalAccount?.email && clinician) {
        sendNewPortalMessageEmail(
          portalAccount.email,
          patient.firstName,
          clinician.clinicName,
          `${clinician.title} ${clinician.firstName} ${clinician.lastName}`,
          content.trim(),
          req,
        ).catch((err) => console.error('[PORTAL] Error sending message email:', err));
      }

      res.json(msg);
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // POST /api/portal/recipes — AI-generated recipes for a recommended food item
  app.post("/api/portal/recipes", requirePortalAuth, async (req, res) => {
    try {
      const { food, reason } = req.body;
      if (!food || typeof food !== "string") {
        return res.status(400).json({ message: "food is required" });
      }

      const client = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const prompt = `You are a clinical nutritionist and creative home cook.
A patient has been recommended to eat "${food}" by their healthcare provider.
Clinical reason: ${reason || "to support their overall health"}

Generate exactly 3 practical, delicious, and nutritious recipes using "${food}" as a primary ingredient. Vary the cooking methods and flavor profiles.

Return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "recipes": [
    {
      "name": "Recipe Name",
      "prepTime": "10 min",
      "cookTime": "20 min",
      "servings": "2 servings",
      "ingredients": ["1 lb lean ground beef", "2 cloves garlic, minced"],
      "instructions": ["Preheat a skillet over medium-high heat.", "Add the beef and cook until browned."],
      "clinicalNote": "One sentence explaining why this recipe supports the patient's health goal based on the clinical reason."
    }
  ]
}

Keep recipes simple enough for a home cook. Ingredients list should be 6-10 items. Instructions should be 4-6 clear steps.`;

      const completion = await client.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: "You are a clinical nutritionist and creative home cook. You always respond with valid JSON only — no markdown, no extra text, no code fences." },
          { role: "user", content: prompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content?.trim() || "{}";
      console.log('[PORTAL] Recipe raw response length:', raw.length, 'finish_reason:', completion.choices[0]?.finish_reason);
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        try {
          parsed = match ? JSON.parse(match[0]) : { recipes: [] };
        } catch {
          parsed = { recipes: [] };
        }
      }

      res.json({ recipes: parsed.recipes || [] });
    } catch (error) {
      console.error("[PORTAL] Error generating recipes:", error);
      res.status(500).json({ message: "Failed to generate recipes. Please try again." });
    }
  });

  // GET /api/portal/saved-recipes
  app.get("/api/portal/saved-recipes", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const recipes = await storage.getSavedRecipes(patientId);
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch saved recipes" });
    }
  });

  // POST /api/portal/saved-recipes
  app.post("/api/portal/saved-recipes", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const { foodName, recipeName, recipeData } = req.body;
      if (!foodName || !recipeName || !recipeData) {
        return res.status(400).json({ message: "foodName, recipeName, and recipeData are required" });
      }
      const recipe = await storage.saveRecipe({ patientId, foodName, recipeName, recipeData });
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ message: "Failed to save recipe" });
    }
  });

  // DELETE /api/portal/saved-recipes/:id
  app.delete("/api/portal/saved-recipes/:id", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteSavedRecipe(id, patientId);
      res.json({ success: deleted });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete saved recipe" });
    }
  });

  // GET /api/portal/supplement-orders — patient fetches their order history
  app.get("/api/portal/supplement-orders", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const orders = await storage.getSupplementOrdersByPatient(patientId);
      res.json(orders);
    } catch {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // POST /api/portal/supplement-orders — patient places a supplement order (sends clinician message)
  app.post("/api/portal/supplement-orders", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const { items, subtotal, patientNotes } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No items in order" });
      }

      // Get patient + portal account for clinician ID
      const portalAccount = await storage.getPortalAccountByPatientId(patientId);
      if (!portalAccount) return res.status(403).json({ message: "No portal account" });
      const patient = await storage.getPatient(patientId, portalAccount.clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      // Create order record
      const order = await storage.createSupplementOrder({
        patientId,
        clinicianId: portalAccount.clinicianId,
        items,
        subtotal,
        status: 'pending',
        patientNotes: patientNotes || null,
      });

      // Build itemized message body
      const itemLines = items.map((it: any) =>
        `• ${it.name} (${it.dose}) × ${it.quantity} — $${it.lineTotal.toFixed(2)}`
      ).join('\n');
      const messageBody = [
        `Hi, I'd like to request a supplement order. Please charge my card on file.\n`,
        itemLines,
        `\nOrder Total: $${parseFloat(subtotal).toFixed(2)}`,
        patientNotes ? `\nNote: ${patientNotes}` : '',
        `\n\n(Order #${order.id} placed via ReAlign patient portal)`,
      ].join('');

      // Send as patient portal message to clinician
      await storage.createPortalMessage({
        patientId,
        senderType: 'patient',
        body: messageBody,
        readAt: null,
        externalMessageId: null,
      });

      res.json({ success: true, orderId: order.id });
    } catch (error) {
      console.error("Supplement order error:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // PATCH /api/supplement-orders/:id/status — clinician marks order fulfilled/cancelled
  app.patch("/api/supplement-orders/:id/status", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const orderId = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || !['pending', 'fulfilled', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.updateSupplementOrderStatus(orderId, clinicianId, status);
      if (!updated) return res.status(404).json({ message: "Order not found" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // GET /api/patients/:id/supplement-orders — clinician views a patient's orders
  app.get("/api/patients/:id/supplement-orders", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const orders = await storage.getSupplementOrdersByClinicianPatient(clinicianId, patientId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // GET /api/portal/messages/unread — patient checks their own unread count
  app.get("/api/portal/messages/unread", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const count = await storage.getUnreadPortalMessageCount(patientId, 'patient');
      res.json({ count });
    } catch {
      res.json({ count: 0 });
    }
  });

  // GET /api/patients/:id/messages/unread — clinician gets unread count
  app.get("/api/patients/:id/messages/unread", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ count: 0 });
      const cnt = await storage.getUnreadPortalMessageCount(patientId, 'clinician');
      res.json({ count: cnt });
    } catch (error) {
      res.status(500).json({ count: 0 });
    }
  });

  // ── External Messaging Webhook ────────────────────────────────────────────────
  // POST /api/webhooks/messaging/:clinicianId
  //   Called by Spruce, Klara, or any configured external system when a provider
  //   replies to a patient message. No session auth — verified via webhook secret.
  //
  // The clinician must configure their external system to POST to:
  //   https://<your-domain>/api/webhooks/messaging/<clinicianId>
  // with the webhook secret in the X-Webhook-Secret header (or as the signature).
  //
  // The body must include enough information to identify the patient. We look for:
  //   patient_id  (ReAlign internal patient ID, most reliable)
  //   patient_email  (portal account email, fallback)
  //   content / body / message / text  (the reply text)
  app.post("/api/webhooks/messaging/:clinicianId", async (req, res) => {
    try {
      const clinicianId = parseInt(req.params.clinicianId);
      if (isNaN(clinicianId)) return res.status(400).json({ ok: false, error: "Invalid clinician ID" });

      const clinician = await storage.getUserById(clinicianId);
      if (!clinician || clinician.messagingPreference !== 'external_api') {
        return res.status(404).json({ ok: false, error: "Webhook not configured" });
      }

      if (!clinician.externalMessagingWebhookSecret) {
        return res.status(503).json({ ok: false, error: "Webhook secret not set" });
      }

      // Verify the shared secret — external systems should send it in one of these headers
      const signatureHeader =
        req.headers['x-webhook-secret'] as string ||
        req.headers['x-spruce-signature'] as string ||
        req.headers['x-signature'] as string ||
        req.headers['authorization']?.replace('Bearer ', '') as string;

      const parsed = parseInboundWebhook({
        provider: (clinician.externalMessagingProvider || 'custom') as ExternalProvider,
        rawBody: req.body,
        expectedSecret: clinician.externalMessagingWebhookSecret,
        signatureHeader,
      });

      if (!parsed) {
        return res.status(401).json({ ok: false, error: "Invalid signature or unrecognised payload" });
      }

      if (!parsed.isFromProvider) {
        // Ignore messages not sent by the provider (e.g. patient-initiated copies)
        return res.json({ ok: true, skipped: true, reason: "Not a provider message" });
      }

      // Identify which patient this reply belongs to
      const body = req.body as Record<string, unknown>;
      const rawPatientId = body.patient_id ?? body.patientId ?? body.realign_patient_id;
      const patientEmail = body.patient_email ?? body.patientEmail;

      let patient = null;
      if (rawPatientId) {
        patient = await storage.getPatientById(Number(rawPatientId));
        // Verify the patient belongs to this clinician
        if (patient && patient.userId !== clinicianId) patient = null;
      }
      if (!patient && patientEmail) {
        const portalAccount = await storage.getPortalAccountByEmail(String(patientEmail));
        if (portalAccount) {
          patient = await storage.getPatientById(portalAccount.patientId);
          if (patient && patient.userId !== clinicianId) patient = null;
        }
      }

      if (!patient) {
        return res.status(404).json({ ok: false, error: "Could not identify patient from webhook payload. Include patient_id or patient_email." });
      }

      // Deduplicate — if we already have this external message ID, skip it
      if (parsed.externalMessageId) {
        const existing = await storage.getPortalMessageByExternalId(parsed.externalMessageId);
        if (existing) return res.json({ ok: true, skipped: true, reason: "Already processed" });
      }

      // Store the clinician reply as a portal message
      await storage.createPortalMessage({
        patientId: patient.id,
        clinicianId,
        senderType: 'clinician',
        content: parsed.content,
        readAt: null,
        externalMessageId: parsed.externalMessageId || null,
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error('[Webhook] Error processing inbound message:', error);
      res.status(500).json({ ok: false, error: "Internal server error" });
    }
  });

  // GET /api/auth/messaging-settings — clinician fetches their full external messaging config
  // (separate from /api/auth/me to avoid sending sensitive data on every page load)
  app.get("/api/auth/messaging-settings", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const user = await storage.getUserById(clinicianId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        messagingPreference: user.messagingPreference,
        messagingPhone: user.messagingPhone,
        externalMessagingProvider: user.externalMessagingProvider,
        externalMessagingApiKeySet: !!(user.externalMessagingApiKey),
        externalMessagingChannelId: user.externalMessagingChannelId,
        externalMessagingWebhookSecret: user.externalMessagingWebhookSecret,
        webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/messaging/${clinicianId}`,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messaging settings" });
    }
  });

  // ── Staff Management Routes ────────────────────────────────────────────────

  // GET /api/staff — list all staff members for this clinician
  app.get("/api/staff", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = (req.user as any).id;
      const staff = await storage.getAllStaffForClinician(clinicianId);
      const safeStaff = staff.map(({ passwordHash: _ph, inviteToken: _it, ...s }) => s);
      res.json(safeStaff);
    } catch (error) {
      console.error('[API] Error fetching staff:', error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  // POST /api/staff — invite a new staff member
  app.post("/api/staff", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = (req.user as any).id;
      const { email, firstName, lastName, role } = req.body;
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ message: "email, firstName, and lastName are required" });
      }

      // Check if email already in use
      const existing = await storage.getClinicianStaffByEmail(email.trim().toLowerCase());
      if (existing) {
        return res.status(409).json({ message: "A staff member with this email already exists" });
      }

      const inviteToken = crypto.randomBytes(32).toString('hex');
      const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

      const staffMember = await storage.createClinicianStaff({
        clinicianId,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: role || 'staff',
        inviteToken,
        inviteExpires,
        isActive: true,
      });

      // Send invite email (fire-and-forget)
      const clinician = await storage.getUserById(clinicianId);
      sendStaffInviteEmail({
        to: staffMember.email,
        firstName: staffMember.firstName,
        clinicianName: clinician ? `${clinician.firstName} ${clinician.lastName}` : 'Your clinician',
        clinicName: clinician?.clinicName || 'the clinic',
        inviteToken,
      }).catch(err => console.error('[EMAIL] Staff invite email failed:', err));

      const { passwordHash: _ph, inviteToken: _it, ...safeStaff } = staffMember;
      res.status(201).json(safeStaff);
    } catch (error) {
      console.error('[API] Error inviting staff:', error);
      res.status(500).json({ message: "Failed to invite staff member" });
    }
  });

  // DELETE /api/staff/:id — remove a staff member
  app.delete("/api/staff/:id", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = (req.user as any).id;
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });

      // Verify the staff member belongs to this clinician
      const staffMember = await storage.getClinicianStaffById(staffId);
      if (!staffMember || staffMember.clinicianId !== clinicianId) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const deleted = await storage.deleteClinicianStaff(staffId);
      if (!deleted) return res.status(404).json({ message: "Staff member not found" });
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error deleting staff:', error);
      res.status(500).json({ message: "Failed to remove staff member" });
    }
  });

  // POST /api/auth/staff-set-password — staff member accepts invite and sets password
  app.post("/api/auth/staff-set-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ message: "Token and password are required" });
      }
      const pwCheck = validatePasswordStrength(password);
      if (!pwCheck.valid) {
        return res.status(400).json({ message: "Password does not meet requirements: " + pwCheck.errors.join("; ") });
      }

      const staffMember = await storage.getClinicianStaffByInviteToken(token);
      if (!staffMember) {
        return res.status(400).json({ message: "Invalid or expired invite link" });
      }
      if (staffMember.inviteExpires && staffMember.inviteExpires < new Date()) {
        return res.status(400).json({ message: "Invite link has expired. Please ask your clinician to resend the invite." });
      }

      const passwordHash = await hashPassword(password);
      await storage.updateClinicianStaff(staffMember.id, {
        passwordHash,
        inviteToken: null,
        inviteExpires: null,
        isActive: true,
      });

      res.json({ message: "Password set successfully. You can now log in." });
    } catch (error) {
      console.error('[API] Error setting staff password:', error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // ── Clinician Preferences: Defaults Reference ─────────────────────────────
  app.get("/api/preferences/defaults", requireAuth, async (req, res) => {
    res.json({
      labMarkers: LAB_MARKER_DEFAULTS,
      symptomKeys: SYMPTOM_KEYS,
      supplementCategories: SUPPLEMENT_CATEGORIES,
      labMarkerKeys: LAB_MARKER_KEYS,
    });
  });

  // ── Clinician Preferences: Supplement Discount Settings ───────────────────
  app.get("/api/preferences/discount", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const settings = await storage.getClinicianSupplementSettings(clinicianId);
      // Return defaults if not yet configured
      res.json(settings || { clinicianId, discountType: 'percent', discountPercent: 20, discountFlat: 0 });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch discount settings" });
    }
  });

  app.put("/api/preferences/discount", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const { discountType, discountPercent, discountFlat } = req.body;
      const updated = await storage.upsertClinicianSupplementSettings(clinicianId, {
        discountType: discountType || 'percent',
        discountPercent: discountPercent ?? 20,
        discountFlat: discountFlat ?? 0,
      } as any);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to save discount settings" });
    }
  });

  // ── Clinician Preferences: Supplement Library ─────────────────────────────
  app.get("/api/preferences/supplements", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const supplements = await storage.getClinicianSupplements(clinicianId);
      const rules = await storage.getAllClinicianSupplementRules(clinicianId);
      const supplementsWithRules = supplements.map(s => ({
        ...s,
        rules: rules.filter(r => r.supplementId === s.id),
      }));
      res.json(supplementsWithRules);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch supplements" });
    }
  });

  app.post("/api/preferences/supplements", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const { name, brand, dose, category, description, clinicalRationale, priceCents, gender, sortOrder } = req.body;
      if (!name || !dose) return res.status(400).json({ message: "Name and dose are required" });
      const supplement = await storage.createClinicianSupplement({
        clinicianId,
        name,
        brand: brand || null,
        dose,
        category: category || 'general',
        description: description || null,
        clinicalRationale: clinicalRationale || null,
        priceCents: priceCents || 0,
        isActive: true,
        gender: gender || 'both',
        sortOrder: sortOrder || 0,
      });
      res.json(supplement);
    } catch (err) {
      res.status(500).json({ message: "Failed to create supplement" });
    }
  });

  app.put("/api/preferences/supplements/:id", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const { name, brand, dose, category, description, clinicalRationale, priceCents, isActive, gender, sortOrder } = req.body;
      const updated = await storage.updateClinicianSupplement(id, clinicianId, {
        name, brand, dose, category, description, clinicalRationale, priceCents, isActive, gender, sortOrder,
      });
      if (!updated) return res.status(404).json({ message: "Supplement not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update supplement" });
    }
  });

  app.delete("/api/preferences/supplements/:id", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteClinicianSupplement(id, clinicianId);
      if (!deleted) return res.status(404).json({ message: "Supplement not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete supplement" });
    }
  });

  // ── Clinician Preferences: Supplement Rules ───────────────────────────────
  app.get("/api/preferences/supplements/:id/rules", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const supplementId = parseInt(req.params.id);
      const rules = await storage.getClinicianSupplementRules(supplementId, clinicianId);
      res.json(rules);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch rules" });
    }
  });

  app.post("/api/preferences/supplements/:id/rules", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const supplementId = parseInt(req.params.id);
      // Verify supplement belongs to clinician
      const supplement = await storage.getClinicianSupplement(supplementId, clinicianId);
      if (!supplement) return res.status(404).json({ message: "Supplement not found" });
      const { triggerType, labMarker, labMin, labMax, symptomKey, combinationLogic, priority, indicationText } = req.body;
      const rule = await storage.createClinicianSupplementRule({
        supplementId,
        clinicianId,
        triggerType: triggerType || 'lab',
        labMarker: labMarker || null,
        labMin: labMin ?? null,
        labMax: labMax ?? null,
        symptomKey: symptomKey || null,
        combinationLogic: combinationLogic || 'OR',
        priority: priority || 'medium',
        indicationText: indicationText || null,
      });
      res.json(rule);
    } catch (err) {
      res.status(500).json({ message: "Failed to create rule" });
    }
  });

  app.put("/api/preferences/supplements/rules/:ruleId", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const ruleId = parseInt(req.params.ruleId);
      const { triggerType, labMarker, labMin, labMax, symptomKey, combinationLogic, priority, indicationText } = req.body;
      const updated = await storage.updateClinicianSupplementRule(ruleId, clinicianId, {
        triggerType, labMarker, labMin, labMax, symptomKey, combinationLogic, priority, indicationText,
      });
      if (!updated) return res.status(404).json({ message: "Rule not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update rule" });
    }
  });

  app.delete("/api/preferences/supplements/rules/:ruleId", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const ruleId = parseInt(req.params.ruleId);
      const deleted = await storage.deleteClinicianSupplementRule(ruleId, clinicianId);
      if (!deleted) return res.status(404).json({ message: "Rule not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete rule" });
    }
  });

  // ── Clinician Preferences: AI Description Generation ─────────────────────
  app.post("/api/preferences/supplements/generate-description", requireClinicianOnly, async (req, res) => {
    try {
      const { name, brand, dose, category, clinicalRationale } = req.body;
      if (!name || !dose) return res.status(400).json({ message: "Name and dose are required" });

      const openai = new OpenAI({ apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a clinical supplement educator writing clear, patient-friendly explanations for supplements used in hormone and primary care clinics. Write in plain English, warm but professional, 2-3 sentences max. No medical jargon. Focus on the benefit and purpose from the patient's perspective.",
          },
          {
            role: "user",
            content: `Write a patient-facing description for this supplement:
Product: ${name}${brand ? ` by ${brand}` : ''}
Dose: ${dose}
Category: ${category || 'general'}
Clinical notes: ${clinicalRationale || 'Not provided'}

Keep it simple, warm, 2-3 sentences. Focus on what it does and why it may help.`,
          },
        ],
      });
      const description = completion.choices[0]?.message?.content?.trim() || '';
      res.json({ description });
    } catch (err) {
      console.error('[API] AI description generation error:', err);
      res.status(500).json({ message: "Failed to generate description" });
    }
  });

  // ── Clinician Preferences: Lab Range Overrides ────────────────────────────
  app.get("/api/preferences/lab-ranges", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const preferences = await storage.getClinicianLabPreferences(clinicianId);
      res.json({ preferences, defaults: LAB_MARKER_DEFAULTS });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch lab range preferences" });
    }
  });

  app.put("/api/preferences/lab-ranges", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const { markerKey, gender, displayName, unit, optimalMin, optimalMax, normalMin, normalMax, notes } = req.body;
      if (!markerKey) return res.status(400).json({ message: "markerKey is required" });
      const pref = await storage.upsertClinicianLabPreference(clinicianId, {
        clinicianId,
        markerKey,
        gender: gender || 'both',
        displayName: displayName || null,
        unit: unit || null,
        optimalMin: optimalMin ?? null,
        optimalMax: optimalMax ?? null,
        normalMin: normalMin ?? null,
        normalMax: normalMax ?? null,
        notes: notes || null,
      });
      res.json(pref);
    } catch (err) {
      res.status(500).json({ message: "Failed to save lab range preference" });
    }
  });

  app.delete("/api/preferences/lab-ranges/:id", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteClinicianLabPreference(id, clinicianId);
      if (!deleted) return res.status(404).json({ message: "Preference not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete lab range preference" });
    }
  });

  // ── Clinical Encounter Documentation ─────────────────────────────────────────

  // Audio multer — disk storage in /tmp, deleted immediately after Whisper processing
  const audioUpload = multer({
    storage: multer.diskStorage({
      destination: '/tmp',
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, `encounter-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm|mp4|flac)$/i.test(file.originalname)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid audio file type'));
      }
    },
  });

  // Helper: split audio into 20-min segments via ffmpeg, returns list of temp file paths
  function splitAudioSegments(inputPath: string, ext: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const segmentPattern = inputPath.replace(/\.[^.]+$/, '') + '_seg_%03d' + ext;
      execFile('ffmpeg', [
        '-i', inputPath,
        '-f', 'segment',
        '-segment_time', '1200',  // 20 minutes per chunk
        '-c', 'copy',
        '-reset_timestamps', '1',
        segmentPattern,
      ], (err, _stdout, stderr) => {
        if (err) {
          console.error('[Encounters] ffmpeg split error:', stderr);
          return reject(err);
        }
        // Collect the produced segment files in order
        const dir = path.dirname(inputPath);
        const base = path.basename(inputPath.replace(/\.[^.]+$/, '')) + '_seg_';
        const files = fs.readdirSync(dir)
          .filter(f => f.startsWith(base))
          .sort()
          .map(f => path.join(dir, f));
        resolve(files);
      });
    });
  }

  // POST /api/encounters/transcribe — upload audio → raw segments + text (no diarization here)
  // Stage 1 of the clinical AI pipeline. Tries gpt-4o-transcribe first, falls back to whisper-1.
  app.post("/api/encounters/transcribe", requireAuth, audioUpload.single('audio'), async (req, res) => {
    const filePath = (req as any).file?.path;
    if (!filePath) return res.status(400).json({ message: "No audio file provided" });

    const cleanupFiles = (paths: string[]) => paths.forEach(p => fs.unlink(p, () => {}));
    const visitType: string = (req.body?.visitType as string) || "follow-up";

    try {
      // Audio transcription requires a direct OpenAI key — the AI Integration proxy
      // does not support the /audio/transcriptions endpoint. Fall back gracefully.
      const audioApiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
      const openai = new OpenAI({
        apiKey: audioApiKey,
        // Only pass baseURL when NOT using the direct OPENAI_API_KEY
        baseURL: process.env.OPENAI_API_KEY ? undefined : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const LIMIT = 24.5 * 1024 * 1024;
      const fileSize = fs.statSync(filePath).size;
      const ext = path.extname(filePath) || '.webm';

      let audioSegments: string[] = [];
      let splitUsed = false;

      if (fileSize > LIMIT) {
        console.log(`[Transcribe] ${fileSize} bytes > limit — splitting into segments`);
        audioSegments = await splitAudioSegments(filePath, ext);
        splitUsed = true;
      } else {
        audioSegments = [filePath];
      }

      const clinicalPrompt = `Hormone and primary care clinic visit. ${buildMedicalTermsList(visitType).slice(0, 800)}`;

      type RawSegment = { id: number; start: number; end: number; text: string };
      const allSegments: RawSegment[] = [];
      const textParts: string[] = [];
      let segOffset = 0;

      for (const seg of audioSegments) {
        const stream = fs.createReadStream(seg);

        let verboseResult: any = null;

        // Try gpt-4o-transcribe first (verbose_json for timestamps)
        try {
          verboseResult = await openai.audio.transcriptions.create({
            model: 'gpt-4o-transcribe',
            file: stream,
            response_format: 'verbose_json',
            language: 'en',
            prompt: clinicalPrompt,
          } as any);
        } catch (modelErr: any) {
          console.warn('[Transcribe] gpt-4o-transcribe unavailable, falling back to whisper-1:', modelErr.message);
          const stream2 = fs.createReadStream(seg);
          verboseResult = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: stream2,
            response_format: 'verbose_json',
            language: 'en',
            prompt: clinicalPrompt,
          } as any);
        }

        const text: string = verboseResult?.text || (typeof verboseResult === 'string' ? verboseResult : '');
        textParts.push(text.trim());

        const segs: any[] = verboseResult?.segments || [];
        for (const s of segs) {
          allSegments.push({
            id: segOffset + (s.id ?? allSegments.length),
            start: (s.start ?? 0),
            end: (s.end ?? s.start ?? 0),
            text: (s.text || '').trim(),
          });
        }
        segOffset += segs.length || 1;
      }

      cleanupFiles(splitUsed ? [filePath, ...audioSegments] : [filePath]);

      const transcription = textParts.join(' ').trim();

      // Convert segments to raw utterances with unknown speaker (diarization is next stage)
      const rawUtterances = allSegments.length > 0
        ? allSegments.map(s => ({
            id: s.id,
            speaker: 'unknown' as const,
            speakerRaw: 'SPEAKER_UNKNOWN',
            start: s.start,
            end: s.end,
            text: s.text,
          }))
        : null;

      res.json({ transcription, utterances: rawUtterances });
    } catch (err) {
      cleanupFiles([filePath]);
      console.error('[Transcribe] Error:', err);
      res.status(500).json({ message: "Transcription failed. Please try again or paste notes manually." });
    }
  });

  // GET /api/encounters — list encounters for this clinician
  app.get("/api/encounters", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const patientId = req.query.patientId ? parseInt(req.query.patientId as string) : undefined;
      const encounters = await storage.getEncountersByClinicianId(clinicianId, patientId);
      res.json(encounters);
    } catch (err) {
      res.status(500).json({ message: "Failed to load encounters" });
    }
  });

  // POST /api/encounters — create new encounter
  app.post("/api/encounters", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const { patientId, visitDate, visitType, chiefComplaint, linkedLabResultId, clinicianNotes } = req.body;
      if (!patientId || !visitDate) return res.status(400).json({ message: "patientId and visitDate are required" });
      const encounter = await storage.createEncounter({
        clinicianId,
        patientId: parseInt(patientId),
        visitDate: new Date(visitDate),
        visitType: visitType || 'follow-up',
        chiefComplaint: chiefComplaint || null,
        linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null,
        clinicianNotes: clinicianNotes || null,
        transcription: null,
        audioProcessed: false,
        soapNote: null,
        patientSummary: null,
        summaryPublished: false,
      });
      res.json(encounter);
    } catch (err) {
      console.error('[Encounters] Create error:', err);
      res.status(500).json({ message: "Failed to create encounter" });
    }
  });

  // GET /api/encounters/:id — get single encounter
  app.get("/api/encounters/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const encounter = await storage.getEncounter(parseInt(req.params.id), clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      res.json(encounter);
    } catch (err) {
      res.status(500).json({ message: "Failed to load encounter" });
    }
  });

  // PUT /api/encounters/:id — update encounter metadata / transcription / notes
  app.put("/api/encounters/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const { visitDate, visitType, chiefComplaint, transcription, audioProcessed, linkedLabResultId, clinicianNotes, diarizedTranscript, clinicalExtraction, evidenceSuggestions } = req.body;
      const updated = await storage.updateEncounter(id, clinicianId, {
        ...(visitDate !== undefined && { visitDate: new Date(visitDate) }),
        ...(visitType !== undefined && { visitType }),
        ...(chiefComplaint !== undefined && { chiefComplaint }),
        ...(transcription !== undefined && { transcription }),
        ...(audioProcessed !== undefined && { audioProcessed }),
        ...(linkedLabResultId !== undefined && { linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null }),
        ...(clinicianNotes !== undefined && { clinicianNotes }),
        ...(diarizedTranscript !== undefined && { diarizedTranscript }),
        ...(clinicalExtraction !== undefined && { clinicalExtraction }),
        ...(evidenceSuggestions !== undefined && { evidenceSuggestions }),
      });
      if (!updated) return res.status(404).json({ message: "Encounter not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update encounter" });
    }
  });

  // PUT /api/encounters/:id/soap — save SOAP note (after editing)
  app.put("/api/encounters/:id/soap", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const { soapNote } = req.body;
      const updated = await storage.updateEncounter(id, clinicianId, { soapNote });
      if (!updated) return res.status(404).json({ message: "Encounter not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to save SOAP note" });
    }
  });

  // POST /api/encounters/:id/normalize — Stage 2: Diarize + normalize medical terms
  // Input: raw utterances (from transcription) or raw transcription text
  // Output: diarized utterances with speaker labels and corrected medical terms
  app.post("/api/encounters/:id/normalize", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      const rawUtterances: any[] | null = req.body.utterances ?? null;
      const rawText: string = req.body.transcription ?? encounter.transcription ?? "";

      if (!rawText && (!rawUtterances || rawUtterances.length === 0)) {
        return res.status(400).json({ message: "No transcription or utterances to normalize" });
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const visitType = encounter.visitType ?? "follow-up";
      const lexiconRules = buildNormalizationRules(visitType);

      // Build input for normalization
      const inputText = rawUtterances && rawUtterances.length > 0
        ? rawUtterances.map((u: any, i: number) => `[${i}] (${u.start?.toFixed(1) ?? '?'}s) ${u.text}`).join('\n')
        : rawText;

      const systemPrompt = `You are a clinical medical transcription specialist. Your task has TWO parts:

PART 1 — SPEAKER DIARIZATION:
Analyze the transcript and assign each segment to either "clinician" or "patient".
Rules:
- Clinicians ask medical questions, interpret lab values, prescribe treatments, give instructions
- Patients describe symptoms, answer questions, ask about their condition
- If uncertain, label as "unknown"
- Preserve the original segment text exactly — do not alter content in PART 1

PART 2 — MEDICAL TERM NORMALIZATION:
Correct speech-to-text errors for medical terminology. Rules:
- Fix acronyms, lab names, medication names, clinical terms
- NEVER silently change the clinical meaning
- NEVER invent diagnoses or findings not in the original
- If a correction is uncertain, keep original and mark uncertain: true
- Preserve negations (e.g., "no chest pain" must not become "chest pain")
- Preserve patient-reported uncertainty (e.g., "I think", "maybe")
- Only correct obvious speech-to-text errors, not clinical content

AVAILABLE MEDICAL LEXICONS FOR THIS VISIT TYPE:
${lexiconRules}

${NORMALIZATION_EXAMPLES}

Return a JSON array of utterance objects. Each object must have:
{
  "id": <original segment index>,
  "speaker": "clinician" | "patient" | "unknown",
  "speakerRaw": "CLINICIAN" | "PATIENT" | "UNKNOWN",
  "start": <original start seconds or 0>,
  "end": <original end seconds or 0>,
  "text": <original text, unchanged>,
  "normalizedText": <corrected text, or same as text if no corrections needed>,
  "corrections": [<list of corrections made, e.g., "HS CRP → hs-CRP">],
  "uncertain": <true if speaker assignment is uncertain>
}

Return ONLY the JSON array, no explanation.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transcript segments to process:\n${inputText}` },
        ],
        response_format: { type: "json_object" },
      });

      let raw = completion.choices[0].message.content || "{}";
      let parsed: any = JSON.parse(raw);
      // Handle both { utterances: [...] } and [...] formats
      const normalized = Array.isArray(parsed) ? parsed : (parsed.utterances ?? parsed.segments ?? []);

      // If no timestamps were in the original (plain text fallback), generate from order
      const diarized = normalized.map((u: any, i: number) => ({
        id: u.id ?? i,
        speaker: u.speaker ?? "unknown",
        speakerRaw: u.speakerRaw ?? "UNKNOWN",
        start: u.start ?? i * 30,
        end: u.end ?? (i + 1) * 30,
        text: u.text ?? "",
        normalizedText: u.normalizedText ?? u.text ?? "",
        corrections: u.corrections ?? [],
      }));

      await storage.updateEncounter(id, clinicianId, { diarizedTranscript: diarized });

      res.json({ diarizedTranscript: diarized });
    } catch (err) {
      console.error('[Normalize] Error:', err);
      res.status(500).json({ message: "Normalization failed. Please try again." });
    }
  });

  // POST /api/encounters/:id/extract — Stage 3: Structured clinical extraction
  // Extracts clinical facts from normalized transcript, mapped to source utterance IDs.
  // NEVER invents diagnoses or findings — only extracts what is explicitly stated.
  app.post("/api/encounters/:id/extract", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      const diarized = encounter.diarizedTranscript as any[] | null;
      const rawText = encounter.transcription ?? "";

      if (!diarized?.length && !rawText) {
        return res.status(400).json({ message: "Normalize the transcript first" });
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const transcriptInput = diarized?.length
        ? diarized.map((u: any) => `[ID:${u.id}] ${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : rawText;

      const systemPrompt = `You are a clinical documentation specialist. Extract structured clinical facts from the provided visit transcript.

CRITICAL RULES — SAFETY GUARDRAILS:
1. Only extract facts EXPLICITLY stated in the transcript
2. NEVER infer, assume, or add diagnoses, vitals, exam findings, or lab values not mentioned
3. NEVER create a diagnosis from symptoms alone — it goes in "assessment_candidates" as uncertain
4. PRESERVE all negations: if patient said "no chest pain", put "denies chest pain" in symptoms_denied
5. PRESERVE uncertainty: if clinician said "possible" or "might be", put in uncertain_items
6. Map every extracted fact to source_utterance_ids (the [ID:N] numbers in the transcript)
7. If something is only mentioned as a possibility, put it in assessment_candidates, NOT diagnoses_discussed

Return this exact JSON structure (all arrays, even if empty):
{
  "visit_type": "",
  "chief_concerns": [],
  "symptoms_reported": [],
  "symptoms_denied": [],
  "medications_current": [],
  "medication_changes_discussed": [],
  "labs_reviewed": [],
  "diagnoses_discussed": [],
  "assessment_candidates": [],
  "plan_candidates": [],
  "follow_up_items": [],
  "patient_questions": [],
  "red_flags": [],
  "uncertain_items": [],
  "source_utterance_ids": []
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Visit Type: ${encounter.visitType}\nChief Complaint: ${encounter.chiefComplaint ?? "Not specified"}\n\nTranscript:\n${transcriptInput}` },
        ],
        response_format: { type: "json_object" },
      });

      const extraction = JSON.parse(completion.choices[0].message.content || "{}");
      await storage.updateEncounter(id, clinicianId, { clinicalExtraction: extraction });

      res.json({ clinicalExtraction: extraction });
    } catch (err) {
      console.error('[Extract] Error:', err);
      res.status(500).json({ message: "Clinical extraction failed. Please try again." });
    }
  });

  // POST /api/encounters/:id/evidence — Stage 5: Evidence Overlay
  // Two-step: (1) generate focused clinical questions, (2) synthesize evidence per question.
  // NEVER auto-inserts into chart. Clinician-facing, informational only.
  app.post("/api/encounters/:id/evidence", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      const extraction = encounter.clinicalExtraction as any;
      if (!extraction) return res.status(400).json({ message: "Run clinical extraction (Stage 3) first" });

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // ── Step 1: Generate focused clinical questions ──────────────────────────
      const visitContext = [
        `Visit type: ${encounter.visitType}`,
        extraction.chief_concerns?.length ? `Chief concerns: ${extraction.chief_concerns.join('; ')}` : null,
        extraction.symptoms_reported?.length ? `Symptoms: ${extraction.symptoms_reported.join('; ')}` : null,
        extraction.diagnoses_discussed?.length ? `Diagnoses discussed: ${extraction.diagnoses_discussed.join('; ')}` : null,
        extraction.assessment_candidates?.length ? `Assessment candidates: ${extraction.assessment_candidates.join('; ')}` : null,
        extraction.medications_current?.length ? `Current meds: ${extraction.medications_current.join('; ')}` : null,
        extraction.medication_changes_discussed?.length ? `Medication changes: ${extraction.medication_changes_discussed.join('; ')}` : null,
        extraction.labs_reviewed?.length ? `Labs reviewed: ${extraction.labs_reviewed.join('; ')}` : null,
        extraction.red_flags?.length ? `Red flags: ${extraction.red_flags.join('; ')}` : null,
      ].filter(Boolean).join('\n');

      const questionsCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert clinical evidence librarian for a hormone and primary care clinic.
Given structured visit data, generate 1 to 5 focused, searchable clinical evidence questions.
Each question should be specific, clinically meaningful, and answerable by medical literature.

RULES:
- Only generate questions for clinically significant topics (diagnoses, treatment decisions, medication questions, risk stratification)
- Do NOT generate questions about appointment logistics, follow-up scheduling, or administrative items
- Questions should be framed as "What is the evidence for..." or "What are evidence-based options for..." or "How should X be interpreted in the context of Y..."
- Prefer specific clinical scenarios over generic questions

EXAMPLES:
- "What is the current evidence for transdermal estradiol in symptomatic perimenopause with sleep disturbance?"
- "What are evidence-based options for GSM with dyspareunia despite vaginal estrogen?"
- "How should hs-CRP be interpreted alongside ApoB and Lp(a) in cardiometabolic risk assessment?"
- "What is the evidence for metformin in insulin resistance with GLP-1 therapy already in place?"

Return a JSON object: { "clinical_questions": ["question1", "question2", ...] }`,
          },
          { role: "user", content: visitContext },
        ],
        response_format: { type: "json_object" },
      });

      const questionsRaw = JSON.parse(questionsCompletion.choices[0].message.content || "{}");
      const clinicalQuestions: string[] = (questionsRaw.clinical_questions ?? []).slice(0, 5);

      if (clinicalQuestions.length === 0) {
        const overlay = { clinical_questions: [], suggestions: [], not_for_auto_insertion: true as const };
        await storage.updateEncounter(id, clinicianId, { evidenceSuggestions: overlay });
        return res.json({ evidenceSuggestions: overlay });
      }

      // ── Step 2: Generate evidence-based suggestions per question ─────────────
      const evidenceCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert clinical evidence synthesizer for a hormone and primary care clinic.
For each clinical question provided, synthesize evidence-based guidance from authoritative sources.

EVIDENCE SOURCE PRIORITY:
1. Clinical practice guidelines (Endocrine Society, ACOG, AACE, AHA/ACC, USPSTF, North American Menopause Society, etc.)
2. Society position statements and consensus documents
3. Systematic reviews and meta-analyses (PubMed-indexed)
4. Large prospective cohort studies
5. Randomized controlled trials
6. Observational studies and expert opinion (clearly labeled)

RULES:
- Only cite real, established guidelines and peer-reviewed literature
- Do NOT fabricate citations, DOIs, or study names
- strength_of_support must honestly reflect the evidence base:
  * "strong" = consistent guideline recommendations + Level A/B evidence
  * "moderate" = some guideline support or consistent observational evidence
  * "limited" = mainly expert opinion or small studies
  * "mixed" = conflicting evidence across sources
  * "insufficient" = emerging data only, no consensus
- If evidence is mixed or weak, state that explicitly in summary and cautions
- is_evidence_informed_consideration = true if the suggestion goes beyond what was explicitly discussed in the visit
- Citations must include real source names, publication/journal, year, and a plausible PubMed or guideline URL when available
- Each suggestion should have 1-3 high-quality citations minimum; reject suggestions with zero citations

Return a JSON object matching this schema:
{
  "suggestions": [
    {
      "title": "concise evidence topic title",
      "summary": "2-4 sentence evidence synthesis with specific findings",
      "relevance_to_visit": "1-2 sentences explaining why this is relevant to today's visit",
      "strength_of_support": "strong" | "moderate" | "limited" | "mixed" | "insufficient",
      "cautions": ["any important caveats, contraindications, or evidence gaps"],
      "citations": [
        {
          "title": "full citation/guideline title",
          "source": "journal or publisher name",
          "year": "YYYY",
          "url": "https://... (PubMed, guideline site, or leave empty string if unknown)"
        }
      ],
      "is_evidence_informed_consideration": false
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Visit context:\n${visitContext}\n\nClinical questions to answer:\n${clinicalQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nGenerate one suggestion per question. Do not include any suggestion that has zero real citations.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const evidenceRaw = JSON.parse(evidenceCompletion.choices[0].message.content || "{}");
      const rawSuggestions: any[] = evidenceRaw.suggestions ?? [];

      // Post-process: reject suggestions with no citations
      const validSuggestions = rawSuggestions.filter(s => Array.isArray(s.citations) && s.citations.length > 0);

      const overlay = {
        clinical_questions: clinicalQuestions,
        suggestions: validSuggestions,
        not_for_auto_insertion: true as const,
      };

      await storage.updateEncounter(id, clinicianId, { evidenceSuggestions: overlay });
      res.json({ evidenceSuggestions: overlay });
    } catch (err) {
      console.error('[Evidence] Error:', err);
      res.status(500).json({ message: "Evidence lookup failed. Please try again." });
    }
  });

  // POST /api/encounters/:id/match-patterns — Pattern / Phenotype Matching Stage
  // MODE 1 (transcript_only): uses symptoms/facts from visit conversation only
  // MODE 2 (context_linked): also incorporates linked lab values and prior interpretations
  // Works gracefully in either mode. Labs are optional context, never required.
  app.post("/api/encounters/:id/match-patterns", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      const extraction = encounter.clinicalExtraction as any;
      if (!extraction && !encounter.transcription && !encounter.diarizedTranscript) {
        return res.status(400).json({ message: "Run at least Stage 2 (Normalize) before pattern matching" });
      }

      // ── Build transcript context ─────────────────────────────────────────────
      const diarized = encounter.diarizedTranscript as any[] | null;
      const transcriptText = diarized?.length
        ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : (encounter.transcription ?? "");

      // ── Build extraction context ─────────────────────────────────────────────
      const extractionLines: string[] = [];
      if (extraction) {
        if (extraction.chief_concerns?.length)           extractionLines.push(`Chief concerns: ${extraction.chief_concerns.join("; ")}`);
        if (extraction.symptoms_reported?.length)         extractionLines.push(`Symptoms reported: ${extraction.symptoms_reported.join("; ")}`);
        if (extraction.symptoms_denied?.length)           extractionLines.push(`Symptoms denied: ${extraction.symptoms_denied.join("; ")}`);
        if (extraction.medications_current?.length)       extractionLines.push(`Current medications: ${extraction.medications_current.join("; ")}`);
        if (extraction.diagnoses_discussed?.length)       extractionLines.push(`Diagnoses discussed: ${extraction.diagnoses_discussed.join("; ")}`);
        if (extraction.assessment_candidates?.length)     extractionLines.push(`Assessment candidates: ${extraction.assessment_candidates.join("; ")}`);
        if (extraction.plan_candidates?.length)           extractionLines.push(`Plan items: ${extraction.plan_candidates.join("; ")}`);
        if (extraction.red_flags?.length)                 extractionLines.push(`Red flags: ${extraction.red_flags.join("; ")}`);
        if (extraction.medication_changes_discussed?.length) extractionLines.push(`Medication changes: ${extraction.medication_changes_discussed.join("; ")}`);
      }
      const extractionContext = extractionLines.length
        ? `\n\nSTRUCTURED CLINICAL FACTS (extracted from transcript):\n${extractionLines.join('\n')}`
        : "";

      // ── Optionally load linked lab result ───────────────────────────────────
      let labContext = "";
      let labContextUsed = false;
      let labResultId: number | undefined;
      if (encounter.linkedLabResultId) {
        const labResult = await storage.getLabResult(encounter.linkedLabResultId);
        if (labResult) {
          labContextUsed = true;
          labResultId = labResult.id;
          const vals = labResult.labValues as Record<string, any>;
          const labLines = Object.entries(vals)
            .filter(([k, v]) => v !== null && v !== undefined && v !== "" && k !== "demographics" && k !== "patientName" && k !== "labDrawDate" && typeof v === "number")
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n");
          const interp = labResult.interpretationResult as any;
          const priorPatterns = interp?.insulinResistance
            ? `\n  Prior IR screening: ${interp.insulinResistance.likelihood ?? "assessed"}`
            : "";
          const priorRedFlags = interp?.redFlags?.length
            ? `\n  Prior red flags: ${interp.redFlags.map((f: any) => f.title ?? f).join("; ")}`
            : "";
          labContext = `\n\nLINKED LAB RESULTS (${labResult.gender === 'female' ? 'Female' : 'Male'} panel):\n${labLines}${priorPatterns}${priorRedFlags}`;
        }
      }

      const mode = labContextUsed ? "context_linked" : "transcript_only";

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `You are an expert clinical pattern recognition engine for a hormone and primary care clinic.
Your task is to identify clinically relevant patterns and phenotypes from a patient encounter.

OPERATING MODE: ${mode === "context_linked" ? "CONTEXT-LINKED (transcript + lab data available)" : "TRANSCRIPT-ONLY (no linked labs — use symptoms and chart context only)"}

CLINICAL FRAMEWORKS YOU KNOW:

1. PERIMENOPAUSE PATTERNS
   - Estrogen dominance: heavy periods, bloating, breast tenderness, mood swings, weight gain
   - Estrogen deficiency: hot flashes, night sweats, vaginal dryness, brain fog, poor sleep, bone loss concern
   - Progesterone deficiency: sleep disruption, anxiety, PMS, irregular cycles, heavy periods
   - Androgen excess: acne, hirsutism, hair thinning at crown, oily skin
   - Complete transition / surgical menopause context
   - Lab confirmation markers: E2, progesterone, FSH, LH, testosterone, SHBG, DHEA-S

2. TESTOSTERONE OPTIMIZATION (male and female)
   - Male: low libido, fatigue, decreased motivation, poor sleep, reduced muscle mass, mood changes, cognitive fog
   - Female: low libido, fatigue, reduced muscle tone, mood flatness, cognitive fog (low-normal testosterone)
   - TRT monitoring patterns: erythrocytosis risk (hematocrit >50%), PSA velocity, estradiol elevation
   - Lab confirmation markers: total T, free T, SHBG, E2, LH, FSH, hematocrit, PSA

3. INSULIN RESISTANCE SCREENING
   - Classic IR: acanthosis nigricans, central adiposity, fatigue after meals, sugar cravings, frequent hunger
   - PCOS-related IR: irregular cycles, androgen excess signs, polycystic ovaries, anovulation
   - Lean IR (metabolically obese normal weight): normal BMI but metabolic dysfunction signs
   - Post-GLP-1 IR: prior GLP-1 use, improved glucose markers, possible rebound concerns
   - Lab confirmation markers: fasting glucose, fasting insulin, HOMA-IR, HbA1c, triglycerides, HDL

4. THYROID PATTERNS
   - Hypothyroid: fatigue, cold intolerance, hair loss, constipation, weight gain, brain fog, dry skin
   - Hyperthyroid / overtreatment: palpitations, heat intolerance, anxiety, weight loss, tremor
   - Hashimoto's: fluctuating symptoms, positive TPO antibodies context, autoimmune history
   - Lab confirmation: TSH, free T4, free T3, TPO antibodies

5. LIPID / CARDIOMETABOLIC
   - Atherogenic dyslipidemia: high TG, low HDL, small dense LDL pattern
   - Elevated cardiovascular risk: family history, smoking, hypertension combined with lab markers
   - Statin consideration: high LDL, high ApoB, elevated Lp(a) context
   - Lab confirmation: LDL, HDL, TG, ApoB, Lp(a), hs-CRP, glucose

6. ADRENAL / HPA AXIS
   - Cortisol dysregulation: fatigue (especially AM), salt cravings, poor stress response, crash after exertion
   - DHEA deficiency: low energy, poor mood, reduced libido (especially postmenopause)
   - Lab confirmation: DHEA-S, morning cortisol, 4-point salivary cortisol (if discussed)

7. NUTRIENT DEFICIENCY PATTERNS
   - Vitamin D deficiency: fatigue, musculoskeletal aches, immune concerns, mood depression
   - B12 deficiency: neuropathy symptoms, fatigue, cognitive fog (especially with metformin use)
   - Iron/ferritin: fatigue, hair loss, poor exercise tolerance, restless legs
   - Lab confirmation: 25-OH vitamin D, B12, ferritin, iron panel

EVIDENCE BASIS RULES:
- "symptom_based": pattern inferred from symptoms alone, no lab confirmation in this encounter
- "lab_backed": pattern supported by linked lab values meeting clinical thresholds
- "combined": both symptom evidence AND lab values support the pattern
- "insufficient": mentioned or possible, but not enough information to assess

CONFIDENCE RULES:
- "possible": 1-2 symptoms loosely matching the pattern; may need further evaluation
- "probable": 3+ symptoms clearly fitting the pattern OR strong lab signal alone
- "confirmed": meets established clinical criteria (symptom cluster + lab threshold OR clear clinical diagnosis stated)

CRITICAL RULES:
- NEVER require labs to run this analysis — transcript-only mode is fully valid
- In transcript-only mode: label evidence_basis as "symptom_based", set requires_lab_confirmation: true when appropriate
- In context-linked mode: use lab values to upgrade or downgrade confidence
- NEVER fabricate lab values not provided
- NEVER assign "confirmed" confidence from symptoms alone if lab confirmation is clinically standard
- If a pattern is partially supported, include it with appropriate confidence and note what would confirm it
- Symptom-based impressions are clinically valid — label them honestly, not dismissively
- Only include patterns with at least "possible" confidence — do not force patterns with no evidence
- If no clear patterns are identified, return an empty matched_patterns array with clear unmatched_concerns

Return a JSON object with this exact schema:
{
  "matched_patterns": [
    {
      "pattern_name": "concise pattern name (e.g., Estrogen Deficiency Pattern)",
      "category": "perimenopause" | "testosterone_optimization" | "insulin_resistance" | "thyroid" | "lipid_cardiometabolic" | "adrenal_hpa" | "nutrient_deficiency" | "other",
      "evidence_basis": "symptom_based" | "lab_backed" | "combined" | "insufficient",
      "confidence": "possible" | "probable" | "confirmed",
      "supporting_evidence": ["list of specific symptoms, facts, or lab values supporting this pattern"],
      "contradicting_evidence": ["list of anything arguing against this pattern"],
      "recommended_considerations": ["specific clinical actions to consider"],
      "requires_lab_confirmation": true | false,
      "lab_markers_to_evaluate": ["specific markers if lab confirmation is recommended"],
      "notes": "any important clinical nuance, uncertainty, or context"
    }
  ],
  "symptom_clusters": ["grouped symptom patterns noted in the visit, even if no formal pattern matched"],
  "unmatched_concerns": ["concerns or topics discussed that don't fit the above frameworks"],
  "lab_context_used": ${labContextUsed}
}`;

      const userPrompt = `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "Not specified"}
Visit Date: ${new Date(encounter.visitDate).toLocaleDateString()}${labContext}${extractionContext}

TRANSCRIPT:
${transcriptText}

Analyze this encounter and identify clinical patterns. Remember: operate in ${mode} mode. ${!labContextUsed ? "No labs are linked — base your analysis on transcript and symptom evidence only." : "Lab values are available — use them to support or refute patterns."}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const raw = JSON.parse(completion.choices[0].message.content || "{}");

      const result: import("@shared/schema").PatternMatchResult = {
        mode,
        matched_patterns: raw.matched_patterns ?? [],
        symptom_clusters: raw.symptom_clusters ?? [],
        unmatched_concerns: raw.unmatched_concerns ?? [],
        lab_context_used: labContextUsed,
        ...(labResultId !== undefined && { lab_result_id: labResultId }),
        generated_at: new Date().toISOString(),
      };

      await storage.updateEncounter(id, clinicianId, { patternMatch: result });
      res.json({ patternMatch: result });
    } catch (err) {
      console.error('[PatternMatch] Error:', err);
      res.status(500).json({ message: "Pattern matching failed. Please try again." });
    }
  });

  // POST /api/encounters/:id/validate — SOAP + Evidence Validator
  // Checks SOAP content against transcript/extraction; validates evidence citations.
  app.post("/api/encounters/:id/validate", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      const soapNote = encounter.soapNote as any;
      const extraction = encounter.clinicalExtraction as any;
      const overlay = encounter.evidenceSuggestions as any;
      const diarized = encounter.diarizedTranscript as any[] | null;

      if (!soapNote) return res.status(400).json({ message: "No SOAP note to validate" });

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // Build transcript text for validation context
      const transcriptText = diarized?.length
        ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : (encounter.transcription ?? "");

      const soapText = typeof soapNote === 'string' ? soapNote : (soapNote.fullNote ?? JSON.stringify(soapNote));

      const extractionContext = extraction ? JSON.stringify({
        symptoms_reported: extraction.symptoms_reported ?? [],
        symptoms_denied: extraction.symptoms_denied ?? [],
        diagnoses_discussed: extraction.diagnoses_discussed ?? [],
        assessment_candidates: extraction.assessment_candidates ?? [],
        medications_current: extraction.medications_current ?? [],
        medication_changes_discussed: extraction.medication_changes_discussed ?? [],
        labs_reviewed: extraction.labs_reviewed ?? [],
        red_flags: extraction.red_flags ?? [],
        uncertain_items: extraction.uncertain_items ?? [],
      }) : "{}";

      const evidenceSuggestions = overlay?.suggestions ?? [];

      const validationCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a clinical documentation safety validator.

Your job is to check:

SOAP VALIDATION — flag any item in the SOAP note that:
1. Contains a definitive diagnosis NOT supported by the transcript or structured extraction
2. Contains a specific medication dose NOT mentioned in the transcript or chart
3. Contains a physical exam finding documented as performed when no exam was documented
4. Represents an unsupported clinical claim not derivable from the provided transcript
5. Makes an unjustified jump from evidence suggestion to a confirmed treatment plan

EVIDENCE VALIDATION — flag any evidence suggestion that:
1. Has zero or clearly fabricated citations
2. Directly contradicts facts extracted from the visit transcript
3. Presents speculative treatment options as confirmed recommendations

Flag severity:
- "error" = clinically dangerous inaccuracy requiring immediate correction
- "warning" = uncertain or potentially unsupported item requiring clinician review

Return a JSON object:
{
  "soap_flags": [
    {
      "type": "unsupported_diagnosis" | "unsupported_medication" | "unsupported_exam" | "missing_citation" | "contradicts_visit" | "unsupported_plan_jump",
      "item": "the specific text/item that was flagged",
      "detail": "concise explanation of why it was flagged",
      "severity": "warning" | "error"
    }
  ],
  "evidence_flags": [
    {
      "type": "missing_citation" | "contradicts_visit" | "unsupported_plan_jump",
      "item": "evidence suggestion title that was flagged",
      "detail": "reason for flag",
      "severity": "warning" | "error"
    }
  ],
  "overall_status": "pass" | "flag" | "fail"
}
Where: "pass" = no flags, "flag" = warnings present, "fail" = one or more errors present.`,
          },
          {
            role: "user",
            content: `TRANSCRIPT:
${transcriptText || "(no transcript available)"}

STRUCTURED EXTRACTION:
${extractionContext}

SOAP NOTE TO VALIDATE:
${soapText}

EVIDENCE SUGGESTIONS TO VALIDATE:
${evidenceSuggestions.length ? JSON.stringify(evidenceSuggestions.map((s: any) => ({ title: s.title, citations: s.citations ?? [] }))) : "none"}

Validate the SOAP note against the transcript and extraction. Validate evidence suggestions have real citations. Return JSON with soap_flags, evidence_flags, and overall_status.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const validationRaw = JSON.parse(validationCompletion.choices[0].message.content || "{}");
      const result = {
        soap_flags: validationRaw.soap_flags ?? [],
        evidence_flags: validationRaw.evidence_flags ?? [],
        validated_at: new Date().toISOString(),
        overall_status: validationRaw.overall_status ?? "pass",
      };

      res.json({ validation: result });
    } catch (err) {
      console.error('[Validate] Error:', err);
      res.status(500).json({ message: "Validation failed. Please try again." });
    }
  });

  // PUT /api/encounters/:id/summary — save patient summary (after editing)
  app.put("/api/encounters/:id/summary", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const { patientSummary } = req.body;
      const updated = await storage.updateEncounter(id, clinicianId, { patientSummary });
      if (!updated) return res.status(404).json({ message: "Encounter not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to save patient summary" });
    }
  });

  // POST /api/encounters/:id/publish — publish patient summary to portal
  app.post("/api/encounters/:id/publish", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      if (!encounter.patientSummary) return res.status(400).json({ message: "No patient summary to publish" });
      const updated = await storage.updateEncounter(id, clinicianId, {
        summaryPublished: true,
        summaryPublishedAt: new Date(),
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to publish encounter summary" });
    }
  });

  // POST /api/encounters/:id/unpublish — unpublish patient summary
  app.post("/api/encounters/:id/unpublish", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const updated = await storage.updateEncounter(id, clinicianId, {
        summaryPublished: false,
      });
      if (!updated) return res.status(404).json({ message: "Encounter not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to unpublish encounter summary" });
    }
  });

  // DELETE /api/encounters/:id
  app.delete("/api/encounters/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const deleted = await storage.deleteEncounter(parseInt(req.params.id), clinicianId);
      if (!deleted) return res.status(404).json({ message: "Encounter not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete encounter" });
    }
  });

  // POST /api/encounters/:id/generate-soap — Stage 4: Generate SOAP note
  // Uses clinical extraction when available. NEVER invents unsupported facts.
  app.post("/api/encounters/:id/generate-soap", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      if (!encounter.transcription && !encounter.diarizedTranscript) {
        return res.status(400).json({ message: "No transcription available. Please record or add session notes first." });
      }

      // Fetch linked lab result for context
      let labContext = "";
      if (encounter.linkedLabResultId) {
        const labResult = await storage.getLabResult(encounter.linkedLabResultId);
        if (labResult) {
          const labVals = labResult.labValues as Record<string, any>;
          const labLines = Object.entries(labVals)
            .filter(([, v]) => v !== null && v !== undefined && v !== "")
            .map(([k, v]) => `  ${k}: ${v}`)
            .join("\n");
          labContext = `\n\nLINKED LAB RESULTS (${labResult.gender === 'female' ? 'Female' : 'Male'} panel, collected ${new Date(labResult.createdAt).toLocaleDateString()}):\n${labLines}`;
        }
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // Build clinical extraction context if available
      const extraction = encounter.clinicalExtraction as any;
      let extractionContext = "";
      if (extraction) {
        const lines: string[] = [];
        if (extraction.chief_concerns?.length) lines.push(`Chief concerns: ${extraction.chief_concerns.join("; ")}`);
        if (extraction.symptoms_reported?.length) lines.push(`Symptoms reported: ${extraction.symptoms_reported.join("; ")}`);
        if (extraction.symptoms_denied?.length) lines.push(`Symptoms denied: ${extraction.symptoms_denied.join("; ")}`);
        if (extraction.medications_current?.length) lines.push(`Current medications: ${extraction.medications_current.join("; ")}`);
        if (extraction.medication_changes_discussed?.length) lines.push(`Medication changes discussed: ${extraction.medication_changes_discussed.join("; ")}`);
        if (extraction.labs_reviewed?.length) lines.push(`Labs reviewed: ${extraction.labs_reviewed.join("; ")}`);
        if (extraction.diagnoses_discussed?.length) lines.push(`Diagnoses discussed: ${extraction.diagnoses_discussed.join("; ")}`);
        if (extraction.assessment_candidates?.length) lines.push(`Assessment candidates (uncertain): ${extraction.assessment_candidates.join("; ")}`);
        if (extraction.plan_candidates?.length) lines.push(`Plan items discussed: ${extraction.plan_candidates.join("; ")}`);
        if (extraction.follow_up_items?.length) lines.push(`Follow-up items: ${extraction.follow_up_items.join("; ")}`);
        if (extraction.red_flags?.length) lines.push(`Red flags noted: ${extraction.red_flags.join("; ")}`);
        if (extraction.uncertain_items?.length) lines.push(`Uncertain/unresolved: ${extraction.uncertain_items.join("; ")}`);
        if (lines.length) extractionContext = `\n\nSTRUCTURED CLINICAL EXTRACTION (verified from transcript):\n${lines.join('\n')}`;
      }

      // Build pattern match context if available (optional — improves SOAP assessment)
      const patternMatchData = encounter.patternMatch as any;
      let patternContext = "";
      if (patternMatchData?.matched_patterns?.length) {
        const mode = patternMatchData.mode === "context_linked" ? "transcript + lab data" : "transcript symptoms only";
        const patternLines = patternMatchData.matched_patterns.map((p: any) =>
          `- ${p.pattern_name} [${p.confidence}, ${p.evidence_basis}]: ${p.supporting_evidence?.join("; ") ?? "no detail"}`
        );
        patternContext = `\n\nCLINICAL PATTERN MATCHING (${mode}):\n${patternLines.join('\n')}`;
        if (patternMatchData.symptom_clusters?.length) {
          patternContext += `\nSymptom clusters: ${patternMatchData.symptom_clusters.join("; ")}`;
        }
        patternContext += `\n\nIMPORTANT: Reference pattern findings in your Assessment with appropriate confidence language. "possible", "probable", or "confirmed" based on evidence_basis. Do NOT assert "confirmed" if evidence_basis is "symptom_based".`;
      }

      // Build normalized transcript context
      const diarized = encounter.diarizedTranscript as any[] | null;
      const transcriptText = diarized?.length
        ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : (encounter.transcription ?? "");

      const systemPrompt = `You are an expert clinical documentation specialist for a hormone and primary care clinic. Generate a chart-ready SOAP note.

CRITICAL SAFETY RULES — MUST FOLLOW:
1. ONLY document what is explicitly stated in the transcript or structured data provided
2. Do NOT invent physical exam findings if none were performed or documented
3. Do NOT invent vitals if none were provided
4. Do NOT assign a definitive diagnosis if only "assessment candidates" are present — use "possible" or "under evaluation"
5. Do NOT add lab values, medications, or clinical facts not present in the input
6. If exam sections are not documented, write "Not performed / Not documented" — NOT "WNL" or "Normal"
7. Preserve all meaningful negatives (denied symptoms)
8. If uncertain, flag in needs_clinician_review
9. Physical Exam section: ONLY document systems that were actually examined. If no physical exam was performed, write: "Physical examination not performed at this encounter."

Return a JSON object with these keys:
{
  "fullNote": "<complete formatted SOAP note as plain text>",
  "uncertain_items": ["<list of items needing clinician review>"],
  "needs_clinician_review": ["<specific flags for clinician attention>"]
}

Use this EXACT format for fullNote (verbatim headers):

CC/Reason: [chief complaint]

SUBJECTIVE

HPI: [history of present illness — only from transcript]

Medical History:
- Allergies: [only if mentioned, else "Not reported in this visit"]
- Past Medical Hx: [only if mentioned]
- Past Surgical Hx: [only if mentioned]
- Social Hx: [only if mentioned]
- Family Hx: [only if mentioned]

ROS: [only document systems explicitly discussed — mark others as "Not reviewed at this visit"]

OBJECTIVE

[If no physical exam was performed, state that clearly]
[If vitals were provided, list them. If not, do not list vitals]

ASSESSMENT/PLAN

[Use assessment_candidates with appropriate uncertainty language if extraction is available]

1. [Diagnosis or working diagnosis]:
   - Details: [from transcript/extraction]
   - Plan: [from transcript/extraction]

CARE PLAN
[Only items explicitly discussed]

FOLLOW-UP
[Only if discussed or chart-provided]`;

      const userPrompt = `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "Not specified"}
Visit Date: ${new Date(encounter.visitDate).toLocaleDateString()}${labContext}${extractionContext}${patternContext}

TRANSCRIPT (normalized):
${transcriptText}

Generate the SOAP note. Flag anything uncertain in needs_clinician_review. Return JSON with fullNote, uncertain_items, needs_clinician_review.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const soapNote = JSON.parse(completion.choices[0].message.content || "{}");

      const updated = await storage.updateEncounter(id, clinicianId, {
        soapNote,
        soapGeneratedAt: new Date(),
      });

      res.json({ soapNote, encounter: updated });
    } catch (err) {
      console.error('[SOAP] Generation error:', err);
      res.status(500).json({ message: "Failed to generate SOAP note. Please try again." });
    }
  });

  // POST /api/encounters/:id/generate-summary — generate patient-facing summary
  app.post("/api/encounters/:id/generate-summary", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      if (!encounter.soapNote) return res.status(400).json({ message: "Please generate the SOAP note first." });

      const soap = encounter.soapNote as any;

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a healthcare communication specialist. Transform clinical SOAP note content into a warm, clear, patient-friendly visit summary. Write in second person ("you", "your"). Avoid medical jargon — explain terms if used. Keep it encouraging and empowering. Structure as: a brief intro paragraph, then "What We Discussed", "Your Care Plan", and "Next Steps". Do not include information from Objective findings unless patient-relevant.`,
          },
          {
            role: "user",
            content: `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "General visit"}
Date: ${new Date(encounter.visitDate).toLocaleDateString()}

Assessment:
${soap.assessment || ""}

Plan:
${soap.plan || ""}

Subjective:
${soap.subjective || ""}

Generate a warm, plain-language patient visit summary that the clinician can review and publish to the patient portal.`,
          },
        ],
      });

      const patientSummary = completion.choices[0].message.content || "";
      const updated = await storage.updateEncounter(id, clinicianId, { patientSummary });

      res.json({ patientSummary, encounter: updated });
    } catch (err) {
      console.error('[Encounters] Summary generation error:', err);
      res.status(500).json({ message: "Failed to generate patient summary. Please try again." });
    }
  });

  // GET /api/portal/encounters — published summaries for portal patient
  app.get("/api/portal/encounters", async (req, res) => {
    try {
      const portalPatientId = (req.session as any).portalPatientId;
      if (!portalPatientId) return res.status(401).json({ message: "Portal authentication required" });
      const encounters = await storage.getPublishedEncountersByPatient(portalPatientId);
      res.json(encounters);
    } catch (err) {
      res.status(500).json({ message: "Failed to load visit summaries" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
