import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./storage";
import { assertPrescriptionSigningEnabled } from "./prescription-signing-policy";
import { finalizePrescription, prescriptionReviewHash, PrescriptionError, type SigningTransaction } from "./prescription-finalization";
import { classifyPrescription } from "./prescription-medication-policy";
import { prescriptionStorageKey } from "./prescription-storage";

import { generatePrescriptionPdf } from "./prescription-pdf";
import {
  storeSignedPrescriptionPdf,
  retrieveSignedPrescriptionPdf,
} from "./prescription-storage";

import {
  clinicMemberships,
  clinics,
  prescriptionDocuments,
  prescriptionAuditEvents,
  prescriptionBatches,
  prescriptionPharmacies,
  prescriptionMedicationTemplates,
  clinicianStaff,
  patients,
  prescriptions,
  prescriberCredentials,
  prescriberCredentialAuditEvents,
  users,
} from "@shared/schema";

// Validation for an unsigned prescription draft.
// No controlled substances are supported in this initial release.
export const prescriptionDraftSchema = z.object({
  medicationName: z.string().trim().min(1).max(300),
  strength: z.string().trim().max(100).optional().nullable(),
  dosageForm: z.string().trim().max(100).optional().nullable(),
  dose: z.string().trim().max(150).optional().nullable(),
  route: z.string().trim().max(100).optional().nullable(),
  frequency: z.string().trim().max(150).optional().nullable(),
  sig: z.string().trim().min(1).max(4000),
  quantity: z.string().trim().min(1).max(100),
  daysSupply: z.number().int().positive().max(365).optional().nullable(),
  refills: z.number().int().min(0).max(99).default(0),
  indication: z.string().trim().max(2000).optional().nullable(),
  substitutionAllowed: z.boolean().default(true),
  isControlledSubstance: z.literal(false).optional(),
  pharmacyName: z.string().trim().max(300).optional().nullable(),
  pharmacyAddress: z.string().trim().max(1000).optional().nullable(),
  pharmacyPhone: z.string().trim().max(50).optional().nullable(),
  pharmacyFax: z.string().trim().max(50).optional().nullable(),
}).strict();


const credentialsSchema = z.object({
  licenseState: z.string().trim().regex(/^[A-Za-z]{2}$/),
  licenseNumber: z.string().trim().min(1).max(100),
  licenseType: z.string().trim().min(1).max(50),
  licenseExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deaNumber: z.string().trim().max(20).nullable().optional(),
  deaExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deaState: z.string().trim().regex(/^[A-Za-z]{2}$/).nullable().optional(),
}).strict();

