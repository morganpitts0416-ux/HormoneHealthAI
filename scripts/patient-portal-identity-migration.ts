import crypto from "node:crypto";
import pg from "pg";
import { requireReplitDevelopmentWorkspace } from "./patient-portal-identity-environment";

const argv = process.argv.slice(2);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1] ?? null;
};
const known = new Set(["--dry-run", "--apply", "--legacy-account-ids", "--max-rows", "--report-id", "--idempotency-key", "--synthetic"]);
for (let i = 0; i < argv.length; i++) {
  if (!known.has(argv[i])) throw new Error("unknown argument");
  if (["--legacy-account-ids", "--max-rows", "--report-id", "--idempotency-key"].includes(argv[i])) i++;
}
const modeFlags = argv.filter((x) => x === "--dry-run" || x === "--apply");
if (modeFlags.length !== 1) throw new Error("exactly one mode is required");
const mode = modeFlags[0] === "--apply" ? "apply" : "dry-run";
const raw = value("--legacy-account-ids");
const maxRows = Number(value("--max-rows"));
if (!raw || !Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100) throw new Error("legacy-account-ids and max-rows are required");
const parsed = raw.split(",").map(Number);
if (!parsed.length || parsed.some((n) => !Number.isSafeInteger(n) || n < 1) || new Set(parsed).size !== parsed.length) throw new Error("positive unique account IDs required");
const ids = [...parsed].sort((a, b) => a - b);
if (ids.length > maxRows) throw new Error("cohort exceeds max rows");
if (mode === "apply") requireReplitDevelopmentWorkspace("apply");
const synthetic = argv.includes("--synthetic");
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const cohortFingerprint = sha(ids.join(","));
const version = "phase-e-v2";

