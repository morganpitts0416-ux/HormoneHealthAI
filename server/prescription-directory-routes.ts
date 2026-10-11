import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./storage";
import { prescriptionMedications as medications, prescriptionSigs as sigs, prescriptionPharmacies as pharmacies } from "@shared/schema";
import { PrescriptionError } from "./prescription-finalization";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Access = { clinicId: number; userId: number; staffId: number | null; isStaff: boolean };
type Authorize = (req: Request, connection: Pick<typeof db, "select" | "execute">) => Promise<Access | null>;
const text = (max: number) => z.string().trim().min(1).max(max);
const optional = (max: number) => z.string().trim().max(max).nullable().optional();
const medicationInput = z.object({ medicationName: text(300), strength: text(100), dosageForm: text(100) }).strict();
const sigInput = z.object({ sig: text(4000), dose: optional(150), route: optional(100), frequency: optional(150) }).strict();
const pharmacyInput = z.object({ name: text(300), address: optional(1000), phone: optional(50), fax: optional(50) }).strict();
const filters = z.object({ search: z.string().max(150).default(""), includeInactive: z.enum(["true", "false"]).default("false") }).strict();
const nonempty = (input: object) => Object.keys(input).length > 0;
const medicationEdit = medicationInput.partial().extend({ isActive: z.boolean().optional() }).refine(nonempty);
const sigEdit = sigInput.partial().extend({ isActive: z.boolean().optional() }).refine(nonempty);
const pharmacyEdit = pharmacyInput.partial().extend({ isActive: z.boolean().optional() }).refine(nonempty);
const normalize = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
export const directoryIdentity = (...values: (string | null | undefined)[]) =>
  createHash("sha256").update(JSON.stringify(values.map(normalize))).digest("hex");
const medicationKey = (row: { medicationName: string; strength: string; dosageForm: string }) =>
  directoryIdentity(row.medicationName, row.strength, row.dosageForm);
const id = (value: string) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new PrescriptionError(400, "Invalid directory ID");
  return Number(value);
};
const parse = <Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new PrescriptionError(400, "Invalid directory details");
  return result.data;
};
const nullable = (row: Record<string, any>, fields: string[]) =>
  Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field] || null]));
