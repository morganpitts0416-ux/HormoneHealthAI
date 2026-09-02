import bcrypt from "bcrypt";
import pg from "pg";
import assert from "node:assert/strict";
import fs from "node:fs";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const tag = `SYNTH-AUTHZ-${Date.now()}`;
const password = `Synthetic-${Date.now()}-Aa1!`;
const baseUrl = process.env.SYNTHETIC_BASE_URL || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "http://127.0.0.1:5000");

type ResponseRecord = {
  scenario: string;
  family: string;
  method: string;
  path: string;
  status: number;
  expectedCurrent: "allow" | "deny" | "probe";
  body: string;
};

const responses: ResponseRecord[] = [];
const ids: Record<string, any> = {};
const flagDisableResults: Array<{ flagKey: string; observedRows: number; passed: boolean }> = [];

async function q(text: string, params: any[] = []) {
  return pool.query(text, params);
}

async function insertOne(text: string, params: any[] = []) {
  const result = await q(text, params);
  return result.rows[0];
}

async function login(path: string, body: any): Promise<string> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": `${tag}-login` },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`Synthetic login failed ${path}: ${response.status} ${await response.text()}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`Synthetic login did not return a session cookie: ${path}`);
  return cookie;
}

async function request(
  cookie: string | undefined,
  scenario: string,
  family: string,
  method: string,
  path: string,
  expectedCurrent: ResponseRecord["expectedCurrent"],
  body?: any,
  extraHeaders?: Record<string, string>,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      "content-type": "application/json",
      "x-request-id": `${tag}-${responses.length + 1}`,
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const responseBody = await response.text();
  const record = { scenario, family, method, path: path.replace(/\d+/g, ":id"), status: response.status, expectedCurrent, body: responseBody };
  responses.push(record);
  return record;
}

