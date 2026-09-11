import bcrypt from "bcrypt";
import crypto from "node:crypto";
import pg from "pg";
import { requireReplitDevelopmentWorkspace } from "./patient-portal-identity-environment";

const args = process.argv.slice(2);
const allowed = new Set(["--operation", "--identity-id", "--legacy-account-id", "--migration-run-id", "--idempotency-key", "--password", "--session-token"]);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error("unknown argument");
  i++;
}
const arg = (name: string) => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1] ?? null; };
const operation = arg("--operation");
if (!["enable", "auth", "rollback"].includes(operation ?? "")) throw new Error("operation must be enable, auth, or rollback");
const identityId = Number(arg("--identity-id")), accountId = Number(arg("--legacy-account-id")), runId = Number(arg("--migration-run-id"));
const key = arg("--idempotency-key"), password = arg("--password"), token = arg("--session-token");
if (![identityId, accountId, runId].every(Number.isSafeInteger) || [identityId, accountId, runId].some((n) => n < 1)) throw new Error("positive identity, account, and migration run IDs are required");
if (!key || !/^[0-9a-f-]{36}$/i.test(key)) throw new Error("UUID idempotency key is required");
if (operation === "auth" && !password && !token) throw new Error("auth requires password or session token");
if (operation !== "auth" && (password || token)) throw new Error("password/session-token is only valid for auth");
requireReplitDevelopmentWorkspace("synthetic identity operation");