const pattern = (search: string) => `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;

export function registerPrescriptionDirectoryRoutes(app: Express, authorize: Authorize) {
  type Handler = (req: Request, tx: Transaction, access: Access) => Promise<{ data: unknown; status?: number }>;
  const route = (method: "get" | "post" | "patch", path: string, handle: Handler) => {
    app[method](path, async (req: Request, res: Response) => {
      try {
        const result = await db.transaction(async tx => {
          const access = await authorize(req, tx);
          if (!access) throw new PrescriptionError(403, "Clinic prescription access required");
          return handle(req, tx, access);
        });
        return res.status(result.status ?? 200).json(result.data);
      } catch (error) {
        if (error instanceof PrescriptionError) return res.status(error.status).json({ error: error.message });
        // Unique constraints remain the final arbiter under concurrent writers.
        if ((error as any)?.code === "23505") return res.status(409).json({ error: "This directory entry already exists" });
        console.error("[prescription directory] Operation failed");
        return res.status(503).json({ error: "Prescription directory unavailable" });
      }
    });
  };
  const medication = async (req: Request, tx: Transaction, access: Access, active = false) => {
    const [row] = await tx.select().from(medications).where(and(
      eq(medications.id, id(req.params.medicationId)), eq(medications.clinicId, access.clinicId)
    )).limit(1).for("update");
    if (!row || (active && !row.isActive)) throw new PrescriptionError(404, "Medication not found");
    return row;
  };
  const duplicateMedication = async (tx: Transaction, access: Access, key: string, except?: number) => {
    const [existing] = await tx.select().from(medications).where(and(
      eq(medications.clinicId, access.clinicId), eq(medications.identityKey, key)
    )).limit(1);
    if (existing && existing.id !== except) throw new PrescriptionError(409, "This medication formulation already exists; edit or reactivate its entry");
  };

  route("get", "/api/prescription-medications", async (req, tx, access) => {
    const filter = parse(filters, req.query);
    const rows = await tx.select().from(medications).where(and(
      eq(medications.clinicId, access.clinicId),
      filter.includeInactive === "false" ? eq(medications.isActive, true) : undefined,
      filter.search.trim() ? or(ilike(medications.medicationName, pattern(filter.search)),
        ilike(medications.strength, pattern(filter.search)), ilike(medications.dosageForm, pattern(filter.search))) : undefined
    )).orderBy(asc(medications.medicationName), asc(medications.strength), asc(medications.dosageForm)).limit(1000);
    return { data: rows };
  });
  route("post", "/api/prescription-medications", async (req, tx, access) => {
    const input = parse(medicationInput, req.body);
    const key = medicationKey(input);
    await duplicateMedication(tx, access, key);
    const [row] = await tx.insert(medications).values({ ...input, clinicId: access.clinicId, identityKey: key }).returning();
    return { data: row, status: 201 };
  });
  route("patch", "/api/prescription-medications/:medicationId", async (req, tx, access) => {
    const input = parse(medicationEdit, req.body);
    const row = await medication(req, tx, access);
    const oldIdentityKey = row.identityKey;
    const key = medicationKey({ ...row, ...input });
    await duplicateMedication(tx, access, key, row.id);
    const [updated] = await tx.update(medications).set({ ...input, identityKey: key, updatedAt: new Date() })
      .where(and(eq(medications.id, row.id), eq(medications.clinicId, access.clinicId))).returning();
    // A changed formulation must never inherit dosing instructions for the old one.
    if (key !== oldIdentityKey || input.isActive === false) {
      await tx.update(sigs).set({ isActive: false, updatedAt: new Date() }).where(and(
        eq(sigs.medicationId, row.id), eq(sigs.clinicId, access.clinicId)
      ));
    }
    return { data: updated };
  });
  route("get", "/api/prescription-medications/:medicationId/sigs", async (req, tx, access) => {
    const filter = parse(filters.omit({ search: true }), req.query);
    const row = await medication(req, tx, access, filter.includeInactive === "false");
    return { data: await tx.select().from(sigs).where(and(
      eq(sigs.clinicId, access.clinicId), eq(sigs.medicationId, row.id),
      filter.includeInactive === "false" ? eq(sigs.isActive, true) : undefined
    )).orderBy(asc(sigs.sig)).limit(1000) };
  });
  route("post", "/api/prescription-medications/:medicationId/sigs", async (req, tx, access) => {
    const input = parse(sigInput, req.body);
    const row = await medication(req, tx, access, true);
    const identityKey = directoryIdentity(input.sig);
    const [existing] = await tx.select().from(sigs).where(and(
      eq(sigs.medicationId, row.id), eq(sigs.clinicId, access.clinicId), eq(sigs.identityKey, identityKey)
    )).limit(1);
    if (existing) {
      if (!existing.isActive) throw new PrescriptionError(409, "These directions are archived; review and reactivate them in the directory");
      return { data: existing };
    }
    const [saved] = await tx.insert(sigs).values({
      ...input, ...nullable(input, ["dose", "route", "frequency"]), identityKey,
      clinicId: access.clinicId, medicationId: row.id, createdByUserId: access.userId, createdByStaffId: access.staffId,
    }).returning();
    return { data: saved, status: 201 };
  });
  route("patch", "/api/prescription-medications/:medicationId/sigs/:sigId", async (req, tx, access) => {
    const input = parse(sigEdit, req.body);
    const row = await medication(req, tx, access, input.isActive === true);
    const sigId = id(req.params.sigId);
    const [existing] = await tx.select().from(sigs).where(and(
      eq(sigs.id, sigId), eq(sigs.medicationId, row.id), eq(sigs.clinicId, access.clinicId)
    )).limit(1);
    if (!existing) throw new PrescriptionError(404, "Saved directions not found");
    const identityKey = directoryIdentity(input.sig ?? existing.sig);
    const [duplicate] = await tx.select().from(sigs).where(and(
      eq(sigs.medicationId, row.id), eq(sigs.clinicId, access.clinicId), eq(sigs.identityKey, identityKey)
    )).limit(1);
    if (duplicate && duplicate.id !== existing.id) throw new PrescriptionError(409, "These directions already exist");
    const [updated] = await tx.update(sigs).set({ ...input, ...nullable(input, ["dose", "route", "frequency"]), identityKey, updatedAt: new Date() })
      .where(and(eq(sigs.id, sigId), eq(sigs.medicationId, row.id), eq(sigs.clinicId, access.clinicId))).returning();
    return { data: updated };
  });

  // Reuse the original pharmacy table; snapshots on prescriptions remain unchanged.
  const pharmacyDuplicate = async (tx: Transaction, access: Access, candidate: { name: string; address?: string | null }, except?: number) => {
    const rows = await tx.select().from(pharmacies).where(eq(pharmacies.clinicId, access.clinicId));
    const key = directoryIdentity(candidate.name, candidate.address);
    if (rows.some(row => row.id !== except && directoryIdentity(row.name, row.address) === key)) {
      throw new PrescriptionError(409, "This pharmacy location already exists; edit or reactivate its entry");
    }
  };
  route("get", "/api/prescription-pharmacies", async (req, tx, access) => {
    const filter = parse(filters, req.query);
    return { data: await tx.select().from(pharmacies).where(and(
      eq(pharmacies.clinicId, access.clinicId),
      filter.includeInactive === "false" ? eq(pharmacies.isActive, true) : undefined,
      filter.search.trim() ? or(ilike(pharmacies.name, pattern(filter.search)),
        ilike(pharmacies.address, pattern(filter.search)), ilike(pharmacies.phone, pattern(filter.search)),
        ilike(pharmacies.fax, pattern(filter.search))) : undefined
    )).orderBy(asc(pharmacies.name), asc(pharmacies.address)).limit(1000) };
  });
  route("post", "/api/prescription-pharmacies", async (req, tx, access) => {
    const input = parse(pharmacyInput, req.body);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${access.clinicId}, -44231)`);
    await pharmacyDuplicate(tx, access, input);
    const [saved] = await tx.insert(pharmacies).values({
      ...input, ...nullable(input, ["address", "phone", "fax"]), clinicId: access.clinicId,
    }).returning();
    return { data: saved, status: 201 };
  });
  route("patch", "/api/prescription-pharmacies/:pharmacyId", async (req, tx, access) => {
    const input = parse(pharmacyEdit, req.body);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${access.clinicId}, -44231)`);
    const pharmacyId = id(req.params.pharmacyId);
    const [existing] = await tx.select().from(pharmacies).where(and(
      eq(pharmacies.id, pharmacyId), eq(pharmacies.clinicId, access.clinicId)
    )).limit(1).for("update");
    if (!existing) throw new PrescriptionError(404, "Pharmacy not found");
    await pharmacyDuplicate(tx, access, { ...existing, ...input }, existing.id);
    const [updated] = await tx.update(pharmacies).set({
      ...input, ...nullable(input, ["address", "phone", "fax"]), updatedAt: new Date(),
    }).where(and(eq(pharmacies.id, existing.id), eq(pharmacies.clinicId, access.clinicId))).returning();
    return { data: updated };
  });
}