export function registerPrescriptionRoutes(app: Express): void {
  type QueryDb = Pick<typeof db, "select" | "execute">;

  async function selectedClinic(req: Request, connection: QueryDb) {
    const sess = req.session as any;
    let clinicId: number;
    if (sess?.staffId) {
      clinicId = Number(sess.staffClinicianClinicId);
    } else {
      if (!req.isAuthenticated?.() || !(req.user as any)?.id) return null;
      const [current] = await connection.select({ defaultClinicId: users.defaultClinicId })
        .from(users).where(eq(users.id, (req.user as any).id)).limit(1).for("share");
      if (!current) return null;
      // Never fall back when an explicit selection is malformed or unauthorized.
      clinicId = Number(sess?.activeClinicId !== undefined ? sess.activeClinicId : current.defaultClinicId);
    }
    if (!Number.isSafeInteger(clinicId) || clinicId <= 0) return null;
    const [clinic] = await connection.select().from(clinics)
      .where(and(eq(clinics.id, clinicId), eq(clinics.isActive, true))).limit(1).for("share");
    if (!clinic || ["canceled", "unpaid", "inactive"].includes(clinic.subscriptionStatus ?? "")) return null;
    return clinicId;
  }

  // Authorize clinic-scoped prescription preparation resources.
  // Allows active providers and authorized nursing staff.
  // Does NOT grant prescription signing authority.
  async function getPrescriptionPreparationContext(req: Request, connection: QueryDb = db) {
    const sess = req.session as any;
    const user = req.user as any;
    const staffId = Number(sess?.staffId || 0);

    if (staffId) {
      const clinicId = await selectedClinic(req, connection);

      if (!clinicId) {
        return null;
      }

      const [staff] = await connection.select()
        .from(clinicianStaff)
        .where(and(
          eq(clinicianStaff.id, staffId),
          eq(clinicianStaff.clinicId, clinicId),
          eq(clinicianStaff.isActive, true)
        ))
        .limit(1);

      if (!staff || !["nurse", "provider"].includes(staff.role)) {
        return null;
      }

      if (Number(sess.staffClinicianId) !== staff.clinicianId) {
        return null;
      }

      const [membership] = await connection.select()
        .from(clinicMemberships)
        .where(and(
          eq(clinicMemberships.clinicId, clinicId),
          eq(clinicMemberships.userId, staff.clinicianId),
          eq(clinicMemberships.isActive, true),
          eq(clinicMemberships.acceptanceStatus, "active"),
          eq(clinicMemberships.accessScope, "full")
        ))
        .limit(1);

      if (
  !membership ||
  !["provider", "rn"].includes(membership.clinicalRole)
) {
  return null;
}

      return {
        clinicId,
        userId: staff.clinicianId,
        staffId,
        isStaff: true
      };
    }

    // Authorization for directly authenticated clinicians
    if (!req.isAuthenticated?.() || !user?.id) {
      return null;
    }

    const userId = Number(user.id);
    const clinicId = await selectedClinic(req, connection);

    if (
      !Number.isSafeInteger(userId) || userId <= 0 ||
      !clinicId
    ) {
      return null;
    }

    const [membership] = await connection.select()
      .from(clinicMemberships)
      .where(and(
        eq(clinicMemberships.userId, userId),
        eq(clinicMemberships.clinicId, clinicId),
        eq(clinicMemberships.isActive, true),
        eq(clinicMemberships.acceptanceStatus, "active"),
        eq(clinicMemberships.accessScope, "full")
      ))
      .limit(1);

    if (
      !membership ||
      !["provider", "rn"].includes(membership.clinicalRole)
    ) {
      return null;
    }

    return {
      clinicId,
      userId,
      staffId: null,
      isStaff: false
    };
  }

  async function getCredentialContext(req: Request, connection: QueryDb = db) {
    const session = req.session as any;
    const user = req.user as any;

    if (session?.staffId || !req.isAuthenticated?.() || !user?.id) {
      return null;
    }

    const userId = Number(user.id);
    const clinicId = await selectedClinic(req, connection);

    if (!Number.isSafeInteger(userId) || userId <= 0 ||
        !clinicId) {
      return null;
    }

    const [membership] = await connection.select()
      .from(clinicMemberships)
      .where(and(
        eq(clinicMemberships.userId, userId),
        eq(clinicMemberships.clinicId, clinicId),
        eq(clinicMemberships.clinicalRole, "provider"),
        eq(clinicMemberships.isActive, true),
        eq(clinicMemberships.acceptanceStatus, "active"),
        eq(clinicMemberships.accessScope, "full")
      ))
      .limit(1).for("share");

    return membership ? { userId, clinicId } : null;
  }



  // Only the individually authenticated provider can sign.
  // Staff sessions are rejected by getCredentialContext().
  async function getAuthorizedSigner(req: Request, connection: QueryDb = db) {
    const context = await getCredentialContext(req, connection);
    if (!context) return null;

    await connection.execute(sql`SELECT pg_advisory_xact_lock(${context.clinicId}, ${context.userId})`);
    const [credential] = await connection.select()
      .from(prescriberCredentials)
      .where(and(
        eq(prescriberCredentials.userId, context.userId),
        eq(prescriberCredentials.clinicId, context.clinicId),
        eq(prescriberCredentials.prescribingAuthorized, true)
      ))
      .limit(1).for("share");

    if (!credential || !credential.verifiedAt ||
        !credential.verifiedByUserId ||
        credential.verifiedByUserId === context.userId ||
        !credential.licenseNumber || !credential.licenseState ||
        !credential.licenseExpiresAt) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (credential.licenseExpiresAt < today) return null;

    const [prescriber] = await connection.select({
  id: users.id,
  firstName: users.firstName,
  lastName: users.lastName,
  title: users.title,
  npi: users.npi,
  signatureImage: users.signatureImage,
})
  .from(users)
  .where(eq(users.id, context.userId))
      .limit(1).for("share");

if (!prescriber || !prescriber.signatureImage ||
    !/^\d{10}$/.test(prescriber.npi ?? "") ||
    !/^data:image\/(?:png|jpeg);base64,/.test(prescriber.signatureImage)) {
  return null;
}

return { ...context, credential, prescriber };
  }

  app.get("/api/prescriptions/signing-status", async (req, res) => {
    try {
      if (!await getPrescriptionPreparationContext(req)) return res.status(403).json({ error: "Clinical authorization required" });
      try { assertPrescriptionSigningEnabled(); }
      catch { return res.json({ enabled: false }); }
      return res.json({ enabled: true });
    } catch { return res.status(503).json({ error: "Prescription service unavailable" }); }
  });

  // Search pharmacies saved for the active clinic.
  app.get("/api/prescription-pharmacies", async (req, res) => {
    try {
      const context = await getPrescriptionPreparationContext(req);

      if (!context) {
        return res.status(403).json({
          error: "Clinic prescription access required"
        });
      }

      const query = z.string().max(150).safeParse(req.query.search ?? "");

      if (!query.success) {
        return res.status(400).json({
          error: "Invalid pharmacy search"
        });
      }

      const search = query.data.trim().toLowerCase();

      const pharmacies = await db.select()
        .from(prescriptionPharmacies)
        .where(and(
          eq(prescriptionPharmacies.clinicId, context.clinicId),
          eq(prescriptionPharmacies.isActive, true)
        ))
        .limit(200);

      const matches = pharmacies.filter((pharmacy) =>
        !search ||
        pharmacy.name.toLowerCase().includes(search) ||
        (pharmacy.address || "").toLowerCase().includes(search)
      );

      return res.json(matches);
    } catch (error) {
      console.error("[prescription pharmacies list] Operation failed");
      return res.status(500).json({
        error: "Unable to load saved pharmacies"
      });
    }
  });

  // Save a pharmacy to the active clinic's directory.
  app.post("/api/prescription-pharmacies", async (req, res) => {
    try {
      const context = await getPrescriptionPreparationContext(req);

      if (!context) {
        return res.status(403).json({
          error: "Clinic prescription access required"
        });
      }

      const pharmacySchema = z.object({
        name: z.string().trim().min(1).max(300),
        address: z.string().trim().max(1000).optional().nullable(),
        phone: z.string().trim().max(50).optional().nullable(),
        fax: z.string().trim().max(50).optional().nullable()
      }).strict();

      const parsed = pharmacySchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid pharmacy details",
          issues: parsed.error.flatten()
        });
      }

      const [created] = await db.insert(prescriptionPharmacies)
        .values({
          clinicId: context.clinicId,
          name: parsed.data.name,
          address: parsed.data.address || null,
          phone: parsed.data.phone || null,
          fax: parsed.data.fax || null
        })
        .returning();

      return res.status(201).json(created);
    } catch (error) {
      console.error("[prescription pharmacies save] Operation failed");
      return res.status(500).json({
        error: "Unable to save pharmacy"
      });
    }
  });


  // Search saved medication templates for the active clinic.
  app.get("/api/prescription-medication-templates", async (req, res) => {
    try {
      const context = await getPrescriptionPreparationContext(req);

      if (!context) {
        return res.status(403).json({
          error: "Clinic prescription access required"
        });
      }

      const parsed = z.string().max(150).safeParse(req.query.search ?? "");

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid medication search"
        });
      }

      const search = parsed.data.trim().toLowerCase();

      const templates = await db.select()
        .from(prescriptionMedicationTemplates)
        .where(and(
          eq(prescriptionMedicationTemplates.clinicId, context.clinicId),
          eq(prescriptionMedicationTemplates.isActive, true)
        ))
        .limit(200);

      const visibleTemplates = templates.filter((template) => {
        const canView =
          template.sharedWithClinic ||
          (!context.isStaff && template.ownerUserId === context.userId);

        if (!canView) return false;

        return !search ||
          template.medicationName.toLowerCase().includes(search) ||
          (template.strength || "").toLowerCase().includes(search);
      });

      return res.json(visibleTemplates);
    } catch (error) {
      console.error("[prescription medication templates list] Operation failed");
      return res.status(500).json({
        error: "Unable to load medication favorites"
      });
    }
  });


  // Save a reusable medication favorite. Provider access only.
  app.post("/api/prescription-medication-templates", async (req, res) => {
    try {
      const context = await getCredentialContext(req);

      if (!context) {
        return res.status(403).json({
          error: "Provider access required to save medication favorites"
        });
      }

      const templateSchema = z.object({
        medicationName: z.string().trim().min(1).max(300),
        strength: z.string().trim().max(100).optional().nullable(),
        dosageForm: z.string().trim().max(100).optional().nullable(),
        dose: z.string().trim().max(150).optional().nullable(),
        route: z.string().trim().max(100).optional().nullable(),
        frequency: z.string().trim().max(150).optional().nullable(),
        sig: z.string().trim().min(1).max(4000),
        quantity: z.string().trim().max(100).optional().nullable(),
        daysSupply: z.number().int().min(1).max(365).optional().nullable(),
        refills: z.number().int().min(0).max(99).default(0),
        sharedWithClinic: z.boolean().default(false)
      }).strict();

      const parsed = templateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid medication favorite",
          issues: parsed.error.flatten()
        });
      }

      const data = parsed.data;

      const [created] = await db.insert(prescriptionMedicationTemplates)
        .values({
          clinicId: context.clinicId,
          ownerUserId: context.userId,
          sharedWithClinic: data.sharedWithClinic,
          medicationName: data.medicationName,
          strength: data.strength || null,
          dosageForm: data.dosageForm || null,
          dose: data.dose || null,
          route: data.route || null,
          frequency: data.frequency || null,
          sig: data.sig,
          quantity: data.quantity || null,
          daysSupply: data.daysSupply ?? null,
          refills: data.refills
        })
        .returning();

      return res.status(201).json(created);
    } catch (error) {
      console.error("[prescription medication template save] Operation failed");
      return res.status(500).json({
        error: "Unable to save medication favorite"
      });
    }
  });

  app.get("/api/prescriber-credentials/me", async (req, res) => {
    try {
      const context = await getCredentialContext(req);
      if (!context) {
        return res.status(403).json({ error: "Provider access required" });
      }

      const [credentials] = await db.select()
        .from(prescriberCredentials)
        .where(and(
          eq(prescriberCredentials.userId, context.userId),
          eq(prescriberCredentials.clinicId, context.clinicId)
        ))
        .limit(1);

      return res.json(credentials || null);
    } catch (error) {
      console.error("[prescriber credentials get] Operation failed");
      return res.status(500).json({ error: "Unable to load credentials" });
    }
  });


  app.put("/api/prescriber-credentials/me", async (req, res) => {
    try {
      const context = await getCredentialContext(req);
      if (!context) {
        return res.status(403).json({ error: "Provider access required" });
      }

      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid credentials",
          issues: parsed.error.flatten()
        });
      }

      const data = parsed.data;
      const values = {
        licenseState: data.licenseState.toUpperCase(),
        licenseNumber: data.licenseNumber,
        licenseType: data.licenseType,
        licenseExpiresAt: data.licenseExpiresAt ?? null,
        deaNumber: data.deaNumber || null,
        deaExpiresAt: data.deaExpiresAt ?? null,
        deaState: data.deaState?.toUpperCase() || null
      };

      // Serialize credential edits with verification operations for this
      // provider and clinic, including when the credentials row does not exist.
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${context.clinicId}, ${context.userId})`
        );

        const [existing] = await tx.select()
          .from(prescriberCredentials)
          .where(and(
            eq(prescriberCredentials.userId, context.userId),
            eq(prescriberCredentials.clinicId, context.clinicId)
          ))
          .limit(1);

        if (existing) {
          const changed = Object.entries(values).some(
            ([key, value]) => (existing as any)[key] !== value
          );

          if (!changed) {
            return { credentials: existing, created: false };
          }

          const [updated] = await tx.update(prescriberCredentials)
            .set({
              ...values,
              prescribingAuthorized: false,
              verifiedAt: null,
              verifiedByUserId: null,
              updatedAt: new Date()
            })
            .where(and(
              eq(prescriberCredentials.id, existing.id),
              eq(prescriberCredentials.userId, context.userId),
              eq(prescriberCredentials.clinicId, context.clinicId)
            ))
            .returning();

          return { credentials: updated, created: false };
        }

        const [created] = await tx.insert(prescriberCredentials)
          .values({
            ...values,
            userId: context.userId,
            clinicId: context.clinicId,
            prescribingAuthorized: false
          })
          .returning();

        return { credentials: created, created: true };
      });

      return res.status(result.created ? 201 : 200).json(result.credentials);
    } catch (error) {
      console.error("[prescriber credentials save] Operation failed");
      return res.status(500).json({ error: "Unable to save credentials" });
    }
  });



  // Independent credential verification. Staff sessions and self-approval
  // are prohibited, including when the prescriber is a clinic owner.
  app.post("/api/prescriber-credentials/:credentialId/verify", async (req, res) => {
    try {
      const session = req.session as any;
      const user = req.user as any;

      if (session?.staffId || !req.isAuthenticated?.() || !user?.id) {
        return res.status(403).json({ error: "Authenticated administrator required" });
      }

      const verifierUserId = Number(user.id);
      const clinicId = await selectedClinic(req, db);
      const credentialId = Number(req.params.credentialId);

      if (!clinicId || ![verifierUserId, clinicId, credentialId].every(
        (n) => Number.isSafeInteger(n) && n > 0
      )) {
        return res.status(400).json({ error: "Invalid request context" });
      }

      const input = z.object({
        approved: z.boolean(),
        verificationSource: z.string().trim().min(5).max(300),
        notes: z.string().trim().max(2000).optional()
      }).strict().safeParse(req.body);

      if (!input.success) {
        return res.status(400).json({ error: "Invalid verification request" });
      }

      const [admin] = await db.select()
        .from(clinicMemberships)
        .where(and(
          eq(clinicMemberships.userId, verifierUserId),
          eq(clinicMemberships.clinicId, clinicId),
          eq(clinicMemberships.isActive, true),
          eq(clinicMemberships.acceptanceStatus, "active"),
          eq(clinicMemberships.accessScope, "full")
        ))
        .limit(1);

      if (!admin || !["owner", "admin"].includes(admin.adminRole)) {
        return res.status(403).json({ error: "Clinic owner or administrator required" });
      }

      const result = await db.transaction(async (tx) => {
        // Recheck administrator authority inside the transaction.
        // Lock the membership row so concurrent changes to this row
        // cannot complete before credential verification commits.
        const [currentAdmin] = await tx.select()
          .from(clinicMemberships)
          .where(and(
            eq(clinicMemberships.userId, verifierUserId),
            eq(clinicMemberships.clinicId, clinicId),
            eq(clinicMemberships.isActive, true),
            eq(clinicMemberships.acceptanceStatus, "active"),
            eq(clinicMemberships.accessScope, "full")
          ))
          .for("update")
          .limit(1);

        if (!currentAdmin ||
            !["owner", "admin"].includes(currentAdmin.adminRole)) {
          throw new Error("ADMIN_ACCESS_REVOKED");
        }

        const [target] = await tx.select()
          .from(prescriberCredentials)
          .where(and(
            eq(prescriberCredentials.id, credentialId),
            eq(prescriberCredentials.clinicId, clinicId)
          ))
          .limit(1);

        if (!target) throw new Error("CREDENTIAL_NOT_FOUND");
        if (target.userId === verifierUserId) throw new Error("SELF_VERIFICATION");

        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${clinicId}, ${target.userId})`
        );

        const [locked] = await tx.select()
          .from(prescriberCredentials)
          .where(and(
            eq(prescriberCredentials.id, credentialId),
            eq(prescriberCredentials.clinicId, clinicId),
            eq(prescriberCredentials.userId, target.userId)
          ))
          .for("update")
          .limit(1);

        if (!locked) throw new Error("CREDENTIAL_NOT_FOUND");

        if (input.data.approved) {
          if (!locked.licenseExpiresAt) {
            throw new Error("LICENSE_EXPIRATION_REQUIRED");
          }

          const today = new Date().toISOString().slice(0, 10);

          if (locked.licenseExpiresAt < today) {
            throw new Error("LICENSE_EXPIRED");
          }

          const [providerMembership] = await tx.select()
            .from(clinicMemberships)
            .where(and(
              eq(clinicMemberships.userId, locked.userId),
              eq(clinicMemberships.clinicId, clinicId),
              eq(clinicMemberships.clinicalRole, "provider"),
              eq(clinicMemberships.isActive, true),
              eq(clinicMemberships.acceptanceStatus, "active"),
              eq(clinicMemberships.accessScope, "full")
            ))
            .limit(1);

          if (!providerMembership) throw new Error("PROVIDER_NOT_ACTIVE");
        }

        const [updated] = await tx.update(prescriberCredentials)
          .set({
            prescribingAuthorized: input.data.approved,
            verifiedAt: input.data.approved ? new Date() : null,
            verifiedByUserId: input.data.approved ? verifierUserId : null,
            updatedAt: new Date()
          })
          .where(eq(prescriberCredentials.id, locked.id))
          .returning();

        await tx.insert(prescriberCredentialAuditEvents).values({
          credentialId: locked.id,
          clinicId,
          providerUserId: locked.userId,
          verifierUserId,
          action: input.data.approved ? "approved" : "revoked",
          verificationSource: input.data.verificationSource,
          notes: input.data.notes || null
        });

        return updated;
      });

      return res.json({
        credentialId: result.id,
        prescribingAuthorized: result.prescribingAuthorized,
        verifiedAt: result.verifiedAt,
        verifiedByUserId: result.verifiedByUserId
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      const known: Record<string, [number, string]> = {
        ADMIN_ACCESS_REVOKED: [403, "Administrator access is no longer active"],
        CREDENTIAL_NOT_FOUND: [404, "Credentials not found"],
        SELF_VERIFICATION: [403, "Providers cannot verify their own credentials"],
        LICENSE_EXPIRATION_REQUIRED: [400, "License expiration date required"],
        LICENSE_EXPIRED: [400, "Professional license has expired"],
        PROVIDER_NOT_ACTIVE: [403, "Provider does not have active clinic access"]
      };

      if (known[message]) {
        return res.status(known[message][0]).json({ error: known[message][1] });
      }

      console.error("[prescriber credential verification] Operation failed");
      return res.status(500).json({ error: "Credential verification failed" });
    }
  });


  app.get("/api/patients/:id/prescriptions", async (req, res) => {
    try {
      const context = await getPrescriptionPreparationContext(req);
if (!context) {
  return res.status(403).json({
    error: "Clinical authorization required"
  });
}

      const patientId = Number(req.params.id);
      if (!Number.isSafeInteger(patientId) || patientId <= 0) {
        return res.status(400).json({ error: "Invalid patient ID" });
      }

      const [patient] = await db.select({ id: patients.id })
        .from(patients)
        .where(and(
          eq(patients.id, patientId),
          eq(patients.clinicId, context.clinicId)
        ))
        .limit(1);

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      const records = await db.select()
        .from(prescriptions)
        .where(and(
          eq(prescriptions.patientId, patientId),
          eq(prescriptions.clinicId, context.clinicId)
        ));

      return res.json(records);
    } catch (error) {
      console.error("[prescriptions list] Operation failed");
      return res.status(500).json({ error: "Unable to load prescriptions" });
    }
  });


  app.get("/api/prescriptions/:prescriptionId", async (req, res) => {
  try {
    const context = await getPrescriptionPreparationContext(req);
if (!context) {
  return res.status(403).json({
    error: "Clinical authorization required"
  });
}

      const prescriptionId = Number(req.params.prescriptionId);
      if (!Number.isSafeInteger(prescriptionId) || prescriptionId <= 0) {
        return res.status(400).json({ error: "Invalid prescription ID" });
      }

      const [record] = await db.select()
        .from(prescriptions)
        .where(and(
          eq(prescriptions.id, prescriptionId),
          eq(prescriptions.clinicId, context.clinicId)
        ))
        .limit(1);

      if (!record) {
        return res.status(404).json({ error: "Prescription not found" });
      }

      const [patient] = await db.select({ id: patients.id })
        .from(patients)
        .where(and(
          eq(patients.id, record.patientId),
          eq(patients.clinicId, context.clinicId)
        ))
        .limit(1);

      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      return res.json({ ...record, reviewHash: prescriptionReviewHash(record) });
    } catch (error) {
      console.error("[prescription detail] Operation failed");
      return res.status(500).json({ error: "Unable to load prescription" });
    }
  });


  app.patch("/api/prescriptions/:prescriptionId", async (req, res) => {
    try {
      const context = await getPrescriptionPreparationContext(req);
if (!context) {
  return res.status(403).json({
    error: "Clinical authorization required"
  });
}

      const prescriptionId = Number(req.params.prescriptionId);
      if (!Number.isSafeInteger(prescriptionId) || prescriptionId <= 0) {
        return res.status(400).json({ error: "Invalid prescription ID" });
      }
const patientId = Number(req.body?.patientId);

if (!Number.isSafeInteger(patientId) || patientId <= 0) {
  return res.status(400).json({
    error: "Valid patient ID required"
  });
}
      const { patientId: _requestPatientId, ...draftBody } = req.body ?? {};
const parsed = prescriptionDraftSchema.safeParse(draftBody);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid prescription details",
          issues: parsed.error.flatten()
        });
      }

      const { isControlledSubstance: _ignored, ...details } = parsed.data;

      const [updated] = await db.transaction(async (tx) => {
        const current = await getPrescriptionPreparationContext(req, tx);
        const [patient] = await tx.select({ id: patients.id }).from(patients)
          .where(and(eq(patients.id, patientId), eq(patients.clinicId, context.clinicId)))
          .limit(1).for("share");
        if (!current || current.clinicId !== context.clinicId || !patient) return [];
        const records = await tx.update(prescriptions)
          .set({
            ...details,
            updatedAt: new Date()
          })
          .where(and(
  eq(prescriptions.id, prescriptionId),
  eq(prescriptions.clinicId, context.clinicId),
  eq(prescriptions.patientId, patientId),
  eq(prescriptions.status, "draft")
))
          .returning();

        if (records[0]) {
          await tx.insert(prescriptionAuditEvents).values({
            prescriptionId,
            clinicId: context.clinicId,
            actorUserId: context.userId,
actorStaffId: context.staffId,
action: "updated",
            details: { status: "draft" }
          });
        }

        return records;
      });

      if (!updated) {
        return res.status(404).json({
          error: "Draft not found or prescription is no longer editable"
        });
      }

      return res.json(updated);
    } catch (error) {
      console.error("[prescription draft update] Operation failed");
      return res.status(500).json({ error: "Unable to update draft" });
    }
  });

  app.post("/api/patients/:id/prescriptions", async (req: Request, res: Response) => {
    try {
      const context = await getPrescriptionPreparationContext(req);

if (!context) {
  return res.status(403).json({
    error: "Clinical authorization required to prepare prescriptions"
  });
}

const clinicId = context.clinicId;
const clinicianId = context.userId;
const staffId = context.staffId;

const patientId = Number(req.params.id);

if (!Number.isSafeInteger(patientId) || patientId <= 0) {
  return res.status(400).json({
    error: "Valid patient ID required"
  });
}
      const [patient] = await db.select({ id: patients.id })
        .from(patients)
        .where(and(
          eq(patients.id, patientId),
          eq(patients.clinicId, clinicId)
        ))
        .limit(1);

      if (!patient) {
        return res.status(404).json({ error: "Patient not found in this clinic" });
      }

      const parsed = prescriptionDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid prescription details",
          issues: parsed.error.flatten()
        });
      }

      const { isControlledSubstance: _ignored, ...details } = parsed.data;

      const draft = await db.transaction(async (tx) => {
        const current = await getPrescriptionPreparationContext(req, tx);
        const [lockedPatient] = await tx.select({ id: patients.id }).from(patients)
          .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
          .limit(1).for("share");
        if (!current || current.clinicId !== clinicId || !lockedPatient) {
          throw new PrescriptionError(403, "Clinical authorization required");
        }
        const [created] = await tx.insert(prescriptions).values({
          ...details,
          clinicId,
          patientId,
          createdByUserId: clinicianId,
          createdByStaffId: staffId || null,
          status: "draft",
          isControlledSubstance: false
        }).returning();

        await tx.insert(prescriptionAuditEvents).values({
          prescriptionId: created.id,
          clinicId,
          actorUserId: clinicianId,
          actorStaffId: staffId || null,
          action: "created",
          details: { status: "draft" }
        });

        return created;
      });

      return res.status(201).json(draft);
    } catch (error) {
      console.error("[prescriptions create draft] Operation failed");
      return res.status(500).json({ error: "Unable to save prescription draft" });
    }
  });
  // Create multiple unsigned prescription drafts atomically.
  // No signing or transmission occurs in this endpoint.
  app.post("/api/patients/:id/prescriptions/batch", async (req: Request, res: Response) => {
    try {
      const context = await getPrescriptionPreparationContext(req);

if (!context) {
  return res.status(403).json({
    error: "Clinical authorization required to prepare prescriptions"
  });
}

const clinicId = context.clinicId;
const clinicianId = context.userId;
const staffId = context.staffId;

const patientId = Number(req.params.id);

if (!Number.isSafeInteger(patientId) || patientId <= 0) {
  return res.status(400).json({
    error: "Valid patient ID required"
  });
}
      const [patient] = await db.select({ id: patients.id })
        .from(patients)
        .where(and(
          eq(patients.id, patientId),
          eq(patients.clinicId, clinicId)
        ))
        .limit(1);

      if (!patient) {
        return res.status(404).json({
          error: "Patient not found in this clinic"
        });
      }

      const batchSchema = z.object({
        medications: z.array(prescriptionDraftSchema).min(1).max(20)
      }).strict();

      const parsed = batchSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid prescription batch",
          issues: parsed.error.flatten()
        });
      }

      const result = await db.transaction(async (tx) => {
        const current = await getPrescriptionPreparationContext(req, tx);
        const [lockedPatient] = await tx.select({ id: patients.id }).from(patients)
          .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
          .limit(1).for("share");
        if (!current || current.clinicId !== clinicId || !lockedPatient) {
          throw new PrescriptionError(403, "Clinical authorization required");
        }
        const [batch] = await tx.insert(prescriptionBatches).values({
          clinicId,
          patientId,
          createdByUserId: clinicianId
        }).returning();

        const drafts = [];

        for (const medication of parsed.data.medications) {
          const {
            isControlledSubstance: _ignored,
            ...details
          } = medication;

          const [created] = await tx.insert(prescriptions).values({
            ...details,
            batchId: batch.id,
            clinicId,
            patientId,
            createdByUserId: clinicianId,
            createdByStaffId: staffId || null,
            status: "draft",
            isControlledSubstance: false
          }).returning();

          await tx.insert(prescriptionAuditEvents).values({
            prescriptionId: created.id,
            clinicId,
            actorUserId: clinicianId,
            actorStaffId: staffId || null,
            action: "created",
            details: {
              status: "draft",
              batchId: batch.id
            }
          });

          drafts.push(created);
        }

        return {
          batchId: batch.id,
          prescriptions: drafts
        };
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error("[prescriptions create batch] Operation failed");
      return res.status(500).json({
        error: "Unable to save prescription drafts"
      });
    }
  });
  // Prescription signing is intentionally disabled pending clinical
  // and security approval. This check must remain the first operation.
  // Sign prescription — clinical signing remains disabled until
