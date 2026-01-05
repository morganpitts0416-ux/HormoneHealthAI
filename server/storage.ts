import { eq, desc, ilike, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";
import type { Patient, InsertPatient, LabResult, InsertLabResult, SavedInterpretation, InsertSavedInterpretation } from "@shared/schema";

// Configure Neon to use ws for WebSocket in Node.js
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

export interface IStorage {
  // Patient operations
  getPatient(id: number): Promise<Patient | undefined>;
  getAllPatients(): Promise<Patient[]>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: number, patient: Partial<InsertPatient>): Promise<Patient | undefined>;
  
  // Lab result operations
  getLabResult(id: number): Promise<LabResult | undefined>;
  getLabResultsByPatient(patientId: number): Promise<LabResult[]>;
  createLabResult(labResult: InsertLabResult): Promise<LabResult>;
  updateLabResult(id: number, labResult: Partial<InsertLabResult>): Promise<LabResult | undefined>;
  
  // Saved interpretation operations
  getSavedInterpretation(id: number): Promise<SavedInterpretation | undefined>;
  getAllSavedInterpretations(gender?: string): Promise<SavedInterpretation[]>;
  searchSavedInterpretations(searchTerm: string, gender?: string): Promise<SavedInterpretation[]>;
  createSavedInterpretation(interpretation: InsertSavedInterpretation): Promise<SavedInterpretation>;
  deleteSavedInterpretation(id: number): Promise<boolean>;
}

export class DbStorage implements IStorage {
  async getPatient(id: number): Promise<Patient | undefined> {
    const result = await db.select().from(schema.patients).where(eq(schema.patients.id, id));
    return result[0];
  }

  async getAllPatients(): Promise<Patient[]> {
    return await db.select().from(schema.patients).orderBy(desc(schema.patients.updatedAt));
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const result = await db.insert(schema.patients).values(patient).returning();
    return result[0];
  }

  async updatePatient(id: number, patient: Partial<InsertPatient>): Promise<Patient | undefined> {
    const result = await db
      .update(schema.patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(eq(schema.patients.id, id))
      .returning();
    return result[0];
  }

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
    const result = await db.insert(schema.labResults).values(labResult).returning();
    return result[0];
  }

  async updateLabResult(id: number, labResult: Partial<InsertLabResult>): Promise<LabResult | undefined> {
    const result = await db
      .update(schema.labResults)
      .set({ ...labResult, updatedAt: new Date() })
      .where(eq(schema.labResults.id, id))
      .returning();
    return result[0];
  }

  // Saved interpretation operations
  async getSavedInterpretation(id: number): Promise<SavedInterpretation | undefined> {
    const result = await db.select().from(schema.savedInterpretations).where(eq(schema.savedInterpretations.id, id));
    return result[0];
  }

  async getAllSavedInterpretations(gender?: string): Promise<SavedInterpretation[]> {
    if (gender) {
      return await db
        .select()
        .from(schema.savedInterpretations)
        .where(eq(schema.savedInterpretations.gender, gender))
        .orderBy(desc(schema.savedInterpretations.createdAt));
    }
    return await db.select().from(schema.savedInterpretations).orderBy(desc(schema.savedInterpretations.createdAt));
  }

  async searchSavedInterpretations(searchTerm: string, gender?: string): Promise<SavedInterpretation[]> {
    const searchPattern = `%${searchTerm}%`;
    if (gender) {
      return await db
        .select()
        .from(schema.savedInterpretations)
        .where(
          or(
            ilike(schema.savedInterpretations.patientName, searchPattern)
          )
        )
        .orderBy(desc(schema.savedInterpretations.createdAt));
    }
    return await db
      .select()
      .from(schema.savedInterpretations)
      .where(ilike(schema.savedInterpretations.patientName, searchPattern))
      .orderBy(desc(schema.savedInterpretations.createdAt));
  }

  async createSavedInterpretation(interpretation: InsertSavedInterpretation): Promise<SavedInterpretation> {
    const result = await db.insert(schema.savedInterpretations).values(interpretation).returning();
    return result[0];
  }

  async deleteSavedInterpretation(id: number): Promise<boolean> {
    const result = await db.delete(schema.savedInterpretations).where(eq(schema.savedInterpretations.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DbStorage();
