import { describe, expect, it } from "vitest";
import {
  assertSanitizedTeamAccessOutput,
  assertTeamAccessProjectionAllowed,
  aggregateTeamAccessSessions,
  buildTeamAccessSnapshot,
} from "../../scripts/team-access-compatibility-report";
import { buildTeamAccessCompatibilityReport } from "../../server/team-access-compatibility";

describe("development team-access compatibility report adapter", () => {
  it("enforces the explicit projection allowlist and recursively rejects sensitive output", () => {
    expect(() =>
      assertTeamAccessProjectionAllowed("users", {
        id: 1,
        defaultClinicId: 2,
        email: "clinician@example.test",
      }),
    ).toThrow(/allowlisted/i);

    expect(() => assertSanitizedTeamAccessOutput({ safe: [{ nested: 1 }] })).not.toThrow();
    for (const unsafe of [
      { email: "person@example.test" },
      { nested: { password: "hash" } },
      { activeSessions: [{ sessionId: "opaque-id" }] },
      { details: "raw sess payload" },
      { details: "patient diagnosis" },
    ]) {
      expect(() => assertSanitizedTeamAccessOutput(unsafe)).toThrow();
    }
  });

  it("aggregates only numeric session projections and ignores session identity", () => {
    const rows = [
      {
        passportUserId: 7,
        staffId: null,
        staffClinicianId: null,
        activeClinicId: 4,
        staffClinicianClinicId: null,
        count: 2,
      },
      {
        passportUserId: "7",
        staffId: null,
        staffClinicianId: null,
        activeClinicId: "4",
        staffClinicianClinicId: null,
        count: "3",
      },
    ] as const;
    const grouped = aggregateTeamAccessSessions(rows);
    expect(grouped).toEqual([
      {
        passportUserId: 7,
        staffId: null,
        staffClinicianId: null,
        activeClinicId: 4,
        staffClinicianClinicId: null,
        count: 5,
      },
    ]);
    expect(JSON.stringify(grouped)).not.toMatch(/sid|sess|token|raw/i);
  });

  it("builds a fresh snapshot and preserves aggregate counts in the pure report", () => {
    const projections = {
      users: [{ id: 7, defaultClinicId: 4 }],
      clinicMemberships: [{
        userId: 7,
        clinicId: 4,
        isActive: true,
        acceptanceStatus: "active",
        role: "provider",
        clinicalRole: "provider",
        adminRole: "owner",
      }],
      clinicianStaff: [],
      clinics: [{ id: 4, ownerUserId: 7, isActive: true }],
      providers: [],
      authorizationShadowDecisions: [{
        entityId: 7,
        clinicId: 4,
        currentDecision: "allow",
        proposedDecision: "deny",
      }],
      sessions: [{
        passportUserId: 7,
        staffId: null,
        staffClinicianId: null,
        activeClinicId: 99,
        staffClinicianClinicId: null,
        count: 3,
      }],
    } as const;
    const before = JSON.stringify(projections);
    const snapshot = buildTeamAccessSnapshot(projections);
    const report = buildTeamAccessCompatibilityReport(snapshot);

    expect(report.activeSessions).toEqual([
      {
        actorType: "clinician",
        clinicianId: 7,
        activeClinicId: 99,
        count: 3,
        reasonCode: "STALE_ACTIVE_CLINIC_ID",
      },
    ]);
    expect(report.shadowDecisions).toEqual([
      { entityId: 7, clinicId: 4, reasonCode: "LEGACY_ALLOW_NEW_DENY" },
    ]);
    expect(JSON.stringify(projections)).toBe(before);
    expect(() => assertSanitizedTeamAccessOutput(report)).not.toThrow();
  });

  it("projects only shadow actor/clinic/decision fields and never accepts request IDs", () => {
    expect(() =>
      assertTeamAccessProjectionAllowed("authorizationShadowDecisions", {
        entityId: 7,
        clinicId: 4,
        currentDecision: "allow",
        proposedDecision: "deny",
        requestId: "request-must-not-appear",
      }),
    ).toThrow(/allowlisted/i);

    const snapshot = buildTeamAccessSnapshot({
      users: [],
      clinicMemberships: [],
      clinicianStaff: [],
      clinics: [],
      providers: [],
      authorizationShadowDecisions: [{
        entityId: 17,
        clinicId: 8,
        currentDecision: "deny",
        proposedDecision: "allow",
      }],
      sessions: [],
    });
    const report = buildTeamAccessCompatibilityReport(snapshot);
    expect(report.shadowDecisions).toEqual([
      { entityId: 17, clinicId: 8, reasonCode: "LEGACY_DENY_NEW_ALLOW" },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/request-must-not-appear|requestId|routePath|evidence|patient/i);
  });

  it("rejects session rows that try to smuggle raw connect-pg-simple fields", () => {
    expect(() =>
      aggregateTeamAccessSessions([{
        passportUserId: 1,
        staffId: null,
        staffClinicianId: null,
        activeClinicId: 2,
        staffClinicianClinicId: null,
        count: 1,
        sid: "must-not-be-selected",
      } as never]),
    ).toThrow(/allowlisted/i);
  });
});