import type { Express, Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./storage";
import { clinics, clinicMemberships, users, prescriberCredentials, prescriberCredentialAuditEvents } from "@shared/schema";
import { prescriberReviewHash } from "./prescriber-verification-policy";
type Connection = Pick<typeof db, "select" | "execute">;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function registerPrescriberVerificationRoutes(
  app: Express, selectedClinic: (req: Request, connection: Connection) => Promise<number | null>,
) {
  async function administrator(req: Request, tx: Transaction) {
    if ((req.session as any)?.staffId || !req.isAuthenticated?.()) return null;
    const userId = Number((req.user as any)?.id);
    const clinicId = await selectedClinic(req, tx);
    if (!clinicId || !Number.isSafeInteger(userId) || userId < 1) return null;
    const [membership] = await tx.select().from(clinicMemberships).where(and(
      eq(clinicMemberships.clinicId, clinicId), eq(clinicMemberships.userId, userId),
      eq(clinicMemberships.isActive, true), eq(clinicMemberships.acceptanceStatus, "active"),
      eq(clinicMemberships.accessScope, "full"),
    )).limit(1).for("share");
    if (!membership || !["owner", "admin"].includes(membership.adminRole)) return null;
    return { userId, clinicId };
  }
  const contact = (clinic: typeof clinics.$inferSelect) => ({
    id: clinic.id, name: clinic.name, address: clinic.prescriptionAddress,
    phone: clinic.prescriptionPhone, fax: clinic.fax,
  });
  app.get("/api/prescriber-verification", async (req, res) => {
    try {
      const result = await db.transaction(async tx => {
        const actor = await administrator(req, tx);
        if (!actor) return null;
        const [clinic] = await tx.select().from(clinics).where(and(
          eq(clinics.id, actor.clinicId), eq(clinics.isActive, true),
        )).limit(1).for("share");
        if (!clinic) return null;
        const records = await tx.select().from(prescriberCredentials)
          .where(eq(prescriberCredentials.clinicId, actor.clinicId)).orderBy(desc(prescriberCredentials.updatedAt)).limit(500);
        const providers = [];
        for (const record of records) {
          const [provider] = await tx.select().from(users).where(eq(users.id, record.userId)).limit(1);
          const [membership] = await tx.select().from(clinicMemberships).where(and(
            eq(clinicMemberships.clinicId, actor.clinicId), eq(clinicMemberships.userId, record.userId),
            eq(clinicMemberships.isActive, true), eq(clinicMemberships.acceptanceStatus, "active"),
            eq(clinicMemberships.accessScope, "full"), eq(clinicMemberships.clinicalRole, "provider"),
          )).limit(1);
          if (!provider) continue;
          providers.push({
            credentialId: record.id, userId: record.userId,
            name: `${provider.firstName ?? ""} ${provider.lastName ?? ""}`.trim(),
            title: provider.title, npi: provider.npi,
            licenseState: record.licenseState, licenseNumber: record.licenseNumber,
            licenseType: record.licenseType, licenseExpiresAt: record.licenseExpiresAt,
            deaNumber: record.deaNumber, deaState: record.deaState, deaExpiresAt: record.deaExpiresAt,
            prescribingAuthorized: record.prescribingAuthorized, verifiedAt: record.verifiedAt,
            verifiedByUserId: record.verifiedByUserId, providerActive: !!membership,
            hasSavedSignature: /^data:image\/(?:png|jpeg);base64,/.test(provider.signatureImage ?? ""),
            isSelf: record.userId === actor.userId,
            verificationCurrent: record.prescribingAuthorized && record.verifiedNpi === provider.npi,
            verificationHash: prescriberReviewHash(record, provider),
          });
        }
        // These legacy account fields were used by Clinic Information, but are
        // ambiguous. Never use them for signing without explicit admin review.
        const [owner] = clinic.ownerUserId ? await tx.select().from(users).where(and(
          eq(users.id, clinic.ownerUserId), eq(users.defaultClinicId, clinic.id),
        )).limit(1) : [];
        return { clinic: contact(clinic), providers,
          legacyClinicContact: owner ? { address: owner.address, phone: owner.phone } : null };
      });
      if (!result) return res.status(403).json({ error: "Active clinic administrator required" });
      return res.json(result);
    } catch {
      return res.status(503).json({ error: "Prescriber verification is unavailable" });
    }
  });
  app.get("/api/prescriber-verification/:credentialId/history", async (req, res) => {
    const id = Number(req.params.credentialId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Invalid credential" });
    try {
      const result = await db.transaction(async tx => {
        const actor = await administrator(req, tx);
        if (!actor) return { denied: true as const };
        const [credential] = await tx.select().from(prescriberCredentials).where(and(
          eq(prescriberCredentials.id, id), eq(prescriberCredentials.clinicId, actor.clinicId),
        )).limit(1);
        if (!credential) return { missing: true as const };
        const rows = await tx.select().from(prescriberCredentialAuditEvents).where(and(
          eq(prescriberCredentialAuditEvents.credentialId, id),
          eq(prescriberCredentialAuditEvents.clinicId, actor.clinicId),
        )).orderBy(desc(prescriberCredentialAuditEvents.createdAt)).limit(200);
        const history = [];
        for (const row of rows) {
          const [verifier] = await tx.select().from(users).where(eq(users.id, row.verifierUserId)).limit(1);
          history.push({ ...row, verifierName: verifier
            ? `${verifier.firstName ?? ""} ${verifier.lastName ?? ""}`.trim() : "Former clinic verifier" });
        }
        return { history };
      });
      if ("denied" in result) return res.status(403).json({ error: "Active clinic administrator required" });
      if ("missing" in result) return res.status(404).json({ error: "Credentials not found" });
      return res.json(result.history);
    } catch { return res.status(503).json({ error: "Verification history is unavailable" }); }
  });
  app.patch("/api/prescription-clinic-contact", async (req, res) => {
    const input = z.object({
      address: z.string().trim().min(5).max(2000),
      phone: z.string().trim().min(7).max(50).refine(value => value.replace(/\D/g, "").length >= 7),
      confirmedClinicContact: z.literal(true),
    }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Confirm a valid business clinic address and phone" });
    try {
      const result = await db.transaction(async tx => {
        const actor = await administrator(req, tx);
        if (!actor) return null;
        const [clinic] = await tx.update(clinics).set({
          prescriptionAddress: input.data.address, prescriptionPhone: input.data.phone, updatedAt: new Date(),
        }).where(and(eq(clinics.id, actor.clinicId), eq(clinics.isActive, true))).returning();
        return clinic ? contact(clinic) : null;
      });
      if (!result) return res.status(403).json({ error: "Active clinic administrator required" });
      return res.json(result);
    } catch { return res.status(503).json({ error: "Clinic contact could not be saved" }); }
  });
}
