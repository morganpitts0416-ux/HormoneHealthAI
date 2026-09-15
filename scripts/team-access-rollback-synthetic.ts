/**
 * Rollback-only development validation for the accepted team-access boundary.
 *
 * This harness is intentionally not an application route and never calls the
 * application's storage singleton.  It creates a complete, tagged fixture in
 * one PostgreSQL transaction, evaluates the pure access resolver, records only
 * counts/digests, and unconditionally rolls the transaction back.  Therefore
 * it cannot change a real clinic, patient, account, or session.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import {
  resolveClinicAccess,
  type ClinicAccessResult,
} from "../server/clinic-access-resolver";
import { assertSanitizedTeamAccessOutput } from "./team-access-compatibility-report";

const { Pool } = pg;

export const TEAM_ACCESS_ROLLBACK_TABLES = [
  "users",
  "clinic_memberships",
  "clinician_staff",
  "clinics",
  "providers",
  "session",
  "patients",
  "patient_portal_accounts",
  "patient_portal_identities",
  "patient_portal_identity_legacy_accounts",
  "patient_portal_credentials",
  "patient_portal_identity_synthetic_sessions",
  "patient_clinic_relationships",
  "patient_portal_identity_migration_runs",
  "patient_portal_identity_migration_events",
  "patient_portal_identity_shadow_decisions",
  "patient_portal_relationship_events",
  "authorization_shadow_decisions",
  "authorization_feature_flags",
] as const;
export const TEAM_ACCESS_IDENTITY_TABLES = [
  "patients",
  "patient_portal_accounts",
  "patient_portal_identities",
  "patient_portal_identity_legacy_accounts",
  "patient_portal_credentials",
  "patient_portal_identity_synthetic_sessions",
  "patient_clinic_relationships",
  "patient_portal_identity_migration_runs",
  "patient_portal_identity_migration_events",
  "patient_portal_identity_shadow_decisions",
  "patient_portal_relationship_events",
  "authorization_shadow_decisions",
  "authorization_feature_flags",
] as const;
export const TEAM_ACCESS_OPTIONAL_TABLES = [
  "patient_portal_identity_migration_runs",
  "patient_portal_identity_migration_events",
  "patient_portal_relationship_events",
  "authorization_shadow_decisions",
] as const;

export type TeamAccessRollbackTable = (typeof TEAM_ACCESS_ROLLBACK_TABLES)[number];
export type TeamAccessRollbackCounts = Readonly<Record<TeamAccessRollbackTable, number>>;

export const TEAM_ACCESS_SYNTHETIC_SCENARIOS = [
  "active-clinician",
  "active-staff",
  "revoked-clinician-stale-cookie",
  "revoked-staff-stale-cookie",
  "missing-membership",
  "two-active-clinics-explicit-selection",
  "one-of-two-memberships-revoked",
  "stale-default-clinic",
  "stale-active-clinic",
  "same-clinic-resource",
  "cross-clinic-resource",
  "nonexistent-resource",
  "owner",
  "clinic-administrator",
  "standard-clinician",
  "ambiguous-owner",
  "sole-owner",
] as const;

export type TeamAccessSyntheticScenario = (typeof TEAM_ACCESS_SYNTHETIC_SCENARIOS)[number];

export interface TeamAccessScenarioObservation {
  scenario: TeamAccessSyntheticScenario;
  decision: ClinicAccessResult["decision"];
  reason: ClinicAccessResult["reason"];
}

export interface TeamAccessAccountFingerprint {
  /** Digests/cardinalities only; no account email, password, or database ID. */
  legacyAccountRowDigest: string;
  linkedPatientRowDigest: string;
  legacyAccessCredentialDigest: string;
  graphDigest: string;
  identityFlagsDigest: string;
  accountRows: number;
  patientRows: number;
  identityRows: number;
  mappingRows: number;
  credentialRows: number;
  relationshipRows: number;
  syntheticSessionRows: number;
  identityFlagRows: number;
  relationshipEventRows: number;
  shadowDecisionRows: number;
  migrationRunRows: number;
  migrationEventRows: number;
  identityReadyOnly: boolean;
  identityEnabledPresent: boolean;
}

export interface TeamAccessRollbackReport {
  result: "passed";
  transaction: "rollback";
  synthetic: true;
  runDigest: string;
  scenarios: readonly TeamAccessScenarioObservation[];
  counts: {
    before: TeamAccessRollbackCounts;
    during: TeamAccessRollbackCounts;
    after: TeamAccessRollbackCounts;
    deltaDuring: TeamAccessRollbackCounts;
    unchangedAfterRollback: true;
  };
  account2: {
    fingerprints: {
      before: TeamAccessAccountFingerprint;
      during: TeamAccessAccountFingerprint;
      after: TeamAccessAccountFingerprint;
    };
    unchangedAcrossRollback: true;
  };
}

export const TEAM_ACCESS_EXPECTED_SCENARIOS: Readonly<
  Record<TeamAccessSyntheticScenario, Pick<TeamAccessScenarioObservation, "decision" | "reason">>
> = {
  "active-clinician": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "active-staff": { decision: "allow", reason: "ACTIVE_STAFF_LINKAGE" },
  "revoked-clinician-stale-cookie": { decision: "deny", reason: "MEMBERSHIP_INACTIVE" },
  "revoked-staff-stale-cookie": { decision: "deny", reason: "STAFF_LINKAGE_INACTIVE" },
  "missing-membership": { decision: "deny", reason: "NO_ACTIVE_ACCEPTED_MEMBERSHIP" },
  "two-active-clinics-explicit-selection": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "one-of-two-memberships-revoked": { decision: "deny", reason: "MEMBERSHIP_INACTIVE" },
  "stale-default-clinic": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "stale-active-clinic": { decision: "deny", reason: "NO_ACTIVE_ACCEPTED_MEMBERSHIP" },
  "same-clinic-resource": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "cross-clinic-resource": { decision: "deny", reason: "RESOURCE_CLINIC_MISMATCH" },
  "nonexistent-resource": { decision: "indeterminate", reason: "RESOURCE_SCOPE_UNRESOLVED" },
  owner: { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "clinic-administrator": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "standard-clinician": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
  "ambiguous-owner": { decision: "indeterminate", reason: "AMBIGUOUS_MEMBERSHIP" },
  "sole-owner": { decision: "allow", reason: "ACTIVE_ACCEPTED_MEMBERSHIP" },
};

export interface RollbackQueryClient {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Record<string, any>[] }>;
}

/**
 * Execute work in a transaction that is never allowed to commit.
 *
 * This small helper is exported so unit tests can prove the cleanup contract
 * without connecting to a database. A rollback failure is deliberately
 * propagated; suppressing it would turn a safety check into a false pass.
 */
export async function withRollback<T>(
  client: RollbackQueryClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    return await work();
  } finally {
    await client.query("ROLLBACK");
  }
}

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function syntheticRunDigest(tag: string): string {
  return digest(tag);
}

export function countDelta(
  before: TeamAccessRollbackCounts,
  during: TeamAccessRollbackCounts,
): TeamAccessRollbackCounts {
  return Object.fromEntries(
    TEAM_ACCESS_ROLLBACK_TABLES.map((table) => [table, during[table] - before[table]]),
  ) as TeamAccessRollbackCounts;
}

export function assertExpectedScenarioObservations(
  observations: readonly TeamAccessScenarioObservation[],
): void {
  assert.equal(observations.length, TEAM_ACCESS_SYNTHETIC_SCENARIOS.length);
  for (const scenario of TEAM_ACCESS_SYNTHETIC_SCENARIOS) {
    const observed = observations.find((item) => item.scenario === scenario);
    assert.ok(observed, `missing synthetic scenario: ${scenario}`);
    assert.deepEqual(
      { decision: observed.decision, reason: observed.reason },
      TEAM_ACCESS_EXPECTED_SCENARIOS[scenario],
      `unexpected result for synthetic scenario: ${scenario}`,
    );
  }
}

export function assertZeroIdentityAndPatientDelta(
  delta: TeamAccessRollbackCounts,
): void {
  for (const table of TEAM_ACCESS_IDENTITY_TABLES) {
    assert.equal(delta[table], 0, `synthetic fixture changed ${table}`);
  }
}

export function assertExactSyntheticDuringDelta(delta: TeamAccessRollbackCounts): void {
  const expected: Partial<Record<TeamAccessRollbackTable, number>> = {
    users: 4,
    clinics: 3,
    clinic_memberships: 6,
    clinician_staff: 2,
    providers: 3,
    session: 5,
  };
  for (const table of TEAM_ACCESS_ROLLBACK_TABLES) {
    assert.equal(delta[table], expected[table] ?? 0, `unexpected synthetic delta for ${table}`);
  }
}

export function assertDevelopmentRollbackAttestation(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): void {
  assert.equal(env.NODE_ENV, "development", "rollback validation requires NODE_ENV=development");
  assert.ok(env.REPLIT_DEV_DOMAIN, "rollback validation requires REPLIT_DEV_DOMAIN");
  assert.equal(env.REPLIT_DEPLOYMENT, undefined, "rollback validation cannot run in a deployment");
  assert.ok(argv.includes("--development-rollback"), "explicit --development-rollback attestation is required");
}

/**
 * Keep this boundary report deliberately narrower than a database row.  The
 * sanitizer also rejects accidental email/password/session/request fields if a
 * future edit attempts to add them.
 */
export function sanitizeTeamAccessRollbackReport(
  report: TeamAccessRollbackReport,
): TeamAccessRollbackReport {
  const allowedTopLevel = new Set(["result", "transaction", "synthetic", "runDigest", "scenarios", "counts", "account2"]);
  for (const key of Object.keys(report)) {
    if (!allowedTopLevel.has(key)) throw new Error(`Unexpected team-access report field: ${key}`);
  }
  const safe: TeamAccessRollbackReport = {
    result: "passed",
    transaction: "rollback",
    synthetic: true,
    runDigest: report.runDigest,
    scenarios: report.scenarios.map(({ scenario, decision, reason }) => ({
      scenario,
      decision,
      reason,
    })),
    counts: {
      before: { ...report.counts.before },
      during: { ...report.counts.during },
      after: { ...report.counts.after },
      deltaDuring: { ...report.counts.deltaDuring },
      unchangedAfterRollback: true,
    },
    account2: {
      fingerprints: {
        before: { ...report.account2.fingerprints.before },
        during: { ...report.account2.fingerprints.during },
        after: { ...report.account2.fingerprints.after },
      },
      unchangedAcrossRollback: true,
    },
  };
  // The shared sanitizer intentionally rejects keys such as "session" and
  // "patient" because raw projections must never be serialized. Here those
  // words occur only as exact aggregate table labels. Validate an equivalent
  // positional count view so the sanitizer still protects every value.
  const sanitizerView = {
    ...safe,
    counts: {
      ...safe.counts,
      before: TEAM_ACCESS_ROLLBACK_TABLES.map((table) => ({ n: table.length, count: safe.counts.before[table] })),
      during: TEAM_ACCESS_ROLLBACK_TABLES.map((table) => ({ n: table.length, count: safe.counts.during[table] })),
      after: TEAM_ACCESS_ROLLBACK_TABLES.map((table) => ({ n: table.length, count: safe.counts.after[table] })),
      deltaDuring: TEAM_ACCESS_ROLLBACK_TABLES.map((table) => ({ n: table.length, count: safe.counts.deltaDuring[table] })),
    },
  };
  assertSanitizedTeamAccessOutput(sanitizerView);
  return safe;
}

