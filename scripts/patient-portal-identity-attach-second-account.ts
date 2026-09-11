import bcrypt from "bcrypt";
import pg from "pg";
import { requireReplitDevelopmentWorkspace } from "./patient-portal-identity-environment";

const args = process.argv.slice(2);
const allowed = new Set(["--run-id","--identity-id","--legacy-account-id","--patient-id","--idempotency-key","--reason-code","--password"]);
for (let i=0;i<args.length;i++) { if (!allowed.has(args[i])) throw new Error("unknown argument"); i++; }
const val = (name: string) => { const i=args.indexOf(name); return i<0 ? null : args[i+1] ?? null; };
const runId=Number(val("--run-id")), identityId=Number(val("--identity-id")), accountId=Number(val("--legacy-account-id")), patientId=Number(val("--patient-id"));
const key=val("--idempotency-key"), reason=val("--reason-code"), password=val("--password");
if (![runId,identityId,accountId,patientId].every(Number.isSafeInteger) || !key || !reason?.trim() || !password || !/^[0-9a-f-]{36}$/i.test(key)) throw new Error("exact IDs, UUID idempotency key, reason, and password required");
requireReplitDevelopmentWorkspace("synthetic attachment");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1}), client=await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const flag=await client.query("SELECT enabled,expires_at FROM authorization_feature_flags WHERE flag_key='patient_portal_identity_synthetic_auth_v1' AND clinic_id IS NULL");
  if(!flag.rows[0]?.enabled || (flag.rows[0].expires_at && new Date(flag.rows[0].expires_at)<=new Date())) throw new Error("synthetic flag disabled or expired");
  const prior=await client.query(`SELECT report_id,md5(concat_ws('|',$2::integer,$3::integer,$4::integer,$5::integer,$6::text)) AS expected
    FROM patient_portal_identity_migration_runs WHERE idempotency_key=$1 AND operation='attach' FOR UPDATE`,
    [key,runId,identityId,accountId,patientId,reason]);
  if(prior.rows.length) {
    if(prior.rows[0].report_id!==prior.rows[0].expected) throw new Error("idempotency key arguments changed");
    await client.query("COMMIT");
    console.log(JSON.stringify({status:"completed",idempotent:true}));
    process.exit(0);
  }
  const graph=await client.query(`SELECT i.normalized_email,a.password_hash AS second_hash,c.password_hash AS identity_hash
    FROM patient_portal_identity_legacy_accounts m JOIN patient_portal_identities i ON i.id=m.identity_id
    JOIN patient_portal_accounts a ON a.id=$3 JOIN patient_portal_credentials c ON c.identity_id=i.id AND c.status='active'
    WHERE m.identity_id=$1 AND m.migration_run_id=$2 AND m.migration_state='identity_ready' AND a.id=$3 AND a.patient_id=$4`,[identityId,runId,accountId,patientId]);
  if(!graph.rows[0] || !graph.rows[0].normalized_email.endsWith(".invalid")) throw new Error("synthetic identity graph required");
  const [identityMatch, secondMatch] = await Promise.all([
    bcrypt.compare(password, graph.rows[0].identity_hash),
    bcrypt.compare(password, graph.rows[0].second_hash),
  ]);
  if(!identityMatch || !secondMatch) throw new Error("synthetic compatibility verification failed");
  const result=await client.query("SELECT patient_portal_reviewed_attach_second_account($1::uuid,$2::integer,$3::integer,$4::integer,$5::integer,$6::text) AS result",[key,runId,identityId,accountId,patientId,reason]);
  await client.query("COMMIT");
  console.log(JSON.stringify({status:"completed",result:result.rows[0].result}));
} catch(e: any) {
  try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
  const safeCode = typeof e?.code === "string" ? e.code : "UNKNOWN";
  const safeConstraint = typeof e?.constraint === "string" ? e.constraint : "none";
  const safeSignature = safeCode === "42883"
    ? String(e?.message ?? "").replace(/'[^']*'/g, "'<redacted>'").replace(/[^\x20-\x7E]/g, "")
    : "";
  console.error(`PHASE_E_ERROR: second-account attachment failed [${safeCode}:${safeConstraint}]${safeSignature ? ` ${safeSignature}` : ""}`);
  process.exitCode = 1;
} finally { client.release(); await pool.end(); }