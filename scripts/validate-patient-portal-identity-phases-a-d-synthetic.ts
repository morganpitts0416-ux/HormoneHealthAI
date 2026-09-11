/*
 * Local-only, destructive-test-safe validator for portal identity Phases A-D.
 * Output is deliberately limited to statuses, reason counts, and row counts.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import bcrypt from "bcrypt";

const run = promisify(execFile);
const baseUrl = process.env.SYNTHETIC_BASE_URL || "http://127.0.0.1:5000";
if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseUrl) ||
    !process.env.DATABASE_URL || process.env.NODE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT === "1") {
  throw new Error("synthetic validation requires a local development target");
}

const { Pool, Client } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const tag = `SYNTH-PORTAL-ID-${Date.now()}`;
const emailOnlyLocal = `${tag.toLowerCase()}@example.invalid`;
const malformedEmail = `${tag.toLowerCase()}-malformed@example.invalid`;
const conflictingEmail = `${tag.toLowerCase()}-conflict@example.invalid`;
const password = `Synthetic-${Date.now()}-Aa1!`;
const flagKey = "SHADOW_PATIENT_IDENTITY_LOGIN";
const ids: Record<string, number> = {};
const sessions: string[] = [];
let priorFlag: any = null;
let hadFlag = false;
let reportedClassifications: Record<string, number> = {};
let reportedShadowReasons: Record<string, number> = {};
const loginStatuses: Record<string, number> = {};

async function q(text: string, values: unknown[] = []) { return pool.query(text, values); }
async function one(text: string, values: unknown[] = []) {
  const result = await q(text, values);
  assert.ok(result.rows[0], "synthetic insert returned no row");
  return result.rows[0] as Record<string, any>;
}
async function counts(): Promise<Record<string, number>> {
  const names = [
    "users", "patient_portal_accounts", "patients", "patient_portal_identities",
    "patient_portal_identity_legacy_accounts", "patient_clinic_relationships",
    "patient_portal_relationship_events", "access_review_queue",
    "patient_portal_identity_shadow_decisions",
  ];
  const result: Record<string, number> = {};
  for (const name of names) {
    const exists = await q("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${name}`]);
    result[name] = exists.rows[0].present ? Number((await q(`SELECT count(*)::int AS n FROM ${name}`)).rows[0].n) : 0;
  }
  result.sessions = Number((await q('SELECT count(*)::int AS n FROM "session"')).rows[0].n);
  const credentials = await q("SELECT to_regclass('public.patient_portal_credentials') IS NOT NULL AS present");
  result.credentials = credentials.rows[0].present
    ? Number((await q("SELECT count(*)::int AS n FROM patient_portal_credentials")).rows[0].n) : 0;
  return result;
}
function cookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(value, "legacy login did not establish a session");
  const raw = value.slice(value.indexOf("=") + 1);
  const sid = decodeURIComponent(raw).replace(/^s:/, "").split(".")[0];
  if (sid) sessions.push(sid);
  return value;
}
async function login(email: string, suppliedPassword = password): Promise<{ status: number; shape: string; message: unknown; patientId: unknown; cookie: string; sid: string }> {
  const response = await fetch(`${baseUrl}/api/portal/login`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: suppliedPassword }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({}));
  const sessionCookie = response.ok ? cookie(response) : "";
  const sid = sessionCookie ? decodeURIComponent(sessionCookie.split("=")[1]).replace(/^s:/, "").split(".")[0] : "";
  return {
    status: response.status,
    shape: JSON.stringify(Object.keys(payload).sort()),
    message: payload.message,
    patientId: payload.patientId,
    cookie: sessionCookie,
    sid,
  };
}
async function setFlag(enabled: boolean) {
  const existing = await q("SELECT * FROM authorization_feature_flags WHERE flag_key=$1 AND clinic_id IS NULL", [flagKey]);
  if (!hadFlag) {
    hadFlag = true;
    priorFlag = existing.rows[0] ?? null;
  }
  if (existing.rows[0]) {
    await q("UPDATE authorization_feature_flags SET enabled=$1,expires_at=NULL,reason=$2,updated_at=NOW() WHERE id=$3", [enabled, tag, existing.rows[0].id]);
  } else {
    await q("INSERT INTO authorization_feature_flags (flag_key,enabled,reason) VALUES ($1,$2,$3)", [flagKey, enabled, tag]);
  }
}
async function restoreFlag() {
  if (!hadFlag) return;
  if (priorFlag) {
    await q(`UPDATE authorization_feature_flags
      SET enabled=$1,expires_at=$2,reason=$3,approved_by_user_id=$4,created_at=$5,updated_at=$6 WHERE id=$7`,
      [priorFlag.enabled, priorFlag.expires_at, priorFlag.reason, priorFlag.approved_by_user_id,
       priorFlag.created_at, priorFlag.updated_at, priorFlag.id]);
  } else {
    await q("DELETE FROM authorization_feature_flags WHERE flag_key=$1 AND clinic_id IS NULL AND reason=$2", [flagKey, tag]);
  }
}
async function executeDryRun(extra: string): Promise<{ code: number; output: string }> {
  try {
    const result = await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/dry-run-patient-portal-identity-migration.ts", extra], {
      env: process.env, timeout: 120_000, maxBuffer: 1024 * 1024,
    });
    return { code: 0, output: result.stdout };
  } catch (error: any) {
    return { code: Number(error.code ?? 1), output: String(error.stdout ?? "") };
  }
}
async function waitForShadow(minimum: number) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n);
    if (current >= minimum) return current;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n);
}
async function waitForReasons(identityIds: number[], required: string[]) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const rows = await q("SELECT DISTINCT reason_code FROM patient_portal_identity_shadow_decisions WHERE identity_id = ANY($1)", [identityIds]);
    const found = new Set(rows.rows.map((r) => r.reason_code));
    if (required.every((reason) => found.has(reason))) return found;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return new Set((await q("SELECT DISTINCT reason_code FROM patient_portal_identity_shadow_decisions WHERE identity_id = ANY($1)", [identityIds])).rows.map((r) => r.reason_code));
}
async function cleanup() {
  try {
    if (sessions.length) await q('DELETE FROM "session" WHERE sid = ANY($1)', [sessions]);
    const syntheticLegacyAccountIds = [
      ids.legacyOnly, ids.malformed, ids.conflicting, ids.duplicateSame,
      ids.duplicateSameTwo, ids.duplicateCross, ids.inactive, ids.noHash,
      ids.missingOwnerAccount,
    ].filter(Number.isInteger);
    if (syntheticLegacyAccountIds.length) {
      await q("DELETE FROM patient_portal_identity_shadow_decisions WHERE legacy_account_id = ANY($1)", [syntheticLegacyAccountIds]);
    }
    if (ids.identityConflict) await q("DELETE FROM patient_portal_identity_shadow_decisions WHERE identity_id=$1", [ids.identityConflict]);
    if (ids.identityMalformed) await q("DELETE FROM patient_portal_identity_shadow_decisions WHERE identity_id=$1", [ids.identityMalformed]);
    for (const identity of [ids.identityConflict, ids.identityMalformed].filter(Number.isInteger)) {
      await q("DELETE FROM patient_portal_identities WHERE id=$1", [identity]);
    }
    await q("DELETE FROM patient_portal_accounts WHERE id = ANY($1)", [syntheticLegacyAccountIds]);
    await q("DELETE FROM patients WHERE id = ANY($1)", [[ids.patientOnly, ids.patientMalformed, ids.patientConflict, ids.patientDuplicateSame, ids.patientDuplicateSameTwo, ids.patientDuplicateCross, ids.patientInactive, ids.patientNoHash, ids.patientMissingOwner].filter(Number.isInteger)]);
    if (ids.clinic || ids.clinicTwo) await q("DELETE FROM clinics WHERE id = ANY($1)", [[ids.clinic, ids.clinicTwo].filter(Number.isInteger)]);
    if (ids.user) await q("DELETE FROM users WHERE id=$1", [ids.user]);
  } finally {
    await restoreFlag();
  }
}

const before = await counts();
const baselineDryRun = await executeDryRun("--dry-run");
assert.equal(baselineDryRun.code, 0);
const baselineDryRunReport = JSON.parse(baselineDryRun.output.trim()) as { classifications: Record<string, number> };
try {
  const hash = await bcrypt.hash(password, 10);
  ids.user = (await one(
    "INSERT INTO users (email,username,password_hash,first_name,last_name,title,clinic_name,subscription_status,free_account,notes) VALUES ($1,$2,$3,'Synthetic','Portal','NP',$4,'active',true,$5) RETURNING id",
    [`${tag.toLowerCase()}-owner@example.invalid`, `${tag.toLowerCase()}-owner`, hash, tag, tag],
  )).id;
  ids.clinic = (await one("INSERT INTO clinics (name,slug,owner_user_id,is_active) VALUES ($1,$2,$3,true) RETURNING id", [tag, tag.toLowerCase(), ids.user])).id;
  ids.clinicTwo = (await one("INSERT INTO clinics (name,slug,owner_user_id,is_active) VALUES ($1,$2,$3,true) RETURNING id", [`${tag}-Two`, `${tag.toLowerCase()}-two`, ids.user])).id;
  const patient = async (email: string, suffix: string) => one(
    "INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn) VALUES ($1,'Synthetic',$2,'female',$3,$4,$5) RETURNING id",
    [ids.user, suffix, email, ids.clinic, `${tag}-${suffix}`],
  );
  ids.patientOnly = (await patient(emailOnlyLocal, "Only")).id;
  ids.patientMalformed = (await patient(malformedEmail, "Malformed")).id;
  ids.patientConflict = (await patient(conflictingEmail, "Conflict")).id;
  const account = async (patientId: number, email: string) => one(
    "INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active) VALUES ($1,$2,$3,true) RETURNING id",
    [patientId, email, hash],
  );
  ids.legacyOnly = (await account(ids.patientOnly, emailOnlyLocal)).id;
  ids.malformed = (await account(ids.patientMalformed, malformedEmail)).id;
  ids.conflicting = (await account(ids.patientConflict, conflictingEmail)).id;
  ids.patientInactive = (await patient(`${tag.toLowerCase()}-inactive@example.invalid`, "Inactive")).id;
  ids.inactive = (await account(ids.patientInactive, `${tag.toLowerCase()}-inactive@example.invalid`)).id;
  await q("UPDATE patient_portal_accounts SET is_active=false WHERE id=$1", [ids.inactive]);
  ids.patientNoHash = (await patient(`${tag.toLowerCase()}-nohash@example.invalid`, "NoHash")).id;
  ids.noHash = (await one(
    "INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active) VALUES ($1,$2,NULL,true) RETURNING id",
    [ids.patientNoHash, `${tag.toLowerCase()}-nohash@example.invalid`],
  )).id;
  ids.patientMissingOwner = (await one(
    "INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn) VALUES ($1,'Synthetic','MissingOwner','female',NULL,$2,$3) RETURNING id",
    [ids.user, null, `${tag}-MissingOwner`],
  )).id;
  await q("UPDATE patients SET clinic_id=NULL WHERE id=$1", [ids.patientMissingOwner]);
  ids.missingOwnerAccount = (await one(
    "INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active) VALUES ($1,$2,$3,true) RETURNING id",
    [ids.patientMissingOwner, `${tag.toLowerCase()}-missing-owner@example.invalid`, hash],
  )).id;
  const duplicateEmail = `${tag.toLowerCase()}-duplicate@example.invalid`;
  ids.patientDuplicateSame = (await patient(duplicateEmail, "DuplicateSame")).id;
  ids.patientDuplicateSameTwo = (await patient(duplicateEmail, "DuplicateSameTwo")).id;
  ids.patientDuplicateCross = (await one(
    "INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn) VALUES ($1,'Synthetic','DuplicateCross','female',$2,$3,$4) RETURNING id",
    [ids.user, duplicateEmail, ids.clinicTwo, `${tag}-DuplicateCross`],
  )).id;
  ids.duplicateSame = (await account(ids.patientDuplicateSame, ` ${duplicateEmail.toUpperCase()} `)).id;
  ids.duplicateSameTwo = (await account(ids.patientDuplicateSameTwo, ` ${duplicateEmail} `)).id;
  ids.duplicateCross = (await one(
    "INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active) VALUES ($1,$2,$3,true) RETURNING id",
    [ids.patientDuplicateCross, duplicateEmail, await bcrypt.hash(`${password}-different`, 10)],
  )).id;
  ids.identityMalformed = (await one("INSERT INTO patient_portal_identities (normalized_email,account_status,verification_status) VALUES ($1,'pending','unverified') RETURNING id", [malformedEmail])).id;
  ids.identityConflict = (await one("INSERT INTO patient_portal_identities (normalized_email,account_status,verification_status) VALUES ($1,'active','conflicting') RETURNING id", [conflictingEmail])).id;
  await q(`INSERT INTO patient_portal_identity_legacy_accounts
    (identity_id,legacy_account_id,patient_id,clinic_id,migration_state,credential_compatibility_status,provenance_run_key,conflicted_at)
    VALUES ($1,$2,$3,$4,'conflicting','unknown',$5,NOW())`,
    [ids.identityConflict, ids.conflicting, ids.patientConflict, ids.clinic, tag]);
  let provenanceRejected = false;
  try {
    await q("UPDATE patient_portal_identity_legacy_accounts SET patient_id=$1 WHERE legacy_account_id=$2", [ids.patientOnly, ids.conflicting]);
  } catch {
    provenanceRejected = true;
  }
  assert.equal(provenanceRejected, true);
  const sourceRejections: Record<string, boolean> = {};
  const mutations: Array<[string, string, unknown[]]> = [
    ["account_patient", "UPDATE patient_portal_accounts SET patient_id=$1 WHERE id=$2", [ids.patientOnly, ids.conflicting]],
    ["account_email", "UPDATE patient_portal_accounts SET email=$1 WHERE id=$2", [`${tag.toLowerCase()}-drift@example.invalid`, ids.conflicting]],
    ["patient_clinic", "UPDATE patients SET clinic_id=$1 WHERE id=$2", [ids.clinicTwo, ids.patientConflict]],
    ["identity_email", "UPDATE patient_portal_identities SET normalized_email=$1 WHERE id=$2", [`${tag.toLowerCase()}-drift@example.invalid`, ids.identityConflict]],
  ];
  for (const [name, statement, values] of mutations) {
    try { await q(statement, values); }
    catch { sourceRejections[name] = true; }
  }
  assert.deepEqual(sourceRejections, { account_patient: true, account_email: true, patient_clinic: true, identity_email: true });
  await q("DELETE FROM patient_portal_identity_legacy_accounts WHERE legacy_account_id=$1", [ids.conflicting]);
  const insertClient = new Client({ connectionString: process.env.DATABASE_URL });
  const updateClient = new Client({ connectionString: process.env.DATABASE_URL });
  await Promise.all([insertClient.connect(), updateClient.connect()]);
  let concurrentUpdateSettled = false;
  let concurrentUpdateRejected = false;
  try {
    await insertClient.query("BEGIN");
    await insertClient.query(`INSERT INTO patient_portal_identity_legacy_accounts
      (identity_id,legacy_account_id,patient_id,clinic_id,migration_state,credential_compatibility_status,provenance_run_key,conflicted_at)
      VALUES ($1,$2,$3,$4,'conflicting','unknown',$5,NOW())`,
      [ids.identityConflict, ids.conflicting, ids.patientConflict, ids.clinic, tag]);
    const concurrentUpdate = updateClient.query(
      "UPDATE patient_portal_accounts SET email=$1 WHERE id=$2",
      [`${tag.toLowerCase()}-concurrent-drift@example.invalid`, ids.conflicting],
    ).then(
      () => { concurrentUpdateSettled = true; },
      () => { concurrentUpdateSettled = true; concurrentUpdateRejected = true; },
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(concurrentUpdateSettled, false, "source update must wait for the mapping transaction");
    await insertClient.query("COMMIT");
    await concurrentUpdate;
    assert.equal(concurrentUpdateRejected, true, "source update must reject after concurrent mapping commit");
  } finally {
    await insertClient.query("ROLLBACK").catch(() => {});
    await Promise.all([insertClient.end(), updateClient.end()]);
  }
  await q(`INSERT INTO patient_clinic_relationships
    (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,scope,verified_at)
    VALUES ($1,$2,$3,'self','active','full_portal',NOW())`,
    [ids.identityConflict, ids.patientConflict, ids.clinicTwo]);

  const off = await login(emailOnlyLocal);
  loginStatuses.legacyOnlyShadowOff = off.status;
  assert.equal(off.status, 200);
  const offSession = await q('SELECT sess FROM "session" WHERE sid=$1', [off.sid]);
  assert.equal(offSession.rows.length, 1);
  assert.equal(Number(offSession.rows[0].sess.portalPatientId), ids.patientOnly);
  assert.equal(Object.keys(offSession.rows[0].sess).some((key) => /identity/i.test(key)), false);
  assert.deepEqual(off.shape, JSON.stringify(["message", "patientId"]));
  assert.equal(off.message, "Logged in");
  assert.equal(Number(off.patientId), ids.patientOnly);
  await setFlag(true);
  await q("UPDATE authorization_feature_flags SET expires_at=NOW()-interval '1 minute' WHERE flag_key=$1 AND clinic_id IS NULL", [flagKey]);
  const expiredShadowCount = Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n);
  const expiredFlagLogin = await login(emailOnlyLocal);
  loginStatuses.expiredShadowFlag = expiredFlagLogin.status;
  assert.equal(expiredFlagLogin.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n), expiredShadowCount);
  await setFlag(true);
  const shadowBefore = (await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n;
  const noIdentity = await login(emailOnlyLocal);
  assert.equal(noIdentity.status, 200);
  const afterNoIdentity = await waitForShadow(Number(shadowBefore) + 1);
  const wrongBefore = await q("SELECT last_login_at FROM patient_portal_accounts WHERE id=$1", [ids.malformed]);
  const wrong = await login(malformedEmail, `${password}-wrong`);
  loginStatuses.wrongPassword = wrong.status;
  assert.equal(wrong.status, 401);
  assert.equal(wrong.cookie, "");
  assert.equal(Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n), Number(afterNoIdentity));
  assert.equal((await q("SELECT last_login_at FROM patient_portal_accounts WHERE id=$1", [ids.malformed])).rows[0].last_login_at, wrongBefore.rows[0].last_login_at);
  const malformed = await login(malformedEmail);
  const conflicting = await login(conflictingEmail);
  loginStatuses.incompleteIdentity = malformed.status;
  loginStatuses.conflictingIdentity = conflicting.status;
  const shadowAfter = await waitForShadow(Number(shadowBefore) + 1);
  assert.equal(malformed.status, 200);
  assert.equal(conflicting.status, 200);
  assert.equal(malformed.shape, off.shape);
  assert.equal(conflicting.shape, off.shape);
  assert.equal(malformed.message, off.message);
  assert.equal(conflicting.message, off.message);
  assert.equal(Number(malformed.patientId), ids.patientMalformed);
  assert.equal(Number(conflicting.patientId), ids.patientConflict);
  assert.ok(Number(shadowAfter) > Number(shadowBefore));
  for (const result of [malformed, conflicting]) {
    const stored = await q('SELECT sess FROM "session" WHERE sid=$1', [result.sid]);
    assert.equal(Number(stored.rows[0].sess.portalPatientId), result === malformed ? ids.patientMalformed : ids.patientConflict);
    assert.equal(Object.keys(stored.rows[0].sess).some((key) => /identity/i.test(key)), false);
  }
  const reasons = await waitForReasons(
    [ids.identityMalformed, ids.identityConflict],
    ["identity_candidate_found", "linkage_missing", "linkage_conflicting", "relationship_conflicting"],
  );
  assert.ok(reasons.has("identity_candidate_found") && reasons.has("linkage_missing") && reasons.has("linkage_conflicting") && reasons.has("relationship_conflicting"));
  const reasonRows = (await q("SELECT reason_code, count(*)::int AS count FROM patient_portal_identity_shadow_decisions WHERE identity_id IN ($1,$2) GROUP BY reason_code", [ids.identityMalformed, ids.identityConflict])).rows;
  reportedShadowReasons = Object.fromEntries(reasonRows.map((r) => [r.reason_code, Number(r.count)]));
  const malformedLoginAt = (await q("SELECT last_login_at FROM patient_portal_accounts WHERE id=$1", [ids.malformed])).rows[0].last_login_at;
  assert.ok(malformedLoginAt);
  await setFlag(false);
  const offShadowCount = Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n);
  const offAgain = await login(emailOnlyLocal);
  loginStatuses.legacyOnlyAfterShadowDisable = offAgain.status;
  assert.equal(offAgain.status, off.status);
  assert.equal(offAgain.shape, off.shape);
  assert.equal(Number((await q("SELECT count(*)::int AS n FROM patient_portal_identity_shadow_decisions")).rows[0].n), offShadowCount);
  const dryBefore = await counts();
  const dry = await executeDryRun("--dry-run");
  assert.equal(dry.code, 0);
  assert.match(dry.output, /"mode":"dry-run"/);
  const dryReport = JSON.parse(dry.output.trim()) as { classifications: Record<string, number> };
  reportedClassifications = dryReport.classifications;
  const requiredCategories = [
    "clearly_eligible_single_legacy_account", "same_email_separate_patients_different_clinics",
    "multiple_legacy_accounts_potential_one_person", "shared_family_email", "same_clinic_duplicates",
    "missing_patient_or_clinic", "identity_or_linkage_conflict", "credential_compatibility_unknown",
    "must_remain_legacy_only",
  ];
  for (const category of requiredCategories) assert.ok(Object.prototype.hasOwnProperty.call(dryReport.classifications, category));
  assert.equal(
    dryReport.classifications.clearly_eligible_single_legacy_account,
    baselineDryRunReport.classifications.clearly_eligible_single_legacy_account + 1,
    "only the valid synthetic no-identity account may add to clearly eligible",
  );
  assert.ok(dryReport.classifications.same_email_separate_patients_different_clinics > 0);
  assert.ok(dryReport.classifications.same_clinic_duplicates > 0);
  assert.ok(dryReport.classifications.shared_family_email > 0);
  assert.ok(dryReport.classifications.credential_compatibility_unknown > 0);
  const dryAfter = await counts();
  assert.deepEqual(dryAfter, dryBefore);
  const rejected = await executeDryRun("--apply");
  assert.notEqual(rejected.code, 0);
  assert.deepEqual(await counts(), dryAfter);
} finally {
  await cleanup();
}
const after = await counts();
assert.deepEqual(after, before);
console.log(JSON.stringify({
  result: "passed",
  loginStatuses,
  schemaPreventedShadowReasons: ["multiple_candidates"],
  shadowReasonCounts: reportedShadowReasons,
  dryRunClassifications: reportedClassifications,
  counts: { before, after },
}));
await pool.end();