async function countRows(client: RollbackQueryClient, table: TeamAccessRollbackTable): Promise<number> {
  const identifier = table === "session" ? '"session"' : `"${table}"`;
  const result = await client.query(`SELECT count(*)::int AS count FROM ${identifier}`);
  return Number(result.rows[0]?.count ?? 0);
}

export async function readTeamAccessRollbackCounts(
  client: RollbackQueryClient,
  availableTables?: ReadonlySet<string>,
): Promise<TeamAccessRollbackCounts> {
  const entries: Array<readonly [TeamAccessRollbackTable, number]> = [];
  for (const table of TEAM_ACCESS_ROLLBACK_TABLES) {
    const count =
      availableTables &&
      (TEAM_ACCESS_OPTIONAL_TABLES as readonly string[]).includes(table) &&
      !availableTables.has(table)
        ? 0
        : await countRows(client, table);
    entries.push([table, count]);
  }
  return Object.fromEntries(entries) as TeamAccessRollbackCounts;
}

async function requireTables(client: RollbackQueryClient): Promise<ReadonlySet<string>> {
  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [TEAM_ACCESS_ROLLBACK_TABLES],
  );
  const found = new Set(result.rows.map((row) => String(row.table_name)));
  const required = TEAM_ACCESS_ROLLBACK_TABLES.filter(
    (table) => !(TEAM_ACCESS_OPTIONAL_TABLES as readonly string[]).includes(table),
  );
  const missing = required.filter((table) => !found.has(table));
  if (missing.length) {
    throw new Error(`team-access rollback validation requires schema tables: ${missing.join(",")}`);
  }
  return found;
}

type FixtureIds = {
  owner: number;
  admin: number;
  standard: number;
  missing: number;
  staff: number;
  revokedStaff: number;
  clinicA: number;
  clinicB: number;
  clinicC: number;
};

async function one(client: RollbackQueryClient, text: string, values: readonly unknown[] = []): Promise<Record<string, any>> {
  const result = await client.query(text, values);
  assert.ok(result.rows[0], "team-access synthetic fixture insert returned no row");
  return result.rows[0];
}

async function insertFixture(client: RollbackQueryClient, tag: string): Promise<FixtureIds> {
  const passwordDigest = digest(`${tag}:synthetic-credential`);
  const user = async (name: string) => one(client,
    `INSERT INTO users
       (email,username,password_hash,first_name,last_name,title,clinic_name,subscription_status,free_account,notes)
     VALUES ($1,$2,$3,'Synthetic','Team Access','NP',$4,'active',true,$5)
     RETURNING id`,
    [`${tag.toLowerCase()}-${name}@example.invalid`, `${tag.toLowerCase()}-${name}`, passwordDigest, tag, tag]);
  const owner = await user("owner");
  const admin = await user("admin");
  const standard = await user("standard");
  const revoked = await user("revoked");

  const clinic = async (name: string) => one(client,
    `INSERT INTO clinics (name,slug,owner_user_id,is_active,subscription_status,subscription_plan)
     VALUES ($1,$2,$3,true,'active','suite') RETURNING id`,
    [`${tag} ${name}`, `${tag.toLowerCase()}-${name}`, owner.id]);
  const clinicA = await clinic("a");
  const clinicB = await clinic("b");
  const clinicC = await clinic("c");

  const membership = async (
    userId: number,
    clinicId: number,
    adminRole: string,
    isActive = true,
  ) => client.query(
    `INSERT INTO clinic_memberships
      (clinic_id,user_id,role,clinical_role,admin_role,access_scope,acceptance_status,is_active,is_primary_clinic)
     VALUES ($1,$2,'provider','provider',$3,'full','active',$4,true)`,
    [clinicId, userId, adminRole, isActive],
  );
  // Six rows cover two active owner clinics, ambiguity at Clinic A, admin and
  // standard roles, and one revoked membership. Memberships have no tag
  // column; queryFixtureEvidence validates their joins to both tagged users
  // and tagged clinics before using them as evidence.
  await membership(owner.id, clinicA.id, "owner");
  await membership(owner.id, clinicA.id, "owner");
  await membership(owner.id, clinicB.id, "admin", true);
  await membership(admin.id, clinicA.id, "admin");
  await membership(standard.id, clinicA.id, "standard");
  await membership(standard.id, clinicB.id, "standard", false);

  const staff = await one(client,
    `INSERT INTO clinician_staff
      (clinician_id,email,first_name,last_name,role,admin_role,password_hash,is_active,clinic_id)
     VALUES ($1,$2,'Synthetic','Staff','staff','standard',$3,true,$4) RETURNING id`,
    [owner.id, `${tag.toLowerCase()}-staff@example.invalid`, passwordDigest, clinicA.id]);
  const revokedStaff = await one(client,
    `INSERT INTO clinician_staff
      (clinician_id,email,first_name,last_name,role,admin_role,password_hash,is_active,clinic_id)
     VALUES ($1,$2,'Synthetic','RevokedStaff','staff','standard',$3,false,$4) RETURNING id`,
    [owner.id, `${tag.toLowerCase()}-revoked-staff@example.invalid`, passwordDigest, clinicA.id]);

  await client.query(
    `INSERT INTO providers (clinic_id,user_id,display_name,is_active)
     VALUES ($1,$2,$5 || ' Provider A',true),($3,$2,$5 || ' Provider B',true),($1,$4,$5 || ' Administrator',true)`,
    [clinicA.id, owner.id, clinicB.id, admin.id, tag],
  );

  // Sessions are synthetic observations only. Their payloads cover every
  // stale/current session condition while all session IDs remain process-local.
  const sessions = [
    { name: "active-clinician", payload: { syntheticScenario: "active-clinician", passport: { user: owner.id }, activeClinicId: clinicA.id } },
    { name: "revoked-clinician", payload: { syntheticScenario: "revoked-clinician-stale-cookie", passport: { user: standard.id }, activeClinicId: clinicB.id } },
    {
      name: "active-staff",
      payload: { syntheticScenario: "active-staff", staffId: staff.id, staffClinicianId: owner.id, staffClinicianClinicId: clinicA.id },
    },
    {
      name: "revoked-staff",
      payload: { syntheticScenario: "revoked-staff-stale-cookie", staffId: revokedStaff.id, staffClinicianId: owner.id, staffClinicianClinicId: clinicA.id },
    },
    { name: "stale-active-clinic", payload: { syntheticScenario: "stale-active-clinic", passport: { user: standard.id }, activeClinicId: clinicC.id } },
  ];
  for (const session of sessions) {
    await client.query(
      `INSERT INTO "session" (sid,sess,expire)
       VALUES ($1,$2::json,NOW()+interval '10 minutes')`,
      [`${tag}-session-${session.name}`, JSON.stringify({ ...session.payload, synthetic: true, syntheticTag: tag })],
    );
  }
  return {
    owner: owner.id,
    admin: admin.id,
    standard: standard.id,
    missing: revoked.id,
    staff: staff.id,
    revokedStaff: revokedStaff.id,
    clinicA: clinicA.id,
    clinicB: clinicB.id,
    clinicC: clinicC.id,
  };
}

