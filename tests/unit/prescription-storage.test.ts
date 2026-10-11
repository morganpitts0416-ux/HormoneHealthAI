// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const fake = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(), failSave: false, corruptRead: false,
  save: vi.fn(), download: vi.fn(),
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket() { return { file: (key: string) => ({
      save: async (pdf: Buffer, options: any) => {
        fake.save(key, options);
        if (fake.failSave) throw new Error("Synthetic interrupted upload");
        if (fake.objects.has(key)) throw Object.assign(new Error("exists"), { code: 412 });
        fake.objects.set(key, Buffer.from(pdf));
      },
      download: async () => {
        fake.download(key);
        const value = fake.objects.get(key);
        if (!value) throw new Error("Synthetic missing object");
        return [fake.corruptRead ? Buffer.from("%PDF-corrupted") : value];
      },
    }) }; }
  },
}));
import { prescriptionStorageKey, retrieveSignedPrescriptionPdf, storeSignedPrescriptionPdf } from "../../server/prescription-storage";

beforeEach(() => { fake.objects.clear(); fake.failSave = false; fake.corruptRead = false; vi.clearAllMocks(); vi.stubEnv("PRESCRIPTION_PDF_BUCKET", "synthetic-only"); });
describe("Immutable PDF storage", () => {
  it("uses no-overwrite creation, private cache, CRC32C and durable SHA verification", async () => {
    const pdf = Buffer.from("%PDF-synthetic-document");
    const object = await storeSignedPrescriptionPdf(10, 1, pdf);
    expect(object.sha256Hash).toBe(createHash("sha256").update(pdf).digest("hex"));
    expect(fake.save.mock.calls[0][1]).toMatchObject({ preconditionOpts: { ifGenerationMatch: 0 }, validation: "crc32c", metadata: { cacheControl: "private, no-store" } });
    expect(await retrieveSignedPrescriptionPdf(object.storageKey, object.sha256Hash)).toEqual(pdf);
  });
  it("uses distinct keys after transaction rollback rather than overwriting the orphan", async () => {
    const a = await storeSignedPrescriptionPdf(10, 1, Buffer.from("%PDF-attempt-a"));
    const b = await storeSignedPrescriptionPdf(10, 1, Buffer.from("%PDF-attempt-b"));
    expect(a.storageKey).not.toBe(b.storageKey); expect(fake.objects.size).toBe(2);
  });
  it("rejects corrupted durable bytes before finalization", async () => {
    fake.corruptRead = true;
    await expect(storeSignedPrescriptionPdf(10, 1, Buffer.from("%PDF-original"))).rejects.toThrow("integrity");
  });
  it("rejects tampering on download", async () => {
    const object = await storeSignedPrescriptionPdf(10, 1, Buffer.from("%PDF-original"));
    fake.corruptRead = true;
    await expect(retrieveSignedPrescriptionPdf(object.storageKey, object.sha256Hash)).rejects.toThrow("integrity");
  });
  it("propagates interrupted uploads", async () => {
    fake.failSave = true;
    await expect(storeSignedPrescriptionPdf(10, 1, Buffer.from("%PDF-original"))).rejects.toThrow("interrupted");
  });
  it("fails closed when bucket is missing", async () => {
    vi.stubEnv("PRESCRIPTION_PDF_BUCKET", "");
    await expect(storeSignedPrescriptionPdf(10, 1, Buffer.from("%PDF-original"))).rejects.toThrow("not configured");
  });
  it("rejects invalid input and traversal", async () => {
    expect(() => prescriptionStorageKey(-1, 1)).toThrow();
    await expect(storeSignedPrescriptionPdf(10, 1, Buffer.from("not a pdf"))).rejects.toThrow("Invalid");
    await expect(retrieveSignedPrescriptionPdf("../patient.pdf", "a".repeat(64))).rejects.toThrow("Invalid");
    await expect(retrieveSignedPrescriptionPdf(prescriptionStorageKey(10, 1), "bad")).rejects.toThrow("Invalid");
    expect(fake.download).not.toHaveBeenCalled();
  });
});
