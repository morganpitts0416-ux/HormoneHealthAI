import { createHash } from "node:crypto";
import type { prescriberCredentials, users } from "@shared/schema";
// Prevent approval of credentials/NPI/signature changed after the admin review.
export function prescriberReviewHash(credential: typeof prescriberCredentials.$inferSelect, user: typeof users.$inferSelect) {
  return createHash("sha256").update(JSON.stringify({
    id: credential.id, clinicId: credential.clinicId, userId: credential.userId,
    licenseState: credential.licenseState, licenseNumber: credential.licenseNumber,
    licenseType: credential.licenseType, licenseExpiresAt: credential.licenseExpiresAt,
    updatedAt: credential.updatedAt, authorized: credential.prescribingAuthorized,
    npi: user.npi, title: user.title,
    signatureHash: createHash("sha256").update(user.signatureImage ?? "").digest("hex"),
  })).digest("hex");
}
