import { eq, desc, ilike, or, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import type {
  Patient, InsertPatient,
  LabResult, InsertLabResult,
  SavedInterpretation, InsertSavedInterpretation,
  User, InsertUser,
  PatientPortalAccount, InsertPatientPortalAccount,
  PublishedProtocol, InsertPublishedProtocol,
} from "@shared/schema";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

export interface IStorage {
  // User operations
  getUserById(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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

  // Patient portal account operations
  getPatientById(id: number): Promise<Patient | undefined>;
  getPortalAccountByEmail(email: string): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByPatientId(patientId: number): Promise<PatientPortalAccount | undefined>;
  getPortalAccountByInviteToken(token: string): Promise<PatientPortalAccount | undefined>;
  createPortalAccount(account: InsertPatientPortalAccount): Promise<PatientPortalAccount>;
  updatePortalAccount(patientId: number, data: Partial<InsertPatientPortalAccount>): Promise<PatientPortalAccount | undefined>;

  // Published protocol operations
  publishProtocol(protocol: InsertPublishedProtocol): Promise<PublishedProtocol>;
  getLatestPublishedProtocol(patientId: number): Promise<PublishedProtocol | undefined>;
  getAllPublishedProtocols(patientId: number): Promise<PublishedProtocol[]>;
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
}

export const storage = new DbStorage();
