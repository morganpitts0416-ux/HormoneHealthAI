import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { db } from "./storage";

const reasons = [
  "identity_candidate_found", "no_identity", "multiple_candidates",
  "linkage_missing", "linkage_conflicting", "credential_available",
  "credential_compatibility_unknown", "relationship_missing", "relationship_conflicting",
] as const;

/**
 * Best-effort observation only. This function never receives or persists a
 * password/hash and deliberately has no return value used by authentication.
 */
export async function observePatientPortalIdentityLogin(input: {
  requestId: string;
  normalizedEmail: string;
  legacyAccountId: number | null;
}): Promise<void> {
  try {
    const identities = await db.select({
      id: schema.patientPortalIdentities.id,
      legacyPortalAccountId: schema.patientPortalIdentities.legacyPortalAccountId,
    }).from(schema.patientPortalIdentities)
      .where(eq(schema.patientPortalIdentities.normalizedEmail, input.normalizedEmail));
    const identityIds = identities.map((row) => row.id);
    const emit = async (reasonCode: typeof reasons[number], identityId: number | null = identityIds[0] ?? null) => {
      await db.insert(schema.patientPortalIdentityShadowDecisions).values({
        requestId: input.requestId,
        legacyAccountId: input.legacyAccountId,
        identityId,
        reasonCode,
      });
    };
    if (!identities.length) {
      await emit("no_identity");
      return;
    }
    if (identities.length > 1) await emit("multiple_candidates", null);
    else await emit("identity_candidate_found");

    if (!input.legacyAccountId) {
      await emit("linkage_missing");
      return;
    }
    const [legacy] = await db.select({
      hasCredential: sql<boolean>`${schema.patientPortalAccounts.passwordHash} is not null`,
    }).from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.id, input.legacyAccountId)).limit(1);
    if (legacy?.hasCredential) await emit("credential_available");
    const mapping = await db.select({
      identityId: schema.patientPortalIdentityLegacyAccounts.identityId,
      patientId: schema.patientPortalIdentityLegacyAccounts.patientId,
      clinicId: schema.patientPortalIdentityLegacyAccounts.clinicId,
      migrationState: schema.patientPortalIdentityLegacyAccounts.migrationState,
      compatibility: schema.patientPortalIdentityLegacyAccounts.credentialCompatibilityStatus,
    }).from(schema.patientPortalIdentityLegacyAccounts)
      .where(eq(schema.patientPortalIdentityLegacyAccounts.legacyAccountId, input.legacyAccountId));
    if (!mapping.length) {
      await emit("linkage_missing");
      return;
    }
    if (mapping[0].identityId !== identityIds[0] || mapping[0].migrationState === "conflicting") {
      await emit("linkage_conflicting", mapping[0].identityId);
    }
    if (mapping[0].compatibility === "unknown") await emit("credential_compatibility_unknown", mapping[0].identityId);
    else if (mapping[0].compatibility === "direct_copy_confirmed" || mapping[0].compatibility === "compatible_verified") {
      await emit("credential_available", mapping[0].identityId);
    }
    const relationships = await db.select({
      patientId: schema.patientClinicRelationships.patientId,
      clinicId: schema.patientClinicRelationships.clinicId,
      status: schema.patientClinicRelationships.relationshipStatus,
    }).from(schema.patientClinicRelationships)
      .where(eq(schema.patientClinicRelationships.portalIdentityId, mapping[0].identityId));
    if (!relationships.length) await emit("relationship_missing", mapping[0].identityId);
    else if (!relationships.some((r) => r.patientId === mapping[0].patientId && r.clinicId === mapping[0].clinicId && ["active", "verified"].includes(r.status))) {
      await emit("relationship_conflicting", mapping[0].identityId);
    }
  } catch {
    // Shadow observation can never block or change legacy authentication.
  }
}

export function shadowRequestId(): string {
  return crypto.randomUUID();
}