type Db = pg.PoolClient;
async function canonical(client: Db, lock: boolean) {
  let lockedEmails: string[] | undefined;
  if (lock) {
    // Under SERIALIZABLE the first snapshot read must be the locked request
    // rows; all classification below is a fresh read after these locks.
    const requested = await client.query("SELECT id,lower(trim(email)) AS normalized_email FROM patient_portal_accounts WHERE id=ANY($1::int[]) FOR UPDATE", [ids]);
    if (requested.rows.length !== ids.length) throw new Error("source cohort drifted or missing");
    lockedEmails = [...new Set(requested.rows.map((r) => String(r.normalized_email)))].sort();
    for (const email of lockedEmails) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [email]);
  }
  // The account CTE deliberately expands the requested cohort to every account
  // sharing a normalized email.  Aggregates make the fingerprint include the
  // complete identity/mapping/credential/relationship graph, including state.
  const sql = `
    WITH requested AS (
      SELECT id, lower(trim(email)) normalized_email FROM patient_portal_accounts WHERE id=ANY($1::int[])
    ), cohort AS (
      SELECT a.id FROM patient_portal_accounts a
      JOIN (SELECT DISTINCT normalized_email FROM requested) r ON lower(trim(a.email))=r.normalized_email
    )
    SELECT a.id,a.patient_id,a.email,a.password_hash,a.is_active,p.clinic_id,
      (p.id IS NOT NULL AND p.clinic_id IS NOT NULL) owned,
      coalesce(jsonb_agg(DISTINCT jsonb_build_object(
        'id',i.id,'normalized_email',i.normalized_email,'account_status',i.account_status,
        'verification_status',i.verification_status,'session_version',i.session_version
      )) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) identities,
      coalesce(jsonb_agg(DISTINCT jsonb_build_object(
        'id',m.id,'identity_id',m.identity_id,'migration_state',m.migration_state,
        'credential_compatibility_status',m.credential_compatibility_status,'patient_id',m.patient_id,'clinic_id',m.clinic_id,
        'migration_run_id',m.migration_run_id
      )) FILTER (WHERE m.id IS NOT NULL),'[]'::jsonb) mappings,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'identity_id',c.identity_id,'status',c.status,
        'password_hash',c.password_hash) ORDER BY c.id)
        FROM patient_portal_credentials c WHERE c.identity_id IN (SELECT i2.id FROM patient_portal_identities i2 WHERE lower(trim(i2.normalized_email))=lower(trim(a.email)))),'[]'::jsonb) credentials,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'identity_id',r.portal_identity_id,'patient_id',r.patient_id,
        'clinic_id',r.clinic_id,'relationship_status',r.relationship_status,'scope',r.scope,'revoked_at',r.revoked_at) ORDER BY r.id)
        FROM patient_clinic_relationships r WHERE r.portal_identity_id IN (SELECT i3.id FROM patient_portal_identities i3 WHERE lower(trim(i3.normalized_email))=lower(trim(a.email)))),'[]'::jsonb) relationships
    FROM cohort x JOIN patient_portal_accounts a ON a.id=x.id
    LEFT JOIN patients p ON p.id=a.patient_id
    LEFT JOIN patient_portal_identities i ON lower(trim(i.normalized_email))=lower(trim(a.email))
    LEFT JOIN patient_portal_identity_legacy_accounts m ON m.identity_id=i.id
    GROUP BY a.id,p.id,p.clinic_id ORDER BY a.id`;
  const rows = (await client.query(sql, [ids])).rows;
  if (rows.filter((r) => ids.includes(Number(r.id))).length !== ids.length) throw new Error("source cohort drifted or missing");
  if (lock) {
    const emails = lockedEmails!;
    // Lock every graph row, not merely the requested account.
    await client.query(`SELECT a.id FROM patient_portal_accounts a WHERE lower(trim(a.email))=ANY($1::text[]) FOR UPDATE`, [emails]);
    await client.query(`SELECT p.id FROM patients p JOIN patient_portal_accounts a ON a.patient_id=p.id WHERE lower(trim(a.email))=ANY($1::text[]) FOR UPDATE`, [emails]);
    await client.query(`SELECT i.id FROM patient_portal_identities i WHERE lower(trim(i.normalized_email))=ANY($1::text[]) FOR UPDATE`, [emails]);
    await client.query(`SELECT m.id FROM patient_portal_identity_legacy_accounts m JOIN patient_portal_identities i ON i.id=m.identity_id WHERE lower(trim(i.normalized_email))=ANY($1::text[]) FOR UPDATE`, [emails]);
    await client.query(`SELECT c.id FROM patient_portal_credentials c JOIN patient_portal_identities i ON i.id=c.identity_id WHERE lower(trim(i.normalized_email))=ANY($1::text[]) FOR UPDATE`, [emails]);
    await client.query(`SELECT r.id FROM patient_clinic_relationships r JOIN patient_portal_identities i ON i.id=r.portal_identity_id WHERE lower(trim(i.normalized_email))=ANY($1::text[]) FOR UPDATE`, [emails]);
  }
  const material = rows.map((r) => ({
    ...r,
    email: sha(String(r.email ?? "").trim().toLowerCase()),
    password_hash: sha(String(r.password_hash ?? "")),
    identities: (r.identities ?? []).map((i: any) => ({ ...i, normalized_email: sha(String(i.normalized_email ?? "").trim().toLowerCase()) })),
    credentials: (r.credentials ?? []).map((c: any) => ({ ...c, password_hash: sha(String(c.password_hash ?? "")) })),
  }));
  const groups = [...new Set(rows.map((r) => String(r.email).trim().toLowerCase()))].sort().map((email) => ({
    email: sha(email), accountIds: rows.filter((r) => String(r.email).trim().toLowerCase() === email).map((r) => Number(r.id)),
  }));
  const reportId = sha(JSON.stringify({ version, cohortFingerprint, maxRows, requested: ids, material, groups }));
  return { rows, reportId, material, groups };
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query(mode === "dry-run" ? "BEGIN TRANSACTION READ ONLY" : "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  if (mode === "apply") {
    const f = await client.query("SELECT enabled,expires_at FROM authorization_feature_flags WHERE flag_key='PATIENT_PORTAL_IDENTITY_APPLY_V1' AND clinic_id IS NULL");
    if (!f.rows[0]?.enabled || (f.rows[0].expires_at && new Date(f.rows[0].expires_at) <= new Date())) throw new Error("apply feature flag is disabled or expired");
    const key = value("--idempotency-key");
    if (!key) throw new Error("--idempotency-key is required for apply");
    const prior = await client.query(`SELECT report_id,cohort_fingerprint,account_ids,max_rows,synthetic,status
      FROM patient_portal_identity_migration_runs WHERE idempotency_key=$1 AND operation='apply' FOR UPDATE`, [key]);
    if (prior.rows.length) {
      const p = prior.rows[0];
      const same = p.report_id === value("--report-id") && p.cohort_fingerprint === cohortFingerprint &&
        JSON.stringify((p.account_ids ?? []).map(Number).sort((a: number, b: number) => a - b)) === JSON.stringify(ids) &&
        Number(p.max_rows) === maxRows && Boolean(p.synthetic) === synthetic;
      if (!same) throw new Error("idempotency key arguments changed");
      if (p.status === "completed") {
        await client.query("COMMIT");
        console.log(JSON.stringify({ mode, status: "completed", reportId: p.report_id, legacyAccountIds: ids, idempotent: true }));
        process.exit(0);
      }
    }
  }
  const report = await canonical(client, mode === "apply");
  const eligible = report.rows.filter((r) => ids.includes(Number(r.id)) && report.groups.find((g) => g.email === sha(String(r.email).trim().toLowerCase()))?.accountIds.length === 1 && r.owned && r.password_hash && r.is_active && !r.identities.some((x: any) => x.id) && !r.mappings.some((x: any) => ["conflicting", "rollback_legacy"].includes(x.migration_state)));
  const classifications = {
    clearly_eligible_single_legacy_account: eligible.length,
    must_remain_legacy_only: ids.length - eligible.length,
    identity_or_linkage_conflict: ids.filter((id) => report.rows.find((r) => Number(r.id) === id)?.identities.some((x: any) => x.id) || report.rows.find((r) => Number(r.id) === id)?.mappings.some((x: any) => ["conflicting", "rollback_legacy"].includes(x.migration_state))).length,
  };
  if (synthetic && report.rows.some((r) => ids.includes(Number(r.id)) && !String(r.email).toLowerCase().trim().endsWith(".invalid"))) throw new Error("synthetic cohorts require .invalid emails");
  const output = { schemaVersion: version, cohortFingerprint, legacyAccountIds: ids, maxRows, classifications, reportId: report.reportId, sourceFingerprint: report.reportId };
  const requestedReport = value("--report-id");
  if (mode === "dry-run") {
    await client.query("COMMIT");
    console.log(JSON.stringify({ mode, ...output }));
  } else {
    if (requestedReport !== report.reportId) throw new Error("report-id must exactly match dry-run report");
    const key = value("--idempotency-key")!;
    const run = await client.query(`INSERT INTO patient_portal_identity_migration_runs
      (run_id,idempotency_key,report_id,cohort_fingerprint,account_ids,max_rows,status,synthetic)
      VALUES ($1,$2,$3,$4,$5,$6,'started',$7) RETURNING id`, [crypto.randomUUID(), key, report.reportId, cohortFingerprint, ids, maxRows, synthetic]);
    if (eligible.length !== ids.length) throw new Error("ambiguous or ineligible account");
    const final = await canonical(client, false);
    if (final.reportId !== report.reportId) throw new Error("graph changed during apply");
    for (const row of final.rows.filter((r) => ids.includes(Number(r.id)))) {
      const identity = (await client.query("INSERT INTO patient_portal_identities (normalized_email,account_status,verification_status) VALUES (lower(trim($1)),'active','verified') RETURNING id", [row.email])).rows[0];
      await client.query("INSERT INTO patient_portal_credentials (identity_id,password_hash,status,source,source_legacy_account_id,verified_at) VALUES ($1,$2,'active','legacy_copy',$3,NOW())", [identity.id, row.password_hash, row.id]);
      const mapping = await client.query(`INSERT INTO patient_portal_identity_legacy_accounts
        (identity_id,legacy_account_id,patient_id,clinic_id,migration_state,credential_compatibility_status,provenance_run_key,migration_run_id,validated_at)
        VALUES ($1,$2,$3,$4,'identity_ready','direct_copy_confirmed',$5,(SELECT id FROM patient_portal_identity_migration_runs WHERE report_id=$6 ORDER BY id DESC LIMIT 1),NOW())`,
        [identity.id, row.id, row.patient_id, row.clinic_id, key, report.reportId]);
      const relationship = await client.query(`INSERT INTO patient_clinic_relationships
        (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,verification_method,scope,verified_at)
        VALUES ($1,$2,$3,'self','active','phase_e_apply','full_portal',NOW()) RETURNING id`,
        [identity.id, row.patient_id, row.clinic_id]);
      await client.query(`INSERT INTO patient_portal_identity_migration_events
        (run_id,entity_type,entity_id,action,new_state,reason_code)
        VALUES ($1,'legacy_account',$2,'apply','identity_ready','phase_e_apply')`,
        [run.rows[0].id, row.id]);
      await client.query(`INSERT INTO patient_portal_relationship_events
        (relationship_id,clinic_id,patient_id,actor_type,event_type,to_status,to_scope)
        VALUES ($1,$2,$3,'system','relationship_verified','active','full_portal')`,
        [relationship.rows[0].id, row.clinic_id, row.patient_id]);
    }
    await client.query("UPDATE patient_portal_identity_migration_runs SET status='completed',completed_at=NOW() WHERE report_id=$1", [report.reportId]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ mode, status: "completed", ...output, migrated: ids.length }));
  }
} catch (_e) {
  try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
  console.error("PHASE_E_ERROR: migration operation failed");
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }