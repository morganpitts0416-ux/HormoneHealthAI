import fs from "node:fs";
import { z } from "zod";
import type { Prescription } from "@shared/schema";
import { PrescriptionError } from "./prescription-finalization";

// A small, pharmacist-reviewed server-side formulary, not a controlled-drug
// classifier. Unknown names, brands, combinations and compounds fail closed.
const entrySchema = z.object({
  medicationName: z.string().trim().min(1),
  strength: z.string().trim().min(1),
  dosageForm: z.string().trim().min(1),
  noncontrolled: z.literal(true),
  sourceReference: z.string().trim().min(1),
  reviewedBy: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();
const catalogSchema = z.array(entrySchema).min(1);
const normalize = (value: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function requireNoncontrolledMedication(rx: Prescription, input: unknown, now = new Date()) {
  const catalog = catalogSchema.safeParse(input);
  if (!catalog.success || rx.isControlledSubstance) {
    throw new PrescriptionError(422, "Medication is not eligible");
  }
  const match = catalog.data.find(entry =>
    normalize(entry.medicationName) === normalize(rx.medicationName) &&
    normalize(entry.strength) === normalize(rx.strength) &&
    normalize(entry.dosageForm) === normalize(rx.dosageForm) &&
    new Date(entry.reviewedAt) <= now && new Date(entry.expiresAt) > now);
  if (!match) throw new PrescriptionError(422, "Medication is not eligible");
  return { ...match };
}

export function classifyPrescription(rx: Prescription) {
  try {
    const file = process.env.PRESCRIPTION_NONCONTROLLED_CATALOG_PATH;
    if (!file) throw new Error("Missing catalog");
    return requireNoncontrolledMedication(rx, JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    throw new PrescriptionError(422, "Medication is not eligible");
  }
}
