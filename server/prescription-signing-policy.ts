/**
 * Prescription signing remains disabled until:
 * 1. Secure, durable PDF storage is configured.
 * 2. Medication classification is verified using a trusted source.
 * 3. Provider authorization and signing audit controls are tested.
 * 4. Clinical and regulatory review is completed.
 *
 * Do not enable based solely on client-supplied medication flags.
 */
export function assertPrescriptionSigningEnabled(): void {
  if (process.env.PRESCRIPTION_SIGNING_APPROVED !== "true" ||
      !process.env.PRESCRIPTION_PDF_BUCKET ||
      !process.env.PRESCRIPTION_NONCONTROLLED_CATALOG_PATH) {
    throw new Error(
      "PRESCRIPTION_SIGNING_DISABLED: Prescription signing is not yet approved for clinical use"
    );
  }
}
