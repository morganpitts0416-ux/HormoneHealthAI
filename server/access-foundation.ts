import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { db } from "./storage";
import {
  createClinicAccessResolver,
  type ClinicAccessActor,
  type ClinicRouteContext,
} from "./clinic-access-resolver";
import { clinicAccessRouteClassification } from "./clinic-access-shadow";

export { combineLegacyAndProposedDecision } from "./clinic-access-resolver";

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
  "patient_portal_invite_linking_v1",
  "patient_portal_intake_only_scope_v1",
  "patient_portal_identity_synthetic_auth_v1",
  "patient_portal_relationship_shadow_v1",
  "SHADOW_PATIENT_IDENTITY_LOGIN",
  "PATIENT_PORTAL_IDENTITY_APPLY_V1",
  // Family-specific enforcement gates.  They are intentionally absent from
  // existing installations until explicitly approved and therefore default
  // off through listAuthorizationFlagStatus().
  "SHADOW_ORDINARY_CLINIC_ACCESS_AUTHZ",
  "ENFORCE_ORDINARY_CLINIC_ACCESS_AUTHZ",
  "SHADOW_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ",
  "ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ",
  "SHADOW_JOBS_WORKFLOWS_AUTHZ",
  "ENFORCE_JOBS_WORKFLOWS_AUTHZ",
  "SHADOW_OWNER_ADMIN_TEAM_MANAGEMENT_AUTHZ",
  "ENFORCE_OWNER_ADMIN_TEAM_MANAGEMENT_AUTHZ",
] as const;

export type AuthorizationFlagKey = typeof AUTHORIZATION_FLAG_KEYS[number];
export type ShadowDecision = "allow" | "deny" | "indeterminate";

export interface AuthorizationShadowDecision {
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
}

/**
 * The middleware only needs the small write surface below. Keeping this
 * boundary narrow allows synthetic callers to prove shadow-only behavior
 * without constructing a Drizzle connection or touching the real database.
 */
export interface AuthorizationShadowDatabase {
  insert: (table: any) => {
    values: (values: any) => unknown;
  };
}

export interface AuthorizationShadowMiddlewareDependencies {
  db?: AuthorizationShadowDatabase;
  readFlags?: typeof listAuthorizationFlagStatus;
  proposeDecisions?: (req: Request) => Promise<AuthorizationShadowDecision[]>;
}

/**
 * Development-only ordinary clinic access boundary.
 *
 * This is deliberately an exact method/path list rather than a prefix or
 * classification-based attachment.  Each entry was reviewed against its
 * handler: it requires an authenticated clinician/staff session, has no
 * patient/resource identifier, and does not belong to an excluded route
 * family.  Any expansion must add a separately audited exact entry.
 */
export const ORDINARY_CLINIC_ACCESS_ALLOWLIST = [
  { method: "GET", path: "/api/preferences/defaults" },
  { method: "GET", path: "/api/preferences/supplements" },
  { method: "POST", path: "/api/preferences/supplements" },
  { method: "GET", path: "/api/preferences/lab-ranges" },
  { method: "PUT", path: "/api/preferences/lab-ranges" },
  { method: "GET", path: "/api/note-templates" },
  { method: "POST", path: "/api/note-templates" },
  { method: "GET", path: "/api/note-phrases" },
  { method: "POST", path: "/api/note-phrases" },
] as const;

// Descriptive alias for validation/reporting consumers.
export const ORDINARY_CLINIC_ACCESS_ROUTE_ALLOWLIST = ORDINARY_CLINIC_ACCESS_ALLOWLIST;

type OrdinaryClinicAccessAllowlistEntry = (typeof ORDINARY_CLINIC_ACCESS_ALLOWLIST)[number];

const ORDINARY_CLINIC_ACCESS_EXCLUSIONS = [
  "/patients/",
  "/charts/",
  "/documents/",
  "/downloads/",
  "/labs/",
  "/encounters/",
  "/jobs/",
  "/workflows/",
  "/integrations/",
  "/billing/",
  "/cancel",
  "/admin/",
  "/staff",
  "/provider",
  "/invite",
  "/team",
  "/portal/",
  "/patient-intake/",
  "/auth/",
  "/webhooks/",
  "/bootstrap",
  "/me/active-clinic",
  "/me/memberships",
] as const;

