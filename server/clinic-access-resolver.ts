/**
 * Shadow-only clinic access policy.
 *
 * This module intentionally has no storage, Express, session, or response
 * dependencies.  Callers provide a point-in-time evidence snapshot (or inject
 * readers with createClinicAccessResolver).  A result from this module is a
 * proposed decision only; it does not grant a session, change a request, or
 * write an audit record.
 */

export type ClinicAccessDecision = "allow" | "deny" | "indeterminate";

/**
 * Transitional enforcement is deliberately non-escalating.  This helper is
 * pure so callers and synthetic tests can prove the rule without constructing
 * a request, session, or database connection.
 *
 * An indeterminate proposed decision is not an authorization grant.  The
 * middleware treats that value as unavailable policy context and leaves the
 * legacy response in charge rather than calling this function.
 */
export function combineLegacyAndProposedDecision(
  legacyAllow: boolean,
  proposedDecision: ClinicAccessDecision,
): boolean {
  return legacyAllow && proposedDecision === "allow";
}

/** Explicit name for callers documenting the transitional final decision. */
export const combinedClinicAccessDecision = combineLegacyAndProposedDecision;
export const finalAuthorizationAllow = combineLegacyAndProposedDecision;

export type ClinicActorType =
  | "clinician"
  | "staff"
  | "patient_portal"
  | "integration"
  | "webhook"
  | "system"
  | "anonymous"
  | "unknown";

export type ClinicAccessReason =
  | "ACTIVE_ACCEPTED_MEMBERSHIP"
  | "ACTIVE_STAFF_LINKAGE"
  | "BASE_AUTHENTICATED"
  | "PUBLIC_ROUTE"
  | "ANONYMOUS_ACTOR"
  | "UNKNOWN_ACTOR"
  | "ACTOR_NOT_ALLOWED_FOR_CLINIC_SCOPE"
  | "ACTOR_TYPE_NOT_ALLOWED"
  | "CLINIC_CONTEXT_REQUIRED"
  | "INVALID_CLINIC_CONTEXT"
  | "CONFLICTING_CLINIC_CONTEXT"
  | "NO_ACTIVE_ACCEPTED_MEMBERSHIP"
  | "MEMBERSHIP_INACTIVE"
  | "MEMBERSHIP_PENDING_ACCEPTANCE"
  | "CLINIC_INACTIVE"
  | "STAFF_LINKAGE_NOT_FOUND"
  | "STAFF_LINKAGE_INACTIVE"
  | "STAFF_CLINIC_MISMATCH"
  | "STAFF_CLINICIAN_MISMATCH"
  | "PROVIDER_AUTHORITY_REQUIRED"
  | "MEMBERSHIP_SCOPE_RESTRICTED"
  | "RESOURCE_CLINIC_MISMATCH"
  | "RESOURCE_SCOPE_UNRESOLVED"
  | "EVIDENCE_UNAVAILABLE"
  | "AMBIGUOUS_MEMBERSHIP"
  | "AMBIGUOUS_STAFF_LINKAGE"
  | "MALFORMED_ACTOR"
  | "AUTHENTICATION_REQUIRED";

export interface ClinicianActor {
  type: "clinician";
  userId: number;
  authenticated?: boolean;
}

export interface StaffActor {
  type: "staff";
  staffId: number;
  /** The clinician account owning the staff linkage. */
  clinicianId?: number;
  authenticated?: boolean;
}

export interface PatientPortalActor {
  type: "patient_portal";
  patientId?: number;
  portalAccountId?: number;
  authenticated?: boolean;
}

export interface ServiceActor {
  type: "integration" | "webhook" | "system";
  integrationId?: string | number;
  webhookId?: string | number;
  systemId?: string | number;
  authenticated?: boolean;
}

export interface AnonymousActor {
  type: "anonymous";
  authenticated?: false;
}

export interface UnknownActor {
  type: "unknown" | string;
  authenticated?: boolean;
}

export type ClinicAccessActor =
  | ClinicianActor
  | StaffActor
  | PatientPortalActor
  | ServiceActor
  | AnonymousActor
  | UnknownActor;

export interface ClinicianMembershipEvidence {
  userId: number;
  clinicId: number;
  isActive: boolean;
  /** The schema's accepted value is exactly "active". */
  acceptanceStatus: string;
  /** Administrative and clinical roles are evidence, not tenant authority. */
  role?: string | null;
  adminRole?: string | null;
  clinicalRole?: string | null;
  accessScope?: string | null;
}

