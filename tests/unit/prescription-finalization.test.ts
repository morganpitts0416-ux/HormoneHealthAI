// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { finalizePrescription, prescriptionReviewHash, type SigningDependencies, type SigningIdentity, type FinalDocument } from "../../server/prescription-finalization";
import { requireNoncontrolledMedication } from "../../server/prescription-medication-policy";
import { generatePrescriptionPdf } from "../../server/prescription-pdf";
import type { Prescription } from "../../shared/schema";
import { syntheticSignature as signature } from "./prescription-fixtures";

const now = new Date("2026-10-10T15:00:00Z");
const draft = () => ({
  id: 1, clinicId: 10, patientId: 20, medicationName: "Synthetic Medication",
  strength: "10 mg", dosageForm: "tablet", sig: "Take one tablet daily",
  quantity: "30", refills: 1, substitutionAllowed: true,
  isControlledSubstance: false, status: "draft",
  pharmacyName: "Synthetic Pharmacy", pharmacyAddress: "100 Example Street",
  pharmacyPhone: "555-0100", pharmacyFax: "555-0101",
  signedAt: null, signedByUserId: null,
} as Prescription);
const identity: SigningIdentity = {
  userId: 7, clinicId: 10, name: "Synthetic Provider", title: "MD",
  npi: "1234567890", license: "SYNTHETIC-001", licenseState: "MS",
  signatureImage: signature,
};
const catalog = [{
  medicationName: "Synthetic Medication", strength: "10 mg", dosageForm: "tablet",
  noncontrolled: true, sourceReference: "Synthetic-only test reference",
  reviewedBy: "Synthetic reviewer", reviewedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2027-10-01T00:00:00Z",
}];

function harness() {
  let rx = draft();
  let doc: FinalDocument | undefined;
  let signer: SigningIdentity | null = identity;
  let failCommit = false;
  let queue = Promise.resolve();
  let audits = 0;
  const uploads: Buffer[] = [];
  const generate = vi.fn(generatePrescriptionPdf);
  const store = vi.fn(async (_clinic: number, _id: number, pdf: Buffer) => {
    uploads.push(pdf);
    return { storageKey: `attempt-${uploads.length}`, sha256Hash: "a".repeat(64) };
  });
  const deps: SigningDependencies = {
    now: () => now, classify: rx => requireNoncontrolledMedication(rx, catalog, now),
    generatePdf: generate, storePdf: store,
    async transaction(work) {
      let unlock!: () => void;
      const previous = queue;
      queue = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      const oldRx = { ...rx }, oldDoc = doc, oldAudits = audits;
      try {
        return await work({
          lockPrescription: async (id, clinic) => id === rx.id && clinic === rx.clinicId ? rx : undefined,
          authorizeSigner: async () => signer,
          getDocument: async () => doc,
          getPdfContext: async () => ({ clinicName: "Synthetic Clinic", patientName: "Synthetic Patient", patientDob: "1990-01-01", patientAddress: "1 Example Ave" }),
          async commitDocument(_rx, who, signedAt, object) {
            doc = { id: 2, ...object, signedAt, signedByUserId: who.userId };
            rx = { ...rx, status: "signed", signedAt, signedByUserId: who.userId };
            audits++;
            if (failCommit) throw new Error("Synthetic commit failure");
            return doc;
          },
        });
      } catch (error) {
        rx = oldRx; doc = oldDoc; audits = oldAudits; throw error;
      } finally { unlock(); }
    },
  };
  return {
    deps, store, generate, uploads, sign: () => finalizePrescription(1, 10, prescriptionReviewHash(rx), deps),
    get rx() { return rx; }, get audits() { return audits; }, get doc() { return doc; },
    setSigner: (value: SigningIdentity | null) => { signer = value; },
    setFailCommit: (value: boolean) => { failCommit = value; },
    edit: (data: Partial<Prescription>) => { rx = { ...rx, ...data }; },
  };
}

