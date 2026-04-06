import { eq, desc, ilike, or, and, isNull, count, sql } from "drizzle-orm";
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

  // Admin operations
  getAllUsers(): Promise<User[]>;
  promoteToAdmin(id: number): Promise<User | undefined>;
  updateUserAdmin(id: number, data: Partial<Pick<User, 'subscriptionStatus' | 'role' | 'notes'>>): Promise<User | undefined>;
  deleteUserAdmin(id: number): Promise<boolean>;
  getPatientCountByUser(userId: number): Promise<number>;

  // Patient operations (scoped by userId)
  getPatient(id: number, userId: number): Promise<Patient | undefined>;
  getAllPatients(userId: number): Promise<Patient[]>;
  searchPatients(searchTerm: string, userId: number, gender?: string): Promise<Patient[]>;
  getPatientByName(firstName: string, lastName: string, userId: number): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: number, patient: Partial<InsertPatient>, userId: number): Promise<Patient | undefined>;
  deletePatient(id: number, userId: number): Promise<boolean>;

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
  getEncountersByClinicianId(clinicianId: number, patientId?: number): Promise<(ClinicalEncounter & { patientName: string })[]>;
  getEncounter(id: number, clinicianId: number): Promise<ClinicalEncounter | undefined>;
  createEncounter(data: InsertClinicalEncounter): Promise<ClinicalEncounter>;
  updateEncounter(id: number, clinicianId: number, data: Partial<InsertClinicalEncounter> & { soapNote?: any; soapGeneratedAt?: Date; summaryPublished?: boolean; summaryPublishedAt?: Date; diarizedTranscript?: any; clinicalExtraction?: any; evidenceSuggestions?: any; updatedAt?: Date }): Promise<ClinicalEncounter | undefined>;
  deleteEncounter(id: number, clinicianId: number): Promise<boolean>;
  getPublishedEncountersByPatient(patientId: number): Promise<Pick<ClinicalEncounter, 'id' | 'visitDate' | 'visitType' | 'chiefComplaint' | 'patientSummary' | 'summaryPublishedAt'>[]>;
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

  async updateUserAdmin(id: number, data: Partial<Pick<User, 'subscriptionStatus' | 'role' | 'notes'>>): Promise<User | undefined> {
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

  async getPatientCountByUser(userId: number): Promise<number> {
    const result = await db
      .select()
      .from(schema.patients)
      .where(eq(schema.patients.userId, userId));
    return result.length;
  }

  // ── Patient operations ───────────────────────────────────────────────────────
  async getPatient(id: number, userId: number): Promise<Patient | undefined> {
    const result = await db
      .select()
      .from(schema.patients)
      .where(and(eq(schema.patients.id, id), eq(schema.patients.userId, userId)));
    return result[0];
  }

  async getAllPatients(userId: number): Promise<Patient[]> {
    return await db
      .select()
      .from(schema.patients)
      .where(eq(schema.patients.userId, userId))
      .orderBy(desc(schema.patients.updatedAt));
  }

  async searchPatients(searchTerm: string, userId: number, gender?: string): Promise<Patient[]> {
    const searchPattern = `%${searchTerm}%`;
    const nameCondition = or(
      ilike(schema.patients.firstName, searchPattern),
      ilike(schema.patients.lastName, searchPattern)
    );
    const userCondition = eq(schema.patients.userId, userId);
    if (gender) {
      return await db
        .select()
        .from(schema.patients)
        .where(and(nameCondition, userCondition, eq(schema.patients.gender, gender)))
        .orderBy(desc(schema.patients.updatedAt));
    }
    return await db
      .select()
      .from(schema.patients)
      .where(and(nameCondition!, userCondition))
      .orderBy(desc(schema.patients.updatedAt));
  }

  async getPatientByName(firstName: string, lastName: string, userId: number): Promise<Patient | undefined> {
    const result = await db
      .select()
      .from(schema.patients)
      .where(
        and(
          ilike(schema.patients.firstName, firstName),
          ilike(schema.patients.lastName, lastName),
          eq(schema.patients.userId, userId)
        )
      );
    return result[0];
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const result = await db.insert(schema.patients).values(patient).returning();
    return result[0];
  }

  async updatePatient(id: number, patient: Partial<InsertPatient>, userId: number): Promise<Patient | undefined> {
    const result = await db
      .update(schema.patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(and(eq(schema.patients.id, id), eq(schema.patients.userId, userId)))
      .returning();
    return result[0];
  }

  async deletePatient(id: number, userId: number): Promise<boolean> {
    const result = await db
      .delete(schema.patients)
      .where(and(eq(schema.patients.id, id), eq(schema.patients.userId, userId)))
      .returning();
    return result.length > 0;
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

  async getPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined> {
    const result = await db
      .select()
      .from(schema.patientPortalAccounts)
      .where(eq(schema.patientPortalAccounts.email, email));
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
  async getEncountersByClinicianId(clinicianId: number, patientId?: number): Promise<(ClinicalEncounter & { patientName: string })[]> {
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
        createdAt: schema.clinicalEncounters.createdAt,
        updatedAt: schema.clinicalEncounters.updatedAt,
        patientName: sql<string>`${schema.patients.firstName} || ' ' || ${schema.patients.lastName}`,
      })
      .from(schema.clinicalEncounters)
      .innerJoin(schema.patients, eq(schema.clinicalEncounters.patientId, schema.patients.id))
      .where(
        patientId
          ? and(eq(schema.clinicalEncounters.clinicianId, clinicianId), eq(schema.clinicalEncounters.patientId, patientId))
          : eq(schema.clinicalEncounters.clinicianId, clinicianId)
      )
      .orderBy(desc(schema.clinicalEncounters.visitDate));
    return rows as (ClinicalEncounter & { patientName: string })[];
  }

  async getEncounter(id: number, clinicianId: number): Promise<ClinicalEncounter | undefined> {
    const result = await db.select().from(schema.clinicalEncounters)
      .where(and(eq(schema.clinicalEncounters.id, id), eq(schema.clinicalEncounters.clinicianId, clinicianId)));
    return result[0];
  }

  async createEncounter(data: InsertClinicalEncounter): Promise<ClinicalEncounter> {
    const result = await db.insert(schema.clinicalEncounters).values(data).returning();
    return result[0];
  }

  async updateEncounter(id: number, clinicianId: number, data: any): Promise<ClinicalEncounter | undefined> {
    const result = await db.update(schema.clinicalEncounters)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.clinicalEncounters.id, id), eq(schema.clinicalEncounters.clinicianId, clinicianId)))
      .returning();
    return result[0];
  }

  async deleteEncounter(id: number, clinicianId: number): Promise<boolean> {
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
}

export const storage = new DbStorage();