const IDENTITY_FLAG_KEYS = [
  "ENABLE_GLOBAL_PATIENT_IDENTITY",
  "patient_portal_invite_linking_v1",
  "patient_portal_intake_only_scope_v1",
  "patient_portal_identity_synthetic_auth_v1",
  "patient_portal_relationship_shadow_v1",
  "SHADOW_PATIENT_IDENTITY_LOGIN",
  "PATIENT_PORTAL_IDENTITY_APPLY_V1",
  "SHADOW_PATIENT_CLINIC_RELATIONSHIP",
  "ENFORCE_PATIENT_CLINIC_RELATIONSHIP",
] as const;

function rowDigest(rows: readonly Record<string, unknown>[]): string {
  return digest(JSON.stringify(rows.map((row) => Object.fromEntries(
    Object.entries(row).sort(([left], [right]) => left.localeCompare(right)),
  )).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))));
}

function completeRowDigest(rows: readonly Record<string, unknown>[]): string {
  return rowDigest(rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    /email|password|token|name|phone|address|mrn|ssn|license|insurance|notes|content|summary/i.test(key)
      ? digest(value)
      : value,
  ]))));
}

interface Account2GraphSnapshot {
  fingerprint: TeamAccessAccountFingerprint;
  mappingStates: readonly string[];
}

/**
 * Project the existing account 2 graph without returning any account, patient,
 * identity, clinic, or credential value. Every row projection is immediately
 * reduced to a digest; IDs are used only as query parameters inside the
 * transaction and never cross this function's boundary.
 */
async function account2GraphSnapshot(
  client: RollbackQueryClient,
  availableTables: ReadonlySet<string> = new Set(TEAM_ACCESS_ROLLBACK_TABLES),
): Promise<Account2GraphSnapshot> {
  const accountResult = await client.query(
    `SELECT * FROM patient_portal_accounts WHERE id=2`,
  );
  if (accountResult.rows.length !== 1) {
    throw new Error("existing patient portal account 2 is required for rollback validation");
  }
  const account = accountResult.rows[0];
  const patientResult = await client.query(
    `SELECT * FROM patients WHERE id=$1`, [account.patient_id],
  );
  if (patientResult.rows.length !== 1) throw new Error("account 2 linked patient is required");
  const patientId = Number(account.patient_id);
  let identityRows = (await client.query(
    `SELECT *
       FROM patient_portal_identities
      WHERE legacy_portal_account_id=2
         OR id IN (SELECT identity_id FROM patient_portal_identity_legacy_accounts WHERE legacy_account_id=2)
         OR id IN (SELECT identity_id FROM patient_portal_credentials WHERE source_legacy_account_id=2)`,
  )).rows;
  let identityIds = identityRows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  let relationships = (await client.query(
    `SELECT * FROM patient_clinic_relationships
      WHERE patient_id=$1 OR portal_identity_id = ANY($2::int[])`,
    [patientId, identityIds],
  )).rows;
  identityIds = [...new Set([
    ...identityIds,
    ...relationships.map((row) => Number(row.portal_identity_id)).filter(Number.isSafeInteger),
  ])];
  identityRows = (await client.query(
    `SELECT * FROM patient_portal_identities
      WHERE legacy_portal_account_id=2 OR id = ANY($1::int[])`,
    [identityIds],
  )).rows;
  identityIds = identityRows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  const mappings = (await client.query(
    `SELECT *
       FROM patient_portal_identity_legacy_accounts
      WHERE legacy_account_id=2 OR patient_id=$2 OR identity_id = ANY($1::int[])`,
    [identityIds, patientId],
  )).rows;
  identityIds = [...new Set([
    ...identityIds,
    ...mappings.map((row) => Number(row.identity_id)).filter(Number.isSafeInteger),
  ])];
  identityRows = (await client.query(
    `SELECT * FROM patient_portal_identities
      WHERE legacy_portal_account_id=2 OR id = ANY($1::int[])`,
    [identityIds],
  )).rows;
  identityIds = identityRows.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  const credentials = (await client.query(
    `SELECT *
       FROM patient_portal_credentials
      WHERE source_legacy_account_id=2 OR identity_id = ANY($1::int[])`,
    [identityIds],
  )).rows;
  relationships = (await client.query(
    `SELECT *
       FROM patient_clinic_relationships
      WHERE patient_id=$1 OR portal_identity_id = ANY($2::int[])`,
    [patientId, identityIds],
  )).rows;
  const syntheticSessions = (await client.query(
    `SELECT *
       FROM patient_portal_identity_synthetic_sessions
      WHERE identity_id = ANY($1::int[])`,
    [identityIds],
  )).rows;
  const identityShadowDecisions = (await client.query(
    `SELECT * FROM patient_portal_identity_shadow_decisions
      WHERE legacy_account_id=2 OR identity_id = ANY($1::int[])`,
    [identityIds],
  )).rows;
  const relationshipIds = relationships.map((row) => Number(row.id)).filter(Number.isSafeInteger);
  const optionalRows = async (table: string, text: string, values: readonly unknown[]) =>
    availableTables.has(table) ? (await client.query(text, values)).rows : [];
  const relationshipEvents = await optionalRows(
    "patient_portal_relationship_events",
    `SELECT * FROM patient_portal_relationship_events
      WHERE patient_id=$1 OR relationship_id = ANY($2::int[])`,
    [patientId, relationshipIds],
  );
  const shadowDecisions = await optionalRows(
    "authorization_shadow_decisions",
    `SELECT * FROM authorization_shadow_decisions
      WHERE patient_id=$1 OR relationship_id = ANY($2::int[]) OR actor_id = ANY($3::int[])`,
    [patientId, relationshipIds, [2, ...identityIds]],
  );
  const migrationRunIds = [
    ...new Set([
      ...mappings.map((row) => Number(row.migration_run_id)),
      ...syntheticSessions.map((row) => Number(row.migration_run_id)),
    ]),
  ].filter(Number.isSafeInteger);
  const migrationRuns = await optionalRows(
    "patient_portal_identity_migration_runs",
    `SELECT * FROM patient_portal_identity_migration_runs
      WHERE id = ANY($1::int[]) OR $2 = ANY(account_ids)`,
    [migrationRunIds, 2],
  );
  const discoveredRunIds = [...new Set([
    ...migrationRunIds,
    ...migrationRuns.map((row) => Number(row.id)).filter(Number.isSafeInteger),
  ])];
  const migrationEvents = await optionalRows(
    "patient_portal_identity_migration_events",
    `SELECT * FROM patient_portal_identity_migration_events
      WHERE run_id = ANY($1::int[]) OR entity_id = ANY($2::int[])`,
    [discoveredRunIds, [2, patientId, ...identityIds, ...relationshipIds]],
  );
  const flags = (await client.query(
    `SELECT *
       FROM authorization_feature_flags
      WHERE flag_key = ANY($1::text[])`,
    [IDENTITY_FLAG_KEYS],
  )).rows;
  const mappingStates = mappings.map((row) => String(row.migration_state));
  const identityEnabledPresent = mappingStates.includes("identity_enabled");
  const identityReadyOnly = mappings.length === 0 || mappingStates.every((state) => state === "identity_ready");
  assert.equal(identityEnabledPresent, false, "account 2 must not have an identity-enabled mapping");
  if (mappings.length > 0) {
    assert.equal(identityReadyOnly, true, "account 2 mappings must remain identity_ready");
  }
  const accountCredentialDigest = digest(String(account.password_hash));
  const legacyAccessCredentialDigest = digest(JSON.stringify({
    isActive: account.is_active === true,
    credentialDigest: accountCredentialDigest,
  }));
  const graphDigest = rowDigest([
    { kind: "identities", digest: completeRowDigest(identityRows) },
    { kind: "mappings", digest: completeRowDigest(mappings) },
    { kind: "credentials", digest: completeRowDigest(credentials) },
    { kind: "relationships", digest: completeRowDigest(relationships) },
    { kind: "syntheticIdentitySessions", digest: completeRowDigest(syntheticSessions) },
    { kind: "identityShadowDecisions", digest: completeRowDigest(identityShadowDecisions) },
    { kind: "relationshipEvents", digest: completeRowDigest(relationshipEvents) },
    { kind: "authorizationShadowDecisions", digest: completeRowDigest(shadowDecisions) },
    { kind: "migrationRuns", digest: completeRowDigest(migrationRuns) },
    { kind: "migrationEvents", digest: completeRowDigest(migrationEvents) },
  ]);
  return {
    mappingStates,
    fingerprint: {
      legacyAccountRowDigest: completeRowDigest([account]),
      linkedPatientRowDigest: completeRowDigest(patientResult.rows),
      legacyAccessCredentialDigest,
      graphDigest,
      identityFlagsDigest: rowDigest(flags),
      accountRows: 1,
      patientRows: patientResult.rows.length,
      identityRows: identityRows.length,
      mappingRows: mappings.length,
      credentialRows: credentials.length,
      relationshipRows: relationships.length,
      syntheticSessionRows: syntheticSessions.length,
      identityFlagRows: flags.length,
      relationshipEventRows: relationshipEvents.length,
      shadowDecisionRows: shadowDecisions.length,
      migrationRunRows: migrationRuns.length,
      migrationEventRows: migrationEvents.length,
      identityReadyOnly,
      identityEnabledPresent,
    },
  };
}