async function setup() {
  const hash = await bcrypt.hash(password, 12);
  ids.owner = await insertOne(
    `INSERT INTO users (email,username,password_hash,first_name,last_name,title,clinic_name,subscription_status,free_account,notes)
     VALUES ($1,$2,$3,'Synthetic','Owner','NP',$4,'active',true,$5) RETURNING id,email,username`,
    [`${tag.toLowerCase()}-owner@example.invalid`, `${tag.toLowerCase()}-owner`, hash, tag, tag],
  );

  const clinicSpecs = [
    ["active", "operational", "active"],
    ["delinquent", "operational", "delinquent"],
    ["inactive", "inactive", "inactive"],
    ["security", "security_suspended", "active"],
    ["closed", "permanently_closed", "cancelled"],
  ];
  ids.clinics = {};
  for (const [key, lifecycle, billing] of clinicSpecs) {
    const clinic = await insertOne(
      `INSERT INTO clinics (name,slug,owner_user_id,is_active,subscription_status,subscription_plan)
       VALUES ($1,$2,$3,true,$4,'suite') RETURNING id`,
      [`${tag} ${key}`, `${tag.toLowerCase()}-${key}`, ids.owner.id, billing],
    );
    ids.clinics[key] = clinic.id;
    await q(
      `INSERT INTO clinic_memberships
        (clinic_id,user_id,role,clinical_role,admin_role,access_scope,acceptance_status,is_active,is_primary_clinic)
       VALUES ($1,$2,'admin','provider','owner','full','active',true,$3)`,
      [clinic.id, ids.owner.id, key === "active"],
    );
    await q(
      `INSERT INTO clinic_lifecycle_foundation
        (clinic_id,lifecycle_state,state_reason,source,needs_review,validated_at)
       VALUES ($1,$2,'synthetic_validation','synthetic_validation',false,NOW())`,
      [clinic.id, lifecycle],
    );
    await q(
      `INSERT INTO clinic_billing_foundation
        (clinic_id,billing_status,linkage_status,evidence,needs_review,validated_at)
       VALUES ($1,$2,'verified',$3::jsonb,false,NOW())`,
      [clinic.id, billing, JSON.stringify({ synthetic: true })],
    );
  }
  await q(`UPDATE users SET default_clinic_id=$1 WHERE id=$2`, [ids.clinics.active, ids.owner.id]);

  ids.missingMember = await insertOne(
    `INSERT INTO users (email,username,password_hash,first_name,last_name,title,clinic_name,default_clinic_id,subscription_status,free_account,notes)
     VALUES ($1,$2,$3,'Synthetic','MissingMembership','NP',$4,$5,'active',true,$6) RETURNING id,email,username`,
    [`${tag.toLowerCase()}-missing-member@example.invalid`, `${tag.toLowerCase()}-missing-member`, hash, tag, ids.clinics.active, tag],
  );
  ids.revokedMember = await insertOne(
    `INSERT INTO users (email,username,password_hash,first_name,last_name,title,clinic_name,default_clinic_id,subscription_status,free_account,notes)
     VALUES ($1,$2,$3,'Synthetic','RevokedMembership','NP',$4,$5,'active',true,$6) RETURNING id,email,username`,
    [`${tag.toLowerCase()}-revoked-member@example.invalid`, `${tag.toLowerCase()}-revoked-member`, hash, tag, ids.clinics.active, tag],
  );
  await q(
    `INSERT INTO clinic_memberships (clinic_id,user_id,role,clinical_role,admin_role,access_scope,acceptance_status,is_active,is_primary_clinic)
     VALUES ($1,$2,'provider','provider','standard','full','active',true,true)`,
    [ids.clinics.active, ids.revokedMember.id],
  );

  ids.staff = {};
  for (const [key, clinicId] of [["valid", ids.clinics.active], ["missing", null], ["revoked", ids.clinics.active]] as const) {
    ids.staff[key] = await insertOne(
      `INSERT INTO clinician_staff (clinician_id,email,first_name,last_name,role,admin_role,password_hash,is_active,clinic_id)
       VALUES ($1,$2,'Synthetic',$3,'staff','standard',$4,true,$5) RETURNING id,email`,
      [ids.owner.id, `${tag.toLowerCase()}-staff-${key}@example.invalid`, `Staff-${key}`, hash, clinicId],
    );
  }

  const patient = async (suffix: string, clinicId: number, email: string) =>
    insertOne(
      `INSERT INTO patients (user_id,first_name,last_name,gender,email,clinic_id,mrn)
       VALUES ($1,'Synthetic',$2,'female',$3,$4,$5) RETURNING id,clinic_id,email`,
      [ids.owner.id, suffix, email, clinicId, `${tag}-${suffix}`],
    );
  ids.patients = {};
  ids.patients.chartA = await patient("MultiChart-A", ids.clinics.active, `${tag.toLowerCase()}-multichart-a@example.invalid`);
  ids.patients.chartB = await patient("MultiChart-B", ids.clinics.delinquent, `${tag.toLowerCase()}-multichart-b@example.invalid`);
  const sharedEmail = `${tag.toLowerCase()}-shared@example.invalid`;
  ids.patients.shared1 = await patient("SharedEmail-1", ids.clinics.active, sharedEmail);
  ids.patients.shared2 = await patient("SharedEmail-2", ids.clinics.delinquent, sharedEmail);
  ids.patients.missingRel = await patient("MissingRelationship", ids.clinics.active, `${tag.toLowerCase()}-missing-rel@example.invalid`);
  ids.patients.revokedRel = await patient("RevokedRelationship", ids.clinics.active, `${tag.toLowerCase()}-revoked-rel@example.invalid`);
  ids.patients.guardian = await patient("GuardianAccount", ids.clinics.active, `${tag.toLowerCase()}-guardian@example.invalid`);
  ids.patients.ward = await patient("GuardianWard", ids.clinics.active, `${tag.toLowerCase()}-ward@example.invalid`);
  await q(
    `INSERT INTO patient_charts (patient_id,clinician_id,medical_history)
     VALUES ($1,$2,$3::jsonb),($4,$2,$5::jsonb)`,
    [ids.patients.chartA.id, ids.owner.id, JSON.stringify([`${tag}-CLINIC-A-CHART`]), ids.patients.chartB.id, JSON.stringify([`${tag}-CLINIC-B-SECRET-CHART`])],
  );
  ids.workflow = await insertOne(
    `INSERT INTO form_workflows (clinic_id,name,description,enabled)
     VALUES ($1,$2,$3,false) RETURNING id`,
    [ids.clinics.delinquent, `${tag} Clinic B workflow`, tag],
  );
  await q(
    `INSERT INTO form_workflow_runs (workflow_id,clinic_id,patient_id,context_json,status,started_at)
     VALUES ($1,$2,$3,$4::jsonb,'running',NOW())`,
    [ids.workflow.id, ids.clinics.delinquent, ids.patients.chartB.id, JSON.stringify({ synthetic: true, secret: `${tag}-CLINIC-B-WORKFLOW` })],
  );

  ids.lab = await insertOne(
    `INSERT INTO lab_results (patient_id,lab_date,lab_values,interpretation_result,patient_communication_summary,notes)
     VALUES ($1,NOW(),'{}'::jsonb,$2::jsonb,$3,$4) RETURNING id`,
    [ids.patients.chartA.id, JSON.stringify({ interpretations: [], redFlags: [], supplements: [], aiRecommendations: "", recheckWindow: "" }), `${tag}-SUMMARY-UNCHANGED`, tag],
  );
  ids.foreignLab = await insertOne(
    `INSERT INTO lab_results (patient_id,lab_date,lab_values,interpretation_result,patient_communication_summary,notes)
     VALUES ($1,NOW(),$2::jsonb,$3::jsonb,$4,$5) RETURNING id`,
    [ids.patients.chartB.id, JSON.stringify({ foreignMarker: `${tag}-CLINIC-B-LAB` }), JSON.stringify({ interpretations: [], redFlags: [] }), `${tag}-FOREIGN-SUMMARY`, tag],
  );
  ids.encounter = await insertOne(
    `INSERT INTO clinical_encounters (clinician_id,patient_id,visit_date,visit_type,clinic_id,chief_complaint,patient_summary,summary_published)
     VALUES ($1,$2,NOW(),'synthetic-validation',$3,$4,'Synthetic released summary',true) RETURNING id`,
    [ids.owner.id, ids.patients.chartA.id, ids.clinics.active, tag],
  );
  ids.document = await insertOne(
    `INSERT INTO patient_documents (clinic_id,patient_id,uploaded_by_user_id,uploaded_by_name,file_name,mime_type,size_bytes,category,source,file_data,notes)
     VALUES ($1,$2,$3,'Synthetic Validator',$4,'text/plain',36,'lab_external','upload',$5,$6) RETURNING id`,
    [ids.clinics.active, ids.patients.chartA.id, ids.owner.id, `${tag}.txt`, Buffer.from("SYNTHETIC DOCUMENT CONTENT").toString("base64"), tag],
  );
  await q(
    `INSERT INTO portal_messages (patient_id,clinician_id,sender_type,content,message_type,visibility)
     VALUES ($1,$2,'clinician',$3,'message','patient_visible')`,
    [ids.patients.chartA.id, ids.owner.id, `${tag} synthetic message`],
  );
  await q(
    `INSERT INTO published_protocols (patient_id,lab_result_id,clinician_id,supplements,patient_summary,lab_date)
     VALUES ($1,$2,$3,'[]'::jsonb,$4,NOW())`,
    [ids.patients.chartA.id, ids.lab.id, ids.owner.id, `${tag} synthetic protocol`],
  );

  ids.portal = {};
  for (const key of ["valid", "missing", "revoked", "guardian"] as const) {
    const patientId = key === "valid" ? ids.patients.chartA.id
      : key === "missing" ? ids.patients.missingRel.id
      : key === "revoked" ? ids.patients.revokedRel.id
      : ids.patients.guardian.id;
    ids.portal[key] = await insertOne(
      `INSERT INTO patient_portal_accounts (patient_id,email,password_hash,is_active)
       VALUES ($1,$2,$3,true) RETURNING id,email,patient_id`,
      [patientId, `${tag.toLowerCase()}-portal-${key}@example.invalid`, hash],
    );
    ids.portal[key].identity = await insertOne(
      `INSERT INTO patient_portal_identities (normalized_email,legacy_portal_account_id,account_status,verification_status)
       VALUES ($1,$2,'active','verified') RETURNING id`,
      [ids.portal[key].email, ids.portal[key].id],
    );
  }
  ids.relationships = {};
  ids.relationships.valid = await insertOne(
    `INSERT INTO patient_clinic_relationships
      (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,verification_method,scope,verified_at)
     VALUES ($1,$2,$3,'self','verified','synthetic_validation','full_portal',NOW()) RETURNING id`,
    [ids.portal.valid.identity.id, ids.patients.chartA.id, ids.clinics.active],
  );
  ids.relationships.secondChart = await insertOne(
    `INSERT INTO patient_clinic_relationships
      (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,verification_method,scope,verified_at)
     VALUES ($1,$2,$3,'self','verified','synthetic_validation','full_portal',NOW()) RETURNING id`,
    [ids.portal.valid.identity.id, ids.patients.chartB.id, ids.clinics.delinquent],
  );
  ids.relationships.revoked = await insertOne(
    `INSERT INTO patient_clinic_relationships
      (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,verification_method,scope,verified_at,revoked_at)
     VALUES ($1,$2,$3,'self','revoked','synthetic_validation','historical_read',NOW(),NOW()) RETURNING id`,
    [ids.portal.revoked.identity.id, ids.patients.revokedRel.id, ids.clinics.active],
  );
  ids.relationships.guardian = await insertOne(
    `INSERT INTO patient_clinic_relationships
      (portal_identity_id,patient_id,clinic_id,relationship_type,relationship_status,verification_method,scope,verified_at)
     VALUES ($1,$2,$3,'guardian','verified','synthetic_validation','guardian_limited',NOW()) RETURNING id`,
    [ids.portal.guardian.identity.id, ids.patients.ward.id, ids.clinics.active],
  );
}

