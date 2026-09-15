/**
 * Read-only, pre-enforcement compatibility checks for team access.
 *
 * This module deliberately has no storage imports.  A caller supplies an
 * already read snapshot (or a function which supplies one), which makes the
 * comparison deterministic and keeps this report from becoming an
 * authorization or migration path.
 *
 * The returned values contain numeric entity IDs, counts, and reason codes
 * only.  In particular, shadow request IDs are never copied into a report.
 */

export type EntityId = number;
export type AccessDecision = "allow" | "deny" | "indeterminate";

/**
 * The only transitional enforcement operation: a proposed policy can
 * preserve a legacy grant, but can never create one.  Keep this free of
 * request/session/database dependencies so historical compatibility rows can
 * be checked in an isolated synthetic test.
 */
export function combineLegacyAndProposedDecision(
  legacyAllow: boolean,
  proposedDecision: AccessDecision,
): boolean {
  return legacyAllow && proposedDecision === "allow";
}

export const combinedAccessDecision = combineLegacyAndProposedDecision;

export const TEAM_ACCESS_COMPATIBILITY_REASON_CODES = {
  noCurrentOrDefaultClinic: "NO_CURRENT_OR_DEFAULT_CLINIC",
  currentMembershipMissing: "CURRENT_CLINIC_MEMBERSHIP_MISSING",
  defaultMembershipMissing: "DEFAULT_CLINIC_MEMBERSHIP_MISSING",
  noCoherentMembership: "NO_COHERENT_ACTIVE_CLINIC_MEMBERSHIP",
  staleDefaultClinic: "STALE_DEFAULT_CLINIC_ID",
  staleActiveClinic: "STALE_ACTIVE_CLINIC_ID",
  staffClinicianMissing: "STAFF_CLINICIAN_MISSING",
  staffClinicMissing: "STAFF_CLINIC_MISSING",
  staffClinicMembershipMissing: "STAFF_CLINIC_MEMBERSHIP_MISSING",
  staffProviderClinicMismatch: "STAFF_PROVIDER_CLINIC_MISMATCH",
  zeroOwners: "CLINIC_ZERO_OWNERS",
  multipleOwners: "CLINIC_MULTIPLE_OWNERS",
  ownerMismatch: "CLINIC_OWNER_MISMATCH",
  providerClinicMissing: "PROVIDER_CLINIC_MISSING",
  providerIdentityMissing: "PROVIDER_IDENTITY_MISSING",
  providerIdentityAmbiguous: "PROVIDER_IDENTITY_AMBIGUOUS",
  providerIdentityMissingRecord: "PROVIDER_IDENTITY_RECORD_MISSING",
  providerAuthorityMissing: "PROVIDER_AUTHORITY_MISSING",
  providerAuthorityInactive: "PROVIDER_AUTHORITY_INACTIVE",
  providerAuthorityMismatched: "PROVIDER_AUTHORITY_MISMATCH",
  staffSessionStaffMissing: "STAFF_SESSION_STAFF_MISSING",
  staffSessionStaffAmbiguous: "STAFF_SESSION_STAFF_AMBIGUOUS",
  staffSessionClinicianMismatch: "STAFF_SESSION_CLINICIAN_MISMATCH",
  staffSessionClinicMissing: "STAFF_SESSION_CLINIC_MISSING",
  staffSessionClinicMismatch: "STAFF_SESSION_CLINIC_MISMATCH",
  staffSessionClinicMembershipMissing: "STAFF_SESSION_CLINIC_MEMBERSHIP_MISSING",
  legacyAllowNewDeny: "LEGACY_ALLOW_NEW_DENY",
  legacyDenyNewAllow: "LEGACY_DENY_NEW_ALLOW",
  indeterminate: "INDETERMINATE_SHADOW_DECISION",
} as const;

export type TeamAccessReasonCode =
  (typeof TEAM_ACCESS_COMPATIBILITY_REASON_CODES)[keyof typeof TEAM_ACCESS_COMPATIBILITY_REASON_CODES];

