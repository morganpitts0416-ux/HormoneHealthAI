// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { memoryPrescriptionDb } from "./prescription-memory-db";
import { syntheticSignature, syntheticPrescription } from "./prescription-fixtures";
import { prescriptionReviewHash } from "../../server/prescription-finalization";

const state = vi.hoisted(() => ({ memory: null as any, actor: null as any, session: {} as any, authenticated: true }));
vi.mock("../../server/storage", () => ({ db: new Proxy({}, { get: (_target, key) => state.memory.db[key] }) }));
const objects = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn() }));
vi.mock("../../server/prescription-storage", async importOriginal => ({
  ...(await importOriginal<any>()),
  storeSignedPrescriptionPdf: objects.save,
  retrieveSignedPrescriptionPdf: objects.read,
}));
import { registerPrescriptionRoutes } from "../../server/prescription-routes";

let server: Server, base: string, temp: string;
const request = (suffix: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) =>
  fetch(base + suffix, { method, headers: { "Content-Type": "application/json", ...headers }, body: data ? JSON.stringify(data) : undefined });
const sign = () => request("/api/prescriptions/1/sign", "POST", { confirmSign: true, reviewHash: prescriptionReviewHash(syntheticPrescription()) });
beforeAll(async () => {
  state.memory = memoryPrescriptionDb();
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "rx-synthetic-tests-"));
  fs.writeFileSync(path.join(temp, "catalog.json"), JSON.stringify([{
    medicationName: "Synthetic Medication", strength: "10 mg", dosageForm: "tablet",
    noncontrolled: true, sourceReference: "Synthetic-only reference",
    reviewedBy: "Synthetic reviewer", reviewedAt: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z",
  }]));
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = state.actor; req.session = state.session;
    req.isAuthenticated = () => state.authenticated; next();
  });
  registerPrescriptionRoutes(app);
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => { server.close(); fs.rmSync(temp, { recursive: true, force: true }); vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.stubEnv("PRESCRIPTION_SIGNING_APPROVED", "true");
  vi.stubEnv("PRESCRIPTION_PDF_BUCKET", "synthetic-only");
  vi.stubEnv("PRESCRIPTION_NONCONTROLLED_CATALOG_PATH", path.join(temp, "catalog.json"));
  state.actor = { id: 7, defaultClinicId: 999 }; // stale serialized default must not win
  state.session = { activeClinicId: 10 }; state.authenticated = true;
  state.memory.reset({
    users: [{ id: 7, defaultClinicId: 10, firstName: "Synthetic", lastName: "Provider", npi: "1234567890", title: "MD", signatureImage: syntheticSignature }],
    clinics: [{ id: 10, name: "Synthetic Clinic", isActive: true, subscriptionStatus: "active" }, { id: 11, name: "Other Synthetic Clinic", isActive: true, subscriptionStatus: "active" }],
    clinic_memberships: [{ id: 1, userId: 7, clinicId: 10, isActive: true, acceptanceStatus: "active", accessScope: "full", clinicalRole: "provider", adminRole: "owner" }],
    clinician_staff: [{ id: 5, clinicianId: 7, clinicId: 10, isActive: true, role: "nurse" }],
    prescriber_credentials: [{ id: 1, userId: 7, clinicId: 10, prescribingAuthorized: true, verifiedAt: new Date(), verifiedByUserId: 8, licenseNumber: "SYNTHETIC-001", licenseState: "MS", licenseExpiresAt: "2099-01-01" }],
    patients: [{ id: 20, clinicId: 10, firstName: "Synthetic", lastName: "Patient", dateOfBirth: new Date("1990-01-01"), address: "1 Example Avenue" }],
    prescriptions: [syntheticPrescription()], prescription_documents: [], prescription_audit_events: [],
  });
  objects.save.mockReset().mockResolvedValue({ storageKey: "clinics/10/prescriptions/1/12345678-1234-1234-1234-123456789012/signed.pdf", sha256Hash: "a".repeat(64) });
  objects.read.mockReset().mockResolvedValue(Buffer.from("%PDF-synthetic-stored"));
});
describe("Actual prescription HTTP routes with synthetic Drizzle predicates", () => {
  it("denies unauthenticated access before prescription queries", async () => {
    state.authenticated = false;
    expect((await request("/api/prescriptions/1")).status).toBe(403);
    expect(state.memory.calls.some((c: any) => c.table === "prescriptions")).toBe(false);
  });
  it("rejects an invalid selected clinic without falling back to default", async () => {
    state.session.activeClinicId = "invalid";
    expect((await request("/api/prescriptions/1")).status).toBe(403);
    expect(objects.save).not.toHaveBeenCalled();
  });
  it("re-reads authoritative default instead of trusting serialized account", async () => {
    state.session = {};
    expect((await request("/api/prescriptions/1")).status).toBe(200);
  });
  it("does not allow headers, cookies or query parameters to override clinic selection", async () => {
    state.session.activeClinicId = 11;
    expect((await request("/api/prescriptions/1?clinicId=10", "GET", undefined,
      { "X-Clinic-Id": "10", Cookie: "activeClinicId=10" })).status).toBe(403);
    expect(objects.save).not.toHaveBeenCalled();
  });
  it("denies cross-clinic prescription and PDF even when membership in other clinic is valid", async () => {
    state.memory.tables.clinic_memberships.push({ ...state.memory.tables.clinic_memberships[0], id: 2, clinicId: 11 });
    state.session.activeClinicId = 11;
    expect((await request("/api/prescriptions/1")).status).toBe(404);
    expect((await sign()).status).toBe(404);
    expect((await request("/api/prescriptions/1/pdf")).status).toBe(404);
    expect(objects.save).not.toHaveBeenCalled(); expect(objects.read).not.toHaveBeenCalled();
  });
  it.each(["canceled", "unpaid"])("denies %s clinic", async status => {
    state.memory.tables.clinics[0].subscriptionStatus = status;
    expect((await request("/api/prescriptions/1")).status).toBe(403);
  });
  it("denies removed membership, inactive clinic and external reviewer", async () => {
    state.memory.tables.clinic_memberships[0].isActive = false;
    expect((await sign()).status).toBe(403);
    state.memory.tables.clinic_memberships[0].isActive = true;
    state.memory.tables.clinics[0].isActive = false;
    expect((await sign()).status).toBe(403);
    state.memory.tables.clinics[0].isActive = true;
    state.memory.tables.clinic_memberships[0].clinicalRole = "external_reviewer";
    expect((await sign()).status).toBe(403);
  });
  it("allows authorized staff draft review but never staff signing", async () => {
    state.authenticated = false; state.actor = undefined;
    state.session = { staffId: 5, staffClinicianId: 7, staffClinicianClinicId: 10 };
    expect((await request("/api/prescriptions/1")).status).toBe(200);
    expect((await sign()).status).toBe(403); expect(objects.save).not.toHaveBeenCalled();
  });
  it("denies stale staff assignments", async () => {
    state.session = { staffId: 5, staffClinicianId: 7, staffClinicianClinicId: 10 };
    state.memory.tables.clinician_staff[0].isActive = false;
    expect((await request("/api/prescriptions/1")).status).toBe(403);
  });
  it("RN can prepare but not sign", async () => {
    state.memory.tables.clinic_memberships[0].clinicalRole = "rn";
    expect((await request("/api/prescriptions/1")).status).toBe(200);
    expect((await sign()).status).toBe(403);
  });
  it.each(["unverified", "expired", "no-signature", "unauthorized", "self-verified"])("rejects %s prescriber without upload", async reason => {
    if (reason === "unverified") state.memory.tables.prescriber_credentials[0].verifiedAt = null;
    if (reason === "expired") state.memory.tables.prescriber_credentials[0].licenseExpiresAt = "2000-01-01";
    if (reason === "no-signature") state.memory.tables.users[0].signatureImage = null;
    if (reason === "unauthorized") state.memory.tables.prescriber_credentials[0].prescribingAuthorized = false;
    if (reason === "self-verified") state.memory.tables.prescriber_credentials[0].verifiedByUserId = 7;
    expect((await sign()).status).toBe(403); expect(objects.save).not.toHaveBeenCalled();
  });
  it("requires explicit confirmation and reviewed hash; rejects client-supplied signer/context", async () => {
    expect((await request("/api/prescriptions/1/sign", "POST", { confirmSign: false })).status).toBe(400);
    expect((await request("/api/prescriptions/1/sign", "POST", { confirmSign: true, reviewHash: "a".repeat(64), clinicId: 10, signedByUserId: 7 })).status).toBe(400);
    expect(objects.save).not.toHaveBeenCalled();
  });
  it("keeps the approval gate closed without even querying patient data", async () => {
    vi.stubEnv("PRESCRIPTION_SIGNING_APPROVED", "");
    expect((await sign()).status).toBe(503);
    expect(state.memory.calls).toEqual([]); expect(objects.save).not.toHaveBeenCalled();
  });
  it("signs atomically with row lock, saved signature and document/audit", async () => {
    expect((await sign()).status).toBe(200);
    expect(state.memory.tables.prescriptions[0]).toMatchObject({ status: "signed", signedByUserId: 7 });
    expect(state.memory.tables.prescription_documents).toHaveLength(1);
    expect(state.memory.tables.prescription_audit_events).toHaveLength(1);
    expect(state.memory.calls).toContainEqual({ table: "prescriptions", lock: "update" });
  });
  it("handles concurrent requests as one sign with one stored document", async () => {
    const results = await Promise.all([sign(), sign()]);
    expect(results.map(r => r.status)).toEqual([200, 200]); expect(objects.save).toHaveBeenCalledTimes(1);
    expect(state.memory.tables.prescription_documents).toHaveLength(1);
  });
  it("blocks modification after signing", async () => {
    await sign();
    expect((await request("/api/prescriptions/1", "PATCH", {
      patientId: 20, medicationName: "Synthetic Medication", sig: "changed", quantity: "90",
    })).status).toBe(404);
    expect(state.memory.tables.prescriptions[0].sig).toBe("Take one tablet daily");
  });
  it("creates a draft and audit atomically without signing or storage", async () => {
    const response = await request("/api/patients/20/prescriptions", "POST", {
      medicationName: "Synthetic Medication", strength: "10 mg", dosageForm: "tablet",
      sig: "Take one tablet daily", quantity: "30", refills: 1,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ clinicId: 10, patientId: 20, status: "draft", createdByUserId: 7 });
    expect(state.memory.tables.prescription_audit_events).toHaveLength(1);
    expect(objects.save).not.toHaveBeenCalled();
  });
  it("rejects draft creation for a patient in another clinic", async () => {
    state.memory.tables.patients[0].clinicId = 11;
    expect((await request("/api/patients/20/prescriptions", "POST", {
      medicationName: "Synthetic Medication", sig: "Take daily", quantity: "30",
    })).status).toBe(404);
    expect(state.memory.tables.prescription_audit_events).toHaveLength(0);
  });
  it("refuses spoofed draft status, signer, clinic and controlled flag", async () => {
    for (const extra of [{ clinicId: 11 }, { signedByUserId: 7 }, { status: "signed" }, { isControlledSubstance: true }]) {
      expect((await request("/api/patients/20/prescriptions", "POST", {
        medicationName: "Synthetic Medication", sig: "Take daily", quantity: "30", ...extra,
      })).status).toBe(400);
    }
    expect(objects.save).not.toHaveBeenCalled();
  });
  it("fails closed on altered patient relationship", async () => {
    state.memory.tables.patients[0].clinicId = 11;
    expect((await sign()).status).toBe(404); expect(objects.save).not.toHaveBeenCalled();
  });
  it("rolls back on upload failure and permits retry", async () => {
    objects.save.mockRejectedValueOnce(new Error("Synthetic interrupted upload"));
    expect((await sign()).status).toBe(503);
    expect(state.memory.tables.prescriptions[0].status).toBe("draft");
    expect(state.memory.tables.prescription_documents).toHaveLength(0);
    expect((await sign()).status).toBe(200);
  });
  it("rolls back on failed audit transaction", async () => {
    state.memory.failAudit(true);
    expect((await sign()).status).toBe(503);
    expect(state.memory.tables.prescriptions[0].status).toBe("draft");
    expect(state.memory.tables.prescription_documents).toHaveLength(0);
  });
  it("returns stored PDF bytes rather than regenerating", async () => {
    await sign();
    const response = await request("/api/prescriptions/1/pdf");
    expect(response.status).toBe(200); expect(await response.text()).toBe("%PDF-synthetic-stored");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(objects.save).toHaveBeenCalledTimes(1); expect(objects.read).toHaveBeenCalledTimes(1);
  });
  it("rejects a document linked to another tenant before reading storage", async () => {
    await sign(); state.memory.tables.prescription_documents[0].storageKey = "clinics/11/prescriptions/1/signed.pdf";
    expect((await request("/api/prescriptions/1/pdf")).status).toBe(500);
    expect(objects.read).not.toHaveBeenCalled();
  });
  it("does not serve bytes on integrity failure", async () => {
    await sign(); objects.read.mockRejectedValue(new Error("Synthetic integrity failure"));
    const result = await request("/api/prescriptions/1/pdf");
    expect(result.status).toBe(500); expect(await result.text()).not.toContain("%PDF");
  });
});
