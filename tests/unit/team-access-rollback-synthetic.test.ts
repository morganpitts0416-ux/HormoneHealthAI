import { describe, expect, it } from "vitest";
import {
  TEAM_ACCESS_ROLLBACK_TABLES,
  TEAM_ACCESS_IDENTITY_TABLES,
  TEAM_ACCESS_SYNTHETIC_SCENARIOS,
  TEAM_ACCESS_EXPECTED_SCENARIOS,
  assertExpectedScenarioObservations,
  assertZeroIdentityAndPatientDelta,
  assertExactSyntheticDuringDelta,
  assertDevelopmentRollbackAttestation,
  countDelta,
  sanitizeTeamAccessRollbackReport,
  syntheticRunDigest,
  withRollback,
  type RollbackQueryClient,
  type TeamAccessRollbackCounts,
  type TeamAccessRollbackReport,
} from "../../scripts/team-access-rollback-synthetic";

const counts = (value: number): TeamAccessRollbackCounts =>
  Object.fromEntries(TEAM_ACCESS_ROLLBACK_TABLES.map((table) => [table, value])) as TeamAccessRollbackCounts;

const report = (): TeamAccessRollbackReport => ({
  result: "passed",
  transaction: "rollback",
  synthetic: true,
  runDigest: syntheticRunDigest("fresh-tag"),
  scenarios: TEAM_ACCESS_SYNTHETIC_SCENARIOS.map((scenario) => ({
    scenario,
    decision: "deny",
    reason: "NO_ACTIVE_ACCEPTED_MEMBERSHIP",
  })),
  counts: {
    before: counts(10),
    during: counts(11),
    after: counts(10),
    deltaDuring: counts(1),
    unchangedAfterRollback: true,
  },
  account2: {
    fingerprints: {
      before: {
        legacyAccountRowDigest: "d".repeat(64),
        linkedPatientRowDigest: "e".repeat(64),
        legacyAccessCredentialDigest: "a".repeat(64),
        graphDigest: "b".repeat(64),
        identityFlagsDigest: "c".repeat(64),
        accountRows: 1,
        patientRows: 1,
        identityRows: 1,
        mappingRows: 1,
        credentialRows: 1,
        relationshipRows: 1,
        syntheticSessionRows: 0,
        identityFlagRows: 0,
        relationshipEventRows: 0,
        shadowDecisionRows: 0,
        migrationRunRows: 0,
        migrationEventRows: 0,
        identityReadyOnly: true,
        identityEnabledPresent: false,
      },
      during: {
        legacyAccountRowDigest: "d".repeat(64),
        linkedPatientRowDigest: "e".repeat(64),
        legacyAccessCredentialDigest: "a".repeat(64),
        graphDigest: "b".repeat(64),
        identityFlagsDigest: "c".repeat(64),
        accountRows: 1,
        patientRows: 1,
        identityRows: 1,
        mappingRows: 1,
        credentialRows: 1,
        relationshipRows: 1,
        syntheticSessionRows: 0,
        identityFlagRows: 0,
        relationshipEventRows: 0,
        shadowDecisionRows: 0,
        migrationRunRows: 0,
        migrationEventRows: 0,
        identityReadyOnly: true,
        identityEnabledPresent: false,
      },
      after: {
        legacyAccountRowDigest: "d".repeat(64),
        linkedPatientRowDigest: "e".repeat(64),
        legacyAccessCredentialDigest: "a".repeat(64),
        graphDigest: "b".repeat(64),
        identityFlagsDigest: "c".repeat(64),
        accountRows: 1,
        patientRows: 1,
        identityRows: 1,
        mappingRows: 1,
        credentialRows: 1,
        relationshipRows: 1,
        syntheticSessionRows: 0,
        identityFlagRows: 0,
        relationshipEventRows: 0,
        shadowDecisionRows: 0,
        migrationRunRows: 0,
        migrationEventRows: 0,
        identityReadyOnly: true,
        identityEnabledPresent: false,
      },
    },
    unchangedAcrossRollback: true,
  },
});

describe("team-access rollback-only synthetic harness", () => {
  it("always rolls back when fixture work succeeds or fails", async () => {
    const statements: string[] = [];
    const client: RollbackQueryClient = {
      async query(text) {
        statements.push(text);
        return { rows: [] };
      },
    };
    await withRollback(client, async () => "done");
    expect(statements).toEqual(["BEGIN", "ROLLBACK"]);

    statements.length = 0;
    await expect(withRollback(client, async () => {
      throw new Error("fixture assertion");
    })).rejects.toThrow("fixture assertion");
    expect(statements).toEqual(["BEGIN", "ROLLBACK"]);

    const rollbackFailure: RollbackQueryClient = {
      async query(text) {
        if (text === "ROLLBACK") throw new Error("rollback failed");
        return { rows: [] };
      },
    };
    await expect(withRollback(rollbackFailure, async () => "ignored")).rejects.toThrow("rollback failed");
  });

  it("requires an affirmative development-only CLI attestation", () => {
    expect(() => assertDevelopmentRollbackAttestation(
      ["--development-rollback"],
      { NODE_ENV: "development", REPLIT_DEV_DOMAIN: "dev.example" },
    )).not.toThrow();
    expect(() => assertDevelopmentRollbackAttestation(
      [],
      { NODE_ENV: "development", REPLIT_DEV_DOMAIN: "dev.example" },
    )).toThrow();
    expect(() => assertDevelopmentRollbackAttestation(
      ["--development-rollback"],
      { NODE_ENV: "development", REPLIT_DEV_DOMAIN: "dev.example", REPLIT_DEPLOYMENT: "1" },
    )).toThrow();
  });

  it("computes exact in-transaction deltas without changing baseline counts", () => {
    expect(countDelta(counts(4), counts(7))).toEqual(counts(3));
    const identityDelta = counts(0);
    assertZeroIdentityAndPatientDelta(identityDelta);
    expect(TEAM_ACCESS_IDENTITY_TABLES).toHaveLength(13);
    const synthetic = { ...counts(0) };
    synthetic.users = 4;
    synthetic.clinics = 3;
    synthetic.clinic_memberships = 6;
    synthetic.clinician_staff = 2;
    synthetic.providers = 3;
    synthetic.session = 5;
    expect(() => assertExactSyntheticDuringDelta(synthetic)).not.toThrow();
  });

  it("returns only the allowlisted sanitized report shape", () => {
    const safe = sanitizeTeamAccessRollbackReport(report());
    expect(JSON.stringify(safe)).not.toMatch(/@example\.invalid|password|fresh-tag/i);
    expect(safe.counts.unchangedAfterRollback).toBe(true);
    expect(safe.account2.fingerprints.before.graphDigest).toHaveLength(64);
  });

  it("locks every scenario to its expected decision and reason", () => {
    const observations = TEAM_ACCESS_SYNTHETIC_SCENARIOS.map((scenario) => ({
      scenario,
      ...TEAM_ACCESS_EXPECTED_SCENARIOS[scenario],
    }));
    expect(() => assertExpectedScenarioObservations(observations)).not.toThrow();
  });

  it("rejects an attempted PII-bearing report rather than redacting it", () => {
    const unsafe = report() as TeamAccessRollbackReport & { email?: string };
    unsafe.email = "synthetic@example.invalid";
    expect(() => sanitizeTeamAccessRollbackReport(unsafe)).toThrow();
  });
});