export interface ClinicianAccessSnapshot {
  id: EntityId;
  defaultClinicId?: EntityId | null;
  /** Session/current selection observed by the snapshot producer. */
  currentClinicId?: EntityId | null;
  /** Alias accepted for snapshots taken from an active-session projection. */
  activeClinicId?: EntityId | null;
}

export interface MembershipAccessSnapshot {
  userId: EntityId;
  clinicId: EntityId;
  isActive?: boolean;
  acceptanceStatus?: string | null;
  role?: string | null;
  clinicalRole?: string | null;
  adminRole?: string | null;
}

export interface StaffAccessSnapshot {
  id: EntityId;
  clinicianId: EntityId;
  clinicId?: EntityId | null;
  isActive?: boolean;
  role?: string | null;
}

export interface ClinicAccessSnapshot {
  id: EntityId;
  ownerUserId?: EntityId | null;
  isActive?: boolean;
}

export interface ProviderAccessSnapshot {
  id: EntityId;
  clinicId?: EntityId | null;
  userId?: EntityId | null;
  staffId?: EntityId | null;
  isActive?: boolean;
}

/**
 * An authority row is optional.  When authority rows are not supplied, an
 * active provider membership is used as the compatibility authority.  If
 * rows are supplied, they are treated as an injected authority projection,
 * not fetched or inferred from a database.
 */
export interface ProviderAuthoritySnapshot {
  providerId?: EntityId | null;
  clinicId: EntityId;
  userId?: EntityId | null;
  staffId?: EntityId | null;
  isActive?: boolean;
  isAuthorized?: boolean;
  authorityStatus?: "authorized" | "missing" | "conflicting" | "unknown" | string;
}

export type ActiveSessionActorType = "clinician" | "staff";

/**
 * A deliberately small projection of an active session.  Session identifiers
 * and all other session fields are accepted by callers as part of a raw
 * projection, but are never copied into a report.
 */
export interface ActiveSessionAccessSnapshot {
  actorType: ActiveSessionActorType | string;
  clinicianId?: EntityId | null;
  staffId?: EntityId | null;
  staffClinicianId?: EntityId | null;
  activeClinicId?: EntityId | null;
  staffClinicId?: EntityId | null;
  sessionId?: unknown;
  count?: unknown;
}

export interface ShadowDecisionSnapshot {
  /** Numeric entity IDs are safe to report; request/session IDs are ignored. */
  entityId?: EntityId | null;
  subjectId?: EntityId | null;
  clinicId?: EntityId | null;
  /** Optional request ID is accepted only so callers can pass raw projections;
   * it is intentionally never returned. */
  requestId?: unknown;
  legacyDecision?: AccessDecision | string | boolean;
  newDecision?: AccessDecision | string | boolean;
  /** Aliases matching authorization shadow table terminology. */
  currentDecision?: AccessDecision | string | boolean;
  proposedDecision?: AccessDecision | string | boolean;
}

export interface TeamAccessSnapshots {
  clinicians?: readonly ClinicianAccessSnapshot[];
  /** `users` is accepted as a convenient alias for injected DB projections. */
  users?: readonly ClinicianAccessSnapshot[];
  memberships?: readonly MembershipAccessSnapshot[];
  clinicMemberships?: readonly MembershipAccessSnapshot[];
  staff?: readonly StaffAccessSnapshot[];
  clinicianStaff?: readonly StaffAccessSnapshot[];
  clinics?: readonly ClinicAccessSnapshot[];
  providers?: readonly ProviderAccessSnapshot[];
  authorities?: readonly ProviderAuthoritySnapshot[];
  providerAuthorities?: readonly ProviderAuthoritySnapshot[];
  providerAuthority?: readonly ProviderAuthoritySnapshot[];
  shadowDecisions?: readonly ShadowDecisionSnapshot[];
  /** Sanitized projections of currently active clinician/staff sessions. */
  activeSessionSnapshots?: readonly ActiveSessionAccessSnapshot[];
  /** Alias accepted for adapters which call the projection `activeSessions`. */
  activeSessions?: readonly ActiveSessionAccessSnapshot[];
}

export interface CompatibilityClinicianFinding {
  clinicianId: EntityId;
  clinicId?: EntityId;
  reasonCode: TeamAccessReasonCode;
}

