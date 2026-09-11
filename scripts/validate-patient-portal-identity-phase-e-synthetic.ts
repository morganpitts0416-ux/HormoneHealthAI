/*
 * Phase E acceptance validator.  This file is deliberately a database-only
 * test harness: every row it creates has a .invalid address and is removed in
 * the finally block.  It prints aggregate evidence, never fixture values.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import pg from "pg";
import { requireReplitDevelopmentWorkspace } from "./patient-portal-identity-environment";

const exec = promisify(execFile);
if (!process.env.DATABASE_URL) throw new Error("Phase E synthetic validation requires a development database");
requireReplitDevelopmentWorkspace("Phase E synthetic validation");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const tag = `SYNTH-PHASE-E-${Date.now()}`.toLowerCase();
const email = `${tag}@example.invalid`;
const password = `${tag}-Password!7`;
const flag = "PATIENT_PORTAL_IDENTITY_APPLY_V1";
const syntheticFlag = "patient_portal_identity_synthetic_auth_v1";
const ids: Record<string, number> = {};
const collisionAccounts: number[] = [];
const collisionPatients: number[] = [];
const collisionClinics: number[] = [];
const collisionIdentities: number[] = [];
const hash = await bcrypt.hash(password, 10);
const oldFlags = new Map<string, any>();

const q = (text: string, values: unknown[] = []) => pool.query(text, values);
const one = async (text: string, values: unknown[] = []) => (await q(text, values)).rows[0] as Record<string, any>;
const runScript = async (script: string, args: string[], envOverrides: Record<string, string | undefined> = {}) => {
  const childEnv = { ...process.env };
  for (const [key, value] of Object.entries(envOverrides)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  try {
    const r = await exec(process.execPath, ["node_modules/tsx/dist/cli.mjs", script, ...args], {
      env: childEnv, timeout: 120_000, maxBuffer: 1024 * 1024,
    });
    assert.ok(!`${r.stdout}${r.stderr}`.includes(email) && !`${r.stdout}${r.stderr}`.includes(hash), "CLI leaked synthetic credential");
    return { code: 0, stdout: r.stdout };
  } catch (e: any) {
    const output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    assert.ok(!output.includes(email) && !output.includes(hash), "CLI leaked synthetic credential");
    return { code: Number(e.code ?? 1), stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
  }
};
const count = async (table: string) => Number((await q(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
const counts = async () => ({
  accounts: await count("patient_portal_accounts"),
  identities: await count("patient_portal_identities"),
  mappings: await count("patient_portal_identity_legacy_accounts"),
  relationships: await count("patient_clinic_relationships"),
  runs: await count("patient_portal_identity_migration_runs"),
  events: await count("patient_portal_identity_migration_events"),
  syntheticSessions: await count("patient_portal_identity_synthetic_sessions"),
  credentials: await count("patient_portal_credentials"),
});
async function setFlag(key: string, enabled: boolean) {
  const found = await q("SELECT * FROM authorization_feature_flags WHERE flag_key=$1 AND clinic_id IS NULL", [key]);
  if (!oldFlags.has(key)) oldFlags.set(key, found.rows[0] ?? null);
  if (found.rows[0]) await q("UPDATE authorization_feature_flags SET enabled=$1,expires_at=NULL,reason=$2,updated_at=NOW() WHERE id=$3", [enabled, tag, found.rows[0].id]);
  else await q("INSERT INTO authorization_feature_flags (flag_key,enabled,reason) VALUES ($1,$2,$3)", [key, enabled, tag]);
}
async function restoreFlag() {
  for (const [key, oldFlag] of oldFlags) {
    if (oldFlag) await q(`UPDATE authorization_feature_flags SET enabled=$1,expires_at=$2,reason=$3,
      approved_by_user_id=$4,created_at=$5,updated_at=$6 WHERE id=$7`,
      [oldFlag.enabled, oldFlag.expires_at, oldFlag.reason, oldFlag.approved_by_user_id, oldFlag.created_at, oldFlag.updated_at, oldFlag.id]);
    else await q("DELETE FROM authorization_feature_flags WHERE flag_key=$1 AND reason=$2 AND clinic_id IS NULL", [key, tag]);
  }
}
async function cleanup() {
  // Explicit dependency order also works when a test fails half-way through.
  let cleanupError: Error | null = null;
  const mainAccountIds = [ids.account, ids.accountTwo].filter(Number.isInteger);
  if (mainAccountIds.length) {
    const discovered = await q(`SELECT DISTINCT identity_id FROM patient_portal_identity_legacy_accounts
      WHERE legacy_account_id=ANY($1::int[])
      UNION SELECT DISTINCT identity_id FROM patient_portal_credentials
      WHERE source_legacy_account_id=ANY($1::int[])`, [mainAccountIds]).catch(() => ({ rows: [] }));
    for (const row of discovered.rows) {
      await q("DELETE FROM patient_portal_identity_synthetic_sessions WHERE identity_id=$1", [row.identity_id]).catch(() => {});
      await q("DELETE FROM patient_clinic_relationships WHERE portal_identity_id=$1", [row.identity_id]).catch(() => {});
      await q("DELETE FROM patient_portal_credentials WHERE identity_id=$1", [row.identity_id]).catch(() => {});
      await q("DELETE FROM patient_portal_identity_legacy_accounts WHERE identity_id=$1", [row.identity_id]).catch(() => {});
      await q("DELETE FROM patient_portal_identities WHERE id=$1", [row.identity_id]).catch(() => {});
    }
  }
  if (ids.identity) {
    await q("DELETE FROM patient_portal_identity_synthetic_sessions WHERE identity_id=$1", [ids.identity]).catch(() => {});
    await q("DELETE FROM patient_clinic_relationships WHERE portal_identity_id=$1", [ids.identity]).catch(() => {});
    await q("DELETE FROM patient_portal_credentials WHERE identity_id=$1", [ids.identity]).catch(() => {});
    await q("DELETE FROM patient_portal_identity_legacy_accounts WHERE identity_id=$1", [ids.identity]).catch(() => {});
    await q("DELETE FROM patient_portal_identities WHERE id=$1", [ids.identity]).catch(() => {});
  }
  if (ids.account) {
    await q("SELECT set_config('patient_portal.synthetic_cleanup_request','on',false)");
    await q("SELECT patient_portal_identity_synthetic_cleanup($1::integer[])", [[ids.account, ids.accountTwo].filter(Number.isInteger)]).catch((error) => {
      cleanupError = new Error(`guarded synthetic cleanup unavailable: ${error.message}`);
    });
    await q("SELECT set_config('patient_portal.synthetic_cleanup_request','off',false)");
  }
  if (ids.account) await q("DELETE FROM patient_portal_accounts WHERE id=$1", [ids.account]).catch(() => {});
  if (ids.accountTwo) await q("DELETE FROM patient_portal_accounts WHERE id=$1", [ids.accountTwo]).catch(() => {});
  if (ids.patient) await q("DELETE FROM patients WHERE id=$1", [ids.patient]).catch(() => {});
  if (ids.patientTwo) await q("DELETE FROM patients WHERE id=$1", [ids.patientTwo]).catch(() => {});
  if (ids.patientCorrection) await q("DELETE FROM patients WHERE id=$1", [ids.patientCorrection]).catch(() => {});
  if (ids.clinic) await q("DELETE FROM clinics WHERE id=$1", [ids.clinic]).catch(() => {});
  if (ids.clinicTwo) await q("DELETE FROM clinics WHERE id=$1", [ids.clinicTwo]).catch(() => {});
  if (ids.user) await q("DELETE FROM users WHERE id=$1", [ids.user]).catch(() => {});
  if (collisionAccounts.length) await q("DELETE FROM patient_portal_identity_legacy_accounts WHERE legacy_account_id=ANY($1::int[])", [collisionAccounts]).catch(() => {});
  for (const identity of collisionIdentities) await q("DELETE FROM patient_portal_identities WHERE id=$1", [identity]).catch(() => {});
  for (const account of collisionAccounts) await q("DELETE FROM patient_portal_accounts WHERE id=$1", [account]).catch(() => {});
  for (const patient of collisionPatients) await q("DELETE FROM patients WHERE id=$1", [patient]).catch(() => {});
  for (const clinic of collisionClinics) await q("DELETE FROM clinics WHERE id=$1", [clinic]).catch(() => {});
  if (collisionAccounts.length) {
    await q("SELECT set_config('patient_portal.synthetic_cleanup_request','on',false)");
    await q("SELECT patient_portal_identity_synthetic_cleanup($1::integer[])", [collisionAccounts]).catch((error) => {
      cleanupError = cleanupError ?? new Error(`collision cleanup unavailable: ${error.message}`);
    });
    await q("SELECT set_config('patient_portal.synthetic_cleanup_request','off',false)");
  }
  await restoreFlag();
  if (cleanupError) throw cleanupError;
}

const before = await counts();
let evidence: Record<string, unknown> = {};
try {
  const user = await one(`INSERT INTO users (email,username,password_hash,first_name,last_name,title,clinic_name,
    subscription_status,free_account,notes) VALUES ($1,$2,$3,'Synthetic','Phase E','NP',$4,'active',true,$5) RETURNING id`,
    [`${tag}-owner@example.invalid`, `${tag}-owner`, hash, tag, tag]);
  ids.user = user.id;
  ids.clinic = (await one("INSERT INTO clinics (name,slug,owner_user_id,is_active) VALUES ($1,$2,$3,true) RETURNING id", [tag, tag, ids.user])).id;
  ids.clinicTwo = (await one("INSERT INTO clinics (name,slug,owner_user_id,is_active) VALUES ($1,$2,$3,true) RETURNING id", [`${tag}-two`, `${tag}-two`, ids.user])).id;
  ids.patient = (await one(`INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn)
    VALUES ($1,'Synthetic','PhaseE','female',$2,$3,$4) RETURNING id`, [ids.user, email, ids.clinic, tag])).id;
  // Keep the requested primary account uniquely eligible; the second account
  // exercises many-to-one attachment with its own normalized email.
  const primaryEmail = `${tag}-primary@example.invalid`;
  await q("UPDATE patients SET email=$1 WHERE id=$2", [primaryEmail, ids.patient]);
  ids.account = (await one(`INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active)
    VALUES ($1,$2,$3,true) RETURNING id`, [ids.patient, primaryEmail, hash])).id;
  ids.patientTwo = (await one(`INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn)
    VALUES ($1,'Synthetic','PhaseETwo','female',$2,$3,$4) RETURNING id`, [ids.user, `${tag}-second@example.invalid`, ids.clinicTwo, `${tag}-two`])).id;
  ids.accountTwo = (await one(`INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active)
    VALUES ($1,$2,$3,true) RETURNING id`, [ids.patientTwo, `${tag}-second@example.invalid`, hash])).id;
  ids.patientCorrection = (await one(`INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn)
    VALUES ($1,'Synthetic','CorrectionTarget','female',$2,$3,$4) RETURNING id`,
    [ids.user, `${tag}-correction-target@example.invalid`, ids.clinicTwo, `${tag}-correction-target`])).id;
  const original = await one("SELECT id,email,password_hash,is_active FROM patient_portal_accounts WHERE id=$1", [ids.account]);
  await setFlag(flag, true);
  await setFlag(syntheticFlag, true);

  const makeCollisionFixture = async (suffix: string) => {
    const clinic = await one("INSERT INTO clinics (name,slug,owner_user_id,is_active) VALUES ($1,$2,$3,true) RETURNING id", [`${tag}-${suffix}`, `${tag}-${suffix}`, ids.user]);
    const fixtureEmail = `${tag}-${suffix}@example.invalid`;
    const patient = await one(`INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn)
      VALUES ($1,'Synthetic','Collision','female',$2,$3,$4) RETURNING id`, [ids.user, fixtureEmail, clinic.id, `${tag}-${suffix}`]);
    const account = await one(`INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active)
      VALUES ($1,$2,$3,true) RETURNING id`, [patient.id, fixtureEmail, hash]);
    collisionClinics.push(clinic.id); collisionPatients.push(patient.id); collisionAccounts.push(account.id);
    return { clinic: clinic.id as number, patient: patient.id as number, account: account.id as number, email: fixtureEmail };
  };
  const collisionApply = async (account: number, reportId: string) => runScript("scripts/patient-portal-identity-migration.ts", [
    "--apply", "--synthetic", "--legacy-account-ids", String(account), "--max-rows", "1",
    "--report-id", reportId, "--idempotency-key", crypto.randomUUID(),
  ]);
  const graphCounts = async () => ({
    identities: await count("patient_portal_identities"), credentials: await count("patient_portal_credentials"),
    mappings: await count("patient_portal_identity_legacy_accounts"), relationships: await count("patient_clinic_relationships"),
  });
  const beforeCollision = await graphCounts();
  const activeFixture = await makeCollisionFixture("stale-active");
  const activeReportOut = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(activeFixture.account), "--max-rows", "1",
  ]);
  const activeReport = JSON.parse(activeReportOut.stdout.trim());
  await q("UPDATE patient_portal_accounts SET is_active=false WHERE id=$1", [activeFixture.account]);
  const activeChangedReportOut = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(activeFixture.account), "--max-rows", "1",
  ]);
  assert.notEqual(JSON.parse(activeChangedReportOut.stdout.trim()).reportId, activeReport.reportId);
  assert.notEqual((await collisionApply(activeFixture.account, activeReport.reportId)).code, 0);
  await q("UPDATE patient_portal_accounts SET is_active=true WHERE id=$1", [activeFixture.account]);
  assert.deepEqual(await graphCounts(), beforeCollision);

  const emailFixture = await makeCollisionFixture("stale-email");
  const emailReportOut = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(emailFixture.account), "--max-rows", "1",
  ]);
  const emailReport = JSON.parse(emailReportOut.stdout.trim());
  const duplicatePatient = await one(`INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn)
    VALUES ($1,'Synthetic','CollisionDuplicate','female',$2,$3,$4) RETURNING id`,
    [ids.user, ` ${emailFixture.email.toUpperCase()} `, emailFixture.clinic, `${tag}-email-duplicate`]);
  const duplicateAccount = await one(`INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active)
    VALUES ($1,$2,$3,true) RETURNING id`, [duplicatePatient.id, ` ${emailFixture.email.toUpperCase()} `, hash]);
  collisionPatients.push(duplicatePatient.id); collisionAccounts.push(duplicateAccount.id);
  const emailChangedReportOut = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(emailFixture.account), "--max-rows", "1",
  ]);
  assert.notEqual(JSON.parse(emailChangedReportOut.stdout.trim()).reportId, emailReport.reportId);
  assert.notEqual((await collisionApply(emailFixture.account, emailReport.reportId)).code, 0);
  assert.deepEqual(await graphCounts(), beforeCollision);

  const identityFixture = await makeCollisionFixture("stale-identity");
  const identityReportOut = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(identityFixture.account), "--max-rows", "1",
  ]);
  const identityReport = JSON.parse(identityReportOut.stdout.trim());
  const conflictingIdentity = await one("INSERT INTO patient_portal_identities (normalized_email,account_status,verification_status) VALUES ($1,'pending','unverified') RETURNING id", [identityFixture.email]);
  collisionIdentities.push(conflictingIdentity.id);
  await q(`INSERT INTO patient_portal_identity_legacy_accounts
    (identity_id,legacy_account_id,patient_id,clinic_id,migration_state,credential_compatibility_status,provenance_run_key,conflicted_at)
    VALUES ($1,$2,$3,$4,'conflicting','unknown',$5,NOW())`,
    [conflictingIdentity.id, identityFixture.account, identityFixture.patient, identityFixture.clinic, `${tag}-collision`]);
  const conflictGraphBefore = await graphCounts();
  const identityChangedReportOut = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(identityFixture.account), "--max-rows", "1",
  ]);
  assert.notEqual(JSON.parse(identityChangedReportOut.stdout.trim()).reportId, identityReport.reportId);
  assert.notEqual((await collisionApply(identityFixture.account, identityReport.reportId)).code, 0);
  assert.deepEqual(await graphCounts(), conflictGraphBefore);

  // Argument and environment gates are exercised without mutating the database.
  const badArgs = await runScript("scripts/patient-portal-identity-migration.ts", ["--dry-run", "--synthetic", "--legacy-account-ids", String(ids.account), "--max-rows", "0"]);
  assert.notEqual(badArgs.code, 0);
  const beforeDryRun = await counts();
  const dry = await runScript("scripts/patient-portal-identity-migration.ts", ["--dry-run", "--synthetic", "--legacy-account-ids", String(ids.account), "--max-rows", "1"]);
  assert.equal(dry.code, 0, dry.stderr);
  const report = JSON.parse(dry.stdout.trim());
  assert.equal(report.mode, "dry-run");
  assert.deepEqual(await counts(), beforeDryRun);

  const key = crypto.randomUUID();
  const applyArgs = ["--apply", "--synthetic", "--legacy-account-ids", String(ids.account), "--max-rows", "1",
    "--report-id", report.reportId, "--idempotency-key", key];
  const beforeEnvironmentGates = await counts();
  const gateCases: Array<[string, string[], Record<string, string | undefined>]> = [
    ["scripts/patient-portal-identity-migration.ts", applyArgs, { REPL_ID: undefined, REPLIT_DEV_DOMAIN: undefined }],
    ["scripts/patient-portal-identity-migration.ts", applyArgs, { REPLIT_DEPLOYMENT: "1" }],
    ["scripts/patient-portal-identity-migration.ts", applyArgs, { CI: "true" }],
    ["scripts/patient-portal-identity-source-correction.ts", [
      "--field", "patient_email", "--idempotency-key", crypto.randomUUID(), "--identity-id", "1",
      "--legacy-account-id", String(ids.account), "--patient-id", String(ids.patient),
      "--reason-code", "environment_gate", "--value", email,
    ], { REPL_ID: undefined, REPLIT_DEV_DOMAIN: undefined }],
    ["scripts/patient-portal-identity-synthetic-auth.ts", [
      "--operation", "enable", "--migration-run-id", "1", "--idempotency-key", crypto.randomUUID(),
      "--identity-id", "1", "--legacy-account-id", String(ids.account),
    ], { REPL_ID: undefined, REPLIT_DEV_DOMAIN: undefined }],
    ["scripts/patient-portal-identity-attach-second-account.ts", [
      "--run-id", "1", "--identity-id", "1", "--legacy-account-id", String(ids.account),
      "--patient-id", String(ids.patient), "--idempotency-key", crypto.randomUUID(),
      "--reason-code", "environment_gate", "--password", password,
    ], { REPL_ID: undefined, REPLIT_DEV_DOMAIN: undefined }],
  ];
  for (const [script, gateArgs, gateEnv] of gateCases) {
    const rejected = await runScript(script, gateArgs, gateEnv);
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.stderr ?? "", /attested Replit development workspace/);
  }
  assert.deepEqual(await counts(), beforeEnvironmentGates);
  const unbounded = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--dry-run", "--synthetic", "--legacy-account-ids", String(ids.account), "--max-rows", "101",
  ]);
  assert.notEqual(unbounded.code, 0);
  await setFlag(flag, false);
  const disabled = await runScript("scripts/patient-portal-identity-migration.ts", applyArgs);
  assert.notEqual(disabled.code, 0);
  await setFlag(flag, true);
  await q("UPDATE authorization_feature_flags SET expires_at=NOW()-interval '1 second' WHERE flag_key=$1 AND clinic_id IS NULL", [flag]);
  const expired = await runScript("scripts/patient-portal-identity-migration.ts", applyArgs);
  assert.notEqual(expired.code, 0);
  await setFlag(flag, true);
  const beforeRace = await graphCounts();
  const raceArgs = [...applyArgs.slice(0, -1), crypto.randomUUID()];
  const races = await Promise.all([
    runScript("scripts/patient-portal-identity-migration.ts", applyArgs),
    runScript("scripts/patient-portal-identity-migration.ts", raceArgs),
  ]);
  assert.ok(races.some((r) => r.code === 0), "concurrent apply must have a winner");
  assert.equal(await count("patient_portal_identities"), beforeRace.identities + 1);
  assert.equal(await count("patient_portal_identity_legacy_accounts"), beforeRace.mappings + 1);
  const winningApplyArgs = races[0].code === 0 ? applyArgs : raceArgs;
  const winningApplyKey = winningApplyArgs[winningApplyArgs.length - 1];
  const applied = await runScript("scripts/patient-portal-identity-migration.ts", winningApplyArgs);
  assert.equal(applied.code, 0, applied.stderr);
  const graph = await one(`SELECT m.id,m.identity_id AS "identityId",m.migration_state AS state,
    i.session_version AS "sessionVersion",c.password_hash AS "copiedHash"
    FROM patient_portal_identity_legacy_accounts m
    JOIN patient_portal_identities i ON i.id=m.identity_id
    JOIN patient_portal_credentials c ON c.identity_id=i.id AND c.status='active'
    WHERE m.legacy_account_id=$1`, [ids.account]);
  ids.identity = graph.identityId;
  assert.equal(graph.state, "identity_ready");
  assert.equal(graph.copiedHash, original.password_hash, "bcrypt bytes must be copied exactly");
  assert.equal((await one("SELECT id,email,password_hash,is_active FROM patient_portal_accounts WHERE id=$1", [ids.account])).password_hash, original.password_hash);
  const secondOriginal = await one("SELECT id,email,password_hash,is_active FROM patient_portal_accounts WHERE id=$1", [ids.accountTwo]);
  await q("UPDATE patient_portal_accounts SET email=' ' || upper((SELECT email FROM patient_portal_accounts WHERE id=$1)) || ' ' WHERE id=$2", [ids.account, ids.accountTwo]);
  const attachKey = crypto.randomUUID();
  const attachArgs = ["--run-id", String((await one("SELECT id FROM patient_portal_identity_migration_runs WHERE idempotency_key=$1", [winningApplyKey])).id),
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.accountTwo), "--patient-id", String(ids.patientTwo),
    "--idempotency-key", attachKey, "--reason-code", "synthetic_compatibility", "--password", password];
  const attach = await runScript("scripts/patient-portal-identity-attach-second-account.ts", attachArgs);
  assert.equal(attach.code, 0, attach.stderr);
  const attachReplay = await runScript("scripts/patient-portal-identity-attach-second-account.ts", attachArgs);
  assert.equal(attachReplay.code, 0);
  const attachMismatch = await runScript("scripts/patient-portal-identity-attach-second-account.ts", [
    "--run-id", String((await one("SELECT id FROM patient_portal_identity_migration_runs WHERE idempotency_key=$1", [winningApplyKey])).id),
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.accountTwo), "--patient-id", String(ids.patientTwo),
    "--idempotency-key", attachKey, "--reason-code", "changed", "--password", password,
  ]);
  assert.notEqual(attachMismatch.code, 0);
  assert.ok(!`${attachMismatch.stdout}${attachMismatch.stderr}`.includes(email) && !`${attachMismatch.stdout}${attachMismatch.stderr}`.includes(hash));
  const attachBefore = { mappings: await count("patient_portal_identity_legacy_accounts"), relationships: await count("patient_clinic_relationships") };
  const wrongAttach = await runScript("scripts/patient-portal-identity-attach-second-account.ts", [
    "--run-id", String((await one("SELECT id FROM patient_portal_identity_migration_runs WHERE idempotency_key=$1", [winningApplyKey])).id),
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.accountTwo), "--patient-id", String(ids.patientTwo),
    "--idempotency-key", crypto.randomUUID(), "--reason-code", "wrong", "--password", `${password}-wrong`,
  ]);
  assert.notEqual(wrongAttach.code, 0);
  assert.deepEqual({ mappings: await count("patient_portal_identity_legacy_accounts"), relationships: await count("patient_clinic_relationships") }, attachBefore);
  const foreignInsert = await pool.connect();
  let foreignInsertRejected = false;
  try {
    await foreignInsert.query("BEGIN");
    await foreignInsert.query(`INSERT INTO patient_clinic_relationships
      (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,scope,verification_method,verified_at)
      VALUES ($1,$2,$3,'self','active','full_portal','synthetic_foreign',NOW())`,
      [ids.identity, ids.patient, ids.clinicTwo]);
    await foreignInsert.query("COMMIT");
  } catch { foreignInsertRejected = true; await foreignInsert.query("ROLLBACK").catch(() => {}); }
  finally { foreignInsert.release(); }
  assert.equal(foreignInsertRejected, true);
  const foreignUpdate = await pool.connect();
  let foreignUpdateRejected = false;
  try {
    await foreignUpdate.query("BEGIN");
    await foreignUpdate.query("UPDATE patient_clinic_relationships SET patient_id=$1 WHERE portal_identity_id=$2 AND patient_id=$3 AND clinic_id=$4", [ids.patient, ids.identity, ids.patientTwo, ids.clinicTwo]);
    await foreignUpdate.query("COMMIT");
  } catch { foreignUpdateRejected = true; await foreignUpdate.query("ROLLBACK").catch(() => {}); }
  finally { foreignUpdate.release(); }
  assert.equal(foreignUpdateRejected, true);
  const attached = await one(`SELECT m.migration_state AS state,m.credential_compatibility_status AS compatibility,
    m.clinic_id,r.relationship_status AS relationship_status,r.scope,r.verified_at
    FROM patient_portal_identity_legacy_accounts m JOIN patient_clinic_relationships r
      ON r.portal_identity_id=m.identity_id AND r.patient_id=m.patient_id AND r.clinic_id=m.clinic_id
    WHERE m.legacy_account_id=$1`, [ids.accountTwo]);
  assert.deepEqual(attached, { state: "identity_ready", compatibility: "compatible_verified", clinic_id: ids.clinicTwo, relationship_status: "active", scope: "full_portal", verified_at: attached.verified_at });
  assert.equal((await one("SELECT password_hash FROM patient_portal_accounts WHERE id=$1", [ids.accountTwo])).password_hash, secondOriginal.password_hash);
  const compatibilityHashes = await one(`SELECT c.password_hash AS identity_hash,a.password_hash AS second_hash
    FROM patient_portal_credentials c JOIN patient_portal_accounts a ON a.id=$1
    WHERE c.identity_id=$2 AND c.status='active'`, [ids.accountTwo, ids.identity]);
  assert.equal(await bcrypt.compare(password, compatibilityHashes.identity_hash), true);
  assert.equal(await bcrypt.compare(password, compatibilityHashes.second_hash), true);

  const stale = await runScript("scripts/patient-portal-identity-migration.ts", [
    "--apply", "--synthetic", "--legacy-account-ids", String(ids.account), "--max-rows", "1",
    "--report-id", "stale-report", "--idempotency-key", crypto.randomUUID(),
  ]);
  assert.notEqual(stale.code, 0, "changed report/idempotency must reject");
  assert.ok(!`${stale.stdout}${stale.stderr}`.includes(email) && !`${stale.stdout}${stale.stderr}`.includes(hash));
  // Every reviewed correction is required to leave an immutable event.
  const correctedEmail = `${tag}-corrected@example.invalid`;
  const correctionFields: Array<[string, string]> = [
    ["patient_email", correctedEmail], ["identity_email", correctedEmail], ["legacy_account_email", correctedEmail],
    ["patient_clinic", String(ids.clinicTwo)], ["account_patient", String(ids.patientCorrection)],
  ];
  const eventBefore = await count("patient_portal_identity_migration_events");
  let firstCorrectionKey = "";
  for (const [field, value] of correctionFields) {
    const correctionKey = crypto.randomUUID();
    if (!firstCorrectionKey) firstCorrectionKey = correctionKey;
    const correction = await runScript("scripts/patient-portal-identity-source-correction.ts", [
      "--field", field, "--idempotency-key", correctionKey, "--identity-id", String(ids.identity),
      "--legacy-account-id", String(ids.account), "--patient-id", String(ids.patient), "--reason-code", "synthetic_review", "--value", value,
    ]);
    assert.equal(correction.code, 0, correction.stderr);
  }
  assert.equal(await count("patient_portal_identity_migration_events"), eventBefore + 5);
  assert.equal(Number((await one(`SELECT count(*) FROM patient_clinic_relationships
    WHERE portal_identity_id=$1 AND patient_id=$2 AND clinic_id=$3
      AND relationship_status='active' AND scope='full_portal'`, [ids.identity, ids.patientCorrection, ids.clinicTwo])).count), 1);
  const correctionReplay = await runScript("scripts/patient-portal-identity-source-correction.ts", [
    "--field", "patient_email", "--idempotency-key", firstCorrectionKey, "--identity-id", String(ids.identity),
    "--legacy-account-id", String(ids.account), "--patient-id", String(ids.patient), "--reason-code", "synthetic_review", "--value", correctedEmail,
  ]);
  assert.equal(correctionReplay.code, 0);
  assert.equal(await count("patient_portal_identity_migration_events"), eventBefore + 5);
  const correctionMismatch = await runScript("scripts/patient-portal-identity-source-correction.ts", [
    "--field", "identity_email", "--idempotency-key", firstCorrectionKey, "--identity-id", String(ids.identity),
    "--legacy-account-id", String(ids.account), "--patient-id", String(ids.patient), "--reason-code", "different_review", "--value", email,
  ]);
  assert.notEqual(correctionMismatch.code, 0);
  assert.ok(!`${correctionMismatch.stdout}${correctionMismatch.stderr}`.includes(email) && !`${correctionMismatch.stdout}${correctionMismatch.stderr}`.includes(hash));

  const run = await one("SELECT id FROM patient_portal_identity_migration_runs WHERE idempotency_key=$1 AND synthetic=true AND status='completed'", [winningApplyKey]);
  const enableKey = crypto.randomUUID();
  const rollbackKey = crypto.randomUUID();
  const syntheticArgs = ["--migration-run-id", String(run.id), "--idempotency-key", enableKey,
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.account)];
  const enable = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "enable", ...syntheticArgs]);
  assert.equal(enable.code, 0, enable.stderr);
  const enableReplay = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "enable", ...syntheticArgs]);
  assert.equal(enableReplay.code, 0);
  const enableMismatch = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "enable",
    "--migration-run-id", String(run.id), "--idempotency-key", syntheticArgs[3],
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.accountTwo)]);
  assert.notEqual(enableMismatch.code, 0);
  assert.ok(!`${enableMismatch.stdout}${enableMismatch.stderr}`.includes(email) && !`${enableMismatch.stdout}${enableMismatch.stderr}`.includes(hash));
  const eventsBeforeEnabledCorrection = await count("patient_portal_identity_migration_events");
  const enabledCorrection = await runScript("scripts/patient-portal-identity-source-correction.ts", [
    "--field", "patient_email", "--idempotency-key", crypto.randomUUID(), "--identity-id", String(ids.identity),
    "--legacy-account-id", String(ids.accountTwo), "--patient-id", String(ids.patientTwo),
    "--reason-code", "enabled_sibling_rejection", "--value", `${correctedEmail}-enabled`,
  ]);
  assert.notEqual(enabledCorrection.code, 0);
  assert.ok(!`${enabledCorrection.stdout}${enabledCorrection.stderr}`.includes(email) && !`${enabledCorrection.stdout}${enabledCorrection.stderr}`.includes(hash));
  assert.equal(await count("patient_portal_identity_migration_events"), eventsBeforeEnabledCorrection);
  assert.equal((await one("SELECT lower(trim(email)) AS email FROM patient_portal_accounts WHERE id=$1", [ids.accountTwo])).email, correctedEmail);
  const rejectGraphDelete = async (statement: string, params: unknown[]) => {
    const deleter = await pool.connect();
    let rejected = false;
    try {
      await deleter.query("BEGIN");
      await deleter.query(statement, params);
      await deleter.query("COMMIT");
    } catch {
      rejected = true;
      await deleter.query("ROLLBACK").catch(() => {});
    } finally { deleter.release(); }
    return rejected;
  };
  assert.equal(await rejectGraphDelete("DELETE FROM patient_portal_identity_legacy_accounts WHERE identity_id=$1", [ids.identity]), true);
  assert.equal(await rejectGraphDelete(`DELETE FROM patient_portal_accounts
    WHERE id IN (SELECT legacy_account_id FROM patient_portal_identity_legacy_accounts WHERE identity_id=$1)`, [ids.identity]), true);
  const auth = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "auth", ...syntheticArgs, "--password", password]);
  assert.equal(auth.code, 0, auth.stderr);
  assert.match(auth.stdout, /synthetic_identity/);
  const syntheticSession = await one("SELECT session_version AS version,identity_id,mapping_id,migration_run_id,expires_at,revoked_at FROM patient_portal_identity_synthetic_sessions WHERE identity_id=$1 ORDER BY id DESC LIMIT 1", [ids.identity]);
  assert.equal(syntheticSession.mapping_id, graph.id);
  assert.equal(syntheticSession.migration_run_id, run.id);
  assert.ok(new Date(syntheticSession.expires_at).getTime() > Date.now());
  const wrong = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "auth", ...syntheticArgs, "--password", `${password}-wrong`]);
  assert.notEqual(wrong.code, 0);
  assert.ok(!`${wrong.stdout}${wrong.stderr}`.includes(email) && !`${wrong.stdout}${wrong.stderr}`.includes(hash));
  const rollbackArgs = ["--migration-run-id", String(run.id), "--idempotency-key", rollbackKey,
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.account)];
  const rollback = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "rollback", ...rollbackArgs]);
  assert.equal(rollback.code, 0, rollback.stderr);
  const rollbackReplay = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "rollback", ...rollbackArgs]);
  assert.equal(rollbackReplay.code, 0);
  const rollbackMismatch = await runScript("scripts/patient-portal-identity-synthetic-auth.ts", ["--operation", "rollback",
    "--migration-run-id", String(run.id), "--idempotency-key", rollbackKey,
    "--identity-id", String(ids.identity), "--legacy-account-id", String(ids.accountTwo)]);
  assert.notEqual(rollbackMismatch.code, 0);
  const afterRollback = await one(`SELECT min(m.migration_state) AS state,i.session_version AS "sessionVersion",
    count(*) AS mappings,
    (SELECT count(*) FROM patient_portal_credentials WHERE identity_id=$1 AND status='active') AS credentials,
    (SELECT count(*) FROM patient_clinic_relationships WHERE portal_identity_id=$1 AND relationship_status='active') AS relationships,
    (SELECT count(*) FROM patient_portal_identity_synthetic_sessions WHERE identity_id=$1 AND revoked_at IS NULL) AS sessions
    FROM patient_portal_identity_legacy_accounts m JOIN patient_portal_identities i ON i.id=m.identity_id
    WHERE m.identity_id=$1 GROUP BY i.session_version`, [ids.identity]);
  assert.equal(afterRollback.state, "rollback_legacy");
  assert.equal(Number(afterRollback.mappings), 2);
  assert.equal(Number(afterRollback.credentials), 0);
  assert.equal(Number(afterRollback.relationships), 0);
  assert.equal(Number(afterRollback.sessions), 0);
  assert.ok(Number(afterRollback.sessionVersion) > Number(graph.sessionVersion));
  const correctedAccount = await one("SELECT id,email,password_hash,is_active,patient_id FROM patient_portal_accounts WHERE id=$1", [ids.account]);
  assert.equal(correctedAccount.id, original.id);
  assert.equal(correctedAccount.password_hash, original.password_hash);
  assert.equal(correctedAccount.is_active, original.is_active);
  assert.equal(correctedAccount.email, correctedEmail);
  assert.equal(correctedAccount.patient_id, ids.patientCorrection);
  evidence = { result: "passed", gates: ["environment", "arguments", "max_rows", "flag", "report", "idempotency", "race"], lifecycle: ["identity_ready", "identity_enabled", "rollback_legacy"], corrections: 5, counts: { before, after: null } };
} finally {
  await cleanup();
}
const after = await counts();
assert.deepEqual(after, before);
evidence.counts = { before, after };
console.log(JSON.stringify(evidence));
await pool.end();