/**
 * Handler-audit guard.  Keeping this executable makes an accidental future
 * widening fail loudly instead of silently putting an excluded family behind
 * this boundary.
 */
export function auditOrdinaryClinicAccessAllowlist(): void {
  const seen = new Set<string>();
  for (const entry of ORDINARY_CLINIC_ACCESS_ALLOWLIST) {
    if (!/^(GET|POST|PUT)$/.test(entry.method) || !entry.path.startsWith("/api/")) {
      throw new Error(`Invalid ordinary clinic access allowlist entry: ${entry.method} ${entry.path}`);
    }
    const key = `${entry.method} ${entry.path}`;
    if (seen.has(key)) throw new Error(`Duplicate ordinary clinic access allowlist entry: ${key}`);
    seen.add(key);
    if (entry.path.includes(":") || ORDINARY_CLINIC_ACCESS_EXCLUSIONS.some((part) => entry.path.includes(part))) {
      throw new Error(`Excluded route in ordinary clinic access allowlist: ${key}`);
    }
  }
}

auditOrdinaryClinicAccessAllowlist();

/**
 * A request can only become eligible for development enforcement when a
 * trusted validation harness marks the in-process Request object.  No value
 * from headers, query parameters, request bodies, or cookies is consulted.
 * A WeakSet keeps the marker out of the session and response surfaces.
 */
const syntheticValidationRequests = new WeakSet<object>();

export function establishSyntheticValidationMarker(req: Request): void {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Synthetic validation markers require NODE_ENV=development");
  }
  syntheticValidationRequests.add(req);
}

export const markSyntheticValidationRequest = establishSyntheticValidationMarker;
export const establishSyntheticValidationActorMarker = establishSyntheticValidationMarker;

export function isSyntheticValidationRequest(req: Request): boolean {
  return syntheticValidationRequests.has(req);
}

export interface OrdinaryClinicAccessMiddlewareDependencies {
  readFlags?: typeof listAuthorizationFlagStatus;
  resolve?: (req: Request, clinicId: number | null) => Promise<{
    decision: "allow" | "deny" | "indeterminate";
  }>;
}

export function ordinaryClinicAccessAllowlistedRequest(req: Request): OrdinaryClinicAccessAllowlistEntry | null {
  return ORDINARY_CLINIC_ACCESS_ALLOWLIST.find((entry) =>
    entry.method === req.method && entry.path === req.path,
  ) ?? null;
}

function serverClinicContext(req: Request): number | null {
  const sess = req.session as any;
  if (sess?.staffId) {
    return Number.isSafeInteger(Number(sess.staffClinicianClinicId)) && Number(sess.staffClinicianClinicId) > 0
      ? Number(sess.staffClinicianClinicId)
      : null;
  }
  // A default clinic is intentionally not a context for this boundary.
  return Number.isSafeInteger(Number(sess?.activeClinicId)) && Number(sess.activeClinicId) > 0
    ? Number(sess.activeClinicId)
    : null;
}

function ordinaryActor(req: Request): ClinicAccessActor | null {
  const sess = req.session as any;
  if (sess?.staffId && sess?.staffClinicianId) {
    return {
      type: "staff",
      staffId: Number(sess.staffId),
      clinicianId: Number(sess.staffClinicianId),
    };
  }
  const userId = Number((req.user as any)?.id);
  return Number.isSafeInteger(userId) && userId > 0 ? { type: "clinician", userId } : null;
}

/**
 * Development-only enforcement for the reviewed list.  It is mounted after
 * passport/session and the external-reviewer legacy deny-list, and is placed
 * after requireAuth on each allowlisted route.  Existing handler checks still
 * run after this middleware.
 */