export interface CompatibilityStaffFinding {
  staffId: EntityId;
  clinicianId?: EntityId;
  clinicId?: EntityId;
  reasonCode: TeamAccessReasonCode;
}

export interface CompatibilityClinicFinding {
  clinicId: EntityId;
  ownerUserId?: EntityId;
  reasonCode: TeamAccessReasonCode;
}

export interface CompatibilityProviderFinding {
  providerId: EntityId;
  clinicId?: EntityId;
  userId?: EntityId;
  staffId?: EntityId;
  reasonCode: TeamAccessReasonCode;
}

export interface CompatibilityShadowFinding {
  entityId?: EntityId;
  subjectId?: EntityId;
  clinicId?: EntityId;
  reasonCode: TeamAccessReasonCode;
}

export interface CompatibilityActiveSessionFinding {
  actorType: ActiveSessionActorType;
  clinicianId?: EntityId;
  staffId?: EntityId;
  staffClinicianId?: EntityId;
  activeClinicId?: EntityId;
  staffClinicId?: EntityId;
  /** Present only when identical sanitized sessions were duplicated. */
  count?: number;
  reasonCode: TeamAccessReasonCode;
}

export interface TeamAccessCompatibilityReport {
  /** These values make the non-enforcement posture explicit without data. */
  compatibilityModeAuthoritative: true;
  enforcementApproved: false;
  totals: {
    clinicians: number;
    memberships: number;
    staff: number;
    clinics: number;
    providers: number;
    shadowDecisions: number;
  };
  clinicians: readonly CompatibilityClinicianFinding[];
  staffLinkage: readonly CompatibilityStaffFinding[];
  clinicOwnership: readonly CompatibilityClinicFinding[];
  providerAuthority: readonly CompatibilityProviderFinding[];
  staleClinicIds: readonly CompatibilityClinicianFinding[];
  activeSessions: readonly CompatibilityActiveSessionFinding[];
  shadowDecisions: readonly CompatibilityShadowFinding[];
  counts: {
    clinicians: number;
    staffLinkage: number;
    clinicOwnership: number;
    providerAuthority: number;
    staleClinicIds: number;
    activeSessions: number;
    shadowDecisions: number;
    shadowCompared: number;
    shadowAgreement: number;
    byReasonCode: Readonly<Record<string, number>>;
  };
}

const R = TEAM_ACCESS_COMPATIBILITY_REASON_CODES;

function numericId(value: unknown): EntityId | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function arrayOrEmpty<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function activeMembership(membership: MembershipAccessSnapshot): boolean {
  return membership.isActive === true && membership.acceptanceStatus === "active";
}

function activeClinic(clinic: ClinicAccessSnapshot | undefined): boolean {
  return !!clinic && clinic.isActive !== false;
}

function clinicianIdForCurrentClinic(clinician: ClinicianAccessSnapshot): EntityId | null | undefined {
  return clinician.currentClinicId !== undefined
    ? clinician.currentClinicId
    : clinician.activeClinicId;
}

function finding<T extends object>(
  values: T,
  reasonCode: TeamAccessReasonCode,
): T & { reasonCode: TeamAccessReasonCode } {
  return { ...values, reasonCode };
}

function hasCoherentMembership(
  clinicianId: EntityId,
  clinicId: EntityId | null | undefined,
  clinics: Map<EntityId, ClinicAccessSnapshot>,
  memberships: readonly MembershipAccessSnapshot[],
): boolean {
  if (clinicId == null || !activeClinic(clinics.get(clinicId))) return false;
  return memberships.some(
    (membership) =>
      membership.userId === clinicianId &&
      membership.clinicId === clinicId &&
      activeMembership(membership),
  );
}

/** Pure membership helper for unit tests and read-only adapters. */
export function hasCoherentActiveMembership(
  clinicianId: EntityId,
  clinicId: EntityId | null | undefined,
  snapshot: Pick<TeamAccessSnapshots, "clinics" | "memberships" | "clinicMemberships">,
): boolean {
  const clinics = arrayOrEmpty(snapshot.clinics);
  const memberships = arrayOrEmpty(snapshot.memberships ?? snapshot.clinicMemberships);
  return hasCoherentMembership(
    clinicianId,
    clinicId,
    new Map(clinics.map((clinic) => [clinic.id, clinic])),
    memberships,
  );
}

