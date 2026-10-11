// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { memoryPrescriptionDb } from "./prescription-memory-db";
const state = vi.hoisted(() => ({ memory: null as any, actor: null as any, session: {} as any, authenticated: true }));
vi.mock("../../server/storage", () => ({ db: new Proxy({}, { get: (_target, key) => state.memory.db[key] }) }));
import { registerPrescriptionRoutes } from "../../server/prescription-routes";
import { directoryIdentity } from "../../server/prescription-directory-routes";
let server: Server, base: string;
const request = (url: string, method = "GET", body?: unknown) => fetch(base + url, {
  method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
});
const entry = { medicationName: "Synthetic Medication", strength: "25 mg", dosageForm: "tablet" };
const medPath = "/api/prescription-medications";
const pharmacyPath = "/api/prescription-pharmacies";
const directions = { sig: "Take one tablet orally each morning", dose: "1 tablet", route: "oral", frequency: "each morning" };
const seedMedication = (id = 1, clinicId = 10, strength = "25 mg") => ({
  id, clinicId, ...entry, strength, isActive: true, identityKey: directoryIdentity(entry.medicationName, strength, entry.dosageForm),
});
const seedSig = (id = 1, medicationId = 1, clinicId = 10) => ({
  id, clinicId, medicationId, ...directions, identityKey: directoryIdentity(directions.sig), isActive: true, createdByUserId: 7,
});
beforeAll(async () => {
  state.memory = memoryPrescriptionDb();
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = state.actor; req.session = state.session; req.isAuthenticated = () => state.authenticated; next();
  });
  registerPrescriptionRoutes(app);
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  state.actor = { id: 7 }; state.session = { activeClinicId: 10 }; state.authenticated = true;
  state.memory.reset({
    users: [{ id: 7, defaultClinicId: 10 }, { id: 8, defaultClinicId: 10 }],
    clinics: [{ id: 10, isActive: true, subscriptionStatus: "active" }, { id: 11, isActive: true, subscriptionStatus: "active" }],
    clinic_memberships: [7, 8].map(userId => ({ id: userId, userId, clinicId: 10, isActive: true, acceptanceStatus: "active", accessScope: "full", clinicalRole: "provider" })),
    clinician_staff: [{ id: 5, clinicianId: 7, clinicId: 10, isActive: true, role: "nurse" }],
    prescription_medications: [seedMedication(), seedMedication(2, 11)],
    prescription_sigs: [seedSig(), seedSig(2, 2, 11)],
    prescription_pharmacies: [
      { id: 1, clinicId: 10, name: "Synthetic Pharmacy", address: "1 Example Road", phone: "555-0100", fax: "555-0101", isActive: true },
      { id: 2, clinicId: 11, name: "Other Pharmacy", address: "2 Example Road", isActive: true },
    ],
    prescriptions: [{ id: 1, clinicId: 10, patientId: 20, status: "signed", medicationName: "Original Snapshot", pharmacyName: "Original Pharmacy", sig: "Original instructions" }],
  });
});
describe("Clinic-shared prescription directory using real route authorization", () => {
  it.each([medPath, medPath + "/1/sigs", pharmacyPath])("denies unauthenticated %s", async url => {
    state.authenticated = false; expect((await request(url)).status).toBe(403);
  });
  it.each(["external_reviewer", "admin_only"])("denies nonclinical role %s", async role => {
    state.memory.tables.clinic_memberships[0].clinicalRole = role;
    expect((await request(medPath)).status).toBe(403);
    expect((await request(pharmacyPath, "POST", { name: "Denied" })).status).toBe(403);
  });
  it("denies stale staff, invalid selected clinics and removed membership", async () => {
    state.session = { staffId: 5, staffClinicianId: 99, staffClinicianClinicId: 10 };
    expect((await request(medPath)).status).toBe(403);
    state.session = { activeClinicId: "bad" };
    expect((await request(medPath)).status).toBe(403);
    state.session = { activeClinicId: 10 }; state.memory.tables.clinic_memberships[0].isActive = false;
    expect((await request(medPath)).status).toBe(403);
  });
  it.each(["canceled", "unpaid"])("denies %s clinic", async subscriptionStatus => {
    state.memory.tables.clinics[0].subscriptionStatus = subscriptionStatus;
    expect((await request(medPath)).status).toBe(403);
  });
  it("allows nurse preparation directory access without granting signing", async () => {
    state.actor = null; state.authenticated = false;
    state.session = { staffId: 5, staffClinicianId: 7, staffClinicianClinicId: 10 };
    const response = await request(medPath + "/1/sigs", "POST", { sig: "Synthetic staff directions" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ clinicId: 10, createdByUserId: 7, createdByStaffId: 5 });
  });
  it("shares SIGs with another active clinician in the same clinic", async () => {
    state.actor = { id: 8 };
    expect(await (await request(medPath + "/1/sigs")).json()).toEqual([expect.objectContaining({ createdByUserId: 7 })]);
  });
  it("lists and searches only the active clinic's formulations", async () => {
    expect(await (await request(medPath)).json()).toHaveLength(1);
    expect(await (await request(medPath + "?search=25")).json()).toHaveLength(1);
    expect(await (await request(medPath + "?search=no-match")).json()).toEqual([]);
    expect(await (await request(medPath + "?search=%25")).json()).toEqual([]);
  });
  it.each([medPath + "/2/sigs", medPath + "/2/sigs/2", medPath + "/1/sigs/2", pharmacyPath + "/2", medPath + "/2"])("blocks other-clinic or misassociated IDs %s", async url => {
    const isSig = url.includes("/sigs");
    const response = await request(url, "PATCH", isSig ? { sig: "Changed" } : { isActive: false });
    // /2/sigs is a POST-only resource; explicitly tested separately below.
    expect([404, 405]).toContain(response.status);
  });
  it("blocks other-clinic SIG reads and creation", async () => {
    expect((await request(medPath + "/2/sigs")).status).toBe(404);
    expect((await request(medPath + "/2/sigs", "POST", directions)).status).toBe(404);
  });
  it("requires explicit complete formulation and forbids authority/clinic injection", async () => {
    for (const body of [{ medicationName: "Name only" }, { ...entry, clinicId: 11 }, { ...entry, isControlledSubstance: false }, { ...entry, prescribingAuthorized: true }]) {
      expect((await request(medPath, "POST", body)).status).toBe(400);
    }
    expect((await request(medPath + "/1/sigs", "POST", { ...directions, createdByUserId: 8 })).status).toBe(400);
    expect((await request(medPath + "?includeInactive=invalid")).status).toBe(400);
    expect((await request(medPath + "/1/sigs?search=not-supported")).status).toBe(400);
  });
  it("deduplicates formulation identities but allows distinct strengths", async () => {
    expect((await request(medPath, "POST", { ...entry, medicationName: "  synthetic   medication  " })).status).toBe(409);
    const response = await request(medPath, "POST", { ...entry, strength: "50 mg" });
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ strength: "50 mg", clinicId: 10 });
  });
  it("concurrent duplicate formulation inserts fail without duplicates", async () => {
    const result = await Promise.all([request(medPath, "POST", { ...entry, strength: "50 mg" }), request(medPath, "POST", { ...entry, strength: "50 mg" })]);
    expect(result.map(r => r.status).sort()).toEqual([201, 409]);
    expect(state.memory.tables.prescription_medications.filter((r: any) => r.strength === "50 mg")).toHaveLength(1);
  });
  it("archives SIGs when formulation identity changes; old prescriptions are immutable snapshots", async () => {
    const before = structuredClone(state.memory.tables.prescriptions);
    expect((await request(medPath + "/1", "PATCH", { strength: "50 mg" })).status).toBe(200);
    expect(state.memory.tables.prescription_sigs[0].isActive).toBe(false);
    expect(await (await request(medPath + "/1/sigs")).json()).toEqual([]);
    expect(state.memory.tables.prescriptions).toEqual(before);
  });
  it("deactivates/reactivates medications without silently reviving old SIGs", async () => {
    expect((await request(medPath + "/1", "PATCH", { isActive: false })).status).toBe(200);
    expect(await (await request(medPath)).json()).toEqual([]);
    expect(await (await request(medPath + "?includeInactive=true")).json()).toHaveLength(1);
    expect((await request(medPath + "/1/sigs", "POST", directions)).status).toBe(404);
    expect((await request(medPath + "/1", "PATCH", { isActive: true })).status).toBe(200);
    expect(await (await request(medPath + "/1/sigs")).json()).toEqual([]);
    expect((await request(medPath + "/1/sigs/1", "PATCH", { isActive: true })).status).toBe(200);
  });
  it("saves new directions separately from medication and handles duplicate retries", async () => {
    const body = { sig: "Take half a tablet daily", dose: "half tablet", route: "oral", frequency: "daily" };
    const result = await Promise.all([request(medPath + "/1/sigs", "POST", body), request(medPath + "/1/sigs", "POST", body)]);
    expect(result.map(r => r.status).sort()).toEqual([200, 201]);
    expect(state.memory.tables.prescription_sigs.filter((r: any) => r.sig === body.sig)).toHaveLength(1);
    expect((await request(medPath + "/1/sigs", "POST", { sig: "  TAKE   HALF A TABLET DAILY " })).status).toBe(200);
  });
  it("edits directions, prevents duplicate edits, and deactivates/reactivates", async () => {
    expect((await request(medPath + "/1/sigs", "POST", { sig: "Different instructions" })).status).toBe(201);
    expect((await request(medPath + "/1/sigs/1", "PATCH", { sig: "different instructions" })).status).toBe(409);
    expect((await request(medPath + "/1/sigs/1", "PATCH", { sig: "New instructions", dose: null })).status).toBe(200);
    expect((await request(medPath + "/1/sigs/1", "PATCH", { isActive: false })).status).toBe(200);
    expect((await request(medPath + "/1/sigs/1", "PATCH", { isActive: true })).status).toBe(200);
    expect((await request(medPath + "/1/sigs", "POST", { sig: "New instructions" })).status).toBe(200);
  });
  it("isolates SIG options between strengths and salt/release formulations", async () => {
    state.memory.tables.prescription_medications.push({ ...seedMedication(3), medicationName: "Synthetic Medication ER" });
    expect(await (await request(medPath + "/3/sigs")).json()).toEqual([]);
  });
  it("pharmacy creates all contacts, searches phone/fax, and rejects location duplicates", async () => {
    const response = await request(pharmacyPath, "POST", { name: "Another Synthetic Pharmacy", address: "3 Example Road", phone: "555-0198", fax: "555-0199" });
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ clinicId: 10, fax: "555-0199", phone: "555-0198" });
    expect(await (await request(pharmacyPath + "?search=0199")).json()).toHaveLength(1);
    expect((await request(pharmacyPath, "POST", { name: "synthetic pharmacy", address: "1 example road" })).status).toBe(409);
    expect((await request(pharmacyPath, "POST", { name: "Synthetic Pharmacy", address: "4 Example Road" })).status).toBe(201);
  });
  it("edits/archives pharmacies without changing existing prescription snapshots", async () => {
    const before = structuredClone(state.memory.tables.prescriptions);
    expect((await request(pharmacyPath + "/1", "PATCH", { phone: "555-0188", address: "Changed address" })).status).toBe(200);
    expect((await request(pharmacyPath + "/1", "PATCH", { isActive: false })).status).toBe(200);
    expect(await (await request(pharmacyPath)).json()).toEqual([]);
    expect(await (await request(pharmacyPath + "?includeInactive=true")).json()).toHaveLength(1);
    expect((await request(pharmacyPath + "/1", "PATCH", { isActive: true })).status).toBe(200);
    expect(state.memory.tables.prescriptions).toEqual(before);
  });
  it("rejects duplicate pharmacy edits, extra fields, empty patches and invalid IDs", async () => {
    state.memory.tables.prescription_pharmacies.push({ id: 3, clinicId: 10, name: "Duplicate", address: "Existing", isActive: true });
    expect((await request(pharmacyPath + "/1", "PATCH", { name: "Duplicate", address: "Existing" })).status).toBe(409);
    expect((await request(pharmacyPath + "/1", "PATCH", {})).status).toBe(400);
    expect((await request(pharmacyPath + "/1", "PATCH", { clinicId: 11 })).status).toBe(400);
    expect((await request(medPath + "/bad", "PATCH", { isActive: false })).status).toBe(400);
  });
  it("rolls back medication edits when archiving incompatible SIGs fails", async () => {
    state.memory.failWriteTable("prescription_sigs");
    expect((await request(medPath + "/1", "PATCH", { strength: "50 mg" })).status).toBe(503);
    expect(state.memory.tables.prescription_medications[0].strength).toBe("25 mg");
    expect(state.memory.tables.prescription_sigs[0].isActive).toBe(true);
  });
});