export function ordinaryClinicAccessEnforcementMiddleware(
  dependencies: OrdinaryClinicAccessMiddlewareDependencies = {},
) {
  const readFlags = dependencies.readFlags ?? listAuthorizationFlagStatus;
  const resolve = dependencies.resolve ?? (async (req: Request, clinicId: number | null) => {
    const actor = ordinaryActor(req);
    if (!actor) return { decision: "indeterminate" as const };
    return teamClinicAccessResolver.resolve({
      actor,
      clinicId,
      route: { mode: "clinic", kind: "ordinary" },
    });
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "development") return next();
    if (!ordinaryClinicAccessAllowlistedRequest(req) || !isSyntheticValidationRequest(req)) return next();

    const clinicId = serverClinicContext(req);
    let enforcementEnabled = false;
    try {
      const flags = await readFlags(clinicId);
      enforcementEnabled = flags.some((flag) =>
        flag.flagKey === "ENFORCE_ORDINARY_CLINIC_ACCESS_AUTHZ" && flag.enabled,
      );
    } catch {
      // A failed/unreadable flag resolution preserves legacy behavior.
      return next();
    }
    if (!enforcementEnabled) return next();

    let proposed: { decision: "allow" | "deny" | "indeterminate" };
    try {
      proposed = await resolve(req, clinicId);
    } catch {
      // Resolver failure is unavailable evidence. Under an explicitly enabled
      // synthetic enforcement flag it is a sanitized denial, never a grant or
      // a silent switch to another clinic.
      return res.status(403).json({ message: "Access denied" });
    }

    // requireAuth has already passed.  This is the explicit
    // finalAllow = legacyAllow && proposedAllow rule: legacyAllow is true here
    // only because the route's existing authentication middleware called next.
    const legacyAllow = res.locals?.legacyAllow !== false;
    const proposedAllow = proposed.decision === "allow";
    const finalAllow = legacyAllow && proposedAllow;
    if (finalAllow) return next();

    // Uniform actor-level denial: do not reveal whether a clinic or membership
    // exists, and do not return resolver reason codes to the caller.
    return res.status(403).json({ message: "Access denied" });
  };
}

const teamClinicAccessResolver = createClinicAccessResolver({
  getMemberships: async (userId) => db
    .select({
      userId: schema.clinicMemberships.userId,
      clinicId: schema.clinicMemberships.clinicId,
      isActive: schema.clinicMemberships.isActive,
      acceptanceStatus: schema.clinicMemberships.acceptanceStatus,
      role: schema.clinicMemberships.role,
      adminRole: schema.clinicMemberships.adminRole,
      clinicalRole: schema.clinicMemberships.clinicalRole,
      accessScope: schema.clinicMemberships.accessScope,
    })
    .from(schema.clinicMemberships)
    .where(eq(schema.clinicMemberships.userId, userId)),
  getStaffLinks: async (staffId) => {
    const rows = await db
      .select({
        staffId: schema.clinicianStaff.id,
        clinicianId: schema.clinicianStaff.clinicianId,
        clinicId: schema.clinicianStaff.clinicId,
        isActive: schema.clinicianStaff.isActive,
      })
      .from(schema.clinicianStaff)
      .where(eq(schema.clinicianStaff.id, staffId));
    return rows.flatMap((row) => row.clinicId == null ? [] : [{
      ...row,
      clinicId: row.clinicId,
    }]);
  },
  getClinics: async (clinicId) => db
    .select({
      id: schema.clinics.id,
      isActive: schema.clinics.isActive,
    })
    .from(schema.clinics)
    .where(eq(schema.clinics.id, clinicId)),
});

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
  "ENFORCE_ORDINARY_CLINIC_ACCESS_AUTHZ",
  "ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ",
  "ENFORCE_JOBS_WORKFLOWS_AUTHZ",
  "ENFORCE_OWNER_ADMIN_TEAM_MANAGEMENT_AUTHZ",
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

