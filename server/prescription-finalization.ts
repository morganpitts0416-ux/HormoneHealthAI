import { createHash } from "node:crypto";
import type { Prescription } from "@shared/schema";
import type { PrescriptionPdfData } from "./prescription-pdf";

export class PrescriptionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Only immutable draft content participates. Signing metadata is deliberately
// excluded so a lost success response can be retried without a second upload.
const reviewFields = [
  "id", "clinicId", "patientId", "medicationName", "strength", "dosageForm",
  "dose", "route", "frequency", "sig", "quantity", "daysSupply", "refills",
  "indication", "substitutionAllowed", "isControlledSubstance", "pharmacyName",
  "pharmacyAddress", "pharmacyPhone", "pharmacyFax",
] as const;

export function prescriptionReviewHash(rx: Prescription): string {
  return createHash("sha256").update(JSON.stringify(
    reviewFields.map(key => [key, rx[key] ?? null])
  )).digest("hex");
}

export interface SigningIdentity {
  userId: number;
  clinicId: number;
  name: string;
  title: string | null;
  npi: string;
  license: string;
  licenseState: string;
  signatureImage: string;
}
export interface FinalDocument {
  id: number;
  storageKey: string;
  sha256Hash: string;
  signedAt: Date;
  signedByUserId: number;
}
export interface SigningTransaction {
  lockPrescription(id: number, clinicId: number): Promise<Prescription | undefined>;
  authorizeSigner(): Promise<SigningIdentity | null>;
  getDocument(id: number, clinicId: number): Promise<FinalDocument | undefined>;
  getPdfContext(rx: Prescription): Promise<Pick<PrescriptionPdfData,
    "patientName" | "patientDob" | "patientAddress" | "clinicName" | "clinicAddress" | "clinicPhone">>;
  commitDocument(rx: Prescription, signer: SigningIdentity, signedAt: Date,
    object: { storageKey: string; sha256Hash: string },
    classification: Record<string, unknown>, reviewHash: string): Promise<FinalDocument>;
}
export interface SigningDependencies {
  transaction<T>(work: (tx: SigningTransaction) => Promise<T>): Promise<T>;
  classify(rx: Prescription): Record<string, unknown>;
  generatePdf(data: PrescriptionPdfData): Buffer;
  storePdf(clinicId: number, prescriptionId: number, pdf: Buffer):
    Promise<{ storageKey: string; sha256Hash: string }>;
  now(): Date;
}

export async function finalizePrescription(
  id: number, clinicId: number, reviewHash: string, deps: SigningDependencies,
) {
  return deps.transaction(async tx => {
    // The row lock serializes sign/sign and sign/edit until upload and commit.
    const rx = await tx.lockPrescription(id, clinicId);
    if (!rx) throw new PrescriptionError(404, "Prescription not found");
    const signer = await tx.authorizeSigner();
    if (!signer || signer.clinicId !== clinicId) {
      throw new PrescriptionError(403, "Verified prescriber authorization required");
    }
    if (prescriptionReviewHash(rx) !== reviewHash) {
      throw new PrescriptionError(409, "Prescription changed; review it again");
    }
    if (rx.status === "signed") {
      const doc = await tx.getDocument(id, clinicId);
      if (!doc || rx.signedByUserId !== signer.userId || doc.signedByUserId !== signer.userId) {
        throw new PrescriptionError(409, "Prescription is already finalized");
      }
      return { id, status: "signed", signedAt: doc.signedAt, documentId: doc.id };
    }
    if (rx.status !== "draft") throw new PrescriptionError(409, "Only drafts can be signed");
    if (rx.isControlledSubstance) throw new PrescriptionError(422, "Medication is not eligible");
    const classification = deps.classify(rx);
    const context = await tx.getPdfContext(rx);
    const signedAt = deps.now();
    const pdf = deps.generatePdf({
      ...context, ...rx, signedAt, prescriberName: signer.name,
      prescriberTitle: signer.title, prescriberNpi: signer.npi,
      prescriberLicense: signer.license, prescriberLicenseState: signer.licenseState,
      signatureImage: signer.signatureImage,
    });
    const object = await deps.storePdf(clinicId, id, pdf);
    const doc = await tx.commitDocument(rx, signer, signedAt, object, classification, reviewHash);
    return { id, status: "signed", signedAt, documentId: doc.id };
  });
}