// medication eligibility, storage, and audit controls are validated.
// Download a previously finalized, signed prescription PDF.
app.get("/api/prescriptions/:prescriptionId/pdf", async (req, res) => {
  try {
    const context = await getPrescriptionPreparationContext(req);

    if (!context) {
      return res.status(403).json({
        error: "Clinical authorization required",
      });
    }

    const prescriptionId = Number(req.params.prescriptionId);

    if (!Number.isSafeInteger(prescriptionId) || prescriptionId <= 0) {
      return res.status(400).json({
        error: "Invalid prescription ID",
      });
    }

    const [prescription] = await db.select()
      .from(prescriptions)
      .where(and(
        eq(prescriptions.id, prescriptionId),
        eq(prescriptions.clinicId, context.clinicId),
        eq(prescriptions.status, "signed")
      ))
      .limit(1);

    if (!prescription) {
      return res.status(404).json({
        error: "Signed prescription not found",
      });
    }

    const [patient] = await db.select({ id: patients.id })
      .from(patients)
      .where(and(
        eq(patients.id, prescription.patientId),
        eq(patients.clinicId, context.clinicId)
      ))
      .limit(1);

    if (!patient) {
      return res.status(404).json({
        error: "Patient not found",
      });
    }

    const [document] = await db.select()
      .from(prescriptionDocuments)
      .where(and(
        eq(prescriptionDocuments.prescriptionId, prescriptionId),
        eq(prescriptionDocuments.clinicId, context.clinicId)
      ))
      .limit(1);

    if (!document) {
      return res.status(404).json({
        error: "Signed PDF not found",
      });
    }
    const expectedPrefix = prescriptionStorageKey(context.clinicId, prescriptionId)
      .replace(/signed\.pdf$/, "");
    if (!document.storageKey.startsWith(expectedPrefix) ||
        document.signedByUserId !== prescription.signedByUserId ||
        !prescription.signedAt ||
        document.signedAt.getTime() !== prescription.signedAt.getTime()) {
      throw new Error("Prescription document linkage verification failed");
    }

    const pdf = await retrieveSignedPrescriptionPdf(
      // Only references belonging to this exact clinic and prescription may
      // reach storage; a valid hash is not tenant authorization.
      document.storageKey,
      document.sha256Hash
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="prescription-${prescriptionId}.pdf"`
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.send(pdf);

  } catch (error) {
    console.error("[prescription PDF download] Operation failed");

    return res.status(500).json({
      error: "Unable to retrieve signed prescription PDF",
    });
  }
});
app.post("/api/prescriptions/:prescriptionId/sign", async (req, res) => {
  try {
    // Keep the existing clinical safety gate.
    assertPrescriptionSigningEnabled();

    // Require explicit confirmation of signing intent.
    const confirmation = z.object({
      confirmSign: z.literal(true),
      reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
    }).strict().safeParse(req.body);

    if (!confirmation.success) {
      return res.status(400).json({
        error: "Explicit electronic signing confirmation required",
      });
    }

    // Verify the authenticated provider and prescribing credentials.
    const context = await getCredentialContext(req);

    if (!context) {
      return res.status(403).json({
        error: "Verified prescriber authorization required",
      });
    }

    const prescriptionId = Number(req.params.prescriptionId);

    if (!Number.isSafeInteger(prescriptionId) || prescriptionId <= 0) {
      return res.status(400).json({
        error: "Invalid prescription ID",
      });
    }

    const result = await finalizePrescription(prescriptionId, context.clinicId, confirmation.data.reviewHash, {
      now: () => new Date(),
      classify: classifyPrescription,
      generatePdf: generatePrescriptionPdf,
      storePdf: storeSignedPrescriptionPdf,
      transaction: work => db.transaction(async tx => {
        await tx.execute(sql`SET LOCAL statement_timeout = '45s'`);
        await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '60s'`);
        const adapter: SigningTransaction = {
          async lockPrescription(id, clinicId) {
            const [rx] = await tx.select().from(prescriptions)
              .where(and(eq(prescriptions.id, id), eq(prescriptions.clinicId, clinicId)))
              .limit(1).for("update");
            return rx;
          },
          async authorizeSigner() {
            const current = await getAuthorizedSigner(req, tx);
            if (!current || current.clinicId !== context.clinicId) return null;
            return {
              userId: current.userId, clinicId: current.clinicId,
              name: `${current.prescriber.firstName} ${current.prescriber.lastName}`.trim(),
              title: current.prescriber.title,
              npi: current.prescriber.npi!,
              license: current.credential.licenseNumber,
              licenseState: current.credential.licenseState,
              signatureImage: current.prescriber.signatureImage!,
            };
          },
          async getDocument(id, clinicId) {
            const [doc] = await tx.select().from(prescriptionDocuments)
              .where(and(eq(prescriptionDocuments.prescriptionId, id), eq(prescriptionDocuments.clinicId, clinicId)))
              .limit(1);
            return doc;
          },
          async getPdfContext(rx) {
            const [patient] = await tx.select().from(patients)
              .where(and(eq(patients.id, rx.patientId), eq(patients.clinicId, rx.clinicId)))
              .limit(1).for("share");
            const [clinic] = await tx.select().from(clinics)
              .where(and(eq(clinics.id, rx.clinicId), eq(clinics.isActive, true)))
              .limit(1).for("share");
            if (!patient || !clinic) throw new PrescriptionError(404, "Prescription not found");
            return {
              patientName: `${patient.firstName} ${patient.lastName}`,
              patientDob: patient.dateOfBirth, patientAddress: patient.address,
              clinicName: clinic.name,
            };
          },
          async commitDocument(rx, signer, signedAt, object, classification, reviewHash) {
            const [document] = await tx.insert(prescriptionDocuments).values({
              prescriptionId: rx.id, clinicId: rx.clinicId, ...object,
              signedByUserId: signer.userId, signedAt,
            }).returning();
            const [signed] = await tx.update(prescriptions).set({
              status: "signed", signedAt, signedByUserId: signer.userId,
              prescriberUserId: signer.userId,
              prescriberNameSnapshot: signer.name, prescriberTitleSnapshot: signer.title,
              prescriberNpiSnapshot: signer.npi,
              prescriberLicenseSnapshot: signer.license,
              prescriberLicenseStateSnapshot: signer.licenseState,
              updatedAt: signedAt,
            }).where(and(eq(prescriptions.id, rx.id), eq(prescriptions.clinicId, rx.clinicId),
              eq(prescriptions.status, "draft"))).returning({ id: prescriptions.id });
            if (!signed) throw new PrescriptionError(409, "Prescription is already finalized");
            await tx.insert(prescriptionAuditEvents).values({
              prescriptionId: rx.id, clinicId: rx.clinicId,
              actorUserId: signer.userId, action: "signed",
              details: { documentId: document.id, sha256Hash: object.sha256Hash,
                reviewHash, classification, signedAt: signedAt.toISOString() },
            });
            return document;
          },
        };
        return work(adapter);
      }),
    });
    return res.json(result);

  } catch (error) {
    if (error instanceof PrescriptionError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("[prescription signing] Operation failed");

    return res.status(503).json({
      error: "Prescription signing is not yet enabled",
    });
  }
});

}
