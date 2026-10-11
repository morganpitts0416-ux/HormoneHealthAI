import { createHash, randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const storage = new Storage({ retryOptions: { totalTimeout: 30, maxRetries: 2 } });

function getBucket() {
  const bucketName = process.env.PRESCRIPTION_PDF_BUCKET;

  if (!bucketName) {
    throw new Error("PRESCRIPTION_PDF_BUCKET is not configured");
  }

  return storage.bucket(bucketName);
}

export function prescriptionStorageKey(
  clinicId: number,
  prescriptionId: number,
  attemptId?: string,
): string {
  if (!Number.isSafeInteger(clinicId) || clinicId <= 0 ||
      !Number.isSafeInteger(prescriptionId) || prescriptionId <= 0) {
    throw new Error("Invalid prescription storage identifiers");
  }

  if (attemptId && !/^[a-f0-9-]{36}$/.test(attemptId)) {
    throw new Error("Invalid prescription storage attempt");
  }
  return `clinics/${clinicId}/prescriptions/${prescriptionId}/${attemptId ? attemptId + "/" : ""}signed.pdf`;
}

export async function storeSignedPrescriptionPdf(
  clinicId: number,
  prescriptionId: number,
  pdf: Buffer
): Promise<{ storageKey: string; sha256Hash: string }> {
  if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
    throw new Error("Prescription PDF is empty");
  }

  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Invalid prescription PDF");
  }

  // An upload can succeed while the database transaction fails. A unique
  // attempt key prevents that orphan from poisoning future retries; only a
  // committed document reference is ever downloadable through the API.
  const storageKey = prescriptionStorageKey(clinicId, prescriptionId, randomUUID());
  const sha256Hash = createHash("sha256").update(pdf).digest("hex");

    const file = getBucket().file(storageKey);

  try {
    await file.save(pdf, {
      resumable: false,
      contentType: "application/pdf",
      validation: "crc32c",
      timeout: 20_000,
      preconditionOpts: {
        ifGenerationMatch: 0,
      },
      metadata: {
        cacheControl: "private, no-store",
        metadata: {
          sha256: sha256Hash,
        },
      },
    });
  } catch (error) {
    const statusCode = Number(
      (error as { code?: number })?.code
    );

    // An existing signed document must never be overwritten.
    // A retry may only succeed if its bytes match exactly.
    if (statusCode !== 412) {
      throw error;
    }

    const [existingPdf] = await file.download();
    const existingHash = createHash("sha256")
      .update(existingPdf)
      .digest("hex");

    if (existingHash !== sha256Hash) {
      throw new Error(
        "A different signed prescription PDF already exists"
      );
    }
  }

  // Verify durable stored bytes before finalization. An uncertain upload leaves
  // only an inaccessible orphan and the database draft remains unsigned.
  await retrieveSignedPrescriptionPdf(storageKey, sha256Hash);
  return { storageKey, sha256Hash };
}

export async function retrieveSignedPrescriptionPdf(
  storageKey: string,
  expectedSha256Hash: string
): Promise<Buffer> {
  if (!/^clinics\/[1-9]\d*\/prescriptions\/[1-9]\d*\/(?:[a-f0-9-]{36}\/)?signed\.pdf$/.test(storageKey)) {
    throw new Error("Invalid prescription storage key");
  }

  if (!/^[a-f0-9]{64}$/.test(expectedSha256Hash)) {
    throw new Error("Invalid prescription document hash");
  }

  const [pdf] = await getBucket().file(storageKey).download();

  const actualHash = createHash("sha256").update(pdf).digest("hex");

  if (actualHash !== expectedSha256Hash) {
    throw new Error("Prescription PDF integrity verification failed");
  }
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Invalid prescription PDF");
  }

  return pdf;
}
