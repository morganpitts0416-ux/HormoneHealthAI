import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import multer from "multer";
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
import { sendInviteEmail, sendPasswordResetEmail, sendPatientPortalInviteEmail, sendProtocolPublishedEmail, sendNewPortalMessageEmail } from "./email-service";
import bcrypt from "bcrypt";

// ── Auth middleware ────────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Authentication required" });
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
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
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

  // Login
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const { passwordHash: _ph, ...safeUser } = user;
        res.json(safeUser);
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ success: true });
    });
  });

  // Current user
  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { passwordHash: _ph, externalMessagingApiKey, ...safeUser } = req.user as any;
    res.json({ ...safeUser, externalMessagingApiKeySet: !!(externalMessagingApiKey) });
  });

  // Update profile
  app.patch("/api/auth/profile", requireAuth, async (req, res) => {
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
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
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

      // Step 4: Generate AI-powered recommendations
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations,
        'male',
        trendContext || undefined
      );

      // Step 5: Generate patient-friendly summary (includes PREVENT-based lifestyle modifications)
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0,
        preventRisk
      );

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

      // Step 4: Generate AI-powered recommendations with female context
      const aiRecommendations = await AIService.generateRecommendations(
        labs,
        redFlags,
        interpretations,
        'female',
        trendContext || undefined
      );

      // Step 5: Generate patient-friendly summary
      const patientSummary = await AIService.generatePatientSummary(
        labs,
        interpretations,
        redFlags.length > 0,
        preventRisk,
        'female'
      );

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

  app.post("/api/patients", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const parseResult = insertPatientSchema.safeParse({ ...req.body, userId });
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
      const userId = (req.user as any).id;
      const q = (req.query.q as string) || '';
      const gender = req.query.gender as string | undefined;
      if (!q || q.length < 1) {
        const allPatients = await storage.getAllPatients(userId);
        return res.json(allPatients);
      }
      const patients = await storage.searchPatients(q, userId, gender);
      res.json(patients);
    } catch (error) {
      console.error("Error searching patients:", error);
      res.status(500).json({ error: "Failed to search patients" });
    }
  });

  app.get("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, userId);
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

  app.get("/api/patients/:id/labs", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, userId);
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
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, userId);
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
      const userId = (req.user as any).id;
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, userId);
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
      await storage.updatePatient(patientId, {}, userId);
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
      const deleted = await storage.deleteLabResult(id);
      if (!deleted) {
        return res.status(404).json({ error: "Lab result not found" });
      }
      console.log('[API] Deleted lab result:', id);
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
      const userId = (req.user as any).id;
      const gender = req.query.gender as string | undefined;
      const interpretations = await storage.getAllSavedInterpretations(userId, gender);
      res.json(interpretations);
    } catch (error) {
      console.error('[API] Error fetching saved interpretations:', error);
      res.status(500).json({ error: 'Failed to fetch saved interpretations' });
    }
  });

  // Search saved interpretations by patient name
  app.get("/api/saved-interpretations/search", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const searchTerm = req.query.q as string;
      const gender = req.query.gender as string | undefined;
      if (!searchTerm) {
        return res.status(400).json({ error: 'Search term (q) is required' });
      }
      const interpretations = await storage.searchSavedInterpretations(searchTerm, userId, gender);
      res.json(interpretations);
    } catch (error) {
      console.error('[API] Error searching saved interpretations:', error);
      res.status(500).json({ error: 'Failed to search saved interpretations' });
    }
  });

  // Get a single saved interpretation by ID
  app.get("/api/saved-interpretations/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid interpretation ID' });
      const interpretation = await storage.getSavedInterpretation(id, userId);
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
      const userId = (req.user as any).id;
      const { patientName, gender, labValues, interpretation, labDate } = req.body;
      if (!patientName || !gender || !labValues || !interpretation) {
        return res.status(400).json({ 
          error: 'Missing required fields: patientName, gender, labValues, interpretation' 
        });
      }
      const saved = await storage.createSavedInterpretation({
        userId,
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
          let patient = await storage.getPatientByName(firstName, lastName, userId);
          if (!patient) {
            patient = await storage.createPatient({
              userId,
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
      const userId = (req.user as any).id;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid interpretation ID' });
      const deleted = await storage.deleteSavedInterpretation(id, userId);
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
  app.post("/api/admin/bootstrap", requireAuth, async (req, res) => {
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
      const clinicianId = (req.user as any).id;
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

      await sendPatientPortalInviteEmail(email, patient.firstName, clinicianUser?.clinicName || "Your Care Team", token, req);

      res.json({ message: "Invitation sent", inviteToken: process.env.NODE_ENV === "development" ? token : undefined });
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

      const patient = await storage.getPatient(account.patientId, -1).catch(() => undefined) ||
        await (async () => {
          const result = await storage.getLabResultsByPatient(account.patientId);
          return null;
        })();

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
      // Return labs with safe fields only (no internal clinical scoring)
      const safeLabs = labs.map((lab) => ({
        id: lab.id,
        labDate: lab.labDate,
        createdAt: lab.createdAt,
        interpretations: (lab.interpretationResult as any)?.interpretations || [],
        supplements: (lab.interpretationResult as any)?.supplements || [],
        patientSummary: (lab.interpretationResult as any)?.patientSummary || null,
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
      const clinicianId = (req.user as any).id;
      const { patientId, labResultId, supplements, clinicianNotes, labDate } = req.body;
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
      const clinicianId = (req.user as any).id;
      const patientId = parseInt(req.params.patientId);
      const patient = await storage.getPatient(patientId, clinicianId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const portalAccount = await storage.getPortalAccountByPatientId(patientId);
      const latestProtocol = await storage.getLatestPublishedProtocol(patientId);
      res.json({
        hasPortalAccount: !!portalAccount,
        hasPassword: !!(portalAccount?.passwordHash),
        email: portalAccount?.email || patient.email || null,
        lastProtocolPublished: latestProtocol?.publishedAt || null,
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
      const clinicianId = (req.user as any).id;
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
      const clinicianId = (req.user as any).id;
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
      const clinicianId = (req.user as any).id;
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
      const userId = (req.user as any).id;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        messagingPreference: user.messagingPreference,
        messagingPhone: user.messagingPhone,
        externalMessagingProvider: user.externalMessagingProvider,
        externalMessagingApiKeySet: !!(user.externalMessagingApiKey),
        externalMessagingChannelId: user.externalMessagingChannelId,
        externalMessagingWebhookSecret: user.externalMessagingWebhookSecret,
        webhookUrl: `${req.protocol}://${req.get('host')}/api/webhooks/messaging/${userId}`,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messaging settings" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