export interface StaffClinicLinkEvidence {
  staffId: number;
  clinicianId: number;
  clinicId: number;
  isActive: boolean;
}

export interface ClinicEvidence {
  id: number;
  isActive: boolean;
}

export interface ClinicAccessEvidence {
  /**
   * Presence is meaningful: [] means authoritative evidence that no row
   * exists, while omission means the caller has not supplied evidence.
   */
  memberships?: readonly ClinicianMembershipEvidence[];
  staffLinks?: readonly StaffClinicLinkEvidence[];
  clinics?: readonly ClinicEvidence[];
}

export type ClinicRouteMode = "clinic" | "base-auth-only" | "public";

export interface ClinicRouteContext {
  mode?: ClinicRouteMode;
  /** Explicit route target. Session/default clinic values are not accepted. */
  clinicId?: number | null;
  /** Resource ownership resolved by the route's query (for downloads/jobs). */
  resourceClinicId?: number | null;
  kind?: "ordinary" | "download" | "job" | "chart-review" | string;
  requireProviderAuthority?: boolean;
}

export interface ClinicAccessRequest {
  actor: ClinicAccessActor;
  /**
   * Explicit target clinic. This is the only top-level clinic context used.
   * `requestedClinicId` is accepted as a clearer alias.
   */
  clinicId?: number | null;
  requestedClinicId?: number | null;
  route?: ClinicRouteContext;
  /** Shorthand for route.mode = "base-auth-only". */
  baseAuthOnly?: boolean;
  evidence?: ClinicAccessEvidence;
  // Deliberately ignored compatibility/session fields.  They make it harder
  // to accidentally reintroduce defaultClinicId or stale session fallback.
  defaultClinicId?: number | null;
  sessionClinicId?: number | null;
}

export interface ClinicAccessResult {
  decision: ClinicAccessDecision;
  actorType: ClinicActorType;
  clinicId: number | null;
  reason: ClinicAccessReason;
}

export interface ClinicAccessReaders {
  getMemberships(userId: number): readonly ClinicianMembershipEvidence[] | Promise<readonly ClinicianMembershipEvidence[]>;
  getStaffLinks(staffId: number): readonly StaffClinicLinkEvidence[] | Promise<readonly StaffClinicLinkEvidence[]>;
  getClinics?(clinicId: number): readonly ClinicEvidence[] | Promise<readonly ClinicEvidence[]>;
}

const CLINIC_ACTOR_TYPES = new Set<ClinicActorType>(["clinician", "staff"]);
const SERVICE_ACTOR_TYPES = new Set<ClinicActorType>(["patient_portal", "integration", "webhook", "system"]);

function result(
  decision: ClinicAccessDecision,
  actorType: ClinicActorType,
  clinicId: number | null,
  reason: ClinicAccessReason,
): ClinicAccessResult {
  return { decision, actorType, clinicId, reason };
}

function finitePositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function actorType(actor: ClinicAccessActor | null | undefined): ClinicActorType {
  const type = (actor as { type?: unknown } | null | undefined)?.type;
  if (typeof type !== "string") return "unknown";
  return ([
    "clinician",
    "staff",
    "patient_portal",
    "integration",
    "webhook",
    "system",
    "anonymous",
  ] as string[]).includes(type) ? type as ClinicActorType : "unknown";
}

function routeMode(request: ClinicAccessRequest): ClinicRouteMode {
  if (request.baseAuthOnly === true || request.route?.mode === "base-auth-only") return "base-auth-only";
  return request.route?.mode ?? "clinic";
}

function explicitClinicId(request: ClinicAccessRequest): number | null | "conflict" | "invalid" {
  const topLevel = request.clinicId;
  const alias = request.requestedClinicId;
  const route = request.route?.clinicId;
  const supplied = [topLevel, alias, route].filter((id) => id !== undefined);
  if (supplied.some((id) => id !== null && typeof id !== "number")) return "invalid";
  const values = supplied.filter((id): id is number => id !== null);
  if (supplied.some((id) => id === null) && values.length) return "conflict";
  if (new Set(values).size > 1) return "conflict";
  if (!values.length) return null;
  return values[0];
}

function authenticated(actor: ClinicAccessActor, type: ClinicActorType): boolean {
  if (type === "anonymous") return false;
  if (type === "unknown") return false;
  if (actor.authenticated === false) return false;
  // Typed actors with an identity are authenticated by construction unless a
  // caller explicitly marks the evidence as unauthenticated.
  return true;
}