function membershipFor(
  clinicianId: EntityId,
  clinicId: EntityId,
  memberships: readonly MembershipAccessSnapshot[],
): readonly MembershipAccessSnapshot[] {
  return memberships.filter(
    (membership) =>
      membership.userId === clinicianId &&
      membership.clinicId === clinicId &&
      activeMembership(membership),
  );
}

function normalizeDecision(value: AccessDecision | string | boolean): AccessDecision {
  if (value === true || String(value).toLowerCase() === "allow") return "allow";
  if (value === false || String(value).toLowerCase() === "deny") return "deny";
  return "indeterminate";
}

export type ShadowComparisonReason =
  | TeamAccessReasonCode
  | "SHADOW_AGREEMENT_ALLOW"
  | "SHADOW_AGREEMENT_DENY";

/**
 * Purely classify one legacy/proposed decision pair.  Unknown values are
 * deliberately indeterminate rather than being coerced to allow or deny.
 */
export function compareShadowDecision(
  legacyOrSnapshot:
    | AccessDecision
    | string
    | boolean
    | Pick<ShadowDecisionSnapshot, "legacyDecision" | "newDecision" | "currentDecision" | "proposedDecision">,
  proposedDecision?: AccessDecision | string | boolean,
): ShadowComparisonReason {
  const legacy =
    typeof legacyOrSnapshot === "object"
      ? normalizeDecision(legacyOrSnapshot.legacyDecision ?? legacyOrSnapshot.currentDecision ?? "indeterminate")
      : normalizeDecision(legacyOrSnapshot);
  const proposed =
    typeof legacyOrSnapshot === "object"
      ? normalizeDecision(legacyOrSnapshot.newDecision ?? legacyOrSnapshot.proposedDecision ?? "indeterminate")
      : normalizeDecision(proposedDecision ?? "indeterminate");

  if (legacy === "indeterminate" || proposed === "indeterminate") return R.indeterminate;
  if (legacy === "allow" && proposed === "deny") return R.legacyAllowNewDeny;
  if (legacy === "deny" && proposed === "allow") return R.legacyDenyNewAllow;
  return legacy === "allow" ? "SHADOW_AGREEMENT_ALLOW" : "SHADOW_AGREEMENT_DENY";
}

/** Classify all supplied pairs without retaining request/session identifiers. */
export function compareShadowDecisions(
  decisions: readonly ShadowDecisionSnapshot[],
): readonly CompatibilityShadowFinding[] {
  return decisions
    .map((decision) => {
      const reasonCode = compareShadowDecision(decision);
      if (reasonCode === "SHADOW_AGREEMENT_ALLOW" || reasonCode === "SHADOW_AGREEMENT_DENY") {
        return undefined;
      }
      const result: CompatibilityShadowFinding = { reasonCode };
      const entityId = numericId(decision.entityId);
      const subjectId = numericId(decision.subjectId);
      const clinicId = numericId(decision.clinicId);
      if (entityId !== undefined) result.entityId = entityId;
      if (subjectId !== undefined) result.subjectId = subjectId;
      if (clinicId !== undefined) result.clinicId = clinicId;
      return result;
    })
    .filter((value): value is CompatibilityShadowFinding => value !== undefined);
}

function addReasonCounts(
  byReasonCode: Record<string, number>,
  findings: readonly { reasonCode: string }[],
): void {
  for (const item of findings) byReasonCode[item.reasonCode] = (byReasonCode[item.reasonCode] ?? 0) + 1;
}

function activeSessionActorType(value: unknown): ActiveSessionActorType | undefined {
  return value === "clinician" || value === "staff" ? value : undefined;
}

/**
 * Add one sanitized finding to a duplicate-collapsing collection.  The key
 * consists only of values that are safe to return, so a session ID can never
 * affect either the key or the finding.
 */
