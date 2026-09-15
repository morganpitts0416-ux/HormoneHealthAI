import { describe, expect, it } from "vitest";
import {
  buildTeamAccessCompatibilityReport,
  compareShadowDecision,
  compareShadowDecisions,
  createTeamAccessCompatibilityReporter,
} from "../../server/team-access-compatibility";

describe("team access compatibility reporter", () => {
  it("classifies shadow differences without returning request/session identifiers", () => {
    expect(compareShadowDecision("allow", "deny")).toBe("LEGACY_ALLOW_NEW_DENY");
    expect(compareShadowDecision("deny", "allow")).toBe("LEGACY_DENY_NEW_ALLOW");
    expect(compareShadowDecision("allow", "unknown")).toBe("INDETERMINATE_SHADOW_DECISION");

    const findings = compareShadowDecisions([
      {
        entityId: 10,
        clinicId: 2,
        requestId: "session-secret-that-must-not-appear",
        legacyDecision: "allow",
        newDecision: "deny",
      } as never,
      { entityId: 11, legacyDecision: "deny", newDecision: "allow" },
      { entityId: 12, legacyDecision: "allow", newDecision: "indeterminate" },
      { entityId: 13, legacyDecision: "allow", newDecision: "allow" },
    ]);
    expect(findings).toEqual([
      { entityId: 10, clinicId: 2, reasonCode: "LEGACY_ALLOW_NEW_DENY" },
      { entityId: 11, reasonCode: "LEGACY_DENY_NEW_ALLOW" },
      { entityId: 12, reasonCode: "INDETERMINATE_SHADOW_DECISION" },
    ]);
    expect(JSON.stringify(findings)).not.toContain("session-secret");
  });

  it("reports membership, owner, staff linkage, provider, and stale-ID anomalies", () => {
    const report = buildTeamAccessCompatibilityReport({
      clinicians: [
        { id: 1, defaultClinicId: 99, activeClinicId: 99 },
        { id: 2, defaultClinicId: 2, activeClinicId: 2 },
      ],
      clinics: [
        { id: 1, ownerUserId: 1 },
        { id: 2, ownerUserId: 1 },
      ],
      memberships: [
        { userId: 1, clinicId: 1, adminRole: "owner", isActive: false, acceptanceStatus: "active" },
        {
          userId: 2,
          clinicId: 2,
          adminRole: "owner",
          clinicalRole: "staff",
          isActive: true,
          acceptanceStatus: "active",
        },
        { userId: 3, clinicId: 2, adminRole: "owner", isActive: true, acceptanceStatus: "active" },
      ],
      staff: [
        { id: 20, clinicianId: 404, clinicId: 2 },
        { id: 21, clinicianId: 2, clinicId: 1 },
      ],
      providers: [
        { id: 30, clinicId: 2, userId: 2 },
        { id: 31, clinicId: 2 },
      ],
      shadowDecisions: [],
    });

    expect(report.staleClinicIds).toEqual(
      expect.arrayContaining([
        { clinicianId: 1, clinicId: 99, reasonCode: "STALE_ACTIVE_CLINIC_ID" },
        { clinicianId: 1, clinicId: 99, reasonCode: "STALE_DEFAULT_CLINIC_ID" },
      ]),
    );
    expect(report.staffLinkage).toEqual(
      expect.arrayContaining([
        { staffId: 20, clinicianId: 404, reasonCode: "STAFF_CLINICIAN_MISSING" },
        { staffId: 21, clinicianId: 2, clinicId: 1, reasonCode: "STAFF_CLINIC_MEMBERSHIP_MISSING" },
      ]),
    );
    expect(report.clinicOwnership).toEqual(
      expect.arrayContaining([
        { clinicId: 1, reasonCode: "CLINIC_ZERO_OWNERS" },
        { clinicId: 2, reasonCode: "CLINIC_MULTIPLE_OWNERS" },
      ]),
    );
    expect(report.providerAuthority).toEqual(
      expect.arrayContaining([
        { providerId: 30, clinicId: 2, userId: 2, reasonCode: "PROVIDER_AUTHORITY_MISSING" },
        { providerId: 31, clinicId: 2, reasonCode: "PROVIDER_IDENTITY_MISSING" },
      ]),
    );
    expect(report.totals).toEqual({
      clinicians: 2,
      memberships: 3,
      staff: 2,
      clinics: 2,
      providers: 2,
      shadowDecisions: 0,
    });
  });

  it("accepts a dependency-injected snapshot provider and does not mutate it", async () => {
    const snapshot = {
      clinicians: [{ id: 7, defaultClinicId: 7 }],
      clinics: [{ id: 7, ownerUserId: 7 }],
      memberships: [{
        userId: 7,
        clinicId: 7,
        adminRole: "owner",
        isActive: true,
        acceptanceStatus: "active",
      }],
    } as const;
    const before = JSON.stringify(snapshot);
    const reporter = createTeamAccessCompatibilityReporter({ getSnapshots: () => snapshot });
    const report = await reporter.report();
    expect(report.counts.clinicians).toBe(0);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("sanitizes active sessions, reports stale and inconsistent links, and collapses duplicates", () => {
    const snapshot = {
      clinicians: [{ id: 1 }],
      clinics: [{ id: 1 }, { id: 2 }],
      memberships: [{ userId: 1, clinicId: 1, isActive: true, acceptanceStatus: "active" }],
      staff: [{ id: 10, clinicianId: 1, clinicId: 1 }],
      activeSessionSnapshots: [
        {
          actorType: "clinician",
          clinicianId: 1,
          activeClinicId: 2,
          sessionId: "clinician-session-secret-a",
        },
        {
          actorType: "clinician",
          clinicianId: 1,
          activeClinicId: 2,
          sessionId: "clinician-session-secret-b",
        },
        {
          actorType: "staff",
          staffId: 10,
          staffClinicianId: 999,
          staffClinicId: 1,
          sessionId: "staff-session-secret-a",
        },
        {
          actorType: "staff",
          staffId: 10,
          staffClinicianId: 1,
          staffClinicId: 2,
          sessionId: "staff-session-secret-b",
        },
      ],
    } as const;

    const before = JSON.stringify(snapshot);
    const report = buildTeamAccessCompatibilityReport(snapshot);

    expect(report.activeSessions).toEqual(
      expect.arrayContaining([
        {
          actorType: "clinician",
          clinicianId: 1,
          activeClinicId: 2,
          count: 2,
          reasonCode: "STALE_ACTIVE_CLINIC_ID",
        },
        {
          actorType: "staff",
          staffId: 10,
          staffClinicianId: 999,
          staffClinicId: 1,
          reasonCode: "STAFF_SESSION_CLINICIAN_MISMATCH",
        },
        {
          actorType: "staff",
          staffId: 10,
          staffClinicianId: 1,
          staffClinicId: 2,
          reasonCode: "STAFF_SESSION_CLINIC_MISMATCH",
        },
      ]),
    );
    expect(report.counts.activeSessions).toBe(3);
    expect(JSON.stringify(report.activeSessions)).not.toContain("session-secret");
    expect(JSON.stringify(report.activeSessions)).not.toContain("raw");
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});