/**
 * Resolve a synthetic evidence snapshot. This is the pure core used by both
 * the synchronous unit-test-friendly API and the dependency-injected API.
 */
export function resolveClinicAccess(
  request: ClinicAccessRequest,
  suppliedEvidence?: ClinicAccessEvidence,
): ClinicAccessResult {
  const type = actorType(request?.actor);
  const clinic = explicitClinicId(request);
  const requestedClinicId = clinic === "conflict" || clinic === "invalid" ? null : clinic;
  const mode = routeMode(request);
  const evidence = suppliedEvidence ?? request.evidence;

  if (mode === "public") {
    return result("allow", type, requestedClinicId, "PUBLIC_ROUTE");
  }

  if (!request?.actor || type === "unknown") {
    return result("indeterminate", "unknown", requestedClinicId, "UNKNOWN_ACTOR");
  }

  if (type === "anonymous") {
    return result(
      mode === "base-auth-only" ? "deny" : "deny",
      type,
      requestedClinicId,
      mode === "base-auth-only" ? "AUTHENTICATION_REQUIRED" : "ANONYMOUS_ACTOR",
    );
  }

  if (!authenticated(request.actor, type)) {
    return result("deny", type, requestedClinicId, "AUTHENTICATION_REQUIRED");
  }

  if (mode === "base-auth-only") {
    return result("allow", type, requestedClinicId, "BASE_AUTHENTICATED");
  }

  // Portal and service identities are intentionally not interpreted as
  // clinician/staff clinic authority. Returning indeterminate preserves their
  // existing route behavior in shadow mode and prevents portal interference.
  if (SERVICE_ACTOR_TYPES.has(type)) {
    return result("indeterminate", type, requestedClinicId, "ACTOR_NOT_ALLOWED_FOR_CLINIC_SCOPE");
  }

  if (clinic === "conflict") {
    return result("indeterminate", type, null, "CONFLICTING_CLINIC_CONTEXT");
  }
  if (clinic === "invalid") {
    return result("indeterminate", type, null, "INVALID_CLINIC_CONTEXT");
  }
  if (requestedClinicId === null) {
    return result("indeterminate", type, null, "CLINIC_CONTEXT_REQUIRED");
  }
  if (!finitePositiveId(requestedClinicId)) {
    return result("indeterminate", type, null, "INVALID_CLINIC_CONTEXT");
  }
  if (!evidence) {
    return result("indeterminate", type, requestedClinicId, "EVIDENCE_UNAVAILABLE");
  }

  const resourceClinicId = request.route?.resourceClinicId;
  if (resourceClinicId !== undefined && resourceClinicId !== null) {
    if (!finitePositiveId(resourceClinicId)) {
      return result("indeterminate", type, requestedClinicId, "RESOURCE_SCOPE_UNRESOLVED");
    }
    if (resourceClinicId !== requestedClinicId) {
      return result("deny", type, requestedClinicId, "RESOURCE_CLINIC_MISMATCH");
    }
  } else if (request.route?.kind === "download" || request.route?.kind === "job") {
    // Downloads/jobs must not be granted because a stale session happened to
    // carry a clinic. The route may omit resource evidence only in a
    // deliberately base-auth-only decision (handled above).
    return result("indeterminate", type, requestedClinicId, "RESOURCE_SCOPE_UNRESOLVED");
  }

  if (type === "clinician") {
    const actor = request.actor as ClinicianActor;
    if (!finitePositiveId(actor.userId)) {
      return result("indeterminate", type, requestedClinicId, "MALFORMED_ACTOR");
    }
    if (!Array.isArray(evidence.memberships)) {
      return result("indeterminate", type, requestedClinicId, "EVIDENCE_UNAVAILABLE");
    }
    const matches = evidence.memberships.filter((membership) =>
      membership.userId === actor.userId && membership.clinicId === requestedClinicId,
    );
    const activeAccepted = matches.filter((membership) =>
      membership.isActive === true && membership.acceptanceStatus === "active",
    );
    if (activeAccepted.length > 1) {
      return result("indeterminate", type, requestedClinicId, "AMBIGUOUS_MEMBERSHIP");
    }
    if (!activeAccepted.length) {
      if (matches.some((membership) => membership.isActive === true && membership.acceptanceStatus !== "active")) {
        return result("deny", type, requestedClinicId, "MEMBERSHIP_PENDING_ACCEPTANCE");
      }
      if (matches.some((membership) => membership.isActive !== true)) {
        return result("deny", type, requestedClinicId, "MEMBERSHIP_INACTIVE");
      }
      return result("deny", type, requestedClinicId, "NO_ACTIVE_ACCEPTED_MEMBERSHIP");
    }

    const membership = activeAccepted[0];
    if (Array.isArray(evidence.clinics)) {
      const clinics = evidence.clinics.filter((candidate) => candidate.id === requestedClinicId);
      if (clinics.length > 1) return result("indeterminate", type, requestedClinicId, "EVIDENCE_UNAVAILABLE");
      if (clinics.length === 1 && clinics[0].isActive !== true) {
        return result("deny", type, requestedClinicId, "CLINIC_INACTIVE");
      }
    }
    if (request.route?.requireProviderAuthority && membership.clinicalRole !== "provider") {
      return result("deny", type, requestedClinicId, "PROVIDER_AUTHORITY_REQUIRED");
    }
    if (membership.accessScope === "chart_review_only" && request.route?.kind !== "chart-review") {
      return result("deny", type, requestedClinicId, "MEMBERSHIP_SCOPE_RESTRICTED");
    }
    return result("allow", type, requestedClinicId, "ACTIVE_ACCEPTED_MEMBERSHIP");
  }

  // The only remaining clinic actor is staff. Staff authority is the exact
  // active clinician_staff -> clinic linkage, never a default clinic or the
  // parent clinician's membership alone.
  const staff = request.actor as StaffActor;
  if (!finitePositiveId(staff.staffId)) {
    return result("indeterminate", type, requestedClinicId, "MALFORMED_ACTOR");
  }
  if (request.route?.requireProviderAuthority) {
    return result("deny", type, requestedClinicId, "PROVIDER_AUTHORITY_REQUIRED");
  }
  if (!Array.isArray(evidence.staffLinks)) {
    return result("indeterminate", type, requestedClinicId, "EVIDENCE_UNAVAILABLE");
  }
  const links = evidence.staffLinks.filter((link) =>
    link.staffId === staff.staffId && link.clinicId === requestedClinicId,
  );
  if (links.length > 1) {
    return result("indeterminate", type, requestedClinicId, "AMBIGUOUS_STAFF_LINKAGE");
  }
  if (!links.length) {
    const otherClinic = evidence.staffLinks.some((link) => link.staffId === staff.staffId);
    return result("deny", type, requestedClinicId, otherClinic ? "STAFF_CLINIC_MISMATCH" : "STAFF_LINKAGE_NOT_FOUND");
  }
  const link = links[0];
  if (staff.clinicianId !== undefined && link.clinicianId !== staff.clinicianId) {
    return result("deny", type, requestedClinicId, "STAFF_CLINICIAN_MISMATCH");
  }
  if (link.isActive !== true) {
    return result("deny", type, requestedClinicId, "STAFF_LINKAGE_INACTIVE");
  }
  return result("allow", type, requestedClinicId, "ACTIVE_STAFF_LINKAGE");
}