async function exercise() {
  const ownerCookie = await login("/api/auth/login", { username: ids.owner.username, password });
  const validStaffCookie = await login("/api/auth/login", { username: ids.staff.valid.email, password });
  const missingStaffCookie = await login("/api/auth/login", { username: ids.staff.missing.email, password });
  const revokedStaffCookie = await login("/api/auth/login", { username: ids.staff.revoked.email, password });
  const missingMemberCookie = await login("/api/auth/login", { username: ids.missingMember.username, password });
  const revokedMemberCookie = await login("/api/auth/login", { username: ids.revokedMember.username, password });
  const validPortalCookie = await login("/api/portal/login", { email: ids.portal.valid.email, password });
  const missingPortalCookie = await login("/api/portal/login", { email: ids.portal.missing.email, password });
  const revokedPortalCookie = await login("/api/portal/login", { email: ids.portal.revoked.email, password });
  const guardianCookie = await login("/api/portal/login", { email: ids.portal.guardian.email, password });
  ids.cookies = { ownerCookie, validPortalCookie };

  const p = ids.patients.chartA.id;
  const publicInterpretation = await request(undefined, "group1-public", "interpret-labs", "POST", "/api/interpret-labs", "allow", {});
  assert.equal(publicInterpretation.status, 200);
  for (const storedField of ["patientId", "labId", "clinicId"]) {
    const denied = await request(undefined, "group1-public-stored-id", storedField, "POST", "/api/interpret-labs", "deny", { [storedField]: 1 });
    assert.equal(denied.status, 400);
  }
  const publicFemale = await request(undefined, "group1-public", "interpret-labs-female", "POST", "/api/interpret-labs-female", "allow", {});
  assert.equal(publicFemale.status, 200);
  const publicFemaleStoredId = await request(undefined, "group1-public-stored-id", "female-patientId", "POST", "/api/interpret-labs-female", "deny", { patientId: 1 });
  assert.equal(publicFemaleStoredId.status, 400);

  const ownerInterpretation = await request(ownerCookie, "group1-same-clinic", "interpret-labs", "POST", "/api/interpret-labs", "allow", { patientId: p });
  assert.equal(ownerInterpretation.status, 200);
  const staffInterpretation = await request(validStaffCookie, "group1-same-clinic-staff", "interpret-labs-female", "POST", "/api/interpret-labs-female", "allow", { patientId: p });
  assert.equal(staffInterpretation.status, 200);
  const foreignInterpretation = await request(ownerCookie, "group1-cross-clinic", "interpret-labs", "POST", "/api/interpret-labs", "deny", { patientId: ids.patients.chartB.id });
  assert.equal(foreignInterpretation.status, 404);

  const summaryOk = await request(ownerCookie, "group1-same-clinic", "regenerate-summary", "POST", `/api/patients/${p}/labs/${ids.lab.id}/regenerate-patient-summary`, "allow");
  assert.equal(summaryOk.status, 200);
  const summaryBeforeDenied = (await q(`SELECT patient_communication_summary FROM lab_results WHERE id=$1`, [ids.lab.id])).rows[0]?.patient_communication_summary;
  for (const [patientId, labId, scenario] of [
    [p, ids.foreignLab.id, "same-patient-foreign-lab"],
    [ids.patients.chartB.id, ids.lab.id, "foreign-patient-same-lab"],
    [2_000_000_000, ids.lab.id, "nonexistent-patient"],
    [p, 2_000_000_000, "nonexistent-lab"],
  ] as const) {
    const denied = await request(ownerCookie, `group1-${scenario}`, "regenerate-summary", "POST", `/api/patients/${patientId}/labs/${labId}/regenerate-patient-summary`, "deny");
    assert.equal(denied.status, 404);
  }
  const summaryAfterDenied = (await q(`SELECT patient_communication_summary FROM lab_results WHERE id=$1`, [ids.lab.id])).rows[0]?.patient_communication_summary;
  assert.equal(summaryAfterDenied, summaryBeforeDenied, "denied summary requests must not write");

  const group1QueryOverride = await request(ownerCookie, "group1-query-override", "ai-chat", "POST", `/api/ai-chat?clinicId=${ids.clinics.delinquent}`, "deny", { messages: [{ role: "user", content: "Summarize context" }], patientId: ids.patients.chartB.id });
  assert.equal(group1QueryOverride.status, 404);
  const group1HeaderOverride = await request(ownerCookie, "group1-header-override", "ai-chat", "POST", "/api/ai-chat", "deny", { messages: [{ role: "user", content: "Summarize context" }], patientId: ids.patients.chartB.id }, { "x-clinic-id": String(ids.clinics.delinquent) });
  assert.equal(group1HeaderOverride.status, 404);
  const bodyOverride = await request(ownerCookie, "group1-body-override", "ai-chat", "POST", "/api/ai-chat", "deny", { messages: [{ role: "user", content: "Summarize context" }], patientId: ids.patients.chartB.id, clinicId: ids.clinics.delinquent });
  assert.equal(bodyOverride.status, 404);
  const cookieOverride = await request(`${ownerCookie}; activeClinicId=${ids.clinics.delinquent}`, "group1-cookie-override", "ai-chat", "POST", "/api/ai-chat", "deny", { messages: [{ role: "user", content: "Summarize context" }], patientId: ids.patients.chartB.id });
  assert.equal(cookieOverride.status, 404);
  await request(missingMemberCookie, "group1-missing-membership-observation", "ai-chat", "POST", "/api/ai-chat", "probe", { messages: [{ role: "user", content: "Summarize context" }], patientId: p });
  await request(revokedMemberCookie, "group1-revoked-membership-observation", "ai-chat", "POST", "/api/ai-chat", "probe", { messages: [{ role: "user", content: "Summarize context" }], patientId: p });

  const aiOk = await request(ownerCookie, "group1-same-clinic", "ai-chat", "POST", "/api/ai-chat", "allow", { messages: [{ role: "user", content: "Summarize context" }], patientId: p });
  assert.equal(aiOk.status, 200);
  const capturePath = process.env.SYNTHETIC_MODEL_CAPTURE_FILE;
  if (capturePath) {
    const captures = fs.existsSync(capturePath) ? fs.readFileSync(capturePath, "utf8") : "";
    assert.ok(captures.includes(`${tag}-CLINIC-A-CHART`), "same-clinic marker must reach the captured model prompt");
    assert.ok(!captures.includes(`${tag}-CLINIC-B-SECRET-CHART`), "foreign chart marker must not reach the model prompt");
    assert.ok(!captures.includes(`${tag}-CLINIC-B-LAB`), "foreign lab marker must not reach the model prompt");
  }

  await request(ownerCookie, "valid-owner", "chart", "GET", `/api/patients/${p}/chart`, "allow");
  await request(ownerCookie, "valid-owner", "encounter", "GET", `/api/encounters/${ids.encounter.id}`, "allow");
  await request(ownerCookie, "valid-owner", "labs", "GET", `/api/patients/${p}/labs`, "allow");
  await request(ownerCookie, "valid-owner", "documents", "GET", `/api/patients/${p}/documents`, "allow");
  await request(ownerCookie, "valid-owner", "downloads", "GET", `/api/patients/${p}/documents/${ids.document.id}/download`, "allow");
  await request(ownerCookie, "valid-owner", "messages", "GET", `/api/patients/${p}/messages`, "allow");
  await request(ownerCookie, "valid-owner", "background-workflows", "GET", `/api/patients/${p}/active-workflows`, "allow");
  await request(ownerCookie, "background-route-probe", "background-job", "OPTIONS", "/api/jobs/send-appointment-reminders", "probe");

  await request(validStaffCookie, "valid-staff", "chart", "GET", `/api/patients/${p}`, "allow");
  await request(missingStaffCookie, "missing-staff-assignment", "chart", "GET", `/api/patients/${p}`, "allow");
  await q(`UPDATE clinician_staff SET is_active=false WHERE id=$1`, [ids.staff.revoked.id]);
  await request(revokedStaffCookie, "revoked-staff-stale-session", "chart", "GET", `/api/patients/${p}`, "allow");
  await request(missingMemberCookie, "missing-clinic-membership", "chart", "GET", `/api/patients/${p}`, "allow");
  await q(`UPDATE clinic_memberships SET is_active=false WHERE user_id=$1`, [ids.revokedMember.id]);
  await request(revokedMemberCookie, "revoked-membership-stale-session", "chart", "GET", `/api/patients/${p}`, "allow");

  const cross = ids.patients.chartB.id;
  const crossRecords: Record<string, ResponseRecord> = {};
  for (const suffix of ["", "/chart", "/labs", "/documents", "/messages", "/active-workflows"]) {
    crossRecords[suffix || "patient"] = await request(ownerCookie, "cross-clinic-patient-id-tampering", suffix || "patient", "GET", `/api/patients/${cross}${suffix}`, "deny");
  }
  const nonexistentId = 2_000_000_000;
  const missingChart = await request(ownerCookie, "nonexistent-patient", "chart", "GET", `/api/patients/${nonexistentId}/chart`, "deny");
  const missingWorkflows = await request(ownerCookie, "nonexistent-patient", "active-workflows", "GET", `/api/patients/${nonexistentId}/active-workflows`, "deny");
  assert.equal(crossRecords["/chart"].status, 404);
  assert.equal(crossRecords["/chart"].body, missingChart.body, "foreign and nonexistent chart responses must be indistinguishable");
  assert.equal(crossRecords["/active-workflows"].status, 404);
  assert.equal(crossRecords["/active-workflows"].body, missingWorkflows.body, "foreign and nonexistent workflow responses must be indistinguishable");
  assert.ok(!crossRecords["/chart"].body.includes("CLINIC-B-SECRET-CHART"));
  assert.ok(!crossRecords["/active-workflows"].body.includes("CLINIC-B-WORKFLOW"));
  const queryOverride = await request(ownerCookie, "browser-clinic-query-override", "chart", "GET", `/api/patients/${cross}/chart?clinicId=${ids.clinics.delinquent}`, "deny");
  const headerOverride = await request(ownerCookie, "browser-clinic-header-override", "active-workflows", "GET", `/api/patients/${cross}/active-workflows`, "deny", undefined, {
    "x-clinic-id": String(ids.clinics.delinquent),
    "x-active-clinic-id": String(ids.clinics.delinquent),
  });
  assert.equal(queryOverride.status, 404);
  assert.equal(headerOverride.status, 404);
  await request(ownerCookie, "cross-clinic-encounter-id-tampering", "encounter", "GET", `/api/encounters/${ids.encounter.id + 999999}`, "deny");
  await request(ownerCookie, "cross-clinic-clinic-id-tampering", "clinic-switch", "POST", "/api/me/active-clinic", "deny", { clinicId: 99999999 });

  const switchToB = await request(ownerCookie, "valid-clinic-b", "clinic-switch", "POST", "/api/me/active-clinic", "allow", { clinicId: ids.clinics.delinquent });
  const ownBChart = await request(ownerCookie, "valid-clinic-b", "chart", "GET", `/api/patients/${cross}/chart`, "allow");
  const ownBWorkflows = await request(ownerCookie, "valid-clinic-b", "active-workflows", "GET", `/api/patients/${cross}/active-workflows`, "allow");
  assert.equal(switchToB.status, 200);
  assert.equal(ownBChart.status, 200);
  assert.ok(ownBChart.body.includes("CLINIC-B-SECRET-CHART"));
  assert.equal(ownBWorkflows.status, 200);
  assert.ok(ownBWorkflows.body.includes("CLINIC-B-WORKFLOW"));
  await request(ownerCookie, "restore-clinic-a", "clinic-switch", "POST", "/api/me/active-clinic", "allow", { clinicId: ids.clinics.active });

  await request(validPortalCookie, "valid-patient", "portal-profile", "GET", "/api/portal/me", "allow");
  await request(validPortalCookie, "valid-patient", "portal-labs", "GET", "/api/portal/labs", "allow");
  await request(validPortalCookie, "valid-patient", "portal-protocol", "GET", "/api/portal/protocol", "allow");
  await request(validPortalCookie, "valid-patient", "portal-messages", "GET", "/api/portal/messages", "allow");
  await request(validPortalCookie, "valid-patient", "portal-encounters", "GET", "/api/portal/encounters", "allow");
  await request(validPortalCookie, "valid-patient", "portal-documents", "GET", "/api/portal/lab-documents", "allow");
  await request(validPortalCookie, "valid-patient", "portal-download", "GET", `/api/portal/lab-documents/${ids.document.id}/download`, "allow");
  await request(missingPortalCookie, "missing-patient-relationship", "portal-profile", "GET", "/api/portal/me", "allow");
  await request(revokedPortalCookie, "revoked-patient-relationship", "portal-profile", "GET", "/api/portal/me", "allow");
  await q(`UPDATE patient_portal_identities SET session_version=session_version+1 WHERE id=$1`, [ids.portal.valid.identity.id]);
  await request(validPortalCookie, "stale-patient-session-version", "portal-profile", "GET", "/api/portal/me", "allow");
  await request(guardianCookie, "guardian-proxy-current-portal", "portal-profile", "GET", "/api/portal/me", "allow");

  for (const key of ["active", "delinquent", "inactive", "security", "closed"]) {
    await request(ownerCookie, `clinic-state-${key}`, "clinic-switch", "POST", "/api/me/active-clinic", "allow", { clinicId: ids.clinics[key] });
    await request(ownerCookie, `clinic-state-${key}`, "session", "GET", "/api/auth/me", "allow");
  }
}

