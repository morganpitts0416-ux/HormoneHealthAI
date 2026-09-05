/*
 * Deliberately opt-in local validator. Output contains only statuses and
 * aggregate counts; credentials, bearer values, cookies, hashes, and answers
 * remain in process-local variables.
 */
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import fs from "node:fs";
import pg from "pg";

const baseUrl = process.env.SYNTHETIC_BASE_URL;
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const tag = `SYNTH-INTAKE-${Date.now()}`;
const email = `${tag.toLowerCase()}@example.invalid`;
const password = `Synthetic-${Date.now()}-Aa1!`;
const flags = ["patient_portal_invite_linking_v1", "patient_portal_intake_only_scope_v1", "patient_portal_identity_synthetic_auth_v1", "patient_portal_relationship_shadow_v1"];
const ids: Record<string, number> = {};
const status: Record<string, number> = {};
const priorFlags: Array<any> = [];
const sessionIds: string[] = [];
let before: Record<string, number> = {};

async function q(text: string, values: unknown[] = []) { return pool.query(text, values); }
async function one(text: string, values: unknown[] = []) {
  const result = await q(text, values);
  assert.ok(result.rows[0], "synthetic fixture insert failed");
  return result.rows[0] as Record<string, any>;
}
function cookie(response: Response) {
  const value = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(value, "expected synthetic session cookie");
  const encoded = value.slice(value.indexOf("=") + 1);
  const unsigned = decodeURIComponent(encoded).replace(/^s:/, "").split(".")[0];
  if (unsigned) sessionIds.push(unsigned);
  return value;
}
async function call(name: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", ...init });
  status[name] = response.status;
  return response;
}
async function json(response: Response) { return response.json() as Promise<Record<string, any>>; }
function body(value: unknown) { return JSON.stringify(value); }
function auth(cookieValue: string) { return { cookie: cookieValue, "content-type": "application/json", "x-request-id": `${tag}-${Object.keys(status).length}` }; }
async function invite(clinicianCookie: string, patientId: number) {
  const response = await call("invite", `/api/patient-intake/invites/${patientId}`, { method: "POST", headers: auth(clinicianCookie), body: body({ email }) });
  assert.equal(response.status, 201);
  const payload = await json(response);
  const raw = new URL(payload.inviteUrl).searchParams.get("token");
  assert.ok(raw && raw.length >= 32, "invite response must contain a local bearer token");
  return { id: payload.inviteId as number, raw };
}
async function exchange(raw: string, name: string) {
  const response = await call(name, "/api/patient-intake/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: body({ token: raw }) });
  assert.equal(response.status, 200);
  const payload = await json(response);
  assert.ok(typeof payload.flowToken === "string" && payload.flowToken.length >= 32);
  return payload.flowToken as string;
}
async function authenticate(flowToken: string, name: string) {
  const response = await call(name, "/api/patient-intake/flow/authenticate", { method: "POST", headers: { "content-type": "application/json" }, body: body({ flowToken, email, password }) });
  assert.equal(response.status, 204);
  return cookie(response);
}
async function counts() {
  const names = ["users", "clinician_staff", "patient_portal_accounts", "patients", "clinics", "patient_portal_identities", "patient_clinic_relationships", "patient_portal_invites", "patient_portal_invite_flows", "patient_portal_relationship_events", "intake_forms", "patient_form_assignments", "form_submissions"];
  const entries = await Promise.all(names.map(async (name) => [name, Number((await q(`SELECT count(*)::int AS count FROM ${name}`)).rows[0].count)] as const));
  entries.push(["sessions", Number((await q('SELECT count(*)::int AS count FROM "session"')).rows[0].count)]);
  return Object.fromEntries(entries);
}
async function requireSchema() {
  const tables = ["patient_portal_identities", "patient_clinic_relationships", "patient_portal_invites", "patient_portal_invite_flows", "patient_portal_relationship_events", "authorization_feature_flags"];
  const found = await q("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)", [tables]);
  if (found.rows.length !== tables.length) throw new Error("migration/restart needed: patient intake schema tables are unavailable");
}
async function setFlag(flagKey: string, clinicId: number | null) {
  const previous = await q("SELECT * FROM authorization_feature_flags WHERE flag_key=$1 AND clinic_id IS NOT DISTINCT FROM $2", [flagKey, clinicId]);
  priorFlags.push({ flagKey, clinicId, row: previous.rows[0] ?? null });
  if (previous.rows[0]) await q("UPDATE authorization_feature_flags SET enabled=true, expires_at=NULL, reason=$1, updated_at=NOW() WHERE id=$2", [tag, previous.rows[0].id]);
  else await q("INSERT INTO authorization_feature_flags (flag_key,clinic_id,enabled,reason) VALUES ($1,$2,true,$3)", [flagKey, clinicId, tag]);
}
async function restoreFlags() {
  for (const item of priorFlags.reverse()) {
    if (!item.row) await q("DELETE FROM authorization_feature_flags WHERE flag_key=$1 AND clinic_id IS NOT DISTINCT FROM $2 AND reason=$3", [item.flagKey, item.clinicId, tag]);
    else await q("UPDATE authorization_feature_flags SET enabled=$1,expires_at=$2,reason=$3,approved_by_user_id=$4,created_at=$5,updated_at=$6 WHERE id=$7", [item.row.enabled, item.row.expires_at, item.row.reason, item.row.approved_by_user_id, item.row.created_at, item.row.updated_at, item.row.id]);
  }
}
async function setup() {
  const hash = await bcrypt.hash(password, 10);
  ids.owner = (await one("INSERT INTO users (email,username,password_hash,first_name,last_name,title,clinic_name,subscription_status,free_account,notes) VALUES ($1,$2,$3,'Synthetic','Intake','NP',$4,'active',true,$5) RETURNING id", [`${tag.toLowerCase()}-owner@example.invalid`, `${tag.toLowerCase()}-owner`, hash, tag, tag])).id;
  for (const key of ["a", "b"]) {
    ids[`clinic${key}`] = (await one("INSERT INTO clinics (name,slug,owner_user_id,is_active,subscription_status,subscription_plan) VALUES ($1,$2,$3,true,'active','suite') RETURNING id", [`${tag} Clinic ${key.toUpperCase()}`, `${tag.toLowerCase()}-${key}`, ids.owner])).id;
    await q("INSERT INTO clinic_memberships (clinic_id,user_id,role,clinical_role,admin_role,access_scope,acceptance_status,is_active,is_primary_clinic) VALUES ($1,$2,'admin','provider','owner','full','active',true,$3)", [ids[`clinic${key}`], ids.owner, key === "b"]);
  }
  await q("UPDATE users SET default_clinic_id=$1 WHERE id=$2", [ids.clinicb, ids.owner]);
  ids.patientA = (await one("INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn) VALUES ($1,'Synthetic','Clinic A','female',$2,$3,$4) RETURNING id", [ids.owner, email, ids.clinica, `${tag}-A`])).id;
  ids.patientB = (await one("INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn) VALUES ($1,'Synthetic','Clinic B','female',$2,$3,$4) RETURNING id", [ids.owner, email, ids.clinicb, `${tag}-B`])).id;
  ids.identity = (await one("INSERT INTO patient_portal_identities (normalized_email,account_status,verification_status,synthetic_password_hash) VALUES ($1,'active','verified',$2) RETURNING id", [email, hash])).id;
  ids.formA = (await one("INSERT INTO intake_forms (clinician_id,clinic_id,name,description,status) VALUES ($1,$2,$3,$4,'published') RETURNING id", [ids.owner, ids.clinica, `${tag} A-MARKER`, `${tag} A-RESOURCE`])).id;
  ids.formB = (await one("INSERT INTO intake_forms (clinician_id,clinic_id,name,description,status) VALUES ($1,$2,$3,$4,'published') RETURNING id", [ids.owner, ids.clinicb, `${tag} MOKI`, "synthetic local capture"])).id;
  await q("INSERT INTO form_sections (form_id,title,order_index) VALUES ($1,'MOKI',0)", [ids.formB]);
  await q("INSERT INTO form_fields (form_id,field_key,label,field_type,is_required,order_index) VALUES ($1,'moki','MOKI','text',true,0)", [ids.formB]);
  await q("INSERT INTO patient_form_assignments (patient_id,form_id,assigned_by,delivery_mode,status) VALUES ($1,$2,$3,'portal','pending')", [ids.patientB, ids.formB, ids.owner]);
  assert.equal(Number((await q("SELECT count(*)::int AS count FROM patient_clinic_relationships WHERE portal_identity_id=$1", [ids.identity])).rows[0].count), 0, "matching email alone must not create a relationship");
  for (const flag of flags) { await setFlag(flag, null); await setFlag(flag, ids.clinica); await setFlag(flag, ids.clinicb); }
}
async function exercise() {
  const login = await call("staff_login", "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: body({ username: `${tag.toLowerCase()}-owner`, password }) });
  assert.equal(login.status, 200); const staffCookie = cookie(login);
  const initial = await invite(staffCookie, ids.patientB);
  const persistedInvite = await one("SELECT token_digest FROM patient_portal_invites WHERE id=$1", [initial.id]);
  assert.match(persistedInvite.token_digest, /^[0-9a-f]{64}$/);
  assert.notEqual(persistedInvite.token_digest, initial.raw, "raw invite bearer must never be persisted");
  const flow = await exchange(initial.raw, "exchange");
  const intakeCookie = await authenticate(flow, "synthetic_auth");
  const accepted = await call("accept", "/api/patient-intake/flow/accept", { method: "POST", headers: auth(intakeCookie) });
  assert.equal(accepted.status, 204);
  const forms = await call("forms", "/api/patient-intake/forms", { headers: auth(intakeCookie) });
  assert.equal(forms.status, 200); const formsText = await forms.text();
  assert.ok(formsText.includes("MOKI") && !formsText.includes("A-MARKER") && !formsText.includes("A-RESOURCE"), "Clinic A resources must be absent");
  const generalPortal = await call("legacy_portal", "/api/portal/me", { headers: auth(intakeCookie) });
  assert.equal(generalPortal.status, 401, "intake session must not grant legacy portal access");
  const form = await call("form_read", `/api/patient-intake/forms/${ids.formB}`, { headers: auth(intakeCookie) }); assert.equal(form.status, 200);
  const answers = { moki: "synthetic" };
  const draft = await call("draft", `/api/patient-intake/forms/${ids.formB}/draft`, { method: "POST", headers: auth(intakeCookie), body: body({ answers }) }); assert.equal(draft.status, 201);
  const submit = await call("submit", `/api/patient-intake/forms/${ids.formB}/submit`, { method: "POST", headers: auth(intakeCookie), body: body({ answers }) }); assert.equal(submit.status, 201);
  const formStatus = await call("status", `/api/patient-intake/forms/${ids.formB}/status`, { headers: auth(intakeCookie) }); assert.equal(formStatus.status, 200);
  const relationship = await one("SELECT id,relationship_status,scope FROM patient_clinic_relationships WHERE portal_identity_id=$1 AND patient_id=$2", [ids.identity, ids.patientB]);
  assert.equal(relationship.relationship_status, "intake_only"); assert.equal(relationship.scope, "intake_only");
  assert.equal(Number((await q("SELECT count(*)::int AS count FROM patient_clinic_relationships WHERE portal_identity_id=$1 AND patient_id=$2", [ids.identity, ids.patientA])).rows[0].count), 0, "Clinic B must not obtain Clinic A relationship metadata");

  const replay = await call("replay", "/api/patient-intake/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: body({ token: initial.raw }) }); assert.equal(replay.status, 404);
  const old = await invite(staffCookie, ids.patientB);
  const resent = await call("resend", `/api/patient-intake/invites/${old.id}/resend`, { method: "POST", headers: auth(staffCookie) }); assert.equal(resent.status, 200);
  const oldReplay = await call("resend_old_invalid", "/api/patient-intake/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: body({ token: old.raw }) }); assert.equal(oldReplay.status, 404);
  const cancelled = await invite(staffCookie, ids.patientB);
  const cancel = await call("cancel", `/api/patient-intake/invites/${cancelled.id}/cancel`, { method: "POST", headers: auth(staffCookie) }); assert.equal(cancel.status, 204);
  const cancelledUse = await call("cancelled_invalid", "/api/patient-intake/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: body({ token: cancelled.raw }) }); assert.equal(cancelledUse.status, 404);
  const expired = await invite(staffCookie, ids.patientB);
  await q("UPDATE patient_portal_invites SET expires_at=NOW()-interval '1 minute' WHERE id=$1", [expired.id]);
  const expiry = await call("expired_invalid", "/api/patient-intake/exchange", { method: "POST", headers: { "content-type": "application/json" }, body: body({ token: expired.raw }) }); assert.equal(expiry.status, 404);

  const raceInvite = await invite(staffCookie, ids.patientB), raceFlow = await exchange(raceInvite.raw, "race_exchange"), raceCookie = await authenticate(raceFlow, "race_auth");
  const races = await Promise.all([call("race_a", "/api/patient-intake/flow/accept", { method: "POST", headers: auth(raceCookie) }), call("race_b", "/api/patient-intake/flow/accept", { method: "POST", headers: auth(raceCookie) })]);
  assert.equal(races.filter((r) => r.status === 204).length, 1, "concurrent acceptance must have exactly one success");
  const verify = await call("staff_verify", `/api/patient-intake/relationships/${relationship.id}/verify`, { method: "POST", headers: auth(staffCookie) }); assert.equal(verify.status, 204);
  const verified = await one("SELECT relationship_status,scope,verification_method,verified_at,verified_by_user_id,verified_by_staff_id FROM patient_clinic_relationships WHERE id=$1", [relationship.id]);
  assert.equal(verified.relationship_status, "active"); assert.equal(verified.scope, "full_portal");
  assert.ok(Number((await q("SELECT count(*)::int AS count FROM patient_portal_relationship_events WHERE clinic_id=$1 AND event_type='relationship_verified'", [ids.clinicb])).rows[0].count) > 0, "verification audit event required");
  // A later invite is not allowed to turn a staff-verified full relationship
  // back into intake-only via the relationship conflict target.
  const postVerifyInvite = await invite(staffCookie, ids.patientB);
  const postVerifyResend = await call("post_verify_resend", `/api/patient-intake/invites/${postVerifyInvite.id}/resend`, { method: "POST", headers: auth(staffCookie) });
  assert.equal(postVerifyResend.status, 200);
  const postVerifyPayload = await json(postVerifyResend);
  const postVerifyRaw = new URL(postVerifyPayload.inviteUrl).searchParams.get("token");
  assert.ok(postVerifyRaw && postVerifyRaw.length >= 32, "resend response must contain a local bearer token");
  const postVerifyFlow = await exchange(postVerifyRaw, "post_verify_exchange");
  const postVerifyCookie = await authenticate(postVerifyFlow, "post_verify_auth");
  const postVerifyAccept = await call("post_verify_accept", "/api/patient-intake/flow/accept", { method: "POST", headers: auth(postVerifyCookie) });
  assert.notEqual(postVerifyAccept.status, 204, "a later invite must not re-accept an active full-portal relationship");
  const afterPostVerifyAttempt = await one("SELECT relationship_status,scope,verification_method,verified_at,verified_by_user_id,verified_by_staff_id FROM patient_clinic_relationships WHERE id=$1", [relationship.id]);
  assert.deepEqual(afterPostVerifyAttempt, verified, "a later invite must preserve the original verification transition");
  const cleanupInvite = await invite(staffCookie, ids.patientB);
  await exchange(cleanupInvite.raw, "cleanup_exchange");
  await q("UPDATE patient_portal_invite_flows SET expires_at=NOW()-interval '1 minute' WHERE invite_id IN (SELECT id FROM patient_portal_invites WHERE clinic_id=$1 AND status='issued')", [ids.clinicb]);
  const cleaned = await call("flow_cleanup", "/api/patient-intake/flows/cleanup", { method: "POST", headers: auth(staffCookie) }); assert.equal(cleaned.status, 200);
  assert.ok(Number((await json(cleaned)).expired) >= 1, "expired intake flow must be cleaned");
  const leak = await q("SELECT count(*)::int AS count FROM patient_portal_invites WHERE clinic_id IN ($1,$2) AND token_digest !~ '^[0-9a-f]{64}$'", [ids.clinica, ids.clinicb]);
  assert.equal(Number(leak.rows[0].count), 0, "only digests may be persisted");

  await q("UPDATE authorization_feature_flags SET enabled=false WHERE flag_key='patient_portal_invite_linking_v1' AND clinic_id IS NULL");
  const off = await call("flag_off_after", "/api/patient-intake/exchange?token=not-a-real-token"); assert.equal(off.status, 404);
  await q("UPDATE authorization_feature_flags SET enabled=true WHERE flag_key='patient_portal_invite_linking_v1' AND clinic_id IS NULL");
}
async function cleanup() {
  try {
    if (sessionIds.length) await q('DELETE FROM "session" WHERE sid = ANY($1)', [sessionIds]);
    if (ids.patientA || ids.patientB) {
      const patientIds = [ids.patientA, ids.patientB].filter(Number.isInteger);
      await q("DELETE FROM form_submissions WHERE patient_id = ANY($1)", [patientIds]);
      await q("DELETE FROM patient_form_assignments WHERE patient_id = ANY($1)", [patientIds]);
    }
    if (ids.formA || ids.formB) {
      const formIds = [ids.formA, ids.formB].filter(Number.isInteger);
      await q("DELETE FROM form_fields WHERE form_id = ANY($1)", [formIds]);
      await q("DELETE FROM form_sections WHERE form_id = ANY($1)", [formIds]);
      await q("DELETE FROM intake_forms WHERE id = ANY($1)", [formIds]);
    }
    if (ids.identity) await q("DELETE FROM patient_portal_identities WHERE id=$1", [ids.identity]);
    if (ids.patientA || ids.patientB) await q("DELETE FROM patients WHERE id = ANY($1)", [[ids.patientA, ids.patientB].filter(Number.isInteger)]);
    if (ids.clinica || ids.clinicb) await q("DELETE FROM clinics WHERE id = ANY($1)", [[ids.clinica, ids.clinicb].filter(Number.isInteger)]);
    if (ids.owner) await q("DELETE FROM users WHERE id=$1", [ids.owner]);
  } finally { await restoreFlags(); }
}
async function main() {
  if (!baseUrl || !/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|https:\/\/[^/]*replit)/.test(baseUrl) || !process.env.DATABASE_URL) throw new Error("SYNTHETIC_BASE_URL and DATABASE_URL must name a local development target");
  const serverEntry = fs.readFileSync("server/index.ts", "utf8");
  assert.ok(
    serverEntry.includes('if (path.startsWith("/api/patient-intake"))') &&
      serverEntry.includes('logLine += " :: [redacted]"'),
    "intake response logging must remain redacted",
  );
  const disabled = await call("flag_off_before", "/api/patient-intake/exchange?token=not-a-real-token"); assert.equal(disabled.status, 404);
  await requireSchema(); before = await counts();
  try { await setup(); await exercise(); } finally { await cleanup(); }
  const after = await counts();
  for (const name of Object.keys(before)) assert.equal(after[name], before[name], `synthetic cleanup changed ${name}`);
  console.log(JSON.stringify({ result: "passed", statuses: Object.fromEntries(Object.entries(status).map(([key, value]) => [key, value])), counts: { before, after } }));
}
main().catch((error) => { console.error(JSON.stringify({ result: "failed", message: error instanceof Error ? error.message.replace(/(?:token|password|hash|cookie|session)\\S*/gi, "[redacted]") : "synthetic validation failed" })); process.exitCode = 1; }).finally(() => pool.end());