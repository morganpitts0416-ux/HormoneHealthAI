import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { db } from "./storage";

export const AUTHORIZATION_FLAG_KEYS = [
  "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ",
  "ENFORCE_CLINIC_SUBSCRIPTION_AUTHZ",
  "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
  "ENFORCE_STAFF_MEMBERSHIP_AUTHZ",
  "ENABLE_OWNER_RECOVERY_ACCESS",
  "ENABLE_GLOBAL_PATIENT_IDENTITY",
  "SHADOW_PATIENT_CLINIC_RELATIONSHIP",
  "ENFORCE_PATIENT_CLINIC_RELATIONSHIP",
  "ENABLE_CLINIC_SELECTION_DASHBOARD",
  "ENABLE_INACTIVE_CLINIC_READ_ONLY",
] as const;

export type AuthorizationFlagKey = typeof AUTHORIZATION_FLAG_KEYS[number];
export type ShadowDecision = "allow" | "deny" | "indeterminate";

export function permitsPatientClinicRelationship(
  relationship: { patientId: number; clinicId: number; relationshipStatus: string } | null | undefined,
  requestedPatientId: number,
  requestedClinicId: number,
): boolean {
  return !!relationship
    && relationship.patientId === requestedPatientId
    && relationship.clinicId === requestedClinicId
    && ["verified", "active", "read_only_historical"].includes(relationship.relationshipStatus);
}

const ENFORCEMENT_FLAGS = new Set<AuthorizationFlagKey>([
  "ENFORCE_CLINIC_SUBSCRIPTION_AUTHZ",
  "ENFORCE_STAFF_MEMBERSHIP_AUTHZ",
  "ENFORCE_PATIENT_CLINIC_RELATIONSHIP",
  "ENABLE_CLINIC_SELECTION_DASHBOARD",
  "ENABLE_INACTIVE_CLINIC_READ_ONLY",
]);

export async function listAuthorizationFlagStatus(clinicId?: number | null) {
  let rows: schema.AuthorizationFeatureFlag[] = [];
  try {
    rows = await db.select().from(schema.authorizationFeatureFlags);
  } catch {
    rows = [];
  }

  const now = new Date();
  return AUTHORIZATION_FLAG_KEYS.map((flagKey) => {
    const scoped = rows.find((r) => r.flagKey === flagKey && r.clinicId === clinicId);
    const global = rows.find((r) => r.flagKey === flagKey && r.clinicId == null);
    const row = scoped ?? global;
    const enabled = !!row?.enabled && (!row.expiresAt || row.expiresAt > now);
    return {
      flagKey,
      enabled,
      clinicId: row?.clinicId ?? null,
      expiresAt: row?.expiresAt ?? null,
      reason: row?.reason ?? null,
      enforcement: ENFORCEMENT_FLAGS.has(flagKey),
    };
  });
}

export function invalidateAuthorizationFlagCache() {
  // Retained for callers; reads are intentionally uncached so disabling a
  // shadow flag stops observation on the very next request.
}

async function proposedDecisions(req: Request): Promise<Array<{
  requiredFlag: AuthorizationFlagKey;
  policyKey: string;
  decision: ShadowDecision;
  reason: string;
  clinicId: number | null;
  actorType: string;
  actorId: number | null;
  patientId: number | null;
  relationshipId: number | null;
  evidence: Record<string, unknown>;
}>> {
  const sess = req.session as any;
  const clinicId = (sess.staffId
    ? sess.staffClinicianClinicId
    : sess.activeClinicId ?? (req.user as any)?.defaultClinicId) ?? null;

  const appendClinicStateDecision = async (
    decisions: Awaited<ReturnType<typeof proposedDecisions>>,
    actorType: string,
    actorId: number | null,
    patientId: number | null,
    resolvedClinicId: number | null,
  ) => {
    if (!resolvedClinicId) {
      decisions.push({
        requiredFlag: "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ",
        policyKey: "clinic_lifecycle_and_billing",
        decision: "indeterminate",
        reason: "NO_CLINIC_CONTEXT",
        clinicId: null,
        actorType,
        actorId,
        patientId,
        relationshipId: null,
        evidence: {},
      });
      return;
    }
    const [state] = await db
      .select({
        lifecycleState: schema.clinicLifecycleFoundation.lifecycleState,
        billingStatus: schema.clinicBillingFoundation.billingStatus,
      })
      .from(schema.clinicLifecycleFoundation)
      .leftJoin(
        schema.clinicBillingFoundation,
        eq(schema.clinicBillingFoundation.clinicId, schema.clinicLifecycleFoundation.clinicId),
      )
      .where(eq(schema.clinicLifecycleFoundation.clinicId, resolvedClinicId))
      .limit(1);
    const operational = state?.lifecycleState === "operational";
    const billingOk = state?.billingStatus === "active" || state?.billingStatus === "trialing";
    decisions.push({
      requiredFlag: "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ",
      policyKey: "clinic_lifecycle_and_billing",
      decision: !state || !state.billingStatus ? "indeterminate" : operational && billingOk ? "allow" : "deny",
      reason: !state ? "MISSING_CLINIC_FOUNDATION" : !operational ? `CLINIC_${state.lifecycleState.toUpperCase()}` : !state.billingStatus ? "MISSING_BILLING_FOUNDATION" : !billingOk ? `BILLING_${state.billingStatus.toUpperCase()}` : "CLINIC_OPERATIONAL_AND_BILLING_CURRENT",
      clinicId: resolvedClinicId,
      actorType,
      actorId,
      patientId,
      relationshipId: null,
      evidence: { lifecycleState: state?.lifecycleState ?? null, billingStatus: state?.billingStatus ?? null },
    });
  };

  if (sess.portalPatientId) {
    const patientId = Number(sess.portalPatientId);
    const [patient] = await db
      .select({ clinicId: schema.patients.clinicId })
      .from(schema.patients)
      .where(eq(schema.patients.id, patientId))
      .limit(1);
    const [account] = await db
      .select({ id: schema.patientPortalAccounts.id, isActive: schema.patientPortalAccounts.isActive })
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.patientId, patientId))
      .limit(1);
    const [relationship] = account
      ? await db
          .select({
            id: schema.patientClinicRelationships.id,
            patientId: schema.patientClinicRelationships.patientId,
            relationshipStatus: schema.patientClinicRelationships.relationshipStatus,
            clinicId: schema.patientClinicRelationships.clinicId,
          })
          .from(schema.patientPortalIdentities)
          .innerJoin(
            schema.patientClinicRelationships,
            eq(schema.patientClinicRelationships.portalIdentityId, schema.patientPortalIdentities.id),
          )
          .where(and(
            eq(schema.patientPortalIdentities.legacyPortalAccountId, account.id),
            eq(schema.patientClinicRelationships.patientId, patientId),
          ))
          .limit(1)
      : [];
    const requestedClinicId = relationship?.clinicId ?? patient?.clinicId ?? -1;
    const verified = permitsPatientClinicRelationship(relationship, patientId, requestedClinicId);
    const decisions: Awaited<ReturnType<typeof proposedDecisions>> = [{
      requiredFlag: "SHADOW_PATIENT_CLINIC_RELATIONSHIP",
      policyKey: "patient_clinic_relationship",
      decision: verified ? "allow" : "deny",
      reason: verified ? "VERIFIED_RELATIONSHIP" : "NO_VERIFIED_PATIENT_CLINIC_RELATIONSHIP",
      clinicId: relationship?.clinicId ?? patient?.clinicId ?? null,
      actorType: "patient_portal",
      actorId: account?.id ?? null,
      patientId,
      relationshipId: relationship?.id ?? null,
      evidence: { legacyPortalAccountActive: account?.isActive ?? false, relationshipStatus: relationship?.relationshipStatus ?? null },
    }];
    await appendClinicStateDecision(decisions, "patient_portal", account?.id ?? null, patientId, relationship?.clinicId ?? patient?.clinicId ?? null);
    return decisions;
  }

  if (sess.staffId) {
    const staffId = Number(sess.staffId);
    const [staff] = await db
      .select({ isActive: schema.clinicianStaff.isActive, clinicId: schema.clinicianStaff.clinicId })
      .from(schema.clinicianStaff)
      .where(eq(schema.clinicianStaff.id, staffId))
      .limit(1);
    const decisions: Awaited<ReturnType<typeof proposedDecisions>> = [{
      requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
      policyKey: "staff_membership",
      decision: staff?.isActive && staff.clinicId === clinicId ? "allow" : "deny",
      reason: !staff ? "STAFF_NOT_FOUND" : !staff.isActive ? "STAFF_INACTIVE" : staff.clinicId !== clinicId ? "STAFF_CLINIC_MISMATCH" : "ACTIVE_STAFF_ASSIGNMENT",
      clinicId,
      actorType: "staff",
      actorId: staffId,
      patientId: null,
      relationshipId: null,
      evidence: { storedClinicId: staff?.clinicId ?? null },
    }];
    await appendClinicStateDecision(decisions, "staff", staffId, null, clinicId);
    return decisions;
  }

  const userId = Number((req.user as any)?.id);
  if (!Number.isFinite(userId)) return [];
  if (!clinicId) {
    return [{
      requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
      policyKey: "clinic_membership",
      decision: "indeterminate",
      reason: "NO_CLINIC_CONTEXT",
      clinicId: null,
      actorType: "clinician",
      actorId: userId,
      patientId: null,
      relationshipId: null,
      evidence: {},
    }];
  }
  const [membership] = await db
    .select({ id: schema.clinicMemberships.id, isActive: schema.clinicMemberships.isActive })
    .from(schema.clinicMemberships)
    .where(and(eq(schema.clinicMemberships.userId, userId), eq(schema.clinicMemberships.clinicId, clinicId)))
    .limit(1);
  const [clinic] = await db
    .select({ isActive: schema.clinics.isActive })
    .from(schema.clinics)
    .where(eq(schema.clinics.id, clinicId))
    .limit(1);
  const decisions: Awaited<ReturnType<typeof proposedDecisions>> = [{
    requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
    policyKey: "clinic_membership",
    decision: membership?.isActive && clinic?.isActive ? "allow" : "deny",
    reason: !membership ? "NO_MEMBERSHIP" : !membership.isActive ? "MEMBERSHIP_INACTIVE" : !clinic ? "CLINIC_NOT_FOUND" : !clinic.isActive ? "CLINIC_INACTIVE" : "ACTIVE_MEMBERSHIP",
    clinicId,
    actorType: "clinician",
    actorId: userId,
    patientId: null,
    relationshipId: null,
    evidence: { membershipId: membership?.id ?? null, legacyClinicActive: clinic?.isActive ?? null },
  }];
  const patientMatch = req.path.match(/^\/api\/patients\/(\d+)(?:\/|$)/);
  if (patientMatch) {
    const requestedPatientId = Number(patientMatch[1]);
    const [patient] = await db
      .select({ clinicId: schema.patients.clinicId })
      .from(schema.patients)
      .where(eq(schema.patients.id, requestedPatientId))
      .limit(1);
    decisions.push({
      requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
      policyKey: "tenant_resource_scope",
      decision: !patient ? "deny" : patient.clinicId == null ? "indeterminate" : patient.clinicId === clinicId ? "allow" : "deny",
      reason: !patient ? "PATIENT_NOT_FOUND" : patient.clinicId == null ? "PATIENT_CLINIC_MISSING" : patient.clinicId === clinicId ? "PATIENT_CLINIC_MATCH" : "PATIENT_CLINIC_MISMATCH",
      clinicId,
      actorType: "clinician",
      actorId: userId,
      patientId: requestedPatientId,
      relationshipId: null,
      evidence: { resourceClinicId: patient?.clinicId ?? null },
    });
  }
  await appendClinicStateDecision(decisions, "clinician", userId, null, clinicId);
  return decisions;
}