function addActiveSessionFinding(
  findings: Map<string, CompatibilityActiveSessionFinding & { count: number }>,
  value: Omit<CompatibilityActiveSessionFinding, "count">,
): void {
  const key = JSON.stringify(value);
  const existing = findings.get(key);
  if (existing) {
    existing.count += 1;
  } else {
    findings.set(key, { ...value, count: 1 });
  }
}

function withoutSingletonCount(
  findings: Map<string, CompatibilityActiveSessionFinding & { count: number }>,
): CompatibilityActiveSessionFinding[] {
  return Array.from(findings.values()).map((value) => {
    if (value.count === 1) {
      const { count: _count, ...withoutCount } = value;
      return withoutCount;
    }
    return value;
  });
}

/**
 * Compare sanitized active-session projections with the same read-only
 * membership/clinic projections used by the rest of the report.
 */
function compareActiveSessions(
  sessions: readonly ActiveSessionAccessSnapshot[],
  staff: readonly StaffAccessSnapshot[],
  clinics: Map<EntityId, ClinicAccessSnapshot>,
  memberships: readonly MembershipAccessSnapshot[],
): readonly CompatibilityActiveSessionFinding[] {
  const findings = new Map<string, CompatibilityActiveSessionFinding & { count: number }>();
  const staffById = new Map(staff.map((member) => [member.id, member]));

  for (const session of sessions) {
    const actorType = activeSessionActorType(session.actorType);
    if (!actorType) continue;

    if (actorType === "clinician") {
      const clinicianId = numericId(session.clinicianId);
      const activeClinicId = numericId(session.activeClinicId);
      // A projection without both numeric IDs cannot safely identify a stale
      // session and is intentionally omitted rather than echoed back.
      if (clinicianId === undefined || activeClinicId === undefined) continue;
      if (!hasCoherentMembership(clinicianId, activeClinicId, clinics, memberships)) {
        addActiveSessionFinding(findings, {
          actorType,
          clinicianId,
          activeClinicId,
          reasonCode: R.staleActiveClinic,
        });
      }
      continue;
    }

    const staffId = numericId(session.staffId);
    const suppliedStaffClinicianId = numericId(session.staffClinicianId);
    const staffClinicId = numericId(session.staffClinicId);
    // activeClinicId is accepted as a conservative input alias for adapters
    // that use one clinic field for both actor types.  Staff findings always
    // return the staff-specific field name.
    const sessionClinicId = staffClinicId ?? numericId(session.activeClinicId);
    if (staffId === undefined && suppliedStaffClinicianId === undefined) continue;

    let member = staffId === undefined ? undefined : staffById.get(staffId);
    const clinicianMatches =
      suppliedStaffClinicianId === undefined
        ? []
        : staff.filter((candidate) => candidate.clinicianId === suppliedStaffClinicianId);
    const clinicMatches =
      sessionClinicId === undefined
        ? clinicianMatches
        : clinicianMatches.filter((candidate) => candidate.clinicId === sessionClinicId);
    if (!member && staffId === undefined && clinicMatches.length === 1) {
      member = clinicMatches[0];
    }

    const base: Omit<CompatibilityActiveSessionFinding, "count" | "reasonCode"> = {
      actorType,
      ...(staffId !== undefined ? { staffId } : {}),
      ...(suppliedStaffClinicianId !== undefined
        ? { staffClinicianId: suppliedStaffClinicianId }
        : member
          ? { staffClinicianId: numericId(member.clinicianId) as EntityId }
          : {}),
      ...(sessionClinicId !== undefined ? { staffClinicId: sessionClinicId } : {}),
    };

    if (staffId !== undefined && !member) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionStaffMissing });
      continue;
    }
    if (staffId === undefined && clinicMatches.length > 1) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionStaffAmbiguous });
      continue;
    }
    if (!member) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionStaffMissing });
      continue;
    }
    if (member.isActive === false) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionStaffMissing });
      continue;
    }
    if (
      suppliedStaffClinicianId !== undefined &&
      suppliedStaffClinicianId !== numericId(member.clinicianId)
    ) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionClinicianMismatch });
      continue;
    }
    if (sessionClinicId === undefined || !activeClinic(clinics.get(sessionClinicId))) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionClinicMissing });
      continue;
    }
    if (member.clinicId !== sessionClinicId) {
      addActiveSessionFinding(findings, { ...base, reasonCode: R.staffSessionClinicMismatch });
      continue;
    }
    if (!hasCoherentMembership(member.clinicianId, sessionClinicId, clinics, memberships)) {
      addActiveSessionFinding(findings, {
        ...base,
        reasonCode: R.staffSessionClinicMembershipMissing,
      });
    }
  }

  return withoutSingletonCount(findings);
}