async function proposedDecisions(req: Request): Promise<AuthorizationShadowDecision[]> {
  const sess = req.session as any;
  const clinicId = (sess.staffId
    ? sess.staffClinicianClinicId
    : sess.activeClinicId ?? (req.user as any)?.defaultClinicId) ?? null;
  const explicitTeamClinicId = (sess.staffId
    ? sess.staffClinicianClinicId
    : sess.activeClinicId) ?? null;
  const resolveRouteResource = async (): Promise<{
    kind: string;
    id: number;
    patientId: number | null;
    clinicId: number | null;
    resolved: boolean;
  } | null> => {
    const documentMatch = req.path.match(/^\/api\/(?:patients\/\d+\/documents|portal\/lab-documents)\/(\d+)(?:\/download)?$/);
    if (documentMatch) {
      const id = Number(documentMatch[1]);
      const [row] = await db.select({ patientId: schema.patientDocuments.patientId, clinicId: schema.patientDocuments.clinicId })
        .from(schema.patientDocuments).where(eq(schema.patientDocuments.id, id)).limit(1);
      return { kind: "document", id, patientId: row?.patientId ?? null, clinicId: row?.clinicId ?? null, resolved: !!row };
    }
    const encounterMatch = req.path.match(/^\/api\/encounters\/(\d+)(?:\/|$)/);
    if (encounterMatch) {
      const id = Number(encounterMatch[1]);
      const [row] = await db.select({ patientId: schema.clinicalEncounters.patientId, clinicId: schema.clinicalEncounters.clinicId })
        .from(schema.clinicalEncounters).where(eq(schema.clinicalEncounters.id, id)).limit(1);
      return { kind: "encounter", id, patientId: row?.patientId ?? null, clinicId: row?.clinicId ?? null, resolved: !!row && row.clinicId != null };
    }
    const workflowRunMatch = req.path.match(/^\/api\/workflow-runs\/(\d+)(?:\/|$)/);
    if (workflowRunMatch) {
      const id = Number(workflowRunMatch[1]);
      const [row] = await db.select({ patientId: schema.formWorkflowRuns.patientId, clinicId: schema.formWorkflowRuns.clinicId })
        .from(schema.formWorkflowRuns).where(eq(schema.formWorkflowRuns.id, id)).limit(1);
      return { kind: "workflow_run", id, patientId: row?.patientId ?? null, clinicId: row?.clinicId ?? null, resolved: !!row };
    }
    const patientMatch = req.path.match(/^\/api\/patients\/(\d+)(?:\/|$)/);
    if (patientMatch) {
      const id = Number(patientMatch[1]);
      const [row] = await db.select({ clinicId: schema.patients.clinicId })
        .from(schema.patients).where(eq(schema.patients.id, id)).limit(1);
      return { kind: req.path.endsWith("/active-workflows") ? "patient_workflows" : "patient", id, patientId: id, clinicId: row?.clinicId ?? null, resolved: !!row && row.clinicId != null };
    }
    if (req.path === "/api/me/active-clinic" && req.method === "POST") {
      const id = Number(req.body?.clinicId);
      if (!Number.isFinite(id)) return { kind: "clinic_switch", id: -1, patientId: null, clinicId: null, resolved: false };
      const [row] = await db.select({ id: schema.clinics.id }).from(schema.clinics).where(eq(schema.clinics.id, id)).limit(1);
      return { kind: "clinic_switch", id, patientId: null, clinicId: row?.id ?? null, resolved: !!row };
    }
    return null;
  };
  const routeResource = await resolveRouteResource();
  const teamRoute = clinicAccessRouteClassification(req.path);
  const teamRouteContext: ClinicRouteContext = {
    mode: teamRoute.mode,
    kind: routeResource?.kind === "document" && req.path.endsWith("/download")
      ? "download"
      : routeResource?.kind === "workflow_run"
        ? "job"
        : teamRoute.kind,
    ...(routeResource?.resolved && routeResource.clinicId != null
      ? { resourceClinicId: routeResource.clinicId }
      : {}),
  };

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
    if (routeResource) {
      decisions.push({
        requiredFlag: "SHADOW_PATIENT_CLINIC_RELATIONSHIP",
        policyKey: "tenant_resource_scope",
        decision: !routeResource.resolved ? "indeterminate"
          : routeResource.patientId !== patientId ? "deny"
          : routeResource.clinicId === (relationship?.clinicId ?? patient?.clinicId) ? "allow" : "deny",
        reason: !routeResource.resolved ? "MISSING_CONTEXT_RESOURCE_OWNERSHIP"
          : routeResource.patientId !== patientId ? "RESOURCE_PATIENT_MISMATCH"
          : routeResource.clinicId === (relationship?.clinicId ?? patient?.clinicId) ? "RESOURCE_CLINIC_MATCH" : "RESOURCE_CLINIC_MISMATCH",
        clinicId: relationship?.clinicId ?? patient?.clinicId ?? null,
        actorType: "patient_portal",
        actorId: account?.id ?? null,
        patientId,
        relationshipId: relationship?.id ?? null,
        evidence: { resourceKind: routeResource.kind, resourceClinicId: routeResource.clinicId, ownershipResolved: routeResource.resolved },
      });
    }
    await appendClinicStateDecision(decisions, "patient_portal", account?.id ?? null, patientId, relationship?.clinicId ?? patient?.clinicId ?? null);
    return decisions;
  }

  if (sess.staffId) {
    const staffId = Number(sess.staffId);
    const actor: ClinicAccessActor = {
      type: "staff",
      staffId,
      ...(Number.isSafeInteger(Number(sess.staffClinicianId)) && Number(sess.staffClinicianId) > 0
        ? { clinicianId: Number(sess.staffClinicianId) }
        : {}),
    };
    const membershipDecision = await teamClinicAccessResolver.resolve({
      actor,
      clinicId: explicitTeamClinicId,
      route: teamRouteContext,
    });
    const decisions: Awaited<ReturnType<typeof proposedDecisions>> = [{
      requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
      policyKey: "staff_membership",
      decision: membershipDecision.decision,
      reason: membershipDecision.reason,
      clinicId: membershipDecision.clinicId,
      actorType: "staff",
      actorId: staffId,
      patientId: null,
      relationshipId: null,
      evidence: {},
    }];
    await appendClinicStateDecision(decisions, "staff", staffId, null, clinicId);
    return decisions;
  }

  const userId = Number((req.user as any)?.id);
  if (!Number.isFinite(userId)) return [];
  const membershipDecision = await teamClinicAccessResolver.resolve({
    actor: { type: "clinician", userId },
    clinicId: explicitTeamClinicId,
    route: teamRouteContext,
  });
  const decisions: Awaited<ReturnType<typeof proposedDecisions>> = [{
    requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
    policyKey: "clinic_membership",
    decision: membershipDecision.decision,
    reason: membershipDecision.reason,
    clinicId: membershipDecision.clinicId,
    actorType: "clinician",
    actorId: userId,
    patientId: null,
    relationshipId: null,
    evidence: {},
  }];
  if (routeResource?.kind === "clinic_switch") {
    let decision: ShadowDecision;
    let reason: string;
    if (!routeResource.resolved) {
      decision = "indeterminate";
      reason = "MISSING_CONTEXT_RESOURCE_OWNERSHIP";
    } else {
      const [targetMembership] = await db.select({
        id: schema.clinicMemberships.id,
        isActive: schema.clinicMemberships.isActive,
        acceptanceStatus: schema.clinicMemberships.acceptanceStatus,
      })
        .from(schema.clinicMemberships)
        .where(and(eq(schema.clinicMemberships.userId, userId), eq(schema.clinicMemberships.clinicId, routeResource.id)))
        .limit(1);
      decision = targetMembership?.isActive && targetMembership.acceptanceStatus === "active"
        ? "allow"
        : "indeterminate";
      reason = decision === "allow"
        ? "TARGET_CLINIC_MEMBERSHIP_RESOLVED"
        : "MISSING_CONTEXT_TARGET_CLINIC_MEMBERSHIP";
    }
    decisions.push({
      requiredFlag: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
      policyKey: "tenant_resource_scope",
      decision,
      reason,
      clinicId,
      actorType: "clinician",
      actorId: userId,
      patientId: routeResource.resolved ? routeResource.patientId : null,
      relationshipId: null,
      evidence: { resourceKind: routeResource.kind, resourceClinicId: routeResource.clinicId, ownershipResolved: routeResource.resolved },
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

export function authorizationShadowMiddleware(
  dependencies: AuthorizationShadowMiddlewareDependencies = {},
) {
  const database = dependencies.db ?? db;
  const readFlags = dependencies.readFlags ?? listAuthorizationFlagStatus;
  const getProposedDecisions = dependencies.proposeDecisions ?? proposedDecisions;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api") || req.path.startsWith("/api/access-foundation")) return next();
    let decisions: AuthorizationShadowDecision[] = [];
    try {
      const flags = await readFlags(null);
      const enabled = new Set(flags.filter((f) => f.enabled).map((f) => f.flagKey));
      if (enabled.size) {
        const proposed = await getProposedDecisions(req);
        decisions = proposed.filter((decision) => enabled.has(decision.requiredFlag));
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
        const recordWriteFailure = (err: unknown) =>
          console.warn("[auth-shadow] write failed:", (err as { message?: unknown })?.message ?? err);
        try {
          void Promise.resolve(database.insert(schema.authorizationShadowDecisions).values({
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
          })).catch(recordWriteFailure);
        } catch (err) {
          recordWriteFailure(err);
        }
      }
    });
    next();
  };
}