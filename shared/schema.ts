import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, varchar, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

// Patient Demographics & ASCVD Risk Factors Schema
export const patientDemographicsSchema = z.object({
  age: z.number().min(20).max(120).optional(),
  sex: z.enum(['male', 'female']).optional(),
  race: z.enum(['african_american', 'white', 'other']).optional(),
  systolicBP: z.number().min(70).max(250).optional(),
  onBPMeds: z.boolean().default(false),
  diabetic: z.boolean().default(false),
  smoker: z.boolean().default(false),
  
  // STOP-BANG Sleep Apnea Screening
  snoring: z.boolean().default(false),
  tiredness: z.boolean().default(false),
  observedApnea: z.boolean().default(false),
  bmiOver35: z.boolean().default(false),
  neckCircOver40cm: z.boolean().default(false),
});

export type PatientDemographics = z.infer<typeof patientDemographicsSchema>;

// ASCVD Risk Result Schema
export const ascvdRiskResultSchema = z.object({
  tenYearRisk: z.number(),
  riskCategory: z.enum(['low', 'borderline', 'intermediate', 'high']),
  riskPercentage: z.string(),
  recommendations: z.string(),
  statinRecommendation: z.string().optional(),
  ldlGoal: z.string().optional(),
});

export type ASCVDRiskResult = z.infer<typeof ascvdRiskResultSchema>;

// Lab Values Schema - Complete Men's Clinic Panel
export const labValuesSchema = z.object({
  // Patient Demographics & ASCVD Risk Factors (for cardiovascular risk assessment)
  demographics: patientDemographicsSchema.optional(),
  
  // CBC Values (Complete Blood Count)
  hemoglobin: z.number().optional(),
  hematocrit: z.number().optional(),
  rbc: z.number().optional(), // Red blood cell count
  wbc: z.number().optional(), // White blood cell count
  platelets: z.number().optional(),
  
  // CMP Values (Comprehensive Metabolic Panel)
  ast: z.number().optional(),
  alt: z.number().optional(),
  bilirubin: z.number().optional(),
  creatinine: z.number().optional(),
  egfr: z.number().optional(),
  bun: z.number().optional(),
  sodium: z.number().optional(),
  potassium: z.number().optional(),
  chloride: z.number().optional(),
  co2: z.number().optional(),
  glucose: z.number().optional(),
  calcium: z.number().optional(),
  albumin: z.number().optional(),
  totalProtein: z.number().optional(),
  
  // Lipid Panel
  ldl: z.number().optional(),
  hdl: z.number().optional(),
  totalCholesterol: z.number().optional(),
  triglycerides: z.number().optional(),
  
  // Hormones
  testosterone: z.number().optional(),
  estradiol: z.number().optional(),
  lh: z.number().optional(),
  prolactin: z.number().optional(),
  shbg: z.number().optional(), // Sex Hormone Binding Globulin
  freeTestosterone: z.number().optional(), // Calculated or measured
  
  // Other
  tsh: z.number().optional(),
  psa: z.number().optional(),
  a1c: z.number().optional(),
  
  // Previous PSA for velocity calculation
  previousPsa: z.number().optional(),
  monthsSinceLastPsa: z.number().optional(),
});