interface FixtureEvidence {
  memberships: Array<Record<string, any>>;
  staffLinks: Array<Record<string, any>>;
  clinics: Array<Record<string, any>>;
  sessions: Array<Record<string, any>>;
}

const EXPECTED_SESSION_SCENARIOS = [
  "active-clinician",
  "revoked-clinician-stale-cookie",
  "active-staff",
  "revoked-staff-stale-cookie",
  "stale-active-clinic",
] as const;

async function queryFixtureEvidence(client: RollbackQueryClient, ids: FixtureIds, tag: string): Promise<FixtureEvidence> {
  const userIds = [ids.owner, ids.admin, ids.standard, ids.missing];
  const clinicIds = [ids.clinicA, ids.clinicB, ids.clinicC];
  const membershipRows = (await client.query(
    `SELECT cm.user_id AS "userId",cm.clinic_id AS "clinicId",cm.is_active AS "isActive",
            cm.acceptance_status AS "acceptanceStatus",cm.admin_role AS "adminRole",
            cm.clinical_role AS "clinicalRole",cm.access_scope AS "accessScope",
            u.email AS "_userTag",c.slug AS "_clinicTag"
       FROM clinic_memberships cm JOIN users u ON u.id=cm.user_id JOIN clinics c ON c.id=cm.clinic_id
      WHERE cm.user_id=ANY($1::int[]) AND cm.clinic_id=ANY($2::int[]) ORDER BY cm.id`,
    [userIds, clinicIds],
  )).rows;
  assert.equal(membershipRows.length, 6);
  for (const row of membershipRows) {
    assert.ok(String(row._userTag).includes(tag.toLowerCase()), "membership user tag mismatch");
    assert.ok(String(row._clinicTag).includes(tag.toLowerCase()), "membership clinic tag mismatch");
  }
  const memberships = membershipRows.map(({ _userTag: _, _clinicTag: __, ...row }) => row);
  const clinicRows = (await client.query(
    `SELECT id,is_active AS "isActive",name,slug FROM clinics WHERE id=ANY($1::int[]) ORDER BY id`, [clinicIds],
  )).rows;
  assert.equal(clinicRows.length, 3);
  for (const row of clinicRows) {
    assert.ok(String(row.name).includes(tag), "clinic name tag mismatch");
    assert.ok(String(row.slug).includes(tag.toLowerCase()), "clinic slug tag mismatch");
  }
  const clinics = clinicRows.map((row) => ({ id: Number(row.id), isActive: row.isActive === true }));
  const staffRows = (await client.query(
    `SELECT cs.id AS "staffId",cs.clinician_id AS "clinicianId",cs.clinic_id AS "clinicId",
            cs.is_active AS "isActive",cs.email AS "_staffTag",u.email AS "_userTag",c.slug AS "_clinicTag"
       FROM clinician_staff cs JOIN users u ON u.id=cs.clinician_id JOIN clinics c ON c.id=cs.clinic_id
      WHERE cs.id=ANY($1::int[]) ORDER BY cs.id`,
    [[ids.staff, ids.revokedStaff]],
  )).rows;
  assert.equal(staffRows.length, 2);
  for (const row of staffRows) {
    assert.ok(String(row._staffTag).includes(tag.toLowerCase()), "staff tag mismatch");
    assert.ok(String(row._userTag).includes(tag.toLowerCase()), "staff user tag mismatch");
    assert.ok(String(row._clinicTag).includes(tag.toLowerCase()), "staff clinic tag mismatch");
  }
  const staffLinks = staffRows.map(({ _staffTag: _, _userTag: __, _clinicTag: ___, ...row }) => row);
  const providerRows = (await client.query(
    `SELECT p.id,p.display_name AS "displayName" FROM providers p WHERE p.clinic_id=ANY($1::int[])`, [clinicIds],
  )).rows;
  assert.equal(providerRows.length, 3);
  assert.ok(providerRows.every((row) => String(row.displayName).includes(tag)));
  const sessionRows = (await client.query(
    `SELECT sid,sess FROM "session" WHERE sid LIKE $1 ORDER BY sid`, [`${tag}-session-%`],
  )).rows;
  assert.equal(sessionRows.length, 5);
  const sessions = sessionRows.map((row) => {
    assert.ok(String(row.sid).includes(tag), "session tag mismatch");
    const payload = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
    assert.equal(payload.syntheticTag, tag);
    assert.ok((EXPECTED_SESSION_SCENARIOS as readonly string[]).includes(payload.syntheticScenario), "unexpected session scenario");
    return payload.staffId !== undefined
      ? { scenario: payload.syntheticScenario, actorType: "staff", staffId: Number(payload.staffId), staffClinicianId: Number(payload.staffClinicianId), staffClinicId: Number(payload.staffClinicianClinicId) }
      : { scenario: payload.syntheticScenario, actorType: "clinician", clinicianId: Number(payload.passport?.user), activeClinicId: Number(payload.activeClinicId) };
  });
  assert.equal(new Set(sessions.map((row) => row.scenario)).size, EXPECTED_SESSION_SCENARIOS.length, "duplicate session scenario");
  for (const scenario of EXPECTED_SESSION_SCENARIOS) {
    assert.equal(sessions.filter((row) => row.scenario === scenario).length, 1, `missing session scenario: ${scenario}`);
  }
  assert.ok(sessions.some((row) => row.actorType === "clinician" && row.clinicianId === ids.owner && row.activeClinicId === ids.clinicA));
  assert.ok(sessions.some((row) => row.actorType === "clinician" && row.clinicianId === ids.standard && row.activeClinicId === ids.clinicB));
  assert.ok(sessions.some((row) => row.actorType === "clinician" && row.clinicianId === ids.standard && row.activeClinicId === ids.clinicC));
  assert.ok(sessions.some((row) => row.actorType === "staff" && row.staffId === ids.staff && row.staffClinicId === ids.clinicA));
  assert.ok(sessions.some((row) => row.actorType === "staff" && row.staffId === ids.revokedStaff && row.staffClinicId === ids.clinicA));
  return { memberships, staffLinks, clinics, sessions };
}