function safeRoutePath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, "/:token")
    .slice(0, 500);
}

export function authorizationShadowMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api") || req.path.startsWith("/api/access-foundation")) return next();
    let decisions: Awaited<ReturnType<typeof proposedDecisions>> = [];
    try {
      const flags = await listAuthorizationFlagStatus(null);
      const enabled = new Set(flags.filter((f) => f.enabled).map((f) => f.flagKey));
      if (enabled.size) {
        decisions = (await proposedDecisions(req)).filter((decision) => enabled.has(decision.requiredFlag));
      }
    } catch {
      decisions = [];
    }
    if (!decisions.length) return next();

    const requestId = String(req.headers["x-request-id"] ?? crypto.randomUUID());
    res.on("finish", () => {
      const currentDecision: ShadowDecision =
        res.statusCode >= 200 && res.statusCode < 400 ? "allow"
        : res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404 ? "deny"
        : "indeterminate";
      for (const proposed of decisions) {
        const differenceType =
          proposed.decision === "indeterminate" || currentDecision === "indeterminate" ? "missing_evidence"
          : currentDecision === proposed.decision && currentDecision === "allow" ? "expected_allow"
          : currentDecision === proposed.decision && currentDecision === "deny" ? "expected_denial"
          : currentDecision === "allow" ? "unexpected_denial"
          : "unexpected_grant";
        db.insert(schema.authorizationShadowDecisions).values({
          requestId,
          actorType: proposed.actorType,
          actorId: proposed.actorId,
          clinicId: proposed.clinicId,
          patientId: proposed.patientId,
          relationshipId: proposed.relationshipId,
          method: req.method,
          routePath: safeRoutePath(req.path),
          policyKey: proposed.policyKey,
          currentDecision,
          proposedDecision: proposed.decision,
          differenceType,
          currentReason: `HTTP_${res.statusCode}`,
          proposedReason: proposed.reason,
          evidence: proposed.evidence,
        }).catch((err) => console.warn("[auth-shadow] write failed:", err?.message ?? err));
      }
    });
    next();
  };
}