/**
 * Build a read-only report from dependency-injected snapshots.  This function
 * performs no I/O, writes, mutation, or authorization decision.
 */
export function buildTeamAccessCompatibilityReport(
  snapshot: TeamAccessSnapshots,
): TeamAccessCompatibilityReport {
  const clinicians = arrayOrEmpty(snapshot.clinicians ?? snapshot.users);
  const memberships = arrayOrEmpty(snapshot.memberships ?? snapshot.clinicMemberships);
  const staff = arrayOrEmpty(snapshot.staff ?? snapshot.clinicianStaff);
  const clinics = arrayOrEmpty(snapshot.clinics);
  const providers = arrayOrEmpty(snapshot.providers);
  const authorities = snapshot.authorities ?? snapshot.providerAuthorities ?? snapshot.providerAuthority;
  const shadowDecisions = arrayOrEmpty(snapshot.shadowDecisions);
  const activeSessionSnapshots = arrayOrEmpty(
    snapshot.activeSessionSnapshots ?? snapshot.activeSessions,
  );

  const clinicById = new Map(clinics.map((clinic) => [clinic.id, clinic]));
  const clinicianById = new Map(clinicians.map((clinician) => [clinician.id, clinician]));
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const activeMemberships = memberships.filter(activeMembership);

  const clinicianFindings: CompatibilityClinicianFinding[] = [];
  const staleClinicIds: CompatibilityClinicianFinding[] = [];

  for (const clinician of clinicians) {
    const currentClinicId = clinicianIdForCurrentClinic(clinician);
    const defaultClinicId = clinician.defaultClinicId;
    const currentIsCoherent = hasCoherentMembership(
      clinician.id,
      currentClinicId,
      clinicById,
      memberships,
    );
    const defaultIsCoherent = hasCoherentMembership(
      clinician.id,
      defaultClinicId,
      clinicById,
      memberships,
    );

    if (currentClinicId != null && !currentIsCoherent) {
      clinicianFindings.push(
        finding({ clinicianId: clinician.id, clinicId: currentClinicId }, R.currentMembershipMissing),
      );
      staleClinicIds.push(
        finding({ clinicianId: clinician.id, clinicId: currentClinicId }, R.staleActiveClinic),
      );
    }
    if (defaultClinicId != null && !defaultIsCoherent) {
      clinicianFindings.push(
        finding({ clinicianId: clinician.id, clinicId: defaultClinicId }, R.defaultMembershipMissing),
      );
      staleClinicIds.push(
        finding({ clinicianId: clinician.id, clinicId: defaultClinicId }, R.staleDefaultClinic),
      );
    }
    if (currentClinicId == null && defaultClinicId == null) {
      clinicianFindings.push(finding({ clinicianId: clinician.id }, R.noCurrentOrDefaultClinic));
    }
    if (!currentIsCoherent && !defaultIsCoherent) {
      clinicianFindings.push(finding({ clinicianId: clinician.id }, R.noCoherentMembership));
    }
  }

  const staffLinkage: CompatibilityStaffFinding[] = [];
  for (const member of staff) {
    if (member.isActive === false) continue;
    const clinician = clinicianById.get(member.clinicianId);
    if (!clinician) {
      staffLinkage.push(finding({ staffId: member.id, clinicianId: member.clinicianId }, R.staffClinicianMissing));
      continue;
    }
    if (member.clinicId == null || !clinicById.has(member.clinicId)) {
      staffLinkage.push(
        finding(
          { staffId: member.id, clinicianId: member.clinicianId, ...(member.clinicId != null ? { clinicId: member.clinicId } : {}) },
          R.staffClinicMissing,
        ),
      );
      continue;
    }
    if (!hasCoherentMembership(member.clinicianId, member.clinicId, clinicById, memberships)) {
      staffLinkage.push(
        finding({ staffId: member.id, clinicianId: member.clinicianId, clinicId: member.clinicId }, R.staffClinicMembershipMissing),
      );
    }
  }

  const clinicOwnership: CompatibilityClinicFinding[] = [];
  for (const clinic of clinics) {
    const ownerIds = Array.from(
      new Set(
        memberships
          .filter(
            (membership) =>
              membership.clinicId === clinic.id &&
              activeMembership(membership) &&
              (membership.adminRole === "owner" || membership.role === "owner"),
          )
          .map((membership) => membership.userId),
      ),
    );
    if (ownerIds.length === 0) {
      clinicOwnership.push(finding({ clinicId: clinic.id }, R.zeroOwners));
    }
    if (ownerIds.length > 1) {
      clinicOwnership.push(finding({ clinicId: clinic.id }, R.multipleOwners));
    }
    if (
      ownerIds.length !== 1 ||
      clinic.ownerUserId == null ||
      !clinicianById.has(clinic.ownerUserId) ||
      ownerIds[0] !== clinic.ownerUserId
    ) {
      // A zero-owner clinic with an owner pointer is both zero-owner and
      // mismatched; retaining both reason codes is safer than guessing which
      // legacy source should win.
      if (clinic.ownerUserId != null || ownerIds.length === 1) {
        clinicOwnership.push(
          finding(
            { clinicId: clinic.id, ...(clinic.ownerUserId != null ? { ownerUserId: clinic.ownerUserId } : {}) },
            R.ownerMismatch,
          ),
        );
      }
    }
  }

  const providerAuthority: CompatibilityProviderFinding[] = [];
  for (const provider of providers) {
    if (provider.isActive === false) continue;
    const base = {
      providerId: provider.id,
      ...(provider.clinicId != null ? { clinicId: provider.clinicId } : {}),
      ...(provider.userId != null ? { userId: provider.userId } : {}),
      ...(provider.staffId != null ? { staffId: provider.staffId } : {}),
    };
    if (provider.clinicId == null || !activeClinic(clinicById.get(provider.clinicId))) {
      providerAuthority.push(finding(base, R.providerClinicMissing));
      continue;
    }
    const hasUser = provider.userId != null;
    const hasStaff = provider.staffId != null;
    if (!hasUser && !hasStaff) {
      providerAuthority.push(finding(base, R.providerIdentityMissing));
      continue;
    }
    if (hasUser && hasStaff) {
      providerAuthority.push(finding(base, R.providerIdentityAmbiguous));
      continue;
    }
    const user = hasUser ? clinicianById.get(provider.userId as EntityId) : undefined;
    const staffMember = hasStaff ? staffById.get(provider.staffId as EntityId) : undefined;
    if ((hasUser && !user) || (hasStaff && !staffMember)) {
      providerAuthority.push(finding(base, R.providerIdentityMissingRecord));
      continue;
    }

    if (authorities !== undefined) {
      const matchingAuthorities = authorities.filter(
        (authority) =>
          authority.clinicId === provider.clinicId &&
          (authority.providerId === provider.id ||
            (hasUser && authority.userId === provider.userId) ||
            (hasStaff && authority.staffId === provider.staffId)),
      );
      const activeMatching = matchingAuthorities.filter((authority) => authority.isActive !== false);
      if (matchingAuthorities.length === 0) {
        providerAuthority.push(finding(base, R.providerAuthorityMissing));
      } else if (activeMatching.length === 0) {
        providerAuthority.push(finding(base, R.providerAuthorityInactive));
      } else if (
        activeMatching.length !== 1 ||
        activeMatching.some(
          (authority) =>
            authority.isAuthorized === false ||
            authority.authorityStatus === "missing" ||
            authority.authorityStatus === "conflicting" ||
            authority.authorityStatus === "unknown" ||
            (hasUser && authority.userId != null && authority.userId !== provider.userId) ||
            (hasStaff && authority.staffId != null && authority.staffId !== provider.staffId),
        )
      ) {
        providerAuthority.push(finding(base, R.providerAuthorityMismatched));
      }
      continue;
    }

    const coherent = hasUser
      ? membershipFor(provider.userId as EntityId, provider.clinicId, memberships).some(
          (membership) =>
            membership.clinicalRole !== "staff" &&
            membership.role !== "staff" &&
            membership.clinicalRole !== "unknown",
        )
      : !!staffMember &&
        staffMember.isActive !== false &&
        staffMember.clinicId === provider.clinicId &&
        (staffMember.role == null || ["provider", "rn", "nurse"].includes(staffMember.role));
    if (!coherent) providerAuthority.push(finding(base, R.providerAuthorityMissing));
  }

  // Provider-to-staff clinic links are an additional staff/clinic linkage
  // check, kept separate from provider authority so each finding is actionable.
  for (const provider of providers) {
    if (provider.isActive === false || provider.staffId == null) continue;
    const staffMember = staffById.get(provider.staffId);
    if (staffMember && staffMember.clinicId !== provider.clinicId) {
      staffLinkage.push(
        finding(
          { staffId: staffMember.id, clinicianId: staffMember.clinicianId, ...(provider.clinicId != null ? { clinicId: provider.clinicId } : {}) },
          R.staffProviderClinicMismatch,
        ),
      );
    }
  }

  const activeSessions = compareActiveSessions(
    activeSessionSnapshots,
    staff,
    clinicById,
    memberships,
  );
  const shadowFindings = compareShadowDecisions(shadowDecisions);
  const allFindings = [
    ...clinicianFindings,
    ...staffLinkage,
    ...clinicOwnership,
    ...providerAuthority,
    ...staleClinicIds,
    ...activeSessions,
    ...shadowFindings,
  ];
  const byReasonCode: Record<string, number> = {};
  addReasonCounts(byReasonCode, allFindings);
  const shadowCompared = shadowDecisions.length;
  const shadowAgreement = shadowCompared - shadowFindings.length;

  return {
    compatibilityModeAuthoritative: true,
    enforcementApproved: false,
    totals: {
      clinicians: clinicians.length,
      memberships: memberships.length,
      staff: staff.length,
      clinics: clinics.length,
      providers: providers.length,
      shadowDecisions: shadowCompared,
    },
    clinicians: clinicianFindings,
    staffLinkage,
    clinicOwnership,
    providerAuthority,
    staleClinicIds,
    activeSessions,
    shadowDecisions: shadowFindings,
    counts: {
      clinicians: clinicianFindings.length,
      staffLinkage: staffLinkage.length,
      clinicOwnership: clinicOwnership.length,
      providerAuthority: providerAuthority.length,
      staleClinicIds: staleClinicIds.length,
      activeSessions: activeSessions.length,
      shadowDecisions: shadowFindings.length,
      shadowCompared,
      shadowAgreement,
      byReasonCode,
    },
  };
}

export type TeamAccessSnapshotProvider =
  | (() => TeamAccessSnapshots)
  | (() => Promise<TeamAccessSnapshots>);

/**
 * Dependency-injected async facade for callers that obtain snapshots from
 * their own read-only adapter.  The adapter is never imported or invoked by
 * this module except when its returned report method is called.
 */
export function createTeamAccessCompatibilityReporter(dependencies: {
  getSnapshots: TeamAccessSnapshotProvider;
}): {
  report: () => Promise<TeamAccessCompatibilityReport>;
} {
  return {
    async report() {
      return buildTeamAccessCompatibilityReport(await dependencies.getSnapshots());
    },
  };
}

/** Short alias for callers that prefer a report verb. */
export const reportTeamAccessCompatibility = buildTeamAccessCompatibilityReport;
export const generateTeamAccessCompatibilityReport = buildTeamAccessCompatibilityReport;
export const compareTeamAccessSnapshots = buildTeamAccessCompatibilityReport;
