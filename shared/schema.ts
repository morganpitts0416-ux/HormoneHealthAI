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
  familyHistory: z.boolean().default(false), // Premature ASCVD in 1st degree relatives (<55 male, <65 female)
  
  // PREVENT Calculator Fields
  bmi: z.number().min(15).max(60).optional(), // Body Mass Index for PREVENT
  onStatins: z.boolean().default(false), // Statin use for PREVENT
  
  // STOP-BANG Sleep Apnea Screening
  snoring: z.boolean().default(false),
  tiredness: z.boolean().default(false),
  observedApnea: z.boolean().default(false),
  bmiOver35: z.boolean().default(false),
  neckCircOver40cm: z.boolean().default(false),
});

export type PatientDemographics = z.infer<typeof patientDemographicsSchema>;

// PREVENT Risk Result Schema - AHA 2023 Equations
export const preventRiskResultSchema = z.object({
  // 10-Year Risks
  tenYearTotalCVD: z.number(),
  tenYearASCVD: z.number(),
  tenYearHeartFailure: z.number(),
  
  // 30-Year Risks (only valid for ages 30-59)
  thirtyYearTotalCVD: z.number().optional(),
  thirtyYearASCVD: z.number().optional(),
  thirtyYearHeartFailure: z.number().optional(),
  
  // Risk Categories
  riskCategory: z.enum(['low', 'borderline', 'intermediate', 'high']),
  
  // Display strings
  tenYearCVDPercentage: z.string(),
  tenYearASCVDPercentage: z.string(),
  tenYearHFPercentage: z.string(),
  thirtyYearCVDPercentage: z.string().optional(),
  thirtyYearASCVDPercentage: z.string().optional(),
  thirtyYearHFPercentage: z.string().optional(),
  
  // Recommendations
  recommendations: z.string(),
  statinRecommendation: z.string().optional(),
  ldlGoal: z.string().optional(),
  
  // Calculator info
  calculatorUsed: z.literal('PREVENT').default('PREVENT'),
  ageValidFor30Year: z.boolean().default(true),
});

export type PREVENTRiskResult = z.infer<typeof preventRiskResultSchema>;

// Adjusted Risk Assessment Schema - considers ApoB and Lp(a)
export const adjustedRiskAssessmentSchema = z.object({
  hasElevatedLpa: z.boolean(),
  hasElevatedApoB: z.boolean(),
  hasBorderlineLpa: z.boolean().optional(),
  hasBorderlineApoB: z.boolean().optional(),
  lpaValue: z.number().optional(),
  apoBValue: z.number().optional(),
  lpaStatus: z.enum(['normal', 'borderline', 'elevated']).optional(),
  apoBStatus: z.enum(['normal', 'borderline', 'elevated']).optional(),
  baseASCVDRisk: z.number(), // 10-year ASCVD risk percentage
  riskCategory: z.enum(['low', 'borderline', 'intermediate', 'high']),
  adjustedCategory: z.enum(['low', 'borderline', 'intermediate', 'high', 'reclassified_upward']),
  clinicalGuidance: z.string(),
  cacRecommendation: z.string().optional(),
  statinGuidance: z.string().optional(),
});

export type AdjustedRiskAssessment = z.infer<typeof adjustedRiskAssessmentSchema>;

// ASCVD Risk Result Schema (legacy - kept for backward compatibility)
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
  // Patient Name (for saving and retrieving interpretations)
  patientName: z.string().optional(),
  
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
  apoB: z.number().optional(), // Apolipoprotein B
  lpa: z.number().optional(), // Lipoprotein(a)
  
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
  hsCRP: z.number().optional(), // High-Sensitivity C-Reactive Protein (mg/dL)
  
  // Previous PSA for velocity calculation
  previousPsa: z.number().optional(),
  monthsSinceLastPsa: z.number().optional(),
});

