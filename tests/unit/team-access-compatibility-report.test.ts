import { describe, expect, it } from "vitest";
import {
  assertSanitizedTeamAccessOutput,
  assertTeamAccessDiscrepancyBreakdownConsistent,
  assertTeamAccessProjectionAllowed,
  aggregateTeamAccessSessions,
  buildTeamAccessDevelopmentReport,
  buildTeamAccessSnapshot,
  normalizeTeamAccessRouteFamily,
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
        routePath: "/api/clinics/4/members",
        actorType: "clinician",
        currentDecision: "allow",
        proposedDecision: "deny",
        proposedReason: "membership_scope",
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
        routePath: "/api/clinics/8",
        actorType: "clinician",
        currentDecision: "deny",
        proposedDecision: "allow",
        proposedReason: "owner_scope",
      }],
      sessions: [],
    });
    const report = buildTeamAccessCompatibilityReport(snapshot);
    expect(report.shadowDecisions).toEqual([
      { entityId: 17, clinicId: 8, reasonCode: "LEGACY_DENY_NEW_ALLOW" },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/request-must-not-appear|requestId|routePath|evidence|patient/i);
  });

  it("breaks down historical discrepancies by normalized route/reason and labels provenance", () => {
    const projections = {
      users: [],
      clinicMemberships: [],
      clinicianStaff: [],
      clinics: [],
      providers: [],
      authorizationShadowDecisions: [
        {
          entityId: 1,
          clinicId: 2,
          routePath: "/api/patients/938/encounters/550e8400-e29b-41d4-a716-446655440000",
          actorType: "clinician",
          currentDecision: "allow",
          proposedDecision: "deny",
          proposedReason: "membership_scope",
        },
        {
          entityId: 1,
          clinicId: 2,
          routePath: "/api/patients/123/encounters/550e8400-e29b-41d4-a716-446655440001",
          actorType: "clinician",
          currentDecision: "allow",
          proposedDecision: "deny",
          proposedReason: "membership_scope",
        },
        {
          entityId: 2,
          clinicId: 3,
          routePath: "/api/clinics/3/members",
          actorType: "staff",
          currentDecision: "deny",
          proposedDecision: "allow",
          proposedReason: "owner_scope",
        },
        {
          entityId: 3,
          clinicId: 4,
          routePath: "/api/clinics/4/members",
          actorType: "clinician",
          currentDecision: "indeterminate",
          proposedDecision: "deny",
          proposedReason: "missing_evidence",
        },
      ],
      sessions: [],
    } as const;

    const report = buildTeamAccessDevelopmentReport(projections);
    expect(report.discrepancyBreakdown).toEqual({
      legacyAllowProposedDeny: [{
        routeFamily: "/api/patients/:id/encounters/:id",
        proposedReason: "membership_scope",
        count: 2,
      }],
      legacyDenyProposedAllow: [{
        routeFamily: "/api/clinics/:id/members",
        proposedReason: "owner_scope",
        count: 1,
      }],
      indeterminate: [{
        routeFamily: "/api/clinics/:id/members",
        missingContextReason: "missing_evidence",
        count: 1,
      }],
    });
    expect(report.historicalObservations).toMatchObject({
      persistedAuthorizationShadowDecisionRows: 4,
      classification: "historical_observations",
      freshReadinessProof: false,
    });
    expect(report.historicalObservations.label).toMatch(/historical.*not fresh-readiness proof/i);
    expect(report.historicalObservations.label).not.toMatch(/\d+\s+rows/i);
    expect(() => assertTeamAccessDiscrepancyBreakdownConsistent(
      projections.authorizationShadowDecisions,
      report.discrepancyBreakdown,
    )).not.toThrow();
    expect(report.findingProvenance.currentSnapshot.classification).toBe(
      "currently_reproducible_snapshot_findings",
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/\/938\/|\/123\/|550e8400|requestId|routePath/i);
    expect(serialized).not.toContain("routePath");
  });

  it("fails closed when a discrepancy bucket total is not the classified row total", () => {
    const rows = [{
      entityId: 1,
      clinicId: 2,
      routePath: "/api/clinics/2",
      actorType: "clinician",
      currentDecision: "allow",
      proposedDecision: "deny",
      proposedReason: "membership_scope",
    }] as const;
    const report = buildTeamAccessDevelopmentReport({
      users: [],
      clinicMemberships: [],
      clinicianStaff: [],
      clinics: [],
      providers: [],
      authorizationShadowDecisions: rows,
      sessions: [],
    });
    const inconsistent = {
      ...report.discrepancyBreakdown,
      legacyAllowProposedDeny: [{
        ...report.discrepancyBreakdown.legacyAllowProposedDeny[0],
        count: 0,
      }],
    };
    expect(() => assertTeamAccessDiscrepancyBreakdownConsistent(rows, inconsistent)).toThrow(
      /bucket totals do not match/i,
    );
  });

  it("replaces numeric, UUID, and token route segments with placeholders", () => {
    expect(normalizeTeamAccessRouteFamily(
      "/api/invites/AbCdEf1234567890-opaque-token/550e8400-e29b-41d4-a716-446655440000",
    )).toBe("/api/invites/:token/:id");
    expect(normalizeTeamAccessRouteFamily("/api/clinics/42/members")).toBe(
      "/api/clinics/:id/members",
    );
    expect(normalizeTeamAccessRouteFamily("/api/users/Alice@example.test")).toBe(
      "/api/users/:segment",
    );
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