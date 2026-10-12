// Actual application HTTP calls through gcloud's authenticated staging proxy.
// Cookies/passwords stay in memory/private files; no production APIs or data.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const [workspace, mode = "normal"] = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(path.join(workspace, "state.json")));
assert.match(state.service, /^cliniq-rx-stage-[a-z0-9-]+$/);
assert.equal(state.project, "realign-lab-app");
const base = "http://127.0.0.1:" + state.http_proxy_port;
const fixture = JSON.parse(fs.readFileSync(path.join(workspace, "private/accounts.json")));
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const row = body => body.prescription || body.medication || body.pharmacy || body;
async function actor(name) {
  let cookie = "";
  const call = async (method, pathname, body) => {
    const response = await fetch(base + pathname, {
      method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map(c => c.split(";")[0]).join("; ");
    const bytes = Buffer.from(await response.arrayBuffer());
    let json; try { json = JSON.parse(bytes.toString()); } catch { json = null; }
    return { status: response.status, json, bytes };
  };
  if (name) {
    const { username, password } = fixture.accounts[name];
    check("authenticated " + name, (await call("POST", "/api/login", { username, password })).status === 200);
  }
  return call;
}
try {
  const provider = await actor("provider");
  const owner = await actor("owner");
  const outsider = await actor("outsider");
  const nurse = await actor("nurse");
  const anonymous = await actor();
  const draftBody = {
    medicationName: "SYNTHETIC STAGING MEDICATION", strength: "10 mg", dosageForm: "tablet",
    dose: "1 tablet", route: "oral", frequency: "daily", sig: "SYNTHETIC TEST ONLY: take one tablet daily.",
    quantity: "30", refills: 0, pharmacyName: "Synthetic Staging Pharmacy", pharmacyPhone: "555-0103",
    pharmacyAddress: "300 Synthetic Pharmacy Avenue", pharmacyFax: "555-0104",
  };
  async function draft(body = draftBody) {
    const result = await provider("POST", `/api/patients/${fixture.patient}/prescriptions`, body);
    check("create unsigned draft", result.status === 201);
    return row(result.json);
  }
  async function review(id) {
    const result = await provider("GET", "/api/prescriptions/" + id);
    check("review includes immutable-content hash", result.status === 200 && /^[a-f0-9]{64}$/.test(result.json.reviewHash));
    return result.json.reviewHash;
  }
  if (mode === "upload-failure") {
    const rx = await draft();
    const hash = await review(rx.id);
    const failure = await provider("POST", `/api/prescriptions/${rx.id}/sign`, { confirmSign: true, reviewHash: hash });
    check("real inaccessible-bucket upload is rejected", failure.status >= 500);
    const reread = await provider("GET", "/api/prescriptions/" + rx.id);
    check("failed upload leaves draft unsigned", reread.json.status === "draft" && !reread.json.signedDocumentId);
  } else {
    const med = await provider("POST", "/api/prescription-medications", { medicationName: draftBody.medicationName, strength: "10 mg", dosageForm: "tablet" });
    check("clinic medication directory creation", med.status === 201);
    const medId = row(med.json).id;
    check("selected strength and form retained", row(med.json).strength === "10 mg" && row(med.json).dosageForm === "tablet");
    check("second searchable formulation", (await provider("POST", "/api/prescription-medications", {
      medicationName: draftBody.medicationName, strength: "20 mg", dosageForm: "tablet",
    })).status === 201);
    check("saved SIG creation", (await provider("POST", `/api/prescription-medications/${medId}/sigs`, { sig: draftBody.sig, dose: draftBody.dose, route: "oral", frequency: "daily" })).status === 201);
    const shared = await owner("GET", `/api/prescription-medications/${medId}/sigs`);
    check("SIG shared with same-clinic owner", shared.status === 200);
    check("other clinic cannot see saved SIG", [403,404].includes((await outsider("GET", `/api/prescription-medications/${medId}/sigs`)).status));
    check("pharmacy directory creation", (await provider("POST", "/api/prescription-pharmacies", { name: draftBody.pharmacyName, address: draftBody.pharmacyAddress, phone: draftBody.pharmacyPhone, fax: draftBody.pharmacyFax })).status === 201);
    const details = { licenseState: "CA", licenseNumber: "SYNTHETIC-STAGE-ONLY", licenseType: "MD", licenseExpiresAt: "2030-01-01" };
    check("provider submits synthetic credentials", (await provider("PUT", "/api/prescriber-credentials/me", details)).status === 200);
    check("owner submits separate credentials", (await owner("PUT", "/api/prescriber-credentials/me", details)).status === 200);
    const verification = await owner("GET", "/api/prescriber-verification");
    check("independent verification directory available", verification.status === 200);
    const credentials = verification.json.providers.find(p => p.userId === fixture.accounts.provider.id);
    const ownCredentials = verification.json.providers.find(p => p.userId === fixture.accounts.owner.id);
    const approve = entry => ({ approved: true, verificationHash: entry.verificationHash, verificationSource: "Synthetic staging test; NOT clinical verification" });
    check("self approval denied", (await owner("POST", `/api/prescriber-credentials/${ownCredentials.credentialId}/verify`, approve(ownCredentials))).status === 403);
    const unsigned = await draft();
    check("signing before independent approval denied", (await provider("POST", `/api/prescriptions/${unsigned.id}/sign`, { confirmSign: true, reviewHash: await review(unsigned.id) })).status === 403);
    check("independent owner approval", (await owner("POST", `/api/prescriber-credentials/${credentials.credentialId}/verify`, approve(credentials))).status === 200);
    const hash = await review(unsigned.id);
    check("anonymous access denied", [401,403].includes((await anonymous("GET", `/api/prescriptions/${unsigned.id}`)).status));
    check("wrong clinic cannot access prescription", [403,404].includes((await outsider("GET", `/api/prescriptions/${unsigned.id}`)).status));
    check("wrong clinic cannot sign", [403,404].includes((await outsider("POST", `/api/prescriptions/${unsigned.id}/sign`, { confirmSign: true, reviewHash: hash })).status));
    check("nurse cannot sign", (await nurse("POST", `/api/prescriptions/${unsigned.id}/sign`, { confirmSign: true, reviewHash: hash })).status === 403);
    check("explicit intent required", (await provider("POST", `/api/prescriptions/${unsigned.id}/sign`, { reviewHash: hash })).status === 400);
    check("changed review hash denied", [409,422].includes((await provider("POST", `/api/prescriptions/${unsigned.id}/sign`, { confirmSign: true, reviewHash: "0".repeat(64) })).status));
    check("controlled prescription creation denied", (await provider("POST", `/api/patients/${fixture.patient}/prescriptions`, { ...draftBody, isControlledSubstance: true })).status === 400);
    const signs = await Promise.all([1,2].map(() => provider("POST", `/api/prescriptions/${unsigned.id}/sign`, { confirmSign: true, reviewHash: hash })));
    check("duplicate signing yields exactly one successful finalization", signs.filter(r => r.status === 200).length === 1 && signs.some(r => r.status === 409));
    const pdf = await provider("GET", `/api/prescriptions/${unsigned.id}/pdf`);
    check("actual stored PDF downloadable", pdf.status === 200 && pdf.bytes.subarray(0,5).toString() === "%PDF-" && pdf.bytes.includes(Buffer.from("%%EOF")));
    fs.writeFileSync(path.join(workspace, "synthetic-signed.pdf"), pdf.bytes, { mode: 0o600 });
    check("wrong clinic cannot download PDF", [403,404].includes((await outsider("GET", `/api/prescriptions/${unsigned.id}/pdf`)).status));
    const chart = await provider("GET", `/api/patients/${fixture.patient}/prescriptions`);
    const prescriptions = Array.isArray(chart.json) ? chart.json : chart.json.prescriptions;
    check("signed prescription appears in chart data", chart.status === 200 && prescriptions.some(r => r.id === unsigned.id && r.status === "signed"));
    const unknown = await draft({ ...draftBody, medicationName: "UNREVIEWED SYNTHETIC MEDICATION" });
    check("unreviewed formulation cannot sign", (await provider("POST", `/api/prescriptions/${unknown.id}/sign`, { confirmSign: true, reviewHash: await review(unknown.id) })).status === 422);
    fs.writeFileSync(path.join(workspace, "download-result.json"), JSON.stringify({ prescriptionId: unsigned.id, downloadedSha256: createHash("sha256").update(pdf.bytes).digest("hex") }));
  }
  fs.writeFileSync(path.join(workspace, `http-results-${mode}.json`), JSON.stringify({ mode, passed: checks, infrastructure: "actual staging HTTP/GCS; no mocks", browserTested: false }, null, 2));
  console.log("Actual staging HTTP checks passed: " + checks.length + " (" + mode + ").");
} catch (error) {
  const failedCheck = error.code === "ERR_ASSERTION" ? error.message : "Unexpected response shape or HTTP error";
  fs.writeFileSync(path.join(workspace, `http-results-${mode}.json`), JSON.stringify({ mode, passed: checks, failed: true, failedCheck }));
  console.error("Staging workflow failed; credentials/cookies/response bodies withheld. Inspect the named check in the private workspace.");
  process.exitCode = 1;
}