/**
 * Inject current readers without coupling route code to a database. Reader
 * failures become an indeterminate shadow observation and never become an
 * authorization grant.
 */
export function createClinicAccessResolver(readers: ClinicAccessReaders) {
  return {
    async resolve(request: Omit<ClinicAccessRequest, "evidence">): Promise<ClinicAccessResult> {
      const type = actorType(request?.actor);
      const clinic = explicitClinicId(request);
      const requestedClinicId = clinic === "conflict" || clinic === "invalid" ? null : clinic;
      if (routeMode(request) === "public" || routeMode(request) === "base-auth-only" ||
          !CLINIC_ACTOR_TYPES.has(type) || requestedClinicId === null) {
        return resolveClinicAccess(request);
      }
      try {
        const actor = request.actor;
        const evidence: ClinicAccessEvidence = type === "clinician"
          ? {
              memberships: await readers.getMemberships((actor as ClinicianActor).userId),
              clinics: readers.getClinics ? await readers.getClinics(requestedClinicId) : undefined,
            }
          : {
              staffLinks: await readers.getStaffLinks((actor as StaffActor).staffId),
              clinics: readers.getClinics ? await readers.getClinics(requestedClinicId) : undefined,
            };
        return resolveClinicAccess(request, evidence);
      } catch {
        return result("indeterminate", type, requestedClinicId, "EVIDENCE_UNAVAILABLE");
      }
    },
  };
}

/** Name useful to callers that prefer an explicit resolver function. */
export const resolveClinicAccessWithReaders = createClinicAccessResolver;
