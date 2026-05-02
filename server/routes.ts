import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import multer from "multer";
import OpenAI from "openai";
import { z } from "zod";
import { interpretLabsRequestSchema, femaleLabValuesSchema, type InterpretationResult, type LabValues, type FemaleLabValues, type InsertLabResult, insertSavedInterpretationSchema, insertPatientSchema, clinicMemberships, providers as providersTable, clinics, users as usersTable, clinicProviderInvites, patientFormAssignments, clinicalEncounters, patients as patientsTable, insertAppointmentTypeSchema, insertProviderAvailabilitySchema, insertCalendarBlockSchema, insertPatientVitalSchema, insertVitalsMonitoringEpisodeSchema, PATIENT_DOCUMENT_CATEGORIES, type PatientDocumentCategory, chartReviewCollaborators, chartReviewAgreements, type InsertNoteTemplate } from "@shared/schema";
import { eq, and, sql, desc, isNull, or } from "drizzle-orm";
import { ClinicalLogicEngine } from "./clinical-logic";
import { FemaleClinicalLogicEngine } from "./clinical-logic-female";
import { AIService } from "./ai-service";
import {
  buildVitalInterpretations,
  buildVitalRedFlags,
} from "./vital-signs-analyzer";
import { PDFExtractionService } from "./pdf-extraction";
import { ASCVDCalculator } from "./ascvd-calculator";
import { runEnhancedSoapPipeline } from "./soap-pipeline";
import { PREVENTCalculator } from "./prevent-calculator";
import { StopBangCalculator } from "./stopbang-calculator";
import { evaluateSupplements } from "./supplements-female";
import { evaluateMaleSupplements } from "./supplements-male";
import { applyCustomRangesToInterpretations } from "./lab-range-overrides";
import { appendPassthroughInterpretations, orderInterpretationsByPanel } from "./lab-passthrough";
import { evaluateClinicianSupplements, combineSupplementRecommendations } from "./clinician-supplements-engine";
import {
  inferPatientTherapies,
  annotateSupplementsWithContext,
  type TherapyContext,
} from "./therapy-context";
import { PHENOTYPE_KEYS, detectedPhenotypeKeys } from "./phenotype-registry";
import { screenInsulinResistance } from "./insulin-resistance";
import { normalizeTranscript, parseCSV, parseArrayField } from "./medication-normalizer";
import {
  forwardMessageToExternalProvider,
  parseInboundWebhook,
  generateWebhookSecret,
  type ExternalProvider,
} from "./external-messaging";
import { storage, chartReviewStorage, db as storageDb, setupClinicForNewUser, updateClinicSeats, createProviderWithMembership, updateClinicPlanFromStripe } from "./storage";

/**
 * Converts a family-history intake field response into human-readable strings
 * for storage in patientChart.familyHistory (string[]).
 *
 * Two supported shapes:
 *  1. family_history_chart field  → { "Mother": "Diabetes, HTN", "Father": "..." }
 *     Output: ["Mother: Diabetes, HTN", "Father: ..."]
 *
 *  2. matrix field (condition rows × YES checkbox + Notes/Family Member column)
 *     optionsJson: { rows: [{id, label}], columns: [{id, header, fieldType}] }
 *     value:       { rowId: { checkboxColId: true, notesColId: "Mother" } }
 *     Output: ["Cancer- Breast (Mother)", "Diabetes (Father)"]   ← only checked rows
 */
function extractFamilyHistoryEntries(field: any, value: Record<string, any>): string[] {
  const entries: string[] = [];

  const cfg = field.optionsJson;
  const isMatrix =
    field.fieldType === "matrix" &&
    cfg && typeof cfg === "object" && !Array.isArray(cfg) &&
    Array.isArray(cfg.rows) && Array.isArray(cfg.columns);

  if (isMatrix) {
    const rows: Array<{ id: string; label: string }> = cfg.rows;
    const cols: Array<{ id: string; header: string; fieldType: string }> = cfg.columns;
    const yesCol  = cols.find(c => c.fieldType === "checkbox");
    const noteCol = cols.find(c => c.fieldType !== "checkbox");

    for (const row of rows) {
      const cellData = value[row.id];
      if (!cellData || typeof cellData !== "object") continue;
      if (yesCol && !cellData[yesCol.id]) continue;
      const member = noteCol ? String(cellData[noteCol.id] || "").trim() : "";
      entries.push(member ? `${row.label} (${member})` : row.label);
    }
  } else {
    // family_history_chart: { memberName: "conditions text" }
    for (const [member, conditions] of Object.entries(value)) {
      const cond = String(conditions || "").trim();
      if (cond && cond.toLowerCase() !== "none" && cond.toLowerCase() !== "n/a") {
        entries.push(`${member}: ${cond}`);
      }
    }
  }

  return entries;
}
import { getClinicPlanState, getActiveProviderCount, calculateRequiredSeatQuantity, SUITE_BASE_PROVIDER_LIMIT, EXTRA_SEAT_MONTHLY_PRICE } from "./clinic-plan";
import { passport, hashPassword } from "./auth";
import { logAudit } from "./audit";
import { validatePasswordStrength } from "@shared/password-policy";
import { LAB_MARKER_DEFAULTS, SYMPTOM_KEYS, SUPPLEMENT_CATEGORIES, LAB_MARKER_KEYS } from "./lab-marker-defaults";
import { sendInviteEmail, sendPasswordResetEmail, sendPatientPortalInviteEmail, sendProtocolPublishedEmail, sendNewPortalMessageEmail, sendStaffInviteEmail, sendPortalPasswordResetEmail, sendProviderInviteEmail, sendExternalCollaboratorInviteEmail, sendEmail } from "./email-service";
import { findUserForCollaboratorInvite, isValidNpi, listMembershipsForUser, getMembership, isExternalReviewerMembership, listPendingInvitesForAgreement } from "./external-reviewer";
import { buildMedicalTermsList, buildNormalizationRules, buildWhisperPrompt, NORMALIZATION_EXAMPLES } from "./clinical-lexicon";
import Stripe from "stripe";
import bcrypt from "bcrypt";

// ── Auth middleware ────────────────────────────────────────────────────────────

// Returns the effective clinician ID — either the staff member's owning clinician
// or the logged-in clinician's own ID.
function getClinicianId(req: Request): number {
  const sess = req.session as any;
  if (sess.staffClinicianId) return sess.staffClinicianId as number;
  return (req.user as any).id;
}

// Returns the effective clinic ID for patient visibility queries.
// For clinicians: sourced from the user's defaultClinicId (set by setupClinicForNewUser).
// For staff: sourced from staffClinicianClinicId stamped at staff login time.
// Returns null when no clinic is configured (legacy solo accounts without setup).
function getEffectiveClinicId(req: Request): number | null {
  const sess = req.session as any;
  if (sess.staffId) {
    return (sess.staffClinicianClinicId as number | undefined) ?? null;
  }
  // External reviewers (and any clinician with multiple clinic memberships)
  // can swap clinic context via POST /api/me/active-clinic. The override is
  // session-scoped and validated server-side every time it's set.
  if (sess.activeClinicId && Number.isFinite(sess.activeClinicId)) {
    return sess.activeClinicId as number;
  }
  return (req.user as any)?.defaultClinicId ?? null;
}

// ── Lab-eval → vital-trends bridge ──────────────────────────────────────
// When a clinician runs a lab interpretation for a known patient AND has
// supplied systolic blood pressure or BMI in the demographics block, persist
// those values to patient_vitals so they show up in the patient's Vital
// Trends. Fire-and-forget: never blocks the lab-eval response and silently
// no-ops on missing patient/auth/values.
function persistVitalsFromLabEval(
  req: Request,
  patientId: number | undefined,
  demographics: { systolicBP?: number | null; bmi?: number | null } | null | undefined,
): void {
  if (!patientId) return;
  const sess = req.session as any;
  const isAuthed = !!(req.isAuthenticated && req.isAuthenticated()) || !!sess?.staffClinicianId;
  if (!isAuthed) return;

  const sbp = (demographics?.systolicBP ?? null) as number | null;
  const bmi = (demographics?.bmi ?? null) as number | null;
  // Nothing to record — skip the database round trip.
  if ((sbp === null || !Number.isFinite(sbp)) && (bmi === null || !Number.isFinite(bmi))) return;

  let clinicianId: number;
  try {
    clinicianId = getClinicianId(req);
  } catch {
    return;
  }

  // Verify the patient is actually owned by this clinician/clinic before
  // writing — same scoping rule used by the rest of the patient APIs.
  const clinicId = getEffectiveClinicId(req);
  Promise.resolve()
    .then(async () => {
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) {
        console.warn('[lab-eval vitals] skipped persist — patient not in clinician scope', { patientId, clinicianId });
        return;
      }
      await storage.createPatientVital({
        patientId,
        clinicianId,
        systolicBp: sbp !== null && Number.isFinite(sbp) ? Math.round(sbp) : null,
        diastolicBp: null,
        heartRate: null,
        weightLbs: null,
        heightInches: null,
        bmi: bmi !== null && Number.isFinite(bmi) ? bmi : null,
        notes: 'Auto-recorded from lab evaluation',
      } as any);
    })
    .catch((err) => {
      console.warn('[lab-eval vitals] persist failed (non-fatal):', err?.message ?? err);
    });
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

async function getSessionAdminRole(req: Request): Promise<string | null> {
  const sess = req.session as any;
  if (sess.staffId) {
    return sess.staffAdminRole ?? "standard";
  }
  const user = req.user as any;
  if (!user) return null;
  const clinicId = user.defaultClinicId;
  if (!clinicId) return "owner";
  try {
    const [membership] = await storageDb
      .select({ adminRole: clinicMemberships.adminRole })
      .from(clinicMemberships)
      .where(and(eq(clinicMemberships.userId, user.id), eq(clinicMemberships.clinicId, clinicId)))
      .limit(1);
    return membership?.adminRole ?? "owner";
  } catch {
    return "owner";
  }
}

function canEditForms(adminRole: string | null): boolean {
  return adminRole === "owner" || adminRole === "admin" || adminRole === "limited_admin";
}

// Form-builder access: any provider/clinician (non-staff session) OR any staff with admin-level role.
async function canManageForms(req: Request): Promise<boolean> {
  const sess = req.session as any;
  const isStaff = !!sess?.staffId;
  if (!isStaff) return true; // Providers/clinicians always have form-builder access
  const adminRole = await getSessionAdminRole(req);
  return canEditForms(adminRole);
}

async function resolveClinicOwnerSubscription(clinicId: number): Promise<{
  stripeSubscriptionId: string | null;
  freeAccount: boolean;
  stripeCustomerId: string | null;
}> {
  let ownerUserId: number | null = null;

  const ownerMembership = await storageDb
    .select({ userId: clinicMemberships.userId })
    .from(clinicMemberships)
    .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.adminRole, "owner" as any)))
    .limit(1);

  if (ownerMembership.length) {
    ownerUserId = ownerMembership[0].userId;
  } else {
    const [clinicRecord] = await storageDb
      .select({ ownerUserId: clinics.ownerUserId })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1);
    if (clinicRecord?.ownerUserId) {
      ownerUserId = clinicRecord.ownerUserId;
    }
  }

  if (ownerUserId) {
    const [ownerUser] = await storageDb.select().from(usersTable).where(eq(usersTable.id, ownerUserId)).limit(1);
    if (ownerUser) {
      return {
        stripeSubscriptionId: ownerUser.stripeSubscriptionId ?? null,
        freeAccount: ownerUser.freeAccount ?? false,
        stripeCustomerId: ownerUser.stripeCustomerId ?? null,
      };
    }
  }
  return { stripeSubscriptionId: null, freeAccount: false, stripeCustomerId: null };
}

export async function registerRoutes(app: Express): Promise<Server> {

  // ── Auth routes ────────────────────────────────────────────────────────────

  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, username, password, firstName, lastName, title, npi, clinicName, phone, address, paymentMethodId, plan, promoCode } = req.body;
      if (!email || !username || !password || !firstName || !lastName || !title || !clinicName) {
        return res.status(400).json({ message: "All required fields must be provided" });
      }
      if (!paymentMethodId) {
        return res.status(400).json({ message: "Payment method is required to create an account" });
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

      // ── STEP 1: Stripe — create customer, attach PM, create subscription ──
      // Stripe MUST succeed BEFORE the user record is created in the database.
      // This prevents orphaned users with valid credentials but no billing.
      const stripe = getStripe();
      const selectedPlan = plan || "solo";
      const SOLO_PRICE_ID = "price_1TJb7eKbgudErHaMxs1B2BzZ";
      const SUITE_PRICE_ID = process.env.STRIPE_SUITE_PRICE_ID;
      if (selectedPlan === "suite" && !SUITE_PRICE_ID) {
        return res.status(500).json({ message: "Suite plan is not available at this time. Please contact support." });
      }
      const priceId = selectedPlan === "suite" && SUITE_PRICE_ID ? SUITE_PRICE_ID : SOLO_PRICE_ID;

      let customer: any;
      let subscription: any;
      try {
        customer = await stripe.customers.create({
          email,
          name: `${firstName} ${lastName}`,
          metadata: { clinicName },
        });

        await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
        await stripe.customers.update(customer.id, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        let promotionCodeId: string | undefined;
        if (promoCode) {
          if (promoCode.startsWith("promo_")) {
            // Caller provided a Stripe promotion code ID directly
            promotionCodeId = promoCode;
          } else {
            const promoCodes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
            if (promoCodes.data.length > 0) {
              promotionCodeId = promoCodes.data[0].id;
            }
          }
        }

        const subParams: any = {
          customer: customer.id,
          items: [{ price: priceId }],
          trial_period_days: 14,
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent"],
        };
        if (promotionCodeId) {
          subParams.discounts = [{ promotion_code: promotionCodeId }];
        }
        subscription = await stripe.subscriptions.create(subParams);
      } catch (stripeErr: any) {
        console.error("[Register] Stripe setup failed (no user created):", stripeErr);
        if (customer?.id) {
          try { await stripe.customers.del(customer.id); } catch (_) {}
        }
        return res.status(500).json({
          message: "Payment setup failed. Your card was not charged. Please try again.",
          billingError: stripeErr.message,
        });
      }

      // ── STEP 2: Stripe succeeded — now create the user with billing data ──
      const passwordHash = await hashPassword(password);
      // Log subscription shape for diagnostics (safe to remove once confirmed stable)
      console.log("[Register] Stripe subscription fields:", JSON.stringify({
        id: subscription.id,
        status: subscription.status,
        current_period_end: (subscription as any).current_period_end,
        trial_end: (subscription as any).trial_end,
        trial_start: (subscription as any).trial_start,
      }));
      const periodEnd = subPeriodEnd(subscription);
      let user: any;
      try {
        user = await storage.createUser({
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
          stripeCustomerId: customer.id,
          stripeSubscriptionId: subscription.id,
          stripeCurrentPeriodEnd: periodEnd,
          stripeCancelAtPeriodEnd: false,
          subscriptionStatus: subscription.status === "trialing" ? "trial" : subscription.status,
        });
      } catch (dbErr: any) {
        console.error("[Register] DB user creation failed after Stripe succeeded — rolling back Stripe:", dbErr);
        try { await stripe.subscriptions.cancel(subscription.id); } catch (_) {}
        try { await stripe.customers.del(customer.id); } catch (_) {}
        return res.status(500).json({ message: "Account creation failed. No charges were made. Please try again." });
      }

      // Update Stripe customer metadata with the new user ID
      try {
        await stripe.customers.update(customer.id, {
          metadata: { userId: String(user.id), clinicName: user.clinicName },
        });
      } catch (metaErr) {
        console.error("[Register] Stripe metadata update failed (non-blocking):", metaErr);
      }

      // Bootstrap multi-clinic structure for every new signup.
      try {
        await setupClinicForNewUser(user);
      } catch (clinicErr) {
        console.error("setupClinicForNewUser failed for user", user.id, clinicErr);
      }

      // Stamp suite plan on clinic if applicable
      if (selectedPlan === "suite" && SUITE_PRICE_ID) {
        try {
          const [clinic] = await storageDb
            .select()
            .from(clinics)
            .where(eq(clinics.ownerUserId, user.id))
            .limit(1);
          if (clinic) {
            await storageDb
              .update(clinics)
              .set({
                subscriptionPlan: "suite",
                maxProviders: 10,
                baseProviderLimit: 3,
              })
              .where(eq(clinics.id, clinic.id));
          }
        } catch (clinicPlanErr) {
          console.error("Suite clinic plan update failed:", clinicPlanErr);
        }
      }

      req.login(user, (err: any) => {
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
        return req.login(user, async (loginErr) => {
          if (loginErr) return next(loginErr);
          logAudit(req, { action: "LOGIN", clinicianId: user.id });
          const { passwordHash: _ph, externalMessagingApiKey, ...safeUser } = user;
          let membershipInfo: { clinicalRole?: string; adminRole?: string } = {};
          if (safeUser.defaultClinicId) {
            try {
              const membershipRows = await storageDb.execute(
                sql`SELECT role, admin_role, clinical_role FROM clinic_memberships WHERE user_id = ${safeUser.id} AND clinic_id = ${safeUser.defaultClinicId} LIMIT 1`
              );
              const row = (membershipRows as any)?.rows?.[0];
              if (row) {
                membershipInfo = {
                  adminRole: row.admin_role || "standard",
                  clinicalRole: row.clinical_role || row.role || "provider",
                };
              }
            } catch (e) { console.error("[AUTH login] membership lookup:", e); }
          }
          res.json({ ...safeUser, externalMessagingApiKeySet: !!(externalMessagingApiKey), ...membershipInfo });
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
            sess.staffAdminRole = staff.adminRole ?? "standard";
            sess.staffClinicalRole = staff.role ?? "staff";
            // Stamp the owning clinician's clinic so getEffectiveClinicId works for staff
            try {
              const clinician = await storage.getUserById(staff.clinicianId);
              sess.staffClinicianClinicId = clinician?.defaultClinicId ?? null;
            } catch { sess.staffClinicianClinicId = null; }
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
  // Temporary debug endpoint — remove after troubleshooting
  app.get("/api/debug/session-info", requireAuth, async (req, res) => {
    const user = req.user as any;
    const clinicianId = getClinicianId(req);
    const clinicId = getEffectiveClinicId(req);
    const patientCount = await storage.getPatientCountByUser(clinicianId);
    const allUsersCount = (await storage.getAllUsers()).length;
    res.json({
      sessionUserId: user?.id,
      email: user?.email,
      username: user?.username,
      role: user?.role,
      freeAccount: user?.freeAccount,
      subscriptionStatus: user?.subscriptionStatus,
      defaultClinicId: user?.defaultClinicId,
      clinicianIdUsedForQueries: clinicianId,
      patientCountForThisUser: patientCount,
      totalUsersInSystem: allUsersCount,
    });
  });

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
          adminRole: (staff as any).adminRole ?? "standard",
          clinicalRole: (staff as any).role ?? "staff",
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
    // Resolve the *active* clinic — for external reviewers, this may be a
    // session-scoped override set via POST /api/me/active-clinic.
    const activeClinicId = getEffectiveClinicId(req) ?? safeUser.defaultClinicId ?? null;
    let membershipInfo: {
      clinicalRole?: string;
      adminRole?: string;
      accessScope?: string;
      activeClinicId?: number | null;
    } = { activeClinicId };
    if (activeClinicId) {
      try {
        const membershipRows = await storageDb.execute(
          sql`SELECT role, admin_role, clinical_role, access_scope FROM clinic_memberships WHERE user_id = ${safeUser.id} AND clinic_id = ${activeClinicId} LIMIT 1`
        );
        const row = (membershipRows as any)?.rows?.[0];
        if (row) {
          membershipInfo = {
            ...membershipInfo,
            adminRole: row.admin_role || "standard",
            clinicalRole: row.clinical_role || row.role || "provider",
            accessScope: row.access_scope || "full",
          };
        }
        console.log(`[AUTH /api/auth/me] userId=${safeUser.id} activeClinicId=${activeClinicId} membership:`, JSON.stringify(membershipInfo));
      } catch (membershipErr) {
        console.error("[AUTH /api/auth/me] Membership lookup failed:", membershipErr);
      }
    }
    res.json({ ...safeUser, externalMessagingApiKeySet: !!(externalMessagingApiKey), ...membershipInfo });
  });

  // ── Multi-clinic membership endpoints ───────────────────────────────────
  // External reviewers (and any clinician with multiple memberships) get a
  // clinic switcher. These two endpoints back the switcher.
  app.get("/api/me/memberships", requireAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      // Staff sessions are pinned to a single clinic and don't need the switcher.
      if (sess.staffId) {
        return res.json({ memberships: [], activeClinicId: (sess.staffClinicianClinicId as number | undefined) ?? null });
      }
      const user = req.user as any;
      if (!user?.id) return res.status(401).json({ message: "Not authenticated" });
      const memberships = await listMembershipsForUser(user.id);
      const activeClinicId = getEffectiveClinicId(req);
      // De-dupe by clinicId in case a user erroneously has more than one
      // membership row in the same clinic. We prefer the row with broader
      // access (full > chart_review_only).
      const byClinic = new Map<number, any>();
      for (const m of memberships) {
        const existing = byClinic.get(m.clinicId);
        if (!existing) {
          byClinic.set(m.clinicId, m);
        } else if (m.accessScope === "full" && existing.accessScope !== "full") {
          byClinic.set(m.clinicId, m);
        }
      }
      res.json({
        memberships: Array.from(byClinic.values()).map(m => ({
          clinicId: m.clinicId,
          clinicName: m.clinicName,
          clinicalRole: m.clinicalRole,
          adminRole: m.adminRole,
          accessScope: m.accessScope,
          acceptanceStatus: m.acceptanceStatus ?? "active",
          isActive: m.isActive ?? true,
          isExternalReviewer: m.clinicalRole === "external_reviewer",
        })),
        activeClinicId,
      });
    } catch (err) {
      console.error("[/api/me/memberships]", err);
      res.status(500).json({ message: "Failed to load memberships" });
    }
  });

  // POST /api/me/active-clinic { clinicId }
  // Server-side validates the user actually has an active membership in the
  // requested clinic before stamping the session. The deny-list middleware
  // re-resolves on the next request.
  app.post("/api/me/active-clinic", requireAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      if (sess.staffId) {
        return res.status(403).json({ message: "Staff sessions cannot switch clinics." });
      }
      const user = req.user as any;
      const requestedClinicId = parseInt(String(req.body?.clinicId));
      if (!user?.id || !Number.isFinite(requestedClinicId)) {
        return res.status(400).json({ message: "clinicId is required" });
      }
      const m = await getMembership(user.id, requestedClinicId);
      if (!m || !m.isActive) {
        return res.status(403).json({ message: "You don't have an active membership in that clinic." });
      }
      const previousClinicId = sess.activeClinicId ?? null;
      sess.activeClinicId = requestedClinicId;
      // Audit cross-clinic switches by external reviewers (HIPAA traceability).
      if (isExternalReviewerMembership(m as any)) {
        logAudit(req, {
          action: "EXTERNAL_REVIEWER_SWITCH_CLINIC",
          resourceType: "clinic",
          resourceId: requestedClinicId,
          details: { previousClinicId },
        });
      }
      res.json({
        ok: true,
        activeClinicId: requestedClinicId,
        accessScope: m.accessScope,
        clinicalRole: m.clinicalRole,
      });
    } catch (err) {
      console.error("[/api/me/active-clinic]", err);
      res.status(500).json({ message: "Failed to switch clinic" });
    }
  });

  // POST /api/me/upgrade-to-full
  // The clinic owner/admin upgrades an external_reviewer to a full provider
  // membership in their clinic. Consumes a Stripe seat (subject to existing
  // seat-confirmation flow) and creates a providers row. The user keeps their
  // existing memberships in OTHER clinics untouched.
  app.post("/api/clinic/upgrade-collaborator", requireClinicianOnly, async (req, res) => {
    try {
      // Use the *active* clinic context (set via /api/me/active-clinic), not
      // the inviter's defaultClinicId. Admins with memberships in multiple
      // clinics need the upgrade to land on the clinic they're currently
      // operating in.
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No active clinic" });
      const adminRole = await getSessionAdminRole(req);
      if (adminRole !== "owner" && adminRole !== "admin") {
        return res.status(403).json({ message: "Only clinic owners or admins can upgrade collaborators." });
      }
      const targetUserId = parseInt(String(req.body?.userId));
      const confirmExtraSeat = !!req.body?.confirmExtraSeat;
      if (!Number.isFinite(targetUserId)) {
        return res.status(400).json({ message: "userId is required" });
      }
      const m = await getMembership(targetUserId, clinicId);
      if (!m) return res.status(404).json({ message: "User is not a member of this clinic" });
      if (m.clinicalRole !== "external_reviewer") {
        return res.status(409).json({ message: "Only external reviewers can be upgraded to full provider via this endpoint." });
      }

      // Re-use the same seat-availability logic as the regular invite flow.
      const ownerSub = await resolveClinicOwnerSubscription(clinicId);
      const planState = await getClinicPlanState(clinicId, ownerSub.freeAccount, ownerSub.stripeSubscriptionId);
      if (planState.isSoloPlan) {
        return res.status(403).json({ message: "Solo plan supports only 1 provider. Upgrade to ClinIQ Suite first." });
      }
      const requiresPaidSeat =
        !planState.isFreeAccount && planState.isSuitePlan && planState.activeProviderCount >= planState.maxProviders;

      if (requiresPaidSeat) {
        if (!confirmExtraSeat) {
          return res.status(402).json({
            requiresSeatConfirmation: true,
            seatPrice: EXTRA_SEAT_MONTHLY_PRICE,
            currentProviders: planState.activeProviderCount,
            maxIncluded: planState.baseProviderLimit,
            message: `Upgrading this collaborator will add $${EXTRA_SEAT_MONTHLY_PRICE}/month to your subscription. Please confirm to proceed.`,
          });
        }
        const SUITE_SEAT_PRICE_ID = process.env.STRIPE_PROVIDER_SEAT_PRICE_ID;
        if (!SUITE_SEAT_PRICE_ID || !ownerSub.stripeSubscriptionId) {
          return res.status(503).json({ message: "Provider seat billing is not configured. Contact support." });
        }
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(ownerSub.stripeSubscriptionId, { expand: ["items"] });
        const items: any[] = (subscription as any).items?.data ?? [];
        const seatItem = items.find((item: any) => item.price?.id === SUITE_SEAT_PRICE_ID);
        if (seatItem) {
          await stripe.subscriptionItems.update(seatItem.id, { quantity: (seatItem.quantity ?? 0) + 1 });
        } else {
          await stripe.subscriptionItems.create({ subscription: ownerSub.stripeSubscriptionId, price: SUITE_SEAT_PRICE_ID, quantity: 1 });
        }
        await updateClinicSeats(clinicId, (planState.extraProviderSeats ?? 0) + 1);
      }

      // Promote membership: provider + full scope. Keep adminRole as standard
      // unless the caller explicitly asked for something else (out of scope here).
      await storageDb.update(clinicMemberships).set({
        clinicalRole: "provider",
        accessScope: "full",
        acceptanceStatus: "active",
        updatedAt: new Date(),
      }).where(eq(clinicMemberships.id, m.membershipId));

      // Backfill the providers-table row that the chart_review_only path skipped.
      try {
        const [u] = await storageDb.select().from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
        if (u) {
          await storageDb.insert(providersTable).values({
            clinicId,
            userId: targetUserId,
            displayName: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
            npi: u.npi ?? null,
          } as any);
        }
      } catch (e: any) {
        // unique-violation if a row was somehow already present is non-fatal.
        if (!String(e?.message ?? "").includes("duplicate")) {
          console.warn("[upgrade-collaborator] providers insert non-fatal:", e?.message);
        }
      }
      res.json({ ok: true, billingUpdated: requiresPaidSeat });
    } catch (err: any) {
      console.error("[upgrade-collaborator]", err);
      res.status(500).json({ message: err?.message ?? "Failed to upgrade collaborator" });
    }
  });

  // Update profile (clinicians only — staff cannot change clinic settings)
  app.patch("/api/auth/profile", requireClinicianOnly, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const defaultClinicId = (req.user as any).defaultClinicId;

      let isOwnerOrAdmin = !defaultClinicId;
      if (defaultClinicId) {
        const [membership] = await storageDb
          .select({ adminRole: clinicMemberships.adminRole })
          .from(clinicMemberships)
          .where(and(eq(clinicMemberships.userId, userId), eq(clinicMemberships.clinicId, defaultClinicId)))
          .limit(1);
        if (membership && (membership.adminRole === "owner" || membership.adminRole === "admin")) {
          isOwnerOrAdmin = true;
        }
      }

      const {
        firstName, lastName, title, npi, clinicName, phone, address, email,
        messagingPreference, messagingPhone,
        externalMessagingProvider, externalMessagingApiKey, externalMessagingChannelId,
        clinicLogo, signatureImage,
      } = req.body;

      if (!isOwnerOrAdmin) {
        if (clinicName !== undefined || phone !== undefined || address !== undefined ||
            messagingPreference !== undefined || messagingPhone !== undefined ||
            externalMessagingProvider !== undefined || externalMessagingApiKey !== undefined ||
            externalMessagingChannelId !== undefined || clinicLogo !== undefined) {
          return res.status(403).json({ message: "Only clinic owners and admins can modify clinic-wide settings." });
        }
      }

      // Prevent email change to an email already used by another account
      if (email !== undefined && email) {
        const existingUser = await storage.getUserByEmail(email.trim().toLowerCase());
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ message: "That email address is already associated with another account. Please use a different email." });
        }
      }

      // Validate base64 image sizes (max 2MB each)
      if (clinicLogo !== undefined && typeof clinicLogo === 'string' && clinicLogo.length > 2_800_000) {
        return res.status(400).json({ message: "Clinic logo file is too large (max 2MB)" });
      }
      if (signatureImage !== undefined && typeof signatureImage === 'string' && signatureImage.length > 2_800_000) {
        return res.status(400).json({ message: "Signature image file is too large (max 2MB)" });
      }

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
        ...(clinicLogo !== undefined ? { clinicLogo: clinicLogo || null } : {}),
        ...(signatureImage !== undefined ? { signatureImage: signatureImage || null } : {}),
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

      const normalizedEmail = email.trim().toLowerCase();
      const user = await storage.getUserByEmail(normalizedEmail);
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      if (user) {
        await storage.savePasswordResetToken(user.id, token, expires);
        try {
          await sendPasswordResetEmail(user.email, user.firstName, token, req);
        } catch (emailErr) {
          console.error("[EMAIL] Failed to send password reset email:", emailErr);
        }
      } else {
        // Try staff (nurses/MAs/etc. live in a separate table)
        const staff = await storage.getClinicianStaffByEmail(normalizedEmail);
        if (staff) {
          await storage.saveStaffPasswordResetToken(staff.id, token, expires);
          try {
            await sendPasswordResetEmail(staff.email, staff.firstName, token, req);
          } catch (emailErr) {
            console.error("[EMAIL] Failed to send staff password reset email:", emailErr);
          }
        }
      }

      // Always return 200 to avoid email enumeration
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
      if (user && user.passwordResetExpires) {
        if (new Date() > user.passwordResetExpires) {
          return res.status(400).json({ valid: false, message: "This link has expired" });
        }
        return res.json({ valid: true, email: user.email, firstName: user.firstName });
      }
      const staff = await storage.getStaffByResetToken(token);
      if (staff && staff.passwordResetExpires) {
        if (new Date() > staff.passwordResetExpires) {
          return res.status(400).json({ valid: false, message: "This link has expired" });
        }
        return res.json({ valid: true, email: staff.email, firstName: staff.firstName });
      }
      return res.status(400).json({ valid: false, message: "Invalid or expired link" });
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

      const passwordHash = await hashPassword(password);
      const user = await storage.getUserByResetToken(token);
      if (user && user.passwordResetExpires) {
        if (new Date() > user.passwordResetExpires) {
          return res.status(400).json({ message: "This link has expired. Please request a new one." });
        }
        await storage.updatePassword(user.id, passwordHash);
        return res.json({ message: "Password updated successfully. You can now log in." });
      }
      const staff = await storage.getStaffByResetToken(token);
      if (staff && staff.passwordResetExpires) {
        if (new Date() > staff.passwordResetExpires) {
          return res.status(400).json({ message: "This link has expired. Please request a new one." });
        }
        await storage.updateStaffPassword(staff.id, passwordHash);
        return res.json({ message: "Password updated successfully. You can now log in." });
      }
      return res.status(400).json({ message: "Invalid or expired link" });
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
      let therapyContext: TherapyContext | null = null;
      if (patientId) {
        const priorLabs = await storage.getLabResultsByPatient(patientId);
        if (priorLabs.length > 0) {
          trendContext = AIService.buildTrendContext(labs, priorLabs.map(l => ({ labDate: l.labDate, labValues: l.labValues as LabValues })));
          console.log('[API] Trend context built from', priorLabs.length, 'prior labs');
        }
        // Therapy context — what's already on the patient's chart? Used to
        // rewrite recommendations as adherence/dose-optimization rather than
        // duplicate initiation. Wrapped in try/catch so an unauthenticated
        // call still works exactly as before.
        try {
          if ((req as any).user || (req.session as any).staffClinicianId) {
            const cid = getClinicianId(req);
            const chart = await storage.getPatientChart(patientId, cid);
            if (chart && Array.isArray(chart.currentMedications) && chart.currentMedications.length > 0) {
              therapyContext = inferPatientTherapies(chart.currentMedications);
              console.log('[API] Male therapy context: classes=', Array.from(therapyContext.classes.keys()).join(','));
            }
          }
        } catch (e) {
          console.warn('[API] Male therapy context lookup failed (continuing without):', e);
        }
      }

      // Load this clinician's customizations (lab range overrides + custom supplement
      // library + supplement-mode toggle). Per-marker overrides apply only to markers
      // the clinician has explicitly customized — defaults remain for everything else.
      // Wrapped in try/catch so an unauthenticated request still works exactly as before.
      let clinicianCustom: {
        clinicianId: number;
        labPrefs: any[];
        customSupps: any[];
        customRules: any[];
        supplementMode: string;
      } | null = null;
      try {
        if ((req as any).user || (req.session as any).staffClinicianId) {
          const cid = getClinicianId(req);
          const [labPrefs, customSupps, customRules, settings] = await Promise.all([
            storage.getClinicianLabPreferences(cid),
            storage.getClinicianSupplements(cid),
            storage.getAllClinicianSupplementRules(cid),
            storage.getClinicianSupplementSettings(cid),
          ]);
          clinicianCustom = {
            clinicianId: cid,
            labPrefs,
            customSupps,
            customRules,
            supplementMode: (settings as any)?.supplementMode || 'defaults_plus_custom',
          };
        }
      } catch (e) {
        console.warn('[API] Clinician customization lookup failed (continuing with defaults):', e);
      }

      // Step 1: Detect red flags
      const redFlags = [
        ...ClinicalLogicEngine.detectRedFlags(labs),
        // Vitals-based red flags (hypertensive crisis, severe obesity).
        // Only fires when the corresponding demographic field is provided.
        ...buildVitalRedFlags(labs.demographics),
      ];

      // Step 2: Generate detailed interpretations
      let interpretations = ClinicalLogicEngine.interpretLabValues(labs);

      // Step 2b: Apply per-marker clinician range overrides (no-op if none configured)
      if (clinicianCustom?.labPrefs?.length) {
        interpretations = applyCustomRangesToInterpretations(interpretations, clinicianCustom.labPrefs, 'male');
      }

      // Step 2c: Append vital-sign interpretations (BP, BMI) so they show up in
      // the same color-coded results table as the lab markers. No-op if
      // demographics block is missing those fields.
      interpretations = [...interpretations, ...buildVitalInterpretations(labs.demographics)];

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

      // Step 6: Determine recheck window (does not depend on AI output)
      const recheckWindow = ClinicalLogicEngine.determineRecheckWindow(
        redFlags,
        interpretations
      );

      // Step 7: Evaluate supplement recommendations
      // Defaults always run so screening logic remains unchanged. Then we layer in
      // (or fully replace with) the clinician's custom library based on their
      // supplementMode setting.
      const defaultSupplements = evaluateMaleSupplements(labs);

      // Step 8: Insulin Resistance Screening (must run before custom-supplement
      // evaluation so phenotype-keyed rules can fire on the IR phenotype)
      const insulinResistance = screenInsulinResistance(labs, 'male') || undefined;

      // Build the set of detected phenotype / risk-score keys from outputs
      // already produced above (IR screen, PREVENT, STOP-BANG). Defaults stay
      // unchanged — we only read these for matching custom rules.
      const malePhenotypeKeys = detectedPhenotypeKeys({
        irScreening: insulinResistance,
        preventRisk,
        stopBangRisk,
      });

      let supplements = defaultSupplements;
      if (clinicianCustom) {
        const customMatches = evaluateClinicianSupplements({
          labs,
          supplements: clinicianCustom.customSupps,
          rules: clinicianCustom.customRules,
          gender: 'male',
          phenotypes: malePhenotypeKeys,
        });
        supplements = combineSupplementRecommendations(defaultSupplements, customMatches, clinicianCustom.supplementMode);
        console.log(`[API] Male supplement mode: ${clinicianCustom.supplementMode}; defaults=${defaultSupplements.length}, custom=${customMatches.length}, final=${supplements.length}, phenotypes=[${Array.from(malePhenotypeKeys).join(',')}]`);
      } else {
        console.log('[API] Male supplement recommendations:', supplements.length);
      }

      // Context-aware annotation: if the patient is already on a therapy in
      // the same class as a recommended supplement, mark it [Already on …]
      // and rewrite the rationale to focus on adherence + dose optimization.
      supplements = annotateSupplementsWithContext(supplements, therapyContext);

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

      // Step 8b: Surface every extracted lab value — even those without a
      // hard-coded protocol — so the report behaves like a real EHR. Honors
      // clinician range overrides, then sorts the full array into EHR panel
      // order. All previously emitted entries are preserved exactly as-is.
      // Runs BEFORE the AI recommendation/patient-summary calls so those
      // narratives ingest the fully enriched array.
      interpretations = appendPassthroughInterpretations(
        labs as unknown as Record<string, unknown>,
        interpretations,
        'male',
        clinicianCustom?.labPrefs ?? [],
      );
      interpretations = orderInterpretationsByPanel(interpretations);

      // Steps 4 & 5: Generate AI recommendations and patient summary in parallel
      // (deferred until here so the AI sees the fully enriched, ordered array
      // — including IR Screening and any passthrough markers).
      const [aiRecommendations, patientSummary] = await Promise.all([
        AIService.generateRecommendations(labs, redFlags, interpretations, 'male', trendContext || undefined, therapyContext),
        AIService.generatePatientSummary(labs, interpretations, redFlags.length > 0, preventRisk, 'male', therapyContext),
      ]);

      // Step 9: Generate SOAP note
      const soapNote = await AIService.generateSOAPNote(
        labs, redFlags, interpretations, aiRecommendations, recheckWindow,
        'male', preventRisk, supplements, insulinResistance, trendContext || undefined,
        therapyContext,
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

      // Persist BP/BMI to patient_vitals so they appear in the patient's
      // Vital Trends view alongside vitals captured outside lab evaluation.
      // Fire-and-forget; never blocks the response or surfaces errors.
      persistVitalsFromLabEval(req, patientId, labs.demographics);

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
      let therapyContext: TherapyContext | null = null;
      if (patientId) {
        const priorLabs = await storage.getLabResultsByPatient(patientId);
        if (priorLabs.length > 0) {
          trendContext = AIService.buildTrendContext(labs, priorLabs.map(l => ({ labDate: l.labDate, labValues: l.labValues as FemaleLabValues })));
          console.log('[API] Female trend context built from', priorLabs.length, 'prior labs');
        }
        try {
          if ((req as any).user || (req.session as any).staffClinicianId) {
            const cid = getClinicianId(req);
            const chart = await storage.getPatientChart(patientId, cid);
            if (chart && Array.isArray(chart.currentMedications) && chart.currentMedications.length > 0) {
              therapyContext = inferPatientTherapies(chart.currentMedications);
              console.log('[API] Female therapy context: classes=', Array.from(therapyContext.classes.keys()).join(','));
            }
          }
        } catch (e) {
          console.warn('[API] Female therapy context lookup failed (continuing without):', e);
        }
      }

      // Load this clinician's customizations (lab range overrides + custom supplement
      // library + supplement-mode toggle). Wrapped in try/catch to preserve legacy behavior.
      let clinicianCustom: {
        clinicianId: number;
        labPrefs: any[];
        customSupps: any[];
        customRules: any[];
        supplementMode: string;
      } | null = null;
      try {
        if ((req as any).user || (req.session as any).staffClinicianId) {
          const cid = getClinicianId(req);
          const [labPrefs, customSupps, customRules, settings] = await Promise.all([
            storage.getClinicianLabPreferences(cid),
            storage.getClinicianSupplements(cid),
            storage.getAllClinicianSupplementRules(cid),
            storage.getClinicianSupplementSettings(cid),
          ]);
          clinicianCustom = {
            clinicianId: cid,
            labPrefs,
            customSupps,
            customRules,
            supplementMode: (settings as any)?.supplementMode || 'defaults_plus_custom',
          };
        }
      } catch (e) {
        console.warn('[API] Female clinician customization lookup failed (continuing with defaults):', e);
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
      const redFlags = [
        ...FemaleClinicalLogicEngine.detectRedFlags(labs),
        // Vitals-based red flags (hypertensive crisis, severe obesity).
        ...buildVitalRedFlags(labs.demographics),
      ];

      // Step 2: Generate detailed interpretations with female reference ranges
      let interpretations = FemaleClinicalLogicEngine.interpretLabValues(labs);

      // Apply per-marker clinician range overrides (no-op if none configured)
      if (clinicianCustom?.labPrefs?.length) {
        interpretations = applyCustomRangesToInterpretations(interpretations, clinicianCustom.labPrefs, 'female');
      }

      // Append vital-sign interpretations (BP, BMI) after lab markers.
      interpretations = [...interpretations, ...buildVitalInterpretations(labs.demographics)];
      
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

      // Step 7b: Surface every extracted lab value — even those without a
      // hard-coded protocol — so the report behaves like a real EHR. Honors
      // clinician range overrides, then sorts the full array into EHR panel
      // order. All previously emitted entries are preserved exactly as-is.
      interpretations = appendPassthroughInterpretations(
        labs as unknown as Record<string, unknown>,
        interpretations,
        'female',
        clinicianCustom?.labPrefs ?? [],
      );
      interpretations = orderInterpretationsByPanel(interpretations);

      // Step 8: Evaluate supplement recommendations based on lab values, phenotypes, and IR screening
      // The female engine (phenotypes, menstrual phase, IR-driven recommendations) ALWAYS runs
      // unchanged so the screening logic is preserved. Then we layer in (or fully replace with)
      // the clinician's custom supplement library based on their supplementMode setting.
      const supplementResult = evaluateSupplements(labs, insulinResistance);
      const defaultSupplements = supplementResult.recommendations;
      const clinicalPhenotypes = supplementResult.phenotypes;
      const femalePhenotypeKeys = detectedPhenotypeKeys({
        irScreening: insulinResistance,
        clinicalPhenotypes,
        preventRisk,
        stopBangRisk,
      });
      let supplements = defaultSupplements;
      if (clinicianCustom) {
        const customMatches = evaluateClinicianSupplements({
          labs,
          supplements: clinicianCustom.customSupps,
          rules: clinicianCustom.customRules,
          gender: 'female',
          phenotypes: femalePhenotypeKeys,
        });
        supplements = combineSupplementRecommendations(defaultSupplements, customMatches, clinicianCustom.supplementMode);
        console.log(`[API] Female supplement mode: ${clinicianCustom.supplementMode}; defaults=${defaultSupplements.length}, custom=${customMatches.length}, final=${supplements.length}, phenotypes=[${Array.from(femalePhenotypeKeys).join(',')}]`);
      } else {
        console.log('[API] Supplement recommendations:', supplements.length);
      }

      // Context-aware annotation against patient's chart meds
      supplements = annotateSupplementsWithContext(supplements, therapyContext);

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

      // Steps 4 & 5: Generate AI recommendations and patient summary in parallel
      // (deferred until here so the AI sees the fully enriched, ordered array
      // — including IR Screening and any passthrough markers).
      const [aiRecommendations, patientSummary] = await Promise.all([
        AIService.generateRecommendations(labs, redFlags, interpretations, 'female', trendContext || undefined, therapyContext),
        AIService.generatePatientSummary(labs, interpretations, redFlags.length > 0, preventRisk, 'female', therapyContext),
      ]);

      // Step 12: Generate SOAP note
      const soapNote = await AIService.generateSOAPNote(
        labs, redFlags, interpretations, aiRecommendations, recheckWindow,
        'female', preventRisk, supplements, insulinResistance, trendContext || undefined,
        therapyContext,
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

      // Persist BP/BMI to patient_vitals so they appear in the patient's
      // Vital Trends view alongside vitals captured outside lab evaluation.
      persistVitalsFromLabEval(req, patientId, labs.demographics);

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

  // Auto-generate patient-specific dietary guidance for the portal publish dialog.
  // Generates directly from the patient's actual lab values, abnormal/borderline
  // findings, and recommended supplements — NOT from a second-pass extraction of
  // staff-facing recommendations text (which often lacks dietary content and
  // produces generic, identical output across patients).
  app.post("/api/generate-dietary-guidance", requireAuth, async (req, res) => {
    try {
      const { labResultId } = req.body;
      if (!labResultId) return res.status(400).json({ message: "labResultId is required" });

      const labResult = await storage.getLabResult(labResultId);
      if (!labResult) return res.status(404).json({ message: "Lab result not found" });

      // Enforce clinic/clinician ownership before exposing any lab data to the LLM.
      // Prevents cross-clinic IDOR via crafted labResultId.
      let clinicianId: number;
      try {
        clinicianId = getClinicianId(req);
      } catch {
        return res.status(401).json({ message: "Authentication required" });
      }
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(labResult.patientId, clinicianId, clinicId);
      if (!patient) {
        return res.status(404).json({ message: "Lab result not found" });
      }

      const interp = (labResult.interpretationResult as any) || {};
      const interpretations: Array<any> = Array.isArray(interp.interpretations) ? interp.interpretations : [];
      const redFlags: Array<any> = Array.isArray(interp.redFlags) ? interp.redFlags : [];
      const supplements: Array<any> = Array.isArray(interp.supplements) ? interp.supplements : [];
      const labValues: any = labResult.labValues || {};

      if (interpretations.length === 0 && Object.keys(labValues).length === 0) {
        return res.status(422).json({ message: "No lab data available for this lab result" });
      }

      const gender: 'male' | 'female' = patient.gender === 'female' ? 'female' : 'male';

      // Build patient-specific findings sections
      const critical = interpretations.filter((i: any) => i?.status === 'critical');
      const abnormal = interpretations.filter((i: any) => i?.status === 'abnormal');
      const borderline = interpretations.filter((i: any) => i?.status === 'borderline');

      const fmtFinding = (i: any) =>
        `- ${i.category}: ${i.value ?? '?'} ${i.unit ?? ''} (${i.status}) — ${i.interpretation || ''}`.trim();

      // Collect a compact snapshot of key dietarily-relevant lab values that
      // were actually measured. This anchors the AI to the patient's real data.
      const dietRelevantKeys: Array<[string, string, string]> = [
        ['hemoglobin', 'Hemoglobin', 'g/dL'],
        ['ferritin', 'Ferritin', 'ng/mL'],
        ['ironSat', 'Iron Saturation', '%'],
        ['vitaminD', 'Vitamin D', 'ng/mL'],
        ['vitaminB12', 'Vitamin B12', 'pg/mL'],
        ['folate', 'Folate', 'ng/mL'],
        ['magnesium', 'Magnesium', 'mg/dL'],
        ['tsh', 'TSH', 'mIU/L'],
        ['ldl', 'LDL', 'mg/dL'],
        ['hdl', 'HDL', 'mg/dL'],
        ['triglycerides', 'Triglycerides', 'mg/dL'],
        ['totalCholesterol', 'Total Cholesterol', 'mg/dL'],
        ['a1c', 'HbA1c', '%'],
        ['fastingGlucose', 'Fasting Glucose', 'mg/dL'],
        ['fastingInsulin', 'Fasting Insulin', 'uIU/mL'],
        ['hsCRP', 'hs-CRP', 'mg/L'],
        ['homocysteine', 'Homocysteine', 'umol/L'],
        ['uricAcid', 'Uric Acid', 'mg/dL'],
        ['alt', 'ALT', 'U/L'],
        ['ast', 'AST', 'U/L'],
        ['creatinine', 'Creatinine', 'mg/dL'],
        ['testosterone', 'Total Testosterone', 'ng/dL'],
        ['estradiol', 'Estradiol', 'pg/mL'],
        ['progesterone', 'Progesterone', 'ng/mL'],
        ['shbg', 'SHBG', 'nmol/L'],
        ['systolicBP', 'Systolic BP', 'mmHg'],
        ['bmi', 'BMI', 'kg/m²'],
      ];
      const measured = dietRelevantKeys
        .filter(([k]) => labValues[k] !== undefined && labValues[k] !== null && labValues[k] !== '')
        .map(([k, label, unit]) => `- ${label}: ${labValues[k]} ${unit}`);

      const supplementsList = supplements
        .map((s: any) => `- ${s.name} (${s.dose}) — ${s.indication || s.rationale || ''}`.trim())
        .join('\n');

      const redFlagsList = redFlags
        .map((rf: any) => `- ${rf.title || rf.category || ''}: ${rf.value ?? ''} ${rf.unit ?? ''} — ${rf.message || rf.interpretation || ''}`.trim())
        .join('\n');

      const promptSections: string[] = [];
      if (critical.length) promptSections.push(`CRITICAL FINDINGS:\n${critical.map(fmtFinding).join('\n')}`);
      if (abnormal.length) promptSections.push(`ABNORMAL FINDINGS:\n${abnormal.map(fmtFinding).join('\n')}`);
      if (borderline.length) promptSections.push(`BORDERLINE FINDINGS:\n${borderline.map(fmtFinding).join('\n')}`);
      if (redFlagsList) promptSections.push(`RED FLAGS:\n${redFlagsList}`);
      if (measured.length) promptSections.push(`KEY LAB VALUES MEASURED:\n${measured.join('\n')}`);
      if (supplementsList) promptSections.push(`RECOMMENDED SUPPLEMENTS (do NOT repeat as foods, but use as context for nutritional gaps):\n${supplementsList}`);

      // If the patient has no flagged findings AND no measured diet-relevant
      // values, surface that explicitly so the model focuses on prevention
      // anchored to whatever values exist rather than making things up.
      const hasFlagged = critical.length + abnormal.length + borderline.length > 0;
      if (!hasFlagged) {
        promptSections.push(`OVERALL: No abnormal/borderline findings — focus on optimizing the measured values above and prevention specific to this patient's lab snapshot.`);
      }

      const clinicType = gender === 'female' ? "women's hormone and primary care clinic" : "men's hormone and primary care clinic";

      const prompt = `You are a clinical nutritionist at a ${clinicType}. Generate patient-specific dietary guidance based on THIS patient's actual lab results below. Every food you recommend MUST be tied to a specific lab value or finding from this patient's data — never give generic advice.

${promptSections.join('\n\n')}

Format your response EXACTLY like this (use these exact section headers, no markdown bold, no asterisks):

Goal: [One sentence naming the patient's top 1-2 nutritional priorities, citing specific lab values from above, e.g. "Lower your LDL of 165 mg/dL and raise your HDL of 38 mg/dL through a heart-healthy eating pattern."]

Diet: [Recommended dietary pattern in 3-8 words tailored to this patient, e.g. "Mediterranean diet with emphasis on soluble fiber"]

Foods to Emphasize:
[Food name] - ([serving size and frequency, e.g. "3-4 oz, 2-3x/week"]) - [plain-language reason that names a SPECIFIC lab value from above, e.g. "Rich in omega-3s to lower your triglycerides of 220 mg/dL"]
[Food name] - ([serving size and frequency]) - [reason citing specific lab value]
[Food name] - ([serving size and frequency]) - [reason citing specific lab value]
[Food name] - ([serving size and frequency]) - [reason citing specific lab value]
[Food name] - ([serving size and frequency]) - [reason citing specific lab value]

Rules:
- List exactly 5-7 specific foods
- Every food's "reason" MUST reference a specific lab value or finding from the data above (e.g. "to raise your ferritin of 18 ng/mL", "to support your A1c of 5.9%")
- Do NOT recommend foods unrelated to this patient's actual findings
- Write in plain language a patient can understand — no jargon
- Keep each food entry on ONE line only
- Format exactly: Food Name - (serving info) - reason (include the dashes and parens)
- Do NOT include supplement recommendations — foods only
- Do NOT include "Foods to Avoid" or other sections — only the three sections above
- Do NOT use markdown bold or asterisks anywhere`;

      console.log('[Dietary] Generating for lab', labResultId, '— findings:', critical.length, 'crit /', abnormal.length, 'abn /', borderline.length, 'bord, measured values:', measured.length);

      const client = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: `You are a clinical nutritionist generating patient-specific dietary guidance for a ${clinicType}. You always tie every food recommendation to specific lab values from the patient's actual data. Never give generic advice that could apply to any patient.` },
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

  // GET /api/clinician/notifications — unread messages, pending supplement
  // orders, and pending patient-portal medication refill requests. The latter
  // two are surfaced in a single combined dashboard widget
  // ("Medication & Supplement Requests").
  app.get("/api/clinician/notifications", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const [unreadMessages, pendingOrders, pendingRefillRequests] = await Promise.all([
        storage.getUnreadMessageSummaryForClinician(clinicianId),
        storage.getPendingOrdersForClinician(clinicianId),
        storage.getPendingRefillRequestsForClinician(clinicianId, clinicId ?? null),
      ]);
      res.json({ unreadMessages, pendingOrders, pendingRefillRequests });
    } catch (error) {
      console.error("Clinician notifications error:", error);
      res.json({ unreadMessages: [], pendingOrders: [], pendingRefillRequests: [] });
    }
  });

  app.post("/api/patients", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const body = { ...req.body, userId: clinicianId, ...(clinicId ? { clinicId } : {}) };
      if (body.dateOfBirth && typeof body.dateOfBirth === "string") {
        body.dateOfBirth = new Date(body.dateOfBirth);
      }
      const parseResult = insertPatientSchema.safeParse(body);
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
      const clinicId = getEffectiveClinicId(req);
      const q = (req.query.q as string) || '';
      const gender = req.query.gender as string | undefined;
      console.log(`[DEBUG] /api/patients/search — clinicianId=${clinicianId}, clinicId=${clinicId}, q="${q}"`);
      if (!q || q.length < 1) {
        const allPatients = await storage.getAllPatients(clinicianId, clinicId);
        console.log(`[DEBUG] /api/patients/search — returned ${allPatients.length} patients for clinicId=${clinicId ?? 'legacy:'+clinicianId}`);
        return res.json(allPatients);
      }
      const patients = await storage.searchPatients(q, clinicianId, gender, clinicId);
      res.json(patients);
    } catch (error) {
      console.error("Error searching patients:", error);
      res.status(500).json({ error: "Failed to search patients" });
    }
  });

  app.get("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid patient ID" });
      const deleted = await storage.deletePatient(id, clinicianId, clinicId);
      if (!deleted) return res.status(404).json({ error: "Patient not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  app.patch("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid patient ID" });
      const patchSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().optional().nullable(),
        dateOfBirth: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
        primaryProvider: z.string().optional().nullable(),
        preferredPharmacy: z.string().optional().nullable(),
        // Structured pharmacy details from the lookup component. All optional —
        // when present, replace whatever is currently stored. Pass nulls
        // explicitly to clear back to legacy plain-text mode.
        pharmacyName: z.string().trim().max(255).optional().nullable(),
        pharmacyAddress: z.string().trim().max(500).optional().nullable(),
        pharmacyPhone: z.string().trim().max(50).optional().nullable(),
        pharmacyFax: z.string().trim().max(50).optional().nullable(),
        pharmacyNcpdpId: z.string().trim().max(30).optional().nullable(),
        pharmacyPlaceId: z.string().trim().max(200).optional().nullable(),
      });
      const parsedPatch = patchSchema.safeParse(req.body);
      if (!parsedPatch.success) {
        return res.status(400).json({ error: "Invalid input", details: parsedPatch.error.format() });
      }
      const {
        firstName, lastName, email, dateOfBirth, phone, primaryProvider, preferredPharmacy,
        pharmacyName, pharmacyAddress, pharmacyPhone, pharmacyFax, pharmacyNcpdpId, pharmacyPlaceId,
      } = parsedPatch.data;
      const updates: Record<string, unknown> = {};
      if (firstName !== undefined) updates.firstName = (firstName ?? "").trim();
      if (lastName !== undefined) updates.lastName = (lastName ?? "").trim();
      if (email !== undefined) updates.email = (email ?? "").trim().toLowerCase() || null;
      if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
      if (phone !== undefined) updates.phone = (phone ?? "").trim() || null;
      if (primaryProvider !== undefined) {
        const providerName = typeof primaryProvider === "string" ? primaryProvider.trim() : "";
        updates.primaryProvider = providerName || null;
        // Best-effort: also resolve primaryProviderId from the clinic membership matching the display name.
        if (providerName) {
          try {
            const members = await storage.getClinicMembers(clinicId);
            const match = members.find((m: any) => {
              const display = (m?.userName || "").toLowerCase();
              return display === providerName.toLowerCase();
            });
            if (match) updates.primaryProviderId = (match as any).userId ?? null;
          } catch (e) {
            console.warn("[patients PATCH] could not resolve primaryProviderId:", e);
          }
        } else {
          updates.primaryProviderId = null;
        }
      }
      if (preferredPharmacy !== undefined) {
        updates.preferredPharmacy = typeof preferredPharmacy === "string"
          ? (preferredPharmacy.trim() || null)
          : preferredPharmacy ?? null;
      }
      // Structured pharmacy fields. When the caller picked a result from the
      // Google Places lookup it sends pharmacyName + the rest; when the user
      // typed a free-text fallback the caller sends pharmacyName = null to
      // clear any previous structured selection so the legacy text path stays
      // accurate.
      if (pharmacyName !== undefined) updates.pharmacyName = pharmacyName?.trim() || null;
      if (pharmacyAddress !== undefined) updates.pharmacyAddress = pharmacyAddress?.trim() || null;
      if (pharmacyPhone !== undefined) updates.pharmacyPhone = pharmacyPhone?.trim() || null;
      if (pharmacyFax !== undefined) updates.pharmacyFax = pharmacyFax?.trim() || null;
      if (pharmacyNcpdpId !== undefined) updates.pharmacyNcpdpId = pharmacyNcpdpId?.trim() || null;
      if (pharmacyPlaceId !== undefined) updates.pharmacyPlaceId = pharmacyPlaceId?.trim() || null;
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
      const updated = await storage.updatePatient(id, updates as any, clinicianId, clinicId);
      if (!updated) return res.status(404).json({ error: "Patient not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating patient:", error);
      res.status(500).json({ error: "Failed to update patient" });
    }
  });

  app.get("/api/patients/:id/labs", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      const labs = await storage.getLabResultsByPatient(id);
      res.json(labs);
    } catch (error) {
      console.error("Error getting patient labs:", error);
      res.status(500).json({ error: "Failed to get patient labs" });
    }
  });

  // ── Pharmacy lookup proxy (Google Places) ────────────────────────────────
  // Used by the PharmacyLookup component on both the clinician edit dialog
  // and the patient portal Account page. Accepts either a clinician/staff
  // session OR a portal patient session — the API key never leaves the server.
  app.get("/api/pharmacy-lookup", async (req, res) => {
    const sess = req.session as any;
    const clinicianAuthed = !!(req.isAuthenticated && req.isAuthenticated()) || !!sess?.staffClinicianId;
    const portalAuthed = !!sess?.portalPatientId;
    if (!clinicianAuthed && !portalAuthed) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      // Surface a clear, distinguishable error so the UI can degrade to plain
      // text entry without confusing the user.
      return res.status(503).json({
        error: "pharmacy_lookup_unavailable",
        message: "Pharmacy lookup is not configured. You can still type the pharmacy name and save it as plain text.",
      });
    }

    const querySchema = z.object({
      q: z.string().trim().min(2).max(120),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      // Too short / missing — return empty list rather than an error so the UI
      // can show "keep typing…" without flashing an error.
      return res.json({ results: [] });
    }
    const query = parsed.data.q;

    try {
      // Use the legacy Places Text Search API — works with standard Places
      // API keys without requiring "Places API (New)" to be enabled. It does
      // NOT return phone numbers, so we follow up with a parallel Place
      // Details fetch per result to populate phone.
      const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
      searchUrl.searchParams.set("query", `${query} pharmacy`);
      searchUrl.searchParams.set("type", "pharmacy");
      searchUrl.searchParams.set("key", apiKey);

      const upstream = await fetch(searchUrl.toString());
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        console.error("[pharmacy-lookup] Google Places HTTP error:", upstream.status, text);
        return res.status(502).json({
          error: "pharmacy_lookup_failed",
          message: "Pharmacy lookup is temporarily unavailable. You can type a pharmacy name to save it as plain text.",
        });
      }

      const data = await upstream.json() as { status?: string; results?: Array<any>; error_message?: string };
      // Treat ZERO_RESULTS as a successful empty list — anything else non-OK is an error.
      if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("[pharmacy-lookup] Google Places status:", data.status, data.error_message);
        return res.status(502).json({
          error: "pharmacy_lookup_failed",
          message: "Pharmacy lookup is temporarily unavailable. You can type a pharmacy name to save it as plain text.",
        });
      }

      const places = Array.isArray(data.results) ? data.results.slice(0, 8) : [];
      // Fetch phone numbers in parallel via Place Details. Failures per-place
      // degrade silently to phone=null so the dropdown still renders.
      const detailsPromises = places.map(async (p: any) => {
        if (!p?.place_id) return null;
        try {
          const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
          detailsUrl.searchParams.set("place_id", p.place_id);
          detailsUrl.searchParams.set("fields", "formatted_phone_number,international_phone_number");
          detailsUrl.searchParams.set("key", apiKey);
          const dRes = await fetch(detailsUrl.toString());
          if (!dRes.ok) return null;
          const dJson = await dRes.json() as { result?: any };
          const r = dJson?.result || {};
          return r.formatted_phone_number || r.international_phone_number || null;
        } catch {
          return null;
        }
      });
      const phones = await Promise.all(detailsPromises);

      const results = places.map((p: any, idx: number) => ({
        placeId: p?.place_id || "",
        name: p?.name || "",
        address: p?.formatted_address || "",
        phone: phones[idx] ?? null,
        // Google Places does not return fax or NCPDP — left null for a future
        // Surescripts/NCPDP backfill.
        fax: null as string | null,
        ncpdpId: null as string | null,
      })).filter((r: any) => r.placeId && r.name);

      res.json({ results });
    } catch (err: any) {
      console.error("[pharmacy-lookup] error:", err?.message ?? err);
      res.status(502).json({
        error: "pharmacy_lookup_failed",
        message: "Pharmacy lookup is temporarily unavailable. You can type a pharmacy name to save it as plain text.",
      });
    }
  });

  // ── Patient Chart endpoints ──────────────────────────────────────────────────

  // GET /api/patients/:id/chart — fetch this patient's EHR chart
  app.get("/api/patients/:id/chart", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const chart = await storage.getPatientChart(patientId, clinicianId);
      res.json(chart ?? null);
    } catch (err) {
      console.error("[Chart] GET error:", err);
      res.status(500).json({ message: "Failed to load patient chart" });
    }
  });

  // PUT /api/patients/:id/chart — save approved chart data
  app.put("/api/patients/:id/chart", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const {
        currentMedications, medicalHistory, familyHistory,
        socialHistory, allergies, surgicalHistory,
        draftExtraction, draftFromEncounterId, lastReviewedAt,
      } = req.body;
      const chart = await storage.upsertPatientChart(patientId, clinicianId, {
        ...(currentMedications !== undefined && { currentMedications }),
        ...(medicalHistory !== undefined && { medicalHistory }),
        ...(familyHistory !== undefined && { familyHistory }),
        ...(socialHistory !== undefined && { socialHistory }),
        ...(allergies !== undefined && { allergies }),
        ...(surgicalHistory !== undefined && { surgicalHistory }),
        ...(draftExtraction !== undefined && { draftExtraction }),
        ...(draftFromEncounterId !== undefined && { draftFromEncounterId }),
        ...(lastReviewedAt !== undefined && { lastReviewedAt: new Date(lastReviewedAt) }),
      });
      res.json(chart);
    } catch (err) {
      console.error("[Chart] PUT error:", err);
      res.status(500).json({ message: "Failed to save patient chart" });
    }
  });

  // POST /api/patients/:id/chart/extract — AI extract chart data from a specific encounter
  app.post("/api/patients/:id/chart/extract", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const { encounterId } = req.body;

      if (!encounterId) return res.status(400).json({ message: "encounterId is required" });

      const encounter = await storage.getEncounter(parseInt(encounterId), clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // Build the richest context available: diarized transcript preferred, raw fallback
      const diarized = encounter.diarizedTranscript as any[] | null;
      const transcriptText = diarized?.length
        ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : (encounter.transcription ?? "");

      const soap = encounter.soapNote as any;
      const soapText = soap?.fullNote ?? [
        soap?.subjective ? `Subjective: ${soap.subjective}` : null,
        soap?.objective ? `Objective: ${soap.objective}` : null,
        soap?.assessment ? `Assessment: ${soap.assessment}` : null,
        soap?.plan ? `Plan: ${soap.plan}` : null,
      ].filter(Boolean).join('\n') ?? "";

      const extraction = encounter.clinicalExtraction as any;
      const extractionSummary = extraction ? [
        extraction.medications_current?.length ? `Medications mentioned: ${extraction.medications_current.join(', ')}` : null,
        extraction.diagnoses_discussed?.length ? `Diagnoses: ${extraction.diagnoses_discussed.join(', ')}` : null,
        extraction.symptoms_reported?.length ? `Symptoms: ${extraction.symptoms_reported.join(', ')}` : null,
        extraction.red_flags?.length ? `Red flags: ${extraction.red_flags.join(', ')}` : null,
      ].filter(Boolean).join('\n') : null;

      if (!transcriptText && !soapText) {
        return res.status(400).json({ message: "This encounter has no transcript or SOAP note to extract from." });
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const systemPrompt = `You are an EHR clinical data extraction specialist. Your job is to extract persistent patient history data from a clinical encounter transcript and SOAP note.

WHAT TO EXTRACT:
1. currentMedications — All medications the patient is currently taking (prescription, OTC, supplements, injections). Include dose and frequency if mentioned. Examples: "Testosterone Cypionate 200mg IM weekly", "Metformin 500mg twice daily", "Fish oil 1g daily"
2. medicalHistory — Diagnosed medical conditions, chronic diseases, and significant past medical events. Examples: "Type 2 diabetes", "Hypertension", "Hypothyroidism", "GERD", "Anxiety"
3. familyHistory — Any family members' health conditions mentioned. Group ALL conditions for the same family member into a SINGLE entry. Format: "Mother — hypertension; hypothyroid; breast cancer" (not separate lines per condition). Format: "Father — heart disease; type 2 diabetes", "Maternal grandmother — ovarian cancer"
4. socialHistory — Lifestyle facts: smoking status, alcohol use, exercise habits, occupation, relationship status, diet. Examples: "Former smoker — quit 2015", "Drinks 1-2 glasses wine/week", "Sedentary job, walks 3x/week"
5. allergies — Drug, food, or environmental allergies. Include reaction type if mentioned. Examples: "Penicillin — anaphylaxis", "Sulfa drugs — rash", "Shellfish — hives"
6. surgicalHistory — Past surgeries, procedures, or hospitalizations. Examples: "Appendectomy 2010", "C-section 2018", "Knee arthroscopy 2022"

CRITICAL SAFETY RULES:
- ONLY extract information EXPLICITLY stated — do not infer or guess
- NEVER create entries based on what "usually" happens or general knowledge
- NEVER duplicate across sections (a medication goes in medications, not medical history)
- Keep each entry concise — one condition/medication/fact per array item
- If a section has nothing explicitly stated, return an empty array
- Do NOT include lab values or test results — those belong in lab interpretation

Return ONLY this JSON structure:
{
  "currentMedications": [],
  "medicalHistory": [],
  "familyHistory": [],
  "socialHistory": [],
  "allergies": [],
  "surgicalHistory": []
}`;

      const userContent = [
        `Visit Type: ${encounter.visitType}`,
        `Chief Complaint: ${encounter.chiefComplaint ?? "Not specified"}`,
        transcriptText ? `\nTRANSCRIPT:\n${transcriptText}` : null,
        soapText ? `\nSOAP NOTE:\n${soapText}` : null,
        extractionSummary ? `\nSTRUCTURED EXTRACTION SUMMARY:\n${extractionSummary}` : null,
      ].filter(Boolean).join('\n');

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      });

      const extracted = JSON.parse(completion.choices[0].message.content || "{}");

      // Merge any duplicate family-member entries into one grouped line
      const rawFamilyHistory: string[] = extracted.familyHistory ?? [];
      const fhMap: Record<string, string[]> = {};
      for (const entry of rawFamilyHistory) {
        const sep = entry.indexOf("—");
        if (sep > -1) {
          const member = entry.slice(0, sep).trim().toLowerCase();
          const conditions = entry.slice(sep + 1).trim();
          if (!fhMap[member]) fhMap[member] = [];
          fhMap[member].push(...conditions.split(";").map((c: string) => c.trim()).filter(Boolean));
        } else {
          const key = "__misc__";
          if (!fhMap[key]) fhMap[key] = [];
          fhMap[key].push(entry);
        }
      }
      const groupedFamilyHistory: string[] = Object.entries(fhMap).flatMap(([member, conds]) => {
        if (member === "__misc__") return conds;
        const label = member.charAt(0).toUpperCase() + member.slice(1);
        const unique = [...new Set(conds)];
        return [`${label} — ${unique.join("; ")}`];
      });

      const draft: import("@shared/schema").PatientChartDraft = {
        currentMedications: extracted.currentMedications ?? [],
        medicalHistory: extracted.medicalHistory ?? [],
        familyHistory: groupedFamilyHistory,
        socialHistory: extracted.socialHistory ?? [],
        allergies: extracted.allergies ?? [],
        surgicalHistory: extracted.surgicalHistory ?? [],
        extractedAt: new Date().toISOString(),
        encounterId: encounter.id,
        encounterDate: new Date(encounter.visitDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        visitType: encounter.visitType,
      };

      // Save draft to chart (does not overwrite approved data)
      await storage.upsertPatientChart(patientId, clinicianId, {
        draftExtraction: draft,
        draftFromEncounterId: encounter.id,
      });

      res.json({ draft });
    } catch (err) {
      console.error("[Chart Extract] Error:", err);
      res.status(500).json({ message: "Failed to extract chart data from encounter." });
    }
  });

  app.post("/api/patients/:id/trend-narrative", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const patient = await storage.getPatient(id, clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
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
      await storage.updatePatient(patientId, {}, clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
          let patient = await storage.getPatientByName(firstName, lastName, clinicianId, clinicId);
          if (!patient) {
            patient = await storage.createPatient({
              userId: clinicianId,
              ...(clinicId ? { clinicId } : {}),
              firstName,
              lastName,
              gender: gender as 'male' | 'female',
            });
          } else if (patient && clinicId && !patient.clinicId) {
            // Backfill clinic_id onto legacy patient found via userId fallback
            await storage.updatePatient(patient.id, { clinicId }, clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
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
      console.log(`[DEBUG] /api/admin/clinicians — requestingUser id=${(req.user as any)?.id}, role=${(req.user as any)?.role}`);
      const users = await storage.getAllUsers();
      console.log(`[DEBUG] /api/admin/clinicians — found ${users.length} users`);
      const withCounts = await Promise.all(
        users.map(async (u) => {
          let patientCount = 0;
          try { patientCount = await storage.getPatientCountByUser(u.id); } catch {}
          return {
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
            freeAccount: u.freeAccount,
            notes: u.notes,
            createdAt: u.createdAt,
            patientCount,
          };
        })
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
      const { email, username, firstName, lastName, title, npi, clinicName, phone, address, subscriptionStatus, freeAccount, notes, clinicPlan, partnerEmail } = req.body;
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
        freeAccount: freeAccount === true,
        notes: notes || null,
      } as any);

      // Set up clinic structure (creates clinic row, membership, provider profile, stamps defaultClinicId)
      const isSuite = clinicPlan === "suite";
      const { clinicId } = await setupClinicForNewUser(user);

      // If Suite plan, upgrade the clinic's plan and seat limit
      if (isSuite) {
        await storageDb
          .update(clinics)
          .set({ subscriptionPlan: "suite", maxProviders: 10, baseProviderLimit: 2 })
          .where(eq(clinics.id, clinicId));
        await storageDb
          .update(usersTable)
          .set({ userType: "clinic_admin" })
          .where(eq(usersTable.id, user.id));
      }

      // If a partner email was provided, link them to this clinic too
      if (partnerEmail) {
        const partner = await storage.getUserByEmail(partnerEmail.trim().toLowerCase());
        if (partner) {
          // Add partner as provider in this clinic
          const existingMembership = await storageDb
            .select()
            .from(clinicMemberships)
            .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, partner.id)));
          if (existingMembership.length === 0) {
            await storageDb.insert(clinicMemberships).values({
              clinicId,
              userId: partner.id,
              role: "provider",
              clinicalRole: "provider",
              adminRole: "admin",
              isActive: true,
              isPrimaryClinic: true,
            });
            // Create provider profile for partner
            await storageDb.insert(providersTable).values({
              clinicId,
              userId: partner.id,
              displayName: [partner.title, partner.firstName, partner.lastName].filter(Boolean).join(" "),
              npi: (partner as any).npi ?? null,
              isActive: true,
            });
            // Stamp clinic onto partner's user row
            await storageDb
              .update(usersTable)
              .set({ defaultClinicId: clinicId, userType: "provider", freeAccount: true, subscriptionStatus: "active" })
              .where(eq(usersTable.id, partner.id));
          }
        }
      }

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
        clinicId,
        clinicPlan: isSuite ? "suite" : "solo",
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
      const { subscriptionStatus, role, notes, freeAccount, firstName, lastName, title, npi, clinicName, phone } = req.body;
      const updated = await storage.updateUserAdmin(id, {
        subscriptionStatus,
        role,
        notes,
        ...(freeAccount !== undefined && { freeAccount: freeAccount === true }),
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(title !== undefined && { title }),
        ...(npi !== undefined && { npi }),
        ...(clinicName !== undefined && { clinicName }),
        ...(phone !== undefined && { phone }),
      });
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

  // GET /api/admin/usage-report — aggregate platform usage & cost analytics
  app.get("/api/admin/usage-report", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const allClinics = await storage.getAllClinicsAdmin();

      const totalProviders = users.length;
      const activeStatuses = ["active", "trialing", "trial"];
      const activeProviders = users.filter(u => activeStatuses.includes(u.subscriptionStatus ?? "")).length;
      const freeProviders = users.filter(u => u.freeAccount && activeStatuses.includes(u.subscriptionStatus ?? "")).length;
      const paidProviders = users.filter(u => !u.freeAccount && activeStatuses.includes(u.subscriptionStatus ?? "")).length;
      const canceledProviders = users.filter(u => u.subscriptionStatus === "canceled").length;
      const trialProviders = users.filter(u => u.subscriptionStatus === "trial" || u.subscriptionStatus === "trialing").length;

      let totalPatients = 0;
      for (const c of allClinics) {
        totalPatients += c.patientCount ?? 0;
      }

      const soloClinicCount = allClinics.filter((c: any) => (c.subscriptionPlan ?? "solo") === "solo").length;
      const suiteClinicCount = allClinics.filter((c: any) => c.subscriptionPlan === "suite").length;

      const billableSolo = allClinics.filter((c: any) => (c.subscriptionPlan ?? "solo") === "solo" && paidProviders > 0).length;
      const billableSuite = allClinics.filter((c: any) => c.subscriptionPlan === "suite").length;
      const totalExtraSeats = allClinics.reduce((sum: number, c: any) => sum + (c.extraProviderSeats ?? 0), 0);

      const SOLO_PRICE = 149;
      const SUITE_PRICE = 249;
      const EXTRA_SEAT_PRICE = 79;
      const estimatedMRR =
        (billableSuite * SUITE_PRICE) +
        ((paidProviders > 0 ? billableSolo : 0) * SOLO_PRICE) +
        (totalExtraSeats * EXTRA_SEAT_PRICE);

      const clinicDetails = allClinics.map((c: any) => ({
        id: c.id,
        name: c.name,
        plan: c.subscriptionPlan ?? "solo",
        memberCount: c.memberCount ?? 0,
        patientCount: c.patientCount ?? 0,
        extraSeats: c.extraProviderSeats ?? 0,
      }));

      res.json({
        totalProviders,
        activeProviders,
        paidProviders,
        freeProviders,
        canceledProviders,
        trialProviders,
        totalPatients,
        soloClinicCount,
        suiteClinicCount,
        totalExtraSeats,
        estimatedMRR,
        clinicDetails,
      });
    } catch (error) {
      console.error("[ADMIN] Error generating usage report:", error);
      res.status(500).json({ message: "Failed to generate usage report" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — Clinic Management
  // Tools for the ReAlign admin to create clinics, assign members, and run
  // patient backfills without direct database access.
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/clinics — list all clinics with member/patient counts
  app.get("/api/admin/clinics", requireAdmin, async (req, res) => {
    try {
      const clinics = await storage.getAllClinicsAdmin();
      res.json(clinics);
    } catch (error) {
      console.error("[ADMIN] Error fetching clinics:", error);
      res.status(500).json({ message: "Failed to fetch clinics" });
    }
  });

  // POST /api/admin/clinics/setup — create a clinic for an existing user + optional backfill
  // Body: { userId, clinicName?, plan?, partnerEmail?, backfillPatients? }
  app.post("/api/admin/clinics/setup", requireAdmin, async (req, res) => {
    try {
      const { userId, clinicName, plan, partnerEmail, backfillPatients } = req.body;
      if (!userId) return res.status(400).json({ message: "userId is required" });

      const user = await storage.getUserById(parseInt(userId));
      if (!user) return res.status(404).json({ message: "User not found" });

      // Check if already has a clinic
      if (user.defaultClinicId) {
        return res.status(409).json({
          message: "User already has a clinic configured",
          existingClinicId: user.defaultClinicId,
        });
      }

      // Create clinic + membership + provider profile
      const overrideName = clinicName?.trim() || user.clinicName || `${user.firstName} ${user.lastName} Practice`;
      (user as any).clinicName = overrideName;
      const { clinicId, providerId } = await setupClinicForNewUser(user);

      // Upgrade plan if requested
      if (plan === "suite") {
        await storageDb
          .update(clinics)
          .set({ subscriptionPlan: "suite", maxProviders: 10, baseProviderLimit: 2 })
          .where(eq(clinics.id, clinicId));
        await storageDb
          .update(usersTable)
          .set({ userType: "clinic_admin" })
          .where(eq(usersTable.id, user.id));
      }

      // Link partner if email provided
      let partnerLinked = false;
      if (partnerEmail) {
        const partner = await storage.getUserByEmail(partnerEmail.trim().toLowerCase());
        if (partner) {
          await storage.addUserToClinic(clinicId, partner.id, "provider");
          await storageDb.insert(providersTable).values({
            clinicId, userId: partner.id,
            displayName: [partner.title, partner.firstName, partner.lastName].filter(Boolean).join(" "),
            npi: (partner as any).npi ?? null,
            isActive: true,
          }).onConflictDoNothing();
          await storageDb
            .update(usersTable)
            .set({ defaultClinicId: clinicId, userType: "provider", freeAccount: true, subscriptionStatus: "active" })
            .where(eq(usersTable.id, partner.id));
          partnerLinked = true;
        }
      }

      // Backfill legacy patients to this clinic
      let patientsMigrated = 0;
      if (backfillPatients !== false) {
        patientsMigrated = await storage.backfillPatientsToClinic(user.id, clinicId);
        if (partnerEmail) {
          const partner = await storage.getUserByEmail(partnerEmail.trim().toLowerCase());
          if (partner) {
            const extra = await storage.backfillPatientsToClinic(partner.id, clinicId);
            patientsMigrated += extra;
          }
        }
      }

      res.status(201).json({
        message: "Clinic created successfully",
        clinicId,
        providerId,
        plan: plan || "solo",
        partnerLinked,
        patientsMigrated,
      });
    } catch (error) {
      console.error("[ADMIN] Error setting up clinic:", error);
      res.status(500).json({ message: "Failed to set up clinic" });
    }
  });

  // POST /api/admin/clinics/:id/backfill — backfill patients for a specific user into a clinic
  // Body: { userId }
  app.post("/api/admin/clinics/:id/backfill", requireAdmin, async (req, res) => {
    try {
      const clinicId = parseInt(req.params.id);
      const { userId } = req.body;
      if (!userId || isNaN(clinicId)) return res.status(400).json({ message: "clinicId and userId are required" });
      const count = await storage.backfillPatientsToClinic(parseInt(userId), clinicId);
      res.json({ message: `Migrated ${count} patients to clinic ${clinicId}`, count });
    } catch (error) {
      console.error("[ADMIN] Error backfilling patients:", error);
      res.status(500).json({ message: "Failed to backfill patients" });
    }
  });

  // POST /api/admin/clinics/:id/members — add an existing user to a clinic
  // Body: { userId, role? }
  app.post("/api/admin/clinics/:id/members", requireAdmin, async (req, res) => {
    try {
      const clinicId = parseInt(req.params.id);
      const { userId, role } = req.body;
      if (!userId || isNaN(clinicId)) return res.status(400).json({ message: "clinicId and userId are required" });
      const user = await storage.getUserById(parseInt(userId));
      if (!user) return res.status(404).json({ message: "User not found" });
      const membership = await storage.addUserToClinic(clinicId, parseInt(userId), role || "provider");
      // Stamp the clinic onto the user's row
      await storageDb
        .update(usersTable)
        .set({ defaultClinicId: clinicId, freeAccount: true, subscriptionStatus: "active" })
        .where(eq(usersTable.id, parseInt(userId)));
      // Backfill their patients too
      const patientsMigrated = await storage.backfillPatientsToClinic(parseInt(userId), clinicId);
      res.json({ message: "Member added", membership, patientsMigrated });
    } catch (error) {
      console.error("[ADMIN] Error adding clinic member:", error);
      res.status(500).json({ message: "Failed to add clinic member" });
    }
  });

  // GET /api/admin/clinics/:id/members — list members of a clinic
  app.get("/api/admin/clinics/:id/members", requireAdmin, async (req, res) => {
    try {
      const clinicId = parseInt(req.params.id);
      if (isNaN(clinicId)) return res.status(400).json({ message: "Invalid clinic ID" });
      const members = await storage.getClinicMembers(clinicId);
      res.json(members);
    } catch (error) {
      console.error("[ADMIN] Error fetching clinic members:", error);
      res.status(500).json({ message: "Failed to fetch clinic members" });
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
      const rawEmail = req.body?.email;
      if (!rawEmail || typeof rawEmail !== "string") return res.status(400).json({ message: "Patient email is required" });
      const email = rawEmail.trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Patient email is required" });

      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      // Update patient email on record (normalized)
      await storage.updatePatient(patientId, { email }, clinicianId, clinicId);

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
      const rawEmail = req.body?.email;
      const password = req.body?.password;
      if (!rawEmail || typeof rawEmail !== "string" || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const email = rawEmail.trim().toLowerCase();

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
      const rawEmail = req.body?.email;
      if (!rawEmail || typeof rawEmail !== "string") return res.status(400).json({ message: "Email is required" });
      const email = rawEmail.trim().toLowerCase();

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
        phone: patient.phone,
        preferredPharmacy: patient.preferredPharmacy,
        // Structured pharmacy fields — populated only after the patient/clinician
        // picks a real pharmacy from the lookup. Legacy free-text patients keep
        // these as nulls and the client falls back to plain `preferredPharmacy`.
        pharmacyName: (patient as any).pharmacyName ?? null,
        pharmacyAddress: (patient as any).pharmacyAddress ?? null,
        pharmacyPhone: (patient as any).pharmacyPhone ?? null,
        pharmacyFax: (patient as any).pharmacyFax ?? null,
        pharmacyNcpdpId: (patient as any).pharmacyNcpdpId ?? null,
        pharmacyPlaceId: (patient as any).pharmacyPlaceId ?? null,
        clinicName: clinician?.clinicName,
        clinicianName: clinician ? `${clinician.title} ${clinician.firstName} ${clinician.lastName}` : null,
      });
    } catch (error) {
      console.error("[PORTAL] Error fetching me:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // ── Portal: Patient self-update (phone, email, pharmacy) ─────────────────
  app.patch("/api/portal/account", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const patient = await storage.getPatientById(patientId);
      if (!patient) return res.status(404).json({ message: "Patient record not found" });

      const updateSchema = z.object({
        phone: z.string().trim().max(40).optional().nullable(),
        email: z.string().trim().email().toLowerCase().optional().nullable(),
        preferredPharmacy: z.string().trim().max(255).optional().nullable(),
        // Structured pharmacy fields from the lookup component (mirrors the
        // clinician PATCH route). All optional — typed-only fallback omits them.
        pharmacyName: z.string().trim().max(255).optional().nullable(),
        pharmacyAddress: z.string().trim().max(500).optional().nullable(),
        pharmacyPhone: z.string().trim().max(50).optional().nullable(),
        pharmacyFax: z.string().trim().max(50).optional().nullable(),
        pharmacyNcpdpId: z.string().trim().max(30).optional().nullable(),
        pharmacyPlaceId: z.string().trim().max(200).optional().nullable(),
      }).strict();
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.format() });
      }

      const updates: Partial<typeof patient> = {};
      if (parsed.data.phone !== undefined) (updates as any).phone = parsed.data.phone || null;
      if (parsed.data.email !== undefined) (updates as any).email = parsed.data.email || null;
      if (parsed.data.preferredPharmacy !== undefined) (updates as any).preferredPharmacy = parsed.data.preferredPharmacy || null;
      if (parsed.data.pharmacyName !== undefined) (updates as any).pharmacyName = parsed.data.pharmacyName || null;
      if (parsed.data.pharmacyAddress !== undefined) (updates as any).pharmacyAddress = parsed.data.pharmacyAddress || null;
      if (parsed.data.pharmacyPhone !== undefined) (updates as any).pharmacyPhone = parsed.data.pharmacyPhone || null;
      if (parsed.data.pharmacyFax !== undefined) (updates as any).pharmacyFax = parsed.data.pharmacyFax || null;
      if (parsed.data.pharmacyNcpdpId !== undefined) (updates as any).pharmacyNcpdpId = parsed.data.pharmacyNcpdpId || null;
      if (parsed.data.pharmacyPlaceId !== undefined) (updates as any).pharmacyPlaceId = parsed.data.pharmacyPlaceId || null;

      const updated = await storage.updatePatient(patientId, updates as any, patient.userId, patient.clinicId);
      if (!updated) return res.status(500).json({ message: "Update failed" });

      // If email changed, also update the linked portal account so sign-in stays consistent.
      if (parsed.data.email && parsed.data.email !== patient.email) {
        try {
          const account = await storage.getPortalAccountByPatientId(patientId);
          if (account && account.email !== parsed.data.email) {
            await storage.updatePortalAccount(patientId, { email: parsed.data.email });
          }
        } catch (err) {
          console.warn("[PORTAL] Could not sync portal account email:", err);
        }
      }

      res.json({
        phone: updated.phone,
        email: updated.email,
        preferredPharmacy: updated.preferredPharmacy,
        pharmacyName: (updated as any).pharmacyName ?? null,
        pharmacyAddress: (updated as any).pharmacyAddress ?? null,
        pharmacyPhone: (updated as any).pharmacyPhone ?? null,
        pharmacyFax: (updated as any).pharmacyFax ?? null,
        pharmacyNcpdpId: (updated as any).pharmacyNcpdpId ?? null,
        pharmacyPlaceId: (updated as any).pharmacyPlaceId ?? null,
      });
    } catch (error) {
      console.error("[PORTAL] Error updating account:", error);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  // ── Portal: List signed/submitted documents ──────────────────────────────
  app.get("/api/portal/account/documents", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;

      const [submissions, encounters] = await Promise.all([
        storage.getFormSubmissionsByPatient(patientId),
        storage.getPublishedEncountersByPatient(patientId).catch(() => [] as any[]),
      ]);

      const submissionDocs = await Promise.all(submissions.map(async (s) => {
        const form = await storage.getIntakeFormById(s.formId).catch(() => null);
        return {
          kind: "form" as const,
          id: `form-${s.id}`,
          submissionId: s.id,
          name: form?.name ?? "Submitted form",
          category: form?.category ?? "intake",
          submittedAt: s.submittedAt,
          viewUrl: `/portal/forms`,
        };
      }));

      const encounterDocs = (encounters as any[])
        .filter((e: any) => e.patientSummaryPublishedAt || e.publishedAt || e.patientSummary)
        .map((e: any) => ({
          kind: "visit" as const,
          id: `visit-${e.id}`,
          encounterId: e.id,
          name: e.visitType ? `Visit summary — ${e.visitType}` : "Visit summary",
          category: "visit_summary",
          submittedAt: e.patientSummaryPublishedAt || e.publishedAt || e.visitDate,
          viewUrl: `/portal/dashboard#section-visits`,
        }));

      const all = [...submissionDocs, ...encounterDocs].sort((a, b) => {
        const ad = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bd = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bd - ad;
      });

      res.json({ documents: all });
    } catch (error) {
      console.error("[PORTAL] Error fetching documents:", error);
      res.status(500).json({ message: "Failed to load documents" });
    }
  });

  // ── Portal: HealthIQ weekly snapshot ─────────────────────────────────────
  app.get("/api/portal/healthiq/snapshot", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const today = new Date();
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() - 6);
      const toIso = today.toISOString().slice(0, 10);
      const fromIso = fromDate.toISOString().slice(0, 10);

      const [checkins, adherence] = await Promise.all([
        (storage as any).getPatientDailyCheckins(patientId, { from: fromIso, to: toIso }) as Promise<any[]>,
        (storage as any).getMedicationAdherence(patientId, { from: fromIso, to: toIso }) as Promise<any[]>,
      ]);

      const avg = (vals: number[]) =>
        vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;

      const sleepHours = checkins.map((c: any) => c.sleepHours).filter((v: any) => typeof v === "number");
      const moodScores = checkins.map((c: any) => c.moodScore).filter((v: any) => typeof v === "number");
      const energyScores = checkins.map((c: any) => c.energyScore).filter((v: any) => typeof v === "number");
      const weights = checkins.map((c: any) => c.weight).filter((v: any) => typeof v === "number");

      const movementDays = checkins.filter((c: any) => c.exerciseDone).length;
      const hydrationStrong = checkins.filter((c: any) => c.waterLevel === "strong" || c.waterLevel === "moderate").length;
      const proteinStrong = checkins.filter((c: any) => c.foodProteinLevel === "strong" || c.foodProteinLevel === "moderate").length;
      const symptomDays = checkins.filter((c: any) =>
        (Array.isArray(c.giSymptoms) && c.giSymptoms.length > 0) ||
        c.unexpectedBleeding === true ||
        (typeof c.brainFogScore === "number" && c.brainFogScore >= 4) ||
        (typeof c.anxietyIrritabilityScore === "number" && c.anxietyIrritabilityScore >= 4)
      ).length;

      const adherenceTotal = adherence.length;
      const adherenceTaken = adherence.filter((a: any) => a.status === "taken" || a.status === "backfilled").length;
      const adherencePct = adherenceTotal ? Math.round((adherenceTaken / adherenceTotal) * 100) : null;

      const days: { date: string; logged: boolean }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        days.push({ date: iso, logged: checkins.some((c: any) => c.date === iso) });
      }

      res.json({
        windowDays: 7,
        from: fromIso,
        to: toIso,
        loggedDays: checkins.length,
        days,
        avgSleepHours: avg(sleepHours),
        avgMood: avg(moodScores),
        avgEnergy: avg(energyScores),
        latestWeight: weights.length ? weights[0] : null,
        movementDays,
        hydrationDays: hydrationStrong,
        proteinDays: proteinStrong,
        symptomDays,
        medAdherencePct: adherencePct,
        medAdherenceTotal: adherenceTotal,
      });
    } catch (error) {
      console.error("[PORTAL] HealthIQ snapshot error:", error);
      res.status(500).json({ message: "Failed to load snapshot" });
    }
  });

  // ── Portal: HealthIQ AI multi-signal coaching insight ────────────────────
  app.get("/api/portal/healthiq/insight", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const patient = await storage.getPatientById(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      const today = new Date();
      const fromDate = new Date(today);
      fromDate.setDate(fromDate.getDate() - 6);
      const checkins = await (storage as any).getPatientDailyCheckins(patientId, {
        from: fromDate.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
      }) as any[];

      if (checkins.length < 2) {
        return res.json({
          insight: "Log a few days of HealthIQ check-ins and your AI coach will start spotting patterns across your sleep, energy, hydration, and movement to give you a personalized weekly read.",
          generated: false,
        });
      }

      const insight = await AIService.generateHealthIQInsight({
        firstName: patient.firstName,
        gender: patient.gender as "male" | "female",
        checkins,
      });
      res.json({ insight, generated: true });
    } catch (error) {
      console.error("[PORTAL] HealthIQ insight error:", error);
      res.status(500).json({ message: "Failed to generate insight" });
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

      // Verify clinician can access this patient (clinic-scoped)
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(parseInt(patientId), clinicianId, clinicId);
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

      // Notify the patient: in-portal message + best-effort email
      const clinician = await storage.getUserById(clinicianId);
      try {
        await storage.createPortalMessage({
          patientId: parseInt(patientId),
          clinicianId,
          senderType: "clinician",
          content: `Your care team has shared an updated lab interpretation and supplement protocol with you (${supplements.length} supplement${supplements.length !== 1 ? "s" : ""}). You can review it from your dashboard.`,
        });
      } catch (msgErr) {
        console.error("[PORTAL] Error creating protocol portal message:", msgErr);
      }
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.patientId);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
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

      // Also forward to external messaging platform (e.g. Spruce) so patient gets a real SMS
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
            patientExternalId: patient.phone || undefined,
          }
        ).then((result) => {
          if (!result.success) {
            console.error('[Messaging] Outbound forward failed for clinician reply:', result.error);
          }
        }).catch((err) => console.error('[Messaging] Outbound forward error:', err));
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
        model: "gpt-4o-mini",
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

      // Get patient directly (portal session already proves ownership)
      const patient = await storage.getPatientById(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const clinicianId = patient.userId;

      // Create order record
      const order = await storage.createSupplementOrder({
        patientId,
        clinicianId,
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

  // ─── Portal Forms / Consents ─────────────────────────────────────────────────

  // GET /api/portal/forms — patient sees their assigned + completed forms
  app.get("/api/portal/forms", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const allAssignments = await storage.getPatientFormAssignments(patientId);
      // In-clinic-only assignments are hidden from the portal — they must be filled in clinic with a witness
      const assignments = allAssignments.filter(a => (a as any).deliveryMode !== "in_clinic");
      const submissions = await storage.getFormSubmissionsByPatient(patientId);

      const enrichedAssignments = await Promise.all(assignments.map(async (a) => {
        const form = await storage.getIntakeFormById(a.formId);
        const sub = submissions.find(s => s.assignmentId === a.id);
        return {
          ...a,
          formName: form?.name ?? "Unknown Form",
          formDescription: form?.description ?? null,
          formCategory: form?.category ?? "custom",
          submission: sub ? { id: sub.id, submittedAt: sub.submittedAt, reviewStatus: sub.reviewStatus, syncStatus: sub.syncStatus } : null,
        };
      }));

      const completedWithoutAssignment = submissions
        .filter(s => !s.assignmentId)
        .map(s => ({
          id: null,
          formId: s.formId,
          status: "completed" as const,
          submittedAt: s.submittedAt,
          formName: "",
          submission: { id: s.id, submittedAt: s.submittedAt, reviewStatus: s.reviewStatus, syncStatus: s.syncStatus },
        }));

      const enrichedStandalone = await Promise.all(completedWithoutAssignment.map(async (item) => {
        const form = await storage.getIntakeFormById(item.formId);
        return { ...item, formName: form?.name ?? "Unknown Form" };
      }));

      res.json({ assignments: enrichedAssignments, standalone: enrichedStandalone });
    } catch (err) {
      console.error("[Portal Forms]", err);
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  // GET /api/portal/clinic-discount — patient sees their clinic's supplement discount config
  app.get("/api/portal/clinic-discount", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const patient = await storage.getPatientById(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const settings = await storage.getClinicianSupplementSettings(patient.userId);
      res.json({
        type: (settings?.discountType ?? "none") as "percent" | "flat" | "none",
        percent: settings?.discountPercent ?? 0,
        flatCents: settings?.discountFlat ?? 0,
      });
    } catch (err) {
      console.error("[Portal Clinic Discount]", err);
      res.status(500).json({ message: "Failed to fetch discount" });
    }
  });

  // GET /api/portal/forms/submission/:id — read-only view of a previously submitted form
  app.get("/api/portal/forms/submission/:id", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const submissionId = parseInt(req.params.id);
      if (isNaN(submissionId)) return res.status(400).json({ message: "Invalid id" });

      const submission = await storage.getFormSubmission(submissionId);
      if (!submission || submission.patientId !== patientId) {
        return res.status(404).json({ message: "Submission not found" });
      }

      const form = await storage.getIntakeFormById(submission.formId);
      if (!form) return res.status(404).json({ message: "Form not found" });

      const fields = await storage.getFormFields(submission.formId);
      const sections = await storage.getFormSections(submission.formId);
      const sortedFields = fields.sort((a, b) => a.orderIndex - b.orderIndex);

      res.json({
        submission: {
          id: submission.id,
          submittedAt: submission.submittedAt,
          responses: submission.rawSubmissionJson,
          signature: submission.signatureJson,
        },
        form: {
          id: form.id,
          name: form.name,
          description: form.description,
          category: form.category,
          requiresPatientSignature: form.requiresPatientSignature,
        },
        fields: sortedFields,
        sections,
      });
    } catch (err) {
      console.error("[Portal Form Submission View]", err);
      res.status(500).json({ message: "Failed to fetch submission" });
    }
  });

  // GET /api/portal/forms/:assignmentId — get form fields for a specific assignment
  app.get("/api/portal/forms/:assignmentId", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const assignmentId = parseInt(req.params.assignmentId);
      const assignments = await storage.getPatientFormAssignments(patientId);
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });

      const form = await storage.getIntakeFormById(assignment.formId);
      if (!form) return res.status(404).json({ message: "Form not found" });

      const fields = await storage.getFormFields(assignment.formId);
      const sections = await storage.getFormSections(assignment.formId);
      const sortedFields = fields.sort((a, b) => a.orderIndex - b.orderIndex);

      const patient = await storage.getPatient(patientId);
      const portalAccount = await storage.getPortalAccountByPatientId(patientId).catch(() => null);
      const patientPrefill = patient ? {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth,
        email: portalAccount?.email || (patient as any).email || null,
      } : null;
      res.json({ assignment, form: { id: form.id, name: form.name, description: form.description, category: form.category, requiresPatientSignature: form.requiresPatientSignature }, fields: sortedFields, sections, patient: patientPrefill });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  // POST /api/portal/forms/:assignmentId/submit — patient submits an assigned form
  app.post("/api/portal/forms/:assignmentId/submit", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const assignmentId = parseInt(req.params.assignmentId);
      const assignments = await storage.getPatientFormAssignments(patientId);
      const assignment = assignments.find(a => a.id === assignmentId);
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      if (assignment.status === "completed") return res.status(400).json({ message: "Form already completed" });

      const form = await storage.getIntakeFormById(assignment.formId);
      if (!form) return res.status(404).json({ message: "Form not found" });

      const patient = await storage.getPatientById(patientId);
      const { responses, signature } = req.body;

      const submission = await storage.createFormSubmission({
        formId: assignment.formId,
        formVersion: form.version,
        clinicianId: form.clinicianId,
        clinicId: (form as any).clinicId ?? null,
        patientId,
        assignmentId,
        submittedByPatient: true,
        submittedByStaff: false,
        submissionSource: "portal",
        status: "submitted",
        rawSubmissionJson: responses,
        normalizedSubmissionJson: responses,
        signatureJson: signature ?? null,
        reviewStatus: "pending",
        syncStatus: "not_synced",
        submitterName: patient ? `${patient.firstName} ${patient.lastName}` : null,
        submitterEmail: patient?.email ?? null,
      });

      await storage.updatePatientFormAssignment(assignmentId, { status: "completed" });

      // Fire-and-forget: GoHighLevel inbound webhook (portal submissions)
      console.log(`[GHL Webhook] portal form ${form.id} sub ${submission.id} — enabled=${(form as any).ghlWebhookEnabled} urlSet=${!!(form as any).ghlWebhookUrl}`);
      if ((form as any).ghlWebhookEnabled && (form as any).ghlWebhookUrl) {
        const webhookUrl = (form as any).ghlWebhookUrl as string;
        setImmediate(async () => {
          try {
            const fullName = patient ? `${patient.firstName} ${patient.lastName}` : null;
            const payload = {
              event: "form_submission",
              source: "ClinIQ",
              submissionId: submission.id,
              submittedAt: submission.submittedAt ?? new Date().toISOString(),
              form: { id: form.id, name: form.name, slug: (form as any).slug ?? null, version: form.version },
              clinicId: (form as any).clinicId ?? null,
              patientId,
              // Send BOTH camelCase and snake_case so GoHighLevel auto-maps to a contact
              firstName: patient?.firstName ?? null,
              lastName: patient?.lastName ?? null,
              fullName,
              name: fullName,
              email: patient?.email ?? null,
              phone: (patient as any)?.phone ?? null,
              dateOfBirth: (patient as any)?.dateOfBirth ?? null,
              gender: (patient as any)?.gender ?? null,
              first_name: patient?.firstName ?? null,
              last_name: patient?.lastName ?? null,
              full_name: fullName,
              date_of_birth: (patient as any)?.dateOfBirth ?? null,
              responses,
            };
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 10000);
            const resp = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            console.log(`[GHL Webhook] portal form ${form.id} sub ${submission.id} -> ${resp.status}`);
          } catch (err: any) {
            console.error(`[GHL Webhook] portal form ${form.id} sub ${submission.id} error:`, err?.message ?? err);
          }
        });
      }

      // Fire-and-forget: sync smart-field chart domains into patient chart
      setImmediate(async () => {
        try {
          const fields = await storage.getFormFields(assignment.formId);
          const chart = await storage.getPatientChart(patientId, form.clinicianId ?? 0);
          const toSync: Record<string, string[]> = {
            medications: [], allergies: [], medical_history: [],
            surgical_history: [], family_history: [], social_history: [],
          };
          for (const field of fields) {
            if (!field.syncConfigJson) continue;
            const sync = field.syncConfigJson as any;
            if (!sync.domain || !sync.mode || sync.mode === "none") continue;
            const value = (responses as Record<string, any>)[field.fieldKey];
            if (value === undefined || value === null || value === "") continue;
            const domain = sync.domain as string;
            if (!toSync[domain]) continue;
            if (Array.isArray(value)) {
              toSync[domain].push(...value.filter(Boolean).map(String));
            } else if (typeof value === "object" && value !== null) {
              if (domain === "family_history" && !Array.isArray(value) && !(value.rows)) {
                extractFamilyHistoryEntries(field, value).forEach(e => toSync[domain].push(e));
              } else {
                const rows = value.rows ?? value;
                if (Array.isArray(rows)) {
                  toSync[domain].push(...rows.map((r: any) => typeof r === "string" ? r : JSON.stringify(r)));
                }
              }
            } else {
              toSync[domain].push(String(value));
            }
          }
          const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
          const existing = {
            medications: (chart?.currentMedications as string[] ?? []),
            allergies: (chart?.allergies as string[] ?? []),
            medical_history: (chart?.medicalHistory as string[] ?? []),
            surgical_history: (chart?.surgicalHistory as string[] ?? []),
            family_history: (chart?.familyHistory as string[] ?? []),
            social_history: (chart?.socialHistory as string[] ?? []),
          };
          const merged = { ...existing };
          let hasChanges = false;
          for (const [domain, items] of Object.entries(toSync)) {
            for (const item of items) {
              const isDup = (existing[domain as keyof typeof existing] as string[]).some(e => normalize(e) === normalize(item));
              if (!isDup) { (merged[domain as keyof typeof merged] as string[]).push(item); hasChanges = true; }
            }
          }
          if (hasChanges) {
            await storage.upsertPatientChart(patientId, form.clinicianId ?? 0, {
              currentMedications: merged.medications,
              allergies: merged.allergies,
              medicalHistory: merged.medical_history,
              surgicalHistory: merged.surgical_history,
              familyHistory: merged.family_history,
              socialHistory: merged.social_history,
            });
          }
          await storage.updateFormSubmission(submission.id, { syncStatus: "synced" });
        } catch (syncErr) {
          console.error("[Portal Form Submit Sync]", syncErr);
        }
      });

      res.json({ success: true, submissionId: submission.id });
    } catch (err) {
      console.error("[Portal Form Submit]", err);
      res.status(500).json({ message: "Failed to submit form" });
    }
  });

  // POST /api/patients/:id/forms/send-link — send form link via email
  app.post("/api/patients/:id/forms/send-link", requireAuth, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const { formId, method } = req.body;
      if (!formId) return res.status(400).json({ message: "formId required" });

      const clinicId = getEffectiveClinicId(req);
      let patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) {
        // Fallback: scoped lookup missed (e.g. patient created by a different
        // provider in the same clinic, or user's defaultClinicId is null/stale).
        // Verify by raw lookup and ensure the patient belongs to this clinic
        // OR was created by this clinician.
        const raw = await storage.getPatientById(patientId);
        if (raw && (
          (clinicId && raw.clinicId === clinicId) ||
          raw.userId === clinicianId
        )) {
          patient = raw;
        }
      }
      if (!patient) {
        console.warn("[Send Form Link] Patient not found", { patientId, clinicianId, clinicId });
        return res.status(404).json({ message: "Patient not found" });
      }

      const form = await storage.getIntakeFormByIdAndClinic(parseInt(formId), clinicId, clinicianId);
      if (!form) return res.status(404).json({ message: "Form not found" });

      // Find or create active publication
      const publications = await storage.getFormPublications(parseInt(formId));
      let pub = publications.find((p: any) => p.status === "active");
      if (!pub) {
        pub = await storage.createFormPublication({
          formId: parseInt(formId),
          mode: "link",
          status: "active",
          publicToken: crypto.randomBytes(16).toString("hex"),
        });
      }

      const formUrl = `${req.protocol}://${req.get("host")}/f/${pub.publicToken}`;

      // Assign form to patient
      const existingAssignments = await storage.getPatientFormAssignments(patientId);
      const alreadyPending = existingAssignments.find(a => a.formId === parseInt(formId) && a.status === "pending");
      if (!alreadyPending) {
        await storage.createPatientFormAssignment({
          patientId,
          formId: parseInt(formId),
          assignedBy: req.user?.id ?? (req.session as any).staffClinicianId,
          status: "pending",
          completionRequired: false,
          notes: `Sent via ${method || "link"}`,
        });
      }

      if (method === "email" && patient.email) {
        try {
          const clinician = await storage.getUser(clinicianId);
          const clinicName = clinician?.clinicName || "Your Healthcare Provider";
          const sendingDomain = process.env.RESEND_FROM_EMAIL || "noreply@cliniqapp.ai";
          const apiKey = process.env.RESEND_API_KEY;

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2e3a20;">New Form from ${clinicName}</h2>
              <p>Hi ${patient.firstName},</p>
              <p>Your provider has asked you to complete the following form:</p>
              <div style="background: #f9f6f0; border: 1px solid #d4c9b5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <strong>${form.name}</strong>
                ${form.description ? `<p style="color: #666; margin-top: 8px;">${form.description}</p>` : ""}
              </div>
              <a href="${formUrl}" style="display: inline-block; background: #2e3a20; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Complete Form</a>
              <p style="margin-top: 24px; color: #888; font-size: 12px;">If the button doesn't work, copy this link: ${formUrl}</p>
            </div>
          `;

          if (apiKey) {
            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: `"${clinicName}" <${sendingDomain}>`,
                to: [patient.email],
                subject: `${clinicName}: Please complete your ${form.name}`,
                html: emailHtml,
              }),
            });
            if (!emailRes.ok) throw new Error(`Resend ${emailRes.status}`);
          } else {
            console.log("[Send Form Link] No RESEND_API_KEY — skipping email send. Link:", formUrl);
            res.json({ success: true, method: "email_skipped", formUrl, note: "Email service not configured — link generated instead" });
            return;
          }
          res.json({ success: true, method: "email", formUrl });
        } catch (emailErr) {
          console.error("[Send Form Link] Email error:", emailErr);
          res.json({ success: true, method: "email_failed", formUrl, note: "Email sending failed but link generated" });
        }
      } else {
        res.json({ success: true, method: "link", formUrl });
      }
    } catch (err) {
      console.error("[Send Form Link]", err);
      res.status(500).json({ message: "Failed to send form link" });
    }
  });

  // POST /api/forms/send-to-email — send a form to any email (no patient required)
  app.post("/api/forms/send-to-email", requireAuth, async (req: any, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const { formId, recipientEmail, recipientName } = req.body;
      if (!formId) return res.status(400).json({ message: "formId required" });
      if (!recipientEmail) return res.status(400).json({ message: "recipientEmail required" });

      const form = await storage.getIntakeFormByIdAndClinic(parseInt(formId), clinicId, clinicianId);
      if (!form) return res.status(404).json({ message: "Form not found" });

      const publications = await storage.getFormPublications(parseInt(formId));
      let pub = publications.find((p: any) => p.status === "active");
      if (!pub) {
        pub = await storage.createFormPublication({
          formId: parseInt(formId),
          mode: "link",
          status: "active",
          publicToken: crypto.randomBytes(16).toString("hex"),
        });
      }

      const formUrl = `${req.protocol}://${req.get("host")}/f/${pub.publicToken}`;

      const clinician = await storage.getUser(clinicianId);
      const clinicName = clinician?.clinicName || "Your Healthcare Provider";
      const sendingDomain = process.env.RESEND_FROM_EMAIL || "noreply@cliniqapp.ai";
      const apiKey = process.env.RESEND_API_KEY;

      const firstName = recipientName ? String(recipientName).split(/\s+/)[0] : "";
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2e3a20;">New Form from ${clinicName}</h2>
          ${firstName ? `<p>Hi ${firstName},</p>` : "<p>Hello,</p>"}
          <p>You have been asked to complete the following form:</p>
          <div style="background: #f9f6f0; border: 1px solid #d4c9b5; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <strong>${form.name}</strong>
            ${form.description ? `<p style="color: #666; margin-top: 8px;">${form.description}</p>` : ""}
          </div>
          <a href="${formUrl}" style="display: inline-block; background: #2e3a20; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Complete Form</a>
          <p style="margin-top: 24px; color: #888; font-size: 12px;">If the button doesn't work, copy this link: ${formUrl}</p>
        </div>
      `;

      if (apiKey) {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `"${clinicName}" <${sendingDomain}>`,
            to: [recipientEmail],
            subject: `${clinicName}: Please complete your ${form.name}`,
            html: emailHtml,
          }),
        });
        if (!emailRes.ok) {
          const errBody = await emailRes.text();
          console.error("[Send Form Email] Resend error:", emailRes.status, errBody);
          return res.json({ success: true, method: "email_failed", formUrl, note: "Email sending failed but link generated" });
        }
        res.json({ success: true, method: "email", formUrl });
      } else {
        console.log("[Send Form Email] No RESEND_API_KEY — link generated:", formUrl);
        res.json({ success: true, method: "email_skipped", formUrl, note: "Email service not configured — link generated instead" });
      }
    } catch (err) {
      console.error("[Send Form Email]", err);
      res.status(500).json({ message: "Failed to send form" });
    }
  });

  // PATCH /api/supplement-orders/:id/status — clinician marks order fulfilled/cancelled
  app.patch("/api/supplement-orders/:id/status", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const orders = await storage.getSupplementOrdersByClinicianPatient(clinicianId, patientId);
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // ── Patient Documents (drag-drop uploads + camera scans) ───────────────
  // Files are accepted in-memory and persisted as base64 TEXT in the
  // patient_documents table, scoped by clinic_id. No external object store
  // needed for HIPAA — everything stays inside the existing Postgres
  // perimeter.
  // Memory-safety limits (Cloud Run profile):
  //   • Per file: 25 MB
  //   • Per request total: 50 MB aggregate (enforced post-multer)
  //   • Per request count: 10 files
  // These bounds prevent in-memory exhaustion + base64 inflation (~33%)
  // under concurrent uploads on a small Cloud Run instance.
  const DOC_MAX_FILE_BYTES = 25 * 1024 * 1024;
  const DOC_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
  const DOC_MAX_FILES_PER_REQUEST = 10;
  const docUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DOC_MAX_FILE_BYTES, files: DOC_MAX_FILES_PER_REQUEST },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'image/gif', 'image/tiff',
      ];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error(`Unsupported file type: ${file.mimetype}`));
    },
  });
  // Multer error → proper 4xx (413 for size, 415 for type, 400 otherwise).
  function docUploadErrorHandler(err: any, _req: any, res: any, next: any) {
    if (!err) return next();
    if (err && err.name === 'MulterError') {
      const code = err.code as string;
      if (code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: `File exceeds ${DOC_MAX_FILE_BYTES / 1024 / 1024} MB limit.` });
      }
      if (code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ message: `Too many files. Max ${DOC_MAX_FILES_PER_REQUEST} per upload.` });
      }
      return res.status(400).json({ message: err.message });
    }
    if (typeof err.message === 'string' && err.message.startsWith('Unsupported file type')) {
      return res.status(415).json({ message: err.message });
    }
    return next(err);
  }

  function isAllowedDocCategory(value: unknown): value is PatientDocumentCategory {
    return typeof value === 'string' && (PATIENT_DOCUMENT_CATEGORIES as readonly string[]).includes(value);
  }

  // GET /api/patients/:id/documents — list patient docs (no payloads)
  app.get("/api/patients/:id/documents", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      if (Number.isNaN(patientId)) return res.status(400).json({ message: "Invalid patient id" });
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (clinicId == null) return res.status(403).json({ message: "Clinic context required" });
      const docs = await storage.listPatientDocuments(patientId, clinicId);
      res.json(docs);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to list documents" });
    }
  });

  // POST /api/patients/:id/documents — upload one or more files
  app.post(
    "/api/patients/:id/documents",
    requireAuth,
    (req, res, next) => docUpload.array("files", DOC_MAX_FILES_PER_REQUEST)(req, res, (err) => docUploadErrorHandler(err, req, res, next)),
    async (req, res) => {
      try {
        const clinicianId = getClinicianId(req);
        const clinicId = getEffectiveClinicId(req);
        const patientId = parseInt(req.params.id);
        if (Number.isNaN(patientId)) return res.status(400).json({ message: "Invalid patient id" });
        const patient = await storage.getPatient(patientId, clinicianId, clinicId);
        if (!patient) return res.status(404).json({ message: "Patient not found" });
        if (clinicId == null) return res.status(403).json({ message: "Clinic context required" });

        const files = (req.files as Express.Multer.File[]) ?? [];
        if (files.length === 0) return res.status(400).json({ message: "No files uploaded" });

        // Aggregate-bytes guard: cap total bytes per request to protect
        // against memory exhaustion from many medium-sized files at once.
        const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
        if (totalBytes > DOC_MAX_TOTAL_BYTES) {
          return res.status(413).json({
            message: `Total upload exceeds ${DOC_MAX_TOTAL_BYTES / 1024 / 1024} MB. Try uploading fewer files at once.`,
          });
        }

        const rawCategory = (req.body?.category as string | undefined) ?? 'other';
        const category: PatientDocumentCategory = isAllowedDocCategory(rawCategory) ? rawCategory : 'other';
        const rawSource = (req.body?.source as string | undefined) ?? 'upload';
        const source = ['upload', 'scan', 'photo'].includes(rawSource) ? rawSource : 'upload';
        const notes = typeof req.body?.notes === 'string' && req.body.notes.length > 0
          ? req.body.notes.slice(0, 2000)
          : null;

        // Resolve a display name for the uploader (for audit/UX).
        let uploadedByName: string | null = null;
        try {
          const u = await storage.getUserById(clinicianId);
          if (u) uploadedByName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || null;
        } catch { /* non-fatal */ }

        const created: any[] = [];
        for (const f of files) {
          const safeName = (f.originalname ?? 'document').replace(/[\r\n]/g, '').slice(0, 200);
          const doc = await storage.createPatientDocument({
            clinicId,
            patientId,
            uploadedByUserId: clinicianId,
            uploadedByName,
            fileName: safeName,
            mimeType: f.mimetype,
            sizeBytes: f.size,
            category,
            notes,
            source,
            fileData: f.buffer.toString('base64'),
          });
          created.push(doc);
        }
        res.status(201).json(created);
      } catch (e: any) {
        res.status(500).json({ message: e?.message ?? 'Upload failed' });
      }
    }
  );

  // GET /api/patients/:id/documents/:docId/download — stream the file
  app.get("/api/patients/:id/documents/:docId/download", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const docId = parseInt(req.params.docId);
      if (Number.isNaN(patientId) || Number.isNaN(docId)) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (clinicId == null) return res.status(403).json({ message: "Clinic context required" });

      const doc = await storage.getPatientDocument(docId, clinicId);
      if (!doc || doc.patientId !== patientId) return res.status(404).json({ message: "Document not found" });

      const buf = Buffer.from(doc.fileData, 'base64');
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Content-Length', String(buf.length));
      const inline = req.query.inline === '1';
      const safeName = doc.fileName.replace(/"/g, '');
      res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
      res.end(buf);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to download document" });
    }
  });

  // DELETE /api/patients/:id/documents/:docId
  app.delete("/api/patients/:id/documents/:docId", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const docId = parseInt(req.params.docId);
      if (Number.isNaN(patientId) || Number.isNaN(docId)) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (clinicId == null) return res.status(403).json({ message: "Clinic context required" });

      const doc = await storage.getPatientDocument(docId, clinicId);
      if (!doc || doc.patientId !== patientId) return res.status(404).json({ message: "Document not found" });

      const ok = await storage.deletePatientDocument(docId, clinicId);
      res.json({ ok });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to delete document" });
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
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
        rawBodyBuffer: (req as any).rawBody,
        expectedSecret: clinician.externalMessagingWebhookSecret,
        signatureHeader,
        allHeaders: req.headers,
      });

      if (!parsed) {
        return res.status(401).json({ ok: false, error: "Invalid signature or unrecognised payload" });
      }

      // Spruce inbox handling:
      //   • If the clinician hasn't picked an inbox yet, auto-save the inbox ID
      //     from the first inbound message — saves them looking it up manually.
      //   • If they HAVE picked one, drop messages from any other inbox.
      if (clinician.externalMessagingProvider === 'spruce' && parsed.channelId) {
        if (!clinician.externalMessagingChannelId) {
          await storage.updateUser(clinicianId, { externalMessagingChannelId: parsed.channelId });
          clinician.externalMessagingChannelId = parsed.channelId;
          console.log(`[Spruce] Auto-detected inbox ${parsed.channelId} for clinician ${clinicianId}`);
        } else if (parsed.channelId !== clinician.externalMessagingChannelId) {
          return res.json({ ok: true, skipped: true, reason: "Message from a different Spruce inbox" });
        }
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
      // Fallback: match by phone number from the parsed payload (Spruce sends contact phone)
      if (!patient && parsed.patientPhone) {
        patient = await storage.getPatientByPhoneForClinician(parsed.patientPhone, clinicianId);
      }

      if (!patient) {
        return res.status(404).json({ ok: false, error: "Could not identify patient. Include patient_id, patient_email, or a recognized phone number." });
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
      const clinicId = getEffectiveClinicId(req);
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

  // GET /api/auth/messaging/spruce-inboxes — list the org's Spruce inboxes/endpoints
  app.get("/api/auth/messaging/spruce-inboxes", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const user = await storage.getUserById(clinicianId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.externalMessagingProvider !== "spruce") {
        return res.status(400).json({ message: "Messaging provider must be set to Spruce." });
      }
      if (!user.externalMessagingApiKey) {
        return res.status(400).json({ message: "Save your Spruce API key first." });
      }

      // Try the most likely Spruce paths in order. Different Spruce plans expose
      // org phone lines under slightly different names; first 200 wins.
      const candidatePaths = [
        "/v1/endpoints",
        "/v1/organization/endpoints",
        "/v1/organizations/me/endpoints",
        "/v1/conversation_endpoints",
        "/v1/communication_endpoints",
        "/v1/phone_numbers",
        "/v1/inboxes",
        "/v1/organizations",
        "/v1/organization",
        "/v1/me",
      ];
      const attempts: Array<{ path: string; status: number | string; preview?: string }> = [];
      for (const path of candidatePaths) {
        try {
          const r = await fetch(`https://api.sprucehealth.com${path}`, {
            headers: {
              Authorization: `Bearer ${user.externalMessagingApiKey}`,
              "Content-Type": "application/json",
            },
          });
          const text = await r.text();
          attempts.push({ path, status: r.status, preview: text.slice(0, 200) });
          if (!r.ok) continue;
          let body: any = null;
          try { body = JSON.parse(text); } catch { continue; }
          // Try a wide variety of shapes the inbox/endpoint list might take
          const list: any[] =
            body?.endpoints ||
            body?.inboxes ||
            body?.phone_numbers ||
            body?.conversation_endpoints ||
            body?.communication_endpoints ||
            body?.data ||
            body?.organization?.endpoints ||
            body?.organizations?.[0]?.endpoints ||
            (Array.isArray(body) ? body : []);
          const inboxes = list
            .map((e: any) => ({
              id: String(e.id ?? e.endpoint_id ?? ""),
              label: String(
                e.name ?? e.display_name ?? e.label ?? e.phone ?? e.phone_number ?? e.number ?? e.id ?? "Inbox",
              ),
              phone: e.phone ?? e.phone_number ?? e.number ?? null,
            }))
            .filter((x) => x.id);
          if (inboxes.length > 0) {
            return res.json({ ok: true, inboxes, source: path });
          }
        } catch (e: any) {
          attempts.push({ path, status: "fetch-error", preview: e?.message || String(e) });
        }
      }
      res.status(502).json({
        message: "Could not list Spruce inboxes from any known API path. Paste the inbox ID manually below, or share these results with support.",
        attempts,
      });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Failed to list Spruce inboxes." });
    }
  });

  // POST /api/auth/messaging/register-spruce-webhook — auto-register inbound webhook with Spruce
  app.post("/api/auth/messaging/register-spruce-webhook", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const user = await storage.getUserById(clinicianId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.externalMessagingProvider !== "spruce") {
        return res.status(400).json({ message: "Messaging provider must be set to Spruce." });
      }
      if (!user.externalMessagingApiKey) {
        return res.status(400).json({ message: "Save your Spruce API key first." });
      }

      // Ensure we have a signing secret to share with Spruce
      let signingSecret = user.externalMessagingWebhookSecret;
      if (!signingSecret) {
        signingSecret = generateWebhookSecret();
        await storage.updateUser(clinicianId, { externalMessagingWebhookSecret: signingSecret });
      }

      const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/messaging/${clinicianId}`;
      const clinicName = (user as any).clinicName || "ClinIQ";

      const sprResp = await fetch("https://api.sprucehealth.com/v1/webhooks/endpoints", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${user.externalMessagingApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: webhookUrl,
          name: `ClinIQ – ${clinicName}`,
          signingSecret,
        }),
      });

      const bodyText = await sprResp.text();
      let body: any = null;
      try { body = JSON.parse(bodyText); } catch { /* not JSON */ }

      if (!sprResp.ok) {
        return res.status(sprResp.status).json({
          message: body?.message || "Spruce rejected the request.",
          sprucePayload: body || bodyText,
        });
      }

      // If Spruce generated its own signing secret, persist that instead
      const sprSecret: string | undefined = body?.signingSecrets?.[0]?.value;
      if (sprSecret && sprSecret !== signingSecret) {
        await storage.updateUser(clinicianId, { externalMessagingWebhookSecret: sprSecret });
        signingSecret = sprSecret;
      }

      res.json({
        ok: true,
        endpointId: body?.id,
        url: body?.url || webhookUrl,
        webhookSecret: signingSecret,
      });
    } catch (error: any) {
      console.error("Spruce webhook registration failed:", error);
      res.status(500).json({ message: error?.message || "Failed to register webhook with Spruce." });
    }
  });

  // POST /api/auth/messaging/resync-spruce-secret — pull current signing secret from Spruce
  app.post("/api/auth/messaging/resync-spruce-secret", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const user = await storage.getUserById(clinicianId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.externalMessagingProvider !== "spruce") {
        return res.status(400).json({ message: "Messaging provider must be set to Spruce." });
      }
      if (!user.externalMessagingApiKey) {
        return res.status(400).json({ message: "Save your Spruce API key first." });
      }

      const expectedUrl = `${req.protocol}://${req.get('host')}/api/webhooks/messaging/${clinicianId}`;

      const listResp = await fetch("https://api.sprucehealth.com/v1/webhooks/endpoints", {
        method: "GET",
        headers: { "Authorization": `Bearer ${user.externalMessagingApiKey}` },
      });
      const listText = await listResp.text();
      let listBody: any = null;
      try { listBody = JSON.parse(listText); } catch {}

      if (!listResp.ok) {
        return res.status(listResp.status).json({ message: listBody?.message || "Spruce GET failed", sprucePayload: listBody || listText });
      }

      const endpoints: any[] = Array.isArray(listBody) ? listBody : (listBody?.endpoints || listBody?.data || []);
      const match = endpoints.find((e: any) =>
        e.url === expectedUrl ||
        (typeof e.url === 'string' && e.url.endsWith(`/api/webhooks/messaging/${clinicianId}`))
      );

      if (!match) {
        return res.status(404).json({
          message: `No webhook endpoint in Spruce points to ${expectedUrl}. Click "Register webhook with Spruce" first.`,
          urls: endpoints.map((e: any) => e.url),
        });
      }

      const secrets: string[] = (match.signingSecrets || match.signing_secrets || [])
        .map((s: any) => s?.value || s)
        .filter((v: any) => typeof v === 'string' && v.length > 0);

      if (!secrets.length) {
        return res.status(404).json({ message: "Spruce did not return any signing secrets for that endpoint.", endpoint: match });
      }

      // Use the most recent (last) secret
      const newSecret = secrets[secrets.length - 1];
      await storage.updateUser(clinicianId, { externalMessagingWebhookSecret: newSecret });

      res.json({
        ok: true,
        endpointId: match.id,
        url: match.url,
        secretCount: secrets.length,
        secretPrefix: newSecret.slice(0, 6),
      });
    } catch (error: any) {
      console.error("Spruce resync failed:", error);
      res.status(500).json({ message: error?.message || "Failed to resync signing secret from Spruce." });
    }
  });

  // ── Staff Management Routes ────────────────────────────────────────────────

  // GET /api/staff — list all staff members for this clinician
  app.get("/api/staff", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = (req.user as any).id;
      const staff = await storage.getAllStaffForClinician(clinicianId);
      const safeStaff = staff.map(({ passwordHash, inviteToken: _it, ...s }) => ({
        ...s,
        hasSetPassword: !!passwordHash,
      }));
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
      const { email, firstName, lastName, role, adminRole } = req.body;
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

      const validAdminRoles = ["standard", "limited_admin", "admin"];
      const staffMember = await storage.createClinicianStaff({
        clinicianId,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: role || 'staff',
        adminRole: validAdminRoles.includes(adminRole) ? adminRole : "standard",
        inviteToken,
        inviteExpires,
        isActive: true,
      });

      // Send invite email (fire-and-forget)
      const clinician = await storage.getUserById(clinicianId);
      sendStaffInviteEmail(
        staffMember.email,
        staffMember.firstName,
        clinician?.clinicName || 'the clinic',
        clinician ? `${clinician.firstName} ${clinician.lastName}` : 'Your clinician',
        inviteToken,
        req
      ).catch(err => console.error('[EMAIL] Staff invite email failed:', err));

      const { passwordHash: _ph, inviteToken: _it, ...safeStaff } = staffMember;
      res.status(201).json(safeStaff);
    } catch (error) {
      console.error('[API] Error inviting staff:', error);
      res.status(500).json({ message: "Failed to invite staff member" });
    }
  });

  // POST /api/staff/:id/resend — resend a staff invite with a fresh token
  app.post("/api/staff/:id/resend", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = (req.user as any).id;
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });

      const staffMember = await storage.getClinicianStaffById(staffId);
      if (!staffMember || staffMember.clinicianId !== clinicianId) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      if (staffMember.passwordHash) {
        return res.status(400).json({ message: "This staff member has already set their password. They can use 'Forgot Password' to reset it." });
      }

      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

      await storage.updateClinicianStaff(staffId, { inviteToken: newToken, inviteExpires: newExpires });

      const clinician = await storage.getUserById(clinicianId);
      const baseUrl = process.env.APP_URL
        || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}` : null)
        || `${req.protocol}://${req.get('host')}`;
      const inviteLink = `${baseUrl}/staff-set-password?token=${newToken}`;

      let emailSent = false;
      let emailError: string | null = null;
      try {
        await sendStaffInviteEmail(
          staffMember.email,
          staffMember.firstName,
          clinician?.clinicName || 'the clinic',
          clinician ? `${clinician.firstName} ${clinician.lastName}` : 'Your clinician',
          newToken,
          req
        );
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || 'Email send failed';
        console.error('[EMAIL] Staff invite resend failed:', err);
      }

      res.json({
        success: true,
        emailSent,
        emailError,
        inviteLink,
        recipientEmail: staffMember.email,
        message: emailSent
          ? "Invite email sent"
          : "Token refreshed, but the email could not be delivered. Use the link below to share manually.",
      });
    } catch (error) {
      console.error('[API] Error resending staff invite:', error);
      res.status(500).json({ message: "Failed to resend invite" });
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

  // PATCH /api/staff/:id — update staff clinical or admin role
  app.patch("/api/staff/:id", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = (req.user as any).id;
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff ID" });
      const staffMember = await storage.getClinicianStaffById(staffId);
      if (!staffMember || staffMember.clinicianId !== clinicianId) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const { role, adminRole } = req.body;
      const updates: Record<string, string> = {};
      const validRoles = ["provider", "nurse", "assistant", "staff"];
      const validAdminRoles = ["standard", "limited_admin", "admin"];
      if (role && validRoles.includes(role)) updates.role = role;
      if (adminRole && validAdminRoles.includes(adminRole)) updates.adminRole = adminRole;
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid fields to update" });
      const updated = await storage.updateClinicianStaff(staffId, updates);
      if (!updated) return res.status(404).json({ message: "Staff member not found" });
      const { passwordHash: _ph, inviteToken: _it, ...safe } = updated;
      res.json(safe);
    } catch (err) {
      console.error('[API] Error updating staff:', err);
      res.status(500).json({ message: "Failed to update staff member" });
    }
  });

  // ── Clinic Branding ──────────────────────────────────────────────────────
  // Universal brand colors that apply to patient-facing artifacts (PDFs and
  // public form pages). Layout is unchanged — only color tokens.

  // GET /api/clinic/branding — any authenticated clinic member can read
  app.get("/api/clinic/branding", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) {
        return res.json({ primaryColor: null, accentColor: null, formBackgroundColor: null, clinicLogo: null });
      }
      const rows = await storageDb
        .select({
          primaryColor: clinics.primaryColor,
          accentColor: clinics.accentColor,
          formBackgroundColor: clinics.formBackgroundColor,
          clinicLogo: clinics.clinicLogo,
        })
        .from(clinics)
        .where(eq(clinics.id, clinicId))
        .limit(1);
      const c = rows[0] ?? { primaryColor: null, accentColor: null, formBackgroundColor: null, clinicLogo: null };
      res.json(c);
    } catch (err) {
      console.error('[API] Error fetching clinic branding:', err);
      res.status(500).json({ message: "Failed to fetch branding" });
    }
  });

  // PATCH /api/clinic/branding — owner / admin / limited_admin only
  app.patch("/api/clinic/branding", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const adminRole = await getSessionAdminRole(req);
      if (adminRole !== "owner" && adminRole !== "admin" && adminRole !== "limited_admin") {
        return res.status(403).json({ message: "Only clinic owners or admins can edit branding." });
      }

      const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
      const normalize = (v: unknown): string | null => {
        if (v === null || v === undefined || v === "") return null;
        if (typeof v !== "string") return null;
        return HEX_RE.test(v) ? v.toLowerCase() : null;
      };
      const incoming = req.body ?? {};
      const updates: Record<string, string | null> = {};
      if ("primaryColor" in incoming) updates.primaryColor = normalize(incoming.primaryColor);
      if ("accentColor" in incoming) updates.accentColor = normalize(incoming.accentColor);
      if ("formBackgroundColor" in incoming) updates.formBackgroundColor = normalize(incoming.formBackgroundColor);
      // Reject any field that was provided but failed validation (we
      // intentionally don't silently strip — clinicians need to know the
      // value didn't take).
      for (const k of Object.keys(updates)) {
        if (incoming[k] && updates[k] === null && incoming[k] !== "") {
          return res.status(400).json({ message: `${k} must be a 6-digit hex color (e.g. #1f4e79).` });
        }
      }
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No branding fields provided." });
      }
      await storageDb.update(clinics).set({ ...updates, updatedAt: new Date() }).where(eq(clinics.id, clinicId));
      const rows = await storageDb
        .select({
          primaryColor: clinics.primaryColor,
          accentColor: clinics.accentColor,
          formBackgroundColor: clinics.formBackgroundColor,
        })
        .from(clinics)
        .where(eq(clinics.id, clinicId))
        .limit(1);
      res.json(rows[0]);
    } catch (err) {
      console.error('[API] Error updating clinic branding:', err);
      res.status(500).json({ message: "Failed to update branding" });
    }
  });

  // GET /api/clinic/invites — list pending provider invites for this clinic
  app.get("/api/clinic/invites", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) return res.json([]);
      const invites = await storage.getClinicProviderInvites(clinicId);
      res.json(invites);
    } catch (err) {
      console.error('[API] Error fetching clinic invites:', err);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // POST /api/clinic/invite-provider — invite a provider (full clinician) to join this clinic
  // GET /api/clinic/seat-check — check if adding a provider requires a paid seat (owner/admin only)
  app.get("/api/clinic/seat-check", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const adminRole = await getSessionAdminRole(req);
      if (adminRole !== "owner" && adminRole !== "admin") {
        return res.status(403).json({ message: "Only clinic owners or admins can check seat availability." });
      }
      const ownerSub = await resolveClinicOwnerSubscription(clinicId);
      const planState = await getClinicPlanState(clinicId, ownerSub.freeAccount, ownerSub.stripeSubscriptionId);
      const pendingInvites = await storageDb
        .select({ id: clinicProviderInvites.id })
        .from(clinicProviderInvites)
        .where(and(eq(clinicProviderInvites.clinicId, clinicId), eq(clinicProviderInvites.status, "pending")));
      const effectiveCount = planState.activeProviderCount + pendingInvites.length;
      const requiresPaidSeat = !planState.isFreeAccount && planState.isSuitePlan && effectiveCount >= planState.maxProviders;
      const withinBase = effectiveCount < planState.baseProviderLimit;
      res.json({
        activeProviders: planState.activeProviderCount,
        pendingInvites: pendingInvites.length,
        effectiveCount,
        maxProviders: planState.maxProviders,
        baseProviderLimit: planState.baseProviderLimit,
        extraProviderSeats: planState.extraProviderSeats,
        requiresPaidSeat,
        withinBase,
        seatPrice: EXTRA_SEAT_MONTHLY_PRICE,
        isSuitePlan: planState.isSuitePlan,
        isSoloPlan: planState.isSoloPlan,
      });
    } catch (err) {
      console.error("[SeatCheck]", err);
      res.status(500).json({ message: "Failed to check seat availability" });
    }
  });

  app.post("/api/clinic/invite-provider", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) return res.status(400).json({ message: "No clinic associated with your account" });
      const callerAdminRole = await getSessionAdminRole(req);
      if (callerAdminRole !== "owner" && callerAdminRole !== "admin") {
        return res.status(403).json({ message: "Only clinic owners or admins can invite providers." });
      }
      const { email, firstName, lastName, clinicalRole, adminRole, confirmExtraSeat } = req.body;
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ message: "email, firstName, and lastName are required" });
      }
      // Check if email already has a ClinIQ account
      const existingUser = await storage.getUserByEmail(email.trim().toLowerCase());
      if (existingUser) {
        return res.status(409).json({ message: "A clinician with this email already has a ClinIQ account. Ask them to contact support to join your clinic." });
      }

      // Resolve the clinic owner's subscription for billing operations
      const ownerSub = await resolveClinicOwnerSubscription(clinicId);
      const planState = await getClinicPlanState(clinicId, ownerSub.freeAccount, ownerSub.stripeSubscriptionId);
      if (planState.isSoloPlan) {
        return res.status(403).json({ message: "Solo plan supports only 1 provider. Upgrade to ClinIQ Suite to add additional providers." });
      }
      const pendingInvites = await storageDb
        .select({ id: clinicProviderInvites.id })
        .from(clinicProviderInvites)
        .where(and(eq(clinicProviderInvites.clinicId, clinicId), eq(clinicProviderInvites.status, "pending")));
      const effectiveCount = planState.activeProviderCount + pendingInvites.length;
      const requiresPaidSeat = !planState.isFreeAccount && planState.isSuitePlan && effectiveCount >= planState.maxProviders;

      if (requiresPaidSeat) {
        if (!confirmExtraSeat) {
          return res.status(402).json({
            requiresSeatConfirmation: true,
            seatPrice: EXTRA_SEAT_MONTHLY_PRICE,
            currentProviders: planState.activeProviderCount,
            pendingInvites: pendingInvites.length,
            maxIncluded: planState.baseProviderLimit,
            message: `Adding this provider will add $${EXTRA_SEAT_MONTHLY_PRICE}/month to your subscription. Please confirm to proceed.`,
          });
        }

        // Confirmed — add the extra seat via owner's Stripe subscription
        const SUITE_SEAT_PRICE_ID = process.env.STRIPE_PROVIDER_SEAT_PRICE_ID;
        if (!SUITE_SEAT_PRICE_ID || !ownerSub.stripeSubscriptionId) {
          return res.status(503).json({ message: "Provider seat billing is not configured. Contact support." });
        }
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(ownerSub.stripeSubscriptionId, { expand: ["items"] });
        const items: any[] = (subscription as any).items?.data ?? [];
        const seatItem = items.find((item: any) => item.price?.id === SUITE_SEAT_PRICE_ID);
        if (seatItem) {
          await stripe.subscriptionItems.update(seatItem.id, { quantity: (seatItem.quantity ?? 0) + 1 });
        } else {
          await stripe.subscriptionItems.create({ subscription: ownerSub.stripeSubscriptionId, price: SUITE_SEAT_PRICE_ID, quantity: 1 });
        }
        await updateClinicSeats(clinicId, (planState.extraProviderSeats ?? 0) + 1);
      }

      const inviteToken = crypto.randomBytes(32).toString('hex');
      const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
      const validClinicalRoles = ["provider", "nurse", "assistant", "staff"];
      const validAdminRoles = ["standard", "limited_admin", "admin"];
      const invite = await storage.createClinicProviderInvite({
        clinicId,
        invitedByUserId: user.id,
        email: email.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        clinicalRole: validClinicalRoles.includes(clinicalRole) ? clinicalRole : "provider",
        adminRole: validAdminRoles.includes(adminRole) ? adminRole : "standard",
        inviteToken,
        inviteExpires,
        status: "pending",
      });
      const clinic = await storageDb.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
      const clinicName = clinic[0]?.name || user.clinicName || "the clinic";
      const inviterName = `${user.firstName} ${user.lastName}`;
      sendProviderInviteEmail(
        invite.email,
        invite.firstName,
        clinicName,
        inviterName,
        inviteToken,
        req
      ).catch(err => console.error('[EMAIL] Provider invite email failed:', err));
      res.status(201).json({ success: true, invite, billingUpdated: requiresPaidSeat });
    } catch (err: any) {
      console.error('[API] Error inviting provider:', err);
      const detail = err?.message ?? String(err);
      const isTableMissing = detail.includes("does not exist") || detail.includes("relation");
      res.status(500).json({
        message: isTableMissing
          ? "Provider invite table not found in database. Please run the production migration SQL on your Cloud SQL instance."
          : "Failed to send provider invite",
        detail,
      });
    }
  });

  // POST /api/clinic/invites/:id/resend — resend a provider invite with a fresh token
  app.post("/api/clinic/invites/:id/resend", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) return res.status(400).json({ message: "No clinic associated with your account" });

      const callerAdminRole = await getSessionAdminRole(req);
      if (callerAdminRole !== "owner" && callerAdminRole !== "admin") {
        return res.status(403).json({ message: "Only clinic owners or admins can resend provider invites." });
      }

      const inviteId = parseInt(req.params.id);
      if (isNaN(inviteId)) return res.status(400).json({ message: "Invalid invite ID" });

      const rows = await storageDb.select().from(clinicProviderInvites)
        .where(and(eq(clinicProviderInvites.id, inviteId), eq(clinicProviderInvites.clinicId, clinicId), eq(clinicProviderInvites.status, "pending")))
        .limit(1);
      if (!rows.length) return res.status(404).json({ message: "Pending invite not found" });
      const invite = rows[0];

      const newToken = crypto.randomBytes(32).toString('hex');
      const newExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);

      await storageDb.update(clinicProviderInvites)
        .set({ inviteToken: newToken, inviteExpires: newExpires })
        .where(eq(clinicProviderInvites.id, inviteId));

      const clinic = await storageDb.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
      const clinicName = clinic[0]?.name || user.clinicName || "the clinic";
      const inviterName = `${user.firstName} ${user.lastName}`;

      const baseUrl = process.env.APP_URL
        || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}` : null)
        || `${req.protocol}://${req.get('host')}`;
      const inviteLink = `${baseUrl}/provider-set-password?token=${newToken}`;

      let emailSent = false;
      let emailError: string | null = null;
      try {
        await sendProviderInviteEmail(invite.email, invite.firstName, clinicName, inviterName, newToken, req);
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || 'Email send failed';
        console.error('[EMAIL] Provider invite resend failed:', err);
      }

      res.json({
        success: true,
        emailSent,
        emailError,
        inviteLink,
        recipientEmail: invite.email,
        message: emailSent
          ? "Invite email sent"
          : "Token refreshed, but the email could not be delivered. Use the link below to share manually.",
      });
    } catch (err) {
      console.error('[API] Error resending provider invite:', err);
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  // DELETE /api/clinic/invites/:id — revoke a pending provider invite
  app.delete("/api/clinic/invites/:id", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      const inviteId = parseInt(req.params.id);
      if (isNaN(inviteId)) return res.status(400).json({ message: "Invalid invite ID" });
      const invite = await storageDb.select().from(clinicProviderInvites)
        .where(and(eq(clinicProviderInvites.id, inviteId), eq(clinicProviderInvites.clinicId, clinicId)))
        .limit(1);
      if (!invite.length) return res.status(404).json({ message: "Invite not found" });
      await storage.deleteClinicProviderInvite(inviteId);
      res.json({ success: true });
    } catch (err) {
      console.error('[API] Error revoking clinic invite:', err);
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });

  // GET /api/join-clinic/:token — validate a provider invite token (no auth required)
  app.get("/api/join-clinic/:token", async (req, res) => {
    try {
      const invite = await storage.getClinicProviderInviteByToken(req.params.token);
      if (!invite) return res.status(404).json({ message: "Invite link is invalid or has expired." });
      if (invite.status !== "pending") return res.status(410).json({ message: "This invite has already been accepted." });
      if (new Date() > new Date(invite.inviteExpires)) {
        await storage.updateClinicProviderInviteStatus(invite.id, "expired");
        return res.status(410).json({ message: "This invite link has expired. Please ask the clinic to resend your invitation." });
      }
      const clinic = await storageDb.select().from(clinics).where(eq(clinics.id, invite.clinicId)).limit(1);
      res.json({
        valid: true,
        invite: {
          id: invite.id,
          firstName: invite.firstName,
          lastName: invite.lastName,
          email: invite.email,
          clinicalRole: invite.clinicalRole,
          adminRole: invite.adminRole,
          accessScope: (invite as any).accessScope ?? "full",
          credentials: (invite as any).credentials ?? null,
        },
        clinic: { name: clinic[0]?.name || "the clinic" },
      });
    } catch (err) {
      console.error('[API] Error validating join-clinic token:', err);
      res.status(500).json({ message: "Failed to validate invite" });
    }
  });

  // POST /api/join-clinic/:token — accept provider invite, create clinician account
  app.post("/api/join-clinic/:token", async (req, res) => {
    try {
      const invite = await storage.getClinicProviderInviteByToken(req.params.token);
      if (!invite || invite.status !== "pending" || new Date() > new Date(invite.inviteExpires)) {
        return res.status(410).json({ message: "Invite link is invalid or has expired." });
      }
      const { password, npi, title, phone, clinicPhone, clinicAddress } = req.body;
      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      // Identity check: an account *may* exist for this email if the user signed
      // up between invite-time and accept-time, OR if the inviter targeted an
      // already-registered prescriber from a different clinic. We try to LINK
      // rather than fail outright — but only if the NPI on the invite matches
      // the NPI on file (or one of the two is missing). That preserves the
      // unified email+NPI identity rule. A genuine NPI mismatch must be
      // rejected, since otherwise we'd be silently re-linking an unrelated
      // physician to this invite.
      const existingUser = await storage.getUserByEmail(invite.email);
      if (existingUser) {
        const inviteNpi = ((invite as any).npi ?? "").trim();
        const userNpi = (existingUser.npi ?? "").trim();
        const npiConflict = !!inviteNpi && !!userNpi && inviteNpi !== userNpi;
        if (npiConflict) {
          return res.status(409).json({
            message: "An account already exists for this email but its NPI does not match this invite. Contact the inviting clinic to re-issue the invite with the correct NPI.",
          });
        }
        // Linkable: short-circuit account creation and seat them on the
        // existing user. We rely on the chart-review collaborator add and
        // membership upsert paths from POST /external-collaborators when the
        // inviter retried with the right email; for the acceptance branch we
        // attach to clinic + agreement here directly.
        const isExternalReviewerLink = (invite as any).accessScope === "chart_review_only"
          || invite.clinicalRole === "external_reviewer";
        await storage.addUserToClinic(invite.clinicId, existingUser.id, invite.clinicalRole);
        await storageDb.update(clinicMemberships)
          .set({
            adminRole: invite.adminRole as any,
            clinicalRole: invite.clinicalRole as any,
            accessScope: isExternalReviewerLink ? "chart_review_only" : "full",
            acceptanceStatus: "active",
            isActive: true,
          } as any)
          .where(and(eq(clinicMemberships.clinicId, invite.clinicId), eq(clinicMemberships.userId, existingUser.id)));
        // Backfill NPI on the existing user if they had none.
        if (!userNpi && inviteNpi) {
          await storageDb.update(usersTable).set({ npi: inviteNpi }).where(eq(usersTable.id, existingUser.id));
        }
        const agreementIdLink = (invite as any).agreementId as number | null | undefined;
        if (agreementIdLink) {
          try {
            await chartReviewStorage.addChartReviewCollaborator(
              agreementIdLink,
              existingUser.id,
              "primary",
              invite.clinicId,
            );
          } catch (e) {
            console.warn("[invite-accept] linked-user agreement seat failed (non-fatal):", e);
          }
        }
        await storage.updateClinicProviderInviteStatus(invite.id, "accepted");
        return res.status(200).json({
          success: true,
          mode: "linked_existing_user",
          message: "Linked to your existing account. Sign in normally to access the new clinic.",
          accessScope: isExternalReviewerLink ? "chart_review_only" : "full",
        });
      }
      const passwordHash = await hashPassword(password);
      // Get clinic info for the new user
      const clinic = await storageDb.select().from(clinics).where(eq(clinics.id, invite.clinicId)).limit(1);
      const clinicName = clinic[0]?.name || "the clinic";
      // Resolve the clinic owner's subscription status so the invited user inherits it
      let inheritedSubStatus = "active";
      const ownerMembership = await storageDb
        .select({ userId: clinicMemberships.userId })
        .from(clinicMemberships)
        .where(and(eq(clinicMemberships.clinicId, invite.clinicId), eq(clinicMemberships.adminRole, "owner" as any)))
        .limit(1);
      if (ownerMembership.length) {
        const [ownerUser] = await storageDb.select().from(usersTable).where(eq(usersTable.id, ownerMembership[0].userId)).limit(1);
        if (ownerUser?.subscriptionStatus) {
          inheritedSubStatus = ownerUser.subscriptionStatus;
        }
      }
      // Create the new clinician account
      const newUser = await storage.createUser({
        email: invite.email,
        firstName: invite.firstName,
        lastName: invite.lastName,
        password: passwordHash,
        title: title?.trim() || null,
        npi: npi?.trim() || null,
        phone: phone?.trim() || null,
        clinicName,
        clinicPhone: clinicPhone?.trim() || null,
        clinicAddress: clinicAddress?.trim() || null,
        subscriptionStatus: inheritedSubStatus,
        defaultClinicId: invite.clinicId,
      } as any);
      const isExternalReviewer = (invite as any).accessScope === "chart_review_only"
        || invite.clinicalRole === "external_reviewer";

      // Add to clinic membership. For external reviewers we set the new
      // membership fields explicitly so the deny-list middleware engages
      // immediately on first login.
      await storage.addUserToClinic(invite.clinicId, newUser.id, invite.clinicalRole);
      await storageDb.update(clinicMemberships)
        .set({
          adminRole: invite.adminRole as any,
          clinicalRole: invite.clinicalRole as any,
          accessScope: isExternalReviewer ? "chart_review_only" : "full",
          acceptanceStatus: "active",
        })
        .where(and(eq(clinicMemberships.clinicId, invite.clinicId), eq(clinicMemberships.userId, newUser.id)));

      if (isExternalReviewer) {
        // External collaborating physicians are NOT billable clinic providers.
        // We deliberately skip the providers-table insert and any Stripe seat
        // bookkeeping. The seat was never consumed at invite time.
      } else {
        // Normal full-clinician path — provider profile, no agreement seating
        // (unless an agreementId was set at invite time, see below).
        try {
          await storageDb.insert(providersTable).values({
            clinicId: invite.clinicId,
            userId: newUser.id,
            displayName: `${invite.firstName} ${invite.lastName}`.trim(),
            npi: npi?.trim() || null,
          } as any);
        } catch {}
      }
      // Seat the new user on the chart-review agreement if the invite was
      // issued from the chart-review surface (works for both 'chart_review_only'
      // and 'full' invites — the inviting mid-level wants this physician on
      // their queue regardless of access scope).
      const agreementId = (invite as any).agreementId as number | null | undefined;
      if (agreementId) {
        try {
          await chartReviewStorage.addChartReviewCollaborator(
            agreementId,
            newUser.id,
            "primary",
            invite.clinicId,
          );
        } catch (e) {
          console.warn("[invite-accept] auto-seat collaborator failed (non-fatal):", e);
        }
      }

      // Mark invite as accepted
      await storage.updateClinicProviderInviteStatus(invite.id, "accepted");
      res.status(201).json({
        success: true,
        message: "Account created. You can now log in.",
        accessScope: isExternalReviewer ? "chart_review_only" : "full",
      });
    } catch (err: any) {
      console.error('[API] Error accepting clinic invite:', err);
      res.status(500).json({ message: err.message || "Failed to create account" });
    }
  });

  // GET /api/clinic/members — list all full-clinician members of this clinic (for team view)
  app.get("/api/clinic/members", requireClinicianOnly, async (req, res) => {
    try {
      const user = req.user as any;
      const clinicId = user.defaultClinicId;
      if (!clinicId) return res.json([]);
      const members = await storageDb
        .select({
          userId: clinicMemberships.userId,
          clinicalRole: clinicMemberships.clinicalRole,
          adminRole: clinicMemberships.adminRole,
          isActive: clinicMemberships.isActive,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: usersTable.email,
          title: usersTable.title,
        })
        .from(clinicMemberships)
        .innerJoin(usersTable, eq(clinicMemberships.userId, usersTable.id))
        .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.isActive, true)))
        .orderBy(clinicMemberships.adminRole);
      res.json(members.map(m => ({
        id: m.userId,
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        title: m.title,
        clinicalRole: m.clinicalRole,
        adminRole: m.adminRole,
        isOwner: m.adminRole === "owner",
        displayName: `${m.title ? m.title + " " : ""}${m.firstName} ${m.lastName}`.trim(),
      })));
    } catch (err) {
      console.error('[API] Error fetching clinic members:', err);
      res.status(500).json({ message: "Failed to fetch clinic members" });
    }
  });

  // GET /api/clinic/providers — list all providers/clinicians associated with the current user's clinic
  // Used to populate provider assignment dropdowns throughout the app
  app.get("/api/clinic/providers", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);

      if (clinicId) {
        // Multi-provider clinic: return all clinic members with a clinical role
        const members = await storageDb
          .select({
            userId: clinicMemberships.userId,
            clinicalRole: clinicMemberships.clinicalRole,
            adminRole: clinicMemberships.adminRole,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            title: usersTable.title,
            npi: usersTable.npi,
          })
          .from(clinicMemberships)
          .innerJoin(usersTable, eq(clinicMemberships.userId, usersTable.id))
          .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.isActive, true)))
          .orderBy(clinicMemberships.adminRole); // owners first

        const providers = members.map(m => ({
          id: m.userId,
          displayName: `${m.title ? m.title + " " : ""}${m.firstName} ${m.lastName}`.trim(),
          clinicalRole: m.clinicalRole,
          adminRole: m.adminRole,
          isOwner: m.adminRole === "owner",
        }));

        return res.json(providers);
      }

      // Solo: just return the current clinician
      const me = await storage.getUserById(clinicianId);
      if (!me) return res.json([]);
      return res.json([{
        id: me.id,
        displayName: `${me.title ? me.title + " " : ""}${me.firstName} ${me.lastName}`.trim(),
        clinicalRole: "provider",
        adminRole: "owner",
        isOwner: true,
      }]);
    } catch (err) {
      console.error("[API] Error fetching clinic providers:", err);
      res.status(500).json({ message: "Failed to fetch providers" });
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
      phenotypeKeys: PHENOTYPE_KEYS,
    });
  });

  // ── Clinician Preferences: Supplement Discount Settings ───────────────────
  app.get("/api/preferences/discount", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const settings = await storage.getClinicianSupplementSettings(clinicianId);
      // Return defaults if not yet configured
      res.json(settings || { clinicianId, discountType: 'percent', discountPercent: 20, discountFlat: 0, supplementMode: 'defaults_plus_custom' });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch discount settings" });
    }
  });

  app.put("/api/preferences/discount", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const { discountType, discountPercent, discountFlat, supplementMode } = req.body;
      const allowedModes = new Set(['defaults_plus_custom', 'custom_only']);
      const safeMode = allowedModes.has(supplementMode) ? supplementMode : undefined;
      const updated = await storage.upsertClinicianSupplementSettings(clinicianId, {
        discountType: discountType || 'percent',
        discountPercent: discountPercent ?? 20,
        discountFlat: discountFlat ?? 0,
        ...(safeMode ? { supplementMode: safeMode } : {}),
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
      const preferences = await storage.getClinicianLabPreferences(clinicianId);
      res.json({ preferences, defaults: LAB_MARKER_DEFAULTS });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch lab range preferences" });
    }
  });

  app.put("/api/preferences/lab-ranges", requireClinicianOnly, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
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
      const clinicId = getEffectiveClinicId(req);
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

      const clinicalPrompt = buildWhisperPrompt(visitType);

      type RawSegment = { id: number; start: number; end: number; text: string };
      const allSegments: RawSegment[] = [];
      const textParts: string[] = [];
      let segOffset = 0;

      for (const seg of audioSegments) {
        const stream = fs.createReadStream(seg);

        let verboseResult: any = null;

        // Try gpt-4o-transcribe first — uses 'json' format (verbose_json not supported)
        try {
          const result = await openai.audio.transcriptions.create({
            model: 'gpt-4o-transcribe',
            file: stream,
            response_format: 'json',
            language: 'en',
            prompt: clinicalPrompt,
          } as any);
          // json format returns { text } only — no segments
          verboseResult = { text: typeof result === 'string' ? result : (result as any).text || '', segments: [] };
        } catch (modelErr: any) {
          console.warn('[Transcribe] gpt-4o-transcribe unavailable, falling back to whisper-1:', modelErr.message);
          const stream2 = fs.createReadStream(seg);
          verboseResult = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: stream2,
            response_format: 'verbose_json',
            language: 'en',
            prompt: clinicalPrompt,
            temperature: 0,
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
      const clinicId = getEffectiveClinicId(req);
      const patientId = req.query.patientId ? parseInt(req.query.patientId as string) : undefined;
      const encounters = await storage.getEncountersByClinicianId(clinicianId, patientId, clinicId);
      res.json(encounters);
    } catch (err) {
      res.status(500).json({ message: "Failed to load encounters" });
    }
  });

  // GET /api/encounters/open?providerId=N — list unsigned encounters for a target provider in this clinic.
  // Defaults to the requesting user. providerId must be an active member of the requester's clinic.
  app.get("/api/encounters/open", requireAuth, async (req, res) => {
    try {
      const requesterId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);

      let providerId = requesterId;
      if (req.query.providerId !== undefined) {
        const parsed = parseInt(req.query.providerId as string, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          return res.status(400).json({ message: "Invalid providerId" });
        }
        providerId = parsed;
      }

      // If the caller asks for someone else, verify that user is in the same clinic.
      if (providerId !== requesterId) {
        if (!clinicId) {
          return res.status(403).json({ message: "Cross-provider access not permitted" });
        }
        const [membership] = await storageDb
          .select({ userId: clinicMemberships.userId })
          .from(clinicMemberships)
          .where(
            and(
              eq(clinicMemberships.clinicId, clinicId),
              eq(clinicMemberships.userId, providerId),
              eq(clinicMemberships.isActive, true),
            ),
          )
          .limit(1);
        if (!membership) {
          return res.status(403).json({ message: "Provider is not a member of your clinic" });
        }
      }

      // Only allow the legacy `clinicId IS NULL` fallback for the user's *own* records.
      const providerScope = clinicId
        ? providerId === requesterId
          ? and(
              eq(clinicalEncounters.clinicianId, providerId),
              or(
                eq(clinicalEncounters.clinicId, clinicId),
                isNull(clinicalEncounters.clinicId),
              ),
            )
          : and(
              eq(clinicalEncounters.clinicianId, providerId),
              eq(clinicalEncounters.clinicId, clinicId),
            )
        : eq(clinicalEncounters.clinicianId, providerId);

      const encounterRows = await storageDb
        .select({
          id: clinicalEncounters.id,
          clinicianId: clinicalEncounters.clinicianId,
          patientId: clinicalEncounters.patientId,
          visitDate: clinicalEncounters.visitDate,
          visitType: clinicalEncounters.visitType,
          chiefComplaint: clinicalEncounters.chiefComplaint,
          soapGeneratedAt: clinicalEncounters.soapGeneratedAt,
          updatedAt: clinicalEncounters.updatedAt,
          patientFirstName: patientsTable.firstName,
          patientLastName: patientsTable.lastName,
        })
        .from(clinicalEncounters)
        .innerJoin(patientsTable, eq(clinicalEncounters.patientId, patientsTable.id))
        .where(and(providerScope, isNull(clinicalEncounters.signedAt)))
        .orderBy(desc(clinicalEncounters.updatedAt));

      const encounterItems = encounterRows.map((r) => ({ ...r, kind: "encounter" as const }));

      // Transcription drafts (recordings without an attached patient yet) live in
      // encounter_drafts and are owned by the requesting clinician only. We surface
      // them at the top of the "open notes" list so they're not buried under "New
      // Encounter".  We only show drafts when looking at our own queue.
      let draftItems: Array<{
        kind: "draft";
        id: number;
        clinicianId: number;
        transcription: string;
        visitDate: string;
        visitType: string;
        createdAt: Date;
      }> = [];
      if (providerId === requesterId) {
        try {
          const drafts = await storage.getEncounterDrafts(requesterId);
          draftItems = drafts.map((d) => ({ ...d, kind: "draft" as const }));
        } catch (e) {
          console.warn("[Open Encounters] Failed to load drafts", e);
        }
      }

      res.json([...draftItems, ...encounterItems]);
    } catch (err) {
      console.error("[Open Encounters]", err);
      res.status(500).json({ message: "Failed to load open encounters" });
    }
  });

  // GET /api/clinic/users — list provider members of the requester's clinic for use in
  // the dashboard "view open notes by provider" selector. Available to any authed user.
  // Note: clinician_staff rows have no users.id link and cannot own encounters, so they
  // are intentionally excluded — only entries here are valid encounter clinicianId values.
  app.get("/api/clinic/users", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const requesterId = getClinicianId(req);
      const me = await storage.getUserById(requesterId);
      const meEntry = me ? {
        id: me.id,
        firstName: me.firstName,
        lastName: me.lastName,
        title: me.title ?? null,
        kind: "provider" as const,
        displayName: `${me.title ? me.title + " " : ""}${me.firstName} ${me.lastName}`.trim(),
      } : null;

      if (!clinicId) {
        return res.json(meEntry ? [meEntry] : []);
      }

      const memberRows = await storageDb
        .select({
          userId: clinicMemberships.userId,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          title: usersTable.title,
        })
        .from(clinicMemberships)
        .innerJoin(usersTable, eq(clinicMemberships.userId, usersTable.id))
        .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.isActive, true)));

      const seen = new Set<number>();
      const out: Array<{ id: number; firstName: string; lastName: string; title: string | null; kind: "provider" | "staff"; displayName: string }> = [];

      for (const m of memberRows) {
        if (seen.has(m.userId)) continue;
        seen.add(m.userId);
        out.push({
          id: m.userId,
          firstName: m.firstName,
          lastName: m.lastName,
          title: m.title ?? null,
          kind: "provider",
          displayName: `${m.title ? m.title + " " : ""}${m.firstName} ${m.lastName}`.trim(),
        });
      }

      // Always ensure the requester themselves is in the list (covers users without a
      // membership row, e.g. legacy single-tenant accounts).
      if (meEntry && !seen.has(meEntry.id)) {
        out.unshift(meEntry);
      }

      out.sort((a, b) => a.displayName.localeCompare(b.displayName));
      res.json(out);
    } catch (err) {
      console.error("[Clinic Users]", err);
      res.status(500).json({ message: "Failed to load clinic users" });
    }
  });

  // POST /api/encounters — create new encounter
  app.post("/api/encounters", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const { patientId, visitDate, visitType, chiefComplaint, linkedLabResultId, clinicianNotes, transcription, noteType, phoneContact, soapNote } = req.body;
      if (!patientId || !visitDate) return res.status(400).json({ message: "patientId and visitDate are required" });

      // PATIENT-SAFETY: Verify the patient belongs to this clinician's clinic
      // before creating an encounter against them. Without this check the
      // server would happily attach any encounter (and subsequent SOAP, AI
      // chat context, etc.) to any patient ID the client sends, which is
      // both an authorization gap and a vector for cross-patient data leaks
      // (e.g. a stale-closure client bug sending the wrong patientId).
      const parsedPatientId = parseInt(patientId);
      const patient = await storage.getPatient(parsedPatientId, clinicianId, clinicId);
      if (!patient) {
        return res.status(403).json({ message: "Patient not found or not in your scope" });
      }

      const encounter = await storage.createEncounter({
        clinicianId,
        clinicId,
        patientId: parsedPatientId,
        visitDate: new Date(visitDate),
        visitType: visitType || 'follow-up',
        chiefComplaint: chiefComplaint || null,
        linkedLabResultId: linkedLabResultId ? parseInt(linkedLabResultId) : null,
        clinicianNotes: clinicianNotes || null,
        transcription: transcription || null,
        audioProcessed: false,
        soapNote: soapNote || null,
        patientSummary: null,
        summaryPublished: false,
        noteType: noteType || 'soap_provider',
        phoneContact: phoneContact || null,
      } as any);
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
      const clinicId = getEffectiveClinicId(req);
      const encounter = await storage.getEncounter(parseInt(req.params.id), clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const { visitDate, visitType, chiefComplaint, transcription, audioProcessed, linkedLabResultId, clinicianNotes, diarizedTranscript, clinicalExtraction, evidenceSuggestions, expectedPatientId } = req.body;

      // PATIENT-SAFETY: stale-context tripwire. If the client tells us which
      // patient the UI thinks this encounter belongs to and it doesn't match,
      // refuse to write. Protects against stale-closure/cached-state bugs.
      if (expectedPatientId !== undefined && expectedPatientId !== null) {
        const exp = parseInt(String(expectedPatientId));
        if (!Number.isFinite(exp)) {
          return res.status(400).json({ message: "Invalid expectedPatientId" });
        }
        const existing = await storage.getEncounter(id, clinicianId, clinicId);
        if (!existing) return res.status(404).json({ message: "Encounter not found" });
        if (existing.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: this encounter belongs to a different patient than the one currently shown. Refresh and verify.",
            encounterPatientId: existing.patientId,
            expectedPatientId: exp,
          });
        }
      }

      // Slice 2 prospective-gate: chart parked for collaborating-physician
      // review is read-only until the physician concurs (which finalizes the
      // sign) or rejects (which unlocks for editing).
      const lockCheck = await storage.getEncounter(id, clinicianId, clinicId);
      if (lockCheck?.pendingCollabReview) {
        return res.status(423).json({
          message: "This chart is locked pending collaborating-physician review and cannot be edited.",
        });
      }

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
      }, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const { soapNote, expectedPatientId } = req.body;

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (expectedPatientId !== undefined && expectedPatientId !== null) {
        const exp = parseInt(String(expectedPatientId));
        if (!Number.isFinite(exp)) {
          return res.status(400).json({ message: "Invalid expectedPatientId" });
        }
        const existing = await storage.getEncounter(id, clinicianId, clinicId);
        if (!existing) return res.status(404).json({ message: "Encounter not found" });
        if (existing.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: this encounter belongs to a different patient than the one currently shown. Refresh and verify before saving the SOAP.",
            encounterPatientId: existing.patientId,
            expectedPatientId: exp,
          });
        }
      }

      // Slice 2 prospective-gate: SOAP edits blocked while pending review.
      const lockCheck = await storage.getEncounter(id, clinicianId, clinicId);
      if (lockCheck?.pendingCollabReview) {
        return res.status(423).json({
          message: "This SOAP note is locked pending collaborating-physician review and cannot be edited.",
        });
      }

      const updated = await storage.updateEncounter(id, clinicianId, { soapNote }, clinicId);
      if (!updated) return res.status(404).json({ message: "Encounter not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to save SOAP note" });
    }
  });

  // POST /api/encounters/:id/sign — Sign and lock a SOAP note (EMR-style)
  // Stores a version snapshot for audit trail. Sets signedAt + signedBy.
  // Authorization: nurses/staff can only sign nurse and phone notes;
  // provider SOAP notes require a logged-in provider (clinician).
  app.post("/api/encounters/:id/sign", requireAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      const isStaff = !!sess?.staffId;
      const staffRole: string = (sess?.staffClinicalRole ?? "").toLowerCase();
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      let encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire — never sign+lock a chart that
      // belongs to a different patient than the UI is showing. Run this
      // BEFORE persisting any edited soapNote so a stale UI never overwrites
      // another patient's note.
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to sign — this encounter belongs to a different patient than the one currently shown.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

      // Persist any unsaved SOAP edits sent with the sign request so the
      // signed snapshot reflects what the clinician saw on screen, not the
      // last separately-saved version. The client now always sends `soapNote`
      // with the sign payload; legacy callers that omit it still work.
      if (req.body?.soapNote !== undefined && req.body?.soapNote !== null) {
        const persisted = await storage.updateEncounter(
          id,
          clinicianId,
          { soapNote: req.body.soapNote },
          clinicId,
        );
        if (persisted) encounter = persisted;
      }
      if (!encounter.soapNote) return res.status(400).json({ message: "No SOAP note to sign." });

      const noteType = (encounter as any).noteType ?? "soap_provider";
      if (noteType === "soap_provider" && isStaff) {
        return res.status(403).json({
          message: "Only providers can sign provider SOAP notes. Nurses and staff may sign nurse and phone notes.",
        });
      }

      const clinician = await storage.getUserById(clinicianId);
      if (!clinician) return res.status(404).json({ message: "Clinician not found" });

      // Build display name — for staff sessions, prefer the staff member's name.
      let nameParts: string;
      let credential: string | null = null;
      if (isStaff) {
        const staffFirst = sess.staffFirstName ?? "";
        const staffLast = sess.staffLastName ?? "";
        nameParts = `${staffFirst} ${staffLast}`.trim();
        if (staffRole === "rn") credential = "RN";
        else if (staffRole) credential = staffRole.toUpperCase();
      } else {
        nameParts = [clinician.title, clinician.firstName, clinician.lastName].filter(Boolean).join(" ");
      }
      const signedBy = clinician.npi
        ? `${nameParts}${credential ? `, ${credential}` : ""} (NPI: ${clinician.npi})`
        : `${nameParts}${credential ? `, ${credential}` : ""}`;

      const now = new Date();

      // ── Prospective collaborating-physician gate ────────────────────────
      // If the mid-level is under a Prospective agreement and this chart hits
      // a mandatory rule (controlled substance / new diagnosis), we DON'T
      // finalize the sign. Instead the chart is locked-pending-review: edits
      // are blocked, but signedAt stays null until the physician concurs.
      // Skip entirely for staff sessions, non-provider notes, amendments to
      // already-signed charts, and missing clinic context.
      const existingVersionsForGate = (encounter.encounterVersions as any[] | null) ?? [];
      const isAmendmentSign = !!encounter.signedAt || existingVersionsForGate.length > 0 || !!encounter.isAmended;
      if (!isStaff && noteType === "soap_provider" && clinicId && !isAmendmentSign) {
        try {
          const gate = await chartReviewStorage.getProspectiveGateState({
            encounterId: id,
            midLevelUserId: clinicianId,
            clinicId,
          });
          if (gate.shouldGate && gate.agreement) {
            // Atomic park-and-queue: encounter lock + chart_review_item
            // insert happen in one DB transaction. If the queue write
            // fails, the encounter is NOT left half-locked.
            const { item, encounter: updatedGated } = await chartReviewStorage.submitProspectiveChartForReview({
              encounterId: id,
              midLevelUserId: clinicianId,
              clinicId,
              agreement: gate.agreement,
              reasons: gate.reasons,
              parkEncounter: { signedBy },
            });
            if (!updatedGated || !item) {
              // Defense-in-depth: if the atomic submission fails for any
              // reason, fall through to the standard (retrospective) sign
              // path rather than block the user. The post-sign hook below
              // will still queue the chart for review retrospectively.
              console.warn('[Sign] prospective parking failed, falling back to retrospective sign for encounter', id);
            } else {
              return res.json({
                ...updatedGated,
                chartReviewItem: item,
                pendingReview: true,
                prospectiveGate: true,
              });
            }
          }
        } catch (e) {
          // Defense-in-depth: if the gate calculation itself fails, fall
          // through to standard sign rather than block the user. The
          // post-sign enqueue hook below will still queue retrospectively.
          console.warn('[Sign] prospective gate check failed (non-fatal):', (e as any)?.message ?? e);
        }
      }

      // Build version snapshot for audit trail
      const existingVersions = existingVersionsForGate;
      const isAlreadySigned = isAmendmentSign;
      const newVersion = {
        version: existingVersions.length + 1,
        soapNote: encounter.soapNote,
        signedAt: now.toISOString(),
        signedBy,
        action: isAlreadySigned ? "amendment" : "initial_sign",
      };

      const updated = await storage.updateEncounter(id, clinicianId, {
        signedAt: now,
        signedBy,
        isAmended: isAlreadySigned,
        amendedAt: isAlreadySigned ? now : undefined,
        encounterVersions: [...existingVersions, newVersion],
        // If this is an amendment of a previously prospectively-gated chart,
        // clear the pending flag — the signedAt above represents a fresh
        // initial physician concur or an unrelated amendment path.
        pendingCollabReview: false,
        lockedAt: now,
      } as any, clinicId);

      // Collaborating-physician chart review hook. Provider SOAPs only;
      // skip for nurse/phone notes signed by staff. Never blocks the response.
      let chartReviewItem: any = null;
      try {
        if (!isStaff && noteType === "soap_provider" && clinicId) {
          chartReviewItem = await chartReviewStorage.enqueueChartForReviewIfApplicable({
            encounterId: id,
            midLevelUserId: clinicianId,
            clinicId,
            sendForReview: !!req.body?.sendForReview,
          });
        }
      } catch (e) {
        console.warn('[Sign] chart-review enqueue failed (non-fatal):', (e as any)?.message ?? e);
      }

      res.json({ ...updated, chartReviewItem });
    } catch (err) {
      console.error('[Sign] Error:', err);
      res.status(500).json({ message: "Failed to sign note." });
    }
  });

  // POST /api/encounters/:id/amend — Unlock a signed note for amendment
  // Clears signedAt so the note becomes editable again. The previous signed version
  // is preserved in encounterVersions for audit purposes.
  app.post("/api/encounters/:id/amend", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire — refuse to unlock the wrong
      // patient's signed chart (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to amend — this encounter belongs to a different patient than the one currently shown.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

      // Slice 2: a chart parked for collaborating-physician review can NOT
      // be unilaterally amended out of that state. The mid-level must wait
      // for the physician to either concur (which finalizes the sign and
      // makes amendment possible) or reject (which auto-clears the lock).
      if (encounter.pendingCollabReview) {
        return res.status(423).json({
          message: "This chart is awaiting collaborating-physician review. You cannot amend it until the physician concurs or rejects it.",
        });
      }

      const updated = await storage.updateEncounter(id, clinicianId, {
        signedAt: null,
        signedBy: null,
        // Clear the lock timestamp too so the chart is fully editable again.
        lockedAt: null,
      } as any, clinicId);

      res.json(updated);
    } catch (err) {
      console.error('[Amend] Error:', err);
      res.status(500).json({ message: "Failed to open note for amendment." });
    }
  });

  // POST /api/encounters/:id/normalize — Stage 2: Diarize + normalize medical terms
  // Input: raw utterances (from transcription) or raw transcription text
  // Output: diarized utterances with speaker labels and corrected medical terms
  app.post("/api/encounters/:id/normalize", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to normalize — this encounter belongs to a different patient.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

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

      await storage.updateEncounter(id, clinicianId, { diarizedTranscript: diarized }, clinicId);

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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to extract — this encounter belongs to a different patient.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

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

LAB LEVEL TARGETS vs MEDICATION DOSES — CRITICAL RULE:
When a clinician says "increase vitamin D to 60-80" or "optimize vitamin D to 60-80 ng/mL", the number is a LAB LEVEL TARGET (a goal serum level), NOT a medication dose.
- Phrases like "increase X to [range]", "optimize X to [range]", "target X to [range]", "get X to [range]" where X is a vitamin, mineral, or lab marker describe a clinical goal, NOT a medication order.
- These belong in plan_candidates (e.g., "Target vitamin D (25-OH) to 60–80 ng/mL") — NEVER in uncertain_items and NEVER as a medication with unrecognized dosing.
- Common examples of lab-level targets (never flag these as uncertain): vitamin D to 60-80, TSH to 1-2, ferritin to 70-100, testosterone to X, A1c to <6.5, B12 to 800-1000.
- Only flag as uncertain_items if a word genuinely appears to be a garbled or unknown DRUG NAME that you cannot identify at all.
- Vitamins, minerals, and standard supplements (vitamin D, vitamin B12, vitamin C, omega-3, magnesium, zinc, iron, folate, CoQ10, etc.) are NEVER uncertain — they are well-known agents. Record them in medication_changes_discussed (if a dose/supplement amount is stated) or plan_candidates (if a lab level target is stated).

MEDICATION LIST CONTEXT — CRITICAL RULE:
A clinician may recite a broad list of medications the CLINIC prescribes in general (a "formulary recitation") while teaching, presenting options, or explaining their practice. This is NOT the patient's medication list.
PATIENT-SPECIFIC vs. GENERAL FORMULARY — how to tell the difference:
- PATIENT-SPECIFIC (include in medications_current): "she is on X", "he takes X", "patient is currently on X", "patient's medications include X", "she's been on X for [duration]", "continues on X", "patient started X [time] ago"
- GENERAL FORMULARY (DO NOT include in medications_current): a rapid succession of 8+ medications spanning unrelated drug classes; "we prescribe X", "we use X", "patients at our clinic are on X"; any list covering treatments across many unrelated conditions simultaneously
- DECISIVE TEST: If more than 8-10 medications across 4+ unrelated drug classes are listed in a short span with no "patient takes" framing, treat the entire list as a FORMULARY DISCUSSION — put NONE of those as medications_current. The patient's actual medications will be mentioned separately with explicit attribution.
- When formulary medications ARE also explicitly stated as patient-specific (e.g., "she's on spironolactone" after a general list), ONLY THEN add them to medications_current.

MEDICATION TENSE & INTENT — CRITICAL RULE:
You MUST distinguish between what the patient is CURRENTLY taking vs what the clinician is RECOMMENDING they begin:
- medications_current = medications the patient is already taking RIGHT NOW at the time of the visit
  → Triggered by: "she is on", "he takes", "currently taking", "has been on", "patient is on", "continues on", "she's been on for X weeks/months", "patient's medications include"
- medication_changes_discussed = medications being RECOMMENDED, STARTED, STOPPED, ADJUSTED, or PLANNED at this visit
  → Triggered by: "I recommend starting", "we'll begin", "I'd like to add", "we'll add once", "let's start", "I'm going to start her on", "she should start", "I recommended", "plan to initiate", "we'll hold off on X until Y"
EXAMPLES:
  - "I recommended starting progesterone" → medication_changes_discussed: ["Start progesterone (new — clinician recommendation)"]
  - "Once stable on progesterone we'll add estrogen" → medication_changes_discussed: ["Add estrogen once stable on progesterone (future plan)"]
  - "She's been on tirzepatide 15mg for 3 months" → medications_current: ["Tirzepatide 15mg SQ weekly"]
  - "I said we'd consider adding testosterone later" → medication_changes_discussed only — NOT medications_current
  - "Increase vitamin D to 60-80" → plan_candidates: ["Target vitamin D (25-OH) to 60–80 ng/mL"] — NOT uncertain_items
When in doubt about whether a drug is current vs recommended, put the item in medication_changes_discussed — never assume a recommended drug is current.

UNCERTAIN_ITEMS — STRICT CLASSIFICATION RULES:
- uncertain_items is EXCLUSIVELY for garbled, misheard, or completely unidentifiable DRUG NAMES — single words or short noun phrases that appear to be a medication but cannot be identified.
- NEVER put plan items, action items, monitoring instructions, assessment phrases, or follow-up items in uncertain_items. These belong in plan_candidates, follow_up_items, or medication_changes_discussed.
- Phrases that START WITH a verb (e.g., "Monitor...", "Assess...", "Evaluate...", "Continue...", "Adjust...", "Optimize...", "Check...", "Follow up...", "Consider...") are ALWAYS plan/follow-up items — NEVER uncertain_items.
- If a phrase contains a well-known medication name (testosterone, estrogen, tirzepatide, metformin, etc.) it is NOT uncertain — route it to the correct field (medication_changes_discussed, plan_candidates, or follow_up_items).
- Examples of what IS an uncertain_item: "testozepam" (garbled word, unknown drug), "lopatinide" (sounds like a drug but can't be identified)
- Examples of what is NOT an uncertain_item: "Monitor symptom improvement with low-dose estrogen patch" (plan item → plan_candidates), "Assess effectiveness of testosterone adjustments" (follow-up → follow_up_items), "Evaluate response to tirzepatide" (follow-up → follow_up_items)

PSYCHIATRIC / SLEEP MEDICATIONS — MANDATORY DIAGNOSIS INFERENCE RULE:
When a patient's medications_current includes any psychiatric or sleep medication, you MUST include the corresponding condition in diagnoses_discussed or assessment_candidates:
- Antidepressants (vortioxetine/Trintellix, sertraline/Zoloft, fluoxetine/Prozac, escitalopram/Lexapro, venlafaxine/Effexor, duloxetine/Cymbalta, bupropion/Wellbutrin, mirtazapine/Remeron, nortriptyline, amitriptyline): Add "Major depressive disorder" or "Anxiety disorder" — use the stated indication if known
- Trazodone: Add "Insomnia" and/or "Depressive disorder" as assessment_candidates
- Benzodiazepines (alprazolam, lorazepam, clonazepam): Add "Anxiety disorder" to diagnoses_discussed
- Sleep aids (zolpidem, eszopiclone, suvorexant): Add "Insomnia" to diagnoses_discussed

DRUG CLASS NAMES — CRITICAL RULE:
When a DRUG CLASS is mentioned (e.g., "GLP-1", "statin", "SSRI", "progesterone") without naming a specific drug:
- Record ONLY the class name — do NOT enumerate or infer specific drugs within that class
- Example: clinician says "GLP-1" without naming a drug → record "GLP-1 receptor agonist (class)" — NOT "semaglutide" or "tirzepatide"
- If a specific drug is ALSO mentioned in the transcript (e.g., "tirzepatide 15mg"), record that specific drug and note it resolves the class mention
- NEVER add a drug to medications_current or medication_changes_discussed unless it was explicitly named or its class was the ONLY reference (keep as class name, not specific drug)

WHOLE-VISIT EXTRACTION — CRITICAL RULE:
Treat the encounter as a TOTAL WELLNESS VISIT, not a narrow single-issue visit. Even if the visit focus is hormones, menopause, or weight loss, capture the FULL clinically relevant conversation:
- Scan the ENTIRE transcript for medications — not just a "medication section." If a medication is mentioned anywhere in relevant conversation (during history-taking, while discussing symptoms, in passing), capture it.
- Capture secondary concerns discussed during the visit even if they are not the primary reason for the encounter.
- Capture lifestyle factors, mental health context, prior treatments, side effects, allergies, surgical history, family history, and social history when mentioned.

CONTEXT CLUE REQUIREMENT:
Use context clues to capture clinically relevant information, but do not hallucinate:
- If something is strongly supported by transcript context, capture it in the appropriate field.
- If something is implied but not explicitly confirmed, capture it in "context_inferred_items" with cautious phrasing.
- Do NOT omit relevant details just because they were mentioned casually during the encounter.

Return this exact JSON structure (all arrays, even if empty):
{
  "visit_type": "",
  "chief_concerns": [],
  "secondary_concerns": [],
  "symptoms_reported": [],
  "symptoms_denied": [],
  "medications_current": [],
  "medication_changes_discussed": [],
  "supplements_current": [],
  "labs_reviewed": [],
  "allergies": [],
  "past_medical_history": [],
  "surgical_history": [],
  "family_history": [],
  "social_history": [],
  "mental_health_context": [],
  "lifestyle_factors": [],
  "prior_treatments_and_trials": [],
  "side_effects_reported": [],
  "diagnoses_discussed": [],
  "assessment_candidates": [],
  "plan_candidates": [],
  "follow_up_items": [],
  "patient_questions": [],
  "red_flags": [],
  "uncertain_items": [],
  "context_inferred_items": [],
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

      if (Array.isArray(extraction.uncertain_items)) {
        const ACTION_VERB_PATTERN = /^(monitor|assess|evaluate|continue|adjust|optimize|check|follow|consider|review|titrate|taper|increase|decrease|start|stop|discontinue|order|schedule|refer|counsel|educate|target|maintain|obtain|ensure|verify|confirm|discuss|recommend|initiate|plan|manage|track|watch|observe|recheck|measure|repeat|address|complete|begin|transition|switch|add|remove|reduce|modify|update|document)/i;
        const KNOWN_MEDS_PATTERN = /\b(testosterone|estrogen|estradiol|progesterone|tirzepatide|semaglutide|liraglutide|metformin|levothyroxine|liothyronine|spironolactone|finasteride|dutasteride|anastrozole|letrozole|tamoxifen|clomiphene|enclomiphene|gonadorelin|hcg|dhea|pregnenolone|oxandrolone|nandrolone|stanozolol|sildenafil|tadalafil|vardenafil|avanafil|cabergoline|bromocriptine|naltrexone|bupropion|sertraline|escitalopram|fluoxetine|venlafaxine|duloxetine|trazodone|buspirone|alprazolam|lorazepam|clonazepam|diazepam|zolpidem|gabapentin|pregabalin|topiramate|phentermine|orlistat|vitamin\s*d|vitamin\s*b12|omega|magnesium|zinc|iron|folate|coq10|melatonin|ashwagandha|berberine)\b/i;

        const misclassified: string[] = [];
        extraction.uncertain_items = extraction.uncertain_items.filter((item: string) => {
          if (ACTION_VERB_PATTERN.test(item.trim())) {
            misclassified.push(item);
            return false;
          }
          if (item.split(/\s+/).length > 4 && KNOWN_MEDS_PATTERN.test(item)) {
            misclassified.push(item);
            return false;
          }
          return true;
        });

        if (misclassified.length > 0) {
          if (!Array.isArray(extraction.plan_candidates)) extraction.plan_candidates = [];
          extraction.plan_candidates.push(...misclassified);
        }
      }

      await storage.updateEncounter(id, clinicianId, { clinicalExtraction: extraction }, clinicId);

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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to generate evidence — this encounter belongs to a different patient.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

      const extraction = encounter.clinicalExtraction as any;
      // No hard guard — evidence falls back to raw transcription if extraction hasn't been run yet

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // ── Build rich visit context including SOAP plan and lab interpretation ──
      const soapNote = encounter.soapNote as any;
      const soapPlan = soapNote?.fullNote
        ? (() => {
            const note: string = soapNote.fullNote;
            const apIdx = note.indexOf("ASSESSMENT/PLAN");
            const fuIdx = note.indexOf("FOLLOW-UP");
            const start = apIdx !== -1 ? apIdx : 0;
            const end = fuIdx !== -1 ? fuIdx + note.slice(fuIdx).indexOf("\n\n") : note.length;
            return note.slice(start, end > start ? end : note.length).trim();
          })()
        : null;

      // Lab interpretation context for patient-specific guideline applicability
      let labInterpContext = "";
      if (encounter.linkedLabResultId) {
        const linkedLab = await storage.getLabResult(encounter.linkedLabResultId);
        if (linkedLab?.interpretationResult) {
          const li = linkedLab.interpretationResult as any;
          const labCtxLines: string[] = [];
          if (li.redFlags?.length) labCtxLines.push(`Red flags: ${li.redFlags.map((f: any) => `${f.marker} (${f.severity})`).join(', ')}`);
          if (li.preventRisk) {
            const pr = li.preventRisk;
            const rParts = [
              pr.tenYearCVD != null ? `10yr CVD ${pr.tenYearCVD}%` : null,
              pr.thirtyYearCVD != null ? `30yr CVD ${pr.thirtyYearCVD}%` : null,
              pr.riskCategory ? `category: ${pr.riskCategory}` : null,
            ].filter(Boolean);
            if (rParts.length) labCtxLines.push(`PREVENT CVD risk: ${rParts.join(', ')}`);
          }
          if (li.insulinResistance?.detected) {
            labCtxLines.push(`Insulin resistance: detected — ${li.insulinResistance.phenotypes?.map((p: any) => p.name).join(', ') ?? 'unspecified'}`);
          }
          const notableAbnormal = (li.interpretations ?? [])
            .filter((i: any) => i.status && i.status !== "normal")
            .slice(0, 6)
            .map((i: any) => `${i.marker} [${i.status}]`);
          if (notableAbnormal.length) labCtxLines.push(`Notable lab findings: ${notableAbnormal.join(', ')}`);
          if (labCtxLines.length) labInterpContext = `\nLab interpretation: ${labCtxLines.join(' | ')}`;
        }
      }

      // ── Step 1: Generate focused clinical questions ──────────────────────────
      // Build visitContext from clinical extraction when available, otherwise fall
      // back to raw transcription so evidence can run in parallel with SOAP generation.
      const diarizedForEvidence = encounter.diarizedTranscript as any[] | null;
      const rawTranscriptFallback = diarizedForEvidence?.length
        ? diarizedForEvidence.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : (encounter.transcription ?? "");

      const visitContext = extraction
        ? [
            `Visit type: ${encounter.visitType}`,
            extraction.chief_concerns?.length ? `Chief concerns: ${extraction.chief_concerns.join('; ')}` : null,
            extraction.symptoms_reported?.length ? `Symptoms: ${extraction.symptoms_reported.join('; ')}` : null,
            extraction.diagnoses_discussed?.length ? `Diagnoses discussed: ${extraction.diagnoses_discussed.join('; ')}` : null,
            extraction.assessment_candidates?.length ? `Assessment candidates: ${extraction.assessment_candidates.join('; ')}` : null,
            extraction.medications_current?.length ? `Current meds: ${extraction.medications_current.join('; ')}` : null,
            extraction.medication_changes_discussed?.length ? `Medication changes: ${extraction.medication_changes_discussed.join('; ')}` : null,
            extraction.labs_reviewed?.length ? `Labs reviewed: ${extraction.labs_reviewed.join('; ')}` : null,
            extraction.red_flags?.length ? `Red flags: ${extraction.red_flags.join('; ')}` : null,
            labInterpContext || null,
            soapPlan ? `Current documented plan:\n${soapPlan}` : null,
          ].filter(Boolean).join('\n')
        : [
            `Visit type: ${encounter.visitType}`,
            `Chief complaint: ${encounter.chiefComplaint ?? "Not specified"}`,
            labInterpContext || null,
            soapPlan ? `Current documented plan:\n${soapPlan}` : null,
            rawTranscriptFallback ? `Transcript:\n${rawTranscriptFallback}` : null,
          ].filter(Boolean).join('\n');

      let questionsCompletion;
      try {
        questionsCompletion = await openai.chat.completions.create({
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
      } catch (err: any) {
        console.error('[Evidence] Stage 1 (questions) failed:', err?.status, err?.message);
        const status = err?.status === 429 ? 429 : 502;
        return res.status(status).json({
          message: err?.status === 429
            ? "Evidence service is rate-limited. Please try again in a moment."
            : `Evidence service unavailable: ${err?.message ?? "unknown error"}. Please try again.`,
        });
      }

      let clinicalQuestions: string[] = [];
      try {
        const questionsRaw = JSON.parse(questionsCompletion.choices[0].message.content || "{}");
        clinicalQuestions = (questionsRaw.clinical_questions ?? []).slice(0, 5);
      } catch (err: any) {
        console.error('[Evidence] Stage 1 parse failed:', err?.message);
      }

      if (clinicalQuestions.length === 0) {
        const overlay = { clinical_questions: [], suggestions: [], not_for_auto_insertion: true as const };
        await storage.updateEncounter(id, clinicianId, { evidenceSuggestions: overlay }, clinicId);
        return res.json({ evidenceSuggestions: overlay });
      }

      // ── Step 2: Generate evidence-based suggestions per question ─────────────
      let evidenceCompletion;
      try {
        evidenceCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert clinical evidence synthesizer for a hormone and primary care clinic.
For each clinical question provided, synthesize evidence-based guidance from authoritative sources — like Open Evidence or UpToDate, but tailored to this specific patient encounter.

EVIDENCE SOURCE PRIORITY:
1. Clinical practice guidelines (Endocrine Society, ACOG, AACE, AHA/ACC, USPSTF, North American Menopause Society, AASLD, etc.)
2. Society position statements and consensus documents
3. Systematic reviews and meta-analyses (PubMed-indexed)
4. Large prospective cohort studies and RCTs
5. Observational studies and expert opinion (clearly labeled as such)

GUIDELINE CLASS AND LEVEL OF EVIDENCE (AHA/ACC style — use for all suggestions):
- guideline_class: "I" (benefit >> risk, should be done), "IIa" (benefit > risk, reasonable), "IIb" (benefit ≥ risk, may be considered), "III" (no benefit or harm)
- level_of_evidence: "A" (multiple RCTs or meta-analyses), "B" (single RCT or large nonrandomized), "C" (expert opinion/small studies/standard of care), "E" (emerging/insufficient)
- If no formal guideline class exists for this topic, use the best approximation based on evidence quality

PLAN ALIGNMENT (compare each suggestion against the documented current plan):
- plan_alignment: "aligned" (plan already addresses this), "gap_identified" (guideline recommends this but plan doesn't address it), "potential_conflict" (plan may conflict with guideline), "not_applicable" (guideline doesn't directly apply to this patient)
- plan_alignment_note: 1-2 sentence specific note — e.g. "Current plan does not include statin therapy; AHA 2023 PREVENT indicates high CVD risk threshold met" or "Plan already includes recommended monitoring"

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
- Each suggestion must have 1-3 high-quality citations; reject suggestions with zero citations

Return a JSON object matching this schema exactly:
{
  "suggestions": [
    {
      "title": "concise evidence topic title",
      "summary": "2-4 sentence evidence synthesis with specific findings and guideline references",
      "relevance_to_visit": "1-2 sentences explaining why this is relevant to today's visit and this patient",
      "strength_of_support": "strong" | "moderate" | "limited" | "mixed" | "insufficient",
      "guideline_class": "I" | "IIa" | "IIb" | "III",
      "level_of_evidence": "A" | "B" | "C" | "E",
      "plan_alignment": "aligned" | "gap_identified" | "potential_conflict" | "not_applicable",
      "plan_alignment_note": "specific note comparing this guideline to the current plan",
      "cautions": ["important caveats, contraindications, or evidence gaps"],
      "citations": [
        {
          "title": "full citation/guideline title",
          "source": "journal or publisher name",
          "year": "YYYY",
          "url": "https://... (PubMed, guideline site, or empty string)"
        }
      ],
      "is_evidence_informed_consideration": false
    }
  ]
}`,
          },
          {
            role: "user",
            content: `Visit context:\n${visitContext}\n\nClinical questions to answer:\n${clinicalQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nGenerate one suggestion per question. Do not include any suggestion that has zero real citations. For plan_alignment, compare against the "Current documented plan" in the visit context if provided.`,
          },
        ],
        response_format: { type: "json_object" },
      });
      } catch (err: any) {
        console.error('[Evidence] Stage 2 (suggestions) failed:', err?.status, err?.message);
        // Only persist the partial overlay (questions only) if there's no existing
        // successful overlay to preserve. Otherwise a Regenerate failure would
        // wipe out the user's previously-good suggestions.
        const existing = encounter.evidenceSuggestions as any;
        const hasPriorSuggestions = Array.isArray(existing?.suggestions) && existing.suggestions.length > 0;
        let partialSaved = false;
        if (!hasPriorSuggestions) {
          const partial = {
            clinical_questions: clinicalQuestions,
            suggestions: [],
            guideline_validations: [],
            not_for_auto_insertion: true as const,
          };
          try {
            await storage.updateEncounter(id, clinicianId, { evidenceSuggestions: partial }, clinicId);
            partialSaved = true;
          } catch {}
        }
        const status = err?.status === 429 ? 429 : 502;
        const baseMsg = err?.status === 429
          ? "Evidence service is rate-limited. Please try again in a moment."
          : `Evidence suggestions step failed: ${err?.message ?? "unknown error"}. Click Regenerate to retry.`;
        return res.status(status).json({
          message: hasPriorSuggestions
            ? `${baseMsg} (Your previous evidence has been preserved.)`
            : baseMsg,
          partialSaved,
          priorPreserved: hasPriorSuggestions,
        });
      }

      let validSuggestions: any[] = [];
      try {
        const evidenceRaw = JSON.parse(evidenceCompletion.choices[0].message.content || "{}");
        const rawSuggestions: any[] = evidenceRaw.suggestions ?? [];
        validSuggestions = rawSuggestions.filter(s => Array.isArray(s.citations) && s.citations.length > 0);
      } catch (err: any) {
        console.error('[Evidence] Stage 2 parse failed:', err?.message);
      }

      // ── Step 3: Guideline validation against the current plan ────────────────
      // Best-effort — never fail the whole request because of this stage.
      let guidelineValidations: import("@shared/schema").GuidelineValidation[] = [];
      if (soapPlan || visitContext) {
        try {
        const validationCompl = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a clinical guideline compliance checker for a hormone and primary care clinic.

Given a clinical encounter, identify 2-5 major applicable clinical guidelines and validate whether the current plan aligns with each.

Focus on guidelines that are directly triggered by this patient's diagnoses, medications, lab values, or risk factors:
- AHA/ACC cholesterol/ASCVD guidelines (statin thresholds, LDL targets)
- AHA 2023 PREVENT cardiovascular risk framework
- Endocrine Society testosterone/hypogonadism guidelines
- NAMS/ACOG hormone therapy guidelines
- Endocrine Society obesity/GLP-1 management guidelines (SURMOUNT, STEP trial basis)
- AASLD liver guidelines (if elevated transaminases)
- USPSTF screening recommendations (diabetes, HTN, depression, cancer screening)
- AACE/ACE diabetes management guidelines
- Any other guideline directly applicable to the visit context

For each guideline finding, return:
{
  "guideline": "exact guideline name and year (e.g., AHA 2023 PREVENT Framework)",
  "finding": "specific finding from this patient's encounter that triggers this guideline",
  "current_plan_status": "aligned" | "gap" | "conflict" | "not_addressed",
  "recommendation": "what this guideline specifically recommends for this patient profile",
  "clinician_decision_needed": true | false
}

current_plan_status definitions:
- "aligned": the documented plan already addresses this guideline recommendation
- "gap": guideline recommends something that the current plan does not include
- "conflict": documented plan may be inconsistent with guideline recommendation
- "not_addressed": guideline is applicable but no plan exists yet (no SOAP generated)

Return JSON: { "guideline_validations": [...] }
Only return validations for guidelines that are directly and specifically applicable — not generic or speculative.`,
            },
            {
              role: "user",
              content: `Visit context:\n${visitContext}\n\n${soapPlan ? `Current documented plan:\n${soapPlan}` : "No SOAP note generated yet."}`,
            },
          ],
          response_format: { type: "json_object" },
        });

        const valRaw = JSON.parse(validationCompl.choices[0].message.content || "{}");
        guidelineValidations = valRaw.guideline_validations ?? [];
        } catch (err: any) {
          // Best-effort step — log but don't fail the request.
          console.error('[Evidence] Stage 3 (validations) failed (non-fatal):', err?.status, err?.message);
        }
      }

      const overlay = {
        clinical_questions: clinicalQuestions,
        suggestions: validSuggestions,
        guideline_validations: guidelineValidations,
        not_for_auto_insertion: true as const,
      };

      await storage.updateEncounter(id, clinicianId, { evidenceSuggestions: overlay }, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to match patterns — this encounter belongs to a different patient.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

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
          const NON_LAB_KEYS_PM = new Set(["patientName","labDrawDate","demographics","menstrualPhase","lastMenstrualPeriod","onHRT","onBirthControl","onTRT"]);
          const vals = labResult.labValues as Record<string, any>;
          const labLines = Object.entries(vals)
            .filter(([k, v]) => !NON_LAB_KEYS_PM.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object")
            .map(([k, v]) => {
              if (typeof v === "boolean") return `  ${k}: ${v ? "Yes" : "No"}`;
              return `  ${k}: ${v}`;
            })
            .join("\n");
          const interp = labResult.interpretationResult as any;
          const priorPatterns = interp?.insulinResistance
            ? `\n  Prior IR screening: ${interp.insulinResistance.likelihood ?? "assessed"}`
            : "";
          const priorRedFlags = interp?.redFlags?.length
            ? `\n  Prior red flags: ${interp.redFlags.map((f: any) => f.title ?? f).join("; ")}`
            : "";
          // Gender from patient record (lab_results has no gender column)
          const pmPatient = await storage.getPatient(labResult.patientId, clinicianId, clinicId);
          const pmGender = pmPatient?.gender === "female" ? "Female" : "Male";
          const pmDrawDate = new Date(labResult.labDate as unknown as string);
          const pmDateLabel = !isNaN(pmDrawDate.getTime())
            ? pmDrawDate.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
            : "";
          labContext = `\n\nLINKED LAB RESULTS (${pmGender} panel${pmDateLabel ? ", drawn " + pmDateLabel : ""}):\n${labLines}${priorPatterns}${priorRedFlags}`;
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

      await storage.updateEncounter(id, clinicianId, { patternMatch: result }, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to validate — this encounter belongs to a different patient.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const { patientSummary, expectedPatientId } = req.body;

      // PATIENT-SAFETY: stale-context tripwire — never write a patient
      // summary against the wrong patient's encounter.
      if (expectedPatientId !== undefined && expectedPatientId !== null) {
        const exp = parseInt(String(expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        const existing = await storage.getEncounter(id, clinicianId, clinicId);
        if (!existing) return res.status(404).json({ message: "Encounter not found" });
        if (existing.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to save summary — this encounter belongs to a different patient.",
            encounterPatientId: existing.patientId,
            expectedPatientId: exp,
          });
        }
      }

      const updated = await storage.updateEncounter(id, clinicianId, { patientSummary }, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      if (!encounter.patientSummary) return res.status(400).json({ message: "No patient summary to publish" });

      // PATIENT-SAFETY: stale-context tripwire — refusing to publish a
      // patient-facing summary to the wrong patient's portal is critical.
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to publish — this encounter belongs to a different patient than the one currently shown.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }
      const updated = await storage.updateEncounter(id, clinicianId, {
        summaryPublished: true,
        summaryPublishedAt: new Date(),
      }, clinicId);

      // Notify the patient: in-portal message + best-effort email
      try {
        const patient = await storage.getPatient(encounter.patientId, clinicianId, clinicId);
        if (patient) {
          await storage.createPortalMessage({
            patientId: encounter.patientId,
            clinicianId,
            senderType: "clinician",
            content: `Your visit summary from ${new Date((encounter as any).visitDate || Date.now()).toLocaleDateString()} has been shared with you. You can view it from your Visit Summaries tab.`,
          });
          const portalAccount = await storage.getPortalAccountByPatientId(encounter.patientId);
          if (portalAccount?.email && process.env.RESEND_API_KEY) {
            const clinician = await storage.getUserById(clinicianId);
            const clinicName = clinician?.clinicName || "Your Healthcare Provider";
            const sendingDomain = process.env.RESEND_FROM_EMAIL || "noreply@cliniqapp.ai";
            const portalUrl = `${req.protocol}://${req.get("host")}/portal/dashboard`;
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2e3a20;">Your Visit Summary is Ready</h2>
                <p>Hi ${patient.firstName},</p>
                <p>Your care team at <strong>${clinicName}</strong> has shared your visit summary from ${new Date((encounter as any).visitDate || Date.now()).toLocaleDateString()}.</p>
                <p>Sign in to your patient portal to read the full summary, recommendations, and next steps from your visit.</p>
                <a href="${portalUrl}" style="display: inline-block; background: #2e3a20; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 12px;">Open Patient Portal</a>
              </div>`;
            fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: `"${clinicName}" <${sendingDomain}>`,
                to: [portalAccount.email],
                subject: `${clinicName}: Your visit summary is ready`,
                html,
              }),
            }).catch((e) => console.error("[Encounter Publish] Email send failed:", e));
          }
        }
      } catch (notifyErr) {
        console.error("[Encounter Publish] Notification error:", notifyErr);
      }

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to publish encounter summary" });
    }
  });

  // POST /api/encounters/:id/unpublish — unpublish patient summary
  app.post("/api/encounters/:id/unpublish", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);

      // PATIENT-SAFETY: stale-context tripwire (see POST /publish).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        const existing = await storage.getEncounter(id, clinicianId, clinicId);
        if (!existing) return res.status(404).json({ message: "Encounter not found" });
        if (existing.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to unpublish — this encounter belongs to a different patient.",
            encounterPatientId: existing.patientId,
            expectedPatientId: exp,
          });
        }
      }

      const updated = await storage.updateEncounter(id, clinicianId, {
        summaryPublished: false,
      }, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const deleted = await storage.deleteEncounter(parseInt(req.params.id), clinicianId, clinicId);
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
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      if (!encounter.transcription && !encounter.diarizedTranscript) {
        return res.status(400).json({ message: "No transcription available. Please record or add session notes first." });
      }

      // PATIENT-SAFETY: Optional client-supplied expectedPatientId acts as a
      // tripwire. The client sends the patientId it currently believes the
      // encounter belongs to; if it doesn't match the server's record, we
      // refuse to generate the SOAP so a stale-closure client bug can't
      // generate a SOAP for the wrong patient. Invalid (non-numeric) input
      // is rejected with 400 — never silently bypass the tripwire.
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: this encounter is associated with a different patient than the one currently shown. Refresh the page and verify before generating the SOAP.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

      // ── Init AI client (shared across all pipeline steps) ─────────────────
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // ── PIPELINE STEP 1: Normalize + diarize (always fresh) ───────────────
      let diarized: any[] = [];
      try {
        const rawInputText = encounter.transcription ?? "";
        const visitType = encounter.visitType ?? "follow-up";
        const lexiconRules = buildNormalizationRules(visitType);
        const normSystemPrompt = `You are a clinical medical transcription specialist. Your task has TWO parts:

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
  "corrections": [<list of corrections made, e.g., "HS CRP -> hs-CRP">],
  "uncertain": <true if speaker assignment is uncertain>
}

Return ONLY the JSON array, no explanation.`;
        const normCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: normSystemPrompt },
            { role: "user", content: `Transcript segments to process:\n${rawInputText}` },
          ],
          response_format: { type: "json_object" },
        });
        let normParsed: any = JSON.parse(normCompletion.choices[0].message.content || "{}");
        const normArray = Array.isArray(normParsed) ? normParsed : (normParsed.utterances ?? normParsed.segments ?? []);
        diarized = normArray.map((u: any, i: number) => ({
          id: u.id ?? i,
          speaker: u.speaker ?? "unknown",
          speakerRaw: u.speakerRaw ?? "UNKNOWN",
          start: u.start ?? i * 30,
          end: u.end ?? (i + 1) * 30,
          text: u.text ?? "",
          normalizedText: u.normalizedText ?? u.text ?? "",
          corrections: u.corrections ?? [],
        }));
        await storage.updateEncounter(id, clinicianId, { diarizedTranscript: diarized }, clinicId);
      } catch (normErr) {
        console.warn("[SOAP Pipeline] Normalization failed, falling back:", normErr);
        diarized = (encounter.diarizedTranscript as any[]) ?? [];
      }

      // Build transcript text — normalized preferred, raw fallback
      const wasNormalized = diarized.length > 0;
      const transcriptText = wasNormalized
        ? diarized.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
        : (encounter.transcription ?? "");
      const transcriptLabel = wasNormalized ? "TRANSCRIPT (normalized)" : "TRANSCRIPT (raw — not normalized)";

      // ── PIPELINE STEP 2: Extract clinical facts (always fresh) ────────────
      let freshExtraction: any = null;
      try {
        const extractInput = wasNormalized
          ? diarized.map((u: any) => `[ID:${u.id}] ${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
          : transcriptText;
        const extractCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: `You are a clinical documentation specialist. Extract structured clinical facts from the provided visit transcript.

CRITICAL RULES — SAFETY GUARDRAILS:
1. Only extract facts EXPLICITLY stated in the transcript
2. NEVER infer, assume, or add diagnoses, vitals, exam findings, or lab values not mentioned
3. NEVER create a diagnosis from symptoms alone — it goes in "assessment_candidates" as uncertain
4. PRESERVE all negations: if patient said "no chest pain", put "denies chest pain" in symptoms_denied
5. PRESERVE uncertainty: if clinician said "possible" or "might be", put in uncertain_items
6. Map every extracted fact to source_utterance_ids (the [ID:N] numbers in the transcript)
7. If something is only mentioned as a possibility, put it in assessment_candidates, NOT diagnoses_discussed

LAB LEVEL TARGETS vs MEDICATION DOSES — CRITICAL RULE:
When a clinician says "increase vitamin D to 60-80" or "optimize vitamin D to 60-80 ng/mL", the number is a LAB LEVEL TARGET (a goal serum level), NOT a medication dose.
- Phrases like "increase X to [range]", "optimize X to [range]", "target X to [range]", "get X to [range]" where X is a vitamin, mineral, or lab marker describe a clinical goal, NOT a medication order.
- These belong in plan_candidates (e.g., "Target vitamin D (25-OH) to 60–80 ng/mL") — NEVER in uncertain_items and NEVER as a medication with unrecognized dosing.
- Common examples of lab-level targets (never flag these as uncertain): vitamin D to 60-80, TSH to 1-2, ferritin to 70-100, testosterone to X, A1c to <6.5, B12 to 800-1000.
- Only flag as uncertain_items if a word genuinely appears to be a garbled or unknown DRUG NAME that you cannot identify at all.
- Vitamins, minerals, and standard supplements (vitamin D, vitamin B12, vitamin C, omega-3, magnesium, zinc, iron, folate, CoQ10, etc.) are NEVER uncertain — they are well-known agents. Record them in medication_changes_discussed (if a dose/supplement amount is stated) or plan_candidates (if a lab level target is stated).

MEDICATION LIST CONTEXT — CRITICAL RULE:
A clinician may recite a broad list of medications the CLINIC prescribes in general (a "formulary recitation") while teaching, presenting options, or explaining their practice. This is NOT the patient's medication list.
PATIENT-SPECIFIC vs. GENERAL FORMULARY — how to tell the difference:
- PATIENT-SPECIFIC (include in medications_current): "she is on X", "he takes X", "patient is currently on X", "patient's medications include X", "she's been on X for [duration]", "continues on X", "patient started X [time] ago"
- GENERAL FORMULARY (DO NOT include in medications_current): a rapid succession of 8+ medications spanning unrelated drug classes (GLP-1s, statins, ARBs, beta blockers, SSRIs, diuretics all in one breath); "we prescribe X", "we use X", "patients at our clinic are on X"; any list that covers treatments across many unrelated conditions simultaneously
- DECISIVE TEST: If more than 8-10 medications across 4+ unrelated drug classes are listed in a short span with no "patient takes" framing, treat the entire list as a FORMULARY DISCUSSION — put NONE of those as medications_current for this patient. The patient's actual medications will be mentioned separately with explicit attribution.
- When formulary medications ARE also explicitly stated as patient-specific (e.g., "she's on spironolactone" after a general formulary list), ONLY THEN add them to medications_current.

MEDICATION TENSE & INTENT — CRITICAL RULE:
You MUST distinguish between what the patient is CURRENTLY taking vs what the clinician is RECOMMENDING they begin:
- medications_current = medications the patient is already taking RIGHT NOW at the time of the visit
  → Triggered by: "she is on", "he takes", "currently taking", "has been on", "patient is on", "continues on", "she's been on for X weeks/months", "patient's medications include"
- medication_changes_discussed = medications being RECOMMENDED, STARTED, STOPPED, ADJUSTED, or PLANNED at this visit
  → Triggered by: "I recommend starting", "we'll begin", "I'd like to add", "we'll add once", "let's start", "I'm going to start her on", "she should start", "I recommended", "plan to initiate", "we'll hold off on X until Y"
EXAMPLES:
  - "I recommended starting progesterone" → medication_changes_discussed: ["Start progesterone (new — clinician recommendation)"]
  - "Once stable on progesterone we'll add estrogen" → medication_changes_discussed: ["Add estrogen once stable on progesterone (future plan)"]
  - "She's been on tirzepatide 15mg for 3 months" → medications_current: ["Tirzepatide 15mg SQ weekly"]
  - "I said we'd consider adding testosterone later" → medication_changes_discussed only — NOT medications_current
  - "Increase vitamin D to 60-80" → plan_candidates: ["Target vitamin D (25-OH) to 60–80 ng/mL"] — NOT uncertain_items
When in doubt about whether a drug is current vs recommended, put the item in medication_changes_discussed — never assume a recommended drug is current.

UNCERTAIN_ITEMS — STRICT CLASSIFICATION RULES:
- uncertain_items is EXCLUSIVELY for garbled, misheard, or completely unidentifiable DRUG NAMES — single words or short noun phrases that appear to be a medication but cannot be identified.
- NEVER put plan items, action items, monitoring instructions, assessment phrases, or follow-up items in uncertain_items. These belong in plan_candidates, follow_up_items, or medication_changes_discussed.
- Phrases that START WITH a verb (e.g., "Monitor...", "Assess...", "Evaluate...", "Continue...", "Adjust...", "Optimize...", "Check...", "Follow up...", "Consider...") are ALWAYS plan/follow-up items — NEVER uncertain_items.
- If a phrase contains a well-known medication name (testosterone, estrogen, tirzepatide, metformin, etc.) it is NOT uncertain — route it to the correct field (medication_changes_discussed, plan_candidates, or follow_up_items).
- Examples of what IS an uncertain_item: "testozepam" (garbled word, unknown drug), "lopatinide" (sounds like a drug but can't be identified)
- Examples of what is NOT an uncertain_item: "Monitor symptom improvement with low-dose estrogen patch" (plan item → plan_candidates), "Assess effectiveness of testosterone adjustments" (follow-up → follow_up_items), "Evaluate response to tirzepatide" (follow-up → follow_up_items)

PSYCHIATRIC / SLEEP MEDICATIONS — MANDATORY DIAGNOSIS INFERENCE RULE:
When a patient's medications_current includes any psychiatric or sleep medication, you MUST include the corresponding condition in diagnoses_discussed or assessment_candidates:
- Antidepressants (SSRIs: sertraline, fluoxetine, escitalopram, citalopram; SNRIs: venlafaxine, duloxetine, desvenlafaxine; others: vortioxetine/Trintellix, bupropion, mirtazapine, nortriptyline, amitriptyline): Add "Major depressive disorder" or "Anxiety disorder" or "Depression/anxiety" — use the stated indication if known, otherwise add both as assessment_candidates
- Trazodone: Add "Insomnia" and/or "Depression" as assessment_candidates (trazodone is used for both)
- Benzodiazepines (alprazolam, lorazepam, clonazepam, diazepam): Add "Anxiety disorder" to diagnoses_discussed
- Sleep aids (zolpidem, eszopiclone, suvorexant, lemborexant, ramelteon): Add "Insomnia" to diagnoses_discussed
- Spironolactone (without cardiac/HTN context): Add "Acne" or "PCOS" or "Hirsutism" as assessment_candidates
- Naltrexone/LDN: Add the probable indication (AUD, immune, weight management) as assessment_candidates if not stated
This rule is MANDATORY — these medications imply underlying conditions that MUST be documented.

DRUG CLASS NAMES — CRITICAL RULE:
When a DRUG CLASS is mentioned (e.g., "GLP-1", "statin", "SSRI", "progesterone") without naming a specific drug:
- Record ONLY the class name — do NOT enumerate or infer specific drugs within that class
- Example: clinician says "GLP-1" without naming a drug → record "GLP-1 receptor agonist (class)" — NOT "semaglutide" or "tirzepatide"
- If a specific drug is ALSO mentioned in the transcript (e.g., "tirzepatide 15mg"), record that specific drug and note it resolves the class mention
- NEVER add a drug to medications_current or medication_changes_discussed unless it was explicitly named or its class was the ONLY reference (keep as class name, not specific drug)

WHOLE-VISIT EXTRACTION — CRITICAL RULE:
Treat the encounter as a TOTAL WELLNESS VISIT, not a narrow single-issue visit. Even if the visit focus is hormones, menopause, or weight loss, capture the FULL clinically relevant conversation:
- Scan the ENTIRE transcript for medications — not just a "medication section." If a medication is mentioned anywhere in relevant conversation (during history-taking, while discussing symptoms, in passing), capture it.
- Capture secondary concerns discussed during the visit even if they are not the primary reason for the encounter (e.g., anxiety mentioned during a hormone visit, sleep complaints during a weight loss visit, constipation, headaches, palpitations).
- Capture lifestyle factors that are clinically relevant: exercise habits, diet discussions, alcohol/tobacco use, stress levels, sleep quality.
- Capture mental health context: anxiety symptoms, depression history, mood changes, stress, prior psychiatric treatment.
- Capture prior treatments and medication trials: medications tried and stopped, treatments that failed, reasons for discontinuation, side effects experienced.
- Capture allergies, surgical history, family history, and social history when mentioned.

CONTEXT CLUE REQUIREMENT:
Use context clues to capture clinically relevant information, but do not hallucinate:
- If something is strongly supported by transcript context, capture it in the appropriate field.
- If something is implied but not explicitly confirmed, capture it in "context_inferred_items" with cautious phrasing.
- Example: If a patient says she takes Lexapro, capture "Lexapro" in medications_current AND add "History suggestive of anxiety/depression based on Lexapro use — confirm specific diagnosis" in context_inferred_items.
- Do NOT omit relevant details just because they were mentioned casually during the encounter.

EXCLUDE from extraction:
- Clearly irrelevant small talk with no clinical value
- Non-medical conversation (shoes, shopping, weather, random social chatter)

Return this exact JSON structure (all arrays, even if empty):
{
  "visit_type": "",
  "chief_concerns": [],
  "secondary_concerns": [],
  "symptoms_reported": [],
  "symptoms_denied": [],
  "medications_current": [],
  "medication_changes_discussed": [],
  "supplements_current": [],
  "labs_reviewed": [],
  "allergies": [],
  "past_medical_history": [],
  "surgical_history": [],
  "family_history": [],
  "social_history": [],
  "mental_health_context": [],
  "lifestyle_factors": [],
  "prior_treatments_and_trials": [],
  "side_effects_reported": [],
  "diagnoses_discussed": [],
  "assessment_candidates": [],
  "plan_candidates": [],
  "follow_up_items": [],
  "patient_questions": [],
  "red_flags": [],
  "uncertain_items": [],
  "context_inferred_items": [],
  "source_utterance_ids": []
}` },
            { role: "user", content: `Visit Type: ${encounter.visitType}\nChief Complaint: ${encounter.chiefComplaint ?? "Not specified"}\n\nTranscript:\n${extractInput}` },
          ],
          response_format: { type: "json_object" },
        });
        freshExtraction = JSON.parse(extractCompletion.choices[0].message.content || "{}");

        if (Array.isArray(freshExtraction.uncertain_items)) {
          const ACTION_VERB_PATTERN = /^(monitor|assess|evaluate|continue|adjust|optimize|check|follow|consider|review|titrate|taper|increase|decrease|start|stop|discontinue|order|schedule|refer|counsel|educate|target|maintain|obtain|ensure|verify|confirm|discuss|recommend|initiate|plan|manage|track|watch|observe|recheck|measure|repeat|address|complete|begin|transition|switch|add|remove|reduce|modify|update|document)/i;
          const KNOWN_MEDS_PATTERN = /\b(testosterone|estrogen|estradiol|progesterone|tirzepatide|semaglutide|liraglutide|metformin|levothyroxine|liothyronine|spironolactone|finasteride|dutasteride|anastrozole|letrozole|tamoxifen|clomiphene|enclomiphene|gonadorelin|hcg|dhea|pregnenolone|oxandrolone|nandrolone|stanozolol|sildenafil|tadalafil|vardenafil|avanafil|cabergoline|bromocriptine|naltrexone|bupropion|sertraline|escitalopram|fluoxetine|venlafaxine|duloxetine|trazodone|buspirone|alprazolam|lorazepam|clonazepam|diazepam|zolpidem|gabapentin|pregabalin|topiramate|phentermine|orlistat|vitamin\s*d|vitamin\s*b12|omega|magnesium|zinc|iron|folate|coq10|melatonin|ashwagandha|berberine)\b/i;

          const misclassified: string[] = [];
          freshExtraction.uncertain_items = freshExtraction.uncertain_items.filter((item: string) => {
            if (ACTION_VERB_PATTERN.test(item.trim())) {
              misclassified.push(item);
              return false;
            }
            if (item.split(/\s+/).length > 4 && KNOWN_MEDS_PATTERN.test(item)) {
              misclassified.push(item);
              return false;
            }
            return true;
          });

          if (misclassified.length > 0) {
            if (!Array.isArray(freshExtraction.plan_candidates)) freshExtraction.plan_candidates = [];
            freshExtraction.plan_candidates.push(...misclassified);
          }
        }

        await storage.updateEncounter(id, clinicianId, { clinicalExtraction: freshExtraction }, clinicId);
        const exLines: string[] = [];
        if (freshExtraction.chief_concerns?.length)             exLines.push(`Chief concerns: ${freshExtraction.chief_concerns.join("; ")}`);
        if (freshExtraction.secondary_concerns?.length)         exLines.push(`Secondary concerns: ${freshExtraction.secondary_concerns.join("; ")}`);
        if (freshExtraction.symptoms_reported?.length)           exLines.push(`Symptoms reported: ${freshExtraction.symptoms_reported.join("; ")}`);
        if (freshExtraction.symptoms_denied?.length)             exLines.push(`Symptoms denied: ${freshExtraction.symptoms_denied.join("; ")}`);
        if (freshExtraction.medications_current?.length)         exLines.push(`Current medications: ${freshExtraction.medications_current.join("; ")}`);
        if (freshExtraction.supplements_current?.length)         exLines.push(`Current supplements: ${freshExtraction.supplements_current.join("; ")}`);
        if (freshExtraction.medication_changes_discussed?.length) exLines.push(`Medication changes discussed: ${freshExtraction.medication_changes_discussed.join("; ")}`);
        if (freshExtraction.labs_reviewed?.length)               exLines.push(`Labs reviewed: ${freshExtraction.labs_reviewed.join("; ")}`);
        if (freshExtraction.allergies?.length)                   exLines.push(`Allergies: ${freshExtraction.allergies.join("; ")}`);
        if (freshExtraction.past_medical_history?.length)        exLines.push(`Past medical history: ${freshExtraction.past_medical_history.join("; ")}`);
        if (freshExtraction.surgical_history?.length)            exLines.push(`Surgical history: ${freshExtraction.surgical_history.join("; ")}`);
        if (freshExtraction.family_history?.length)              exLines.push(`Family history: ${freshExtraction.family_history.join("; ")}`);
        if (freshExtraction.social_history?.length)              exLines.push(`Social history: ${freshExtraction.social_history.join("; ")}`);
        if (freshExtraction.mental_health_context?.length)       exLines.push(`Mental health context: ${freshExtraction.mental_health_context.join("; ")}`);
        if (freshExtraction.lifestyle_factors?.length)           exLines.push(`Lifestyle factors: ${freshExtraction.lifestyle_factors.join("; ")}`);
        if (freshExtraction.prior_treatments_and_trials?.length) exLines.push(`Prior treatments/trials: ${freshExtraction.prior_treatments_and_trials.join("; ")}`);
        if (freshExtraction.side_effects_reported?.length)       exLines.push(`Side effects reported: ${freshExtraction.side_effects_reported.join("; ")}`);
        if (freshExtraction.diagnoses_discussed?.length)         exLines.push(`Diagnoses discussed: ${freshExtraction.diagnoses_discussed.join("; ")}`);
        if (freshExtraction.assessment_candidates?.length)       exLines.push(`Assessment candidates (uncertain): ${freshExtraction.assessment_candidates.join("; ")}`);
        if (freshExtraction.plan_candidates?.length)             exLines.push(`Plan items discussed: ${freshExtraction.plan_candidates.join("; ")}`);
        if (freshExtraction.follow_up_items?.length)             exLines.push(`Follow-up items: ${freshExtraction.follow_up_items.join("; ")}`);
        if (freshExtraction.red_flags?.length)                   exLines.push(`Red flags noted: ${freshExtraction.red_flags.join("; ")}`);
        if (freshExtraction.uncertain_items?.length)             exLines.push(`Uncertain/unresolved: ${freshExtraction.uncertain_items.join("; ")}`);
        if (freshExtraction.context_inferred_items?.length)      exLines.push(`Context-inferred (confirm with patient): ${freshExtraction.context_inferred_items.join("; ")}`);
      } catch (extractErr) {
        console.warn("[SOAP Pipeline] Extraction failed:", extractErr);
      }

      // Fetch linked lab result for context
      let labContext = "";
      if (encounter.linkedLabResultId) {
        const labResult = await storage.getLabResult(encounter.linkedLabResultId);
        if (labResult) {
          // Metadata/context keys that are NOT numeric lab markers — exclude from AI prompt
          const NON_LAB_KEYS = new Set([
            "patientName", "labDrawDate", "demographics",
            "menstrualPhase", "lastMenstrualPeriod",
            "onHRT", "onBirthControl", "onTRT",
          ]);
          // Human-readable labels for camelCase lab keys
          const KEY_LABELS: Record<string, string> = {
            hemoglobin: "Hemoglobin (g/dL)", hematocrit: "Hematocrit (%)", mcv: "MCV (fL)",
            rbc: "RBC (M/µL)", wbc: "WBC (K/µL)", platelets: "Platelets (K/µL)",
            ast: "AST (U/L)", alt: "ALT (U/L)", bilirubin: "Bilirubin (mg/dL)",
            creatinine: "Creatinine (mg/dL)", egfr: "eGFR (mL/min/1.73m²)", bun: "BUN (mg/dL)",
            sodium: "Sodium (mEq/L)", potassium: "Potassium (mEq/L)", chloride: "Chloride (mEq/L)",
            co2: "CO2 (mEq/L)", glucose: "Glucose (mg/dL)", fastingGlucose: "Fasting Glucose (mg/dL)",
            calcium: "Calcium (mg/dL)", albumin: "Albumin (g/dL)", totalProtein: "Total Protein (g/dL)",
            ldl: "LDL-C (mg/dL)", hdl: "HDL-C (mg/dL)", totalCholesterol: "Total Cholesterol (mg/dL)",
            triglycerides: "Triglycerides (mg/dL)", apoB: "ApoB (mg/dL)", lpa: "Lp(a) (nmol/L)",
            testosterone: "Testosterone (ng/dL)", estradiol: "Estradiol (pg/mL)", lh: "LH (mIU/mL)",
            fsh: "FSH (mIU/mL)", prolactin: "Prolactin (ng/mL)", shbg: "SHBG (nmol/L)",
            freeTestosterone: "Free Testosterone (pg/mL)", progesterone: "Progesterone (ng/mL)",
            tsh: "TSH (µIU/mL)", freeT4: "Free T4 (ng/dL)", freeT3: "Free T3 (pg/mL)",
            psa: "PSA (ng/mL)", previousPsa: "Previous PSA (ng/mL)", monthsSinceLastPsa: "Months Since Last PSA",
            a1c: "HbA1c (%)", hsCRP: "hs-CRP (mg/L)", vitaminD: "Vitamin D 25-OH (ng/mL)",
            vitaminB12: "Vitamin B12 (pg/mL)", ferritin: "Ferritin (ng/mL)", iron: "Iron (µg/dL)",
            tibc: "TIBC (µg/dL)", dhea: "DHEA (µg/dL)", dheas: "DHEA-S (µg/dL)",
            igf1: "IGF-1 (ng/mL)", cortisol: "Cortisol (µg/dL)", insulin: "Fasting Insulin (µIU/mL)",
            homocysteine: "Homocysteine (µmol/L)", uricAcid: "Uric Acid (mg/dL)",
          };
          // Special boolean flags to render as text
          const BOOL_LABELS: Record<string, string> = {
            onTRT: "On TRT", onHRT: "On HRT", onBirthControl: "On Birth Control",
          };
          const labVals = labResult.labValues as Record<string, any>;
          const labLines = Object.entries(labVals)
            .filter(([k, v]) => {
              if (NON_LAB_KEYS.has(k)) return false;
              if (v === null || v === undefined || v === "") return false;
              if (typeof v === "object") return false; // skip nested objects like demographics
              return true;
            })
            .map(([k, v]) => {
              const label = KEY_LABELS[k] ?? k;
              if (typeof v === "boolean") return `  ${BOOL_LABELS[k] ?? label}: ${v ? "Yes" : "No"}`;
              return `  ${label}: ${v}`;
            })
            .join("\n");

          // Gender from patient record (lab_results has no gender column)
          const labPatient = await storage.getPatient(labResult.patientId, clinicianId, clinicId);
          const genderLabel = labPatient?.gender === "female" ? "Female" : "Male";

          // Use actual lab draw date, not DB insertion timestamp
          const drawDate = new Date(labResult.labDate as unknown as string);
          const dateLabel = !isNaN(drawDate.getTime())
            ? drawDate.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })
            : "Unknown date";

          // ── Build clinical interpretation context from stored interpretationResult ──
          const interp = labResult.interpretationResult as any;
          const interpSections: string[] = [];

          // 1. Red flags — always include, highest priority
          if (interp?.redFlags?.length) {
            const flagLines = interp.redFlags
              .map((f: any) => `  ⚑ [${(f.severity ?? "WARNING").toUpperCase()}] ${f.marker}: ${f.message}`)
              .join("\n");
            interpSections.push(`RED FLAGS (require immediate attention):\n${flagLines}`);
          }

          // 2. Per-marker clinical status — only abnormal/critical/borderline markers
          if (interp?.interpretations?.length) {
            const notable = interp.interpretations.filter(
              (i: any) => i.status && i.status !== "normal"
            );
            if (notable.length) {
              const notableLines = notable
                .map((i: any) => {
                  const rec = i.recommendation ? `\n    [SUGGESTED — clinician must approve before charting: ${i.recommendation}]` : "";
                  return `  ${i.marker} [${i.status?.toUpperCase()}]: ${i.interpretation ?? ""}${rec}`;
                })
                .join("\n");
              interpSections.push(`NOTABLE LAB FINDINGS (non-normal status):\n${notableLines}`);
            }
          }

          // 3. Insulin resistance phenotype
          if (interp?.insulinResistance?.detected) {
            const ir = interp.insulinResistance;
            const phenoNames = ir.phenotypes?.map((p: any) => p.name).join(", ") ?? "unspecified phenotype";
            interpSections.push(
              `INSULIN RESISTANCE SCREENING: Likely detected — ${phenoNames}. Likelihood: ${ir.likelihood ?? "moderate"}.`
            );
          }

          // 4. PREVENT cardiovascular risk
          if (interp?.preventRisk) {
            const pr = interp.preventRisk;
            const riskLines: string[] = [];
            if (pr.tenYearCVD != null) riskLines.push(`10-yr CVD risk: ${pr.tenYearCVD}%`);
            if (pr.thirtyYearCVD != null) riskLines.push(`30-yr CVD risk: ${pr.thirtyYearCVD}%`);
            if (pr.tenYearASCVD != null) riskLines.push(`10-yr ASCVD risk: ${pr.tenYearASCVD}%`);
            if (pr.riskCategory) riskLines.push(`Category: ${pr.riskCategory}`);
            if (riskLines.length) {
              interpSections.push(`PREVENT CARDIOVASCULAR RISK (2023 AHA):\n  ${riskLines.join(", ")}`);
            }
          }

          // 5. hs-CRP interpretation
          if (interp?.hsCrpInterpretation) {
            interpSections.push(`hs-CRP RISK STRATIFICATION: ${interp.hsCrpInterpretation}`);
          }

          // 6. Supplement recommendations from lab evaluation — always include so SOAP CARE PLAN documents them
          const rawSupplements: any[] = interp?.supplements ?? [];
          if (rawSupplements.length) {
            const suppLines = rawSupplements.map((s: any) => {
              const name = s.name ?? s.productName ?? "Unnamed supplement";
              const dose = s.dosage ?? s.dose ?? "";
              const reason = s.reason ?? s.rationale ?? s.indication ?? "";
              return `  • ${name}${dose ? ` — ${dose}` : ""}${reason ? ` (${reason})` : ""}`;
            }).join("\n");
            interpSections.push(
              `SUPPLEMENT RECOMMENDATIONS (from linked lab evaluation — document in CARE PLAN):\n${suppLines}\nNOTE: These supplements were clinically indicated by the lab evaluation and/or discussed in the transcript. They MUST be listed in the CARE PLAN section of the SOAP note.`
            );
          }

          const clinicalInterpContext = interpSections.length
            ? `\n\nCLINICAL INTERPRETATION (computed from linked labs):\n${interpSections.join("\n\n")}`
            : "";

          labContext = labLines
            ? `\n\nLINKED LAB RESULTS (${genderLabel} panel, drawn ${dateLabel}):\n${labLines}${clinicalInterpContext}`
            : "";
        }
      }

      // ── PIPELINE STEP 3: Pattern matching inline (fresh, after lab context is built) ──
      let patternContext = "";
      try {
        const pmLabResultId = encounter.linkedLabResultId;
        let pmLabContext = "";
        let pmLabContextUsed = false;
        if (pmLabResultId) {
          const pmLabResult = await storage.getLabResult(pmLabResultId);
          if (pmLabResult) {
            pmLabContextUsed = true;
            const NON_LAB_KEYS_PM = new Set(["patientName","labDrawDate","demographics","menstrualPhase","lastMenstrualPeriod","onHRT","onBirthControl","onTRT"]);
            const pmVals = pmLabResult.labValues as Record<string, any>;
            const pmLabLines = Object.entries(pmVals)
              .filter(([k, v]) => !NON_LAB_KEYS_PM.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object")
              .map(([k, v]) => typeof v === "boolean" ? `  ${k}: ${v ? "Yes" : "No"}` : `  ${k}: ${v}`)
              .join("\n");
            const pmInterp = pmLabResult.interpretationResult as any;
            const pmPriorPatterns = pmInterp?.insulinResistance ? `\n  Prior IR screening: ${pmInterp.insulinResistance.likelihood ?? "assessed"}` : "";
            const pmPriorRedFlags = pmInterp?.redFlags?.length ? `\n  Prior red flags: ${pmInterp.redFlags.map((f: any) => f.title ?? f).join("; ")}` : "";
            const pmPatient = await storage.getPatient(pmLabResult.patientId, clinicianId, clinicId);
            const pmGender = pmPatient?.gender === "female" ? "Female" : "Male";
            pmLabContext = `\n\nLINKED LAB RESULTS (${pmGender} panel):\n${pmLabLines}${pmPriorPatterns}${pmPriorRedFlags}`;
          }
        }
        const pmMode = pmLabContextUsed ? "context_linked" : "transcript_only";
        const pmExtLines: string[] = [];
        if (freshExtraction) {
          if (freshExtraction.chief_concerns?.length)           pmExtLines.push(`Chief concerns: ${freshExtraction.chief_concerns.join("; ")}`);
          if (freshExtraction.secondary_concerns?.length)       pmExtLines.push(`Secondary concerns: ${freshExtraction.secondary_concerns.join("; ")}`);
          if (freshExtraction.symptoms_reported?.length)         pmExtLines.push(`Symptoms reported: ${freshExtraction.symptoms_reported.join("; ")}`);
          if (freshExtraction.symptoms_denied?.length)           pmExtLines.push(`Symptoms denied: ${freshExtraction.symptoms_denied.join("; ")}`);
          if (freshExtraction.medications_current?.length)       pmExtLines.push(`Current medications: ${freshExtraction.medications_current.join("; ")}`);
          if (freshExtraction.supplements_current?.length)       pmExtLines.push(`Current supplements: ${freshExtraction.supplements_current.join("; ")}`);
          if (freshExtraction.mental_health_context?.length)     pmExtLines.push(`Mental health context: ${freshExtraction.mental_health_context.join("; ")}`);
          if (freshExtraction.lifestyle_factors?.length)         pmExtLines.push(`Lifestyle factors: ${freshExtraction.lifestyle_factors.join("; ")}`);
          if (freshExtraction.diagnoses_discussed?.length)       pmExtLines.push(`Diagnoses discussed: ${freshExtraction.diagnoses_discussed.join("; ")}`);
          if (freshExtraction.assessment_candidates?.length)     pmExtLines.push(`Assessment candidates: ${freshExtraction.assessment_candidates.join("; ")}`);
          if (freshExtraction.plan_candidates?.length)           pmExtLines.push(`Plan items: ${freshExtraction.plan_candidates.join("; ")}`);
          if (freshExtraction.red_flags?.length)                 pmExtLines.push(`Red flags: ${freshExtraction.red_flags.join("; ")}`);
          if (freshExtraction.medication_changes_discussed?.length) pmExtLines.push(`Medication changes: ${freshExtraction.medication_changes_discussed.join("; ")}`);
          if (freshExtraction.side_effects_reported?.length)     pmExtLines.push(`Side effects: ${freshExtraction.side_effects_reported.join("; ")}`);
          if (freshExtraction.prior_treatments_and_trials?.length) pmExtLines.push(`Prior treatments/trials: ${freshExtraction.prior_treatments_and_trials.join("; ")}`);
          if (freshExtraction.allergies?.length)                 pmExtLines.push(`Allergies: ${freshExtraction.allergies.join("; ")}`);
          if (freshExtraction.past_medical_history?.length)      pmExtLines.push(`Past medical history: ${freshExtraction.past_medical_history.join("; ")}`);
          if (freshExtraction.surgical_history?.length)           pmExtLines.push(`Surgical history: ${freshExtraction.surgical_history.join("; ")}`);
          if (freshExtraction.family_history?.length)             pmExtLines.push(`Family history: ${freshExtraction.family_history.join("; ")}`);
          if (freshExtraction.social_history?.length)             pmExtLines.push(`Social history: ${freshExtraction.social_history.join("; ")}`);
          if (freshExtraction.context_inferred_items?.length)     pmExtLines.push(`Context-inferred (confirm): ${freshExtraction.context_inferred_items.join("; ")}`);
        }
        const pmExtContext = pmExtLines.length ? `\n\nSTRUCTURED CLINICAL FACTS (extracted from transcript):\n${pmExtLines.join('\n')}` : "";
        const pmCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: `You are an expert clinical pattern recognition engine for a hormone and primary care clinic.
Your task is to identify clinically relevant patterns and phenotypes from a patient encounter.

OPERATING MODE: ${pmMode === "context_linked" ? "CONTEXT-LINKED (transcript + lab data available)" : "TRANSCRIPT-ONLY (no linked labs — use symptoms and chart context only)"}

CLINICAL FRAMEWORKS YOU KNOW:

1. PERIMENOPAUSE PATTERNS
   - Estrogen dominance: heavy periods, bloating, breast tenderness, mood swings, weight gain
   - Estrogen deficiency: hot flashes, night sweats, vaginal dryness, brain fog, poor sleep, bone loss concern
   - Progesterone deficiency: sleep disruption, anxiety, PMS, irregular cycles, heavy periods
   - Androgen excess: acne, hirsutism, hair thinning at crown, oily skin
   - Lab confirmation markers: E2, progesterone, FSH, LH, testosterone, SHBG, DHEA-S

2. TESTOSTERONE OPTIMIZATION (male and female)
   - Male: low libido, fatigue, decreased motivation, poor sleep, reduced muscle mass, mood changes, cognitive fog
   - Female: low libido, fatigue, reduced muscle tone, mood flatness, cognitive fog (low-normal testosterone)
   - TRT monitoring patterns: erythrocytosis risk (hematocrit >50%), PSA velocity, estradiol elevation
   - Lab confirmation markers: total T, free T, SHBG, E2, LH, FSH, hematocrit, PSA

3. INSULIN RESISTANCE SCREENING
   - Classic IR: acanthosis nigricans, central adiposity, fatigue after meals, sugar cravings, frequent hunger
   - PCOS-related IR: irregular cycles, androgen excess signs, polycystic ovaries, anovulation
   - Lean IR: normal BMI but metabolic dysfunction signs
   - Lab confirmation markers: fasting glucose, fasting insulin, HOMA-IR, HbA1c, triglycerides, HDL

4. THYROID PATTERNS
   - Hypothyroid: fatigue, cold intolerance, hair loss, constipation, weight gain, brain fog, dry skin
   - Hyperthyroid/overtreatment: palpitations, heat intolerance, anxiety, weight loss, tremor
   - Hashimoto's: fluctuating symptoms, positive TPO antibodies context, autoimmune history
   - Lab confirmation: TSH, free T4, free T3, TPO antibodies

5. LIPID / CARDIOMETABOLIC
   - Atherogenic dyslipidemia: high TG, low HDL, small dense LDL pattern
   - Elevated cardiovascular risk: family history, smoking, hypertension combined with lab markers
   - Lab confirmation: LDL, HDL, TG, ApoB, Lp(a), hs-CRP, glucose

6. ADRENAL / HPA AXIS
   - Cortisol dysregulation: fatigue (especially AM), salt cravings, poor stress response
   - DHEA deficiency: low energy, poor mood, reduced libido (especially postmenopause)
   - Lab confirmation: DHEA-S, morning cortisol

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

CRITICAL RULES:
- NEVER require labs to run this analysis — transcript-only mode is fully valid
- NEVER fabricate lab values not provided
- Only include patterns with at least "possible" confidence
- If no clear patterns are identified, return an empty matched_patterns array

Return a JSON object:
{
  "matched_patterns": [
    {
      "pattern_name": "concise pattern name",
      "category": "perimenopause" | "testosterone_optimization" | "insulin_resistance" | "thyroid" | "lipid_cardiometabolic" | "adrenal_hpa" | "nutrient_deficiency" | "other",
      "evidence_basis": "symptom_based" | "lab_backed" | "combined" | "insufficient",
      "supporting_evidence": ["list of specific symptoms, facts, or lab values"],
      "recommended_considerations": ["specific clinical actions to consider"],
      "requires_lab_confirmation": true | false,
      "notes": "any important clinical nuance"
    }
  ],
  "symptom_clusters": ["grouped symptom patterns noted in the visit"],
  "unmatched_concerns": ["concerns that don't fit the above frameworks"],
  "lab_context_used": ${pmLabContextUsed}
}` },
            { role: "user", content: `Visit Type: ${encounter.visitType}\nChief Complaint: ${encounter.chiefComplaint || "Not specified"}${pmLabContext}${pmExtContext}\n\nTRANSCRIPT:\n${transcriptText}\n\nMode: ${pmMode}.` },
          ],
          response_format: { type: "json_object" },
        });
        const pmRaw = JSON.parse(pmCompletion.choices[0].message.content || "{}");
        const pmResult = {
          mode: pmMode,
          matched_patterns: pmRaw.matched_patterns ?? [],
          symptom_clusters: pmRaw.symptom_clusters ?? [],
          unmatched_concerns: pmRaw.unmatched_concerns ?? [],
          lab_context_used: pmLabContextUsed,
          generated_at: new Date().toISOString(),
        };
        await storage.updateEncounter(id, clinicianId, { patternMatch: pmResult }, clinicId);
        if (pmResult.matched_patterns.length) {
          const pmLabel = pmMode === "context_linked" ? "transcript + lab data" : "transcript symptoms only";
          const pmLines = pmResult.matched_patterns.map((p: any) =>
            `- ${p.pattern_name} [${p.evidence_basis}]: ${p.supporting_evidence?.join("; ") ?? "no detail"}`
          );
          patternContext = `\n\nCLINICAL PATTERN MATCHING (${pmLabel}):\n${pmLines.join('\n')}`;
          if (pmResult.symptom_clusters?.length) {
            patternContext += `\nSymptom clusters: ${pmResult.symptom_clusters.join("; ")}`;
          }
        }
      } catch (pmErr) {
        console.warn("[SOAP Pipeline] Pattern matching failed:", pmErr);
      }

      // ── PIPELINE STEP 3b: Medication detection (single shared run) ────────
      let medicationContext = "";
      let autoMedMatches: any[] = [];
      try {
        const medEntries = await storage.getAllMedicationEntries(clinicianId);
        if (medEntries.length && transcriptText.trim()) {
          const rawMedText = wasNormalized
            ? diarized.map((u: any) => u.normalizedText ?? u.text).join(' ')
            : (encounter.transcription ?? "");
          autoMedMatches = normalizeTranscript(rawMedText, medEntries);
          if (autoMedMatches.length) {
            const confirmed = autoMedMatches.filter(m => !m.needsReview);
            const uncertain = autoMedMatches.filter(m => m.needsReview);
            const lines: string[] = [];
            if (confirmed.length) {
              lines.push("Confirmed medications (use these canonical generic names in the SOAP):");
              for (const m of confirmed) {
                const meta = [m.drugClass, m.route].filter(Boolean).join(", ");
                const spoken = m.originalTerm !== m.canonicalName ? ` (spoken as: "${m.originalTerm}")` : "";
                lines.push(`  • ${m.canonicalName}${spoken}${meta ? ` — ${meta}` : ""}`);
              }
            }
            if (uncertain.length) {
              lines.push("Uncertain matches — verify before charting (do NOT assume these are correct):");
              for (const m of uncertain) {
                lines.push(`  ⚠ "${m.originalTerm}" → possibly ${m.canonicalName} (${Math.round(m.confidence * 100)}% confidence, ${m.matchType} match)`);
              }
            }
            if (lines.length) {
              medicationContext = `\n\nNORMALIZED MEDICATION LIST (auto-detected from clinician's dictionary):\n${lines.join('\n')}\nIMPORTANT: Use only the canonical names above for confirmed medications. Do not alter the uncertain ones without clinical verification.`;
            }
          }
        }
      } catch (medErr) {
        console.warn("[SOAP] Medication normalization skipped:", medErr);
      }

      // ── Resolve patient name for SOAP identity disambiguation ─────────────
      let patientName: string | undefined;
      if (encounter.patientId) {
        try {
          const clinicId = getEffectiveClinicId(req);
          const patient = await storage.getPatient(encounter.patientId, clinicianId, clinicId);
          if (patient) {
            patientName = `${patient.firstName} ${patient.lastName}`.trim();
          }
        } catch (pErr) {
          console.warn("[SOAP] Could not resolve patient name:", pErr);
        }
      }

      // ── PIPELINE STEP 4+5: Enhanced multi-stage SOAP generation ─────────────
      // Uses the new enhanced pipeline: normalization+inference → section-specific generation → QA check
      const soapNote = await runEnhancedSoapPipeline({
        transcriptText,
        diarized,
        extraction: freshExtraction,
        labContext,
        patternContext,
        medicationContext,
        encounter,
        openai,
        patientName,
      });

      const updated = await storage.updateEncounter(id, clinicianId, {
        soapNote,
        soapGeneratedAt: new Date(),
      }, clinicId);

      res.json({ soapNote, encounter: updated, medicationMatches: autoMedMatches, diarizedTranscript: diarized, clinicalExtraction: freshExtraction });

      // ── Stage 5: Evidence — fire-and-forget after SOAP response is sent ────
      // Runs in background so the clinician gets SOAP immediately.
      setImmediate(async () => {
        try {
          const freshEncounter = await storage.getEncounter(id, clinicianId, clinicId);
          if (!freshEncounter) return;

          const diarizedForEvidence = freshEncounter.diarizedTranscript as any[] | null;
          const transcriptForEvidence = diarizedForEvidence?.length
            ? diarizedForEvidence.map((u: any) => `${u.speaker.toUpperCase()}: ${u.normalizedText ?? u.text}`).join('\n')
            : (freshEncounter.transcription ?? "");
          if (!transcriptForEvidence.trim()) return;

          const extraction = freshEncounter.clinicalExtraction as any;
          const diagnoses = extraction?.diagnoses_discussed?.join(", ") ?? "";
          const planItems = extraction?.plan_candidates?.join(", ") ?? "";
          const soapForEvidence = (freshEncounter.soapNote as any)?.fullNote ?? "";

          // Step 1: Generate focused clinical questions
          const qCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are an expert clinical evidence librarian for a hormone and primary care clinic.
Given structured visit data, generate 1 to 5 focused, searchable clinical evidence questions.
Rules:
- Each question must map to a specific clinical decision, diagnosis, or treatment mentioned in the visit
- Questions should be framed as "What is the evidence for..." or "What are evidence-based options for..."
- Focus on actionable clinical questions, not background physiology
Return JSON: { "clinical_questions": ["...", "..."] }`,
              },
              {
                role: "user",
                content: `Visit Type: ${freshEncounter.visitType}\nDiagnoses: ${diagnoses}\nPlan Items: ${planItems}\n\nTranscript:\n${transcriptForEvidence.slice(0, 3000)}`,
              },
            ],
            response_format: { type: "json_object" },
          });
          const qParsed = JSON.parse(qCompletion.choices[0].message.content || "{}");
          const clinicalQuestions: string[] = qParsed.clinical_questions ?? [];
          if (!clinicalQuestions.length) return;

          // Step 2: Synthesize evidence per question
          const eCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are an expert clinical evidence synthesizer for a hormone and primary care clinic.
For each clinical question, provide evidence-based guidance with guideline citations.
Return JSON matching EvidenceOverlay structure:
{
  "clinical_questions": [],
  "not_for_auto_insertion": true,
  "suggestions": [
    {
      "title": "...",
      "summary": "...",
      "relevance_to_visit": "...",
      "strength_of_support": "strong|moderate|limited|mixed|insufficient",
      "guideline_class": "I|IIa|IIb|III",
      "level_of_evidence": "A|B|C|E",
      "plan_alignment": "aligned|gap_identified|potential_conflict|not_applicable",
      "plan_alignment_note": "...",
      "cautions": [],
      "citations": [{ "title": "...", "source": "...", "year": "...", "url": "..." }]
    }
  ]
}`,
              },
              {
                role: "user",
                content: `Clinical questions:\n${clinicalQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nCurrent plan:\n${soapForEvidence.slice(0, 2000)}`,
              },
            ],
            response_format: { type: "json_object" },
          });

          const evidenceOverlay = JSON.parse(eCompletion.choices[0].message.content || "{}");
          evidenceOverlay.clinical_questions = clinicalQuestions;
          evidenceOverlay.not_for_auto_insertion = true;
          await storage.updateEncounter(id, clinicianId, { evidenceSuggestions: evidenceOverlay }, clinicId);
          console.log(`[SOAP Pipeline] Evidence auto-generated for encounter ${id} (${(evidenceOverlay.suggestions ?? []).length} suggestions)`);
        } catch (evErr) {
          console.warn(`[SOAP Pipeline] Background evidence generation failed for encounter ${id}:`, evErr);
        }
      });
    } catch (err) {
      console.error('[SOAP] Generation error:', err);
      res.status(500).json({ message: "Failed to generate SOAP note. Please try again." });
    }
  });

  // POST /api/encounters/:id/generate-summary — generate patient-facing summary
  app.post("/api/encounters/:id/generate-summary", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const encounter = await storage.getEncounter(id, clinicianId, clinicId);
      if (!encounter) return res.status(404).json({ message: "Encounter not found" });
      if (!encounter.soapNote) return res.status(400).json({ message: "Please generate the SOAP note first." });

      // PATIENT-SAFETY: stale-context tripwire (see PUT /api/encounters/:id).
      if (req.body?.expectedPatientId !== undefined && req.body?.expectedPatientId !== null) {
        const exp = parseInt(String(req.body.expectedPatientId));
        if (!Number.isFinite(exp)) return res.status(400).json({ message: "Invalid expectedPatientId" });
        if (encounter.patientId !== exp) {
          return res.status(409).json({
            message: "Patient mismatch: refusing to generate patient summary — this encounter belongs to a different patient.",
            encounterPatientId: encounter.patientId,
            expectedPatientId: exp,
          });
        }
      }

      const soap = encounter.soapNote as any;

      // ── Source of truth: edited fullNote ───────────────────────────────────
      // When a clinician edits/amends the SOAP, only soap.fullNote is updated —
      // the structured fields (assessment, subjective, plan) keep the original
      // AI text. So we parse every section from fullNote first, and only fall
      // back to the structured fields when fullNote is missing or a section
      // header can't be found. This guarantees the patient summary reflects
      // the FINAL edited note, not the stale original.
      const fullNote: string = soap.fullNote ?? "";

      const sliceSection = (label: RegExp, until: RegExp[]): string => {
        if (!fullNote) return "";
        const m = fullNote.match(label);
        if (!m || m.index === undefined) return "";
        const start = m.index + m[0].length;
        const after = fullNote.slice(start);
        let cutAt = after.length;
        for (const stop of until) {
          const sm = after.match(stop);
          if (sm && sm.index !== undefined && sm.index < cutAt) cutAt = sm.index;
        }
        return after.slice(0, cutAt).trim();
      };

      const SECTION_STOPS = [
        /\n\s*SUBJECTIVE\b/i,
        /\n\s*OBJECTIVE\b/i,
        /\n\s*ASSESSMENT\b/i,
        /\n\s*PLAN\b/i,
        /\n\s*CARE PLAN\b/i,
        /\n\s*FOLLOW[- ]?UP\b/i,
        /\n\s*SOAP NOTE END\b/i,
      ];

      const carePlanFromNote = sliceSection(/CARE PLAN[:\s]*\n?/i, SECTION_STOPS)
        || sliceSection(/^\s*PLAN[:\s]*\n?/im, SECTION_STOPS);
      const followUpFromNote = sliceSection(/FOLLOW[- ]?UP[:\s]*\n?/i, SECTION_STOPS);
      const assessmentFromNote = sliceSection(/ASSESSMENT[:\s]*\n?/i, SECTION_STOPS);
      const subjectiveFromNote = sliceSection(/SUBJECTIVE[:\s]*\n?/i, SECTION_STOPS);

      const carePlanText = carePlanFromNote || (soap.plan ?? "");
      const followUpText = followUpFromNote;
      const assessmentText = assessmentFromNote || (soap.assessment ?? "");
      const subjectiveText = subjectiveFromNote || (soap.subjective ?? "");

      // Pull supplement recommendations from linked lab result
      let supplementContext = "";
      if (encounter.linkedLabResultId) {
        const labResult = await storage.getLabResult(encounter.linkedLabResultId);
        if (labResult) {
          const interp = labResult.interpretationResult as any;
          const rawSupps: any[] = interp?.supplements ?? [];
          if (rawSupps.length) {
            const suppLines = rawSupps.map((s: any) => {
              const name = s.name ?? s.productName ?? "Supplement";
              const dose = s.dosage ?? s.dose ?? "";
              const reason = s.reason ?? s.rationale ?? s.indication ?? "";
              return `• ${name}${dose ? ` (${dose})` : ""}${reason ? ` — ${reason}` : ""}`;
            }).join("\n");
            supplementContext = `\n\nSUPPLEMENT RECOMMENDATIONS (from lab evaluation):\n${suppLines}`;
          }
        }
      }

      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      // Include a trimmed transcript so counseling, expectation-setting, and shared
      // decision-making conversations are preserved in the patient summary even when
      // the SOAP plan compresses them.
      const rawTranscript: string = (encounter.transcription || "").trim();
      const transcriptSnippet = rawTranscript.length > 8000
        ? rawTranscript.slice(0, 8000) + "\n…(transcript truncated)"
        : rawTranscript;
      const transcriptContext = transcriptSnippet
        ? `\n\nVISIT TRANSCRIPT (for preserving counseling, expectation-setting, and patient preferences — translate into patient-friendly language, do NOT quote verbatim):\n${transcriptSnippet}`
        : "";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a healthcare communication specialist writing a concierge-style, patient-facing visit summary that goes directly to the patient portal.

VOICE & TONE
- Write in second person ("you", "your"). Warm, supportive, confidence-building — like a high-touch follow-up message from the care team.
- Sound like a trusted clinician-friend, not a medical chart. Never robotic or alarmist.
- When two or more findings point in the same direction, connect them as one pattern in plain language ("your sleep, hydration, and protein were all a little light this week — that combo tends to drag energy down together") instead of stacking single-marker observations.
- Clear and concise, but prioritize clarity and guidance over brevity. Never sacrifice important counseling to be short.
- Translate clinical language into plain English. If a medical term is necessary, define it in the same sentence.

FORMATTING (STRICT)
- Plain text only. DO NOT use markdown. No asterisks (**), no underscores, no pound signs (#), no backticks.
- Section headers are written on their own line in Title Case followed by a colon (for example: "What We Discussed:").
- Use simple hyphen bullets ("- ") for lists. Never use "*" for bullets.
- Keep paragraphs short (2–4 sentences).

STRUCTURE
1. Brief warm intro paragraph (2–3 sentences) acknowledging the visit and the patient's main concerns.
2. What We Discussed: short narrative of the key topics covered, including any meaningful labs or findings explained in plain language.
3. Your Care Plan: list every specific supplement, medication, lifestyle change, and lab/test follow-up by name. Never use vague filler like "adjusting your current treatment" or "we may consider options." Each item must be actionable today.
4. New Medications & Therapies (only include this section if at least one new medication or therapy was started or changed): for EACH new medication/therapy, include the following sub-points as short bullet lines:
   - Why we chose it (brief, patient-friendly reason — e.g., "to help your body respond better to insulin and reduce appetite signals")
   - What to expect (how it works in simple terms; for titrated meds, mention the gradual dose-increase plan and reassurance about starting low)
   - How to use it (route, frequency, timing, with/without food, injection day, etc. — only what the provider said)
   - What to watch for (common side effects to expect, and red-flag symptoms that mean call us)
   - When to reach out (specific situations that warrant a message or call to the clinic)
5. What to Expect / Helpful Tips: include this whenever GLP-1 medications (tirzepatide, semaglutide, etc.), hormone therapy (testosterone, estradiol, progesterone, thyroid), or other lifestyle-sensitive therapies were discussed. Give 3–6 short, supportive, practical tips (hydration, protein, slow meals, injection technique, sleep, expected timeline for results, etc.).
6. Your Preferences & Our Decisions Together: if the patient expressed a preference (for example compounded vs. brand-name, oral vs. injectable, dosing schedule, cost considerations) or if risks and benefits were discussed, reflect that in 1–3 plain-language sentences so the patient sees their voice in the plan.
7. Next Steps: when to follow up, when to repeat labs, when to schedule the next visit, and how to contact the clinic.

CONTENT RULES
- Preserve the provider's education and counseling from the transcript and the SOAP plan — do not drop it. If the provider explained the "why" or set expectations, that belongs in the summary.
- Do not invent medications, dosages, instructions, or warnings. Only include what is supported by the SOAP note, care plan, supplement list, or transcript.
- Do not list lab values unless they were specifically explained to the patient.
- Do not include billing, coding, or internal clinical documentation language.
- Keep the overall length proportional to the visit — comprehensive when warranted, but never padded.`,
          },
          {
            role: "user",
            content: `Visit Type: ${encounter.visitType}
Chief Complaint: ${encounter.chiefComplaint || "General visit"}
Date: ${new Date(encounter.visitDate).toLocaleDateString()}

SOAP Assessment (use the FINAL edited assessment below):
${assessmentText}

CARE PLAN (use the FINAL edited care plan — include ALL items in patient summary, with the per-medication detail required by the system prompt):
${carePlanText}

Follow-Up Plan (FINAL edited):
${followUpText}

Subjective (what patient reported, FINAL edited):
${subjectiveText}
${supplementContext}${transcriptContext}

Generate the warm, plain-language patient visit summary now. Follow the formatting and structure rules exactly: plain text only (no markdown, no asterisks), section headers as "Title:" on their own line, hyphen bullets only. Make sure every new medication or therapy includes why we chose it, what to expect, how to use it, what to watch for, and when to reach out — translated into supportive patient-friendly language. This summary publishes directly to the patient portal.`,
          },
        ],
      });

      // Strip any residual markdown emphasis the model may produce, just in case.
      const rawSummary = completion.choices[0].message.content || "";
      const patientSummary = rawSummary
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2")
        .replace(/^\s*\*\s+/gm, "- ")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/`([^`]+)`/g, "$1");
      const updated = await storage.updateEncounter(id, clinicianId, { patientSummary }, clinicId);

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

  // ─── Encounter Drafts (server-side, cross-device) ────────────────────────────
  // These hold transcription-only drafts saved before a patient is selected.
  // They replace the old localStorage approach so drafts sync across devices.

  // GET /api/encounter-drafts — list drafts for current clinician
  app.get("/api/encounter-drafts", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const drafts = await storage.getEncounterDrafts(clinicianId);
      res.json(drafts);
    } catch (err) {
      res.status(500).json({ message: "Failed to load encounter drafts" });
    }
  });

  // POST /api/encounter-drafts — save a new draft
  app.post("/api/encounter-drafts", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const { transcription, visitDate, visitType } = req.body;
      if (!transcription || !visitDate) {
        return res.status(400).json({ message: "transcription and visitDate are required" });
      }
      const draft = await storage.createEncounterDraft({
        clinicianId,
        transcription,
        visitDate,
        visitType: visitType || "follow-up",
      });
      res.status(201).json(draft);
    } catch (err) {
      res.status(500).json({ message: "Failed to save encounter draft" });
    }
  });

  // DELETE /api/encounter-drafts/:id — delete a draft (used or discarded)
  app.delete("/api/encounter-drafts/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteEncounterDraft(id, clinicianId);
      if (!deleted) return res.status(404).json({ message: "Draft not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete encounter draft" });
    }
  });

  // ─── BAA e-Signature Routes ───────────────────────────────────────────────────

  // GET /api/baa/status — has the current clinician signed the BAA?
  app.get("/api/baa/status", requireAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      // Staff users inherit their clinician's BAA signature — they never sign their own
      const targetUserId = sess.staffClinicianId || (req.user as any)?.id;
      if (!targetUserId) return res.json({ signed: false, signedAt: null, signatureName: null, baaVersion: null });
      const sig = await storage.getBaaSignature(targetUserId);
      res.json({
        signed: !!sig,
        signedAt: sig?.signedAt ?? null,
        signatureName: sig?.signatureName ?? null,
        baaVersion: sig?.baaVersion ?? null,
      });
    } catch (err) {
      console.error("[BAA] Status error:", err);
      res.status(500).json({ message: "Failed to load BAA status" });
    }
  });

  // POST /api/baa/sign — record electronic signature
  app.post("/api/baa/sign", requireAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      // Staff cannot sign — only the clinician/owner signs on behalf of the clinic
      if (sess.staffId) {
        return res.status(403).json({ message: "Only the clinic owner can sign the BAA. Please ask your clinic administrator to sign it." });
      }
      const user = req.user as any;
      if (!user) return res.status(401).json({ message: "Authentication required" });
      const billingOk = user.freeAccount || (user.stripeSubscriptionId && ["trial", "active", "trialing"].includes(user.subscriptionStatus));
      if (!billingOk) {
        return res.status(403).json({ message: "Active billing is required before signing the BAA" });
      }
      const { signatureName } = req.body;
      if (!signatureName || typeof signatureName !== "string" || signatureName.trim().length < 2) {
        return res.status(400).json({ message: "Full legal name is required to sign the BAA" });
      }
      // Prevent double-signing
      const existing = await storage.getBaaSignature(user.id);
      if (existing) {
        return res.json({ signed: true, signedAt: existing.signedAt, signatureName: existing.signatureName });
      }
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        || req.socket?.remoteAddress
        || "unknown";
      const sig = await storage.createBaaSignature({
        userId: user.id,
        signatureName: signatureName.trim(),
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || null,
        baaVersion: "1.0",
      });
      res.json({ signed: true, signedAt: sig.signedAt, signatureName: sig.signatureName });
    } catch (err: any) {
      console.error("[BAA] Sign error:", err);
      res.status(500).json({ message: "Failed to record BAA signature" });
    }
  });

  // ─── Stripe Billing Routes ────────────────────────────────────────────────────

  const STRIPE_PRICE_ID = "price_1TJb7eKbgudErHaMxs1B2BzZ";

  // GET /api/billing/config — expose publishable key to frontend (public — pk_ keys are intentionally client-side safe)
  app.get("/api/billing/config", (_req, res) => {
    const key = process.env.STRIPE_PUBLISHABLE_KEY || "";
    res.json({ publishableKey: key, configured: key.startsWith("pk_") });
  });

  function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" });
  }

  /**
   * Safely convert a Stripe Unix-seconds timestamp to a Date.
   * Returns null if the value is missing, zero, or would produce an invalid Date.
   * Stripe's newer API versions can return null for current_period_end on trialing
   * subscriptions, so we fall back to trial_end when needed.
   */
  function stripeTs(unixSeconds: number | null | undefined): Date | null {
    if (unixSeconds == null || unixSeconds === 0) return null;
    const d = new Date(unixSeconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Resolve the effective period-end Date from a Stripe subscription.
   * Prefers current_period_end; falls back to trial_end for trialing subs.
   */
  function subPeriodEnd(sub: any): Date | null {
    return stripeTs(sub.current_period_end) ?? stripeTs(sub.trial_end) ?? null;
  }

  // GET /api/billing/status — return subscription info for the current clinician
  // Suite members inherit billing from the clinic owner's subscription.
  app.get("/api/billing/status", requireAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      let user = req.user as any;

      // Staff sessions: load the owning clinician so billing inherits from them
      let isStaffSession = false;
      if (!user && sess?.staffId && sess?.staffClinicianId) {
        isStaffSession = true;
        try {
          user = await storage.getUserById(sess.staffClinicianId);
        } catch {
          user = null;
        }
        if (!user) {
          return res.status(401).json({ message: "Not authenticated" });
        }
      }

      let clinicPlan: string = "solo";
      let clinicMaxProviders: number = 1;
      let clinicBaseProviderLimit: number = 1;
      let clinicExtraSeats: number = 0;
      let isClinicOwner = true;
      let ownerName: string | null = null;

      let effectiveSubStatus = user.subscriptionStatus;
      let effectiveSubId = user.stripeSubscriptionId;
      let effectivePeriodEnd = user.stripeCurrentPeriodEnd;
      let effectiveCancelAtPeriodEnd = user.stripeCancelAtPeriodEnd ?? false;
      let effectiveFreeAccount = user.freeAccount ?? false;

      if (user.defaultClinicId) {
        const [clinic] = await storageDb
          .select({
            subscriptionPlan: clinics.subscriptionPlan,
            maxProviders: clinics.maxProviders,
            baseProviderLimit: clinics.baseProviderLimit,
            extraProviderSeats: clinics.extraProviderSeats,
          })
          .from(clinics)
          .where(eq(clinics.id, user.defaultClinicId));

        if (clinic) {
          clinicPlan = clinic.subscriptionPlan ?? "solo";
          clinicMaxProviders = clinic.maxProviders ?? 1;
          clinicBaseProviderLimit = clinic.baseProviderLimit ?? 1;
          clinicExtraSeats = clinic.extraProviderSeats ?? 0;
        }

        const membership = await storageDb
          .select({ adminRole: clinicMemberships.adminRole })
          .from(clinicMemberships)
          .where(and(eq(clinicMemberships.clinicId, user.defaultClinicId), eq(clinicMemberships.userId, user.id)))
          .limit(1);
        const myRole = membership[0]?.adminRole;

        const [clinicRecord] = await storageDb
          .select({ ownerUserId: clinics.ownerUserId })
          .from(clinics)
          .where(eq(clinics.id, user.defaultClinicId))
          .limit(1);

        isClinicOwner = !isStaffSession && (myRole === "owner" || (clinicRecord?.ownerUserId === user.id));

        if (!isClinicOwner) {
          let ownerUserId: number | null = null;

          const ownerMembership = await storageDb
            .select({ userId: clinicMemberships.userId })
            .from(clinicMemberships)
            .where(and(eq(clinicMemberships.clinicId, user.defaultClinicId), eq(clinicMemberships.adminRole, "owner" as any)))
            .limit(1);

          if (ownerMembership.length) {
            ownerUserId = ownerMembership[0].userId;
          } else if (clinicRecord?.ownerUserId) {
            ownerUserId = clinicRecord.ownerUserId;
          }

          if (ownerUserId) {
            const [ownerUser] = await storageDb.select().from(usersTable).where(eq(usersTable.id, ownerUserId)).limit(1);
            if (ownerUser) {
              effectiveSubStatus = ownerUser.subscriptionStatus;
              effectiveSubId = ownerUser.stripeSubscriptionId;
              effectivePeriodEnd = ownerUser.stripeCurrentPeriodEnd;
              effectiveCancelAtPeriodEnd = ownerUser.stripeCancelAtPeriodEnd ?? false;
              effectiveFreeAccount = ownerUser.freeAccount ?? false;
              ownerName = `${ownerUser.firstName ?? ""} ${ownerUser.lastName ?? ""}`.trim() || ownerUser.email;
            }
          }
        }
      }

      const allowedStatuses = ["active", "trial", "trialing"];
      const billingValid =
        effectiveFreeAccount ||
        (!!effectiveSubId && allowedStatuses.includes(effectiveSubStatus ?? "")) ||
        (!isClinicOwner && allowedStatuses.includes(effectiveSubStatus ?? ""));

      res.json({
        subscriptionStatus: effectiveSubStatus,
        freeAccount: effectiveFreeAccount,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: effectiveSubId,
        stripeCurrentPeriodEnd: effectivePeriodEnd,
        stripeCancelAtPeriodEnd: effectiveCancelAtPeriodEnd,
        clinicPlan,
        clinicMaxProviders,
        clinicBaseProviderLimit,
        clinicExtraSeats,
        isClinicOwner,
        ownerName,
        billingValid,
      });
    } catch (err) {
      console.error("[Billing] Status error:", err);
      res.status(500).json({ message: "Failed to load billing status" });
    }
  });

  // POST /api/billing/guest-setup-intent — create a SetupIntent for pre-registration card collection (no auth)
  app.post("/api/billing/guest-setup-intent", async (_req, res) => {
    try {
      const stripe = getStripe();
      const setupIntent = await stripe.setupIntents.create({
        payment_method_types: ["card"],
        usage: "off_session",
      });
      res.json({ clientSecret: setupIntent.client_secret });
    } catch (err: any) {
      console.error("[Billing] Guest SetupIntent error:", err);
      res.status(500).json({ message: err.message || "Failed to initialize payment setup" });
    }
  });

  // POST /api/billing/create-setup-intent — create a SetupIntent for card collection
  app.post("/api/billing/create-setup-intent", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.freeAccount) {
        return res.status(400).json({ message: "Free accounts do not require a payment method." });
      }
      const stripe = getStripe();

      // Get or create a Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: String(user.id), clinicName: user.clinicName },
        });
        customerId = customer.id;
        await storage.updateUserStripe(user.id, { stripeCustomerId: customerId });
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
      });

      res.json({ clientSecret: setupIntent.client_secret, customerId });
    } catch (err: any) {
      console.error("[Billing] SetupIntent error:", err);
      res.status(500).json({ message: err.message || "Failed to initialize payment setup" });
    }
  });

  // POST /api/billing/subscribe — create subscription after card is saved
  app.post("/api/billing/subscribe", requireAuth, async (req, res) => {
    try {
      const stripe = getStripe();
      const user = req.user as any;
      const { paymentMethodId, promoCode } = req.body;
      if (!paymentMethodId) return res.status(400).json({ message: "paymentMethodId is required" });

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
      }

      // Attach payment method and set as default
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // Resolve promo code → promotion_code ID if provided
      let promotionCodeId: string | undefined;
      if (promoCode) {
        if (promoCode.startsWith("promo_")) {
          // Caller provided a Stripe promotion code ID directly
          promotionCodeId = promoCode;
        } else {
          const promoCodes = await stripe.promotionCodes.list({ code: promoCode, active: true, limit: 1 });
          if (promoCodes.data.length > 0) {
            promotionCodeId = promoCodes.data[0].id;
          } else {
            return res.status(400).json({ message: `Promo code "${promoCode}" is not valid or has expired.` });
          }
        }
      }

      // Create subscription with 14-day trial
      const subscriptionParams: any = {
        customer: customerId,
        items: [{ price: STRIPE_PRICE_ID }],
        trial_period_days: 14,
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
      };
      if (promotionCodeId) {
        subscriptionParams.discounts = [{ promotion_code: promotionCodeId }];
      }
      const subscription = await stripe.subscriptions.create(subscriptionParams);

      const periodEnd = subPeriodEnd(subscription);
      const updated = await storage.updateUserStripe(user.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeCurrentPeriodEnd: periodEnd,
        stripeCancelAtPeriodEnd: false,
        subscriptionStatus: subscription.status === "trialing" ? "trial" : subscription.status,
      });

      // Refresh session user
      if (updated) (req as any).user = updated;

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        trialEnd: (subscription as any).trial_end,
        currentPeriodEnd: (subscription as any).current_period_end,
      });
    } catch (err: any) {
      console.error("[Billing] Subscribe error:", err);
      res.status(500).json({ message: err.message || "Failed to create subscription" });
    }
  });

  // POST /api/billing/subscribe-suite
  // Subscribes a new (no existing subscription) user directly to ClinIQ Suite.
  // Mirrors /api/billing/subscribe but uses STRIPE_SUITE_PRICE_ID and stamps the
  // clinic as 'suite' immediately after the subscription is created.
  app.post("/api/billing/subscribe-suite", requireAuth, async (req, res) => {
    try {
      const SUITE_PRICE_ID = process.env.STRIPE_SUITE_PRICE_ID;
      if (!SUITE_PRICE_ID) {
        return res.status(503).json({ message: "Suite plan is not yet available. Contact support." });
      }

      const stripe = getStripe();
      const user = req.user as any;

      if (user.freeAccount) {
        return res.status(400).json({ message: "Free accounts do not require a subscription." });
      }
      if (user.stripeSubscriptionId) {
        return res.status(400).json({ message: "An active subscription already exists. Use the upgrade route instead." });
      }

      const { paymentMethodId } = req.body;
      if (!paymentMethodId) return res.status(400).json({ message: "paymentMethodId is required" });

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
      }

      // Attach payment method and set as default
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // Create Suite subscription with 14-day trial
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: SUITE_PRICE_ID }],
        trial_period_days: 14,
        payment_settings: {
          payment_method_types: ["card"],
          save_default_payment_method: "on_subscription",
        },
        expand: ["latest_invoice.payment_intent"],
        metadata: { plan: "suite", userId: String(user.id) },
      });

      const periodEnd = subPeriodEnd(subscription);
      const subStatus = subscription.status === "trialing" ? "trial" : subscription.status;

      const updated = await storage.updateUserStripe(user.id, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        stripeCurrentPeriodEnd: periodEnd,
        stripeCancelAtPeriodEnd: false,
        subscriptionStatus: subStatus,
      });
      if (updated) (req as any).user = updated;

      // Stamp clinic plan immediately — webhook will confirm/resync async
      if (user.defaultClinicId) {
        await updateClinicPlanFromStripe({
          clinicId: user.defaultClinicId,
          subscriptionPlan: "suite",
          baseProviderLimit: SUITE_BASE_PROVIDER_LIMIT,
          extraProviderSeats: 0,
          subscriptionStatus: subStatus,
          stripeSubscriptionId: subscription.id,
        });
      }

      console.log(`[Billing] Suite subscription created: user=${user.id} sub=${subscription.id}`);

      res.json({
        subscriptionId: subscription.id,
        status: subscription.status,
        plan: "suite",
        trialEnd: (subscription as any).trial_end,
        currentPeriodEnd: (subscription as any).current_period_end,
      });
    } catch (err: any) {
      console.error("[Billing] Subscribe-suite error:", err);
      res.status(500).json({ message: err.message || "Failed to create Suite subscription" });
    }
  });

  // POST /api/billing/upgrade-to-suite
  // Upgrades an existing Solo subscriber to ClinIQ Suite by swapping the
  // subscription item. No new card required — uses the customer's stored
  // payment method. Stamps the clinic plan immediately on success.
  app.post("/api/billing/upgrade-to-suite", requireAuth, async (req, res) => {
    try {
      const SUITE_PRICE_ID = process.env.STRIPE_SUITE_PRICE_ID;
      if (!SUITE_PRICE_ID) {
        return res.status(503).json({ message: "Suite plan is not yet available. Contact support." });
      }

      const stripe = getStripe();
      const user = req.user as any;

      if (user.freeAccount) {
        return res.status(400).json({ message: "Free accounts do not require billing changes." });
      }
      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: "No active subscription found. Subscribe first." });
      }

      // Retrieve existing subscription with items expanded
      const existingSub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
        expand: ["items"],
      }) as any;

      // Guard: already on Suite
      const alreadySuite = existingSub.items?.data?.some((i: any) => i.price?.id === SUITE_PRICE_ID);
      if (alreadySuite) {
        return res.status(400).json({ message: "This subscription is already on the ClinIQ Suite plan." });
      }

      // Build the items update: delete all existing items, add Suite price
      const deleteItems = existingSub.items.data.map((i: any) => ({ id: i.id, deleted: true }));
      const suiteItem = { price: SUITE_PRICE_ID };

      const updatedSub = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        items: [...deleteItems, suiteItem],
        proration_behavior: "create_prorations",
        metadata: { plan: "suite", upgraded_from: "solo", userId: String(user.id) },
      } as any);

      const periodEnd = subPeriodEnd(updatedSub);
      const subStatus = (updatedSub as any).status === "trialing" ? "trial" : (updatedSub as any).status;

      const updated = await storage.updateUserStripe(user.id, {
        stripeSubscriptionId: updatedSub.id,
        stripeCurrentPeriodEnd: periodEnd,
        stripeCancelAtPeriodEnd: false,
        subscriptionStatus: subStatus,
      });
      if (updated) (req as any).user = updated;

      // Stamp clinic plan immediately — webhook will confirm/resync async
      if (user.defaultClinicId) {
        await updateClinicPlanFromStripe({
          clinicId: user.defaultClinicId,
          subscriptionPlan: "suite",
          baseProviderLimit: SUITE_BASE_PROVIDER_LIMIT,
          extraProviderSeats: 0,
          subscriptionStatus: subStatus,
          stripeSubscriptionId: updatedSub.id,
        });
      }

      console.log(`[Billing] Upgraded to Suite: user=${user.id} sub=${updatedSub.id}`);

      res.json({
        subscriptionId: updatedSub.id,
        status: (updatedSub as any).status,
        plan: "suite",
        currentPeriodEnd: (updatedSub as any).current_period_end,
      });
    } catch (err: any) {
      console.error("[Billing] Upgrade-to-suite error:", err);
      res.status(500).json({ message: err.message || "Failed to upgrade to Suite" });
    }
  });

  // POST /api/billing/cancel — cancel at end of current period
  app.post("/api/billing/cancel", requireAuth, async (req, res) => {
    try {
      const stripe = getStripe();
      const user = req.user as any;
      if (!user.stripeSubscriptionId) return res.status(400).json({ message: "No active subscription found" });

      const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      const updated = await storage.updateUserStripe(user.id, { stripeCancelAtPeriodEnd: true });
      if (updated) (req as any).user = updated;

      res.json({ cancelAtPeriodEnd: true, currentPeriodEnd: (subscription as any).current_period_end });
    } catch (err: any) {
      console.error("[Billing] Cancel error:", err);
      res.status(500).json({ message: err.message || "Failed to cancel subscription" });
    }
  });

  // POST /api/billing/reactivate — undo cancellation
  app.post("/api/billing/reactivate", requireAuth, async (req, res) => {
    try {
      const stripe = getStripe();
      const user = req.user as any;
      if (!user.stripeSubscriptionId) return res.status(400).json({ message: "No active subscription found" });

      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      const updated = await storage.updateUserStripe(user.id, { stripeCancelAtPeriodEnd: false });
      if (updated) (req as any).user = updated;

      res.json({ cancelAtPeriodEnd: false });
    } catch (err: any) {
      console.error("[Billing] Reactivate error:", err);
      res.status(500).json({ message: err.message || "Failed to reactivate subscription" });
    }
  });

  // POST /api/stripe/webhook — handle Stripe events
  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: any;

    try {
      if (webhookSecret && sig) {
        const stripe = getStripe();
        event = stripe.webhooks.constructEvent((req as any).rawBody || req.body, sig, webhookSecret);
      } else {
        event = req.body;
      }
    } catch (err: any) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).json({ message: `Webhook error: ${err.message}` });
    }

    try {
      const subscription = event.data?.object;

      // Price IDs for plan detection (read at webhook time to pick up env changes)
      const SUITE_PRICE_ID = process.env.STRIPE_SUITE_PRICE_ID;

      switch (event.type) {
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const customerId = subscription.customer as string;
          const allUsers = await storage.getAllUsers();
          const user = allUsers.find(u => u.stripeCustomerId === customerId);
          if (!user) break;

          let status = subscription.status;
          if (status === "trialing") status = "trial";
          else if (status === "active") status = "active";
          else if (status === "past_due") status = "past_due";
          else if (status === "canceled" || status === "unpaid") status = "canceled";

          await storage.updateUserStripe(user.id, {
            stripeSubscriptionId: subscription.id,
            stripeCurrentPeriodEnd: subPeriodEnd(subscription),
            stripeCancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
            subscriptionStatus: status,
          });

          // Detect plan type from subscription items and stamp the clinic
          if (user.defaultClinicId) {
            const items: any[] = subscription.items?.data ?? [];
            const isSuite = SUITE_PRICE_ID
              ? items.some((item: any) => item.price?.id === SUITE_PRICE_ID)
              : false;

            // Count purchased extra seat items from provider-seat price
            const SEAT_PRICE_ID = process.env.STRIPE_PROVIDER_SEAT_PRICE_ID;
            const seatItem = SEAT_PRICE_ID
              ? items.find((item: any) => item.price?.id === SEAT_PRICE_ID)
              : undefined;
            const extraSeatsFromStripe = seatItem?.quantity ?? 0;

            if (isSuite) {
              await updateClinicPlanFromStripe({
                clinicId: user.defaultClinicId,
                subscriptionPlan: "suite",
                baseProviderLimit: SUITE_BASE_PROVIDER_LIMIT, // 2
                extraProviderSeats: extraSeatsFromStripe,
                subscriptionStatus: status,
                stripeSubscriptionId: subscription.id,
              });
            } else {
              // Solo or unrecognized plan — enforce solo limits
              await updateClinicPlanFromStripe({
                clinicId: user.defaultClinicId,
                subscriptionPlan: "solo",
                baseProviderLimit: 1,
                extraProviderSeats: 0,
                subscriptionStatus: status,
                stripeSubscriptionId: subscription.id,
              });
            }
          }
          break;
        }

        case "invoice.payment_failed": {
          const customerId = subscription.customer as string;
          const allUsers = await storage.getAllUsers();
          const user = allUsers.find(u => u.stripeCustomerId === customerId);
          if (user) {
            await storage.updateUserStripe(user.id, { subscriptionStatus: "past_due" });
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const customerId = subscription.customer as string;
          const allUsers = await storage.getAllUsers();
          const user = allUsers.find(u => u.stripeCustomerId === customerId);
          if (user && user.subscriptionStatus === "past_due") {
            await storage.updateUserStripe(user.id, { subscriptionStatus: "active" });
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("[Stripe Webhook] Handler error:", err);
      res.status(500).json({ message: "Webhook handler error" });
    }
  });

  // ── Provider Seat Management ──────────────────────────────────────────────
  //
  // POST /api/clinics/:id/providers/check
  //   Checks whether a provider can be added and whether billing confirmation
  //   is required. Does NOT create anything. Safe to call on every click.
  //
  // POST /api/clinics/:id/providers/confirm-add
  //   Confirmed add flow. Re-validates, updates Stripe first (if needed),
  //   then creates the provider only if Stripe succeeds. Idempotent by email.

  app.post("/api/clinics/:id/providers/check", requireAuth, async (req, res) => {
    try {
      const clinicId = parseInt(req.params.id, 10);
      if (isNaN(clinicId)) return res.status(400).json({ message: "Invalid clinic ID" });

      const user = req.user as any;

      // Must be clinic admin
      const memberRows = await storageDb
        .select({ role: clinicMemberships.role })
        .from(clinicMemberships)
        .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, user.id), eq(clinicMemberships.isActive, true)));
      if (memberRows.length === 0 || memberRows[0].role !== "admin") {
        return res.status(403).json({ message: "Only clinic admins can manage providers." });
      }

      const planState = await getClinicPlanState(clinicId, user.freeAccount ?? false, user.stripeSubscriptionId);

      // Case 1: Solo plan at limit
      if (planState.isSoloPlan && !planState.canAddProviderWithoutBilling) {
        return res.status(200).json({
          allowed: false,
          upgrade_required: true,
          message: "The Solo plan supports 1 provider. Upgrade to ClinIQ Suite to add additional providers.",
          planState,
        });
      }

      // Case 2: Suite (or free) — within included limit, no billing needed
      if (planState.canAddProviderWithoutBilling) {
        return res.json({
          allowed: true,
          confirmation_required: false,
          message: null,
          planState,
        });
      }

      // Case 3: Suite — would exceed current max_providers, paid seat needed
      const projectedCount = planState.activeProviderCount + 1;
      return res.json({
        allowed: false,
        confirmation_required: true,
        billing_change_type: "add_provider_seat",
        monthly_price_increase: EXTRA_SEAT_MONTHLY_PRICE,
        message: `Adding a provider will increase your monthly cost by $${EXTRA_SEAT_MONTHLY_PRICE}/month.`,
        current_provider_count: planState.activeProviderCount,
        max_providers: planState.maxProviders,
        projected_provider_count: projectedCount,
        planState,
      });
    } catch (err: any) {
      console.error("[Provider/check]", err);
      res.status(500).json({ message: err.message || "Failed to check provider seat status" });
    }
  });

  app.post("/api/clinics/:id/providers/confirm-add", requireAuth, async (req, res) => {
    try {
      const clinicId = parseInt(req.params.id, 10);
      if (isNaN(clinicId)) return res.status(400).json({ message: "Invalid clinic ID" });

      const user = req.user as any;
      const { displayName, credentials, specialty, npi, userId: providerUserId, email: providerEmail } = req.body;

      if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
        return res.status(400).json({ message: "displayName is required" });
      }

      // Must be clinic admin
      const memberRows = await storageDb
        .select({ role: clinicMemberships.role })
        .from(clinicMemberships)
        .where(and(eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, user.id), eq(clinicMemberships.isActive, true)));
      if (memberRows.length === 0 || memberRows[0].role !== "admin") {
        return res.status(403).json({ message: "Only clinic admins can manage providers." });
      }
      // (Email-based dedup for providers requires a future email column on providers; deferred)

      // Re-validate plan state server-side (never trust the frontend's earlier check)
      const planState = await getClinicPlanState(clinicId, user.freeAccount ?? false, user.stripeSubscriptionId);

      // Solo plan — hard block
      if (planState.isSoloPlan && !planState.canAddProviderWithoutBilling) {
        return res.status(403).json({
          allowed: false,
          upgrade_required: true,
          message: "Solo plan supports only 1 provider. Upgrade to ClinIQ Suite.",
        });
      }

      // Within limit — create without billing
      if (planState.canAddProviderWithoutBilling) {
        const { providerId } = await createProviderWithMembership({
          clinicId,
          userId: providerUserId ?? null,
          displayName: displayName.trim(),
          credentials: credentials ?? null,
          specialty: specialty ?? null,
          npi: npi ?? null,
        });
        const activeCount = await getActiveProviderCount(clinicId);
        return res.status(201).json({
          success: true,
          billing_updated: false,
          providerId,
          active_provider_count: activeCount,
          max_providers: planState.maxProviders,
        });
      }

      // Paid seat required — check Stripe env vars
      const SUITE_SEAT_PRICE_ID = process.env.STRIPE_PROVIDER_SEAT_PRICE_ID;
      if (!SUITE_SEAT_PRICE_ID) {
        return res.status(503).json({
          message: "Provider seat billing is not yet configured. Contact support to add a provider.",
        });
      }

      // Free accounts bypass Stripe regardless
      if (user.freeAccount) {
        return res.status(403).json({
          message: "Free accounts cannot purchase additional provider seats.",
        });
      }

      // Must have a Suite subscription attached
      if (!user.stripeSubscriptionId) {
        return res.status(402).json({
          message: "No active Suite subscription found. Please subscribe to ClinIQ Suite before adding providers.",
        });
      }

      // ── Stripe: increment provider-seat quantity ───────────────────────────
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
        expand: ["items"],
      });

      // Find the extra-seat line item (if it exists)
      const items: any[] = (subscription as any).items?.data ?? [];
      const seatItem = items.find((item: any) => item.price?.id === SUITE_SEAT_PRICE_ID);

      // Idempotency key: clinicId + current extra_provider_seats count (prevents double-billing on retry)
      const idempotencyKey = `provider-seat-${clinicId}-${planState.extraProviderSeats + 1}`;

      let stripeUpdateOk = false;
      try {
        if (seatItem) {
          // Increment existing seat item quantity
          await stripe.subscriptionItems.update(
            seatItem.id,
            { quantity: (seatItem.quantity ?? 0) + 1 },
            { idempotencyKey }
          );
        } else {
          // Add a new extra-seat item to the subscription
          await stripe.subscriptionItems.create(
            {
              subscription: user.stripeSubscriptionId,
              price: SUITE_SEAT_PRICE_ID,
              quantity: 1,
            },
            { idempotencyKey }
          );
        }
        stripeUpdateOk = true;
      } catch (stripeErr: any) {
        console.error("[Provider/confirm-add] Stripe update failed:", stripeErr.message);
        return res.status(402).json({
          message: "Billing update failed — no provider was created.",
          stripe_error: stripeErr.message,
        });
      }

      // ── Only if Stripe succeeded: update DB + create provider ─────────────
      // If DB update fails after Stripe success, log clearly for manual repair
      const newExtraSeats = planState.extraProviderSeats + 1;
      try {
        await updateClinicSeats(clinicId, newExtraSeats);
      } catch (dbErr: any) {
        console.error(
          `[Provider/confirm-add] STRIPE SUCCEEDED but clinic seat DB update FAILED for clinic ${clinicId}. ` +
          `extraProviderSeats should be ${newExtraSeats}. Manual repair required.`,
          dbErr
        );
        // Still continue — seat was purchased; don't block provider creation
      }

      const { providerId } = await createProviderWithMembership({
        clinicId,
        userId: providerUserId ?? null,
        displayName: displayName.trim(),
        credentials: credentials ?? null,
        specialty: specialty ?? null,
        npi: npi ?? null,
      });

      const activeCount = await getActiveProviderCount(clinicId);
      return res.status(201).json({
        success: true,
        billing_updated: true,
        monthly_increase: EXTRA_SEAT_MONTHLY_PRICE,
        providerId,
        active_provider_count: activeCount,
        max_providers: planState.maxProviders + 1,
        extra_provider_seats: newExtraSeats,
      });
    } catch (err: any) {
      console.error("[Provider/confirm-add]", err);
      res.status(500).json({ message: err.message || "Failed to add provider" });
    }
  });

  // ── Boulevard Appointments Webhook (Zapier → your server) ─────────────────
  // Public endpoint — no session auth needed. Clinician ID is in the URL path.
  // Set up 3 Zaps in Zapier, all posting to: /api/webhooks/boulevard/<your-clinician-id>
  //   Zap 1: Boulevard "New Appointment"      → Webhook POST (event: "appointment.created")
  //   Zap 2: Boulevard "Updated Appointment"  → Webhook POST (event: "appointment.updated")
  //   Zap 3: Boulevard "Cancelled Appointment"→ Webhook POST (event: "appointment.cancelled")
  app.post("/api/webhooks/boulevard/:clinicianId", async (req, res) => {
    try {
      const clinicianId = parseInt(req.params.clinicianId, 10);
      if (isNaN(clinicianId)) return res.status(400).json({ error: "Invalid clinician ID" });

      const payload = req.body as Record<string, any>;

      // Accept multiple possible field name conventions from Zapier/Boulevard
      const boulevardId =
        payload.appointment_id ?? payload.id ?? payload.appointmentId ?? payload.blvd_id ?? String(Date.now());

      const rawStart =
        payload.start_time ?? payload.start_at ?? payload.startTime ?? payload.appointment_start ?? payload.date;
      if (!rawStart) return res.status(400).json({ error: "Missing appointment start time" });

      const appointmentStart = new Date(rawStart);
      if (isNaN(appointmentStart.getTime())) return res.status(400).json({ error: "Invalid start time" });

      const rawEnd = payload.end_time ?? payload.end_at ?? payload.endTime ?? payload.appointment_end;
      const appointmentEnd = rawEnd ? new Date(rawEnd) : undefined;

      const rawStatus = (payload.status ?? payload.event ?? "scheduled").toLowerCase();
      const isCancelled =
        rawStatus.includes("cancel") || rawStatus === "appointment.cancelled";

      const patientName =
        payload.patient_name ?? payload.client_name ?? payload.customer_name ?? payload.name ?? "Unknown Patient";

      const patientEmail =
        payload.patient_email ?? payload.client_email ?? payload.customer_email ?? payload.email ?? null;

      const patientPhone =
        payload.patient_phone ?? payload.client_phone ?? payload.customer_phone ?? payload.phone ?? null;

      const serviceType =
        payload.service ?? payload.service_name ?? payload.service_type ?? payload.visit_type ?? payload.appointment_type ?? null;

      const staffName =
        payload.staff_name ?? payload.provider ?? payload.provider_name ?? payload.staff ?? payload.employee ?? null;

      const locationName =
        payload.location ?? payload.location_name ?? payload.site ?? payload.clinic ?? null;

      const durationMinutes =
        payload.duration_minutes ?? payload.duration ?? payload.duration_mins ?? null;

      if (isCancelled) {
        await storage.cancelAppointment(clinicianId, boulevardId);
        return res.json({ received: true, action: "cancelled" });
      }

      const status = rawStatus.includes("reschedul") ? "rescheduled" : "scheduled";

      const appt = await storage.upsertAppointment(clinicianId, boulevardId, {
        patientName,
        patientEmail,
        patientPhone,
        serviceType,
        staffName,
        locationName,
        appointmentStart,
        appointmentEnd: appointmentEnd ?? null,
        durationMinutes: durationMinutes ? parseInt(String(durationMinutes), 10) : null,
        status,
        notes: payload.notes ?? payload.note ?? null,
        rawPayload: payload,
      });

      // Auto-link — or auto-create — patient record
      // Matching priority: 1) email  2) full name  3) create new (last resort)
      try {
        // Resolve clinicId for this clinician (webhook uses URL-param clinicianId, not session)
        const webhookUser = await storage.getUserById(clinicianId);
        const webhookClinicId = webhookUser?.defaultClinicId ?? null;
        const allPatients = await storage.getAllPatients(clinicianId, webhookClinicId);

        // ── 1. Email match ──────────────────────────────────────────────────
        const emailMatched = patientEmail
          ? allPatients.find(p => p.email?.toLowerCase() === patientEmail.toLowerCase())
          : undefined;

        if (emailMatched) {
          // Perfect match — link all unlinked appointments for this email
          if (patientEmail) {
            const apptsByEmail = await storage.getAppointmentsByPatientEmail(patientEmail, clinicianId);
            for (const m of apptsByEmail) {
              if (!m.patientId) await storage.matchAppointmentToPatient(m.id, emailMatched.id);
            }
          } else {
            await storage.matchAppointmentToPatient(appt.id, emailMatched.id);
          }
        } else {
          // ── 2. Name match (fallback — catches lab-created profiles with no email) ──
          const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
          const webhookFullName = normalize(patientName ?? "");
          const nameMatched = webhookFullName
            ? allPatients.find(p => normalize(`${p.firstName} ${p.lastName}`) === webhookFullName)
            : undefined;

          if (nameMatched) {
            // Found by name — update profile with email if it was missing
            if (patientEmail && !nameMatched.email) {
              await storage.updatePatient(nameMatched.id, { email: patientEmail.toLowerCase() }, clinicianId, webhookClinicId);
            }
            await storage.matchAppointmentToPatient(appt.id, nameMatched.id);
          } else if (patientEmail) {
            // ── 3. Create new minimal profile (true new patient) ─────────────
            // Only when we have an email, so the next appointment will match correctly.
            const nameParts = (patientName ?? "Unknown Patient").trim().split(/\s+/);
            const firstName = nameParts[0] || "Unknown";
            const lastName = nameParts.slice(1).join(" ") || "Patient";
            const svcStr = (serviceType ?? "").toLowerCase();
            const gender = svcStr.includes("women") || svcStr.includes("female") || svcStr.includes("estrogen") ? "female" : "male";
            const newPatient = await storage.createPatient({
              userId: clinicianId,
              ...(webhookClinicId ? { clinicId: webhookClinicId } : {}),
              firstName,
              lastName,
              gender,
              email: patientEmail.toLowerCase(),
            });
            await storage.matchAppointmentToPatient(appt.id, newPatient.id);
          }
          // If no email AND no name match, appointment is saved unlinked — clinician links manually
        }
      } catch {
        // non-fatal — appointment is saved even if linking/creation fails
      }

      res.json({ received: true, action: "upserted", id: appt.id });
    } catch (err: any) {
      console.error("[Boulevard Webhook] Error:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // GET /api/appointments — clinician views all their appointments
  app.get("/api/appointments", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const appts = await storage.getAppointmentsByUserId(userId);
      res.json(appts);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load appointments" });
    }
  });

  // GET /api/portal/appointments — patient portal view of their own appointments
  app.get("/api/portal/appointments", requirePortalAuth, async (req: any, res) => {
    try {
      const portalUser = req.portalUser;
      const appts = await storage.getAppointmentsByPatientId(portalUser.patientId);
      res.json(appts);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load appointments" });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SCHEDULING — native appointments, types, provider hours, time-off, slots
  // ══════════════════════════════════════════════════════════════════════════

  // --- Helper: parse Date safely ---
  const parseDate = (v: any): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // --- Middleware: require owner or admin role to manage scheduling settings ---
  async function requireSchedulingAdmin(req: any, res: any, next: any) {
    try {
      const role = await getSessionAdminRole(req);
      if (role === "owner" || role === "admin") return next();
      return res.status(403).json({ message: "Owner or admin role required to manage scheduling settings." });
    } catch {
      return res.status(403).json({ message: "Permission check failed." });
    }
  }

  // --- Helper: strip immutable/sensitive fields from PATCH bodies ---
  function pickAppointmentUpdates(body: any) {
    const allowed = [
      "patientId", "providerId", "appointmentTypeId",
      "patientName", "patientEmail", "patientPhone",
      "serviceType", "staffName", "locationName",
      "appointmentStart", "appointmentEnd", "durationMinutes",
      "status", "notes",
    ];
    const out: any = {};
    for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
    return out;
  }
  function pickAppointmentTypeUpdates(body: any) {
    const allowed = ["name", "description", "durationMinutes", "color", "isActive"];
    const out: any = {};
    for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
    return out;
  }
  function pickProviderAvailabilityUpdates(body: any) {
    const allowed = ["providerId", "dayOfWeek", "startTime", "endTime", "isActive"];
    const out: any = {};
    for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
    return out;
  }

  // GET /api/scheduling/providers — every clinic team member is schedulable
  // (providers, nurses, MAs, aestheticians, etc.). Auto-provisions a providers
  // row for any membership OR active staff member that doesn't yet have one,
  // so all team members show up on the calendar.
  app.get("/api/scheduling/providers", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);

      const existing = await storage.getProvidersByClinic(clinicId);
      const haveUserIds = new Set(existing.filter(p => p.userId).map(p => p.userId as number));
      const haveStaffIds = new Set(existing.filter(p => (p as any).staffId).map(p => (p as any).staffId as number));

      const members = await storage.getClinicMembers(clinicId);

      // 1. Auto-provision provider rows for clinician members (account owners + co-clinicians)
      for (const m of members) {
        if (!m.isActive) continue;
        if (haveUserIds.has(m.userId)) continue;
        const display = (m.userName || m.userEmail || `Member #${m.userId}`).trim();
        try {
          await createProviderWithMembership({
            clinicId,
            userId: m.userId,
            displayName: display,
          });
        } catch (e) {
          console.warn("[Scheduling] auto-provision provider row failed for user", m.userId, e);
        }
      }

      // 2. Auto-provision provider rows for invited staff (nurses, MAs, etc.)
      // Staff are owned by a clinician (clinicianId), so we walk every active
      // clinician membership and pull their staff.
      const ROLE_LABEL: Record<string, string> = {
        nurse: "RN",
        rn: "RN",
        lpn: "LPN",
        np: "NP",
        pa: "PA",
        ma: "MA",
        assistant: "MA",
        aesthetician: "Aesthetician",
        provider: "Provider",
        staff: "Staff",
      };

      for (const m of members) {
        if (!m.isActive) continue;
        try {
          const staffList = await storage.getAllStaffForClinician(m.userId);
          for (const s of staffList) {
            if (!s.isActive) continue;
            if (haveStaffIds.has(s.id)) continue;

            const fullName = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.email;
            const roleKey = (s.role ?? "staff").toLowerCase();
            const credentials = ROLE_LABEL[roleKey] ?? null;
            const display = credentials ? `${fullName}, ${credentials}` : fullName;

            try {
              const [row] = await storageDb
                .insert(providersTable)
                .values({
                  clinicId,
                  userId: null,
                  staffId: s.id,
                  displayName: display,
                  credentials,
                  isActive: true,
                } as any)
                .returning();
              haveStaffIds.add(s.id);
              if (row) console.log(`[Scheduling] auto-provisioned provider row for staff ${s.id} (${display})`);
            } catch (insertErr) {
              console.warn("[Scheduling] auto-provision provider row failed for staff", s.id, insertErr);
            }
          }
        } catch (e) {
          console.warn("[Scheduling] failed to fetch staff for clinician", m.userId, e);
        }
      }

      const providers = await storage.getProvidersByClinic(clinicId);
      res.json(providers);
    } catch (err) {
      console.error("[Scheduling] providers error:", err);
      res.status(500).json({ message: "Failed to load providers" });
    }
  });

  // ── Appointment Types ──────────────────────────────────────────────────────
  app.get("/api/appointment-types", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const includeInactive = req.query.includeInactive === "true";
      const types = await storage.getAppointmentTypes(clinicId, includeInactive);
      res.json(types);
    } catch (err) {
      console.error("[Scheduling] appointment-types GET error:", err);
      res.status(500).json({ message: "Failed to load appointment types" });
    }
  });

  app.post("/api/appointment-types", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const parsed = insertAppointmentTypeSchema.parse({ ...req.body, clinicId });
      const row = await storage.createAppointmentType(parsed);
      res.status(201).json(row);
    } catch (err: any) {
      console.error("[Scheduling] appointment-types POST error:", err);
      res.status(400).json({ message: err.message || "Failed to create appointment type" });
    }
  });

  app.patch("/api/appointment-types/:id", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const id = Number(req.params.id);
      const row = await storage.updateAppointmentType(id, clinicId, pickAppointmentTypeUpdates(req.body));
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update" });
    }
  });

  app.delete("/api/appointment-types/:id", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const ok = await storage.deleteAppointmentType(Number(req.params.id), clinicId);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to delete" });
    }
  });

  // ── Provider Availability ──────────────────────────────────────────────────
  app.get("/api/provider-availability", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const providerId = req.query.providerId ? Number(req.query.providerId) : null;
      const rows = await storage.getProviderAvailability(clinicId, providerId);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Failed to load availability" });
    }
  });

  app.post("/api/provider-availability", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const parsed = insertProviderAvailabilitySchema.parse({ ...req.body, clinicId });
      const row = await storage.createProviderAvailability(parsed);
      res.status(201).json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create" });
    }
  });

  app.patch("/api/provider-availability/:id", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const row = await storage.updateProviderAvailability(Number(req.params.id), clinicId, pickProviderAvailabilityUpdates(req.body));
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to update" });
    }
  });

  app.delete("/api/provider-availability/:id", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const ok = await storage.deleteProviderAvailability(Number(req.params.id), clinicId);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to delete" });
    }
  });

  // ── Calendar Blocks (time-off) ────────────────────────────────────────────
  app.get("/api/calendar-blocks", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const start = parseDate(req.query.start) ?? new Date(Date.now() - 30 * 86400000);
      const end = parseDate(req.query.end) ?? new Date(Date.now() + 90 * 86400000);
      const providerId = req.query.providerId ? Number(req.query.providerId) : null;
      const rows = await storage.getCalendarBlocks(clinicId, start, end, providerId);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: "Failed to load blocks" });
    }
  });

  app.post("/api/calendar-blocks", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const body = { ...req.body, clinicId };
      if (body.startAt) body.startAt = new Date(body.startAt);
      if (body.endAt) body.endAt = new Date(body.endAt);
      const parsed = insertCalendarBlockSchema.parse(body);
      const row = await storage.createCalendarBlock(parsed);
      res.status(201).json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to create block" });
    }
  });

  app.delete("/api/calendar-blocks/:id", requireAuth, requireSchedulingAdmin, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const ok = await storage.deleteCalendarBlock(Number(req.params.id), clinicId);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to delete" });
    }
  });

  // ── Range query for native + Boulevard appointments together ──────────────
  app.get("/api/appointments/range", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const userId = getClinicianId(req);
      const start = parseDate(req.query.start) ?? new Date(Date.now() - 7 * 86400000);
      const end = parseDate(req.query.end) ?? new Date(Date.now() + 30 * 86400000);
      const providerId = req.query.providerId ? Number(req.query.providerId) : null;

      let rows: any[] = [];
      if (clinicId) {
        rows = await storage.getAppointmentsByClinicAndRange(clinicId, start, end, providerId);
        // Also include legacy Boulevard appts for this user that aren't yet linked to a clinicId
        const legacy = (await storage.getAppointmentsByUserId(userId))
          .filter(a => !a.clinicId
            && new Date(a.appointmentStart) >= start
            && new Date(a.appointmentStart) < end);
        rows = [...rows, ...legacy];
      } else {
        rows = (await storage.getAppointmentsByUserId(userId))
          .filter(a => new Date(a.appointmentStart) >= start && new Date(a.appointmentStart) < end);
      }
      res.json(rows);
    } catch (err) {
      console.error("[Scheduling] range error:", err);
      res.status(500).json({ message: "Failed to load appointments" });
    }
  });

  // ── Last + next appointment for a patient (used by Schedule search) ───────
  app.get("/api/patients/:id/appointments-summary", requireAuth, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      if (!patientId) return res.status(400).json({ message: "Invalid patient id" });
      const clinicId = getEffectiveClinicId(req);

      const patient = await storage.getPatient(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (clinicId && patient.clinicId && patient.clinicId !== clinicId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const all = await storage.getAppointmentsByPatientId(patientId);
      const now = Date.now();
      const past = all
        .filter(a => new Date(a.appointmentStart).getTime() < now && a.status !== "cancelled")
        .sort((a, b) => new Date(b.appointmentStart).getTime() - new Date(a.appointmentStart).getTime());
      const upcoming = all
        .filter(a => new Date(a.appointmentStart).getTime() >= now && a.status !== "cancelled")
        .sort((a, b) => new Date(a.appointmentStart).getTime() - new Date(b.appointmentStart).getTime());

      res.json({ last: past[0] ?? null, next: upcoming[0] ?? null });
    } catch (err) {
      console.error("[Scheduling] patient appt summary error:", err);
      res.status(500).json({ message: "Failed to load patient appointments" });
    }
  });

  // GET /api/patients/:id/upcoming-appointments — all future appointments for a patient
  app.get("/api/patients/:id/upcoming-appointments", requireAuth, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      if (!patientId) return res.status(400).json({ message: "Invalid patient id" });
      const clinicId = getEffectiveClinicId(req);

      const patient = await storage.getPatient(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (clinicId && patient.clinicId && patient.clinicId !== clinicId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const all = await storage.getAppointmentsByPatientId(patientId);
      const now = Date.now();
      const upcoming = all
        .filter(a => new Date(a.appointmentStart).getTime() >= now && a.status !== "cancelled")
        .sort((a, b) => new Date(a.appointmentStart).getTime() - new Date(b.appointmentStart).getTime())
        .slice(0, 10);

      res.json(upcoming);
    } catch (err) {
      console.error("[Scheduling] patient upcoming appts error:", err);
      res.status(500).json({ message: "Failed to load upcoming appointments" });
    }
  });

  // ── Native appointment CRUD ───────────────────────────────────────────────
  app.post("/api/appointments", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const userId = getClinicianId(req);

      const start = parseDate(req.body.appointmentStart);
      if (!start) return res.status(400).json({ message: "Invalid appointmentStart" });

      let end = parseDate(req.body.appointmentEnd);
      let durationMinutes = req.body.durationMinutes;
      if (!end && req.body.appointmentTypeId) {
        const type = await storage.getAppointmentTypeById(Number(req.body.appointmentTypeId), clinicId);
        if (type) {
          durationMinutes = durationMinutes ?? type.durationMinutes;
          end = new Date(start.getTime() + (durationMinutes ?? 30) * 60000);
        }
      }
      if (!end) end = new Date(start.getTime() + (durationMinutes ?? 30) * 60000);

      // Conflict check (warn, do not block — clinics may double-book intentionally)
      let conflictWarning: string | null = null;
      if (req.body.providerId) {
        const conflict = await storage.detectAppointmentConflict(Number(req.body.providerId), start, end);
        if (conflict) conflictWarning = "Provider already has an overlapping appointment in this slot.";
      }

      // Resolve patient name from patientId if provided
      let patientName: string | null = req.body.patientName ?? null;
      let patientEmail: string | null = req.body.patientEmail ?? null;
      let patientPhone: string | null = req.body.patientPhone ?? null;
      if (req.body.patientId) {
        const patient = await storage.getPatientById(Number(req.body.patientId));
        if (patient) {
          patientName = `${patient.firstName} ${patient.lastName}`.trim();
          patientEmail = patientEmail ?? patient.email ?? null;
          patientPhone = patientPhone ?? patient.phone ?? null;
        }
      }

      const row = await storage.createNativeAppointment({
        userId,
        clinicId,
        patientId: req.body.patientId ? Number(req.body.patientId) : null,
        providerId: req.body.providerId ? Number(req.body.providerId) : null,
        appointmentTypeId: req.body.appointmentTypeId ? Number(req.body.appointmentTypeId) : null,
        source: "native",
        boulevardAppointmentId: null,
        patientName,
        patientEmail,
        patientPhone,
        serviceType: req.body.serviceType ?? null,
        staffName: req.body.staffName ?? null,
        locationName: req.body.locationName ?? null,
        appointmentStart: start,
        appointmentEnd: end,
        durationMinutes: durationMinutes ?? Math.round((end.getTime() - start.getTime()) / 60000),
        status: req.body.status ?? "scheduled",
        notes: req.body.notes ?? null,
        rawPayload: null,
        reminderSentAt: null,
      } as any);

      res.status(201).json({ appointment: row, conflictWarning });
    } catch (err: any) {
      console.error("[Scheduling] create native appt error:", err);
      res.status(400).json({ message: err.message || "Failed to create appointment" });
    }
  });

  app.patch("/api/appointments/:id", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const id = Number(req.params.id);
      const existing = await storage.getAppointmentById(id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      // Verify appointment belongs to this clinic before any further checks
      if (existing.clinicId && existing.clinicId !== clinicId) {
        return res.status(404).json({ message: "Not found" });
      }
      if (existing.source === "boulevard") {
        return res.status(403).json({ message: "Boulevard appointments are read-only here. Edit in Boulevard." });
      }
      const updates: any = pickAppointmentUpdates(req.body);
      if (updates.appointmentStart) updates.appointmentStart = new Date(updates.appointmentStart);
      if (updates.appointmentEnd) updates.appointmentEnd = new Date(updates.appointmentEnd);
      if (updates.patientId) updates.patientId = Number(updates.patientId);
      if (updates.providerId) updates.providerId = Number(updates.providerId);
      if (updates.appointmentTypeId) updates.appointmentTypeId = Number(updates.appointmentTypeId);
      const row = await storage.updateNativeAppointment(id, clinicId, updates);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      console.error("[Scheduling] patch appt error:", err);
      res.status(400).json({ message: err.message || "Failed to update" });
    }
  });

  app.delete("/api/appointments/:id", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic" });
      const ok = await storage.deleteNativeAppointment(Number(req.params.id), clinicId);
      if (!ok) return res.status(404).json({ message: "Not found or read-only" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to delete" });
    }
  });

  // ── Slot availability ─────────────────────────────────────────────────────
  // GET /api/availability/slots?providerId=&typeId=&date=YYYY-MM-DD
  app.get("/api/availability/slots", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const providerId = Number(req.query.providerId);
      const typeId = req.query.typeId ? Number(req.query.typeId) : null;
      const dateStr = String(req.query.date || "");
      if (!providerId || !dateStr) return res.status(400).json({ message: "providerId and date required" });

      const date = new Date(dateStr + "T00:00:00");
      if (isNaN(date.getTime())) return res.status(400).json({ message: "Invalid date" });
      const dayOfWeek = date.getDay();

      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

      const [availability, blocks, dayAppts, type] = await Promise.all([
        storage.getProviderAvailability(clinicId, providerId),
        storage.getCalendarBlocks(clinicId, dayStart, dayEnd, providerId),
        storage.getAppointmentsByClinicAndRange(clinicId, dayStart, dayEnd, providerId),
        typeId ? storage.getAppointmentTypeById(typeId, clinicId) : Promise.resolve(null),
      ]);

      const duration = type?.durationMinutes ?? 30;
      const slots: { start: string; end: string }[] = [];
      const todaysWindows = availability.filter(a => a.dayOfWeek === dayOfWeek);

      for (const win of todaysWindows) {
        const [sH, sM] = String(win.startTime).split(":").map(Number);
        const [eH, eM] = String(win.endTime).split(":").map(Number);
        const winStart = new Date(date); winStart.setHours(sH, sM, 0, 0);
        const winEnd = new Date(date); winEnd.setHours(eH, eM, 0, 0);
        let cursor = new Date(winStart);
        while (cursor.getTime() + duration * 60000 <= winEnd.getTime()) {
          const slotEnd = new Date(cursor.getTime() + duration * 60000);
          // Skip if overlaps any existing appt
          const conflicts = dayAppts.some(a => {
            const aStart = new Date(a.appointmentStart);
            const aEnd = a.appointmentEnd ? new Date(a.appointmentEnd) : new Date(aStart.getTime() + (a.durationMinutes ?? 30) * 60000);
            return aStart < slotEnd && aEnd > cursor && a.status !== "cancelled" && a.status !== "no_show";
          });
          // Skip if overlaps any block
          const blocked = blocks.some(b => new Date(b.startAt) < slotEnd && new Date(b.endAt) > cursor);
          if (!conflicts && !blocked) {
            slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
          }
          cursor = new Date(cursor.getTime() + duration * 60000);
        }
      }
      res.json(slots);
    } catch (err) {
      console.error("[Scheduling] slots error:", err);
      res.status(500).json({ message: "Failed to compute slots" });
    }
  });

  // ── Reminder sweep — call every ~15 minutes from Cloud Scheduler ──────────
  // Sends 24h-out email reminders for upcoming native appointments with patient email.
  app.post("/api/jobs/send-appointment-reminders", async (req, res) => {
    try {
      // Shared-secret guard. Required in production; optional in dev.
      const expected = process.env.REMINDER_JOB_SECRET;
      if (!expected && process.env.NODE_ENV === "production") {
        return res.status(503).json({ message: "REMINDER_JOB_SECRET not configured" });
      }
      if (expected) {
        const provided = req.headers["x-job-secret"] || req.query.secret;
        if (provided !== expected) return res.status(401).json({ message: "Unauthorized" });
      }
      const now = new Date();
      const due = await storage.getAppointmentsNeedingReminder(now, 24);
      let sent = 0, skipped = 0, failed = 0;
      for (const appt of due) {
        if (!appt.patientEmail) { skipped++; continue; }
        try {
          const clinic = appt.clinicId ? await storage.getClinicForUser(appt.userId) : null;
          const fromName = clinic?.name ?? "Your clinic";
          const startStr = new Date(appt.appointmentStart).toLocaleString("en-US", {
            weekday: "long", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit",
          });
          await sendEmail({
            to: appt.patientEmail,
            subject: `Reminder: Your appointment on ${new Date(appt.appointmentStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
            fromName,
            html: `
              <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c2414;">
                <h2 style="margin:0 0 12px 0;">Appointment reminder</h2>
                <p style="margin:0 0 8px 0;">Hi ${appt.patientName ?? "there"},</p>
                <p style="margin:0 0 16px 0;">This is a friendly reminder of your upcoming appointment with <strong>${fromName}</strong>.</p>
                <div style="background:#f5f2ed;border:1px solid #e8ddd0;border-radius:6px;padding:16px;margin:16px 0;">
                  <div style="font-size:18px;font-weight:600;">${startStr}</div>
                  ${appt.serviceType ? `<div style="margin-top:6px;color:#5a7040;">${appt.serviceType}</div>` : ""}
                  ${appt.staffName ? `<div style="margin-top:4px;color:#7a8a64;">with ${appt.staffName}</div>` : ""}
                  ${appt.locationName ? `<div style="margin-top:4px;color:#7a8a64;">${appt.locationName}</div>` : ""}
                </div>
                <p style="margin:16px 0 8px 0;">Need to reschedule? Please contact us right away.</p>
                <p style="margin:24px 0 0 0;color:#7a8a64;font-size:12px;">Sent by ${fromName} via ClinIQ</p>
              </div>
            `,
          });
          await storage.markAppointmentReminderSent(appt.id);
          sent++;
        } catch (e) {
          console.error("[Reminders] send failed for appt", appt.id, e);
          failed++;
        }
      }
      res.json({ sent, skipped, failed, considered: due.length });
    } catch (err: any) {
      console.error("[Reminders] sweep error:", err);
      res.status(500).json({ message: err.message || "Sweep failed" });
    }
  });

  // ── Patient Vitals ─────────────────────────────────────────────────────────
  function computeBmi(weightLbs?: number | null, heightInches?: number | null): number | null {
    if (!weightLbs || !heightInches || heightInches <= 0) return null;
    const bmi = (weightLbs / (heightInches * heightInches)) * 703;
    return Math.round(bmi * 10) / 10;
  }

  // GET /api/patients/:id/vitals — list vitals for a patient
  app.get("/api/patients/:id/vitals", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const vitals = await storage.getPatientVitals(patientId, clinicianId);
      res.json(vitals);
    } catch (err: any) {
      console.error("[Vitals] list error:", err);
      res.status(500).json({ message: err.message || "Failed to load vitals" });
    }
  });

  // POST /api/patients/:id/vitals — record a new vital signs entry
  app.post("/api/patients/:id/vitals", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      const parsed = insertPatientVitalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid vitals data", errors: parsed.error.errors });
      }
      const data = parsed.data;
      const bmi = computeBmi(data.weightLbs ?? null, data.heightInches ?? null);
      const vital = await storage.createPatientVital({
        patientId,
        clinicianId,
        ...data,
        bmi,
      });
      res.status(201).json(vital);
    } catch (err: any) {
      console.error("[Vitals] create error:", err);
      res.status(500).json({ message: err.message || "Failed to save vitals" });
    }
  });

  // DELETE /api/vitals/:id — delete a vitals entry
  app.delete("/api/vitals/:id", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const id = parseInt(req.params.id);
      const ok = await storage.deletePatientVital(id, clinicianId);
      if (!ok) return res.status(404).json({ message: "Vital not found" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Vitals] delete error:", err);
      res.status(500).json({ message: err.message || "Failed to delete vitals" });
    }
  });

  // POST /api/prevent-quick-calc — run the AHA PREVENT calculator without saving labs
  app.post("/api/prevent-quick-calc", requireAuth, async (req, res) => {
    try {
      const inputSchema = z.object({
        age: z.number().min(30).max(79),
        sex: z.enum(["male", "female"]),
        systolicBP: z.number().min(70).max(250),
        totalCholesterol: z.number().min(50).max(500),
        hdl: z.number().min(10).max(200),
        ldl: z.number().min(10).max(400).optional(),
        egfr: z.number().min(15).max(150),
        bmi: z.number().min(15).max(60),
        diabetic: z.boolean().default(false),
        smoker: z.boolean().default(false),
        onBPMeds: z.boolean().default(false),
        onStatins: z.boolean().default(false),
        apoB: z.number().optional(),
        lpa: z.number().optional(),
      });
      const parsed = inputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid inputs", errors: parsed.error.errors });
      }
      const i = parsed.data;
      const labs: any = {
        totalCholesterol: i.totalCholesterol,
        hdl: i.hdl,
        ldl: i.ldl,
        egfr: i.egfr,
        demographics: {
          age: i.age,
          sex: i.sex,
          systolicBP: i.systolicBP,
          onBPMeds: i.onBPMeds,
          diabetic: i.diabetic,
          smoker: i.smoker,
          familyHistory: false,
          bmi: i.bmi,
          onStatins: i.onStatins,
          snoring: false,
          tiredness: false,
          observed: false,
          highBP: false,
          neckOver40cm: false,
          bmiOver35: false,
        },
      };
      const result = PREVENTCalculator.calculateRisk(labs);
      if (!result) return res.status(400).json({ message: "Could not calculate risk with provided inputs" });
      let adjusted = null;
      if (i.apoB !== undefined || i.lpa !== undefined) {
        adjusted = PREVENTCalculator.calculateAdjustedRisk(result.tenYearASCVD, i.apoB, i.lpa);
      }
      res.json({ result, adjusted });
    } catch (err: any) {
      console.error("[PREVENT Quick Calc] error:", err);
      res.status(500).json({ message: err.message || "Calculation failed" });
    }
  });

  // ── Note Templates & Phrases ──────────────────────────────────────────────
  app.get("/api/note-templates", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const noteType = req.query.noteType as string | undefined;
      const list = await storage.getNoteTemplates(clinicId, req.user.id, noteType);
      res.json(list);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/note-templates", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const body = z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        noteType: z.enum(["soap_provider", "nurse", "phone"]),
        shortcut: z.string().max(50).nullable().optional(),
        blocks: z.array(z.any()),
        isShared: z.boolean().default(false),
      }).parse(req.body);
      const tpl = await storage.createNoteTemplate({
        clinicId,
        providerId: req.user.id,
        name: body.name,
        description: body.description ?? null,
        noteType: body.noteType,
        shortcut: typeof body.shortcut === "string" ? (body.shortcut.trim() || null) : null,
        blocks: body.blocks,
        isShared: body.isShared,
      });
      res.status(201).json(tpl);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/note-templates/:id", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const id = parseInt(req.params.id);
      const body = z.object({
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        shortcut: z.string().max(50).nullable().optional(),
        blocks: z.array(z.any()).optional(),
        isShared: z.boolean().optional(),
      }).parse(req.body);
      const patch: Partial<InsertNoteTemplate> = { ...body };
      if (typeof body.shortcut === "string") patch.shortcut = body.shortcut.trim() || null;
      const updated = await storage.updateNoteTemplate(id, clinicId, patch);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/note-templates/:id", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const ok = await storage.deleteNoteTemplate(parseInt(req.params.id), clinicId, req.user.id);
      if (!ok) return res.status(404).json({ message: "Not found or not allowed" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/note-phrases", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const list = await storage.getNotePhrases(clinicId, req.user.id);
      res.json(list);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/note-phrases", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const body = z.object({
        title: z.string().min(1),
        shortcut: z.string().optional(),
        content: z.string().min(1),
        isShared: z.boolean().default(false),
      }).parse(req.body);
      const ph = await storage.createNotePhrase({
        clinicId,
        providerId: req.user.id,
        title: body.title,
        shortcut: body.shortcut ?? null,
        content: body.content,
        isShared: body.isShared,
      } as any);
      res.status(201).json(ph);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.patch("/api/note-phrases/:id", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const body = z.object({
        title: z.string().optional(),
        shortcut: z.string().nullable().optional(),
        content: z.string().optional(),
        isShared: z.boolean().optional(),
      }).parse(req.body);
      const updated = await storage.updateNotePhrase(parseInt(req.params.id), clinicId, body as any);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(400).json({ message: e.message }); }
  });
  app.delete("/api/note-phrases/:id", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const ok = await storage.deleteNotePhrase(parseInt(req.params.id), clinicId, req.user.id);
      if (!ok) return res.status(404).json({ message: "Not found or not allowed" });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Medication Dictionary ──────────────────────────────────────────────────
  const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  // GET /api/medication-dictionary — list dictionaries for the clinician
  app.get("/api/medication-dictionary", requireAuth, async (req: any, res) => {
    try {
      const dicts = await storage.getMedicationDictionaries(req.user.id);
      res.json(dicts);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load dictionaries" });
    }
  });

  // POST /api/medication-dictionary/upload — upload and parse a CSV
  app.post("/api/medication-dictionary/upload", requireAuth, csvUpload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const csvText = req.file.buffer.toString("utf-8");
      const rows = parseCSV(csvText);
      if (!rows.length) return res.status(400).json({ message: "CSV is empty or could not be parsed" });

      const REQUIRED = ["generic_name"];
      const firstRow = rows[0];
      for (const col of REQUIRED) {
        if (!(col in firstRow)) return res.status(400).json({ message: `CSV missing required column: ${col}` });
      }

      const dict = await storage.createMedicationDictionary({
        clinicianId: req.user.id,
        filename: req.file.originalname,
        entryCount: 0,
      });

      const entries = rows
        .filter(r => r.generic_name?.trim())
        .map(r => ({
          dictionaryId: dict.id,
          clinicianId: req.user.id,
          genericName: r.generic_name.trim(),
          brandNames: parseArrayField(r.brand_names ?? ""),
          commonSpokenVariants: parseArrayField(r.common_spoken_variants ?? ""),
          commonMisspellings: parseArrayField(r.common_misspellings ?? ""),
          drugClass: r.drug_class?.trim() || null,
          subclass: r.subclass?.trim() || null,
          route: r.route?.trim() || null,
          notes: r.notes?.trim() || null,
        }));

      await storage.createMedicationEntries(entries);
      await storage.updateMedicationDictionaryCount(dict.id, entries.length);

      res.json({ ...dict, entryCount: entries.length });
    } catch (err: any) {
      console.error("[Med Dict Upload]", err);
      res.status(500).json({ message: "Failed to process CSV" });
    }
  });

  // DELETE /api/medication-dictionary/:id — delete a dictionary and all its entries
  app.delete("/api/medication-dictionary/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const deleted = await storage.deleteMedicationDictionary(id, req.user.id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete dictionary" });
    }
  });

  // POST /api/medication-dictionary/normalize — scan transcript text for medication matches
  app.post("/api/medication-dictionary/normalize", requireAuth, async (req: any, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") return res.status(400).json({ message: "text is required" });
      const entries = await storage.getAllMedicationEntries(req.user.id);
      if (!entries.length) return res.json({ matches: [], dictionarySize: 0 });
      const matches = normalizeTranscript(text, entries);
      res.json({ matches, dictionarySize: entries.length });
    } catch (err: any) {
      console.error("[Med Normalize]", err);
      res.status(500).json({ message: "Normalization failed" });
    }
  });

  // GET /api/medication-dictionary/entries — all entries for this clinician (system + custom)
  app.get("/api/medication-dictionary/entries", requireAuth, async (req: any, res) => {
    try {
      const entries = await storage.getAllMedicationEntries(req.user.id);
      const dicts = await storage.getMedicationDictionaries(req.user.id);
      const dictMap = new Map(dicts.map(d => [d.id, d]));
      const enriched = entries.map(e => {
        const isSystem = e.id < 0; // negative IDs = system seed entries
        const dict = dictMap.get(e.dictionaryId);
        return {
          ...e,
          dictFilename: isSystem ? "__system__" : (dict?.filename ?? "unknown"),
          isSystem,
          isManual: !isSystem && dict?.filename === "__manual__",
        };
      });
      res.json({ entries: enriched, total: entries.length });
    } catch (err: any) {
      console.error("[Med Entries]", err);
      res.status(500).json({ message: "Failed to load entries" });
    }
  });

  // POST /api/medication-dictionary/entry — add a single entry (auto-creates manual dict)
  app.post("/api/medication-dictionary/entry", requireAuth, async (req: any, res) => {
    try {
      const {
        genericName, brandNames = [], commonSpokenVariants = [], commonMisspellings = [],
        drugClass, subclass, route, notes,
      } = req.body;
      if (!genericName?.trim()) return res.status(400).json({ message: "genericName is required" });
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const manualDict = await storage.getOrCreateManualDictionary(clinicianId);
      const entry = await storage.addSingleMedicationEntry({
        dictionaryId: manualDict.id,
        clinicianId,
        genericName: genericName.trim(),
        brandNames: brandNames.filter(Boolean),
        commonSpokenVariants: commonSpokenVariants.filter(Boolean),
        commonMisspellings: commonMisspellings.filter(Boolean),
        drugClass: drugClass?.trim() || null,
        subclass: subclass?.trim() || null,
        route: route?.trim() || null,
        notes: notes?.trim() || null,
      });
      res.json({ entry, isManual: true });
    } catch (err: any) {
      console.error("[Med Entry Create]", err);
      res.status(500).json({ message: "Failed to create entry" });
    }
  });

  // PATCH /api/medication-dictionary/entry/:id — update aliases on an existing entry
  app.patch("/api/medication-dictionary/entry/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid entry id" });
      const allowed = ["brandNames", "commonSpokenVariants", "commonMisspellings", "drugClass", "subclass", "route", "notes"] as const;
      const fields: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) fields[key] = req.body[key];
      }
      if (!Object.keys(fields).length) return res.status(400).json({ message: "No fields to update" });
      const updated = await storage.updateMedicationEntryAliases(id, req.user.id, fields);
      if (!updated) return res.status(404).json({ message: "Entry not found" });
      res.json({ entry: updated });
    } catch (err: any) {
      console.error("[Med Entry Update]", err);
      res.status(500).json({ message: "Failed to update entry" });
    }
  });

  // DELETE /api/medication-dictionary/entry/:id — delete a single entry
  app.delete("/api/medication-dictionary/entry/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid entry id" });
      const deleted = await storage.deleteMedicationEntry(id, req.user.id);
      if (!deleted) return res.status(404).json({ message: "Entry not found" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Med Entry Delete]", err);
      res.status(500).json({ message: "Failed to delete entry" });
    }
  });

  // ─── Intake Forms API (clinic-scoped) ────────────────────────────────────────

  // Helper: resolve form by ID within the caller's clinic (read access for all)
  async function resolveClinicForm(req: any): Promise<schema.IntakeForm | null> {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return null;
    const clinicId = getEffectiveClinicId(req);
    const clinicianId = getClinicianId(req);
    return (await storage.getIntakeFormByIdAndClinic(id, clinicId, clinicianId)) ?? null;
  }

  // GET /api/intake-forms — list all clinic forms (all staff + providers)
  app.get("/api/intake-forms", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);
      const forms = await storage.getIntakeFormsByClinicOrClinician(clinicId, clinicianId);
      res.json(forms);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch forms" });
    }
  });

  // POST /api/intake-forms — create template (admin/limited_admin/owner only)
  app.post("/api/intake-forms", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "You do not have permission to create forms. Admin access required." });
      const { name, description, category } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "Form name required" });
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);
      const form = await storage.createIntakeForm({
        clinicianId,
        clinicId,
        name: name.trim(),
        description: description?.trim() ?? null,
        category: category ?? "custom",
        status: "draft",
        version: 1,
        allowLink: true,
        allowEmbed: true,
        allowTablet: true,
        isPublic: false,
        requiresPatientSignature: false,
        requiresStaffSignature: false,
        expirationType: "none",
      });
      res.json(form);
    } catch (err) {
      console.error("[API] Failed to create intake form:", err);
      res.status(500).json({ message: "Failed to create form" });
    }
  });

  // GET /api/intake-forms/submissions/all — all clinic submissions with form names (all staff + providers)
  app.get("/api/intake-forms/submissions/all", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);
      const submissions = await storage.getFormSubmissionsByClinic(clinicId, clinicianId);
      const enriched = await Promise.all(submissions.map(async (sub) => {
        const form = await storage.getIntakeFormById(sub.formId);
        return { ...sub, formName: form?.name ?? "Unknown Form" };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // GET /api/intake-forms/submissions/pending — all clinic submissions (all staff + providers)
  app.get("/api/intake-forms/submissions/pending", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);
      const submissions = await storage.getFormSubmissionsByClinic(clinicId, clinicianId);
      const pending = submissions.filter(s => s.reviewStatus === "pending" || s.syncStatus === "not_synced");
      const enriched = await Promise.all(pending.map(async (sub) => {
        const form = await storage.getIntakeFormById(sub.formId);
        return { ...sub, formName: form?.name ?? "Unknown Form" };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pending submissions" });
    }
  });

  // PATCH /api/intake-forms/submissions/:id/review — all staff + providers can review
  app.patch("/api/intake-forms/submissions/:id/review", requireAuth, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      if (isNaN(submissionId)) return res.status(400).json({ message: "Invalid ID" });
      const submission = await storage.getFormSubmission(submissionId);
      if (!submission) return res.status(404).json({ message: "Submission not found" });
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);
      const isOwner = submission.clinicianId === clinicianId;
      const isClinicMember = clinicId && (submission as any).clinicId === clinicId;
      if (!isOwner && !isClinicMember) {
        const form = await storage.getIntakeFormById(submission.formId);
        if (!form) return res.status(404).json({ message: "Form not found" });
        const formInClinic = clinicId && form.clinicId === clinicId;
        const formOwnedByUser = form.clinicianId === clinicianId;
        if (!formInClinic && !formOwnedByUser) return res.status(403).json({ message: "Not authorized" });
      }
      const updated = await storage.updateFormSubmission(submissionId, {
        reviewStatus: "reviewed",
        syncStatus: "synced",
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update submission" });
    }
  });

  // GET /api/intake-forms/:id — get form (all staff + providers)
  app.get("/api/intake-forms/:id", requireAuth, async (req: any, res) => {
    try {
      const form = await resolveClinicForm(req);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const [sections, fields, publications] = await Promise.all([
        storage.getFormSections(form.id),
        storage.getFormFields(form.id),
        storage.getFormPublications(form.id),
      ]);
      res.json({ ...form, sections, fields, publications });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch form" });
    }
  });

  // PUT /api/intake-forms/:id — update form settings (admin+ only)
  app.put("/api/intake-forms/:id", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required to edit forms." });
      const id = parseInt(req.params.id);
      const clinicId = getEffectiveClinicId(req);
      const incomingKeys = Object.keys(req.body || {});
      const hasGhl = incomingKeys.includes("ghlWebhookUrl") || incomingKeys.includes("ghlWebhookEnabled");
      if (hasGhl) {
        console.log(`[Form Update] form ${id} keys=${incomingKeys.join(",")} ghlWebhookEnabled=${req.body.ghlWebhookEnabled} ghlWebhookUrlSet=${!!req.body.ghlWebhookUrl}`);
      }
      const updated = await storage.updateIntakeFormByClinic(id, clinicId, getClinicianId(req), req.body);
      if (!updated) return res.status(404).json({ message: "Form not found" });
      if (hasGhl) {
        console.log(`[Form Update] form ${id} saved -> ghlWebhookEnabled=${(updated as any).ghlWebhookEnabled} ghlWebhookUrlSet=${!!(updated as any).ghlWebhookUrl}`);
      }
      res.json(updated);
    } catch (err: any) {
      console.error(`[Form Update] form ${req.params.id} error:`, err?.message ?? err);
      res.status(500).json({ message: "Failed to update form" });
    }
  });

  // DELETE /api/intake-forms/:id — archive form (admin+ only)
  app.delete("/api/intake-forms/:id", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required to manage forms." });
      const id = parseInt(req.params.id);
      const clinicId = getEffectiveClinicId(req);
      const updated = await storage.updateIntakeFormByClinic(id, clinicId, getClinicianId(req), { status: "archived" });
      if (!updated) return res.status(404).json({ message: "Form not found" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to archive form" });
    }
  });

  // POST /api/intake-forms/:id/duplicate — duplicate template (admin+ only)
  app.post("/api/intake-forms/:id/duplicate", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const original = await resolveClinicForm(req);
      if (!original) return res.status(404).json({ message: "Form not found" });
      const { id: _id, createdAt, updatedAt, ...rest } = original;
      const newForm = await storage.createIntakeForm({
        ...(rest as any),
        name: `${rest.name} (Copy)`,
        status: "draft",
        version: 1,
      });
      const [sections, fields] = await Promise.all([
        storage.getFormSections(original.id),
        storage.getFormFields(original.id),
      ]);
      const sectionMap: Record<number, number> = {};
      for (const sec of sections) {
        const { id: secId, createdAt: _c, updatedAt: _u, ...secRest } = sec;
        const newSec = await storage.createFormSection({ ...(secRest as any), formId: newForm.id });
        sectionMap[secId] = newSec.id;
      }
      for (const field of fields) {
        const { id: _fid, createdAt: _c, updatedAt: _u, ...fieldRest } = field;
        await storage.createFormField({
          ...(fieldRest as any),
          formId: newForm.id,
          sectionId: field.sectionId ? (sectionMap[field.sectionId] ?? null) : null,
        });
      }
      res.json(newForm);
    } catch (err) {
      res.status(500).json({ message: "Failed to duplicate form" });
    }
  });

  // POST /api/intake-forms/:id/sections (admin+ only)
  app.post("/api/intake-forms/:id/sections", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const form = await resolveClinicForm(req);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const sections = await storage.getFormSections(form.id);
      const section = await storage.createFormSection({
        formId: form.id,
        title: req.body.title ?? "New Section",
        description: req.body.description ?? null,
        orderIndex: sections.length,
        isRepeatable: false,
      });
      res.json(section);
    } catch (err) {
      res.status(500).json({ message: "Failed to create section" });
    }
  });

  // PUT /api/intake-forms/:id/sections/:sectionId (admin+ only)
  app.put("/api/intake-forms/:id/sections/:sectionId", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const sectionId = parseInt(req.params.sectionId);
      const updated = await storage.updateFormSection(sectionId, req.body);
      if (!updated) return res.status(404).json({ message: "Section not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update section" });
    }
  });

  // DELETE /api/intake-forms/:id/sections/:sectionId (admin+ only)
  app.delete("/api/intake-forms/:id/sections/:sectionId", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const sectionId = parseInt(req.params.sectionId);
      await storage.deleteFormSection(sectionId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete section" });
    }
  });

  // POST /api/intake-forms/:id/fields (admin+ only)
  app.post("/api/intake-forms/:id/fields", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const form = await resolveClinicForm(req);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const existing = await storage.getFormFields(form.id);
      const { fieldType = "short_text", label = "New Field", sectionId, ...rest } = req.body;
      const fieldKey = `field_${Date.now()}`;
      const field = await storage.createFormField({
        formId: form.id,
        sectionId: sectionId ?? null,
        fieldKey,
        label,
        fieldType,
        isRequired: false,
        isHidden: false,
        orderIndex: existing.length,
        ...rest,
      });
      res.json(field);
    } catch (err) {
      console.error("[createFormField] Error:", err);
      res.status(500).json({ message: "Failed to create field", detail: String(err) });
    }
  });

  // PUT /api/intake-forms/:id/fields/reorder (admin+ only)
  app.put("/api/intake-forms/:id/fields/reorder", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const form = await resolveClinicForm(req);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const { fieldIds } = req.body;
      if (!Array.isArray(fieldIds)) return res.status(400).json({ message: "fieldIds array required" });
      const existingFields = await storage.getFormFields(form.id);
      const formFieldIds = new Set(existingFields.map((f: any) => f.id));
      for (const id of fieldIds) {
        if (!formFieldIds.has(parseInt(id))) {
          return res.status(403).json({ message: "Field does not belong to this form" });
        }
      }
      for (let i = 0; i < fieldIds.length; i++) {
        await storage.updateFormField(parseInt(fieldIds[i]), { orderIndex: i });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to reorder fields" });
    }
  });

  // PUT /api/intake-forms/:id/fields/:fieldId (admin+ only)
  app.put("/api/intake-forms/:id/fields/:fieldId", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const fieldId = parseInt(req.params.fieldId);
      const updated = await storage.updateFormField(fieldId, req.body);
      if (!updated) return res.status(404).json({ message: "Field not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update field" });
    }
  });

  // DELETE /api/intake-forms/:id/fields/:fieldId (admin+ only)
  app.delete("/api/intake-forms/:id/fields/:fieldId", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const fieldId = parseInt(req.params.fieldId);
      await storage.deleteFormField(fieldId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete field" });
    }
  });

  // POST /api/intake-forms/:id/publish (admin+ only)
  app.post("/api/intake-forms/:id/publish", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required to publish forms." });
      const form = await resolveClinicForm(req);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const { randomUUID } = await import("crypto");
      const token = randomUUID().replace(/-/g, "");
      const pub = await storage.createFormPublication({
        formId: form.id,
        publicToken: token,
        mode: req.body.mode ?? "link",
        status: "active",
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      });
      const clinicId = getEffectiveClinicId(req);
      await storage.updateIntakeFormByClinic(form.id, clinicId, getClinicianId(req), { status: "active" });
      res.json(pub);
    } catch (err) {
      res.status(500).json({ message: "Failed to publish form" });
    }
  });

  // PUT /api/intake-forms/:id/publications/:pubId (admin+ only)
  app.put("/api/intake-forms/:id/publications/:pubId", requireAuth, async (req: any, res) => {
    try {
      if (!(await canManageForms(req))) return res.status(403).json({ message: "Admin access required." });
      const pubId = parseInt(req.params.pubId);
      const updated = await storage.updateFormPublication(pubId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update publication" });
    }
  });

  // ─── Public Form Routes (no auth) ───────────────────────────────────────────

  // GET /api/forms/public/:token — fetch form definition for rendering
  app.get("/api/forms/public/:token", async (req, res) => {
    try {
      const pub = await storage.getFormPublicationByToken(req.params.token);
      if (!pub) return res.status(404).json({ message: "Form not found or link is inactive" });
      if (pub.expiresAt && new Date(pub.expiresAt) < new Date()) {
        return res.status(410).json({ message: "This form link has expired" });
      }
      const form = await storage.getIntakeFormById(pub.formId);
      if (!form || form.status === "archived") return res.status(404).json({ message: "Form not found" });
      const [sections, fields] = await Promise.all([
        storage.getFormSections(pub.formId),
        storage.getFormFields(pub.formId),
      ]);
      let clinic: {
        clinicName?: string;
        clinicLogo?: string | null;
        phone?: string;
        address?: string;
        primaryColor?: string | null;
        accentColor?: string | null;
        formBackgroundColor?: string | null;
      } = {};
      try {
        const owner = await storage.getUserById(form.clinicianId);
        if (owner) {
          clinic = {
            clinicName: owner.clinicName || undefined,
            clinicLogo: owner.clinicLogo || null,
            phone: owner.phone || undefined,
            address: owner.address || undefined,
          };
          // Layer in clinic-level brand colors (multi-tenant branding).
          try {
            const ownerClinic = await storage.getClinicForUser(form.clinicianId);
            if (ownerClinic) {
              clinic.primaryColor = ownerClinic.primaryColor ?? null;
              clinic.accentColor = ownerClinic.accentColor ?? null;
              clinic.formBackgroundColor = ownerClinic.formBackgroundColor ?? null;
            }
          } catch {}
        }
      } catch {}
      res.json({ form, sections, fields, publication: pub, clinic });
    } catch (err) {
      res.status(500).json({ message: "Failed to load form" });
    }
  });

  // POST /api/forms/public/:token/submit — submit form (no auth)
  app.post("/api/forms/public/:token/submit", async (req, res) => {
    try {
      const pub = await storage.getFormPublicationByToken(req.params.token);
      if (!pub) return res.status(404).json({ message: "Form not found or link is inactive" });
      if (pub.expiresAt && new Date(pub.expiresAt) < new Date()) {
        return res.status(410).json({ message: "This form link has expired" });
      }
      const form = await storage.getIntakeFormById(pub.formId);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const { responses, submitterName, submitterEmail, signature } = req.body;
      if (!responses || typeof responses !== "object") {
        return res.status(400).json({ message: "Responses are required" });
      }

      // ── Auto-match or auto-create patient from form demographics ─────────────
      let resolvedPatientId: number | null = null;
      let autoCreated = false;
      // Hoisted so the GHL webhook payload can reference them after this block
      let firstName = "";
      let lastName = "";
      let dobRaw = "";
      let email = "";
      let phone = "";
      let gender = "male";

      if (!resolvedPatientId && form.clinicianId) {
        const fields = await storage.getFormFields(pub.formId);

        // Build a map of smartFieldKey → response value for quick lookup
        const smartValues: Record<string, string> = {};
        for (const f of fields) {
          if (f.smartFieldKey && responses[f.fieldKey] != null) {
            smartValues[f.smartFieldKey] = String(responses[f.fieldKey]).trim();
          }
        }

        // Helper: extract a response value by smart key first, then fallback to regex patterns
        const pick = (smartKey: string, ...patterns: RegExp[]) => {
          if (smartValues[smartKey]) return smartValues[smartKey];
          const key = Object.keys(responses).find(k =>
            patterns.some(p => p.test(k.toLowerCase().replace(/[\s-]/g, "_")))
          );
          return key ? String(responses[key] ?? "").trim() : "";
        };

        // Extract demographics — smart keys take priority
        firstName = pick("patient_first_name", /^first_?name$/, /^fname$/, /^given_name$/);
        lastName = pick("patient_last_name", /^last_?name$/, /^lname$/, /^family_name$/, /^surname$/);

        if ((!firstName || !lastName) && submitterName) {
          const parts = String(submitterName).trim().split(/\s+/);
          if (!firstName) firstName = parts[0] ?? "";
          if (!lastName) lastName = parts.slice(1).join(" ") || (parts[0] ?? "");
        }

        dobRaw = pick("patient_dob", /^date_of_birth$/, /^dob$/, /^birth_?date$/, /^birthday$/);
        email = pick("patient_email", /^email$/, /^email_address$/) || (submitterEmail ? String(submitterEmail).trim() : "");
        phone = pick("patient_phone", /^phone$/, /^phone_?number$/, /^mobile$/, /^cell$/, /^telephone$/);
        const address = smartValues["patient_address"] || "";
        const preferredPharmacy = smartValues["patient_preferred_pharmacy"] || "";
        const genderRaw = pick("patient_gender", /^gender$/, /^sex$/);
        gender = genderRaw
          ? (genderRaw.toLowerCase().startsWith("f") ? "female" : "male")
          : "male";

        if (firstName && lastName) {
          // Match priority: email > (firstName + lastName + DOB) > create new
          let existing: any = null;

          // Resolve clinic ID for this form's clinician (no req context here)
          const formClinicianUser = await storage.getUserById(form.clinicianId);
          const formClinicId = formClinicianUser?.defaultClinicId ?? null;

          if (email) {
            existing = await storage.getPatientByEmail?.(email, form.clinicianId, formClinicId) ?? null;
          }
          if (!existing && dobRaw) {
            const candidate = await storage.getPatientByName(firstName, lastName, form.clinicianId, formClinicId);
            if (candidate && candidate.dateOfBirth) {
              const candidateDob = new Date(candidate.dateOfBirth as any).toISOString().split("T")[0];
              const submittedDob = new Date(dobRaw).toISOString().split("T")[0];
              if (candidateDob === submittedDob) existing = candidate;
            } else if (candidate && !candidate.dateOfBirth) {
              existing = candidate;
            }
          }

          if (existing) {
            resolvedPatientId = existing.id;
            const updates: Record<string, any> = {};
            if (!existing.dateOfBirth && dobRaw) updates.dateOfBirth = new Date(dobRaw);
            if (!existing.email && email) updates.email = email;
            if (!existing.phone && phone) updates.phone = phone;
            if (!existing.preferredPharmacy && preferredPharmacy) updates.preferredPharmacy = preferredPharmacy;
            if (Object.keys(updates).length > 0) {
              await storage.updatePatient(existing.id, updates, form.clinicianId, formClinicId);
            }
          } else {
            const created = await storage.createPatient({
              userId: form.clinicianId,
              ...(formClinicId ? { clinicId: formClinicId } : {}),
              firstName,
              lastName,
              dateOfBirth: dobRaw ? new Date(dobRaw) : null,
              gender,
              email: email || null,
              phone: phone || null,
              preferredPharmacy: preferredPharmacy || null,
            });
            resolvedPatientId = created.id;
            autoCreated = true;
          }
        }
      }

      // Forms always include a required Full Name + Email collected via
      // submitterName / submitterEmail. Make sure those always populate the
      // demographic vars used by the GHL webhook, even when the patient-match
      // block above didn't run (e.g. orphan form, missing clinicianId).
      if (!firstName && !lastName && submitterName) {
        const parts = String(submitterName).trim().split(/\s+/);
        firstName = parts[0] ?? "";
        lastName = parts.slice(1).join(" ") || (parts[0] ?? "");
      }
      if (!email && submitterEmail) {
        email = String(submitterEmail).trim();
      }

      // Auto-extract signature from responses if a signature field exists and no
      // separate `signature` was sent. This keeps signatureJson populated even though
      // the public form submits the data URL inside responses[fieldKey].
      let resolvedSignature: string | null = (typeof signature === "string" && signature.startsWith("data:image")) ? signature : null;
      if (!resolvedSignature) {
        const allFields = await storage.getFormFields(pub.formId);
        for (const f of allFields) {
          if (f.fieldType === "signature") {
            const v = responses?.[f.fieldKey];
            if (typeof v === "string" && v.startsWith("data:image")) {
              resolvedSignature = v;
              break;
            }
          }
        }
      }

      const submission = await storage.createFormSubmission({
        formId: pub.formId,
        formVersion: form.version,
        clinicianId: form.clinicianId,
        clinicId: form.clinicId,
        patientId: resolvedPatientId,
        submittedByPatient: true,
        submittedByStaff: false,
        submissionSource: pub.mode,
        status: "submitted",
        rawSubmissionJson: responses,
        normalizedSubmissionJson: responses,
        signatureJson: resolvedSignature,
        reviewStatus: "pending",
        syncStatus: "not_synced",
        submitterName: submitterName ?? null,
        submitterEmail: submitterEmail ?? null,
      });

      // Update assignment status if applicable
      if (pub.mode !== "embed") {
        try {
          if (resolvedPatientId) {
            const assignments = await storage.getPatientFormAssignments(resolvedPatientId);
            const pending = assignments.find(a => a.formId === pub.formId && a.status === "pending");
            if (pending) {
              await storage.updatePatientFormAssignment(pending.id, { status: "completed" });
              await storage.updateFormSubmission(submission.id, { assignmentId: pending.id });
            }
          }
        } catch (assignErr) {
          console.error("[FormSubmit] assignment update error:", assignErr);
        }
      }

      // Fire-and-forget: GoHighLevel inbound webhook
      console.log(`[GHL Webhook] public form ${form.id} sub ${submission.id} — enabled=${form.ghlWebhookEnabled} urlSet=${!!form.ghlWebhookUrl}`);
      if (form.ghlWebhookEnabled && form.ghlWebhookUrl) {
        const webhookUrl = form.ghlWebhookUrl;
        setImmediate(async () => {
          try {
            const fullName = [firstName, lastName].filter(Boolean).join(" ") || submitterName || null;
            const emailVal = email || (submitterEmail ? String(submitterEmail).trim() : null);
            const payload = {
              event: "form_submission",
              source: "ClinIQ",
              submissionId: submission.id,
              submittedAt: submission.submittedAt ?? new Date().toISOString(),
              form: { id: form.id, name: form.name, slug: form.slug ?? null, version: form.version },
              clinicId: form.clinicId ?? null,
              patientId: resolvedPatientId ?? null,
              // GHL contact fields — send BOTH camelCase and snake_case so the
              // GoHighLevel inbound webhook auto-maps to a contact regardless of
              // how the user's workflow / custom-value mapping is configured.
              firstName: firstName || null,
              lastName: lastName || null,
              fullName,
              name: fullName,
              email: emailVal,
              phone: phone || null,
              dateOfBirth: dobRaw || null,
              gender: gender || null,
              first_name: firstName || null,
              last_name: lastName || null,
              full_name: fullName,
              date_of_birth: dobRaw || null,
              responses,
            };
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 10000);
            const resp = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (!resp.ok) {
              console.error(`[GHL Webhook] form ${form.id} sub ${submission.id} -> ${resp.status} ${resp.statusText}`);
            }
          } catch (err: any) {
            console.error(`[GHL Webhook] form ${form.id} sub ${submission.id} error:`, err?.message ?? err);
          }
        });
      }

      // Fire-and-forget: sync smart-field chart domains into patient chart
      if (resolvedPatientId && form.clinicianId) {
        setImmediate(async () => {
          try {
            const fields = await storage.getFormFields(pub.formId);
            const chart = await storage.getPatientChart(resolvedPatientId!, form.clinicianId!);
            const toSync: Record<string, string[]> = {
              medications: [], allergies: [], medical_history: [],
              surgical_history: [], family_history: [], social_history: [],
            };
            for (const field of fields) {
              if (!field.syncConfigJson) continue;
              const sync = field.syncConfigJson as any;
              if (!sync.domain || !sync.mode || sync.mode === "none") continue;
              const value = (responses as Record<string, any>)[field.fieldKey];
              if (value === undefined || value === null || value === "") continue;
              const domain = sync.domain as string;
              if (!toSync[domain]) continue;
              if (Array.isArray(value)) {
                toSync[domain].push(...value.filter(Boolean).map(String));
              } else if (typeof value === "object" && value !== null) {
                if (domain === "family_history" && !Array.isArray(value) && !(value.rows)) {
                  extractFamilyHistoryEntries(field, value).forEach(e => toSync[domain].push(e));
                } else {
                  const rows = value.rows ?? value;
                  if (Array.isArray(rows)) {
                    toSync[domain].push(...rows.map((r: any) => typeof r === "string" ? r : JSON.stringify(r)));
                  }
                }
              } else {
                toSync[domain].push(String(value));
              }
            }
            {
              const chartData: Record<string, any> = {};
              const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
              for (const [domain, values] of Object.entries(toSync)) {
                if (values.length === 0) continue;
                const key = domain === "medical_history" ? "medicalHistory"
                  : domain === "surgical_history" ? "surgicalHistory"
                  : domain === "family_history" ? "familyHistory"
                  : domain === "social_history" ? "socialHistory"
                  : domain === "medications" ? "currentMedications"
                  : domain;
                const existing = (chart ? ((chart as any)[key] as string[]) ?? [] : []);
                const seenNorms = new Set(existing.map(normalize));
                const merged = [...existing];
                for (const item of values) {
                  const norm = normalize(item);
                  if (!seenNorms.has(norm)) {
                    merged.push(item);
                    seenNorms.add(norm);
                  }
                }
                chartData[key] = merged;
              }
              if (Object.keys(chartData).length > 0) {
                await storage.upsertPatientChart(resolvedPatientId!, form.clinicianId!, chartData);
              }
            }
          } catch (syncErr) {
            console.error("[FormSubmit] smart-field sync error:", syncErr);
          }
        });
      }

      res.json({ success: true, submissionId: submission.id, patientId: resolvedPatientId, autoCreated });
    } catch (err) {
      console.error("[FormSubmit]", err);
      res.status(500).json({ message: "Failed to submit form" });
    }
  });

  // ─── Patient Form Routes ─────────────────────────────────────────────────────

  // GET /api/patients/:id/form-assignments
  app.get("/api/patients/:id/form-assignments", requireAuth, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const assignments = await storage.getPatientFormAssignments(patientId);
      res.json(assignments);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  // POST /api/patients/:id/form-assignments
  app.post("/api/patients/:id/form-assignments", requireAuth, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const { formId, dueAt, notes, deliveryMode } = req.body;
      if (!formId) return res.status(400).json({ message: "formId required" });
      const form = await storage.getIntakeFormByIdAndClinic(parseInt(formId), clinicId, clinicianId);
      if (!form) return res.status(404).json({ message: "Form not found" });
      const mode = deliveryMode === "in_clinic" ? "in_clinic" : "portal";
      const assignment = await storage.createPatientFormAssignment({
        patientId,
        formId: parseInt(formId),
        assignedBy: req.user?.id ?? (req.session as any).staffClinicianId,
        dueAt: dueAt ? new Date(dueAt) : null,
        status: "pending",
        completionRequired: false,
        deliveryMode: mode,
        notes: notes ?? null,
      });

      // Notify the patient if pushed to portal
      if (mode === "portal") {
        try {
          // In-portal message
          await storage.createPortalMessage({
            patientId,
            clinicianId,
            senderType: "clinician",
            content: `A new form has been assigned to you: "${form.name}". You can complete it from your Forms tab${dueAt ? ` by ${new Date(dueAt).toLocaleDateString()}` : ""}.`,
          });

          // Email notification (best-effort)
          if (patient.email && process.env.RESEND_API_KEY) {
            const clinician = await storage.getUser(clinicianId);
            const clinicName = clinician?.clinicName || "Your Healthcare Provider";
            const sendingDomain = process.env.RESEND_FROM_EMAIL || "noreply@cliniqapp.ai";
            const portalUrl = `${req.protocol}://${req.get("host")}/portal/forms`;
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2e3a20;">New Form from ${clinicName}</h2>
                <p>Hi ${patient.firstName},</p>
                <p>Your provider has assigned you a new form to complete${dueAt ? ` by <strong>${new Date(dueAt).toLocaleDateString()}</strong>` : ""}:</p>
                <div style="background: #f9f6f0; border: 1px solid #d4c9b5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                  <strong>${form.name}</strong>
                  ${form.description ? `<p style="color: #666; margin-top: 8px;">${form.description}</p>` : ""}
                </div>
                <a href="${portalUrl}" style="display: inline-block; background: #2e3a20; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Open Patient Portal</a>
                <p style="margin-top: 24px; color: #888; font-size: 12px;">Sign in to your patient portal to complete this form.</p>
              </div>`;
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: `"${clinicName}" <${sendingDomain}>`,
                to: [patient.email],
                subject: `${clinicName}: New form to complete — ${form.name}`,
                html,
              }),
            }).catch((e) => console.error("[Assign Form] Email send failed:", e));
          }
        } catch (notifyErr) {
          console.error("[Assign Form] Notification error:", notifyErr);
        }
      }

      res.json(assignment);
    } catch (err) {
      console.error("[Assign Form] Failed:", err);
      res.status(500).json({ message: "Failed to assign form" });
    }
  });

  // GET /api/patients/:id/form-submissions
  app.get("/api/patients/:id/form-submissions", requireAuth, async (req: any, res) => {
    try {
      const patientId = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const submissions = await storage.getFormSubmissionsByPatient(patientId);
      const enriched = await Promise.all(submissions.map(async (sub) => {
        const form = await storage.getIntakeFormById(sub.formId);
        return { ...sub, formName: form?.name ?? "Unknown Form", formCategory: form?.category ?? "custom" };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch submissions" });
    }
  });

  // GET /api/form-submissions/:id
  app.get("/api/form-submissions/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const submission = await storage.getFormSubmission(id);
      if (!submission) return res.status(404).json({ message: "Submission not found" });
      if (submission.clinicianId !== clinicianId && (!clinicId || (submission as any).clinicId !== clinicId)) {
        return res.status(404).json({ message: "Submission not found" });
      }
      const form = await storage.getIntakeFormById(submission.formId);
      const fields = await storage.getFormFields(submission.formId);
      const sections = await storage.getFormSections(submission.formId);
      const syncEvents = await storage.getFormSyncEvents(id);
      let patient: any = null;
      if (submission.patientId) {
        patient = await storage.getPatient(submission.patientId, clinicianId, clinicId);
      }
      res.json({ ...submission, form, fields, sections, syncEvents, patient: patient ? { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth } : null });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch submission" });
    }
  });

  // DELETE /api/form-submissions/:id — delete a submission and its sync events
  app.delete("/api/form-submissions/:id", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const submission = await storage.getFormSubmission(id);
      if (!submission) return res.status(404).json({ message: "Submission not found" });
      const isOwner = submission.clinicianId === clinicianId;
      const isClinicMember = clinicId && (submission as any).clinicId === clinicId;
      if (!isOwner && !isClinicMember) {
        return res.status(403).json({ message: "Not authorized" });
      }
      await storage.deleteFormSubmission(id);
      res.json({ success: true });
    } catch (err) {
      console.error("[DeleteFormSubmission]", err);
      res.status(500).json({ message: "Failed to delete submission" });
    }
  });

  // PUT /api/form-submissions/:id/review
  app.put("/api/form-submissions/:id/review", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const submission = await storage.getFormSubmission(id);
      if (!submission) return res.status(404).json({ message: "Submission not found" });
      if (submission.clinicianId !== clinicianId && (!clinicId || (submission as any).clinicId !== clinicId)) {
        return res.status(404).json({ message: "Submission not found" });
      }
      const { reviewStatus } = req.body;
      const updated = await storage.updateFormSubmission(id, { reviewStatus });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update review status" });
    }
  });

  // GET /api/form-submissions/:id/sync-preview — preview what would be synced
  app.get("/api/form-submissions/:id/sync-preview", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const submission = await storage.getFormSubmission(id);
      if (!submission) return res.status(404).json({ message: "Submission not found" });
      if (submission.clinicianId !== clinicianId && (!clinicId || (submission as any).clinicId !== clinicId)) {
        return res.status(404).json({ message: "Submission not found" });
      }
      if (!submission.patientId) return res.status(400).json({ message: "No patient linked to this submission" });

      const fields = await storage.getFormFields(submission.formId);
      const responses = submission.rawSubmissionJson as Record<string, any>;
      const patientId = submission.patientId;
      const chart = await storage.getPatientChart(patientId, submission.clinicianId ?? req.user.id);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);

      const domainLabels: Record<string, string> = {
        medications: "Current Medications",
        allergies: "Allergies & Sensitivities",
        medical_history: "Medical History",
        surgical_history: "Surgical History",
        family_history: "Family History",
        social_history: "Social History",
      };

      const extracted: Record<string, string[]> = {
        medications: [], allergies: [], medical_history: [],
        surgical_history: [], family_history: [], social_history: [],
      };

      for (const field of fields) {
        if (!field.syncConfigJson) continue;
        const sync = field.syncConfigJson as any;
        if (!sync.domain || !sync.mode || sync.mode === "none") continue;
        const value = responses[field.fieldKey];
        if (value === undefined || value === null || value === "") continue;
        const domain = sync.domain as string;
        if (!extracted[domain]) continue;
        if (Array.isArray(value)) {
          extracted[domain].push(...value.filter(Boolean).map(String));
        } else if (typeof value === "object") {
          if (domain === "family_history" && !Array.isArray(value) && !(value.rows)) {
            extractFamilyHistoryEntries(field, value).forEach(e => extracted[domain].push(e));
          } else {
            const rows = value.rows ?? value;
            if (Array.isArray(rows)) {
              extracted[domain].push(...rows.map((r: any) => typeof r === "string" ? r : JSON.stringify(r)));
            }
          }
        } else {
          extracted[domain].push(String(value));
        }
      }

      const existing: Record<string, string[]> = {
        medications: (chart?.currentMedications as string[] ?? []),
        allergies: (chart?.allergies as string[] ?? []),
        medical_history: (chart?.medicalHistory as string[] ?? []),
        surgical_history: (chart?.surgicalHistory as string[] ?? []),
        family_history: (chart?.familyHistory as string[] ?? []),
        social_history: (chart?.socialHistory as string[] ?? []),
      };

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

      const preview: Record<string, Array<{ item: string; duplicate: boolean }>> = {};
      for (const [domain, items] of Object.entries(extracted)) {
        preview[domain] = items.map(item => ({
          item,
          duplicate: (existing[domain] ?? []).some(e => normalize(e) === normalize(item)),
        }));
      }

      res.json({
        patientId,
        patientName: patient ? `${patient.firstName} ${patient.lastName}` : null,
        syncStatus: submission.syncStatus,
        domainLabels,
        preview,
      });
    } catch (err: any) {
      console.error("[FormSyncPreview]", err);
      res.status(500).json({ message: "Sync preview failed", error: err.message });
    }
  });

  // POST /api/form-submissions/:id/sync — sync submission data into patient chart
  app.post("/api/form-submissions/:id/sync", requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const submission = await storage.getFormSubmission(id);
      if (!submission) return res.status(404).json({ message: "Submission not found" });
      if (submission.clinicianId !== clinicianId && (!clinicId || (submission as any).clinicId !== clinicId)) {
        return res.status(404).json({ message: "Submission not found" });
      }
      if (!submission.patientId) return res.status(400).json({ message: "No patient linked to this submission" });

      const fields = await storage.getFormFields(submission.formId);
      const responses = submission.rawSubmissionJson as Record<string, any>;
      const patientId = submission.patientId;
      const approvedItems = req.body?.approvedItems as Record<string, string[]> | undefined;

      const chart = await storage.getPatientChart(patientId, submission.clinicianId ?? req.user.id);
      const syncResults: Array<{ domain: string; item: string; action: string; duplicate: boolean }> = [];

      const toSync: Record<string, string[]> = {
        medications: [],
        allergies: [],
        medical_history: [],
        surgical_history: [],
        family_history: [],
        social_history: [],
      };

      if (approvedItems) {
        for (const [domain, items] of Object.entries(approvedItems)) {
          if (toSync[domain]) {
            toSync[domain].push(...items.filter(Boolean));
          }
        }
      } else {
        for (const field of fields) {
          if (!field.syncConfigJson) continue;
          const sync = field.syncConfigJson as any;
          if (!sync.domain || !sync.mode || sync.mode === "none") continue;
          const value = responses[field.fieldKey];
          if (value === undefined || value === null || value === "") continue;
          const domain = sync.domain as string;
          if (!toSync[domain]) continue;
          if (Array.isArray(value)) {
            toSync[domain].push(...value.filter(Boolean).map(String));
          } else if (typeof value === "object") {
            if (domain === "family_history" && !Array.isArray(value) && !(value.rows)) {
              extractFamilyHistoryEntries(field, value).forEach(e => toSync[domain].push(e));
            } else {
              const rows = value.rows ?? value;
              if (Array.isArray(rows)) {
                toSync[domain].push(...rows.map((r: any) => typeof r === "string" ? r : JSON.stringify(r)));
              }
            }
          } else {
            toSync[domain].push(String(value));
          }
        }
      }

      const existing = {
        medications: (chart?.currentMedications as string[] ?? []),
        allergies: (chart?.allergies as string[] ?? []),
        medical_history: (chart?.medicalHistory as string[] ?? []),
        surgical_history: (chart?.surgicalHistory as string[] ?? []),
        family_history: (chart?.familyHistory as string[] ?? []),
        social_history: (chart?.socialHistory as string[] ?? []),
      };

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

      const merged: typeof existing = {
        medications: [...existing.medications],
        allergies: [...existing.allergies],
        medical_history: [...existing.medical_history],
        surgical_history: [...existing.surgical_history],
        family_history: [...existing.family_history],
        social_history: [...existing.social_history],
      };
      const seenNorms: Record<string, Set<string>> = {};
      for (const domain of Object.keys(existing)) {
        seenNorms[domain] = new Set((existing[domain as keyof typeof existing] as string[]).map(normalize));
      }
      for (const [domain, items] of Object.entries(toSync)) {
        for (const item of items) {
          const itemNorm = normalize(item);
          const isDuplicate = seenNorms[domain]?.has(itemNorm) ?? false;
          syncResults.push({ domain, item, action: isDuplicate ? "skipped_duplicate" : "added", duplicate: isDuplicate });
          if (!isDuplicate) {
            (merged[domain as keyof typeof merged] as string[]).push(item);
            seenNorms[domain]?.add(itemNorm);
          }
        }
      }

      const addedCount = syncResults.filter(r => r.action === "added").length;

      if (addedCount > 0) {
        await storage.upsertPatientChart(patientId, submission.clinicianId ?? req.user.id, {
          currentMedications: merged.medications,
          allergies: merged.allergies,
          medicalHistory: merged.medical_history,
          surgicalHistory: merged.surgical_history,
          familyHistory: merged.family_history,
          socialHistory: merged.social_history,
        });
      }

      for (const r of syncResults) {
        await storage.createFormSyncEvent({
          submissionId: id,
          patientId,
          targetDomain: r.domain,
          actionType: r.action,
          resultStatus: r.duplicate ? "skipped" : "success",
          reviewRequired: false,
          duplicateDetected: r.duplicate,
          detailsJson: { item: r.item },
          createdBy: req.user.id,
        });
      }

      await storage.updateFormSubmission(id, {
        syncStatus: addedCount > 0 ? "synced" : submission.syncStatus,
        reviewStatus: "reviewed",
        syncSummaryJson: syncResults,
      });

      res.json({ success: true, results: syncResults });
    } catch (err: any) {
      console.error("[FormSync]", err);
      res.status(500).json({ message: "Sync failed", error: err.message });
    }
  });

  // GET /api/form-submissions/pending — clinic-scoped sync queue
  app.get("/api/form-submissions/pending", requireAuth, async (req: any, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const clinicianId = getClinicianId(req);
      const submissions = await storage.getFormSubmissionsByClinic(clinicId, clinicianId);
      const pending = submissions.filter(s => s.reviewStatus === "pending" || s.syncStatus === "not_synced");
      const enriched = await Promise.all(pending.map(async (sub) => {
        const form = await storage.getIntakeFormById(sub.formId);
        return { ...sub, formName: form?.name ?? "Unknown Form" };
      }));
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch pending submissions" });
    }
  });


  // PATCH /api/form-submissions/:id/reassign — reassign to different patient (all staff + providers)
  app.patch("/api/form-submissions/:id/reassign", requireAuth, async (req: any, res) => {
    try {
      const submissionId = parseInt(req.params.id);
      if (isNaN(submissionId)) return res.status(400).json({ message: "Invalid ID" });
      const { patientId } = req.body;
      if (!patientId) return res.status(400).json({ message: "patientId is required" });

      const submission = await storage.getFormSubmission(submissionId);
      if (!submission) return res.status(404).json({ message: "Submission not found" });

      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const form = await storage.getIntakeFormById(submission.formId);
      if (!form || form.clinicianId !== clinicianId) return res.status(403).json({ message: "Not authorized" });

      const clinicId2 = getEffectiveClinicId(req);
      const patient = await storage.getPatient(parseInt(patientId), clinicianId, clinicId2);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      const updated = await storage.updateFormSubmission(submissionId, {
        patientId: patient.id,
        syncStatus: "not_synced",
      });
      res.json(updated);
    } catch (err) {
      console.error("[Reassign]", err);
      res.status(500).json({ message: "Failed to reassign submission" });
    }
  });

  // POST /api/patients/merge — merge two patient profiles
  app.post("/api/patients/merge", requireClinicianOnly, async (req: any, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const { keepId, discardId } = req.body;
      if (!keepId || !discardId) return res.status(400).json({ message: "keepId and discardId are required" });
      const parsedKeepId = parseInt(keepId);
      const parsedDiscardId = parseInt(discardId);
      if (isNaN(parsedKeepId) || isNaN(parsedDiscardId)) return res.status(400).json({ message: "Invalid patient IDs" });
      if (parsedKeepId === parsedDiscardId) return res.status(400).json({ message: "Cannot merge a patient with itself" });

      const keepPatient = await storage.getPatient(parsedKeepId, clinicianId, clinicId);
      const discardPatient = await storage.getPatient(parsedDiscardId, clinicianId, clinicId);
      if (!keepPatient) return res.status(404).json({ message: "Keep patient not found" });
      if (!discardPatient) return res.status(404).json({ message: "Discard patient not found" });

      // Fill in missing demographics from discard → keep
      const updates: Record<string, any> = {};
      if (!keepPatient.email && discardPatient.email) updates.email = discardPatient.email;
      if (!keepPatient.phone && discardPatient.phone) updates.phone = discardPatient.phone;
      if (!keepPatient.dateOfBirth && discardPatient.dateOfBirth) updates.dateOfBirth = discardPatient.dateOfBirth;
      if (Object.keys(updates).length > 0) {
        await storage.updatePatient(keepPatient.id, updates, clinicianId, clinicId);
      }

      // Transfer lab results
      const discardLabs = await storage.getLabResultsByPatient(discardPatient.id);
      for (const lab of discardLabs) {
        await storage.updateLabResult(lab.id, { patientId: keepPatient.id });
      }

      // Transfer encounters
      const discardEncounters = await storage.getEncountersByClinicianId(clinicianId, discardPatient.id, clinicId);
      for (const enc of discardEncounters) {
        await storage.updateEncounter(enc.id, clinicianId, { patientId: keepPatient.id }, clinicId);
      }

      // Transfer form submissions
      const discardSubmissions = await storage.getFormSubmissionsByClinician(clinicianId);
      for (const sub of discardSubmissions.filter(s => s.patientId === discardPatient.id)) {
        await storage.updateFormSubmission(sub.id, { patientId: keepPatient.id });
      }

      // Merge charts (append clinical data)
      const keepChart = await storage.getPatientChart(keepPatient.id, clinicianId);
      const discardChart = await storage.getPatientChart(discardPatient.id, clinicianId);
      if (discardChart) {
        const mergeArrays = (a: any, b: any) => {
          const arr = Array.isArray(a) ? [...a] : [];
          const toAdd = Array.isArray(b) ? b : [];
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
          for (const item of toAdd) {
            if (!arr.some(e => norm(String(e)) === norm(String(item)))) {
              arr.push(item);
            }
          }
          return arr;
        };
        await storage.upsertPatientChart(keepPatient.id, clinicianId, {
          currentMedications: mergeArrays(keepChart?.currentMedications, discardChart.currentMedications),
          allergies: mergeArrays(keepChart?.allergies, discardChart.allergies),
          medicalHistory: mergeArrays(keepChart?.medicalHistory, discardChart.medicalHistory),
          surgicalHistory: mergeArrays(keepChart?.surgicalHistory, discardChart.surgicalHistory),
          familyHistory: mergeArrays(keepChart?.familyHistory, discardChart.familyHistory),
          socialHistory: mergeArrays(keepChart?.socialHistory, discardChart.socialHistory),
        });
      }

      // Delete the discard patient
      await storage.deletePatient(discardPatient.id, clinicianId, clinicId);

      res.json({ success: true, keptPatientId: keepPatient.id, mergedFrom: discardPatient.id });
    } catch (err: any) {
      console.error("[PatientMerge]", err);
      res.status(500).json({ message: "Merge failed", error: err.message });
    }
  });

  // ── ICD-10 Diagnosis Search ──────────────────────────────────────────────
  app.get("/api/diagnoses/search", requireAuth, async (req, res) => {
    try {
      const { searchDiagnoses } = await import("./icd10-diagnoses");
      const q = ((req.query.q as string) || "").trim();
      const qLower = q.toLowerCase();
      const builtIn = searchDiagnoses(q, 15).map(d => ({ ...d, isPreset: false as const }));

      // Merge in clinic-scoped custom presets
      const clinicId = getEffectiveClinicId(req);
      let presetResults: any[] = [];
      if (clinicId) {
        const allPresets = await storage.getDiagnosisPresets(clinicId);
        const terms = qLower.split(/\s+/).filter(Boolean);
        const scored: { preset: typeof allPresets[number]; score: number }[] = [];
        for (const p of allPresets) {
          const titleL = (p.title || "").toLowerCase();
          const aliasStr = (p.aliases ?? []).join(" ").toLowerCase();
          const codesStr = (p.codes as any[] ?? []).map(c => `${c.code} ${c.name}`).join(" ").toLowerCase();
          const haystack = `${titleL} ${aliasStr} ${codesStr}`;
          let score = 0;
          if (!qLower) {
            score = 1;
          } else if (titleL === qLower) {
            score = 110;
          } else if (titleL.startsWith(qLower)) {
            score = 95;
          } else if ((p.aliases ?? []).some(a => a.toLowerCase() === qLower)) {
            score = 92;
          } else if (terms.every(t => haystack.includes(t))) {
            score = titleL.includes(qLower) ? 75 : 50;
          }
          if (score > 0) scored.push({ preset: p, score });
        }
        scored.sort((a, b) => b.score - a.score);
        presetResults = scored.slice(0, 10).map(s => ({
          isPreset: true as const,
          id: s.preset.id,
          title: s.preset.title,
          codes: s.preset.codes,
          aliases: s.preset.aliases ?? [],
        }));
      }

      // Presets first, then built-in codes
      res.json([...presetResults, ...builtIn]);
    } catch (err: any) {
      console.error("[Diagnosis Search] Error:", err);
      res.status(500).json({ message: "Failed to search diagnoses" });
    }
  });

  // ── Diagnosis Presets CRUD (clinic-wide; any provider can create/edit/delete) ──
  const diagnosisPresetInput = z.object({
    title: z.string().trim().min(1, "Title is required").max(300),
    codes: z
      .array(z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(300) }))
      .min(1, "At least one ICD-10 code is required")
      .max(20),
    aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional().default([]),
  });

  app.get("/api/diagnosis-presets", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const rows = await storage.getDiagnosisPresets(clinicId);
      res.json(rows);
    } catch (err: any) {
      console.error("[Diagnosis Presets] List error:", err);
      res.status(500).json({ message: "Failed to list diagnosis presets" });
    }
  });

  app.post("/api/diagnosis-presets", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const userId = getClinicianId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const parsed = diagnosisPresetInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const row = await storage.createDiagnosisPreset({
        clinicId,
        createdByUserId: userId,
        title: parsed.data.title,
        codes: parsed.data.codes,
        aliases: parsed.data.aliases ?? [],
      } as any);
      res.status(201).json(row);
    } catch (err: any) {
      console.error("[Diagnosis Presets] Create error:", err);
      res.status(500).json({ message: "Failed to create diagnosis preset" });
    }
  });

  app.patch("/api/diagnosis-presets/:id", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const parsed = diagnosisPresetInput.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const row = await storage.updateDiagnosisPreset(id, clinicId, parsed.data as any);
      if (!row) return res.status(404).json({ message: "Preset not found" });
      res.json(row);
    } catch (err: any) {
      console.error("[Diagnosis Presets] Update error:", err);
      res.status(500).json({ message: "Failed to update diagnosis preset" });
    }
  });

  app.delete("/api/diagnosis-presets/:id", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await storage.deleteDiagnosisPreset(id, clinicId);
      if (!ok) return res.status(404).json({ message: "Preset not found" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Diagnosis Presets] Delete error:", err);
      res.status(500).json({ message: "Failed to delete diagnosis preset" });
    }
  });

  // ── Ask ClinIQ — AI Clinical Colleague Chat ─────────────────────────────
  app.post("/api/ai-chat", requireAuth, async (req, res) => {
    try {
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const { messages, patientId } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "messages array is required" });
      }
      if (messages.length > 50) {
        return res.status(400).json({ message: "Too many messages. Please start a new conversation." });
      }
      for (const m of messages) {
        if (!m.content || typeof m.content !== "string" || m.content.length > 10000) {
          return res.status(400).json({ message: "Each message must be a string under 10,000 characters." });
        }
      }

      let patientContext = "";
      let patientName = "";
      if (patientId) {
        try {
          const patient = await storage.getPatient(patientId, clinicianId, clinicId);
          if (patient) {
            patientName = `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim();
            const gender = patient.gender || "unknown";
            const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : "unknown";
            patientContext += `\n\n--- CURRENT PATIENT CONTEXT ---\nPatient: ${patientName}\nGender: ${gender}\nDOB: ${dob}\n`;

            const chart = await storage.getPatientChart(patientId, clinicianId);
            if (chart) {
              const formatList = (arr: any) => Array.isArray(arr) && arr.length > 0 ? arr.map((a: any) => typeof a === 'string' ? a : a.name || a.label || JSON.stringify(a)).join(', ') : 'None documented';
              patientContext += `\nCurrent Medications: ${formatList(chart.currentMedications)}`;
              patientContext += `\nAllergies: ${formatList(chart.allergies)}`;
              patientContext += `\nMedical History: ${formatList(chart.medicalHistory)}`;
              patientContext += `\nSurgical History: ${formatList(chart.surgicalHistory)}`;
              patientContext += `\nFamily History: ${formatList(chart.familyHistory)}`;
              patientContext += `\nSocial History: ${formatList(chart.socialHistory)}`;
            }

            const labResults = await storage.getLabResultsByPatient(patientId);
            if (labResults && labResults.length > 0) {
              const latest = labResults[0];
              const labDate = latest.createdAt ? new Date(latest.createdAt).toLocaleDateString() : "unknown date";
              patientContext += `\n\nMost Recent Labs (${labDate}):\n`;
              const vals = latest.labValues as any;
              if (vals && typeof vals === 'object') {
                for (const [key, val] of Object.entries(vals)) {
                  if (val !== null && val !== undefined && val !== "") {
                    patientContext += `  ${key}: ${val}\n`;
                  }
                }
              }
              if (labResults.length > 1) {
                patientContext += `\n(${labResults.length} total lab panels on file — most recent shown above)`;
              }
            }
            patientContext += `\n--- END PATIENT CONTEXT ---`;
          }
        } catch (e) {
          console.error("[AI-Chat] Error loading patient context:", e);
        }
      }

      const { LAB_MARKER_DEFAULTS } = await import("./lab-marker-defaults");
      const rangesRef = LAB_MARKER_DEFAULTS.map(m => `${m.displayName} (${m.gender}): Optimal ${m.optimalMin ?? '—'}–${m.optimalMax ?? '—'} ${m.unit}, Ref ${m.normalMin ?? '—'}–${m.normalMax ?? '—'} ${m.unit}${m.notes ? ` [${m.notes}]` : ''}`).join('\n');

      const systemPrompt = `You are ClinIQ, an AI clinical colleague embedded in a hormone and primary care clinic platform. You speak as a knowledgeable, approachable fellow clinician — not a chatbot. Use professional but conversational language, like you'd talk with a colleague in the break room or during a case consult.

CORE BEHAVIOR:
- Be direct, specific, and clinically useful. No generic filler.
- When making clinical recommendations, ALWAYS cite the evidence. Include study names, guideline sources, or established protocols (e.g., "per AHA 2023 PREVENT guidelines," "Endocrine Society 2018 guidelines," "AACE/ACE 2020 consensus").
- When referencing ranges, use the clinic's optimized functional ranges (listed below), not just conventional reference ranges. Explain when functional ranges differ from standard lab ranges and why.
- If you're unsure about something, say so honestly. Never fabricate evidence or studies.
- MEDICATION NAME RULE — NON-NEGOTIABLE: Only use real, established generic or brand names (e.g., semaglutide, tirzepatide, testosterone cypionate, metformin, anastrozole, levothyroxine, atorvastatin, vitamin D3, omega-3). If a specific drug is not confirmed, refer to the drug class only (e.g., "GLP-1 receptor agonist," "statin therapy"). NEVER invent or approximate a medication name — fictional names (e.g., "Zephytide") are a patient-safety error.
- Format evidence citations clearly — use bold for guideline names or study titles.
- CONTEXT-AWARE THERAPY RULE: Before recommending initiation of any medication or supplement for a suboptimal lab, cross-check the patient's Current Medications list (provided in patient context when available). If the indicated therapy class is already on board (e.g., patient on atorvastatin and you'd recommend a statin; patient on Vitamin D3 and you'd recommend vitamin D; patient on metformin and you'd recommend metformin; patient on lisinopril and you'd recommend an ACE inhibitor), do NOT recommend starting a duplicate. Instead, recommend (a) confirming adherence, (b) verifying the patient is taking the dose as prescribed, and (c) consider dose escalation or switching within the same class if the response is inadequate. Only suggest adding a different class once same-class optimization is exhausted. Always name the exact chart medication in your response so the clinician knows you saw it.

CLINIC PROTOCOLS & RANGES:
The clinic uses both conventional reference ranges AND functional/optimized ranges for clinical decision-making. Here are the key markers:

${rangesRef}

RED FLAG THRESHOLDS (immediate clinical action required):
- Hematocrit ≥54% (male on TRT): HOLD testosterone, order therapeutic phlebotomy
- Hematocrit ≥50% (male on TRT): Warning — monitor closely, consider dose reduction
- PSA >4.0 ng/mL or velocity >1.4 ng/mL/year: Urgent urology referral
- AST or ALT >5x upper limit of normal: Hold hepatotoxic medications, urgent workup
- Potassium >5.5 mEq/L: Critical hyperkalemia — repeat STAT, ECG
- Potassium <3.0 mEq/L: Critical hypokalemia — urgent correction
- Glucose ≥126 mg/dL or A1c ≥6.5%: Diabetes diagnostic threshold
- Platelets <100 K/µL with elevated AST: Calculate FIB-4 for fibrosis risk

CLINICAL ALGORITHMS AVAILABLE:
- ASCVD 10-year risk (2013 ACC/AHA Pooled Cohort Equations)
- AHA PREVENT 10/30-year cardiovascular risk (2023, includes eGFR)
- STOP-BANG Sleep Apnea Screening
- Insulin Resistance phenotype detection (4 phenotypes)
- Advanced lipid interpretation (ApoB, Lp(a), hs-CRP)
- Female phenotype detection: Estrogen Dominance, Inflammatory Burden, Insulin Resistance

SUPPLEMENT PROTOCOLS:
The clinic uses Metagenics supplement protocols based on lab values and symptoms. Reference these when discussing supplement recommendations — always with the clinical rationale.

RESPONSE FORMAT:
- Use markdown formatting for readability
- Bold key clinical values and recommendations
- When citing evidence, format as: **[Guideline/Study Name, Year]** — brief description
- Include a "References" section at the end of detailed clinical discussions
- For patient-specific discussions, structure your response with clear sections${patientContext}

IMPORTANT:
- You are an AI assistant. Always remind the provider that clinical decisions are theirs — you're here to support, not replace their judgment.
- Never fabricate citations. If you don't know the specific study, say "based on clinical practice guidelines" or "per generally accepted clinical consensus" rather than making up a citation.
- Protect patient privacy — never include patient identifiers in any way that could be logged or exposed outside this conversation.`;

      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      });

      const chatMessages: any[] = [
        { role: "system", content: systemPrompt },
        ...messages.slice(-20).map((m: any) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })),
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: chatMessages,
        temperature: 0.4,
        max_tokens: 2000,
      });

      const reply = completion.choices[0]?.message?.content || "I'm sorry, I wasn't able to generate a response. Please try rephrasing your question.";

      res.json({ reply, patientName: patientName || null });
    } catch (err: any) {
      console.error("[AI-Chat] Error:", err);
      if (err.status === 429) {
        return res.status(429).json({ message: "AI rate limit reached. Please wait a moment and try again." });
      }
      res.status(500).json({ message: "Something went wrong reaching the AI service. Please try again in a moment." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ─── Daily Check-In (Phase 1) ─────────────────────────────────────────
  // Optional patient tracking + accountability tool. Patient-facing endpoints
  // require portal auth; clinician-facing endpoints require clinician auth.
  // Default-off: absence of a tracking_settings row means tracking is off.
  // ═══════════════════════════════════════════════════════════════════════

  // --- helpers --------------------------------------------------------------
  function todayStr(): string {
    // YYYY-MM-DD in UTC; client sends explicit dates for non-UTC days.
    return new Date().toISOString().slice(0, 10);
  }

  function defaultTrackingSettings(patientId: number) {
    return {
      patientId,
      trackingMode: "off",
      enabled: false,
      setupCompleted: false,
      stillHasCycle: null,
      cyclesRegular: null,
      onHormoneTherapy: null,
      hysterectomyStatus: null,
      ovariesStatus: null,
      lastActivityAt: null,
      lastReminderDismissedAt: null,
      reminderPreferences: {},
    };
  }

  // ── PATIENT PORTAL: tracking settings ─────────────────────────────────
  app.get("/api/portal/tracking/settings", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const settings = await storage.getPatientTrackingSettings(patientId);
      res.json(settings ?? defaultTrackingSettings(patientId));
    } catch (err) {
      console.error("[tracking] settings GET error:", err);
      res.status(500).json({ message: "Failed to load tracking settings" });
    }
  });

  app.post("/api/portal/tracking/settings", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const allowed = [
        "trackingMode", "enabled", "setupCompleted",
        "stillHasCycle", "cyclesRegular", "onHormoneTherapy",
        "hysterectomyStatus", "ovariesStatus",
        "lastReminderDismissedAt", "reminderPreferences",
      ] as const;
      const partial: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) partial[key] = (req.body as any)[key];
      }
      // Light validation
      if (partial.trackingMode && !["off", "standard", "power"].includes(partial.trackingMode)) {
        return res.status(400).json({ message: "Invalid tracking mode" });
      }
      // Mode "off" implies enabled = false
      if (partial.trackingMode === "off") partial.enabled = false;
      if (partial.trackingMode === "standard" || partial.trackingMode === "power") partial.enabled = true;
      const updated = await storage.upsertPatientTrackingSettings(patientId, partial);
      res.json(updated);
    } catch (err) {
      console.error("[tracking] settings POST error:", err);
      res.status(500).json({ message: "Failed to save tracking settings" });
    }
  });

  // ── PATIENT PORTAL: daily check-ins ───────────────────────────────────
  app.get("/api/portal/tracking/checkins", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const from = (req.query.from as string | undefined)?.slice(0, 10);
      const to = (req.query.to as string | undefined)?.slice(0, 10);
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 365) : 90;
      const rows = await storage.getPatientDailyCheckins(patientId, { from, to, limit });
      res.json(rows);
    } catch (err) {
      console.error("[tracking] checkins GET error:", err);
      res.status(500).json({ message: "Failed to load check-ins" });
    }
  });

  app.get("/api/portal/tracking/checkins/today", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const date = (req.query.date as string | undefined)?.slice(0, 10) || todayStr();
      const row = await storage.getPatientDailyCheckin(patientId, date);
      res.json(row ?? { patientId, date });
    } catch (err) {
      console.error("[tracking] checkins/today GET error:", err);
      res.status(500).json({ message: "Failed to load today's check-in" });
    }
  });

  app.post("/api/portal/tracking/checkins", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const date = (req.body.date as string | undefined)?.slice(0, 10) || todayStr();
      // Whitelist accepted fields
      const allowed = [
        "weight", "foodProteinLevel", "waterLevel", "fiberVeggieLevel",
        "processedFoodLevel", "alcoholUse", "foodNotes",
        "proteinGrams", "calories", "carbs", "fat", "fiberGrams", "waterOunces",
        "sleepHours", "sleepQuality", "nightSweats", "wokeDuringNight",
        "exerciseDone", "exerciseType", "exerciseMinutes", "exerciseIntensity",
        "moodScore", "energyScore", "cravingsScore", "hungerScore",
        "brainFogScore", "anxietyIrritabilityScore",
        "giSymptoms", "unexpectedBleeding", "otherSymptoms",
        "cycleData", "notes",
      ] as const;
      const partial: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) partial[key] = (req.body as any)[key];
      }
      const row = await storage.upsertPatientDailyCheckin(patientId, date, partial);

      // If patient reported unexpected bleeding, notify the clinic.
      if (partial.unexpectedBleeding === true) {
        const patient = await storage.getPatientById(patientId);
        if (patient?.clinicId) {
          await storage.createInboxNotification({
            clinicId: patient.clinicId,
            patientId,
            providerId: patient.primaryProviderId ?? null,
            type: "unexpected_bleeding_reported",
            title: "Unexpected bleeding reported",
            message: `${patient.firstName} ${patient.lastName} reported unexpected/breakthrough bleeding on ${date}.`,
            relatedEntityType: "checkin",
            relatedEntityId: row.id,
            severity: "urgent",
          } as any);
        }
      }
      res.json(row);
    } catch (err) {
      console.error("[tracking] checkins POST error:", err);
      res.status(500).json({ message: "Failed to save check-in" });
    }
  });

  // ── PATIENT PORTAL: medications/supplements (chart + patient-reported) ──
  app.get("/api/portal/tracking/medications", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const patient = await storage.getPatientById(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      // Pull active chart meds (jsonb array on patient_charts) for the patient's
      // primary clinician, plus any patient-reported meds.
      let chartMedications: string[] = [];
      if (patient.userId) {
        const chart = await storage.getPatientChart(patientId, patient.userId);
        chartMedications = (chart?.currentMedications ?? []) as string[];
      }
      const reported = await storage.listPatientReportedMedications(patientId, { status: "active" });
      res.json({
        chartMedications: chartMedications.map((name, idx) => ({
          id: `chart-${idx}`,
          name,
          source: "patient_chart",
        })),
        patientReported: reported.map((r) => ({
          id: `reported-${r.id}`,
          rowId: r.id,
          name: r.name,
          dose: r.dose,
          frequency: r.frequency,
          type: r.type,
          source: "patient_reported",
          reviewedByProvider: r.reviewedByProvider,
        })),
      });
    } catch (err) {
      console.error("[tracking] medications GET error:", err);
      res.status(500).json({ message: "Failed to load medications" });
    }
  });

  app.post("/api/portal/tracking/med-adherence", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const medicationName = String(req.body.medicationName ?? "").slice(0, 200);
      if (!medicationName) return res.status(400).json({ message: "medicationName required" });
      const date = (req.body.date as string | undefined)?.slice(0, 10) || todayStr();
      const status = String(req.body.status ?? "taken");
      if (!["taken", "skipped", "missed", "backfilled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const source = req.body.source === "patient_reported" ? "patient_reported" : "patient_chart";
      const row = await storage.logMedicationAdherence({
        patientId,
        medicationName,
        source,
        patientReportedMedicationId: req.body.patientReportedMedicationId ?? null,
        date,
        status,
        reason: req.body.reason ?? null,
      } as any);
      res.json(row);
    } catch (err) {
      console.error("[tracking] med-adherence POST error:", err);
      res.status(500).json({ message: "Failed to log adherence" });
    }
  });

  app.get("/api/portal/tracking/med-adherence", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const from = (req.query.from as string | undefined)?.slice(0, 10);
      const to = (req.query.to as string | undefined)?.slice(0, 10);
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : 200;
      const rows = await storage.getMedicationAdherence(patientId, { from, to, limit });
      res.json(rows);
    } catch (err) {
      console.error("[tracking] med-adherence GET error:", err);
      res.status(500).json({ message: "Failed to load adherence" });
    }
  });

  app.post("/api/portal/tracking/patient-reported-medication", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const name = String(req.body.name ?? "").trim().slice(0, 200);
      if (!name) return res.status(400).json({ message: "name required" });
      const type = req.body.type === "medication" ? "medication" : "supplement";
      const row = await storage.addPatientReportedMedication({
        patientId,
        name,
        dose: req.body.dose ?? null,
        frequency: req.body.frequency ?? null,
        type,
        route: req.body.route ?? null,
        reason: req.body.reason ?? null,
        startDate: req.body.startDate ?? null,
        source: "patient_reported",
        status: "active",
        reviewedByProvider: false,
      } as any);

      // Notify the clinic for safety review
      const patient = await storage.getPatientById(patientId);
      if (patient?.clinicId) {
        await storage.createInboxNotification({
          clinicId: patient.clinicId,
          patientId,
          providerId: patient.primaryProviderId ?? null,
          type: "patient_added_med_or_supplement",
          title: `Patient-added ${type}: ${name}`,
          message: `${patient.firstName} ${patient.lastName} added a new ${type} to their record: ${name}${row.dose ? ` (${row.dose})` : ""}. Please review for interactions or duplications.`,
          relatedEntityType: "medication",
          relatedEntityId: row.id,
          severity: "normal",
        } as any);
      }
      res.json(row);
    } catch (err) {
      console.error("[tracking] patient-reported-medication POST error:", err);
      res.status(500).json({ message: "Failed to add medication" });
    }
  });

  app.patch("/api/portal/tracking/patient-reported-medication/:id", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const allowed = ["name", "dose", "frequency", "type", "route", "reason", "startDate", "status"];
      const partial: Record<string, any> = {};
      for (const k of allowed) if (k in req.body) partial[k] = (req.body as any)[k];
      const updated = await storage.updatePatientReportedMedication(id, patientId, partial as any);
      if (!updated) return res.status(404).json({ message: "Medication not found" });
      res.json(updated);
    } catch (err) {
      console.error("[tracking] patient-reported-medication PATCH error:", err);
      res.status(500).json({ message: "Failed to update medication" });
    }
  });

  app.delete("/api/portal/tracking/patient-reported-medication/:id", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const ok = await storage.deletePatientReportedMedication(id, patientId);
      res.json({ ok });
    } catch (err) {
      console.error("[tracking] patient-reported-medication DELETE error:", err);
      res.status(500).json({ message: "Failed to delete medication" });
    }
  });

  // ── PORTAL: Medication refill request ─────────────────────────────────
  // Patient submits a list of meds they'd like refilled (a mix of items
  // already on their chart and free-form additions). Creates a single
  // inbox notification for the clinic so the care team can review and act.
  app.post("/api/portal/refill-request", requirePortalAuth, async (req, res) => {
    try {
      const patientId = (req.session as any).portalPatientId as number;
      const patient = await storage.getPatientById(patientId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (!patient.clinicId) {
        // Refill requests must route to a real clinic; if a patient is not
        // attached to one, fail loudly so it can be triaged manually rather
        // than silently writing to clinic 0 (where no one would see it).
        return res.status(409).json({
          message: "Your account is not yet linked to a clinic. Please contact your care team directly.",
        });
      }

      const refillSchema = z.object({
        chartMedications: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
        newMedications: z.array(z.object({
          name: z.string().trim().min(1, "Medication name is required").max(200),
          dose: z.string().trim().max(100).optional().or(z.literal("")),
          frequency: z.string().trim().max(100).optional().or(z.literal("")),
        })).max(20).default([]),
        pharmacyNote: z.string().trim().max(1000).optional().or(z.literal("")),
      }).refine(
        (v) => v.chartMedications.length > 0 || v.newMedications.length > 0,
        { message: "Select at least one medication to refill" },
      );

      const parsed = refillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.issues[0]?.message || "Invalid refill request",
        });
      }
      const { chartMedications, newMedications, pharmacyNote } = parsed.data;

      // Case-insensitive de-dupe of chart selections (preserve first occurrence's casing)
      const seenChart = new Set<string>();
      const uniqueChart: string[] = [];
      for (const name of chartMedications) {
        const key = name.toLowerCase();
        if (!seenChart.has(key)) {
          seenChart.add(key);
          uniqueChart.push(name);
        }
      }

      // Case-insensitive de-dupe of new medications by name
      const seenNew = new Set<string>();
      const uniqueNew: typeof newMedications = [];
      for (const m of newMedications) {
        const key = m.name.toLowerCase();
        if (!seenNew.has(key)) {
          seenNew.add(key);
          uniqueNew.push(m);
        }
      }

      const lines: string[] = [];
      if (uniqueChart.length > 0) {
        lines.push("From chart:");
        for (const m of uniqueChart) lines.push(`  • ${m}`);
      }
      if (uniqueNew.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push("Additional / not on chart:");
        for (const m of uniqueNew) {
          const parts = [m.name];
          if (m.dose) parts.push(m.dose);
          if (m.frequency) parts.push(m.frequency);
          lines.push(`  • ${parts.join(" — ")}`);
        }
      }
      if (pharmacyNote && pharmacyNote.trim().length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push(`Note from patient: ${pharmacyNote.trim()}`);
      }

      const notif = await storage.createInboxNotification({
        clinicId: patient.clinicId,
        patientId,
        providerId: patient.primaryProviderId ?? null,
        type: "med_refill_request",
        title: `Refill request from ${patient.firstName} ${patient.lastName}`,
        message: lines.join("\n"),
        relatedEntityType: "patient",
        relatedEntityId: patientId,
        severity: "normal",
      } as any);

      res.json({ ok: true, notificationId: notif.id });
    } catch (err) {
      console.error("[portal] refill-request POST error:", err);
      res.status(500).json({ message: "Failed to submit refill request" });
    }
  });

  // ── CLINICIAN: per-patient tracking summary panel ─────────────────────
  app.get("/api/patients/:id/tracking-summary", requireAuth, async (req, res) => {
    try {
      const patientId = Number(req.params.id);
      if (!Number.isFinite(patientId)) return res.status(400).json({ message: "Invalid patient id" });
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      // Same scoped lookup as the rest of the app — refuses access if patient
      // belongs to another clinic OR has no clinic and isn't owned by this user
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      const [settings, recentCheckins, adherence, reportedMeds] = await Promise.all([
        storage.getPatientTrackingSettings(patientId),
        storage.getPatientDailyCheckins(patientId, { limit: 30 }),
        storage.getMedicationAdherence(patientId, { limit: 200 }),
        storage.listPatientReportedMedications(patientId),
      ]);
      // Summary stats
      const adherenceWindow = recentCheckins.length;
      const medsTakenCount = adherence.filter((a) => a.status === "taken").length;
      const medsSkippedCount = adherence.filter((a) => a.status === "skipped" || a.status === "missed").length;
      const adherencePct = (medsTakenCount + medsSkippedCount) > 0
        ? Math.round((medsTakenCount / (medsTakenCount + medsSkippedCount)) * 100)
        : null;
      const lastActivityAt = settings?.lastActivityAt ?? recentCheckins[0]?.updatedAt ?? null;
      res.json({
        settings: settings ?? defaultTrackingSettings(patientId),
        recentCheckins,
        adherence,
        reportedMeds,
        summary: {
          windowDays: adherenceWindow,
          adherencePct,
          totalCheckins: recentCheckins.length,
          unreviewedReportedMedCount: reportedMeds.filter((m) => !m.reviewedByProvider && m.status === "active").length,
          lastActivityAt,
        },
      });
    } catch (err) {
      console.error("[tracking] tracking-summary GET error:", err);
      res.status(500).json({ message: "Failed to load tracking summary" });
    }
  });

  app.post("/api/patients/:id/patient-reported-medications/:medId/mark-reviewed", requireAuth, async (req, res) => {
    try {
      const patientId = Number(req.params.id);
      const medId = Number(req.params.medId);
      if (!Number.isFinite(patientId) || !Number.isFinite(medId)) {
        return res.status(400).json({ message: "Invalid id" });
      }
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });
      // Storage method also enforces patientId match in the WHERE clause, so a
      // medId belonging to a different patient cannot be modified.
      const updated = await storage.markPatientReportedMedReviewed(medId, patientId, clinicianId);
      if (!updated) return res.status(404).json({ message: "Medication not found" });
      res.json(updated);
    } catch (err) {
      console.error("[tracking] mark-reviewed error:", err);
      res.status(500).json({ message: "Failed to mark reviewed" });
    }
  });

  // ── Vitals Monitoring Mode: provider routes ─────────────────────────────
  // Configure a new monitoring episode for a patient.
  app.post("/api/patients/:id/vitals-monitoring", requireAuth, async (req, res) => {
    try {
      const patientId = Number(req.params.id);
      if (!Number.isFinite(patientId)) return res.status(400).json({ message: "Invalid patient id" });
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      // Validate body via insert schema
      const parsed = insertVitalsMonitoringEpisodeSchema.safeParse({
        ...req.body,
        patientId,
        clinicId,
        createdByUserId: clinicianId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid episode payload", errors: parsed.error.flatten() });
      }
      // Reject overlapping active episode (1 active per patient at a time keeps UX simple)
      const existing = await (storage as any).getActiveVitalsMonitoringEpisodeForPatient(patientId);
      if (existing) {
        return res.status(409).json({
          message: "An active vitals monitoring episode already exists for this patient. End it before starting a new one.",
          activeEpisodeId: existing.id,
        });
      }
      const episode = await (storage as any).createVitalsMonitoringEpisode({
        ...parsed.data,
        patientId,
        clinicId,
        createdByUserId: clinicianId,
      });
      res.status(201).json(episode);
    } catch (err) {
      console.error("[vitals-monitoring] create error:", err);
      res.status(500).json({ message: "Failed to create monitoring episode" });
    }
  });

  // List all monitoring episodes (active + history) for a patient.
  app.get("/api/patients/:id/vitals-monitoring", requireAuth, async (req, res) => {
    try {
      const patientId = Number(req.params.id);
      if (!Number.isFinite(patientId)) return res.status(400).json({ message: "Invalid patient id" });
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const patient = await storage.getPatient(patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Patient not found" });

      const episodes = await (storage as any).listVitalsMonitoringEpisodesForPatient(patientId);
      // Patient-logged vitals are returned per-episode below (avoids the
      // existing getPatientVitals(clinicianId)-scoped lookup which would miss
      // entries created by other clinicians in the same clinic).
      const logsPerEpisode: Record<number, any[]> = {};
      const alertsPerEpisode: Record<number, any[]> = {};
      for (const ep of episodes) {
        const [logs, alerts] = await Promise.all([
          (storage as any).listPatientLoggedVitalsForEpisode(ep.id),
          (storage as any).getVitalsMonitoringAlertsForEpisode(ep.id),
        ]);
        logsPerEpisode[ep.id] = logs;
        alertsPerEpisode[ep.id] = alerts;
      }
      res.json({ episodes, logsPerEpisode, alertsPerEpisode });
    } catch (err) {
      console.error("[vitals-monitoring] list error:", err);
      res.status(500).json({ message: "Failed to list monitoring episodes" });
    }
  });

  // End an active episode early (provider-initiated).
  app.patch("/api/vitals-monitoring/:id/end", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const clinicianId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const episode = await (storage as any).getVitalsMonitoringEpisode(id);
      if (!episode) return res.status(404).json({ message: "Episode not found" });
      // Scope: must belong to a patient this clinician can access
      const patient = await storage.getPatient(episode.patientId, clinicianId, clinicId);
      if (!patient) return res.status(404).json({ message: "Episode not found" });
      if (episode.status !== "active") {
        return res.status(409).json({ message: `Episode is already ${episode.status}` });
      }
      const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : undefined;
      const updated = await (storage as any).endVitalsMonitoringEpisode(id, {
        status: "ended_early",
        endedByUserId: clinicianId,
        reason,
      });
      res.json(updated);
    } catch (err) {
      console.error("[vitals-monitoring] end error:", err);
      res.status(500).json({ message: "Failed to end monitoring episode" });
    }
  });

  // ── Vitals Monitoring Mode: patient portal routes ───────────────────────
  // What is the patient currently being asked to log?
  app.get("/api/portal/vitals-monitoring/active", requirePortalAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      const patientId: number = sess.portalPatientId;
      const episode = await (storage as any).getActiveVitalsMonitoringEpisodeForPatient(patientId);
      if (!episode) return res.json({ episode: null });
      // Today's progress
      const today = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      const todayCount = await (storage as any).countPatientLoggedReadingsByDate(episode.id, today);
      const recent = await (storage as any).listPatientLoggedVitalsForEpisode(episode.id);
      res.json({
        episode,
        todayCount,
        todayRequired: episode.frequencyPerDay,
        recent: recent.slice(0, 14),
      });
    } catch (err) {
      console.error("[vitals-monitoring] portal active error:", err);
      res.status(500).json({ message: "Failed to load active monitoring" });
    }
  });

  // Patient submits a reading.
  app.post("/api/portal/vitals-monitoring/:id/log", requirePortalAuth, async (req, res) => {
    try {
      const sess = req.session as any;
      const patientId: number = sess.portalPatientId;
      const episodeId = Number(req.params.id);
      if (!Number.isFinite(episodeId)) return res.status(400).json({ message: "Invalid episode id" });

      const episode = await (storage as any).getVitalsMonitoringEpisode(episodeId);
      if (!episode || episode.patientId !== patientId) {
        return res.status(404).json({ message: "Episode not found" });
      }
      if (episode.status !== "active") {
        return res.status(409).json({ message: "This monitoring episode is no longer active." });
      }

      // Validate the reading with the patient-vitals insert schema
      const parsed = insertPatientVitalSchema.safeParse({
        ...req.body,
        source: "patient_logged",
        monitoringEpisodeId: episodeId,
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid reading", errors: parsed.error.flatten() });
      }
      // Server-side rule: BP must include both systolic and diastolic if requested
      const types = (episode.vitalTypes as string[]) ?? [];
      if (types.includes("blood_pressure")) {
        if (!parsed.data.systolicBp || !parsed.data.diastolicBp) {
          return res.status(400).json({ message: "Both systolic and diastolic readings are required." });
        }
      }
      if (types.includes("heart_rate") && !parsed.data.heartRate) {
        return res.status(400).json({ message: "Heart rate is required." });
      }
      if (types.includes("weight") && !parsed.data.weightLbs) {
        return res.status(400).json({ message: "Weight is required." });
      }

      // Pre-count stage-2+ readings BEFORE this one for the alert engine
      const priorLogs = await (storage as any).listPatientLoggedVitalsForEpisode(episodeId);
      const priorStage2OrSevereCount = priorLogs.filter((r: any) => {
        const sbp = Number(r.systolicBp ?? 0);
        const dbp = Number(r.diastolicBp ?? 0);
        return sbp >= 140 || dbp >= 90;
      }).length;

      // Persist the reading. clinicianId on the row = the prescribing provider
      // (so a system-internal ownership exists; user is the patient via session).
      const vital = await (storage as any).createPatientLoggedVital({
        ...parsed.data,
        patientId,
        clinicianId: episode.createdByUserId,
        monitoringEpisodeId: episodeId,
      });

      // Run alert engine for BP-only episodes
      let severeFired = false;
      let stage2PatternFired = false;
      if (types.includes("blood_pressure")) {
        const { evaluateBpReading } = await import("./vitals-monitoring-alerts");
        const decision = evaluateBpReading(
          { systolicBp: parsed.data.systolicBp ?? null, diastolicBp: parsed.data.diastolicBp ?? null },
          priorStage2OrSevereCount,
        );

        // Best-effort patient name for notification copy
        let pname = `Patient #${patientId}`;
        try {
          const p = await (storage as any).getPatientById?.(patientId);
          if (p) {
            const fn = (p.firstName ?? "").trim();
            const ln = (p.lastName ?? "").trim();
            const full = `${fn} ${ln}`.trim();
            if (full) pname = full;
          }
        } catch { /* fall through */ }

        if (decision.fireSevere) {
          const reading = `${parsed.data.systolicBp}/${parsed.data.diastolicBp} mmHg`;
          const notif = await (storage as any).createInboxNotification({
            clinicId: episode.clinicId,
            patientId,
            providerId: episode.createdByUserId,
            type: "severe_bp_reading",
            title: `Urgent BP reading from ${pname}`,
            message: `Urgent BP reading logged for ${pname}: ${reading}. Review immediately.`,
            relatedEntityType: "vital_log",
            relatedEntityId: vital.id,
            severity: "urgent",
          });
          await (storage as any).recordVitalsMonitoringAlert({
            episodeId,
            patientId,
            clinicId: episode.clinicId,
            alertType: "severe_bp_reading",
            triggerVitalId: vital.id,
            inboxNotificationId: notif?.id ?? null,
            details: { systolicBp: parsed.data.systolicBp, diastolicBp: parsed.data.diastolicBp },
          });
          severeFired = true;
        }

        if (decision.fireStage2Pattern) {
          // Dedupe — only fire once per episode
          const dup = await (storage as any).hasVitalsMonitoringAlert(episodeId, "stage_2_bp_pattern");
          if (!dup) {
            const notif = await (storage as any).createInboxNotification({
              clinicId: episode.clinicId,
              patientId,
              providerId: episode.createdByUserId,
              type: "stage_2_bp_pattern",
              title: `${pname}: multiple Stage 2 BP readings`,
              message: `${pname} has logged multiple Stage 2 blood pressure readings. Review vitals log.`,
              relatedEntityType: "monitoring_episode",
              relatedEntityId: episodeId,
              severity: "urgent",
            });
            await (storage as any).recordVitalsMonitoringAlert({
              episodeId,
              patientId,
              clinicId: episode.clinicId,
              alertType: "stage_2_bp_pattern",
              triggerVitalId: vital.id,
              inboxNotificationId: notif?.id ?? null,
              details: { count: priorStage2OrSevereCount + 1 },
            });
            stage2PatternFired = true;
          }
        }
      }

      res.status(201).json({ vital, severeFired, stage2PatternFired });
    } catch (err) {
      console.error("[vitals-monitoring] portal log error:", err);
      res.status(500).json({ message: "Failed to log reading" });
    }
  });

  // ── CLINICIAN: provider inbox notifications ───────────────────────────
  app.get("/api/clinician/inbox-notifications", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json({ notifications: [], unreadCount: 0 });
      const includeDismissed = req.query.includeDismissed === "true";
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
      const providerId = getClinicianId(req);
      const [notifications, unreadCount] = await Promise.all([
        storage.listInboxNotifications(clinicId, { providerId, includeDismissed, limit }),
        storage.countUnreadInboxNotifications(clinicId, providerId),
      ]);
      res.json({ notifications, unreadCount });
    } catch (err) {
      console.error("[inbox] list error:", err);
      res.status(500).json({ message: "Failed to load notifications" });
    }
  });

  app.get("/api/clinician/inbox-notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json({ unreadCount: 0 });
      const providerId = getClinicianId(req);
      const unreadCount = await storage.countUnreadInboxNotifications(clinicId, providerId);
      res.json({ unreadCount });
    } catch (err) {
      console.error("[inbox] unread-count error:", err);
      res.json({ unreadCount: 0 });
    }
  });

  app.patch("/api/clinician/inbox-notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const userId = getClinicianId(req);
      const row = await storage.markInboxNotificationRead(id, clinicId, userId);
      if (!row) return res.status(404).json({ message: "Notification not found" });
      res.json(row);
    } catch (err) {
      console.error("[inbox] mark-read error:", err);
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.post("/api/clinician/inbox-notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json({ updated: 0 });
      const userId = getClinicianId(req);
      const providerId = getClinicianId(req);
      const updated = await storage.markAllInboxNotificationsRead(clinicId, providerId, userId);
      res.json({ updated });
    } catch (err) {
      console.error("[inbox] mark-all-read error:", err);
      res.status(500).json({ message: "Failed to mark notifications read" });
    }
  });

  app.delete("/api/clinician/inbox-notifications/:id", requireAuth, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
      const userId = getClinicianId(req);
      const ok = await storage.dismissInboxNotification(id, clinicId, userId);
      res.json({ ok });
    } catch (err) {
      console.error("[inbox] dismiss error:", err);
      res.status(500).json({ message: "Failed to dismiss notification" });
    }
  });

  // ─── End Daily Check-In (Phase 1) ─────────────────────────────────────

  // ═══════════════════════════════════════════════════════════════════════
  // ─── Collaborating Physician Chart Review ─────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  // GET /api/chart-review/agreements — every agreement the current user
  // touches: as the mid-level (their own) and as a collaborating physician.
  app.get("/api/chart-review/agreements", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const list = await chartReviewStorage.listChartReviewAgreementsForUser(userId, clinicId);
      // Admin oversight: clinic owners/admins must be able to manage every
      // chart-review agreement in their clinic — invite collaborators, cancel
      // pending invites, upgrade reviewers — even if they aren't the
      // agreement's mid-level. We append any clinic-scoped agreements not
      // already present (tagged role:'admin') so the UI can render an admin
      // tab and reuse the same AgreementEditor surface.
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      let augmented = list;
      if (isAdmin) {
        const allClinicAgreements = await storageDb
          .select()
          .from(chartReviewAgreements)
          .where(
            and(
              eq(chartReviewAgreements.clinicId, clinicId),
              eq(chartReviewAgreements.active, true),
            ),
          );
        const seenIds = new Set(list.map((a: any) => a.id));
        const adminOnly = allClinicAgreements
          .filter((a: any) => !seenIds.has(a.id))
          .map((a: any) => ({ ...a, role: "admin" as const }));
        augmented = [...list, ...adminOnly];
      }
      res.json(augmented);
    } catch (err) {
      console.error("[chart-review] list agreements error:", err);
      res.status(500).json({ message: "Failed to list agreements" });
    }
  });

  // POST /api/chart-review/agreements — mid-level creates their own agreement.
  // Body: { primaryPhysicianUserId, reviewType?, quotaKind?, quotaValue?,
  //         quotaPeriod?, enforcementPeriod?, ruleControlledSubstance?,
  //         ruleNewDiagnosis? }
  app.post("/api/chart-review/agreements", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.status(400).json({ message: "No clinic context" });
      const body = req.body ?? {};
      const primaryPhysicianUserId = parseInt(String(body.primaryPhysicianUserId));
      if (!Number.isFinite(primaryPhysicianUserId)) {
        return res.status(400).json({ message: "primaryPhysicianUserId required" });
      }
      const existing = await chartReviewStorage.getChartReviewAgreementForMidLevel(userId, clinicId);
      if (existing) return res.status(409).json({ message: "You already have an active agreement.", agreement: existing });
      try {
        const created = await chartReviewStorage.createChartReviewAgreement({
          clinicId,
          midLevelUserId: userId,
          reviewType: body.reviewType ?? "retrospective",
          quotaKind: body.quotaKind ?? "percent",
          quotaValue: body.quotaValue ?? 20,
          quotaPeriod: body.quotaPeriod ?? "month",
          enforcementPeriod: body.enforcementPeriod ?? "quarter",
          ruleControlledSubstance: body.ruleControlledSubstance !== false,
          ruleNewDiagnosis: body.ruleNewDiagnosis !== false,
        }, { primaryPhysicianUserId });
        return res.json(created);
      } catch (innerErr: any) {
        // Friendly 400s for our explicit validation throws (different user,
        // active provider, MD/DO title); everything else falls through to the
        // outer 500.
        if (typeof innerErr?.message === "string" && innerErr.message.startsWith("Primary physician must be")) {
          return res.status(400).json({ message: innerErr.message });
        }
        throw innerErr;
      }
    } catch (err) {
      console.error("[chart-review] create agreement error:", err);
      res.status(500).json({ message: "Failed to create agreement" });
    }
  });

  // PATCH /api/chart-review/agreements/:id
  app.patch("/api/chart-review/agreements/:id", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      // Look up the agreement scoped to this caller's clinic.
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      // Determine actor role from real ownership (not from "is not a physician").
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(id, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      // Hard authz: must be the owning mid-level OR a collaborating physician
      // OR a clinic admin. Everyone else is rejected.
      if (!isMidLevelOnAgreement && !isPhysicianOnAgreement && !isAdmin) {
        return res.status(403).json({ message: "Not authorized to edit this agreement" });
      }
      const updated = await (storage as any).updateChartReviewAgreement(id, clinicId, req.body ?? {}, {
        userId,
        isMidLevel: isMidLevelOnAgreement,
        isPhysicianOnAgreement,
        isAdmin,
      });
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("[chart-review] update agreement error:", err);
      res.status(500).json({ message: "Failed to update agreement" });
    }
  });

  // POST /api/chart-review/agreements/:id/override — physician locks fields
  app.post("/api/chart-review/agreements/:id/override", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(id, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      if (!isPhysicianOnAgreement) return res.status(403).json({ message: "Only collaborating physicians can override." });
      const lockedFields = Array.isArray(req.body?.lockedFields) ? req.body.lockedFields : [];
      const updated = await chartReviewStorage.setPhysicianOverride(id, clinicId, lockedFields, userId);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err) {
      console.error("[chart-review] override error:", err);
      res.status(500).json({ message: "Failed to set override" });
    }
  });

  // GET /api/chart-review/agreements/:id/collaborators — list seated collaborators
  // and any pending external-physician invites for this agreement. The pending
  // invites are surfaced so the inviting mid-level / admin can immediately see
  // that the invite went out (the user account doesn't exist yet, so they will
  // not appear in /api/clinic/members until they accept).
  app.get("/api/chart-review/agreements/:id/collaborators", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      // Active collaborators on the agreement are visible to anyone in the clinic
      // who can already see the agreement; pending invites are restricted to
      // the agreement owner (mid-level) and clinic admins.
      const seated = await storageDb
        .select({
          id: chartReviewCollaborators.id,
          physicianUserId: chartReviewCollaborators.physicianUserId,
          role: chartReviewCollaborators.role,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: usersTable.email,
          title: usersTable.title,
          membershipScope: clinicMemberships.accessScope,
          membershipClinicalRole: clinicMemberships.clinicalRole,
        })
        .from(chartReviewCollaborators)
        .innerJoin(usersTable, eq(chartReviewCollaborators.physicianUserId, usersTable.id))
        .leftJoin(
          clinicMemberships,
          and(
            eq(clinicMemberships.userId, chartReviewCollaborators.physicianUserId),
            eq(clinicMemberships.clinicId, clinicId)
          )
        )
        .where(eq(chartReviewCollaborators.agreementId, id));
      let pending: any[] = [];
      if (isMidLevelOnAgreement || isAdmin) {
        pending = await storageDb
          .select({
            id: clinicProviderInvites.id,
            email: clinicProviderInvites.email,
            firstName: clinicProviderInvites.firstName,
            lastName: clinicProviderInvites.lastName,
            credentials: (clinicProviderInvites as any).credentials,
            accessScope: (clinicProviderInvites as any).accessScope,
            inviteExpires: clinicProviderInvites.inviteExpires,
            createdAt: clinicProviderInvites.createdAt,
          })
          .from(clinicProviderInvites)
          .where(
            and(
              eq(clinicProviderInvites.clinicId, clinicId),
              eq((clinicProviderInvites as any).agreementId, id),
              eq(clinicProviderInvites.status, "pending")
            )
          );
      }
      // The "queued items" count tells the inviter how many charts a pending
      // invitee will inherit immediately upon acceptance — answering the
      // "are pending invitees usable?" UX question without us needing a
      // schema change. (All collaborators on an agreement share its queue.)
      let queuedItemCount = 0;
      try {
        const items = await chartReviewStorage.listChartReviewItemsForAgreement(id, { clinicId });
        queuedItemCount = items.length;
      } catch {
        // Non-fatal — fall back to 0 so the badge just hides the count.
      }
      res.json({
        queuedItemCount,
        seated: seated.map((s: any) => ({
          id: s.id,
          physicianUserId: s.physicianUserId,
          role: s.role,
          displayName: `${s.title ? s.title + " " : ""}${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || s.email,
          email: s.email,
          accessScope: s.membershipScope ?? null,
          clinicalRole: s.membershipClinicalRole ?? null,
        })),
        pending: pending.map((p: any) => ({
          id: p.id,
          email: p.email,
          displayName: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email,
          credentials: p.credentials ?? null,
          accessScope: p.accessScope ?? "chart_review_only",
          inviteExpires: p.inviteExpires,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      console.error("[chart-review] list collaborators error:", err);
      res.status(500).json({ message: "Failed to list collaborators" });
    }
  });

  // POST /api/chart-review/agreements/:id/collaborators — add physician
  // Only the agreement's mid-level or a clinic admin may add collaborators.
  app.post("/api/chart-review/agreements/:id/collaborators", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const physicianUserId = parseInt(String(req.body?.physicianUserId));
      const role = (req.body?.role === "backup" ? "backup" : "primary") as "primary" | "backup";
      if (!Number.isFinite(id) || !Number.isFinite(physicianUserId) || !clinicId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      if (!isMidLevelOnAgreement && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const created = await chartReviewStorage.addChartReviewCollaborator(id, physicianUserId, role, clinicId);
      if (!created) {
        return res.status(400).json({
          message: "Collaborating physician must be a different active provider in this clinic.",
        });
      }
      res.json(created);
    } catch (err) {
      console.error("[chart-review] add collaborator error:", err);
      res.status(500).json({ message: "Failed to add collaborator" });
    }
  });

  // POST /api/chart-review/agreements/:id/external-collaborators
  // ──────────────────────────────────────────────────────────────────────────
  // Invite an OUTSIDE collaborating physician (chart-review-only). Behavior:
  //   1. If a ClinIQ user with this email already exists (identity unified by
  //      email + NPI), upsert a chart_review_only membership in this clinic
  //      and seat them on the agreement immediately. No email/invite token —
  //      they already have a login. NO Stripe seat consumed, NO providers row.
  //   2. Otherwise, create a `clinic_provider_invites` row scoped
  //      access_scope='chart_review_only' AND a placeholder membership in
  //      acceptance_status='pending_acceptance'. Send the invite email.
  //      The acceptance flow at POST /api/join-clinic/:token then activates
  //      the membership and creates the user account.
  // Only the agreement's mid-level or a clinic admin may invite.
  app.post("/api/chart-review/agreements/:id/external-collaborators", requireClinicianOnly, async (req, res) => {
    try {
      const inviter = req.user as any;
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      if (!isMidLevelOnAgreement && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { email, firstName, lastName, credentials, npi, dea, phone, role, accessScope, confirmExtraSeat } = req.body ?? {};
      if (!email || !firstName || !lastName) {
        return res.status(400).json({ message: "email, firstName, and lastName are required" });
      }
      const credUpper = String(credentials ?? "").trim().toUpperCase();
      if (credUpper !== "MD" && credUpper !== "DO") {
        return res.status(400).json({ message: "Collaborating physician must be MD or DO" });
      }
      // NPI is REQUIRED for outside collaborating physicians: it's how we
      // unify identity across clinics (email+NPI) and how we surface the right
      // signing credential on signed notes. The chart-review-only role exists
      // expressly for licensed prescribers, so demanding NPI is correct.
      if (!npi || !isValidNpi(String(npi))) {
        return res.status(400).json({ message: "NPI is required and must be a 10-digit number" });
      }
      const collaboratorRole = (role === "backup" ? "backup" : "primary") as "primary" | "backup";
      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedNpi = String(npi).trim();

      // Access scope: 'chart_review_only' (default — no Stripe seat, no providers row,
      // deny-listed workspace) or 'full' (full clinic provider, consumes a Stripe seat).
      // 'full' is admin-only and runs the same seat-confirmation path used by
      // /api/clinic/invite-provider.
      const wantsFullAccess = accessScope === "full";
      if (wantsFullAccess && !isAdmin) {
        return res.status(403).json({
          message: "Only clinic owners or admins can grant full clinic access. Choose chart-review-only, or ask an admin to invite this physician.",
        });
      }

      // Shared seat check for the 'full' branch — runs BEFORE we mutate state so
      // we can short-circuit with 402 if the caller hasn't confirmed an extra seat.
      let requiresPaidSeat = false;
      let ownerSub: any = null;
      let planState: any = null;
      if (wantsFullAccess) {
        ownerSub = await resolveClinicOwnerSubscription(clinicId);
        planState = await getClinicPlanState(clinicId, ownerSub.freeAccount, ownerSub.stripeSubscriptionId);
        if (planState.isSoloPlan) {
          return res.status(403).json({ message: "Solo plan supports only 1 provider. Upgrade to ClinIQ Suite first." });
        }
        // Match invite-provider semantics: count pending invites toward the cap so
        // we don't oversell the existing seat pool.
        const pendingInvitesRows = await storageDb
          .select({ id: clinicProviderInvites.id })
          .from(clinicProviderInvites)
          .where(and(eq(clinicProviderInvites.clinicId, clinicId), eq(clinicProviderInvites.status, "pending")));
        const effectiveCount = planState.activeProviderCount + pendingInvitesRows.length;
        requiresPaidSeat = !planState.isFreeAccount && planState.isSuitePlan && effectiveCount >= planState.maxProviders;
        if (requiresPaidSeat && !confirmExtraSeat) {
          return res.status(402).json({
            requiresSeatConfirmation: true,
            seatPrice: EXTRA_SEAT_MONTHLY_PRICE,
            currentProviders: planState.activeProviderCount,
            pendingInvites: pendingInvitesRows.length,
            maxIncluded: planState.baseProviderLimit,
            message: `Adding this physician as a full provider will add $${EXTRA_SEAT_MONTHLY_PRICE}/month to your subscription. Please confirm to proceed.`,
          });
        }
      }
      // If we're past the gate, perform the Stripe seat add now (for 'full' branch only).
      const consumeSeatIfNeeded = async () => {
        if (!wantsFullAccess || !requiresPaidSeat) return;
        const SUITE_SEAT_PRICE_ID = process.env.STRIPE_PROVIDER_SEAT_PRICE_ID;
        if (!SUITE_SEAT_PRICE_ID || !ownerSub.stripeSubscriptionId) {
          throw new Error("Provider seat billing is not configured. Contact support.");
        }
        const stripe = getStripe();
        const subscription = await stripe.subscriptions.retrieve(ownerSub.stripeSubscriptionId, { expand: ["items"] });
        const items: any[] = (subscription as any).items?.data ?? [];
        const seatItem = items.find((item: any) => item.price?.id === SUITE_SEAT_PRICE_ID);
        if (seatItem) {
          await stripe.subscriptionItems.update(seatItem.id, { quantity: (seatItem.quantity ?? 0) + 1 });
        } else {
          await stripe.subscriptionItems.create({ subscription: ownerSub.stripeSubscriptionId, price: SUITE_SEAT_PRICE_ID, quantity: 1 });
        }
        await updateClinicSeats(clinicId, (planState.extraProviderSeats ?? 0) + 1);
      };

      // ── Branch 1: existing ClinIQ user → cross-clinic linking ────────────
      const existing = await findUserForCollaboratorInvite({ email: normalizedEmail, npi: npi ?? null });
      if (existing) {
        // Title check — user must already have MD or DO on file (unified identity).
        const existingTitle = (existing.title ?? "").trim().toUpperCase();
        if (existingTitle && existingTitle !== credUpper) {
          return res.status(409).json({
            message: `An account exists for this email but its credential is "${existing.title}", not "${credUpper}". Use a different email or contact support.`,
          });
        }
        // Backfill NPI on the existing user if they don't have one yet.
        if (!existing.npi && npi) {
          await storageDb.update(usersTable).set({ npi: String(npi).trim() }).where(eq(usersTable.id, existing.id));
        }
        // Upsert membership in this clinic, honoring requested scope.
        const [existingMembership] = await storageDb.select().from(clinicMemberships)
          .where(and(eq(clinicMemberships.userId, existing.id), eq(clinicMemberships.clinicId, clinicId))).limit(1);
        if (existingMembership) {
          // If they're already a full provider here, just seat them on the agreement.
          if (existingMembership.clinicalRole === "provider") {
            const created = await chartReviewStorage.addChartReviewCollaborator(id, existing.id, collaboratorRole, clinicId);
            if (!created) {
              return res.status(409).json({
                message: "This user is already a full provider in this clinic and could not be seated on the agreement (likely already a collaborator).",
              });
            }
            return res.json({
              mode: "linked_existing_provider",
              collaborator: created,
              user: { id: existing.id, email: existing.email, firstName: existing.firstName, lastName: existing.lastName },
            });
          }
          // Promote to full if requested; otherwise (re-)apply chart-review-only.
          if (wantsFullAccess) {
            await consumeSeatIfNeeded();
            await storageDb.update(clinicMemberships).set({
              clinicalRole: "provider",
              accessScope: "full",
              acceptanceStatus: "active",
              isActive: true,
              updatedAt: new Date(),
            }).where(eq(clinicMemberships.id, existingMembership.id));
            try {
              await storageDb.insert(providersTable).values({
                clinicId,
                userId: existing.id,
                displayName: `${existing.firstName ?? ""} ${existing.lastName ?? ""}`.trim() || existing.email,
                npi: existing.npi ?? (npi ? String(npi).trim() : null),
              } as any);
            } catch (e: any) {
              if (!String(e?.message ?? "").includes("duplicate")) {
                console.warn("[external-collaborators] providers insert non-fatal:", e?.message);
              }
            }
          } else {
            await storageDb.update(clinicMemberships).set({
              clinicalRole: "external_reviewer",
              adminRole: "standard",
              accessScope: "chart_review_only",
              acceptanceStatus: "active",
              isActive: true,
              updatedAt: new Date(),
            }).where(eq(clinicMemberships.id, existingMembership.id));
          }
        } else {
          if (wantsFullAccess) {
            await consumeSeatIfNeeded();
            await storageDb.insert(clinicMemberships).values({
              clinicId,
              userId: existing.id,
              role: "provider", // legacy field
              clinicalRole: "provider",
              adminRole: "standard",
              accessScope: "full",
              acceptanceStatus: "active",
              isActive: true,
              isPrimaryClinic: false,
            } as any);
            try {
              await storageDb.insert(providersTable).values({
                clinicId,
                userId: existing.id,
                displayName: `${existing.firstName ?? ""} ${existing.lastName ?? ""}`.trim() || existing.email,
                npi: existing.npi ?? (npi ? String(npi).trim() : null),
              } as any);
            } catch (e: any) {
              if (!String(e?.message ?? "").includes("duplicate")) {
                console.warn("[external-collaborators] providers insert non-fatal:", e?.message);
              }
            }
          } else {
            await storageDb.insert(clinicMemberships).values({
              clinicId,
              userId: existing.id,
              role: "provider", // legacy field
              clinicalRole: "external_reviewer",
              adminRole: "standard",
              accessScope: "chart_review_only",
              acceptanceStatus: "active",
              isActive: true,
              isPrimaryClinic: false, // not their primary clinic
            } as any);
          }
        }
        // Seat on the agreement.
        const created = await chartReviewStorage.addChartReviewCollaborator(id, existing.id, collaboratorRole, clinicId);
        if (!created) {
          return res.status(400).json({
            message: "Could not add this physician as a collaborator (may already be on the agreement, or be the mid-level themselves).",
          });
        }
        return res.json({
          mode: "linked_existing_user",
          accessScope: wantsFullAccess ? "full" : "chart_review_only",
          collaborator: created,
          user: { id: existing.id, email: existing.email, firstName: existing.firstName, lastName: existing.lastName },
        });
      }

      // ── Identity conflict guard: NPI mismatch on existing email ───────────
      // findUserForCollaboratorInvite returns undefined either because the
      // email is brand new OR because an account exists for the email but its
      // NPI does not match the one supplied. We must distinguish those: in the
      // mismatch case we cannot let an invite proceed (the acceptance flow
      // would later collide on email and fail account creation, leaving the
      // mid-level confused and the invitee stuck).
      const [emailHolder] = await storageDb
        .select({ id: usersTable.id, email: usersTable.email, npi: usersTable.npi })
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);
      if (emailHolder) {
        // We already proved (above) that findUserForCollaboratorInvite returned
        // undefined, so reaching here means email matches but NPI does not.
        return res.status(409).json({
          message: "An account exists for this email, but the NPI on file does not match the NPI you entered. Verify the NPI for this physician (or use their existing account email).",
        });
      }

      // Also reject any other in-flight invite to the same email under this
      // agreement so we don't double-send and confuse the invitee with two
      // different tokens.
      const [duplicateInvite] = await storageDb
        .select({ id: clinicProviderInvites.id })
        .from(clinicProviderInvites)
        .where(
          and(
            eq(clinicProviderInvites.email, normalizedEmail),
            eq(clinicProviderInvites.agreementId, id),
            eq(clinicProviderInvites.status, "pending"),
          )
        )
        .limit(1);
      if (duplicateInvite) {
        return res.status(409).json({
          message: "There's already a pending invite to this email for this agreement. Cancel that invite first if you need to re-send.",
        });
      }

      // ── Branch 2: brand-new external user → invite + pending membership ──
      // Charge the seat NOW for the 'full' branch so we can't oversell, mirroring
      // /api/clinic/invite-provider semantics. The acceptance flow will create
      // the user + membership + providers row.
      if (wantsFullAccess) {
        await consumeSeatIfNeeded();
      }
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const inviteExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const invite = await storage.createClinicProviderInvite({
        clinicId,
        invitedByUserId: inviter.id,
        email: normalizedEmail,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        clinicalRole: wantsFullAccess ? "provider" : "external_reviewer",
        adminRole: "standard",
        accessScope: wantsFullAccess ? "full" : "chart_review_only",
        credentials: credUpper,
        npi: normalizedNpi,
        dea: dea ? String(dea).trim() : null,
        phone: phone ? String(phone).trim() : null,
        agreementId: id,
        inviteToken,
        inviteExpires,
        status: "pending",
      } as any);
      const clinicRows = await storageDb.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
      const clinicName = clinicRows[0]?.name || "the clinic";
      const inviterName = `${inviter.firstName ?? ""} ${inviter.lastName ?? ""}`.trim() || inviter.email;
      sendExternalCollaboratorInviteEmail(
        invite.email,
        invite.firstName,
        inviterName,
        clinicName,
        wantsFullAccess
          ? "Full clinic access (full provider seat in this clinic)"
          : "Chart-review only (you'll only see notes routed to you for sign-off)",
        inviteToken,
        req
      ).catch(err => console.error("[EMAIL] External collaborator invite failed:", err));
      logAudit(req, {
        action: "EXTERNAL_REVIEWER_INVITE_CREATED",
        resourceType: "clinic_provider_invite",
        resourceId: invite.id,
        details: {
          clinicId,
          agreementId: id,
          email: invite.email,
          accessScope: wantsFullAccess ? "full" : "chart_review_only",
          billingUpdated: requiresPaidSeat,
        },
      });
      res.status(201).json({
        mode: "invited_new_user",
        accessScope: wantsFullAccess ? "full" : "chart_review_only",
        billingUpdated: requiresPaidSeat,
        invite,
      });
    } catch (err: any) {
      console.error("[chart-review] external collaborator invite error:", err);
      res.status(500).json({ message: err?.message ?? "Failed to invite external collaborator" });
    }
  });

  // GET /api/chart-review/agreements/:id/invites
  // ──────────────────────────────────────────────────────────────────────────
  // Lists every pending external chart-review invite for this agreement so the
  // mid-level / admin can see who hasn't accepted yet, when the email went out,
  // and resend or cancel from the UI without a DB trip. Restricted to the
  // agreement's mid-level and clinic admins — the same gate the cancel/resend
  // endpoints enforce — because a non-owner physician on the agreement should
  // not be able to enumerate every pending email address.
  app.get("/api/chart-review/agreements/:id/invites", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      if (!isMidLevelOnAgreement && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const invites = await listPendingInvitesForAgreement(id, clinicId);
      res.json(
        invites.map((p) => ({
          id: p.id,
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          displayName: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || p.email,
          credentials: p.credentials ?? null,
          accessScope: p.accessScope ?? "chart_review_only",
          inviteExpires: p.inviteExpires,
          createdAt: p.createdAt,
        }))
      );
    } catch (err: any) {
      console.error("[chart-review] list invites error:", err);
      res.status(500).json({ message: "Failed to list pending invites" });
    }
  });

  // ── Shared cancel-invite logic ──────────────────────────────────────────
  // Cancelling a pending invite is exposed via both DELETE (legacy) and POST
  // /cancel paths so the frontend can pick whichever fits its mutation style.
  // Releases the reserved Stripe seat for 'full' (seat-consuming) invites.
  async function cancelExternalInvite(req: Request, res: Response): Promise<void> {
    const userId = getClinicianId(req);
    const clinicId = getEffectiveClinicId(req);
    const id = parseInt(req.params.id);
    const inviteId = parseInt(req.params.inviteId);
    if (!Number.isFinite(id) || !Number.isFinite(inviteId) || !clinicId) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
    if (!agreement) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const adminRole = await getSessionAdminRole(req);
    const isAdmin = adminRole === "owner" || adminRole === "admin";
    const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
    if (!isMidLevelOnAgreement && !isAdmin) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }
    const [invite] = await storageDb
      .select()
      .from(clinicProviderInvites)
      .where(
        and(
          eq(clinicProviderInvites.id, inviteId),
          eq(clinicProviderInvites.clinicId, clinicId),
          eq(clinicProviderInvites.agreementId, id),
        )
      )
      .limit(1);
    if (!invite || invite.status !== "pending") {
      res.status(404).json({ message: "No pending invite to cancel" });
      return;
    }
    await storage.updateClinicProviderInviteStatus(inviteId, "cancelled");
    // Release the reserved seat for 'full' invites that consumed one.
    if (invite.accessScope === "full") {
      try {
        const ownerSub = await resolveClinicOwnerSubscription(clinicId);
        const planState = await getClinicPlanState(clinicId, ownerSub.freeAccount, ownerSub.stripeSubscriptionId);
        if (!planState.isFreeAccount && planState.isSuitePlan && (planState.extraProviderSeats ?? 0) > 0) {
          const SUITE_SEAT_PRICE_ID = process.env.STRIPE_PROVIDER_SEAT_PRICE_ID;
          if (SUITE_SEAT_PRICE_ID && ownerSub.stripeSubscriptionId) {
            const stripe = getStripe();
            const subscription = await stripe.subscriptions.retrieve(ownerSub.stripeSubscriptionId, { expand: ["items"] });
            const items: any[] = (subscription as any).items?.data ?? [];
            const seatItem = items.find((item: any) => item.price?.id === SUITE_SEAT_PRICE_ID);
            if (seatItem && (seatItem.quantity ?? 0) > 0) {
              const newQty = Math.max(0, (seatItem.quantity ?? 0) - 1);
              if (newQty === 0) {
                await stripe.subscriptionItems.del(seatItem.id);
              } else {
                await stripe.subscriptionItems.update(seatItem.id, { quantity: newQty });
              }
              await updateClinicSeats(clinicId, Math.max(0, (planState.extraProviderSeats ?? 0) - 1));
            }
          }
        }
      } catch (e: any) {
        console.warn("[cancel-invite] seat release non-fatal:", e?.message ?? e);
      }
    }
    logAudit(req, {
      action: "EXTERNAL_REVIEWER_INVITE_CANCELLED",
      resourceType: "clinic_provider_invite",
      resourceId: inviteId,
      details: { clinicId, agreementId: id, email: invite.email, accessScope: invite.accessScope ?? null },
    });
    res.json({ ok: true });
  }

  // DELETE /api/chart-review/agreements/:id/invites/:inviteId
  // Cancel a pending external-physician invite. Only the agreement's mid-level
  // or a clinic admin may cancel. If the invite was a 'full' (seat-consuming)
  // invite, we release the seat we reserved at invite time.
  app.delete("/api/chart-review/agreements/:id/invites/:inviteId", requireClinicianOnly, async (req, res) => {
    try {
      await cancelExternalInvite(req, res);
    } catch (err: any) {
      console.error("[chart-review] cancel invite error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message ?? "Failed to cancel invite" });
      }
    }
  });

  // POST /api/chart-review/agreements/:id/invites/:inviteId/cancel
  // POST alias for cancel — same gate, same audit, same seat release.
  app.post("/api/chart-review/agreements/:id/invites/:inviteId/cancel", requireClinicianOnly, async (req, res) => {
    try {
      await cancelExternalInvite(req, res);
    } catch (err: any) {
      console.error("[chart-review] cancel invite error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err?.message ?? "Failed to cancel invite" });
      }
    }
  });

  // POST /api/chart-review/agreements/:id/invites/:inviteId/resend
  // ──────────────────────────────────────────────────────────────────────────
  // Re-emails the original invite token to the same address. The token itself
  // is preserved (so any link the original recipient has in their inbox keeps
  // working) but the expiration is bumped 72h forward — otherwise resending an
  // expired invite would still land on a "this link has expired" page. Same
  // mid-level / admin gate as cancel, audit-logged separately.
  app.post("/api/chart-review/agreements/:id/invites/:inviteId/resend", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const inviteId = parseInt(req.params.inviteId);
      if (!Number.isFinite(id) || !Number.isFinite(inviteId) || !clinicId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      if (!isMidLevelOnAgreement && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const [invite] = await storageDb
        .select()
        .from(clinicProviderInvites)
        .where(
          and(
            eq(clinicProviderInvites.id, inviteId),
            eq(clinicProviderInvites.clinicId, clinicId),
            eq(clinicProviderInvites.agreementId, id),
          )
        )
        .limit(1);
      if (!invite || invite.status !== "pending") {
        return res.status(404).json({ message: "No pending invite to resend" });
      }
      // Send the email FIRST. If delivery fails we leave inviteExpires
      // untouched so the panel still reflects the real (unrefreshed) state —
      // an admin can retry without the UI implying the resend "took".
      const inviter = req.user as any;
      const inviterName = `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() || inviter?.email || "your colleague";
      const clinicRows = await storageDb.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
      const clinicName = clinicRows[0]?.name || "the clinic";
      const accessScopeLabel =
        invite.accessScope === "full"
          ? "Full clinic access (full provider seat in this clinic)"
          : "Chart-review only (you'll only see notes routed to you for sign-off)";
      try {
        await sendExternalCollaboratorInviteEmail(
          invite.email,
          invite.firstName,
          inviterName,
          clinicName,
          accessScopeLabel,
          invite.inviteToken,
          req
        );
      } catch (emailErr: any) {
        console.error("[EMAIL] External collaborator invite resend failed:", emailErr);
        return res.status(502).json({ message: "Could not send the invite email. Try again in a moment." });
      }
      // Email sent successfully — only NOW bump the expiration so the resent
      // link is guaranteed to work for another 72h. Token is unchanged.
      const newExpires = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await storageDb
        .update(clinicProviderInvites)
        .set({ inviteExpires: newExpires })
        .where(eq(clinicProviderInvites.id, inviteId));
      logAudit(req, {
        action: "EXTERNAL_REVIEWER_INVITE_RESENT",
        resourceType: "clinic_provider_invite",
        resourceId: inviteId,
        details: {
          clinicId,
          agreementId: id,
          email: invite.email,
          accessScope: invite.accessScope ?? null,
          inviteExpires: newExpires,
        },
      });
      res.json({ ok: true, inviteExpires: newExpires });
    } catch (err: any) {
      console.error("[chart-review] resend invite error:", err);
      res.status(500).json({ message: err?.message ?? "Failed to resend invite" });
    }
  });

  // DELETE /api/chart-review/agreements/:id/collaborators/:cid
  // Only the agreement's mid-level or a clinic admin may remove collaborators.
  app.delete("/api/chart-review/agreements/:id/collaborators/:cid", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const cid = parseInt(req.params.cid);
      if (!Number.isFinite(id) || !Number.isFinite(cid) || !clinicId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const adminRole = await getSessionAdminRole(req);
      const isAdmin = adminRole === "owner" || adminRole === "admin";
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      if (!isMidLevelOnAgreement && !isAdmin) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const ok = await chartReviewStorage.removeChartReviewCollaborator(cid, id, clinicId);
      res.json({ ok });
    } catch (err) {
      console.error("[chart-review] remove collaborator error:", err);
      res.status(500).json({ message: "Failed to remove collaborator" });
    }
  });

  // GET /api/chart-review/queue/physician — mid-level summary cards for the
  // logged-in collaborating physician.
  app.get("/api/chart-review/queue/physician", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json([]);
      const list = await chartReviewStorage.listMidLevelsForPhysician(userId, clinicId);
      // Audit external-reviewer queue loads. We don't audit normal in-clinic
      // physician usage (they already have implicit clinic access).
      const m = await getMembership(userId, clinicId);
      if (isExternalReviewerMembership(m as any)) {
        logAudit(req, {
          action: "EXTERNAL_REVIEWER_VIEW_QUEUE",
          resourceType: "chart_review_queue",
          details: { clinicId, agreementCount: list.length },
        });
      }
      res.json(list);
    } catch (err) {
      console.error("[chart-review] physician queue error:", err);
      res.status(500).json({ message: "Failed to load queue" });
    }
  });

  // GET /api/chart-review/queue/midlevel — current user's submitted notes.
  app.get("/api/chart-review/queue/midlevel", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      if (!clinicId) return res.json({ agreement: null, items: [] });
      const agreement = await chartReviewStorage.getChartReviewAgreementForMidLevel(userId, clinicId);
      if (!agreement) return res.json({ agreement: null, items: [] });
      const items = await chartReviewStorage.listChartReviewItemsForAgreement(agreement.id, { clinicId });
      res.json({ agreement, items });
    } catch (err) {
      console.error("[chart-review] midlevel queue error:", err);
      res.status(500).json({ message: "Failed to load queue" });
    }
  });

  // GET /api/chart-review/agreements/:id/items — full queue for one agreement.
  // Used for physician's drill-in.
  app.get("/api/chart-review/agreements/:id/items", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      const agreement = await chartReviewStorage.getChartReviewAgreementById(id, clinicId);
      if (!agreement) return res.status(404).json({ message: "Not found" });
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(id, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      const isMidLevelOnAgreement = agreement.midLevelUserId === userId;
      if (!isMidLevelOnAgreement && !isPhysicianOnAgreement) {
        return res.status(403).json({ message: "Not on this agreement" });
      }
      const items = await chartReviewStorage.listChartReviewItemsForAgreement(id, { clinicId });
      res.json(items);
    } catch (err) {
      console.error("[chart-review] agreement items error:", err);
      res.status(500).json({ message: "Failed to load items" });
    }
  });

  // GET /api/chart-review/items/:id — full detail. Caller must be the mid-
  // level on the item OR a collaborating physician on the agreement.
  app.get("/api/chart-review/items/:id", requireClinicianOnly, async (req, res) => {
    try {
      const clinicId = getEffectiveClinicId(req);
      const userId = getClinicianId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      const item = await chartReviewStorage.getChartReviewItem(id, clinicId);
      if (!item) return res.status(404).json({ message: "Not found" });
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(item.agreementId, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      const isMidLevelOnItem = item.midLevelUserId === userId;
      if (!isMidLevelOnItem && !isPhysicianOnAgreement) {
        return res.status(403).json({ message: "Not on this item" });
      }
      const comments = await chartReviewStorage.listChartReviewComments(id, clinicId);
      // Pull encounter for context (server-side scoped to clinic via storage).
      const encounter = await storage.getEncounter(item.encounterId, userId, clinicId);
      // HIPAA: every chart open by an external reviewer is audited with the
      // patient ID so the inviting clinic can produce an access report.
      const m = await getMembership(userId, clinicId);
      if (isExternalReviewerMembership(m as any)) {
        logAudit(req, {
          action: "EXTERNAL_REVIEWER_VIEW_ITEM",
          resourceType: "chart_review_item",
          resourceId: id,
          patientId: encounter?.patientId ?? undefined,
          details: { clinicId, encounterId: item.encounterId, agreementId: item.agreementId },
        });
      }
      res.json({ item, comments, encounter });
    } catch (err) {
      console.error("[chart-review] item detail error:", err);
      res.status(500).json({ message: "Failed to load item" });
    }
  });

  // POST /api/chart-review/items/:id/concur
  app.post("/api/chart-review/items/:id/concur", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      const item = await chartReviewStorage.getChartReviewItem(id, clinicId);
      if (!item) return res.status(404).json({ message: "Not found" });
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(item.agreementId, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      if (!isPhysicianOnAgreement) return res.status(403).json({ message: "Only collaborating physicians can concur." });
      const updated = await chartReviewStorage.concurChartReviewItem(id, clinicId, userId, req.body?.comment);
      if (!updated) return res.status(409).json({ message: "Cannot concur (assigned to another reviewer)." });
      const m = await getMembership(userId, clinicId);
      if (isExternalReviewerMembership(m as any)) {
        logAudit(req, {
          action: "EXTERNAL_REVIEWER_SIGN",
          resourceType: "chart_review_item",
          resourceId: id,
          details: { clinicId, encounterId: item.encounterId },
        });
      }
      res.json(updated);
    } catch (err) {
      console.error("[chart-review] concur error:", err);
      res.status(500).json({ message: "Failed to concur" });
    }
  });

  // POST /api/chart-review/items/:id/reject
  app.post("/api/chart-review/items/:id/reject", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const reason = String(req.body?.reason ?? "").trim();
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      if (!reason) return res.status(400).json({ message: "A rejection reason is required." });
      const item = await chartReviewStorage.getChartReviewItem(id, clinicId);
      if (!item) return res.status(404).json({ message: "Not found" });
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(item.agreementId, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      if (!isPhysicianOnAgreement) return res.status(403).json({ message: "Only collaborating physicians can reject." });
      const updated = await chartReviewStorage.rejectChartReviewItem(id, clinicId, userId, reason);
      if (!updated) return res.status(409).json({ message: "Cannot reject (assigned to another reviewer)." });
      const m = await getMembership(userId, clinicId);
      if (isExternalReviewerMembership(m as any)) {
        logAudit(req, {
          action: "EXTERNAL_REVIEWER_REJECT",
          resourceType: "chart_review_item",
          resourceId: id,
          details: { clinicId, encounterId: item.encounterId, reason },
        });
      }
      res.json(updated);
    } catch (err) {
      console.error("[chart-review] reject error:", err);
      res.status(500).json({ message: "Failed to reject" });
    }
  });

  // POST /api/chart-review/items/:id/comments — two-way thread
  app.post("/api/chart-review/items/:id/comments", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const id = parseInt(req.params.id);
      const body = String(req.body?.body ?? "").trim();
      if (!Number.isFinite(id) || !clinicId) return res.status(400).json({ message: "Invalid request" });
      if (!body) return res.status(400).json({ message: "Comment body required" });
      const item = await chartReviewStorage.getChartReviewItem(id, clinicId);
      if (!item) return res.status(404).json({ message: "Not found" });
      const collaborators = await chartReviewStorage.listChartReviewCollaborators(item.agreementId, clinicId);
      const isPhysicianOnAgreement = collaborators.some((c: any) => c.physicianUserId === userId);
      const isMidLevel = item.midLevelUserId === userId;
      if (!isPhysicianOnAgreement && !isMidLevel) {
        return res.status(403).json({ message: "Not on this agreement" });
      }
      const created = await chartReviewStorage.addChartReviewComment({
        itemId: id,
        authorUserId: userId,
        authorRole: isPhysicianOnAgreement ? "physician" : "midlevel",
        body,
        type: "comment",
      }, clinicId);
      if (!created) return res.status(404).json({ message: "Not found" });
      res.json(created);
    } catch (err) {
      console.error("[chart-review] add comment error:", err);
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  // GET /api/chart-review/preview-flags?encounterId=N — pre-sign preview.
  app.get("/api/chart-review/preview-flags", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const encounterId = parseInt(String(req.query.encounterId));
      if (!Number.isFinite(encounterId) || !clinicId) {
        return res.json({ hasAgreement: false, wouldBeMandatory: false, mandatoryReasons: [], runningPeriodPct: 0, quotaTargetPct: 0 });
      }
      const result = await chartReviewStorage.previewChartReviewFlags({ encounterId, midLevelUserId: userId, clinicId });
      res.json(result);
    } catch (err) {
      console.error("[chart-review] preview flags error:", err);
      res.status(500).json({ message: "Failed to compute flags" });
    }
  });

  // POST /api/chart-review/flag — mid-level manually adds an already-signed
  // encounter to their review queue (useful for "I want a second set of eyes").
  // Only the encounter's signing clinician (mid-level) may flag it.
  app.post("/api/chart-review/flag", requireClinicianOnly, async (req, res) => {
    try {
      const userId = getClinicianId(req);
      const clinicId = getEffectiveClinicId(req);
      const encounterId = parseInt(String(req.body?.encounterId));
      if (!Number.isFinite(encounterId) || !clinicId) {
        return res.status(400).json({ message: "encounterId required" });
      }
      const item = await chartReviewStorage.flagChartForReview({
        encounterId, midLevelUserId: userId, clinicId,
      });
      if (!item) {
        return res.status(404).json({ message: "Cannot flag this chart (no agreement, not signed, or not your encounter)" });
      }
      res.json(item);
    } catch (err) {
      console.error("[chart-review] flag error:", err);
      res.status(500).json({ message: "Failed to flag chart" });
    }
  });

  // ─── End Chart Review ─────────────────────────────────────────────────

  const httpServer = createServer(app);
  return httpServer;
}