// Female-specific Lab Values Schema
export const femaleLabValuesSchema = z.object({
  // Patient Name (for saving and retrieving interpretations)
  patientName: z.string().optional(),
  
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
  apoB: z.number().optional(), // Apolipoprotein B
  lpa: z.number().optional(), // Lipoprotein(a)
  
  // Cardiovascular Assessment
  cacScore: z.number().optional(), // Coronary Artery Calcium score (if available)
  knownASCVD: z.boolean().optional(), // Known atherosclerotic cardiovascular disease
  statinHesitant: z.boolean().optional(), // Patient hesitant about statin therapy
  
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
  tibc: z.number().optional(), // Total Iron Binding Capacity
  vitaminB12: z.number().optional(),
  folate: z.number().optional(),
  hsCRP: z.number().optional(), // High-Sensitivity C-Reactive Protein
  
  // Symptom Assessment (for hormone pattern detection in women 35+)
  hotFlashes: z.boolean().optional(),
  nightSweats: z.boolean().optional(),
  vaginalDryness: z.boolean().optional(),
  frequentUTIs: z.boolean().optional(),
  jointAches: z.boolean().optional(),
  sleepDisruption: z.boolean().optional(),
  lowLibido: z.boolean().optional(),
  lowEnergy: z.boolean().optional(),
  lowMotivation: z.boolean().optional(),
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

// Supplement Recommendation Schema
export const supplementRecommendationSchema = z.object({
  name: z.string(),
  dose: z.string(),
  indication: z.string(),
  rationale: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  category: z.enum(['iron', 'vitamin', 'mineral', 'hormone-support', 'cardiovascular', 'thyroid', 'bone', 'general']),
  caution: z.string().optional(),
});

export type SupplementRecommendation = z.infer<typeof supplementRecommendationSchema>;

// Cardiovascular Risk Flags Schema - Boolean flags for risk stratification
export const cardiovascularRiskFlagsSchema = z.object({
  // Lipoprotein(a) - genetic risk marker
  high_Lp_a: z.boolean().default(false), // Lp(a) ≥50 mg/dL (or ≥125 nmol/L)
  very_high_Lp_a: z.boolean().default(false), // Lp(a) ≥180 mg/dL (extreme/genetic-equivalent)
  
  // Apolipoprotein B - atherogenic particle count
  high_ApoB: z.boolean().default(false), // ApoB ≥90 mg/dL (risk enhancer)
  very_high_ApoB: z.boolean().default(false), // ApoB ≥120 mg/dL
  
  // Lipid abnormalities
  high_nonHDL: z.boolean().default(false), // non-HDL ≥130 mg/dL
  very_high_nonHDL: z.boolean().default(false), // non-HDL ≥160 mg/dL
  high_TG: z.boolean().default(false), // Triglycerides ≥150 mg/dL
  very_high_TG: z.boolean().default(false), // Triglycerides ≥200 mg/dL (marked)
  low_HDL: z.boolean().default(false), // HDL <50 female / <40 male
  
  // Inflammation
  hsCRP_high: z.boolean().default(false), // hs-CRP ≥2.0 mg/L (risk enhancer)
  
  // Kidney function
  CKD: z.boolean().default(false), // eGFR <60 mL/min
  
  // Family history
  family_history: z.boolean().default(false), // Premature ASCVD in 1st degree relatives
  
  // Glycemic status
  diabetes: z.boolean().default(false), // A1c ≥6.5%
  prediabetes: z.boolean().default(false), // A1c 5.7-6.4%
});

export type CardiovascularRiskFlags = z.infer<typeof cardiovascularRiskFlagsSchema>;

// CAC and Statin Recommendations Schema
export const cacStatinRecommendationSchema = z.object({
  cacRecommendation: z.object({
    recommended: z.boolean(),
    priority: z.enum(['none', 'consider', 'recommend', 'strongly_recommend']),
    rationale: z.string(),
    contraindicated: z.boolean().optional(),
    contraindicationReason: z.string().optional(),
  }),
  statinDiscussion: z.object({
    indicated: z.boolean(),
    strength: z.enum(['none', 'consider', 'generally_recommended', 'strongly_indicated']),
    rationale: z.string(),
    additionalNotes: z.string().optional(),
  }),
  cacInterpretation: z.object({
    score: z.number().optional(),
    interpretation: z.string(),
    clinicalImplication: z.string(),
  }).optional(),
  triglycerideMgmt: z.object({
    elevated: z.boolean(),
    severity: z.enum(['normal', 'borderline', 'high', 'very_high']),
    recommendation: z.string(),
  }).optional(),
  lpaWarning: z.string().optional(),
});

export type CacStatinRecommendation = z.infer<typeof cacStatinRecommendationSchema>;

// Complete Interpretation Result
export const interpretationResultSchema = z.object({
  redFlags: z.array(redFlagSchema),
  interpretations: z.array(labInterpretationSchema),
  aiRecommendations: z.string(),
  patientSummary: z.string(),
  recheckWindow: z.string(),
  ascvdRisk: ascvdRiskResultSchema.optional(),
  preventRisk: preventRiskResultSchema.optional(),
  adjustedRisk: adjustedRiskAssessmentSchema.optional(),
  supplements: z.array(supplementRecommendationSchema).optional(),
  cvRiskFlags: cardiovascularRiskFlagsSchema.optional(),
  cacStatinRec: cacStatinRecommendationSchema.optional(),
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

// Saved Lab Interpretations - simple table for storing and retrieving past interpretations
export const savedInterpretations = pgTable("saved_interpretations", {
  id: serial("id").primaryKey(),
  patientName: varchar("patient_name", { length: 200 }).notNull(),
  gender: varchar("gender", { length: 10 }).notNull(), // 'male' or 'female'
  labDate: timestamp("lab_date").defaultNow().notNull(),
  labValues: jsonb("lab_values").$type<LabValues | FemaleLabValues>().notNull(),
  interpretation: jsonb("interpretation").$type<InterpretationResult>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSavedInterpretationSchema = createInsertSchema(savedInterpretations).omit({
  id: true,
  createdAt: true,
});

export type InsertSavedInterpretation = z.infer<typeof insertSavedInterpretationSchema>;
export type SavedInterpretation = typeof savedInterpretations.$inferSelect;
