/*
 * Reviewed, development-only provenance correction. This is intentionally a
 * CLI and is not reachable from any application route.
 */
import pg from "pg";
import { requireReplitDevelopmentWorkspace } from "./patient-portal-identity-environment";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? null : process.argv[i + 1] ?? null;
};
const field = arg("--field");
const runId = arg("--idempotency-key");
const identityId = Number(arg("--identity-id"));
const accountId = Number(arg("--legacy-account-id"));
const patientId = Number(arg("--patient-id"));
const reason = arg("--reason-code");
const value = arg("--value");
if (!["patient_email", "identity_email", "legacy_account_email", "patient_clinic", "account_patient"].includes(field ?? "")
  || !runId || !reason?.trim() || !Number.isInteger(identityId) || !Number.isInteger(accountId)
  || !Number.isInteger(patientId) || !value) throw new Error("exact correction field, IDs, idempotency key, reason, and value are required");
requireReplitDevelopmentWorkspace("correction");
if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new Error("idempotency key must be UUID");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const flag = await client.query("SELECT enabled,expires_at FROM authorization_feature_flags WHERE flag_key='PATIENT_PORTAL_IDENTITY_APPLY_V1' AND clinic_id IS NULL");
  if (!flag.rows[0]?.enabled || (flag.rows[0].expires_at && new Date(flag.rows[0].expires_at) <= new Date())) throw new Error("apply feature flag is disabled or expired");
  const prior = await client.query(`SELECT 1 FROM patient_portal_identity_migration_runs
    WHERE idempotency_key=$1 AND operation='correction' FOR UPDATE`, [runId]);
  if (!prior.rows[0]) {
    const graph = await client.query(`SELECT m.id,m.patient_id,m.clinic_id,m.migration_state,i.id AS identity_id,a.id AS account_id,a.email,p.clinic_id AS actual_clinic
      FROM patient_portal_identity_legacy_accounts m
      JOIN patient_portal_identities i ON i.id=m.identity_id
      JOIN patient_portal_accounts a ON a.id=m.legacy_account_id
      JOIN patients p ON p.id=m.patient_id
      WHERE m.identity_id=$1 AND m.legacy_account_id=$2 AND m.patient_id=$3 FOR UPDATE`, [identityId, accountId, patientId]);
    if (!graph.rows[0]) throw new Error("exact correction graph not found");
  }
  const result = await client.query(
    "SELECT patient_portal_reviewed_correction($1::uuid,$2::text,$3::integer,$4::integer,$5::integer,$6::text,$7::text) AS result",
    [runId, field, identityId, accountId, patientId, value, reason],
  );
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "completed", field, result: result.rows[0].result }));
} catch (error: any) {
  try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
  const safeCode = typeof error?.code === "string" ? error.code : "UNKNOWN";
  const safeConstraint = typeof error?.constraint === "string" ? error.constraint : "none";
  const safeSignature = safeCode === "55000"
    ? String(error?.message ?? "").replace(/'[^']*'/g, "'<redacted>'").replace(/[^\x20-\x7E]/g, "")
    : "";
  console.error(`PHASE_E_ERROR: source correction failed [${safeCode}:${safeConstraint}]${safeSignature ? ` ${safeSignature}` : ""}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}