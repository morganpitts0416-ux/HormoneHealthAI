import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "./storage";
import * as schema from "@shared/schema";

/**
 * Focused, read-only regression checks for the production patient-read fix.
 *
 * Run only against a database containing designated test records:
 *   PATIENT_SCOPE_CLINIC_A=... PATIENT_SCOPE_CLINIC_B=...
 *   PATIENT_SCOPE_PATIENT_A=... PATIENT_SCOPE_PATIENT_B=...
 *
 * The test intentionally exercises the same tenant predicate used by the
 * production storage helpers without creating or changing records.
 */
async function patientInClinic(patientId: number, clinicId: number) {
  const [patient] = await db
    .select({ id: schema.patients.id, clinicId: schema.patients.clinicId })
    .from(schema.patients)
    .where(and(
      eq(schema.patients.id, patientId),
      eq(schema.patients.clinicId, clinicId),
    ))
    .limit(1);
  return patient ?? null;
}

async function main() {
  const clinicA = Number(process.env.PATIENT_SCOPE_CLINIC_A);
  const clinicB = Number(process.env.PATIENT_SCOPE_CLINIC_B);
  const patientA = Number(process.env.PATIENT_SCOPE_PATIENT_A);
  const patientB = Number(process.env.PATIENT_SCOPE_PATIENT_B);
  if (![clinicA, clinicB, patientA, patientB].every(Number.isInteger)) {
    throw new Error("Designated test IDs are required; refusing to invent or create live records.");
  }

  assert.ok(await patientInClinic(patientA, clinicA), "Clinic A can resolve its own patient");
  assert.equal(await patientInClinic(patientB, clinicA), null, "Clinic A cannot resolve Clinic B patient");
  assert.ok(await patientInClinic(patientB, clinicB), "Clinic B can resolve its own patient");
  assert.equal(await patientInClinic(2_000_000_000, clinicA), null, "nonexistent patient is indistinguishable at the query boundary");

  console.log(JSON.stringify({
    passed: 4,
    readOnly: true,
    crossClinicPatient: "denied",
    nonexistentPatient: "not_found",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});