async function verifyImmediateFlagDisable() {
  const cases = [
    {
      flagKey: "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ",
      policy: "clinic_lifecycle_and_billing",
      cookie: ids.cookies.ownerCookie,
      path: "/api/auth/me",
    },
    {
      flagKey: "SHADOW_STAFF_MEMBERSHIP_AUTHZ",
      policy: "clinic_membership",
      cookie: ids.cookies.ownerCookie,
      path: `/api/patients/${ids.patients.chartA.id}`,
    },
    {
      flagKey: "SHADOW_PATIENT_CLINIC_RELATIONSHIP",
      policy: "patient_clinic_relationship",
      cookie: ids.cookies.validPortalCookie,
      path: "/api/portal/me",
    },
  ];
  for (const item of cases) {
    await q(`UPDATE authorization_feature_flags SET enabled=false,updated_at=NOW() WHERE flag_key=$1 AND clinic_id IS NULL`, [item.flagKey]);
    const requestId = `${tag}-flag-off-${item.flagKey}`;
    const response = await fetch(`${baseUrl}${item.path}`, {
      headers: { cookie: item.cookie, "x-request-id": requestId },
    });
    await response.arrayBuffer();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const observed = await q(
      `SELECT count(*)::int AS count FROM authorization_shadow_decisions WHERE request_id=$1 AND policy_key=$2`,
      [requestId, item.policy],
    );
    const count = observed.rows[0].count;
    flagDisableResults.push({ flagKey: item.flagKey, observedRows: count, passed: count === 0 });
    await q(`UPDATE authorization_feature_flags SET enabled=true,updated_at=NOW() WHERE flag_key=$1 AND clinic_id IS NULL`, [item.flagKey]);
  }
}