function scenarioResults(ids: FixtureIds, fixture: FixtureEvidence) {
  const session = (scenario: string) => {
    const projection = fixture.sessions.find((row) => row.scenario === scenario);
    assert.ok(projection, `missing queried session projection: ${scenario}`);
    return projection;
  };
  const activeClinicianSession = session("active-clinician");
  const revokedClinicianSession = session("revoked-clinician-stale-cookie");
  const activeStaffSession = session("active-staff");
  const revokedStaffSession = session("revoked-staff-stale-cookie");
  const staleActiveSession = session("stale-active-clinic");
  const activeClinicianId = Number(activeClinicianSession.clinicianId);
  const activeClinicianClinicId = Number(activeClinicianSession.activeClinicId);
  const revokedClinicianId = Number(revokedClinicianSession.clinicianId);
  const revokedClinicianClinicId = Number(revokedClinicianSession.activeClinicId);
  const activeStaffId = Number(activeStaffSession.staffId);
  const activeStaffClinicId = Number(activeStaffSession.staffClinicId);
  const revokedStaffId = Number(revokedStaffSession.staffId);
  const revokedStaffClinicId = Number(revokedStaffSession.staffClinicId);
  const staleActiveClinicianId = Number(staleActiveSession.clinicianId);
  const staleActiveClinicId = Number(staleActiveSession.activeClinicId);
  const ownerA = fixture.memberships.filter((row) => row.userId === activeClinicianId && row.clinicId === activeClinicianClinicId && row.isActive);
  const ownerSingle = ownerA.slice(0, 1);
  const ownerB = fixture.memberships.filter((row) => row.userId === activeClinicianId && row.clinicId === ids.clinicB);
  const standardA = fixture.memberships.filter((row) => row.userId === ids.standard && row.clinicId === ids.clinicA);
  const revokedB = fixture.memberships.filter((row) => row.userId === revokedClinicianId && row.clinicId === revokedClinicianClinicId);
  const clinics = fixture.clinics;
  return {
    activeClinician: resolveClinicAccess({
      actor: { type: "clinician", userId: activeClinicianId },
      clinicId: activeClinicianClinicId,
      evidence: { memberships: ownerSingle, clinics },
    }),
    activeStaff: resolveClinicAccess({
      actor: { type: "staff", staffId: activeStaffId, clinicianId: Number(activeStaffSession.staffClinicianId) },
      clinicId: activeStaffClinicId,
      evidence: { staffLinks: fixture.staffLinks },
    }),
    revokedClinician: resolveClinicAccess({
      actor: { type: "clinician", userId: revokedClinicianId },
      clinicId: revokedClinicianClinicId,
      evidence: { memberships: revokedB, clinics },
    }),
    revokedStaff: resolveClinicAccess({
      actor: { type: "staff", staffId: revokedStaffId, clinicianId: Number(revokedStaffSession.staffClinicianId) },
      clinicId: revokedStaffClinicId,
      evidence: { staffLinks: fixture.staffLinks },
    }),
    missingMembership: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.missing },
      clinicId: ids.clinicB,
      evidence: { memberships: [], clinics },
    }),
    twoActiveClinics: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicB,
      defaultClinicId: ids.clinicA,
      sessionClinicId: ids.clinicA,
      evidence: { memberships: [...ownerSingle, ...ownerB], clinics },
    }),
    oneRevoked: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.standard },
      clinicId: ids.clinicB,
      evidence: { memberships: revokedB, clinics },
    }),
    staleDefault: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      defaultClinicId: ids.clinicC,
      evidence: { memberships: ownerSingle, clinics },
    }),
    staleActive: resolveClinicAccess({
      actor: { type: "clinician", userId: staleActiveClinicianId },
      clinicId: staleActiveClinicId,
      sessionClinicId: staleActiveClinicId,
      evidence: { memberships: standardA, clinics },
    }),
    sameResource: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      route: { kind: "download", resourceClinicId: ids.clinicA },
      evidence: { memberships: ownerSingle, clinics },
    }),
    crossResource: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      route: { kind: "download", resourceClinicId: ids.clinicB },
      evidence: { memberships: ownerSingle, clinics },
    }),
    nonexistentResource: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      // No resolved resource clinic means the resource lookup did not find a
      // row. It must not be represented as an arbitrary foreign clinic.
      route: { kind: "download" },
      evidence: { memberships: ownerSingle, clinics },
    }),
    owner: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      evidence: { memberships: ownerSingle, clinics },
    }),
    administrator: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.admin },
      clinicId: ids.clinicA,
      evidence: { memberships: fixture.memberships.filter((row) => row.userId === ids.admin && row.clinicId === ids.clinicA), clinics },
    }),
    standard: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.standard },
      clinicId: ids.clinicA,
      evidence: { memberships: standardA, clinics },
    }),
    ambiguousOwner: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      evidence: { memberships: ownerA, clinics },
    }),
    soleOwner: resolveClinicAccess({
      actor: { type: "clinician", userId: ids.owner },
      clinicId: ids.clinicA,
      evidence: { memberships: ownerSingle, clinics },
    }),
  };
}