describe("Prescription finalization (synthetic only)", () => {
  it("saves signed PDF, signer, timestamp and one audit", async () => {
    const h = harness();
    expect(await h.sign()).toMatchObject({ id: 1, status: "signed", documentId: 2, signedAt: now });
    expect(h.rx.signedByUserId).toBe(7);
    expect(h.audits).toBe(1);
    expect(h.uploads[0].subarray(0, 5).toString()).toBe("%PDF-");
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ signatureImage: signature }));
  });
  it("serializes simultaneous requests and uploads only once", async () => {
    const h = harness();
    const [a, b] = await Promise.all([h.sign(), h.sign()]);
    expect(a).toEqual(b); expect(h.store).toHaveBeenCalledTimes(1); expect(h.audits).toBe(1);
  });
  it("retries a lost success response idempotently", async () => {
    const h = harness();
    expect(await h.sign()).toEqual(await h.sign());
    expect(h.store).toHaveBeenCalledTimes(1);
  });
  it("denies another clinic before PDF/upload", async () => {
    const h = harness();
    await expect(finalizePrescription(1, 11, prescriptionReviewHash(h.rx), h.deps)).rejects.toMatchObject({ status: 404 });
    expect(h.store).not.toHaveBeenCalled();
  });
  it("rejects unverified or revoked signing authority", async () => {
    const h = harness(); h.setSigner(null);
    await expect(h.sign()).rejects.toMatchObject({ status: 403 });
    expect(h.store).not.toHaveBeenCalled();
  });
  it("rejects another signer's duplicate", async () => {
    const h = harness(); await h.sign(); h.setSigner({ ...identity, userId: 8 });
    await expect(h.sign()).rejects.toMatchObject({ status: 409 });
    expect(h.store).toHaveBeenCalledTimes(1);
  });
  it("rejects a draft changed since review without any upload", async () => {
    const h = harness(); const hash = prescriptionReviewHash(h.rx); h.edit({ refills: 2 });
    await expect(finalizePrescription(1, 10, hash, h.deps)).rejects.toMatchObject({ status: 409 });
    expect(h.store).not.toHaveBeenCalled();
  });
  it("leaves draft, no document or audit after interrupted upload; retry succeeds", async () => {
    const h = harness(); h.store.mockRejectedValueOnce(new Error("Synthetic upload interrupted"));
    await expect(h.sign()).rejects.toThrow("interrupted");
    expect(h.rx.status).toBe("draft"); expect(h.doc).toBeUndefined(); expect(h.audits).toBe(0);
    await h.sign(); expect(h.rx.status).toBe("signed");
  });
  it("rolls back document/status/audit after database failure and retry does not collide with orphan", async () => {
    const h = harness(); h.setFailCommit(true);
    await expect(h.sign()).rejects.toThrow("commit failure");
    expect(h.rx.status).toBe("draft"); expect(h.doc).toBeUndefined(); expect(h.audits).toBe(0);
    h.setFailCommit(false); await h.sign();
    expect(h.doc?.storageKey).toBe("attempt-2"); expect(h.audits).toBe(1);
  });
  it("denies controlled flag even with matching catalog entry", async () => {
    const h = harness(); h.edit({ isControlledSubstance: true });
    await expect(h.sign()).rejects.toMatchObject({ status: 422 }); expect(h.store).not.toHaveBeenCalled();
  });
  it.each(["Unknown Drug", "Synthetic Medication / testosterone"])("does not trust false flag for %s", async name => {
    const h = harness(); h.edit({ medicationName: name });
    await expect(h.sign()).rejects.toMatchObject({ status: 422 }); expect(h.store).not.toHaveBeenCalled();
  });
  it.each([{ strength: "20 mg" }, { dosageForm: "compound" }])("denies unknown formulation %j", value => {
    expect(() => requireNoncontrolledMedication({ ...draft(), ...value }, catalog, now)).toThrow("not eligible");
  });
  it("fails closed on unreadable, malformed, stale or unreviewed classification evidence", () => {
    for (const value of [undefined, {}, [], [{ ...catalog[0], noncontrolled: false }], [{ ...catalog[0], expiresAt: "2020-01-01T00:00:00Z" }], [{ ...catalog[0], reviewedBy: "" }]]) {
      expect(() => requireNoncontrolledMedication(draft(), value, now)).toThrow("not eligible");
    }
  });
  it("renders medication, pharmacy, credentials and signing date in saved PDF", () => {
    const pdf = generatePrescriptionPdf({
      ...draft(), clinicName: "Synthetic Clinic", patientName: "Synthetic Patient",
      patientDob: "1990-01-01", signedAt: now, signatureImage: signature,
      prescriberName: "Synthetic Provider", prescriberNpi: identity.npi,
      prescriberLicense: identity.license, prescriberLicenseState: "MS",
    }).toString("latin1");
    for (const text of ["Synthetic Medication", "Synthetic Pharmacy", "555-0101", "Synthetic Patient", "SYNTHETIC-001", "2026-10-10T15:00:00.000Z"]) expect(pdf).toContain(text);
  });
  it("does not silently omit missing or invalid signature", () => {
    const input = { ...draft(), clinicName: "Synthetic Clinic", patientName: "Synthetic Patient", patientDob: null, signedAt: now, prescriberName: "Synthetic Provider" };
    expect(() => generatePrescriptionPdf(input)).toThrow("signature");
    expect(() => generatePrescriptionPdf({ ...input, signatureImage: "data:image/png;base64,invalid" })).toThrow();
  });
});
