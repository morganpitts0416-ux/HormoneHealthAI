import { describe, expect, it } from "vitest";
import {
  createClinicAccessResolver,
  resolveClinicAccess,
  type ClinicAccessEvidence,
} from "../../server/clinic-access-resolver";

const membership = (overrides: Partial<NonNullable<ClinicAccessEvidence["memberships"]>[number]> = {}) => ({
  userId: 10,
  clinicId: 1,
  isActive: true,
  acceptanceStatus: "active",
  clinicalRole: "provider",
  accessScope: "full",
  ...overrides,
});

const staffLink = (overrides: Partial<NonNullable<ClinicAccessEvidence["staffLinks"]>[number]> = {}) => ({
  staffId: 20,
  clinicianId: 10,
  clinicId: 1,
  isActive: true,
  ...overrides,
});

describe("shadow-only clinic access resolver", () => {
  it("allows an exact active accepted clinician membership", () => {
    expect(resolveClinicAccess({
      actor: { type: "clinician", userId: 10 },
      clinicId: 1,
      evidence: { memberships: [membership()] },
    })).toMatchObject({ decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" });
  });

  it("allows owners and providers without treating role labels as the authority", () => {
    const owner = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 },
      clinicId: 1,
      evidence: { memberships: [membership({ adminRole: "owner", clinicalRole: "staff" })] },
    });
    const provider = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 },
      clinicId: 1,
      route: { requireProviderAuthority: true },
      evidence: { memberships: [membership({ clinicalRole: "provider" })] },
    });
    expect(owner.decision).toBe("allow");
    expect(provider.decision).toBe("allow");
  });

  it("denies pending, inactive, and absent memberships", () => {
    const pending = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      evidence: { memberships: [membership({ acceptanceStatus: "pending_acceptance" })] },
    });
    const inactive = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      evidence: { memberships: [membership({ isActive: false })] },
    });
    const absent = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1, evidence: { memberships: [] },
    });
    expect(pending).toMatchObject({ decision: "deny", reason: "MEMBERSHIP_PENDING_ACCEPTANCE" });
    expect(inactive).toMatchObject({ decision: "deny", reason: "MEMBERSHIP_INACTIVE" });
    expect(absent).toMatchObject({ decision: "deny", reason: "NO_ACTIVE_ACCEPTED_MEMBERSHIP" });
  });

  it("does not use defaultClinicId or fall back across a multi-clinic account", () => {
    const result = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 },
      clinicId: 2,
      defaultClinicId: 1,
      sessionClinicId: 1,
      evidence: { memberships: [membership()] },
    });
    expect(result).toMatchObject({ decision: "deny", clinicId: 2, reason: "NO_ACTIVE_ACCEPTED_MEMBERSHIP" });
  });

  it("does not infer a clinic when context is stale or absent", () => {
    const result = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 },
      defaultClinicId: 1,
      sessionClinicId: 1,
      evidence: { memberships: [membership()] },
    });
    expect(result).toMatchObject({ decision: "indeterminate", clinicId: null, reason: "CLINIC_CONTEXT_REQUIRED" });
  });

  it("treats conflicting explicit clinic context as indeterminate", () => {
    expect(resolveClinicAccess({
      actor: { type: "clinician", userId: 10 },
      clinicId: 1,
      requestedClinicId: 2,
      evidence: { memberships: [membership()] },
    })).toMatchObject({ decision: "indeterminate", reason: "CONFLICTING_CLINIC_CONTEXT" });
  });

  it("requires the exact active staff linkage, including parent clinician", () => {
    const allowed = resolveClinicAccess({
      actor: { type: "staff", staffId: 20, clinicianId: 10 },
      clinicId: 1,
      evidence: { staffLinks: [staffLink()] },
    });
    const wrongClinic = resolveClinicAccess({
      actor: { type: "staff", staffId: 20, clinicianId: 10 },
      clinicId: 2,
      evidence: { staffLinks: [staffLink()] },
    });
    const wrongParent = resolveClinicAccess({
      actor: { type: "staff", staffId: 20, clinicianId: 99 },
      clinicId: 1,
      evidence: { staffLinks: [staffLink()] },
    });
    expect(allowed).toMatchObject({ decision: "allow", reason: "ACTIVE_STAFF_LINKAGE" });
    expect(wrongClinic).toMatchObject({ decision: "deny", reason: "STAFF_CLINIC_MISMATCH" });
    expect(wrongParent).toMatchObject({ decision: "deny", reason: "STAFF_CLINICIAN_MISMATCH" });
  });

  it("denies inactive staff and never treats a clinician membership as staff linkage", () => {
    const inactive = resolveClinicAccess({
      actor: { type: "staff", staffId: 20, clinicianId: 10 }, clinicId: 1,
      evidence: { staffLinks: [staffLink({ isActive: false })] },
    });
    const noLink = resolveClinicAccess({
      actor: { type: "staff", staffId: 20, clinicianId: 10 }, clinicId: 1,
      evidence: { memberships: [membership()] },
    });
    expect(inactive).toMatchObject({ decision: "deny", reason: "STAFF_LINKAGE_INACTIVE" });
    expect(noLink).toMatchObject({ decision: "indeterminate", reason: "EVIDENCE_UNAVAILABLE" });
  });

  it("keeps provider authority separate from ordinary clinic access", () => {
    const ordinary = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      evidence: { memberships: [membership({ clinicalRole: "rn" })] },
    });
    const signing = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      route: { requireProviderAuthority: true },
      evidence: { memberships: [membership({ clinicalRole: "rn" })] },
    });
    expect(ordinary.decision).toBe("allow");
    expect(signing).toMatchObject({ decision: "deny", reason: "PROVIDER_AUTHORITY_REQUIRED" });
  });

  it("does not let chart-review-only memberships reach ordinary clinic routes", () => {
    const ordinary = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      evidence: { memberships: [membership({ accessScope: "chart_review_only" })] },
    });
    const review = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      route: { kind: "chart-review" },
      evidence: { memberships: [membership({ accessScope: "chart_review_only" })] },
    });
    expect(ordinary).toMatchObject({ decision: "deny", reason: "MEMBERSHIP_SCOPE_RESTRICTED" });
    expect(review.decision).toBe("allow");
  });

  it("requires resource tenant agreement for downloads and jobs", () => {
    const download = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      route: { kind: "download", resourceClinicId: 2 },
      evidence: { memberships: [membership()] },
    });
    const jobWithoutResource = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      route: { kind: "job" },
      evidence: { memberships: [membership()] },
    });
    expect(download).toMatchObject({ decision: "deny", reason: "RESOURCE_CLINIC_MISMATCH" });
    expect(jobWithoutResource).toMatchObject({ decision: "indeterminate", reason: "RESOURCE_SCOPE_UNRESOLVED" });
  });

  it("supports base-auth-only decisions without requiring clinic evidence", () => {
    const clinician = resolveClinicAccess({ actor: { type: "clinician", userId: 10 }, baseAuthOnly: true });
    const staff = resolveClinicAccess({ actor: { type: "staff", staffId: 20 }, route: { mode: "base-auth-only" } });
    const anonymous = resolveClinicAccess({ actor: { type: "anonymous" }, baseAuthOnly: true });
    expect(clinician).toMatchObject({ decision: "allow", reason: "BASE_AUTHENTICATED" });
    expect(staff).toMatchObject({ decision: "allow", reason: "BASE_AUTHENTICATED" });
    expect(anonymous).toMatchObject({ decision: "deny", reason: "AUTHENTICATION_REQUIRED" });
  });

  it("distinguishes portal, integrations, webhooks, and system actors without portal interference", () => {
    for (const type of ["patient_portal", "integration", "webhook", "system"] as const) {
      const result = resolveClinicAccess({
        actor: { type, authenticated: true },
        clinicId: 1,
        evidence: { memberships: [membership()] },
      });
      expect(result).toMatchObject({
        actorType: type,
        decision: "indeterminate",
        reason: "ACTOR_NOT_ALLOWED_FOR_CLINIC_SCOPE",
      });
      expect(resolveClinicAccess({ actor: { type }, baseAuthOnly: true })).toMatchObject({
        decision: "allow",
        reason: "BASE_AUTHENTICATED",
      });
    }
  });

  it("keeps anonymous and unknown actors distinct", () => {
    expect(resolveClinicAccess({ actor: { type: "anonymous" }, clinicId: 1 }))
      .toMatchObject({ actorType: "anonymous", decision: "deny", reason: "ANONYMOUS_ACTOR" });
    expect(resolveClinicAccess({ actor: { type: "future_actor" }, clinicId: 1 }))
      .toMatchObject({ actorType: "unknown", decision: "indeterminate", reason: "UNKNOWN_ACTOR" });
  });

  it("returns sanitized reasons and does not expose evidence details", () => {
    const result = resolveClinicAccess({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
      evidence: { memberships: [membership({ userId: 999 })] },
    });
    expect(Object.keys(result).sort()).toEqual(["actorType", "clinicId", "decision", "reason"]);
    expect(result.reason).toBe("NO_ACTIVE_ACCEPTED_MEMBERSHIP");
  });

  it("supports dependency injection and converts reader failures to indeterminate", async () => {
    const resolver = createClinicAccessResolver({
      getMemberships: async () => [membership()],
      getStaffLinks: async () => [],
    });
    await expect(resolver.resolve({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
    })).resolves.toMatchObject({ decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" });

    const failing = createClinicAccessResolver({
      getMemberships: () => { throw new Error("synthetic reader failure"); },
      getStaffLinks: () => [],
    });
    await expect(failing.resolve({
      actor: { type: "clinician", userId: 10 }, clinicId: 1,
    })).resolves.toMatchObject({ decision: "indeterminate", reason: "EVIDENCE_UNAVAILABLE" });
  });
});