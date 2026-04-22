import { eq, desc, ilike, or, and, isNull, count, sql } from "drizzle-orm";
import { getSeedAsEntries } from "./medication-seed.js";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;
import * as schema from "@shared/schema";
import type {
  Patient, InsertPatient,
  LabResult, InsertLabResult,
  SavedInterpretation, InsertSavedInterpretation,
  User, InsertUser,
  ClinicianStaff, InsertClinicianStaff,
  PatientPortalAccount, InsertPatientPortalAccount,
  PublishedProtocol, InsertPublishedProtocol,
  PortalMessage, InsertPortalMessage,
  SavedRecipe, InsertSavedRecipe,
  SupplementOrder, InsertSupplementOrder,
  ClinicianSupplementSettings, InsertClinicianSupplementSettings,
  ClinicianSupplement, InsertClinicianSupplement,
  ClinicianSupplementRule, InsertClinicianSupplementRule,
  ClinicianLabPreference, InsertClinicianLabPreference,
  ClinicalEncounter, InsertClinicalEncounter,
} from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRow(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

function rawRows(result: any): Record<string, any>[] {
  const rows = result.rows ?? result ?? [];
  return Array.isArray(rows) ? rows.map(mapRow) : [];
}
export const db = drizzle(pool, { schema });

export interface IStorage {
  // User operations
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  recordLoginAttempt(userId: number, success: boolean): Promise<void>;
  recordStaffLoginAttempt(staffId: number, success: boolean): Promise<void>;
  createUser(user: Omit<InsertUser, 'passwordHash'> & { passwordHash: string }): Promise<User>;
  updateUser(id: number, user: Partial<Omit<InsertUser, 'passwordHash'>>): Promise<User | undefined>;

  // Password reset / invite operations
  savePasswordResetToken(userId: number, token: string, expires: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(userId: number): Promise<void>;
  updatePassword(userId: number, passwordHash: string): Promise<void>;

  // BAA e-signatures
  getBaaSignature(userId: number): Promise<schema.BaaSignature | undefined>;
  createBaaSignature(data: schema.InsertBaaSignature): Promise<schema.BaaSignature>;

  // Stripe billing
  updateUserStripe(id: number, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeCurrentPeriodEnd?: Date | null;
    stripeCancelAtPeriodEnd?: boolean;
    subscriptionStatus?: string;
  }): Promise<User | undefined>;

  // Admin operations
  getAllUsers(): Promise<User[]>;
  promoteToAdmin(id: number): Promise<User | undefined>;
  updateUserAdmin(id: number, data: Partial<Pick<User, 'subscriptionStatus' | 'role' | 'notes' | 'freeAccount'>>): Promise<User | undefined>;
  deleteUserAdmin(id: number): Promise<boolean>;
  getPatientCountByUser(userId: number, clinicId?: number | null): Promise<number>;

  // Patient operations (clinic-aware: clinicId preferred, userId fallback for legacy records)
  getPatient(id: number, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  getAllPatients(userId: number, clinicId?: number | null): Promise<Patient[]>;
  searchPatients(searchTerm: string, userId: number, gender?: string, clinicId?: number | null): Promise<Patient[]>;
  getPatientByName(firstName: string, lastName: string, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  getPatientByEmail(email: string, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: number, patient: Partial<InsertPatient>, userId: number, clinicId?: number | null): Promise<Patient | undefined>;
  deletePatient(id: number, userId: number, clinicId?: number | null): Promise<boolean>;

  // Clinic management
  getClinicForUser(userId: number): Promise<schema.Clinic | undefined>;
  getAllClinicsAdmin(): Promise<Array<schema.Clinic & { memberCount: number; patientCount: number; ownerEmail: string | null }>>;
  backfillPatientsToClinic(userId: number, clinicId: number): Promise<number>;
  addUserToClinic(clinicId: number, userId: number, role: string): Promise<schema.ClinicMembership>;
  getClinicMembers(clinicId: number): Promise<Array<schema.ClinicMembership & { userEmail: string; userName: string }>>;

  // Lab result operations
  getLabResult(id: number): Promise<LabResult | undefined>;
  getLabResultsByPatient(patientId: number): Promise<LabResult[]>;
  createLabResult(labResult: InsertLabResult): Promise<LabResult>;
  updateLabResult(id: number, labResult: Partial<InsertLabResult>): Promise<LabResult | undefined>;
  deleteLabResult(id: number): Promise<boolean>;

  // Saved interpretation operations (scoped by userId)
  getSavedInterpretation(id: number, userId: number): Promise<SavedInterpretation | undefined>;
  getAllSavedInterpretations(userId: number, gender?: string): Promise<SavedInterpretation[]>;
  searchSavedInterpretations(searchTerm: string, userId: number, gender?: string): Promise<SavedInterpretation[]>;
  createSavedInterpretation(interpretation: InsertSavedInterpretation): Promise<SavedInterpretation>;
  deleteSavedInterpretation(id: number, userId: number): Promise<boolean>;

  // Clinician staff operations
  getClinicianStaffById(id: number): Promise<ClinicianStaff | undefined>;
  getClinicianStaffByEmail(email: string): Promise<ClinicianStaff | undefined>;
  getClinicianStaffByInviteToken(token: string): Promise<ClinicianStaff | undefined>;
  getAllStaffForClinician(clinicianId: number): Promise<ClinicianStaff[]>;
  createClinicianStaff(data: Omit<InsertClinicianStaff, 'passwordHash'> & { passwordHash?: string | null }): Promise<ClinicianStaff>;
  updateClinicianStaff(id: number, data: Partial<ClinicianStaff>): Promise<ClinicianStaff | undefined>;
  deleteClinicianStaff(id: number): Promise<boolean>;

  // Clinic provider invites
  createClinicProviderInvite(data: schema.InsertClinicProviderInvite): Promise<schema.ClinicProviderInvite>;
  getClinicProviderInviteByToken(token: string): Promise<schema.ClinicProviderInvite | undefined>;
  getClinicProviderInvites(clinicId: number): Promise<schema.ClinicProviderInvite[]>;
  updateClinicProviderInviteStatus(id: number, status: string): Promise<void>;
  deleteClinicProviderInvite(id: number): Promise<boolean>;

  // Patient portal account operations
  getPatientById(id: number): Promise<Patient | undefined>;
  getPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByInviteToken(token: string): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByResetToken(token: string): Promise<PatientPortalAccount | undefined>;
  createPortalAccount(account: InsertPatientPortalAccount): Promise<PatientPortalAccount>;
  updatePortalAccount(patientId: number, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined>;

  // Published protocol operations
  publishProtocol(protocol: InsertPublishedProtocol): Promise<PublishedProtocol>;
  getLatestPublishedProtocol(patientId: number): Promise<PublishedProtocol | undefined>;
  getAllPublishedProtocols(patientId: number): Promise<PublishedProtocol[]>;
  deleteProtocolsByLabResultId(labResultId: number): Promise<void>;
  markProtocolViewed(protocolId: number): Promise<void>;

  // Portal messaging operations
  getPortalMessages(patientId: number): Promise<PortalMessage[]>;
  createPortalMessage(msg: InsertPortalMessage): Promise<PortalMessage>;
  markPortalMessagesRead(patientId: number, readBySenderType: 'patient' | 'clinician'): Promise<void>;
  getUnreadPortalMessageCount(patientId: number, unreadBySenderType: 'patient' | 'clinician'): Promise<number>;
  getPortalMessageByExternalId(externalMessageId: string): Promise<PortalMessage | undefined>;

  // Saved recipe operations (patient portal)
  getSavedRecipes(patientId: number): Promise<SavedRecipe[]>;
  saveRecipe(recipe: InsertSavedRecipe): Promise<SavedRecipe>;
  deleteSavedRecipe(id: number, patientId: number): Promise<boolean>;

  // Supplement order operations
  createSupplementOrder(order: InsertSupplementOrder): Promise<SupplementOrder>;
  getSupplementOrdersByPatient(patientId: number): Promise<SupplementOrder[]>;
  getSupplementOrdersByClinicianPatient(clinicianId: number, patientId: number): Promise<SupplementOrder[]>;
  getPendingOrdersForClinician(clinicianId: number): Promise<Array<SupplementOrder & { patientFirstName: string; patientLastName: string }>>;
  updateSupplementOrderStatus(orderId: number, clinicianId: number, status: string): Promise<SupplementOrder | undefined>;

  // Clinician notification helpers
  getUnreadMessageSummaryForClinician(clinicianId: number): Promise<Array<{ patientId: number; patientFirstName: string; patientLastName: string; count: number; lastAt: string }>>;

  // Clinician Supplement Settings (discount)
  getClinicianSupplementSettings(clinicianId: number): Promise<ClinicianSupplementSettings | undefined>;
  upsertClinicianSupplementSettings(clinicianId: number, data: Partial<InsertClinicianSupplementSettings>): Promise<ClinicianSupplementSettings>;

  // Clinician Supplement Library
  getClinicianSupplements(clinicianId: number): Promise<ClinicianSupplement[]>;
  getClinicianSupplement(id: number, clinicianId: number): Promise<ClinicianSupplement | undefined>;
  createClinicianSupplement(supplement: InsertClinicianSupplement): Promise<ClinicianSupplement>;
  updateClinicianSupplement(id: number, clinicianId: number, data: Partial<InsertClinicianSupplement>): Promise<ClinicianSupplement | undefined>;
  deleteClinicianSupplement(id: number, clinicianId: number): Promise<boolean>;

  // Clinician Supplement Rules
  getClinicianSupplementRules(supplementId: number, clinicianId: number): Promise<ClinicianSupplementRule[]>;
  getAllClinicianSupplementRules(clinicianId: number): Promise<ClinicianSupplementRule[]>;
  createClinicianSupplementRule(rule: InsertClinicianSupplementRule): Promise<ClinicianSupplementRule>;
  updateClinicianSupplementRule(id: number, clinicianId: number, data: Partial<InsertClinicianSupplementRule>): Promise<ClinicianSupplementRule | undefined>;
  deleteClinicianSupplementRule(id: number, clinicianId: number): Promise<boolean>;

  // Clinician Lab Preferences
  getClinicianLabPreferences(clinicianId: number): Promise<ClinicianLabPreference[]>;
  getClinicianLabPreference(clinicianId: number, markerKey: string, gender: string): Promise<ClinicianLabPreference | undefined>;
  upsertClinicianLabPreference(clinicianId: number, data: InsertClinicianLabPreference): Promise<ClinicianLabPreference>;
  deleteClinicianLabPreference(id: number, clinicianId: number): Promise<boolean>;

  // Clinical Encounters
  getEncountersByClinicianId(clinicianId: number, patientId?: number, clinicId?: number | null): Promise<(ClinicalEncounter & { patientName: string })[]>;
  getEncounter(id: number, clinicianId: number, clinicId?: number | null): Promise<ClinicalEncounter | undefined>;
  createEncounter(data: InsertClinicalEncounter): Promise<ClinicalEncounter>;
  updateEncounter(id: number, clinicianId: number, data: Partial<InsertClinicalEncounter> & { soapNote?: any; soapGeneratedAt?: Date; summaryPublished?: boolean; summaryPublishedAt?: Date; diarizedTranscript?: any; clinicalExtraction?: any; evidenceSuggestions?: import("@shared/schema").EvidenceOverlay | any; patternMatch?: import("@shared/schema").PatternMatchResult | any; updatedAt?: Date }, clinicId?: number | null): Promise<ClinicalEncounter | undefined>;
  deleteEncounter(id: number, clinicianId: number, clinicId?: number | null): Promise<boolean>;
  getPublishedEncountersByPatient(patientId: number): Promise<Pick<ClinicalEncounter, 'id' | 'visitDate' | 'visitType' | 'chiefComplaint' | 'patientSummary' | 'summaryPublishedAt'>[]>;

  // Appointments (native + Boulevard sync via Zapier)
  upsertAppointment(userId: number, boulevardId: string, data: Omit<schema.InsertAppointment, 'userId' | 'boulevardAppointmentId'>): Promise<schema.Appointment>;
  cancelAppointment(userId: number, boulevardId: string): Promise<void>;
  getAppointmentsByUserId(userId: number): Promise<schema.Appointment[]>;
  getAppointmentsByClinicAndRange(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.Appointment[]>;
  getAppointmentsByPatientEmail(email: string, userId: number): Promise<schema.Appointment[]>;
  getAppointmentsByPatientId(patientId: number): Promise<schema.Appointment[]>;
  matchAppointmentToPatient(appointmentId: number, patientId: number): Promise<void>;
  getAppointmentById(id: number): Promise<schema.Appointment | null>;
  createNativeAppointment(data: schema.InsertAppointment): Promise<schema.Appointment>;
  updateNativeAppointment(id: number, clinicId: number, data: Partial<schema.InsertAppointment>): Promise<schema.Appointment | null>;
  deleteNativeAppointment(id: number, clinicId: number): Promise<boolean>;
  markAppointmentReminderSent(id: number): Promise<void>;
  getAppointmentsNeedingReminder(now: Date, hoursAhead: number): Promise<schema.Appointment[]>;
  detectAppointmentConflict(providerId: number, start: Date, end: Date, excludeId?: number): Promise<boolean>;

  // Appointment Types
  getAppointmentTypes(clinicId: number, includeInactive?: boolean): Promise<schema.AppointmentType[]>;
  getAppointmentTypeById(id: number, clinicId: number): Promise<schema.AppointmentType | null>;
  createAppointmentType(data: schema.InsertAppointmentType): Promise<schema.AppointmentType>;
  updateAppointmentType(id: number, clinicId: number, data: Partial<schema.InsertAppointmentType>): Promise<schema.AppointmentType | null>;
  deleteAppointmentType(id: number, clinicId: number): Promise<boolean>;

  // Provider Availability (recurring weekly)
  getProviderAvailability(clinicId: number, providerId?: number | null): Promise<schema.ProviderAvailability[]>;
  createProviderAvailability(data: schema.InsertProviderAvailability): Promise<schema.ProviderAvailability>;
  updateProviderAvailability(id: number, clinicId: number, data: Partial<schema.InsertProviderAvailability>): Promise<schema.ProviderAvailability | null>;
  deleteProviderAvailability(id: number, clinicId: number): Promise<boolean>;

  // Calendar Blocks (one-off time-off, breaks)
  getCalendarBlocks(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.CalendarBlock[]>;
  createCalendarBlock(data: schema.InsertCalendarBlock): Promise<schema.CalendarBlock>;
  deleteCalendarBlock(id: number, clinicId: number): Promise<boolean>;

  // Providers (clinic roster used by scheduler)
  getProvidersByClinic(clinicId: number, includeInactive?: boolean): Promise<schema.Provider[]>;

  // Patient Chart
  getPatientChart(patientId: number, clinicianId: number): Promise<schema.PatientChart | null>;
  upsertPatientChart(patientId: number, clinicianId: number, data: Partial<Omit<schema.PatientChart, 'id' | 'patientId' | 'clinicianId' | 'updatedAt'>>): Promise<schema.PatientChart>;

  // Medication Dictionary
  getMedicationDictionaries(clinicianId: number): Promise<schema.MedicationDictionary[]>;
  createMedicationDictionary(data: schema.InsertMedicationDictionary): Promise<schema.MedicationDictionary>;
  deleteMedicationDictionary(id: number, clinicianId: number): Promise<boolean>;
  createMedicationEntries(entries: schema.InsertMedicationEntry[]): Promise<void>;
  getAllMedicationEntries(clinicianId: number): Promise<schema.MedicationEntry[]>;
  updateMedicationDictionaryCount(id: number, count: number): Promise<void>;
  getOrCreateManualDictionary(clinicianId: number): Promise<schema.MedicationDictionary>;
  addSingleMedicationEntry(entry: schema.InsertMedicationEntry): Promise<schema.MedicationEntry>;
  updateMedicationEntryAliases(id: number, clinicianId: number, fields: Partial<Pick<schema.MedicationEntry, "brandNames" | "commonSpokenVariants" | "commonMisspellings" | "drugClass" | "subclass" | "route" | "notes">>): Promise<schema.MedicationEntry | null>;
  deleteMedicationEntry(id: number, clinicianId: number): Promise<boolean>;
  // ── Encounter Drafts (server-side, cross-device) ──────────────────────────
  getEncounterDrafts(clinicianId: number): Promise<schema.EncounterDraft[]>;
  createEncounterDraft(draft: schema.InsertEncounterDraft): Promise<schema.EncounterDraft>;
  deleteEncounterDraft(id: number, clinicianId: number): Promise<boolean>;

  // ── Diagnosis Presets (clinic-wide shared /dx shortcuts) ──────────────────
  getDiagnosisPresets(clinicId: number): Promise<schema.DiagnosisPreset[]>;
  getDiagnosisPreset(id: number, clinicId: number): Promise<schema.DiagnosisPreset | undefined>;
  createDiagnosisPreset(data: schema.InsertDiagnosisPreset): Promise<schema.DiagnosisPreset>;
  updateDiagnosisPreset(id: number, clinicId: number, data: Partial<schema.InsertDiagnosisPreset>): Promise<schema.DiagnosisPreset | undefined>;
  deleteDiagnosisPreset(id: number, clinicId: number): Promise<boolean>;
}

// ─── Patient scope helper ────────────────────────────────────────────────────
// Builds the WHERE condition for patient visibility:
//   • When clinicId is set → filter by clinic_id (immune to account/email changes)
//   • When clinicId is null → legacy fallback: filter by user_id where clinic_id IS NULL
// This dual-condition guarantees both clinic-enrolled and legacy patients are visible.
function patientScopeCondition(userId: number, clinicId: number | null) {
  if (clinicId) {
    // Show clinic patients AND this user's own legacy patients (clinic_id IS NULL).
    // The legacy OR ensures pre-backfill and auto-created patients without clinic_id
    // are never invisible. Each provider only sees their OWN legacy rows (by userId).
    return or(
      eq(schema.patients.clinicId, clinicId),
      and(eq(schema.patients.userId, userId), isNull(schema.patients.clinicId))
    );
  }
  // No clinic context: show only this user's own legacy patients
  return and(eq(schema.patients.userId, userId), isNull(schema.patients.clinicId));
}

export class DbStorage implements IStorage {
  // ── User operations ─────────────────────────────────────────────────────────
  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return result[0];
  }

  async createUser(user: Omit<InsertUser, 'passwordHash'> & { passwordHash: string }): Promise<User> {
    const result = await db.insert(schema.users).values(user as any).returning();
    return result[0];
  }

  async updateUser(id: number, user: Partial<Omit<InsertUser, 'passwordHash'>>): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  // ── HIPAA: Login security (lockout tracking) ──────────────────────────────────
  async recordLoginAttempt(userId: number, success: boolean): Promise<void> {
    const LOCKOUT_THRESHOLD = 5;
    const LOCKOUT_MINUTES = 15;
    if (success) {
      await db.update(schema.users)
        .set({ loginAttempts: 0, lockedUntil: null, updatedAt: new Date() } as any)
        .where(eq(schema.users.id, userId));
    } else {
      const user = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!user[0]) return;
      const attempts = (user[0].loginAttempts ?? 0) + 1;
      const lockedUntil = attempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
      await db.update(schema.users)
        .set({ loginAttempts: attempts, lockedUntil, updatedAt: new Date() } as any)
        .where(eq(schema.users.id, userId));
    }
  }

  async recordStaffLoginAttempt(staffId: number, success: boolean): Promise<void> {
    const LOCKOUT_THRESHOLD = 5;
    const LOCKOUT_MINUTES = 15;
    if (success) {
      await db.update(schema.clinicianStaff)
        .set({ loginAttempts: 0, lockedUntil: null } as any)
        .where(eq(schema.clinicianStaff.id, staffId));
    } else {
      const staff = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.id, staffId)).limit(1);
      if (!staff[0]) return;
      const attempts = (staff[0].loginAttempts ?? 0) + 1;
      const lockedUntil = attempts >= LOCKOUT_THRESHOLD
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
      await db.update(schema.clinicianStaff)
        .set({ loginAttempts: attempts, lockedUntil } as any)
        .where(eq(schema.clinicianStaff.id, staffId));
    }
  }

  // ── Password reset / invite operations ───────────────────────────────────────
  async savePasswordResetToken(userId: number, token: string, expires: Date): Promise<void> {
    await db
      .update(schema.users)
      .set({ passwordResetToken: token, passwordResetExpires: expires, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.passwordResetToken, token));
    return result[0];
  }

  async clearPasswordResetToken(userId: number): Promise<void> {
    await db
      .update(schema.users)
      .set({ passwordResetToken: null, passwordResetExpires: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await db
      .update(schema.users)
      .set({ passwordHash, passwordResetToken: null, passwordResetExpires: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  // ── Admin operations ─────────────────────────────────────────────────────────
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  }

  async promoteToAdmin(id: number): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async updateUserAdmin(id: number, data: Partial<Pick<User, 'subscriptionStatus' | 'role' | 'notes' | 'freeAccount'>>): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async getBaaSignature(userId: number): Promise<schema.BaaSignature | undefined> {
    const result = await db
      .select()
      .from(schema.baaSignatures)
      .where(eq(schema.baaSignatures.userId, userId))
      .orderBy(schema.baaSignatures.signedAt)
      .limit(1);
    return result[0];
  }

  async createBaaSignature(data: schema.InsertBaaSignature): Promise<schema.BaaSignature> {
    const result = await db
      .insert(schema.baaSignatures)
      .values(data)
      .returning();
    return result[0];
  }

  async updateUserStripe(id: number, data: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripeCurrentPeriodEnd?: Date | null;
    stripeCancelAtPeriodEnd?: boolean;
    subscriptionStatus?: string;
  }): Promise<User | undefined> {
    const result = await db
      .update(schema.users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async deleteUserAdmin(id: number): Promise<boolean> {
    const result = await db.delete(schema.users).where(eq(schema.users.id, id)).returning();
    return result.length > 0;
  }

  async getPatientCountByUser(userId: number, clinicId?: number | null): Promise<number> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select({ cnt: count() })
      .from(schema.patients)
      .where(scopeCondition);
    return Number(result[0]?.cnt ?? 0);
  }

  // ── Patient operations ───────────────────────────────────────────────────────
  async getPatient(id: number, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select()
      .from(schema.patients)
      .where(and(eq(schema.patients.id, id), scopeCondition));
    return result[0];
  }

  async getAllPatients(userId: number, clinicId?: number | null): Promise<Patient[]> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    return await db
      .select()
      .from(schema.patients)
      .where(scopeCondition)
      .orderBy(desc(schema.patients.updatedAt));
  }

  async searchPatients(searchTerm: string, userId: number, gender?: string, clinicId?: number | null): Promise<Patient[]> {
    const searchPattern = `%${searchTerm}%`;
    const nameCondition = or(
      ilike(schema.patients.firstName, searchPattern),
      ilike(schema.patients.lastName, searchPattern)
    );
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    if (gender) {
      return await db
        .select()
        .from(schema.patients)
        .where(and(nameCondition, scopeCondition, eq(schema.patients.gender, gender)))
        .orderBy(desc(schema.patients.updatedAt));
    }
    return await db
      .select()
      .from(schema.patients)
      .where(and(nameCondition!, scopeCondition))
      .orderBy(desc(schema.patients.updatedAt));
  }

  async getPatientByName(firstName: string, lastName: string, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select()
      .from(schema.patients)
      .where(
        and(
          ilike(schema.patients.firstName, firstName),
          ilike(schema.patients.lastName, lastName),
          scopeCondition
        )
      );
    return result[0];
  }

  async getPatientByEmail(email: string, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .select()
      .from(schema.patients)
      .where(
        and(
          ilike(schema.patients.email, email),
          scopeCondition
        )
      );
    return result[0];
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const result = await db.insert(schema.patients).values(patient).returning();
    return result[0];
  }

  async updatePatient(id: number, patient: Partial<InsertPatient>, userId: number, clinicId?: number | null): Promise<Patient | undefined> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .update(schema.patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(and(eq(schema.patients.id, id), scopeCondition))
      .returning();
    return result[0];
  }

  async deletePatient(id: number, userId: number, clinicId?: number | null): Promise<boolean> {
    const scopeCondition = patientScopeCondition(userId, clinicId ?? null);
    const result = await db
      .delete(schema.patients)
      .where(and(eq(schema.patients.id, id), scopeCondition))
      .returning();
    return result.length > 0;
  }

  // ── Clinic management ────────────────────────────────────────────────────────
  async getClinicForUser(userId: number): Promise<schema.Clinic | undefined> {
    const membership = await db
      .select()
      .from(schema.clinicMemberships)
      .where(and(eq(schema.clinicMemberships.userId, userId), eq(schema.clinicMemberships.isActive, true)))
      .limit(1);
    if (!membership[0]) return undefined;
    const clinic = await db
      .select()
      .from(schema.clinics)
      .where(eq(schema.clinics.id, membership[0].clinicId))
      .limit(1);
    return clinic[0];
  }

  async getAllClinicsAdmin(): Promise<Array<schema.Clinic & { memberCount: number; patientCount: number; ownerEmail: string | null }>> {
    const allClinics = await db.select().from(schema.clinics).orderBy(schema.clinics.name);
    return await Promise.all(allClinics.map(async (c) => {
      const [memberRes, patientRes, adminRes] = await Promise.all([
        db.select({ cnt: count() }).from(schema.clinicMemberships).where(eq(schema.clinicMemberships.clinicId, c.id)),
        db.select({ cnt: count() }).from(schema.patients).where(eq(schema.patients.clinicId, c.id)),
        db.select({ email: schema.users.email })
          .from(schema.clinicMemberships)
          .innerJoin(schema.users, eq(schema.users.id, schema.clinicMemberships.userId))
          .where(and(
            eq(schema.clinicMemberships.clinicId, c.id),
            eq(schema.clinicMemberships.isPrimaryClinic, true),
          ))
          .limit(1),
      ]);
      return {
        ...c,
        memberCount: Number(memberRes[0]?.cnt ?? 0),
        patientCount: Number(patientRes[0]?.cnt ?? 0),
        ownerEmail: adminRes[0]?.email ?? null,
      };
    }));
  }

  async backfillPatientsToClinic(userId: number, clinicId: number): Promise<number> {
    // Stamp clinic_id on all patients owned by userId that don't yet have one
    const result = await db
      .update(schema.patients)
      .set({ clinicId, updatedAt: new Date() })
      .where(and(eq(schema.patients.userId, userId), isNull(schema.patients.clinicId)))
      .returning({ id: schema.patients.id });
    return result.length;
  }

  async addUserToClinic(clinicId: number, userId: number, role: string): Promise<schema.ClinicMembership> {
    const existing = await db
      .select()
      .from(schema.clinicMemberships)
      .where(and(eq(schema.clinicMemberships.clinicId, clinicId), eq(schema.clinicMemberships.userId, userId)));
    if (existing[0]) {
      const updated = await db
        .update(schema.clinicMemberships)
        .set({ role, isActive: true, updatedAt: new Date() })
        .where(eq(schema.clinicMemberships.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db
      .insert(schema.clinicMemberships)
      .values({ clinicId, userId, role, isActive: true, isPrimaryClinic: true })
      .returning();
    return inserted[0];
  }

  async getClinicMembers(clinicId: number): Promise<Array<schema.ClinicMembership & { userEmail: string; userName: string }>> {
    const members = await db
      .select()
      .from(schema.clinicMemberships)
      .where(eq(schema.clinicMemberships.clinicId, clinicId));
    return await Promise.all(members.map(async (m) => {
      const user = await db.select({ email: schema.users.email, firstName: schema.users.firstName, lastName: schema.users.lastName })
        .from(schema.users).where(eq(schema.users.id, m.userId)).limit(1);
      return {
        ...m,
        userEmail: user[0]?.email ?? "",
        userName: user[0] ? `${user[0].firstName} ${user[0].lastName}`.trim() : "",
      };
    }));
  }

  // ── Lab result operations ────────────────────────────────────────────────────
  async getLabResult(id: number): Promise<LabResult | undefined> {
    const result = await db.select().from(schema.labResults).where(eq(schema.labResults.id, id));
    return result[0];
  }

  async getLabResultsByPatient(patientId: number): Promise<LabResult[]> {
    return await db
      .select()
      .from(schema.labResults)
      .where(eq(schema.labResults.patientId, patientId))
      .orderBy(desc(schema.labResults.labDate));
  }

  async createLabResult(labResult: InsertLabResult): Promise<LabResult> {
    const result = await db.insert(schema.labResults).values(labResult as any).returning();
    return result[0];
  }

  async updateLabResult(id: number, labResult: Partial<InsertLabResult>): Promise<LabResult | undefined> {
    const result = await db
      .update(schema.labResults)
      .set({ ...labResult, updatedAt: new Date() } as any)
      .where(eq(schema.labResults.id, id))
      .returning();
    return result[0];
  }

  async deleteLabResult(id: number): Promise<boolean> {
    const result = await db
      .delete(schema.labResults)
      .where(eq(schema.labResults.id, id))
      .returning();
    return result.length > 0;
  }

  // ── Saved interpretation operations ─────────────────────────────────────────
  async getSavedInterpretation(id: number, userId: number): Promise<SavedInterpretation | undefined> {
    const result = await db
      .select()
      .from(schema.savedInterpretations)
      .where(and(eq(schema.savedInterpretations.id, id), eq(schema.savedInterpretations.userId, userId)));
    return result[0];
  }

  async getAllSavedInterpretations(userId: number, gender?: string): Promise<SavedInterpretation[]> {
    const userCondition = eq(schema.savedInterpretations.userId, userId);
    if (gender) {
      return await db
        .select()
        .from(schema.savedInterpretations)
        .where(and(userCondition, eq(schema.savedInterpretations.gender, gender)))
        .orderBy(desc(schema.savedInterpretations.createdAt));
    }
    return await db
      .select()
      .from(schema.savedInterpretations)
      .where(userCondition)
      .orderBy(desc(schema.savedInterpretations.createdAt));
  }

  async searchSavedInterpretations(searchTerm: string, userId: number, gender?: string): Promise<SavedInterpretation[]> {
    const searchPattern = `%${searchTerm}%`;
    const userCondition = eq(schema.savedInterpretations.userId, userId);
    if (gender) {
      return await db
        .select()
        .from(schema.savedInterpretations)
        .where(
          and(
            ilike(schema.savedInterpretations.patientName, searchPattern),
            userCondition,
            eq(schema.savedInterpretations.gender, gender)
          )
        )
        .orderBy(desc(schema.savedInterpretations.createdAt));
    }
    return await db
      .select()
      .from(schema.savedInterpretations)
      .where(and(ilike(schema.savedInterpretations.patientName, searchPattern), userCondition))
      .orderBy(desc(schema.savedInterpretations.createdAt));
  }

  async createSavedInterpretation(interpretation: InsertSavedInterpretation): Promise<SavedInterpretation> {
    const result = await db.insert(schema.savedInterpretations).values(interpretation as any).returning();
    return result[0];
  }

  async deleteSavedInterpretation(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(schema.savedInterpretations)
      .where(and(eq(schema.savedInterpretations.id, id), eq(schema.savedInterpretations.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── Patient portal account operations ────────────────────────────────────────
  async getPatientById(id: number): Promise<Patient | undefined> {
    const result = await db.select().from(schema.patients).where(eq(schema.patients.id, id));
    return result[0];
  }

  async getPatientByPhoneForClinician(phone: string, clinicianId: number): Promise<Patient | undefined> {
    // Normalize: strip non-digits so "+1 (555) 123-4567" matches "5551234567"
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length < 7) return undefined;
    const last10 = digits.slice(-10);
    const result = await db
      .select()
      .from(schema.patients)
      .where(and(
        eq(schema.patients.userId, clinicianId),
        sql`regexp_replace(coalesce(${schema.patients.phone}, ''), '\\D', '', 'g') LIKE ${'%' + last10}`,
      ))
      .limit(1);
    return result[0];
  }

  async getPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined> {
    const normalized = (email || "").trim().toLowerCase();
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(sql`LOWER(${schema.patientPortalAccounts.email}) = ${normalized}`);
    return result[0];
  }

  async getPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.patientId, patientId));
    return result[0];
  }

  async getPortalAccountByInviteToken(token: string): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.inviteToken, token));
    return result[0];
  }

  async getPortalAccountByResetToken(token: string): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.passwordResetToken, token));
    return result[0];
  }

  async createPortalAccount(account: InsertPatientPortalAccount): Promise<PatientPortalAccount> {
    const result = await db
      .insert(schema.patientPortalAccounts)
      .values(account as any)
      .returning();
    return result[0];
  }

  async updatePortalAccount(patientId: number, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .update(schema.patientPortalAccounts)
      .set(data as any)
      .where(eq(schema.patientPortalAccounts.patientId, patientId))
      .returning();
    return result[0];
  }

  // ── Published protocol operations ─────────────────────────────────────────────
  async publishProtocol(protocol: InsertPublishedProtocol): Promise<PublishedProtocol> {
    const result = await db
      .insert(schema.publishedProtocols)
      .values(protocol as any)
      .returning();
    return result[0];
  }

  async getLatestPublishedProtocol(patientId: number): Promise<PublishedProtocol | undefined> {
    const result = await db
      .select()
      .from(schema.publishedProtocols)
      .where(eq(schema.publishedProtocols.patientId, patientId))
      .orderBy(desc(schema.publishedProtocols.publishedAt))
      .limit(1);
    return result[0];
  }

  async getAllPublishedProtocols(patientId: number): Promise<PublishedProtocol[]> {
    return await db
      .select()
      .from(schema.publishedProtocols)
      .where(eq(schema.publishedProtocols.patientId, patientId))
      .orderBy(desc(schema.publishedProtocols.publishedAt));
  }

  async deleteProtocolsByLabResultId(labResultId: number): Promise<void> {
    await db
      .delete(schema.publishedProtocols)
      .where(eq(schema.publishedProtocols.labResultId, labResultId));
  }

  async markProtocolViewed(protocolId: number): Promise<void> {
    await db
      .update(schema.publishedProtocols)
      .set({ firstViewedAt: new Date() })
      .where(
        and(
          eq(schema.publishedProtocols.id, protocolId),
          isNull(schema.publishedProtocols.firstViewedAt),
        )
      );
  }

  // ── Portal message operations ─────────────────────────────────────────────────
  async getPortalMessages(patientId: number): Promise<PortalMessage[]> {
    return await db
      .select()
      .from(schema.portalMessages)
      .where(eq(schema.portalMessages.patientId, patientId))
      .orderBy(schema.portalMessages.createdAt);
  }

  async createPortalMessage(msg: InsertPortalMessage): Promise<PortalMessage> {
    const result = await db
      .insert(schema.portalMessages)
      .values(msg as any)
      .returning();
    return result[0];
  }

  async markPortalMessagesRead(patientId: number, readBySenderType: 'patient' | 'clinician'): Promise<void> {
    // Mark messages sent by the OTHER party as read (i.e. the reader is not the sender)
    const senderToMark = readBySenderType === 'patient' ? 'clinician' : 'patient';
    await db
      .update(schema.portalMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.portalMessages.patientId, patientId),
          eq(schema.portalMessages.senderType, senderToMark),
          isNull(schema.portalMessages.readAt)
        )
      );
  }

  async getUnreadPortalMessageCount(patientId: number, unreadBySenderType: 'patient' | 'clinician'): Promise<number> {
    // Count messages sent by the other party that haven't been read yet
    const senderToCount = unreadBySenderType === 'patient' ? 'clinician' : 'patient';
    const result = await db
      .select({ cnt: count() })
      .from(schema.portalMessages)
      .where(
        and(
          eq(schema.portalMessages.patientId, patientId),
          eq(schema.portalMessages.senderType, senderToCount),
          isNull(schema.portalMessages.readAt)
        )
      );
    return Number(result[0]?.cnt ?? 0);
  }

  async getPortalMessageByExternalId(externalMessageId: string): Promise<PortalMessage | undefined> {
    const result = await db
      .select()
      .from(schema.portalMessages)
      .where(eq(schema.portalMessages.externalMessageId, externalMessageId))
      .limit(1);
    return result[0];
  }

  // ── Clinician Staff ──────────────────────────────────────────────────────────
  async getClinicianStaffById(id: number): Promise<ClinicianStaff | undefined> {
    const result = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.id, id));
    return result[0];
  }

  async getClinicianStaffByEmail(email: string): Promise<ClinicianStaff | undefined> {
    const result = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.email, email.toLowerCase()));
    return result[0];
  }

  async getClinicianStaffByInviteToken(token: string): Promise<ClinicianStaff | undefined> {
    const result = await db.select().from(schema.clinicianStaff).where(eq(schema.clinicianStaff.inviteToken, token));
    return result[0];
  }

  async getAllStaffForClinician(clinicianId: number): Promise<ClinicianStaff[]> {
    return db.select().from(schema.clinicianStaff)
      .where(eq(schema.clinicianStaff.clinicianId, clinicianId))
      .orderBy(schema.clinicianStaff.createdAt);
  }

  async createClinicianStaff(data: Omit<InsertClinicianStaff, 'passwordHash'> & { passwordHash?: string | null }): Promise<ClinicianStaff> {
    const result = await db.insert(schema.clinicianStaff).values({
      ...data,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash ?? null,
    }).returning();
    return result[0];
  }

  async updateClinicianStaff(id: number, data: Partial<ClinicianStaff>): Promise<ClinicianStaff | undefined> {
    const result = await db.update(schema.clinicianStaff).set(data).where(eq(schema.clinicianStaff.id, id)).returning();
    return result[0];
  }

  async deleteClinicianStaff(id: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianStaff).where(eq(schema.clinicianStaff.id, id)).returning();
    return result.length > 0;
  }

  // ── Clinic Provider Invites ───────────────────────────────────────────────────
  async createClinicProviderInvite(data: schema.InsertClinicProviderInvite): Promise<schema.ClinicProviderInvite> {
    const result = await db.insert(schema.clinicProviderInvites).values(data).returning();
    return result[0];
  }

  async getClinicProviderInviteByToken(token: string): Promise<schema.ClinicProviderInvite | undefined> {
    const result = await db.select().from(schema.clinicProviderInvites)
      .where(eq(schema.clinicProviderInvites.inviteToken, token)).limit(1);
    return result[0];
  }

  async getClinicProviderInvites(clinicId: number): Promise<schema.ClinicProviderInvite[]> {
    return db.select().from(schema.clinicProviderInvites)
      .where(and(eq(schema.clinicProviderInvites.clinicId, clinicId), eq(schema.clinicProviderInvites.status, "pending")))
      .orderBy(desc(schema.clinicProviderInvites.createdAt));
  }

  async updateClinicProviderInviteStatus(id: number, status: string): Promise<void> {
    await db.update(schema.clinicProviderInvites).set({ status }).where(eq(schema.clinicProviderInvites.id, id));
  }

  async deleteClinicProviderInvite(id: number): Promise<boolean> {
    const result = await db.delete(schema.clinicProviderInvites).where(eq(schema.clinicProviderInvites.id, id)).returning();
    return result.length > 0;
  }

  // ── Saved Recipes ────────────────────────────────────────────────────────────
  async getSavedRecipes(patientId: number): Promise<SavedRecipe[]> {
    return db.select().from(schema.savedRecipes)
      .where(eq(schema.savedRecipes.patientId, patientId))
      .orderBy(desc(schema.savedRecipes.savedAt));
  }

  async saveRecipe(recipe: InsertSavedRecipe): Promise<SavedRecipe> {
    const result = await db.insert(schema.savedRecipes).values(recipe).returning();
    return result[0];
  }

  async deleteSavedRecipe(id: number, patientId: number): Promise<boolean> {
    const result = await db.delete(schema.savedRecipes)
      .where(and(eq(schema.savedRecipes.id, id), eq(schema.savedRecipes.patientId, patientId)))
      .returning();
    return result.length > 0;
  }

  // ── Supplement Orders ─────────────────────────────────────────────────────
  async createSupplementOrder(order: InsertSupplementOrder): Promise<SupplementOrder> {
    const result = await db.insert(schema.supplementOrders).values(order).returning();
    return result[0];
  }

  async getSupplementOrdersByPatient(patientId: number): Promise<SupplementOrder[]> {
    return db.select().from(schema.supplementOrders)
      .where(eq(schema.supplementOrders.patientId, patientId))
      .orderBy(desc(schema.supplementOrders.createdAt));
  }

  async getSupplementOrdersByClinicianPatient(clinicianId: number, patientId: number): Promise<SupplementOrder[]> {
    return db.select().from(schema.supplementOrders)
      .where(and(
        eq(schema.supplementOrders.clinicianId, clinicianId),
        eq(schema.supplementOrders.patientId, patientId),
      ))
      .orderBy(desc(schema.supplementOrders.createdAt));
  }

  async getPendingOrdersForClinician(clinicianId: number): Promise<Array<SupplementOrder & { patientFirstName: string; patientLastName: string }>> {
    const rows = await db
      .select({
        id: schema.supplementOrders.id,
        patientId: schema.supplementOrders.patientId,
        clinicianId: schema.supplementOrders.clinicianId,
        items: schema.supplementOrders.items,
        subtotal: schema.supplementOrders.subtotal,
        status: schema.supplementOrders.status,
        patientNotes: schema.supplementOrders.patientNotes,
        createdAt: schema.supplementOrders.createdAt,
        patientFirstName: schema.patients.firstName,
        patientLastName: schema.patients.lastName,
      })
      .from(schema.supplementOrders)
      .innerJoin(schema.patients, eq(schema.supplementOrders.patientId, schema.patients.id))
      .where(and(
        eq(schema.supplementOrders.clinicianId, clinicianId),
        eq(schema.supplementOrders.status, 'pending'),
      ))
      .orderBy(desc(schema.supplementOrders.createdAt));
    return rows;
  }

  async updateSupplementOrderStatus(orderId: number, clinicianId: number, status: string): Promise<SupplementOrder | undefined> {
    const result = await db.update(schema.supplementOrders)
      .set({ status })
      .where(and(eq(schema.supplementOrders.id, orderId), eq(schema.supplementOrders.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async getUnreadMessageSummaryForClinician(clinicianId: number): Promise<Array<{ patientId: number; patientFirstName: string; patientLastName: string; count: number; lastAt: string }>> {
    const rows = await db.execute(sql`
      SELECT
        p.id          AS patient_id,
        p.first_name  AS patient_first_name,
        p.last_name   AS patient_last_name,
        COUNT(pm.id)::int  AS count,
        MAX(pm.created_at)::text AS last_at
      FROM portal_messages pm
      JOIN patients p ON pm.patient_id = p.id
      WHERE p.user_id = ${clinicianId}
        AND pm.sender_type = 'patient'
        AND pm.read_at IS NULL
      GROUP BY p.id, p.first_name, p.last_name
      ORDER BY last_at DESC
    `);
    return (rows.rows as any[]).map(r => ({
      patientId: Number(r.patient_id),
      patientFirstName: r.patient_first_name as string,
      patientLastName: r.patient_last_name as string,
      count: Number(r.count),
      lastAt: r.last_at as string,
    }));
  }

  // ── Clinician Supplement Settings ───────────────────────────────────────────
  async getClinicianSupplementSettings(clinicianId: number): Promise<ClinicianSupplementSettings | undefined> {
    const result = await db.select().from(schema.clinicianSupplementSettings).where(eq(schema.clinicianSupplementSettings.clinicianId, clinicianId));
    return result[0];
  }

  async upsertClinicianSupplementSettings(clinicianId: number, data: Partial<InsertClinicianSupplementSettings>): Promise<ClinicianSupplementSettings> {
    const existing = await this.getClinicianSupplementSettings(clinicianId);
    if (existing) {
      const result = await db.update(schema.clinicianSupplementSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.clinicianSupplementSettings.clinicianId, clinicianId))
        .returning();
      return result[0];
    }
    const result = await db.insert(schema.clinicianSupplementSettings)
      .values({ clinicianId, ...data } as InsertClinicianSupplementSettings)
      .returning();
    return result[0];
  }

  // ── Clinician Supplement Library ─────────────────────────────────────────────
  async getClinicianSupplements(clinicianId: number): Promise<ClinicianSupplement[]> {
    return db.select().from(schema.clinicianSupplements)
      .where(eq(schema.clinicianSupplements.clinicianId, clinicianId))
      .orderBy(schema.clinicianSupplements.sortOrder, schema.clinicianSupplements.name);
  }

  async getClinicianSupplement(id: number, clinicianId: number): Promise<ClinicianSupplement | undefined> {
    const result = await db.select().from(schema.clinicianSupplements)
      .where(and(eq(schema.clinicianSupplements.id, id), eq(schema.clinicianSupplements.clinicianId, clinicianId)));
    return result[0];
  }

  async createClinicianSupplement(supplement: InsertClinicianSupplement): Promise<ClinicianSupplement> {
    const result = await db.insert(schema.clinicianSupplements).values(supplement).returning();
    return result[0];
  }

  async updateClinicianSupplement(id: number, clinicianId: number, data: Partial<InsertClinicianSupplement>): Promise<ClinicianSupplement | undefined> {
    const result = await db.update(schema.clinicianSupplements)
      .set(data)
      .where(and(eq(schema.clinicianSupplements.id, id), eq(schema.clinicianSupplements.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteClinicianSupplement(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianSupplements)
      .where(and(eq(schema.clinicianSupplements.id, id), eq(schema.clinicianSupplements.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinician Supplement Rules ───────────────────────────────────────────────
  async getClinicianSupplementRules(supplementId: number, clinicianId: number): Promise<ClinicianSupplementRule[]> {
    return db.select().from(schema.clinicianSupplementRules)
      .where(and(
        eq(schema.clinicianSupplementRules.supplementId, supplementId),
        eq(schema.clinicianSupplementRules.clinicianId, clinicianId)
      ))
      .orderBy(schema.clinicianSupplementRules.priority);
  }

  async getAllClinicianSupplementRules(clinicianId: number): Promise<ClinicianSupplementRule[]> {
    return db.select().from(schema.clinicianSupplementRules)
      .where(eq(schema.clinicianSupplementRules.clinicianId, clinicianId));
  }

  async createClinicianSupplementRule(rule: InsertClinicianSupplementRule): Promise<ClinicianSupplementRule> {
    const result = await db.insert(schema.clinicianSupplementRules).values(rule).returning();
    return result[0];
  }

  async updateClinicianSupplementRule(id: number, clinicianId: number, data: Partial<InsertClinicianSupplementRule>): Promise<ClinicianSupplementRule | undefined> {
    const result = await db.update(schema.clinicianSupplementRules)
      .set(data)
      .where(and(eq(schema.clinicianSupplementRules.id, id), eq(schema.clinicianSupplementRules.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteClinicianSupplementRule(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianSupplementRules)
      .where(and(eq(schema.clinicianSupplementRules.id, id), eq(schema.clinicianSupplementRules.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinician Lab Preferences ────────────────────────────────────────────────
  async getClinicianLabPreferences(clinicianId: number): Promise<ClinicianLabPreference[]> {
    return db.select().from(schema.clinicianLabPreferences)
      .where(eq(schema.clinicianLabPreferences.clinicianId, clinicianId))
      .orderBy(schema.clinicianLabPreferences.markerKey);
  }

  async getClinicianLabPreference(clinicianId: number, markerKey: string, gender: string): Promise<ClinicianLabPreference | undefined> {
    const result = await db.select().from(schema.clinicianLabPreferences)
      .where(and(
        eq(schema.clinicianLabPreferences.clinicianId, clinicianId),
        eq(schema.clinicianLabPreferences.markerKey, markerKey),
        eq(schema.clinicianLabPreferences.gender, gender)
      ));
    return result[0];
  }

  async upsertClinicianLabPreference(clinicianId: number, data: InsertClinicianLabPreference): Promise<ClinicianLabPreference> {
    const existing = await this.getClinicianLabPreference(clinicianId, data.markerKey, data.gender ?? 'both');
    if (existing) {
      const result = await db.update(schema.clinicianLabPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.clinicianLabPreferences.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(schema.clinicianLabPreferences).values({ ...data, clinicianId }).returning();
    return result[0];
  }

  async deleteClinicianLabPreference(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.clinicianLabPreferences)
      .where(and(eq(schema.clinicianLabPreferences.id, id), eq(schema.clinicianLabPreferences.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  // ── Clinical Encounters ──────────────────────────────────────────────────────
  async getEncountersByClinicianId(clinicianId: number, patientId?: number, clinicId?: number | null): Promise<(ClinicalEncounter & { patientName: string })[]> {
    // Clinic-scoped: any provider in the clinic sees all clinic encounters.
    // Legacy fallback: if no clinicId, only the originating clinician sees them.
    const scope = clinicId
      ? or(
          eq(schema.clinicalEncounters.clinicId, clinicId),
          and(eq(schema.clinicalEncounters.clinicianId, clinicianId), isNull(schema.clinicalEncounters.clinicId))
        )
      : eq(schema.clinicalEncounters.clinicianId, clinicianId);
    const rows = await db
      .select({
        id: schema.clinicalEncounters.id,
        clinicianId: schema.clinicalEncounters.clinicianId,
        patientId: schema.clinicalEncounters.patientId,
        visitDate: schema.clinicalEncounters.visitDate,
        visitType: schema.clinicalEncounters.visitType,
        chiefComplaint: schema.clinicalEncounters.chiefComplaint,
        transcription: schema.clinicalEncounters.transcription,
        audioProcessed: schema.clinicalEncounters.audioProcessed,
        linkedLabResultId: schema.clinicalEncounters.linkedLabResultId,
        soapNote: schema.clinicalEncounters.soapNote,
        soapGeneratedAt: schema.clinicalEncounters.soapGeneratedAt,
        patientSummary: schema.clinicalEncounters.patientSummary,
        summaryPublished: schema.clinicalEncounters.summaryPublished,
        summaryPublishedAt: schema.clinicalEncounters.summaryPublishedAt,
        clinicianNotes: schema.clinicalEncounters.clinicianNotes,
        signedAt: schema.clinicalEncounters.signedAt,
        signedBy: schema.clinicalEncounters.signedBy,
        isAmended: schema.clinicalEncounters.isAmended,
        amendedAt: schema.clinicalEncounters.amendedAt,
        createdAt: schema.clinicalEncounters.createdAt,
        updatedAt: schema.clinicalEncounters.updatedAt,
        patientName: sql<string>`${schema.patients.firstName} || ' ' || ${schema.patients.lastName}`,
      })
      .from(schema.clinicalEncounters)
      .innerJoin(schema.patients, eq(schema.clinicalEncounters.patientId, schema.patients.id))
      .where(
        patientId
          ? and(scope, eq(schema.clinicalEncounters.patientId, patientId))
          : scope
      )
      .orderBy(desc(schema.clinicalEncounters.visitDate));
    return rows as (ClinicalEncounter & { patientName: string })[];
  }

  async getEncounter(id: number, clinicianId: number, clinicId?: number | null): Promise<ClinicalEncounter | undefined> {
    const scope = clinicId
      ? or(
          eq(schema.clinicalEncounters.clinicId, clinicId),
          and(eq(schema.clinicalEncounters.clinicianId, clinicianId), isNull(schema.clinicalEncounters.clinicId))
        )
      : eq(schema.clinicalEncounters.clinicianId, clinicianId);
    const result = await db.select().from(schema.clinicalEncounters)
      .where(and(eq(schema.clinicalEncounters.id, id), scope));
    return result[0];
  }

  async createEncounter(data: InsertClinicalEncounter): Promise<ClinicalEncounter> {
    const result = await db.insert(schema.clinicalEncounters).values(data).returning();
    return result[0];
  }

  async updateEncounter(id: number, clinicianId: number, data: any, _clinicId?: number | null): Promise<ClinicalEncounter | undefined> {
    // Edit/amend access is restricted to the encounter's original author, even
    // for clinic-shared encounters. Other providers can view but not modify.
    const result = await db.update(schema.clinicalEncounters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.clinicalEncounters.id, id), eq(schema.clinicalEncounters.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteEncounter(id: number, clinicianId: number, _clinicId?: number | null): Promise<boolean> {
    // Deletion is restricted to the encounter's original author.
    const result = await db.delete(schema.clinicalEncounters)
      .where(and(eq(schema.clinicalEncounters.id, id), eq(schema.clinicalEncounters.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }

  async getPublishedEncountersByPatient(patientId: number): Promise<Pick<ClinicalEncounter, 'id' | 'visitDate' | 'visitType' | 'chiefComplaint' | 'patientSummary' | 'summaryPublishedAt'>[]> {
    const result = await db
      .select({
        id: schema.clinicalEncounters.id,
        visitDate: schema.clinicalEncounters.visitDate,
        visitType: schema.clinicalEncounters.visitType,
        chiefComplaint: schema.clinicalEncounters.chiefComplaint,
        patientSummary: schema.clinicalEncounters.patientSummary,
        summaryPublishedAt: schema.clinicalEncounters.summaryPublishedAt,
      })
      .from(schema.clinicalEncounters)
      .where(and(
        eq(schema.clinicalEncounters.patientId, patientId),
        eq(schema.clinicalEncounters.summaryPublished, true)
      ))
      .orderBy(desc(schema.clinicalEncounters.visitDate));
    return result;
  }

  // ── Appointments (Boulevard sync via Zapier) ─────────────────────────────────
  async upsertAppointment(userId: number, boulevardId: string, data: Omit<schema.InsertAppointment, 'userId' | 'boulevardAppointmentId'>): Promise<schema.Appointment> {
    const existing = await db
      .select()
      .from(schema.appointments)
      .where(and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.boulevardAppointmentId, boulevardId)
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db
        .update(schema.appointments)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.appointments.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(schema.appointments)
      .values({ userId, boulevardAppointmentId: boulevardId, ...data })
      .returning();
    return created;
  }

  async cancelAppointment(userId: number, boulevardId: string): Promise<void> {
    await db
      .update(schema.appointments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.boulevardAppointmentId, boulevardId)
      ));
  }

  async getAppointmentsByUserId(userId: number): Promise<schema.Appointment[]> {
    return db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.userId, userId))
      .orderBy(schema.appointments.appointmentStart);
  }

  async getAppointmentsByPatientEmail(email: string, userId: number): Promise<schema.Appointment[]> {
    return db
      .select()
      .from(schema.appointments)
      .where(and(
        eq(schema.appointments.userId, userId),
        eq(schema.appointments.patientEmail, email)
      ))
      .orderBy(schema.appointments.appointmentStart);
  }

  async getAppointmentsByPatientId(patientId: number): Promise<schema.Appointment[]> {
    return db
      .select()
      .from(schema.appointments)
      .where(eq(schema.appointments.patientId, patientId))
      .orderBy(schema.appointments.appointmentStart);
  }

  async matchAppointmentToPatient(appointmentId: number, patientId: number): Promise<void> {
    await db
      .update(schema.appointments)
      .set({ patientId, updatedAt: new Date() })
      .where(eq(schema.appointments.id, appointmentId));
  }

  async getAppointmentsByClinicAndRange(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.Appointment[]> {
    const conds = [
      eq(schema.appointments.clinicId, clinicId),
      sql`${schema.appointments.appointmentStart} >= ${start}`,
      sql`${schema.appointments.appointmentStart} < ${end}`,
    ];
    if (providerId) conds.push(eq(schema.appointments.providerId, providerId));
    return db.select().from(schema.appointments).where(and(...conds)).orderBy(schema.appointments.appointmentStart);
  }

  async getAppointmentById(id: number): Promise<schema.Appointment | null> {
    const [row] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id)).limit(1);
    return row ?? null;
  }

  async createNativeAppointment(data: schema.InsertAppointment): Promise<schema.Appointment> {
    const [row] = await db.insert(schema.appointments).values({ ...data, source: "native" }).returning();
    return row;
  }

  async updateNativeAppointment(id: number, clinicId: number, data: Partial<schema.InsertAppointment>): Promise<schema.Appointment | null> {
    const [row] = await db
      .update(schema.appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.clinicId, clinicId),
        eq(schema.appointments.source, "native"),
      ))
      .returning();
    return row ?? null;
  }

  async deleteNativeAppointment(id: number, clinicId: number): Promise<boolean> {
    const result = await db
      .delete(schema.appointments)
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.clinicId, clinicId),
        eq(schema.appointments.source, "native"),
      ))
      .returning();
    return result.length > 0;
  }

  async markAppointmentReminderSent(id: number): Promise<void> {
    await db
      .update(schema.appointments)
      .set({ reminderSentAt: new Date() })
      .where(eq(schema.appointments.id, id));
  }

  async getAppointmentsNeedingReminder(now: Date, hoursAhead: number): Promise<schema.Appointment[]> {
    const horizon = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    return db
      .select()
      .from(schema.appointments)
      .where(and(
        isNull(schema.appointments.reminderSentAt),
        sql`${schema.appointments.appointmentStart} >= ${now}`,
        sql`${schema.appointments.appointmentStart} <= ${horizon}`,
        sql`${schema.appointments.status} NOT IN ('cancelled','no_show')`,
      ));
  }

  async detectAppointmentConflict(providerId: number, start: Date, end: Date, excludeId?: number): Promise<boolean> {
    const conds = [
      eq(schema.appointments.providerId, providerId),
      sql`${schema.appointments.status} NOT IN ('cancelled','no_show')`,
      sql`${schema.appointments.appointmentStart} < ${end}`,
      sql`COALESCE(${schema.appointments.appointmentEnd}, ${schema.appointments.appointmentStart} + INTERVAL '30 minutes') > ${start}`,
    ];
    if (excludeId) conds.push(sql`${schema.appointments.id} <> ${excludeId}`);
    const rows = await db.select({ id: schema.appointments.id }).from(schema.appointments).where(and(...conds)).limit(1);
    return rows.length > 0;
  }

  // ── Appointment Types ─────────────────────────────────────────────────────────
  async getAppointmentTypes(clinicId: number, includeInactive = false): Promise<schema.AppointmentType[]> {
    const conds = [eq(schema.appointmentTypes.clinicId, clinicId)];
    if (!includeInactive) conds.push(eq(schema.appointmentTypes.isActive, true));
    return db.select().from(schema.appointmentTypes).where(and(...conds)).orderBy(schema.appointmentTypes.name);
  }

  async getAppointmentTypeById(id: number, clinicId: number): Promise<schema.AppointmentType | null> {
    const [row] = await db.select().from(schema.appointmentTypes)
      .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.clinicId, clinicId)))
      .limit(1);
    return row ?? null;
  }

  async createAppointmentType(data: schema.InsertAppointmentType): Promise<schema.AppointmentType> {
    const [row] = await db.insert(schema.appointmentTypes).values(data).returning();
    return row;
  }

  async updateAppointmentType(id: number, clinicId: number, data: Partial<schema.InsertAppointmentType>): Promise<schema.AppointmentType | null> {
    const [row] = await db.update(schema.appointmentTypes)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async deleteAppointmentType(id: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.appointmentTypes)
      .where(and(eq(schema.appointmentTypes.id, id), eq(schema.appointmentTypes.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  // ── Provider Availability ─────────────────────────────────────────────────────
  async getProviderAvailability(clinicId: number, providerId?: number | null): Promise<schema.ProviderAvailability[]> {
    const conds = [eq(schema.providerAvailability.clinicId, clinicId), eq(schema.providerAvailability.isActive, true)];
    if (providerId) conds.push(eq(schema.providerAvailability.providerId, providerId));
    return db.select().from(schema.providerAvailability).where(and(...conds))
      .orderBy(schema.providerAvailability.providerId, schema.providerAvailability.dayOfWeek, schema.providerAvailability.startTime);
  }

  async createProviderAvailability(data: schema.InsertProviderAvailability): Promise<schema.ProviderAvailability> {
    const [row] = await db.insert(schema.providerAvailability).values(data).returning();
    return row;
  }

  async updateProviderAvailability(id: number, clinicId: number, data: Partial<schema.InsertProviderAvailability>): Promise<schema.ProviderAvailability | null> {
    const [row] = await db.update(schema.providerAvailability)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.providerAvailability.id, id), eq(schema.providerAvailability.clinicId, clinicId)))
      .returning();
    return row ?? null;
  }

  async deleteProviderAvailability(id: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.providerAvailability)
      .where(and(eq(schema.providerAvailability.id, id), eq(schema.providerAvailability.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  // ── Calendar Blocks (time-off, breaks) ────────────────────────────────────────
  async getCalendarBlocks(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.CalendarBlock[]> {
    const conds = [
      eq(schema.calendarBlocks.clinicId, clinicId),
      sql`${schema.calendarBlocks.startAt} < ${end}`,
      sql`${schema.calendarBlocks.endAt} > ${start}`,
    ];
    if (providerId) conds.push(eq(schema.calendarBlocks.providerId, providerId));
    return db.select().from(schema.calendarBlocks).where(and(...conds)).orderBy(schema.calendarBlocks.startAt);
  }

  async createCalendarBlock(data: schema.InsertCalendarBlock): Promise<schema.CalendarBlock> {
    const [row] = await db.insert(schema.calendarBlocks).values(data).returning();
    return row;
  }

  async deleteCalendarBlock(id: number, clinicId: number): Promise<boolean> {
    const result = await db.delete(schema.calendarBlocks)
      .where(and(eq(schema.calendarBlocks.id, id), eq(schema.calendarBlocks.clinicId, clinicId)))
      .returning();
    return result.length > 0;
  }

  async getProvidersByClinic(clinicId: number, includeInactive = false): Promise<schema.Provider[]> {
    const conds = [eq(schema.providers.clinicId, clinicId)];
    if (!includeInactive) conds.push(eq(schema.providers.isActive, true));
    return db.select().from(schema.providers).where(and(...conds)).orderBy(schema.providers.displayName);
  }

  // ── Patient Chart ─────────────────────────────────────────────────────────────
  async getPatientChart(patientId: number, clinicianId: number): Promise<schema.PatientChart | null> {
    const [row] = await db
      .select()
      .from(schema.patientCharts)
      .where(and(
        eq(schema.patientCharts.patientId, patientId),
        eq(schema.patientCharts.clinicianId, clinicianId),
      ))
      .limit(1);
    return row ?? null;
  }

  async upsertPatientChart(
    patientId: number,
    clinicianId: number,
    data: Partial<Omit<schema.PatientChart, 'id' | 'patientId' | 'clinicianId' | 'updatedAt'>>,
  ): Promise<schema.PatientChart> {
    const existing = await this.getPatientChart(patientId, clinicianId);
    const now = new Date();
    if (existing) {
      const [updated] = await db
        .update(schema.patientCharts)
        .set({ ...data, updatedAt: now })
        .where(eq(schema.patientCharts.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(schema.patientCharts)
        .values({ patientId, clinicianId, ...data, updatedAt: now })
        .returning();
      return created;
    }
  }

  // ── Medication Dictionary ────────────────────────────────────────────────────
  async getMedicationDictionaries(clinicianId: number): Promise<schema.MedicationDictionary[]> {
    return db
      .select()
      .from(schema.medicationDictionaries)
      .where(eq(schema.medicationDictionaries.clinicianId, clinicianId))
      .orderBy(desc(schema.medicationDictionaries.uploadedAt));
  }

  async createMedicationDictionary(data: schema.InsertMedicationDictionary): Promise<schema.MedicationDictionary> {
    const [row] = await db.insert(schema.medicationDictionaries).values(data).returning();
    return row;
  }

  async deleteMedicationDictionary(id: number, clinicianId: number): Promise<boolean> {
    const result = await db
      .delete(schema.medicationDictionaries)
      .where(and(
        eq(schema.medicationDictionaries.id, id),
        eq(schema.medicationDictionaries.clinicianId, clinicianId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async createMedicationEntries(entries: schema.InsertMedicationEntry[]): Promise<void> {
    if (!entries.length) return;
    for (let i = 0; i < entries.length; i += 100) {
      await db.insert(schema.medicationEntries).values(entries.slice(i, i + 100));
    }
  }

  async getAllMedicationEntries(clinicianId: number): Promise<schema.MedicationEntry[]> {
    const dbEntries = await db
      .select()
      .from(schema.medicationEntries)
      .where(eq(schema.medicationEntries.clinicianId, clinicianId));

    // Merge system seed entries — clinician DB entries take precedence for same generic name
    const dbNames = new Set(dbEntries.map(e => e.genericName.toLowerCase()));
    const seedEntries = getSeedAsEntries()
      .filter(s => !dbNames.has(s.genericName.toLowerCase()))
      .map(s => ({
        id: s.id,
        dictionaryId: s.dictionaryId,
        clinicianId: clinicianId,
        genericName: s.genericName,
        brandNames: s.brandNames,
        commonSpokenVariants: s.commonSpokenVariants,
        commonMisspellings: s.commonMisspellings,
        drugClass: s.drugClass,
        subclass: s.subclass,
        route: s.route,
        notes: s.notes,
      })) as schema.MedicationEntry[];

    return [...dbEntries, ...seedEntries];
  }

  async updateMedicationDictionaryCount(id: number, count: number): Promise<void> {
    await db
      .update(schema.medicationDictionaries)
      .set({ entryCount: count })
      .where(eq(schema.medicationDictionaries.id, id));
  }

  async getOrCreateManualDictionary(clinicianId: number): Promise<schema.MedicationDictionary> {
    const existing = await db
      .select()
      .from(schema.medicationDictionaries)
      .where(and(
        eq(schema.medicationDictionaries.clinicianId, clinicianId),
        eq(schema.medicationDictionaries.filename, "__manual__")
      ))
      .limit(1);
    if (existing.length) return existing[0];
    const [created] = await db
      .insert(schema.medicationDictionaries)
      .values({ clinicianId, filename: "__manual__", entryCount: 0 })
      .returning();
    return created;
  }

  async addSingleMedicationEntry(entry: schema.InsertMedicationEntry): Promise<schema.MedicationEntry> {
    const [row] = await db.insert(schema.medicationEntries).values(entry).returning();
    await db
      .update(schema.medicationDictionaries)
      .set({ entryCount: sql`entry_count + 1` })
      .where(eq(schema.medicationDictionaries.id, entry.dictionaryId));
    return row;
  }

  async updateMedicationEntryAliases(
    id: number,
    clinicianId: number,
    fields: Partial<Pick<schema.MedicationEntry, "brandNames" | "commonSpokenVariants" | "commonMisspellings" | "drugClass" | "subclass" | "route" | "notes">>
  ): Promise<schema.MedicationEntry | null> {
    const [updated] = await db
      .update(schema.medicationEntries)
      .set(fields)
      .where(and(
        eq(schema.medicationEntries.id, id),
        eq(schema.medicationEntries.clinicianId, clinicianId)
      ))
      .returning();
    return updated ?? null;
  }

  async deleteMedicationEntry(id: number, clinicianId: number): Promise<boolean> {
    const entry = await db
      .select()
      .from(schema.medicationEntries)
      .where(and(
        eq(schema.medicationEntries.id, id),
        eq(schema.medicationEntries.clinicianId, clinicianId)
      ))
      .limit(1);
    if (!entry.length) return false;
    const dictId = entry[0].dictionaryId;
    await db.delete(schema.medicationEntries).where(and(
      eq(schema.medicationEntries.id, id),
      eq(schema.medicationEntries.clinicianId, clinicianId)
    ));
    await db
      .update(schema.medicationDictionaries)
      .set({ entryCount: sql`GREATEST(entry_count - 1, 0)` })
      .where(eq(schema.medicationDictionaries.id, dictId));
    return true;
  }

  // ─── Intake Forms (raw SQL — production DB may lack clinic_id column) ───────

  async getIntakeForms(clinicianId: number): Promise<schema.IntakeForm[]> {
    const result = await db.execute(sql`SELECT * FROM intake_forms WHERE clinician_id = ${clinicianId} ORDER BY updated_at DESC`);
    return rawRows(result) as schema.IntakeForm[];
  }

  async getIntakeFormsByClinic(clinicId: number): Promise<schema.IntakeForm[]> {
    try {
      const result = await db.execute(sql`SELECT * FROM intake_forms WHERE clinic_id = ${clinicId} ORDER BY updated_at DESC`);
      return rawRows(result) as schema.IntakeForm[];
    } catch {
      return [];
    }
  }

  async getIntakeFormsByClinicOrClinician(clinicId: number | null, clinicianId: number): Promise<schema.IntakeForm[]> {
    if (clinicId) {
      try {
        const result = await db.execute(sql`SELECT * FROM intake_forms WHERE clinic_id = ${clinicId} OR clinician_id = ${clinicianId} ORDER BY updated_at DESC`);
        return rawRows(result) as schema.IntakeForm[];
      } catch {
        return this.getIntakeForms(clinicianId);
      }
    }
    return this.getIntakeForms(clinicianId);
  }

  async getIntakeForm(id: number, clinicianId: number): Promise<schema.IntakeForm | undefined> {
    const result = await db.execute(sql`SELECT * FROM intake_forms WHERE id = ${id} AND clinician_id = ${clinicianId} LIMIT 1`);
    return rawRows(result)[0] as schema.IntakeForm | undefined;
  }

  async getIntakeFormByIdAndClinic(id: number, clinicId: number | null, clinicianId: number): Promise<schema.IntakeForm | undefined> {
    if (clinicId) {
      try {
        const result = await db.execute(sql`SELECT * FROM intake_forms WHERE id = ${id} AND (clinic_id = ${clinicId} OR clinician_id = ${clinicianId}) LIMIT 1`);
        const row = rawRows(result)[0];
        if (row) return row as schema.IntakeForm;
      } catch { /* fall through to clinician-only */ }
    }
    return this.getIntakeForm(id, clinicianId);
  }

  async getIntakeFormById(id: number): Promise<schema.IntakeForm | undefined> {
    const result = await db.execute(sql`SELECT * FROM intake_forms WHERE id = ${id} LIMIT 1`);
    return rawRows(result)[0] as schema.IntakeForm | undefined;
  }

  async createIntakeForm(data: schema.InsertIntakeForm): Promise<schema.IntakeForm> {
    try {
      const result = await db.execute(sql`
        INSERT INTO intake_forms (clinician_id, clinic_id, name, description, category, version, status,
          allow_link, allow_embed, allow_tablet, is_public, requires_patient_signature, requires_staff_signature, expiration_type)
        VALUES (${data.clinicianId}, ${data.clinicId ?? null}, ${data.name}, ${data.description ?? null}, ${data.category ?? 'custom'}, ${data.version ?? 1}, ${data.status ?? 'draft'},
          ${data.allowLink ?? true}, ${data.allowEmbed ?? true}, ${data.allowTablet ?? true}, ${data.isPublic ?? false}, ${data.requiresPatientSignature ?? false}, ${data.requiresStaffSignature ?? false}, ${data.expirationType ?? 'none'})
        RETURNING *`);
      return rawRows(result)[0] as schema.IntakeForm;
    } catch (err: any) {
      if (err?.message?.includes('clinic_id')) {
        const result = await db.execute(sql`
          INSERT INTO intake_forms (clinician_id, name, description, category, version, status,
            allow_link, allow_embed, allow_tablet, is_public, requires_patient_signature, requires_staff_signature, expiration_type)
          VALUES (${data.clinicianId}, ${data.name}, ${data.description ?? null}, ${data.category ?? 'custom'}, ${data.version ?? 1}, ${data.status ?? 'draft'},
            ${data.allowLink ?? true}, ${data.allowEmbed ?? true}, ${data.allowTablet ?? true}, ${data.isPublic ?? false}, ${data.requiresPatientSignature ?? false}, ${data.requiresStaffSignature ?? false}, ${data.expirationType ?? 'none'})
          RETURNING *`);
        return rawRows(result)[0] as schema.IntakeForm;
      }
      throw err;
    }
  }

  async updateIntakeForm(id: number, clinicianId: number, data: Partial<schema.InsertIntakeForm>): Promise<schema.IntakeForm | undefined> {
    return this.updateIntakeFormByClinic(id, null, clinicianId, data);
  }

  async updateIntakeFormByClinic(id: number, clinicId: number | null, clinicianId: number, data: Partial<schema.InsertIntakeForm>): Promise<schema.IntakeForm | undefined> {
    const setClauses: string[] = [];
    const values: any[] = [];
    const fieldMap: Record<string, string> = {
      name: 'name', description: 'description', category: 'category', version: 'version',
      status: 'status', brandingJson: 'branding_json', settingsJson: 'settings_json',
      requiresPatientSignature: 'requires_patient_signature', requiresStaffSignature: 'requires_staff_signature',
      allowLink: 'allow_link', allowEmbed: 'allow_embed', allowTablet: 'allow_tablet',
      isPublic: 'is_public', expirationType: 'expiration_type', expirationIntervalDays: 'expiration_interval_days',
      slug: 'slug',
      ghlWebhookUrl: 'ghl_webhook_url', ghlWebhookEnabled: 'ghl_webhook_enabled',
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        let val = (data as any)[key];
        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
          val = JSON.stringify(val);
        }
        setClauses.push(`${col} = $${values.length + 1}`);
        values.push(val);
      }
    }
    setClauses.push(`updated_at = NOW()`);
    if (setClauses.length <= 1) return undefined;
    const setStr = setClauses.join(', ');
    values.push(id, clinicianId);
    const queryStr = `UPDATE intake_forms SET ${setStr} WHERE id = $${values.length - 1} AND clinician_id = $${values.length} RETURNING *`;
    let result;
    try {
      result = await pool.query(queryStr, values);
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      // Self-heal: if the GHL webhook columns are missing in prod, add them and retry once.
      if (msg.includes('ghl_webhook_url') || msg.includes('ghl_webhook_enabled')) {
        console.warn('[updateIntakeFormByClinic] adding missing ghl_webhook_* columns and retrying');
        await pool.query(`ALTER TABLE intake_forms
          ADD COLUMN IF NOT EXISTS ghl_webhook_url TEXT,
          ADD COLUMN IF NOT EXISTS ghl_webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
        result = await pool.query(queryStr, values);
      } else {
        throw err;
      }
    }
    return result.rows.map(mapRow)[0] as schema.IntakeForm | undefined;
  }

  async deleteIntakeForm(id: number, clinicianId: number): Promise<boolean> {
    return this.deleteIntakeFormByClinic(id, null, clinicianId);
  }

  async deleteIntakeFormByClinic(id: number, clinicId: number | null, clinicianId: number): Promise<boolean> {
    const result = await db.execute(sql`DELETE FROM intake_forms WHERE id = ${id} AND clinician_id = ${clinicianId}`);
    return ((result as any).rowCount ?? 0) > 0;
  }

  // ─── Form Sections ──────────────────────────────────────────────────────────

  async getFormSections(formId: number): Promise<schema.FormSection[]> {
    return db.select().from(schema.formSections)
      .where(eq(schema.formSections.formId, formId))
      .orderBy(schema.formSections.orderIndex);
  }

  async createFormSection(data: schema.InsertFormSection): Promise<schema.FormSection> {
    const [row] = await db.insert(schema.formSections).values(data).returning();
    return row;
  }

  async updateFormSection(id: number, data: Partial<schema.InsertFormSection>): Promise<schema.FormSection | undefined> {
    const [row] = await db.update(schema.formSections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.formSections.id, id))
      .returning();
    return row;
  }

  async deleteFormSection(id: number): Promise<boolean> {
    const result = await db.delete(schema.formSections).where(eq(schema.formSections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Form Fields ────────────────────────────────────────────────────────────

  async getFormFields(formId: number): Promise<schema.FormField[]> {
    return db.select().from(schema.formFields)
      .where(eq(schema.formFields.formId, formId))
      .orderBy(schema.formFields.orderIndex);
  }

  async createFormField(data: schema.InsertFormField): Promise<schema.FormField> {
    const [row] = await db.insert(schema.formFields).values(data).returning();
    return row;
  }

  async updateFormField(id: number, data: Partial<schema.InsertFormField>): Promise<schema.FormField | undefined> {
    const [row] = await db.update(schema.formFields)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.formFields.id, id))
      .returning();
    return row;
  }

  async deleteFormField(id: number): Promise<boolean> {
    const result = await db.delete(schema.formFields).where(eq(schema.formFields.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // ─── Form Publications ──────────────────────────────────────────────────────

  async getFormPublications(formId: number): Promise<schema.FormPublication[]> {
    return db.select().from(schema.formPublications).where(eq(schema.formPublications.formId, formId));
  }

  async getFormPublicationByToken(token: string): Promise<schema.FormPublication | undefined> {
    const rows = await db.select().from(schema.formPublications)
      .where(and(eq(schema.formPublications.publicToken, token), eq(schema.formPublications.status, "active")))
      .limit(1);
    return rows[0];
  }

  async createFormPublication(data: schema.InsertFormPublication): Promise<schema.FormPublication> {
    const [row] = await db.insert(schema.formPublications).values(data).returning();
    return row;
  }

  async updateFormPublication(id: number, data: Partial<schema.InsertFormPublication>): Promise<schema.FormPublication | undefined> {
    const [row] = await db.update(schema.formPublications)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.formPublications.id, id))
      .returning();
    return row;
  }

  // ─── Patient Form Assignments ───────────────────────────────────────────────

  async getPatientFormAssignments(patientId: number): Promise<schema.PatientFormAssignment[]> {
    return db.select().from(schema.patientFormAssignments)
      .where(eq(schema.patientFormAssignments.patientId, patientId))
      .orderBy(desc(schema.patientFormAssignments.assignedAt));
  }

  async createPatientFormAssignment(data: schema.InsertPatientFormAssignment): Promise<schema.PatientFormAssignment> {
    const [row] = await db.insert(schema.patientFormAssignments).values(data).returning();
    return row;
  }

  async updatePatientFormAssignment(id: number, data: Partial<schema.InsertPatientFormAssignment>): Promise<schema.PatientFormAssignment | undefined> {
    const [row] = await db.update(schema.patientFormAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.patientFormAssignments.id, id))
      .returning();
    return row;
  }

  // ─── Form Submissions (raw SQL — production DB may lack clinic_id column) ──

  async getFormSubmissionsByPatient(patientId: number): Promise<schema.FormSubmission[]> {
    const result = await db.execute(sql`SELECT * FROM form_submissions WHERE patient_id = ${patientId} ORDER BY submitted_at DESC`);
    return rawRows(result) as schema.FormSubmission[];
  }

  async getFormSubmissionsByClinician(clinicianId: number): Promise<schema.FormSubmission[]> {
    const result = await db.execute(sql`SELECT * FROM form_submissions WHERE clinician_id = ${clinicianId} ORDER BY submitted_at DESC`);
    return rawRows(result) as schema.FormSubmission[];
  }

  async getFormSubmissionsByClinic(clinicId: number | null, clinicianId: number): Promise<schema.FormSubmission[]> {
    if (clinicId) {
      try {
        const result = await db.execute(sql`SELECT * FROM form_submissions WHERE clinic_id = ${clinicId} OR clinician_id = ${clinicianId} ORDER BY submitted_at DESC`);
        return rawRows(result) as schema.FormSubmission[];
      } catch {
        return this.getFormSubmissionsByClinician(clinicianId);
      }
    }
    return this.getFormSubmissionsByClinician(clinicianId);
  }

  async getFormSubmission(id: number): Promise<schema.FormSubmission | undefined> {
    const result = await db.execute(sql`SELECT * FROM form_submissions WHERE id = ${id} LIMIT 1`);
    return rawRows(result)[0] as schema.FormSubmission | undefined;
  }

  async createFormSubmission(data: schema.InsertFormSubmission): Promise<schema.FormSubmission> {
    try {
      const result = await db.execute(sql`
        INSERT INTO form_submissions (form_id, form_version, clinician_id, clinic_id, patient_id, assignment_id,
          submitted_by_patient, submitted_by_staff, submission_source, status, raw_submission_json,
          normalized_submission_json, signature_json, review_status, sync_status, submitter_name, submitter_email)
        VALUES (${data.formId}, ${data.formVersion ?? 1}, ${data.clinicianId ?? null}, ${data.clinicId ?? null}, ${data.patientId ?? null}, ${data.assignmentId ?? null},
          ${data.submittedByPatient ?? false}, ${data.submittedByStaff ?? false}, ${data.submissionSource ?? 'link'}, ${data.status ?? 'submitted'}, ${JSON.stringify(data.rawSubmissionJson)},
          ${data.normalizedSubmissionJson ? JSON.stringify(data.normalizedSubmissionJson) : null}, ${data.signatureJson ? JSON.stringify(data.signatureJson) : null}, ${data.reviewStatus ?? 'pending'}, ${data.syncStatus ?? 'not_synced'}, ${data.submitterName ?? null}, ${data.submitterEmail ?? null})
        RETURNING *`);
      return rawRows(result)[0] as schema.FormSubmission;
    } catch (err: any) {
      if (err?.message?.includes('clinic_id')) {
        const result = await db.execute(sql`
          INSERT INTO form_submissions (form_id, form_version, clinician_id, patient_id, assignment_id,
            submitted_by_patient, submitted_by_staff, submission_source, status, raw_submission_json,
            normalized_submission_json, signature_json, review_status, sync_status, submitter_name, submitter_email)
          VALUES (${data.formId}, ${data.formVersion ?? 1}, ${data.clinicianId ?? null}, ${data.patientId ?? null}, ${data.assignmentId ?? null},
            ${data.submittedByPatient ?? false}, ${data.submittedByStaff ?? false}, ${data.submissionSource ?? 'link'}, ${data.status ?? 'submitted'}, ${JSON.stringify(data.rawSubmissionJson)},
            ${data.normalizedSubmissionJson ? JSON.stringify(data.normalizedSubmissionJson) : null}, ${data.signatureJson ? JSON.stringify(data.signatureJson) : null}, ${data.reviewStatus ?? 'pending'}, ${data.syncStatus ?? 'not_synced'}, ${data.submitterName ?? null}, ${data.submitterEmail ?? null})
          RETURNING *`);
        return rawRows(result)[0] as schema.FormSubmission;
      }
      throw err;
    }
  }

  async updateFormSubmission(id: number, data: Partial<schema.InsertFormSubmission>): Promise<schema.FormSubmission | undefined> {
    const fieldMap: Record<string, string> = {
      formId: 'form_id', formVersion: 'form_version', clinicianId: 'clinician_id',
      patientId: 'patient_id', assignmentId: 'assignment_id', submittedByPatient: 'submitted_by_patient',
      submittedByStaff: 'submitted_by_staff', submissionSource: 'submission_source', status: 'status',
      rawSubmissionJson: 'raw_submission_json', normalizedSubmissionJson: 'normalized_submission_json',
      signatureJson: 'signature_json', reviewStatus: 'review_status', syncStatus: 'sync_status',
      syncSummaryJson: 'sync_summary_json', submitterName: 'submitter_name', submitterEmail: 'submitter_email',
    };
    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [key, col] of Object.entries(fieldMap)) {
      if (key in data) {
        let val = (data as any)[key];
        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
          val = JSON.stringify(val);
        }
        setClauses.push(`${col} = $${values.length + 1}`);
        values.push(val);
      }
    }
    setClauses.push('updated_at = NOW()');
    if (setClauses.length <= 1) return undefined;
    values.push(id);
    const queryStr = `UPDATE form_submissions SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(queryStr, values);
    return result.rows.map(mapRow)[0] as schema.FormSubmission | undefined;
  }

  async deleteFormSubmission(id: number): Promise<void> {
    await pool.query(`DELETE FROM form_sync_events WHERE submission_id = $1`, [id]);
    await pool.query(`DELETE FROM form_submissions WHERE id = $1`, [id]);
  }

  // ─── Form Sync Events ───────────────────────────────────────────────────────

  async getFormSyncEvents(submissionId: number): Promise<schema.FormSyncEvent[]> {
    return db.select().from(schema.formSyncEvents)
      .where(eq(schema.formSyncEvents.submissionId, submissionId))
      .orderBy(desc(schema.formSyncEvents.createdAt));
  }

  async createFormSyncEvent(data: schema.InsertFormSyncEvent): Promise<schema.FormSyncEvent> {
    const [row] = await db.insert(schema.formSyncEvents).values(data).returning();
    return row;
  }

  // ─── Form Expiration Tracking ───────────────────────────────────────────────

  async getFormExpirationTracking(patientId: number): Promise<schema.FormExpirationTracking[]> {
    return db.select().from(schema.formExpirationTracking)
      .where(eq(schema.formExpirationTracking.patientId, patientId));
  }

  async upsertFormExpirationTracking(patientId: number, formId: number, data: Partial<schema.InsertFormExpirationTracking>): Promise<schema.FormExpirationTracking> {
    const existing = await db.select().from(schema.formExpirationTracking)
      .where(and(eq(schema.formExpirationTracking.patientId, patientId), eq(schema.formExpirationTracking.formId, formId)))
      .limit(1);
    if (existing[0]) {
      const [row] = await db.update(schema.formExpirationTracking)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.formExpirationTracking.id, existing[0].id))
        .returning();
      return row;
    }
    const [row] = await db.insert(schema.formExpirationTracking)
      .values({ patientId, formId, ...data } as schema.InsertFormExpirationTracking)
      .returning();
    return row;
  }

  // ─── Encounter Drafts ────────────────────────────────────────────────────────
  async getEncounterDrafts(clinicianId: number): Promise<schema.EncounterDraft[]> {
    return db.select().from(schema.encounterDrafts)
      .where(eq(schema.encounterDrafts.clinicianId, clinicianId))
      .orderBy(desc(schema.encounterDrafts.createdAt));
  }

  async createEncounterDraft(draft: schema.InsertEncounterDraft): Promise<schema.EncounterDraft> {
    const [row] = await db.insert(schema.encounterDrafts).values(draft).returning();
    return row;
  }

  async deleteEncounterDraft(id: number, clinicianId: number): Promise<boolean> {
    const result = await db.delete(schema.encounterDrafts)
      .where(and(eq(schema.encounterDrafts.id, id), eq(schema.encounterDrafts.clinicianId, clinicianId)))
      .returning();
    return result.length > 0;
  }
}

export const storage = new DbStorage();

// ─── Clinic plan stamping ─────────────────────────────────────────────────
/**
 * Called by the Stripe webhook when a subscription event is received.
 * Stamps the clinic with the correct plan, base limit, and max_providers.
 * Safe to call multiple times — all fields are idempotent.
 */
export async function updateClinicPlanFromStripe(opts: {
  clinicId: number;
  subscriptionPlan: string;      // 'solo' | 'suite'
  baseProviderLimit: number;     // 1 for solo, 2 for suite
  extraProviderSeats: number;    // current purchased extra seats (pass existing value)
  subscriptionStatus?: string;
  stripeSubscriptionId?: string;
}): Promise<void> {
  const maxProviders = opts.baseProviderLimit + opts.extraProviderSeats;
  await db
    .update(schema.clinics)
    .set({
      subscriptionPlan: opts.subscriptionPlan,
      baseProviderLimit: opts.baseProviderLimit,
      maxProviders,
      ...(opts.subscriptionStatus !== undefined && { subscriptionStatus: opts.subscriptionStatus }),
      ...(opts.stripeSubscriptionId !== undefined && { stripeSubscriptionId: opts.stripeSubscriptionId }),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinics.id, opts.clinicId));
}

// ─── Clinic seat management ───────────────────────────────────────────────
/** Update the seat counters on a clinic after a confirmed Stripe seat purchase. */
export async function updateClinicSeats(
  clinicId: number,
  extraProviderSeats: number
): Promise<void> {
  const baseProviderLimit = 2; // Suite includes 2 providers; matches SUITE_BASE_PROVIDER_LIMIT in clinic-plan.ts
  const maxProviders = baseProviderLimit + extraProviderSeats;
  await db
    .update(schema.clinics)
    .set({
      extraProviderSeats,
      maxProviders,
      updatedAt: new Date(),
    })
    .where(eq(schema.clinics.id, clinicId));
}

/** Atomically create a provider row + clinic_membership in one transaction. */
export async function createProviderWithMembership(opts: {
  clinicId: number;
  userId?: number | null;
  displayName: string;
  credentials?: string | null;
  specialty?: string | null;
  npi?: string | null;
  email?: string | null; // for membership / future invite
  role?: string;
}): Promise<{ providerId: number }> {
  const [provider] = await db
    .insert(schema.providers)
    .values({
      clinicId: opts.clinicId,
      userId: opts.userId ?? null,
      displayName: opts.displayName,
      credentials: opts.credentials ?? null,
      specialty: opts.specialty ?? null,
      npi: opts.npi ?? null,
      isActive: true,
    })
    .returning();

  // Membership row — only if there is an associated user
  if (opts.userId) {
    const existing = await db
      .select({ id: schema.clinicMemberships.id })
      .from(schema.clinicMemberships)
      .where(
        and(
          eq(schema.clinicMemberships.clinicId, opts.clinicId),
          eq(schema.clinicMemberships.userId, opts.userId)
        )
      );
    if (existing.length === 0) {
      await db.insert(schema.clinicMemberships).values({
        clinicId: opts.clinicId,
        userId: opts.userId,
        role: opts.role ?? "provider",
        isActive: true,
        isPrimaryClinic: true,
      });
    }
  }

  return { providerId: provider.id };
}

// ─── Multi-clinic bootstrap ────────────────────────────────────────────────
// Called once immediately after a new user is created during registration.
// Creates the clinic, membership, and provider records so every account
// starts with a complete, consistent structure from day one.
// Solo plan: maxProviders = 1. Upgrade to Clinic plan = change that field only.
export async function setupClinicForNewUser(user: User): Promise<{ clinicId: number; providerId: number }> {
  const clinicName = (user as any).clinicName || `${user.firstName} ${user.lastName} Practice`;

  // 1. Create the clinic
  const [clinic] = await db
    .insert(schema.clinics)
    .values({
      name: clinicName,
      ownerUserId: user.id,
      isActive: true,
      subscriptionPlan: "solo",
      maxProviders: 1,
    })
    .returning();

  // 2. Membership: owner is always the admin
  await db.insert(schema.clinicMemberships).values({
    clinicId: clinic.id,
    userId: user.id,
    role: "admin",
    clinicalRole: "provider",
    adminRole: "owner",
    isActive: true,
    isPrimaryClinic: true,
  });

  // 3. Provider profile (the solo clinician IS the sole provider)
  const displayName = [user.title, user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ");
  const [provider] = await db
    .insert(schema.providers)
    .values({
      clinicId: clinic.id,
      userId: user.id,
      displayName,
      npi: (user as any).npi ?? null,
      isActive: true,
    })
    .returning();

  // 4. Stamp defaultClinicId + userType back onto the user row
  await db
    .update(schema.users)
    .set({ defaultClinicId: clinic.id, userType: "solo_admin" })
    .where(eq(schema.users.id, user.id));

  return { clinicId: clinic.id, providerId: provider.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// ─── Diagnosis Presets (clinic-wide /dx shortcuts) ─────────────────────────
// Implemented on DbStorage prototype to avoid disturbing the main class block.
// ═══════════════════════════════════════════════════════════════════════════
(DbStorage.prototype as any).getDiagnosisPresets = async function(clinicId: number): Promise<schema.DiagnosisPreset[]> {
  return await db
    .select()
    .from(schema.diagnosisPresets)
    .where(eq(schema.diagnosisPresets.clinicId, clinicId))
    .orderBy(desc(schema.diagnosisPresets.updatedAt));
};

(DbStorage.prototype as any).getDiagnosisPreset = async function(id: number, clinicId: number): Promise<schema.DiagnosisPreset | undefined> {
  const [row] = await db
    .select()
    .from(schema.diagnosisPresets)
    .where(and(eq(schema.diagnosisPresets.id, id), eq(schema.diagnosisPresets.clinicId, clinicId)))
    .limit(1);
  return row;
};

(DbStorage.prototype as any).createDiagnosisPreset = async function(data: schema.InsertDiagnosisPreset): Promise<schema.DiagnosisPreset> {
  const [row] = await db.insert(schema.diagnosisPresets).values(data).returning();
  return row;
};

(DbStorage.prototype as any).updateDiagnosisPreset = async function(
  id: number,
  clinicId: number,
  data: Partial<schema.InsertDiagnosisPreset>,
): Promise<schema.DiagnosisPreset | undefined> {
  const [row] = await db
    .update(schema.diagnosisPresets)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.diagnosisPresets.id, id), eq(schema.diagnosisPresets.clinicId, clinicId)))
    .returning();
  return row;
};

(DbStorage.prototype as any).deleteDiagnosisPreset = async function(id: number, clinicId: number): Promise<boolean> {
  const result = await db
    .delete(schema.diagnosisPresets)
    .where(and(eq(schema.diagnosisPresets.id, id), eq(schema.diagnosisPresets.clinicId, clinicId)))
    .returning({ id: schema.diagnosisPresets.id });
  return result.length > 0;
};