// Female-specific Lab Values Schema
export const femaleLabValuesSchema = z.object({
  // Patient Demographics & ASCVD Risk Factors
  demographics: patientDemographicsSchema.optional(),
  
  // Menstrual Phase Context (affects hormone interpretation)
  menstrualPhase: z.enum(['follicular', 'ovulatory', 'luteal', 'postmenopausal', 'unknown']).optional(),
  lastMenstrualPeriod: z.string().optional(),
  onHRT: z.boolean().optional(), // Hormone Replacement Therapy
  onBirthControl: z.boolean().optional(),
  
  // CBC Values (Complete Blood Count) - Female reference ranges differ
  hemoglobin: z.number().optional(),
  hematocrit: z.number().optional(),
  rbc: z.number().optional(),
  wbc: z.number().optional(),
  platelets: z.number().optional(),
  
  // CMP Values (Comprehensive Metabolic Panel)
  ast: z.number().optional(),
  alt: z.number().optional(),
  bilirubin: z.number().optional(),
  creatinine: z.number().optional(),
  egfr: z.number().optional(),
  bun: z.number().optional(),
  sodium: z.number().optional(),
  potassium: z.number().optional(),
  chloride: z.number().optional(),
  co2: z.number().optional(),
  glucose: z.number().optional(),
  calcium: z.number().optional(),
  albumin: z.number().optional(),
  totalProtein: z.number().optional(),
  
  // Lipid Panel
  ldl: z.number().optional(),
  hdl: z.number().optional(),
  totalCholesterol: z.number().optional(),
  triglycerides: z.number().optional(),
  
  // Female Hormones
  estradiol: z.number().optional(),
  progesterone: z.number().optional(),
  fsh: z.number().optional(), // Follicle Stimulating Hormone
  lh: z.number().optional(),
  prolactin: z.number().optional(),
  testosterone: z.number().optional(), // Total testosterone (lower ranges for women)
  freeTestosterone: z.number().optional(),
  dheas: z.number().optional(), // DHEA-Sulfate
  shbg: z.number().optional(),
  amh: z.number().optional(), // Anti-Mullerian Hormone (fertility marker)
  
  // Thyroid
  tsh: z.number().optional(),
  freeT4: z.number().optional(),
  freeT3: z.number().optional(),
  tpoAntibodies: z.number().optional(), // Thyroid Peroxidase Antibodies
  
  // Other
  a1c: z.number().optional(),
  vitaminD: z.number().optional(),
  ferritin: z.number().optional(),
  iron: z.number().optional(),
  vitaminB12: z.number().optional(),
});

export type FemaleLabValues = z.infer<typeof femaleLabValuesSchema>;

export type LabValues = z.infer<typeof labValuesSchema>;

// Red Flag Schema
export const redFlagSchema = z.object({
  category: z.string(),
  severity: z.enum(['critical', 'urgent', 'warning']),
  message: z.string(),
  action: z.string(),
});

export type RedFlag = z.infer<typeof redFlagSchema>;

// Lab Interpretation Schema
export const labInterpretationSchema = z.object({
  category: z.string(),
  value: z.number().optional(),
  unit: z.string(),
  status: z.enum(['normal', 'borderline', 'abnormal', 'critical']),
  referenceRange: z.string(),
  interpretation: z.string(),
  recommendation: z.string(),
  recheckTiming: z.string().optional(),
});

export type LabInterpretation = z.infer<typeof labInterpretationSchema>;

// Complete Interpretation Result
export const interpretationResultSchema = z.object({
  redFlags: z.array(redFlagSchema),
  interpretations: z.array(labInterpretationSchema),
  aiRecommendations: z.string(),
  patientSummary: z.string(),
  recheckWindow: z.string(),
  ascvdRisk: ascvdRiskResultSchema.optional(),
});

export type InterpretationResult = z.infer<typeof interpretationResultSchema>;

// API Request/Response Types
export const interpretLabsRequestSchema = labValuesSchema;
export type InterpretLabsRequest = z.infer<typeof interpretLabsRequestSchema>;

export const interpretLabsResponseSchema = interpretationResultSchema;
export type InterpretLabsResponse = z.infer<typeof interpretLabsResponseSchema>;

// Database Tables
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  mrn: varchar("mrn", { length: 50 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const labResults = pgTable("lab_results", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  labDate: timestamp("lab_date").notNull(),
  labValues: jsonb("lab_values").$type<LabValues>().notNull(),
  interpretationResult: jsonb("interpretation_result").$type<InterpretationResult>(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;

export const insertLabResultSchema = createInsertSchema(labResults).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLabResult = z.infer<typeof insertLabResultSchema>;
export type LabResult = typeof labResults.$inferSelect;