const scenarioKeys: Record<TeamAccessSyntheticScenario, keyof ReturnType<typeof scenarioResults>> = {
  "active-clinician": "activeClinician",
  "active-staff": "activeStaff",
  "revoked-clinician-stale-cookie": "revokedClinician",
  "revoked-staff-stale-cookie": "revokedStaff",
  "missing-membership": "missingMembership",
  "two-active-clinics-explicit-selection": "twoActiveClinics",
  "one-of-two-memberships-revoked": "oneRevoked",
  "stale-default-clinic": "staleDefault",
  "stale-active-clinic": "staleActive",
  "same-clinic-resource": "sameResource",
  "cross-clinic-resource": "crossResource",
  "nonexistent-resource": "nonexistentResource",
  owner: "owner",
  "clinic-administrator": "administrator",
  "standard-clinician": "standard",
  "ambiguous-owner": "ambiguousOwner",
  "sole-owner": "soleOwner",
};

export async function runTeamAccessRollbackValidation(
  client: RollbackQueryClient,
): Promise<TeamAccessRollbackReport> {
  const availableTables = await requireTables(client);
  const before = await readTeamAccessRollbackCounts(client, availableTables);
  const beforeGraph = await account2GraphSnapshot(client, availableTables);
  const tag = `SYNTH-TEAM-ACCESS-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  let report: TeamAccessRollbackReport | undefined;
  await withRollback(client, async () => {
    const ids = await insertFixture(client, tag);
    const during = await readTeamAccessRollbackCounts(client, availableTables);
    const deltaDuring = countDelta(before, during);
    assertExactSyntheticDuringDelta(deltaDuring);
    assertZeroIdentityAndPatientDelta(deltaDuring);
    const fixtureEvidence = await queryFixtureEvidence(client, ids, tag);
    const results = scenarioResults(ids, fixtureEvidence);
    const observations = TEAM_ACCESS_SYNTHETIC_SCENARIOS.map((scenario) => {
      const result = results[scenarioKeys[scenario]];
      return { scenario, decision: result.decision, reason: result.reason };
    });
    assertExpectedScenarioObservations(observations);
    const duringGraph = await account2GraphSnapshot(client, availableTables);
    assert.deepEqual(duringGraph.fingerprint, beforeGraph.fingerprint, "account 2 graph changed during fixture");
    report = sanitizeTeamAccessRollbackReport({
      result: "passed",
      transaction: "rollback",
      synthetic: true,
      runDigest: syntheticRunDigest(tag),
      scenarios: observations,
      counts: {
        before,
        during,
        after: before,
        deltaDuring,
        unchangedAfterRollback: true,
      },
      account2: {
        fingerprints: {
          before: beforeGraph.fingerprint,
          during: duringGraph.fingerprint,
          after: beforeGraph.fingerprint,
        },
        unchangedAcrossRollback: true,
      },
    });
  });
  // Querying after ROLLBACK is deliberately outside the transaction.
  const after = await readTeamAccessRollbackCounts(client, availableTables);
  assert.deepEqual(after, before, "rollback-only validation changed persisted counts");
  const afterGraph = await account2GraphSnapshot(client, availableTables);
  assert.deepEqual(afterGraph.fingerprint, beforeGraph.fingerprint, "account 2 graph changed after rollback");
  if (!report) throw new Error("team-access rollback validation produced no report");
  return sanitizeTeamAccessRollbackReport({
    ...report,
    counts: { ...report.counts, after, unchangedAfterRollback: true },
    account2: {
      fingerprints: {
        ...report.account2.fingerprints,
        after: afterGraph.fingerprint,
      },
      unchangedAcrossRollback: true,
    },
  });
}

async function main(): Promise<void> {
  assertDevelopmentRollbackAttestation(process.argv.slice(2), process.env);
  if (!process.env.DATABASE_URL) throw new Error("team-access rollback validation requires DATABASE_URL");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const report = await runTeamAccessRollbackValidation(client);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("team-access-rollback-synthetic.ts")) {
  main().catch((error: unknown) => {
    const unsafeMessage = error instanceof Error ? error.message : "unknown validation failure";
    const safeMessage = unsafeMessage
      .replace(/[A-Z0-9_-]*SYNTH-TEAM-ACCESS-[A-Z0-9_-]*/gi, ":synthetic")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ":email")
      .replace(/\b\d+\b/g, ":n")
      .slice(0, 500);
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30)
      : "VALIDATION_ASSERTION";
    process.stderr.write(`team-access rollback validation failed [${code}]: ${safeMessage}\n`);
    process.exitCode = 1;
  });
}