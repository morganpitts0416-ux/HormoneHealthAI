import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { syntheticSignature } from "./prescription-fixtures";
const state = vi.hoisted(() => ({ memory: null as any, actor: 7, staff: false, authenticated: true, clinic: 10 }));
vi.mock("../../server/storage", async () => {
  const { memoryPrescriptionDb } = await import("./prescription-memory-db");
  state.memory = memoryPrescriptionDb();
  return { db: state.memory.db };
});
import { registerPrescriptionRoutes } from "../../server/prescription-routes";
let server: Server, base: string;
const credentials = (id: number, userId: number, clinicId = 10) => ({
  id, userId, clinicId, licenseType: "MD", licenseNumber: "SYNTHETIC-ONLY",
  licenseState: "MS", licenseExpiresAt: "2099-01-01", prescribingAuthorized: false,
  verifiedAt: null, verifiedByUserId: null, verifiedNpi: null,
});
beforeAll(async () => {
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: state.actor }; req.session = { activeClinicId: state.clinic, ...(state.staff ? { staffId: 5 } : {}) };
    req.isAuthenticated = () => state.authenticated; next();
  });
  registerPrescriptionRoutes(app);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  state.actor = 7; state.clinic = 10; state.staff = false; state.authenticated = true;
  state.memory.reset({
    users: [7, 8, 9].map(id => ({ id, defaultClinicId: id === 9 ? 11 : 10,
      firstName: "Synthetic", lastName: `Provider ${id}`, npi: "1234567890", title: "MD",
      signatureImage: syntheticSignature, phone: "555-9999", address: "Legacy account address" })),
    clinics: [{ id: 10, name: "Synthetic Clinic", ownerUserId: 7, isActive: true, subscriptionStatus: "active" },
      { id: 11, name: "Other Clinic", ownerUserId: 9, isActive: true, subscriptionStatus: "active" }],
    clinic_memberships: [7, 8, 9].map(id => ({ id, userId: id, clinicId: id === 9 ? 11 : 10,
      clinicalRole: "provider", adminRole: id === 8 ? null : "owner", isActive: true,
      acceptanceStatus: "active", accessScope: "full" })),
    prescriber_credentials: [credentials(1, 8), credentials(2, 7), credentials(3, 9, 11)],
    prescriber_credential_audit_events: [],
  });
});
const request = (path: string, method = "GET", body?: unknown) => fetch(base + path, {
  method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
});
const verify = async (id = 1, approved = true) => {
  const current = await (await request("/api/prescriber-verification")).json();
  const verificationHash = current.providers?.find((row: any) => row.credentialId === id)?.verificationHash ?? "a".repeat(64);
  return request(`/api/prescriber-credentials/${id}/verify`, "POST", {
    approved, verificationHash, verificationSource: "Synthetic board review", notes: "Synthetic records only",
  });
};
describe("Independent clinic prescriber verification", () => {
  it.each(["unauthenticated", "staff", "ordinary provider", "inactive", "limited"])("denies %s read and approve", async condition => {
    if (condition === "unauthenticated") state.authenticated = false;
    if (condition === "staff") state.staff = true;
    if (condition === "ordinary provider") state.actor = 8;
    if (condition === "inactive") state.memory.tables.clinic_memberships[0].isActive = false;
    if (condition === "limited") state.memory.tables.clinic_memberships[0].accessScope = "limited";
    expect((await request("/api/prescriber-verification")).status).toBe(403);
    expect((await verify()).status).toBe(403);
  });
  it("lists only the selected clinic, without passwords or saved signature bytes", async () => {
    const response = await request("/api/prescriber-verification");
    const body = await response.json();
    expect(body.providers.map((p: any) => p.userId).sort()).toEqual([7, 8]);
    expect(JSON.stringify(body)).not.toContain(syntheticSignature);
    expect(body.clinic.phone).not.toBe("555-9999");
    expect(body.legacyClinicContact.phone).toBe("555-9999");
  });
  it("prevents owner self-approval and foreign-clinic reads/writes", async () => {
    expect((await verify(2)).status).toBe(403);
    expect((await verify(3)).status).toBe(404);
    expect((await request("/api/prescriber-verification/3/history")).status).toBe(404);
  });
  it("approves with immutable server-owned verifier/date/NPI evidence, then revokes", async () => {
    expect((await verify()).status).toBe(200);
    const row = state.memory.tables.prescriber_credentials[0];
    expect(row.prescribingAuthorized).toBe(true); expect(row.verifiedByUserId).toBe(7);
    expect(row.verifiedNpi).toBe("1234567890"); expect(row.verifiedAt).toBeInstanceOf(Date);
    const history = await (await request("/api/prescriber-verification/1/history")).json();
    expect(history[0].credentialSnapshot.licenseNumber).toBe("SYNTHETIC-ONLY");
    expect(history[0].verifierName).toBe("Synthetic Provider 7");
    expect((await verify(1, false)).status).toBe(200);
    expect(state.memory.tables.prescriber_credentials[0].prescribingAuthorized).toBe(false);
    expect(state.memory.tables.prescriber_credentials[0].verifiedNpi).toBeNull();
    expect(state.memory.tables.prescriber_credential_audit_events).toHaveLength(2);
  });
  it.each(["npi", "signature", "license", "expired", "membership"])("blocks approval with invalid %s", async condition => {
    if (condition === "npi") state.memory.tables.users[1].npi = "bad";
    if (condition === "signature") state.memory.tables.users[1].signatureImage = null;
    if (condition === "license") state.memory.tables.prescriber_credentials[0].licenseType = "";
    if (condition === "expired") state.memory.tables.prescriber_credentials[0].licenseExpiresAt = "2000-01-01";
    if (condition === "membership") state.memory.tables.clinic_memberships[1].isActive = false;
    expect((await verify()).status).toBe(condition === "membership" ? 403 : 400);
    expect(state.memory.tables.prescriber_credential_audit_events).toHaveLength(0);
  });
  it("rejects client-supplied verifier/time/clinic and rolls back if audit persistence fails", async () => {
    expect((await request("/api/prescriber-credentials/1/verify", "POST", {
      approved: true, verificationSource: "Synthetic source", verifiedByUserId: 99,
    })).status).toBe(400);
    state.memory.failWriteTable("prescriber_credential_audit_events");
    expect((await verify()).status).toBe(500);
    expect(state.memory.tables.prescriber_credentials[0].prescribingAuthorized).toBe(false);
  });
  it("requires a fresh credential/NPI/signature review instead of silently approving changed values", async () => {
    const current = await (await request("/api/prescriber-verification")).json();
    const hash = current.providers.find((row: any) => row.credentialId === 1).verificationHash;
    state.memory.tables.users[1].npi = "0987654321";
    expect((await request("/api/prescriber-credentials/1/verify", "POST", {
      approved: true, verificationHash: hash, verificationSource: "Synthetic board review",
    })).status).toBe(409);
    expect(state.memory.tables.prescriber_credentials[0].prescribingAuthorized).toBe(false);
  });
  it("requires explicit clinic contact confirmation, never defaults to account phone", async () => {
    const path = "/api/prescription-clinic-contact";
    expect((await request(path, "PATCH", { address: "100 Clinic Avenue", phone: "555-0100" })).status).toBe(400);
    const response = await request(path, "PATCH", { address: "100 Clinic Avenue", phone: "555-0100", confirmedClinicContact: true });
    expect(response.status).toBe(200); expect((await response.json()).phone).toBe("555-0100");
    expect(state.memory.tables.users[0].phone).toBe("555-9999");
    expect(state.memory.tables.clinics[1].prescriptionPhone).toBeUndefined();
    state.actor = 8;
    expect((await request(path, "PATCH", { address: "100 Clinic Avenue", phone: "555-0100", confirmedClinicContact: true })).status).toBe(403);
  });
});