async function report() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const decisions = await q(
    `SELECT difference_type, count(*)::int AS count
     FROM authorization_shadow_decisions
     WHERE request_id LIKE $1
     GROUP BY difference_type ORDER BY difference_type`,
    [`${tag}-%`],
  );
  const endpointCoverage = await q(
    `SELECT route_path, policy_key, difference_type, count(*)::int AS count
     FROM authorization_shadow_decisions
     WHERE request_id LIKE $1
     GROUP BY route_path, policy_key, difference_type
     ORDER BY route_path, policy_key, difference_type`,
    [`${tag}-%`],
  );
  const sensitive = await q(
    `SELECT count(*)::int AS count
     FROM authorization_shadow_decisions
     WHERE request_id LIKE $1
       AND (
         evidence::text ~* '(password|token|cookie|transcript|document content|synthetic message|synthetic protocol)'
         OR route_path ~* '(connect\\.sid|password|token=)'
       )`,
    [`${tag}-%`],
  );
  const schema = await q(
    `SELECT
       (SELECT count(*)::int FROM information_schema.table_constraints
        WHERE table_schema='public' AND table_name = ANY($1) AND constraint_type='FOREIGN KEY') AS foreign_keys,
       (SELECT count(*)::int FROM information_schema.table_constraints
        WHERE table_schema='public' AND table_name = ANY($1) AND constraint_type='CHECK') AS checks,
       (SELECT count(*)::int FROM pg_indexes
        WHERE schemaname='public' AND tablename = ANY($1)) AS indexes`,
    [[
      "clinic_lifecycle_foundation", "clinic_billing_foundation", "authorization_feature_flags",
      "authorization_shadow_decisions", "access_backfill_runs", "access_review_queue",
      "patient_portal_identities", "patient_clinic_relationships",
    ]],
  );
  const output = {
    tag,
    responses,
    responseSummary: responses.reduce((acc: Record<string, number>, item) => {
      acc[`${item.expectedCurrent}:${item.status}`] = (acc[`${item.expectedCurrent}:${item.status}`] ?? 0) + 1;
      return acc;
    }, {}),
    shadowDecisionCounts: decisions.rows,
    endpointCoverage: endpointCoverage.rows,
    sensitiveShadowRows: sensitive.rows[0]?.count ?? null,
    schemaMetadataCounts: schema.rows[0],
    flagDisableResults,
    knownUntested: [
      "POST /api/jobs/send-appointment-reminders execution (side-effecting shared-dev reminder sweep; OPTIONS probe only)",
      "Realtime endpoints (none registered in server routes)",
      "Guardian/proxy chart switching (current portal has no relationship-aware clinic/chart selector)",
    ],
  };
  await q(
    `INSERT INTO access_backfill_runs (run_type,status,summary,created_by)
     VALUES ('synthetic_validation','completed',$1::jsonb,'synthetic-access-validator')`,
    [JSON.stringify(output)],
  );
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function cleanup() {
  await q(`DELETE FROM patients WHERE mrn LIKE $1`, [`${tag}-%`]);
  await q(`DELETE FROM patient_portal_identities WHERE normalized_email LIKE $1`, [`${tag.toLowerCase()}%`]);
  if (ids.owner?.id) {
    await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [[ids.owner.id, ids.missingMember?.id, ids.revokedMember?.id].filter(Boolean)]);
  }
  if (ids.clinics) {
    await q(`DELETE FROM clinics WHERE id = ANY($1::int[])`, [Object.values(ids.clinics)]);
  }
}

async function main() {
  try {
    await setup();
    await exercise();
    await verifyImmediateFlagDisable();
    await report();
  } finally {
    await cleanup().catch((error) => console.error("[synthetic-cleanup]", error.message));
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[synthetic-access-validation]", error);
  process.exitCode = 1;
});