const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ operation, identityId, accountId, runId, password: password ? crypto.createHash("sha256").update(password).digest("hex") : null, token })).digest("hex");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const flag = await client.query("SELECT enabled,expires_at FROM authorization_feature_flags WHERE flag_key='patient_portal_identity_synthetic_auth_v1' AND clinic_id IS NULL");
  if (!flag.rows[0]?.enabled || (flag.rows[0].expires_at && new Date(flag.rows[0].expires_at) <= new Date())) throw new Error("synthetic flag disabled or expired");
  const prior = await client.query(`SELECT e.reason_code,e.new_state FROM patient_portal_identity_migration_events e
    JOIN patient_portal_identity_migration_runs r ON r.id=e.run_id
    WHERE r.idempotency_key=$1 AND r.operation=$2 FOR UPDATE`, [key, operation]);
  if (prior.rows.length) {
    if (prior.rows[0].reason_code !== fingerprint) throw new Error("idempotency key arguments changed");
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: "completed", operation, identityId, idempotent: true }));
    process.exit(0);
  }
  const graph = await client.query(`SELECT m.id,m.migration_state,m.patient_id,m.clinic_id,m.migration_run_id,
      i.normalized_email,i.session_version,i.account_status,i.verification_status,a.email
    FROM patient_portal_identity_legacy_accounts m
    JOIN patient_portal_identities i ON i.id=m.identity_id
    JOIN patient_portal_accounts a ON a.id=m.legacy_account_id
    WHERE m.identity_id=$1 AND m.legacy_account_id=$2 AND m.migration_run_id=$3
    FOR UPDATE`, [identityId, accountId, runId]);
  const row = graph.rows[0];
  if (!row || !String(row.normalized_email).trim().toLowerCase().endsWith(".invalid")) throw new Error("exact synthetic graph required");
  const run = await client.query("SELECT id FROM patient_portal_identity_migration_runs WHERE id=$1 AND synthetic=true AND status='completed'", [runId]);
  if (!run.rows[0]) throw new Error("exact completed synthetic migration run required");
  const operationRun = operation === "auth" ? null : (await client.query(`INSERT INTO patient_portal_identity_migration_runs
    (run_id,idempotency_key,report_id,cohort_fingerprint,account_ids,max_rows,operation,status,synthetic)
    VALUES ($1,$2,$3,$3,$4,1,$5,'started',true) RETURNING id`,
    [crypto.randomUUID(), key, fingerprint, [accountId], operation])).rows[0];
  if (operation === "enable") {
    const c = await client.query("SELECT id FROM patient_portal_credentials WHERE identity_id=$1 AND status='active'", [identityId]);
    const rel = await client.query("SELECT id FROM patient_clinic_relationships WHERE portal_identity_id=$1 AND patient_id=$2 AND clinic_id=$3 AND relationship_status='active' AND scope='full_portal' AND revoked_at IS NULL", [identityId, row.patient_id, row.clinic_id]);
    if (row.migration_state !== "identity_ready" || c.rows.length !== 1 || rel.rows.length !== 1) throw new Error("identity is not ready to enable");
    await client.query("UPDATE patient_portal_identity_legacy_accounts SET migration_state='identity_enabled',enabled_at=NOW(),updated_at=NOW() WHERE id=$1", [row.id]);
  } else if (operation === "rollback") {
    await client.query("UPDATE patient_portal_identity_synthetic_sessions SET revoked_at=NOW() WHERE identity_id=$1 AND revoked_at IS NULL", [identityId]);
    await client.query("UPDATE patient_portal_credentials SET status='revoked',revoked_at=NOW(),updated_at=NOW() WHERE identity_id=$1 AND status='active'", [identityId]);
    await client.query("UPDATE patient_clinic_relationships SET relationship_status='revoked',scope='historical_read',revoked_at=NOW(),updated_at=NOW() WHERE portal_identity_id=$1 AND relationship_status='active'", [identityId]);
    await client.query("UPDATE patient_portal_identity_legacy_accounts SET migration_state='rollback_legacy',rolled_back_at=NOW(),updated_at=NOW() WHERE identity_id=$1", [identityId]);
    await client.query("UPDATE patient_portal_identities SET session_version=session_version+1,updated_at=NOW() WHERE id=$1", [identityId]);
  } else {
    if (row.migration_state !== "identity_enabled") throw new Error("identity is not enabled");
    const c = await client.query("SELECT password_hash FROM patient_portal_credentials WHERE identity_id=$1 AND status='active'", [identityId]);
    const rel = await client.query("SELECT id FROM patient_clinic_relationships WHERE portal_identity_id=$1 AND relationship_status='active' AND scope='full_portal' AND revoked_at IS NULL", [identityId]);
    let valid = false;
    if (token) {
      const s = await client.query("SELECT id FROM patient_portal_identity_synthetic_sessions WHERE session_token=$1::uuid AND identity_id=$2 AND session_version=$3 AND revoked_at IS NULL AND expires_at>NOW()", [token, identityId, row.session_version]);
      valid = s.rows.length === 1;
    } else valid = c.rows.length === 1 && rel.rows.length > 0 && await bcrypt.compare(password!, c.rows[0].password_hash);
    if (!valid || !c.rows.length || !rel.rows.length) throw new Error("synthetic identity authentication denied");
    const session = crypto.randomUUID();
    await client.query("INSERT INTO patient_portal_identity_synthetic_sessions (session_token,session_version,identity_id,mapping_id,migration_run_id,expires_at) VALUES ($1,$2,$3,$4,$5,NOW()+INTERVAL '1 hour')", [session, row.session_version, identityId, row.id, runId]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: "authenticated", principal: "synthetic_identity", identityId, sessionToken: session }));
    process.exit(0);
  }
  await client.query(`INSERT INTO patient_portal_identity_migration_events (run_id,entity_type,entity_id,action,old_state,new_state,reason_code)
    VALUES ($1,'legacy_account',$2,$3,$4,$5,$6)`, [operationRun!.id, accountId, operation, row.migration_state, operation === "enable" ? "identity_enabled" : "rollback_legacy", fingerprint]);
  await client.query("UPDATE patient_portal_identity_migration_runs SET status='completed',completed_at=NOW() WHERE id=$1", [operationRun!.id]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "completed", operation, identityId }));
} catch (_error) {
  try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
  console.error("PHASE_E_ERROR: synthetic identity operation failed");
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }