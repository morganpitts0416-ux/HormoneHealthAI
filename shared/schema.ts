import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, varchar, text, timestamp, jsonb, integer, boolean, real, time } from "drizzle-orm/pg-core";

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
  labDrawDate: z.string().optional(),
  
  // Patient Demographics & ASCVD Risk Factors (for cardiovascular risk assessment)
  demographics: patientDemographicsSchema.optional(),
  
  // CBC Values (Complete Blood Count)
  hemoglobin: z.number().optional(),
  hematocrit: z.number().optional(),
  mcv: z.number().optional(), // Mean Corpuscular Volume
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
  freeT4: z.number().optional(), // Free Thyroxine (ng/dL)
  psa: z.number().optional(),
  a1c: z.number().optional(),
  hsCRP: z.number().optional(), // High-Sensitivity C-Reactive Protein (mg/dL)
  vitaminD: z.number().optional(), // 25-hydroxyvitamin D (ng/mL)
  vitaminB12: z.number().optional(), // Vitamin B12 (pg/mL)
  
  // Previous PSA for velocity calculation
  previousPsa: z.number().optional(),
  monthsSinceLastPsa: z.number().optional(),

  // Clinical context
  onTRT: z.boolean().optional(), // Patient is currently on Testosterone Replacement Therapy
});

// Female-specific Lab Values Schema
export const femaleLabValuesSchema = z.object({
  // Patient Name (for saving and retrieving interpretations)
  patientName: z.string().optional(),
  labDrawDate: z.string().optional(),
  
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
  mcv: z.number().optional(), // Mean Corpuscular Volume
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
  freeTestosterone: z.number().optional(), // Free Testosterone (pg/mL)
  bioavailableTestosterone: z.number().optional(), // Bioavailable Testosterone (ng/dL)
  dheas: z.number().optional(), // DHEA-Sulfate
  shbg: z.number().optional(), // Sex Hormone Binding Globulin (nmol/L)
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

  // Extended Symptom Assessment (for phenotype detection and supplement logic)
  acne: z.boolean().optional(),
  pmsSymptoms: z.boolean().optional(),
  irritability: z.boolean().optional(),
  headaches: z.boolean().optional(),
  heavyMenses: z.boolean().optional(),
  bloating: z.boolean().optional(),
  hairLoss: z.boolean().optional(),
  restlessLegs: z.boolean().optional(),
  anxiety: z.boolean().optional(),
  weightGain: z.boolean().optional(),
  moodChanges: z.boolean().optional(),
  brainFog: z.boolean().optional(),
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
  category: z.enum(['iron', 'vitamin', 'mineral', 'hormone-support', 'cardiovascular', 'thyroid', 'bone', 'general', 'detox', 'metabolic', 'probiotic']),
  caution: z.string().optional(),
  supportingFindings: z.array(z.string()).optional(),
  patientExplanation: z.string().optional(),
  confidenceLevel: z.enum(['high', 'moderate', 'supportive']).optional(),
  phenotypes: z.array(z.string()).optional(),
});

export type SupplementRecommendation = z.infer<typeof supplementRecommendationSchema>;

export const clinicalPhenotypeSchema = z.object({
  name: z.string(),
  confidence: z.enum(['high', 'moderate', 'low']),
  supportingFindings: z.array(z.string()),
  description: z.string(),
});

export type ClinicalPhenotype = z.infer<typeof clinicalPhenotypeSchema>;

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

// Insulin Resistance Screening Schemas
export const insulinResistanceMarkerSchema = z.object({
  name: z.string(),
  value: z.union([z.number(), z.string()]),
  threshold: z.string(),
  positive: z.boolean(),
  detail: z.string(),
});

export const insulinResistancePhenotypeSchema = z.object({
  name: z.string(),
  key: z.enum(['visceral_metabolic', 'hepatic', 'hormonal_pcos', 'early_lean']),
  triggerCriteria: z.array(z.string()),
  matchedCriteria: z.array(z.string()),
  pathophysiology: z.string(),
  treatmentRecommendations: z.array(z.string()),
  monitoringPlan: z.string(),
  patientExplanation: z.string(),
});

export const insulinResistanceScreeningSchema = z.object({
  markers: z.array(insulinResistanceMarkerSchema),
  positiveCount: z.number(),
  likelihood: z.enum(['none', 'moderate', 'high']),
  likelihoodLabel: z.string(),
  phenotypes: z.array(insulinResistancePhenotypeSchema),
  confirmationTests: z.string(),
  providerSummary: z.string(),
});

export type InsulinResistanceMarker = z.infer<typeof insulinResistanceMarkerSchema>;
export type InsulinResistancePhenotype = z.infer<typeof insulinResistancePhenotypeSchema>;
export type InsulinResistanceScreening = z.infer<typeof insulinResistanceScreeningSchema>;

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
  insulinResistance: insulinResistanceScreeningSchema.optional(),
  clinicalPhenotypes: z.array(clinicalPhenotypeSchema).optional(),
  soapNote: z.string().optional(),
});

export type InterpretationResult = z.infer<typeof interpretationResultSchema>;

// API Request/Response Types
export const interpretLabsRequestSchema = labValuesSchema;
export type InterpretLabsRequest = z.infer<typeof interpretLabsRequestSchema>;

export const interpretLabsResponseSchema = interpretationResultSchema;
export type InterpretLabsResponse = z.infer<typeof interpretLabsResponseSchema>;

// Database Tables
// ─── Users (Clinician Accounts) ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  title: varchar("title", { length: 50 }).notNull(),
  npi: varchar("npi", { length: 20 }),
  clinicName: varchar("clinic_name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  address: text("address"),
  // Role: 'admin' can access the developer dashboard; 'clinician' is the default
  role: varchar("role", { length: 20 }).notNull().default("clinician"),
  // Subscription status — defaults to 'active' so all existing and manually-added
  // accounts keep full access when payment is added later. New self-registered users
  // can be defaulted to 'trial' at that point without affecting anyone already here.
  subscriptionStatus: varchar("subscription_status", { length: 30 }).notNull().default("active"),
  // Stripe billing
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),
  stripeCancelAtPeriodEnd: boolean("stripe_cancel_at_period_end").notNull().default(false),
  // Free/internal accounts — set by admin to bypass billing entirely
  freeAccount: boolean("free_account").notNull().default(false),
  notes: text("notes"), // Internal admin notes about this account
  // Password reset / invite tokens
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  // HIPAA: login lockout tracking
  loginAttempts: integer("login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  // Portal messaging preference: 'none' | 'in_app' | 'sms' | 'external_api'
  messagingPreference: varchar("messaging_preference", { length: 20 }).notNull().default("none"),
  // Phone number shown to patients for SMS messaging (e.g. Spruce Health number)
  messagingPhone: varchar("messaging_phone", { length: 30 }),
  // External API / two-way bridge messaging config
  externalMessagingProvider: varchar("external_messaging_provider", { length: 30 }), // 'spruce' | 'klara' | 'custom'
  externalMessagingApiKey: text("external_messaging_api_key"),               // encrypted at rest in future
  externalMessagingChannelId: varchar("external_messaging_channel_id", { length: 100 }), // Spruce channel ID / inbox number
  externalMessagingWebhookSecret: varchar("external_messaging_webhook_secret", { length: 100 }), // auto-generated, shared with external system
  // ── Multi-clinic foundation (nullable — populated by migration) ──────────
  // No FK constraint here to avoid circular reference with clinics table
  defaultClinicId: integer("default_clinic_id"),
  userType: varchar("user_type", { length: 30 }), // 'solo_admin' | 'clinic_admin' | 'provider' | 'staff'
  // Clinic branding & provider signature — stored as base64 data URLs
  clinicLogo: text("clinic_logo"),
  signatureImage: text("signature_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── BAA Signatures ────────────────────────────────────────────────────────────

export const baaSignatures = pgTable("baa_signatures", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  signatureName: varchar("signature_name", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 100 }),
  userAgent: text("user_agent"),
  baaVersion: varchar("baa_version", { length: 20 }).notNull().default("1.0"),
});

export const insertBaaSignatureSchema = createInsertSchema(baaSignatures).omit({ id: true, signedAt: true });
export type InsertBaaSignature = z.infer<typeof insertBaaSignatureSchema>;
export type BaaSignature = typeof baaSignatures.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Patients ─────────────────────────────────────────────────────────────────
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: timestamp("date_of_birth"),
  gender: varchar("gender", { length: 10 }).notNull().default('male'),
  mrn: varchar("mrn", { length: 50 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  preferredPharmacy: text("preferred_pharmacy"),
  // ── Multi-clinic foundation (nullable — populated by migration) ──────────
  clinicId: integer("clinic_id"),            // No FK constraint during initial rollout
  primaryProviderId: integer("primary_provider_id"), // No FK constraint during initial rollout
  primaryProvider: varchar("primary_provider", { length: 100 }), // Display name of the assigned provider
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const labResults = pgTable("lab_results", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  labDate: timestamp("lab_date").notNull(),
  labValues: jsonb("lab_values").$type<LabValues | FemaleLabValues>().notNull(),
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
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
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

// ─── Clinician Staff (team members who share clinician workspace) ─────────────
export const clinicianStaff = pgTable("clinician_staff", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  // 'nurse' | 'assistant' | 'staff'
  role: varchar("role", { length: 50 }).notNull().default("staff"),
  passwordHash: varchar("password_hash", { length: 255 }),
  inviteToken: varchar("invite_token", { length: 255 }),
  inviteExpires: timestamp("invite_expires"),
  isActive: boolean("is_active").notNull().default(true),
  // HIPAA: login lockout tracking
  loginAttempts: integer("login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertClinicianStaffSchema = createInsertSchema(clinicianStaff).omit({
  id: true,
  createdAt: true,
});

export type InsertClinicianStaff = z.infer<typeof insertClinicianStaffSchema>;
export type ClinicianStaff = typeof clinicianStaff.$inferSelect;

// ─── Patient Portal Accounts ───────────────────────────────────────────────────
export const patientPortalAccounts = pgTable("patient_portal_accounts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }).unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  inviteToken: varchar("invite_token", { length: 255 }),
  inviteExpires: timestamp("invite_expires"),
  passwordResetToken: varchar("password_reset_token", { length: 255 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPatientPortalAccountSchema = createInsertSchema(patientPortalAccounts).omit({
  id: true,
  createdAt: true,
});

export type InsertPatientPortalAccount = z.infer<typeof insertPatientPortalAccountSchema>;
export type PatientPortalAccount = typeof patientPortalAccounts.$inferSelect;

// ─── Published Protocols ───────────────────────────────────────────────────────
export const publishedProtocols = pgTable("published_protocols", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  labResultId: integer("lab_result_id").references(() => labResults.id, { onDelete: 'cascade' }),
  clinicianId: integer("clinician_id").notNull().references(() => users.id),
  supplements: jsonb("supplements").$type<SupplementRecommendation[]>().notNull(),
  clinicianNotes: text("clinician_notes"),
  dietaryGuidance: text("dietary_guidance"),
  labDate: timestamp("lab_date"),
  publishedAt: timestamp("published_at").defaultNow().notNull(),
  firstViewedAt: timestamp("first_viewed_at"),
});

export const insertPublishedProtocolSchema = createInsertSchema(publishedProtocols).omit({
  id: true,
  publishedAt: true,
});

export type InsertPublishedProtocol = z.infer<typeof insertPublishedProtocolSchema>;
export type PublishedProtocol = typeof publishedProtocols.$inferSelect;

// ─── Portal Messages (in-app messaging between patient and clinician) ──────────
export const portalMessages = pgTable("portal_messages", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // 'patient' | 'clinician'
  senderType: varchar("sender_type", { length: 20 }).notNull(),
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  // ID from external system (Spruce, Klara, etc.) — used for deduplication
  externalMessageId: varchar("external_message_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPortalMessageSchema = createInsertSchema(portalMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertPortalMessage = z.infer<typeof insertPortalMessageSchema>;
export type PortalMessage = typeof portalMessages.$inferSelect;

// ─── Saved Recipes (patient portal) ──────────────────────────────────────────
export const savedRecipes = pgTable("saved_recipes", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  foodName: text("food_name").notNull(),
  recipeName: text("recipe_name").notNull(),
  recipeData: jsonb("recipe_data").notNull(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
});

export const insertSavedRecipeSchema = createInsertSchema(savedRecipes).omit({ id: true, savedAt: true });
export type InsertSavedRecipe = z.infer<typeof insertSavedRecipeSchema>;
export type SavedRecipe = typeof savedRecipes.$inferSelect;

// ─── Supplement Orders (patient portal) ──────────────────────────────────────
export interface SupplementOrderItem {
  name: string;
  dose: string;
  price: number;
  quantity: number;
  supplyDays: number;
  lineTotal: number;
}

export const supplementOrders = pgTable("supplement_orders", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  items: jsonb("items").$type<SupplementOrderItem[]>().notNull(),
  subtotal: text("subtotal").notNull(),
  status: varchar("status", { length: 30 }).notNull().default('pending'),
  patientNotes: text("patient_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSupplementOrderSchema = createInsertSchema(supplementOrders).omit({ id: true, createdAt: true });
export type InsertSupplementOrder = z.infer<typeof insertSupplementOrderSchema>;
export type SupplementOrder = typeof supplementOrders.$inferSelect;

// ─── HIPAA Audit Logs ──────────────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").references(() => users.id, { onDelete: 'set null' }),
  staffId: integer("staff_id").references(() => clinicianStaff.id, { onDelete: 'set null' }),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId: integer("resource_id"),
  patientId: integer("patient_id").references(() => patients.id, { onDelete: 'set null' }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// ─── Clinician Supplement Customization ────────────────────────────────────────

// Discount/pricing settings per clinician
export const clinicianSupplementSettings = pgTable("clinician_supplement_settings", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  discountType: varchar("discount_type", { length: 20 }).notNull().default("percent"), // 'percent' | 'flat' | 'none'
  discountPercent: integer("discount_percent").notNull().default(20), // e.g. 20 for 20%
  discountFlat: integer("discount_flat_cents").notNull().default(0),  // flat $ off in cents
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ClinicianSupplementSettings = typeof clinicianSupplementSettings.$inferSelect;
export const insertClinicianSupplementSettingsSchema = createInsertSchema(clinicianSupplementSettings).omit({ id: true, updatedAt: true });
export type InsertClinicianSupplementSettings = z.infer<typeof insertClinicianSupplementSettingsSchema>;

// Custom supplement catalog entry per clinician
export const clinicianSupplements = pgTable("clinician_supplements", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 200 }).notNull(),
  brand: varchar("brand", { length: 100 }),
  dose: varchar("dose", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("general"), // cardiovascular, hormone-support, thyroid, etc.
  description: text("description"), // AI-generated patient-facing description
  clinicalRationale: text("clinical_rationale"), // clinical notes for provider
  priceCents: integer("price_cents").notNull().default(0), // price in cents
  isActive: boolean("is_active").notNull().default(true),
  gender: varchar("gender", { length: 10 }).notNull().default("both"), // 'male' | 'female' | 'both'
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ClinicianSupplement = typeof clinicianSupplements.$inferSelect;
export const insertClinicianSupplementSchema = createInsertSchema(clinicianSupplements).omit({ id: true, createdAt: true });
export type InsertClinicianSupplement = z.infer<typeof insertClinicianSupplementSchema>;

// Trigger rules per custom supplement
export const clinicianSupplementRules = pgTable("clinician_supplement_rules", {
  id: serial("id").primaryKey(),
  supplementId: integer("supplement_id").notNull().references(() => clinicianSupplements.id, { onDelete: 'cascade' }),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  triggerType: varchar("trigger_type", { length: 20 }).notNull().default("lab"), // 'lab' | 'symptom' | 'both'
  // Lab trigger fields
  labMarker: varchar("lab_marker", { length: 50 }), // e.g. 'vitaminD', 'testosterone'
  labMin: real("lab_min"),   // lower bound of trigger range (null = no lower bound)
  labMax: real("lab_max"),   // upper bound of trigger range (null = no upper bound)
  // Symptom trigger fields
  symptomKey: varchar("symptom_key", { length: 50 }), // e.g. 'brainFog', 'fatigue', 'hairLoss'
  // When triggerType='both': how to combine lab + symptom conditions
  combinationLogic: varchar("combination_logic", { length: 5 }).notNull().default("OR"), // 'AND' | 'OR'
  priority: varchar("priority", { length: 10 }).notNull().default("medium"), // 'high' | 'medium' | 'low'
  indicationText: text("indication_text"), // what shows as the clinical indication
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ClinicianSupplementRule = typeof clinicianSupplementRules.$inferSelect;
export const insertClinicianSupplementRuleSchema = createInsertSchema(clinicianSupplementRules).omit({ id: true, createdAt: true });
export type InsertClinicianSupplementRule = z.infer<typeof insertClinicianSupplementRuleSchema>;

// Per-clinician lab range overrides
export const clinicianLabPreferences = pgTable("clinician_lab_preferences", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  markerKey: varchar("marker_key", { length: 50 }).notNull(), // e.g. 'testosterone', 'vitaminD'
  gender: varchar("gender", { length: 10 }).notNull().default("both"), // 'male' | 'female' | 'both'
  displayName: varchar("display_name", { length: 100 }),
  unit: varchar("unit", { length: 30 }),
  // Optimal range (clinician's preferred goal range)
  optimalMin: real("optimal_min"),
  optimalMax: real("optimal_max"),
  // Standard reference (clinician may adjust if using functional ranges)
  normalMin: real("normal_min"),
  normalMax: real("normal_max"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ClinicianLabPreference = typeof clinicianLabPreferences.$inferSelect;
export const insertClinicianLabPreferenceSchema = createInsertSchema(clinicianLabPreferences).omit({ id: true, updatedAt: true });
export type InsertClinicianLabPreference = z.infer<typeof insertClinicianLabPreferenceSchema>;

// ── Clinical Encounter Documentation ─────────────────────────────────────────

export type SoapNote = {
  fullNote?: string;
  subjective?: string;
  objective?: string;
  reviewOfSystems?: string;
  assessment?: string;
  plan?: string;
  uncertain_items?: string[];
  needs_clinician_review?: string[];
};

export type EncounterVersion = {
  version: number;
  soapNote: SoapNote;
  signedAt: string;
  signedBy: string;
  action: 'initial_sign' | 'amendment';
};

export type DiarizedUtterance = {
  id: number;
  speaker: "clinician" | "patient" | "unknown";
  speakerRaw: string;
  start: number;
  end: number;
  text: string;
  normalizedText?: string;
  corrections?: string[];
};

export type ClinicalExtraction = {
  visit_type: string;
  chief_concerns: string[];
  symptoms_reported: string[];
  symptoms_denied: string[];
  medications_current: string[];
  medication_changes_discussed: string[];
  labs_reviewed: string[];
  diagnoses_discussed: string[];
  assessment_candidates: string[];
  plan_candidates: string[];
  follow_up_items: string[];
  patient_questions: string[];
  red_flags: string[];
  uncertain_items: string[];
  source_utterance_ids: number[];
};

export type EvidenceCitation = {
  title: string;
  source: string;
  year: string;
  url?: string;
};

export type EvidenceSuggestion = {
  title: string;
  summary: string;
  relevance_to_visit: string;
  strength_of_support: "strong" | "moderate" | "limited" | "mixed" | "insufficient";
  guideline_class?: "I" | "IIa" | "IIb" | "III";
  level_of_evidence?: "A" | "B" | "C" | "E";
  plan_alignment?: "aligned" | "gap_identified" | "potential_conflict" | "not_applicable";
  plan_alignment_note?: string;
  cautions: string[];
  citations: EvidenceCitation[];
  is_evidence_informed_consideration?: boolean;
};

export type GuidelineValidation = {
  guideline: string;
  finding: string;
  current_plan_status: "aligned" | "gap" | "conflict" | "not_addressed";
  recommendation: string;
  clinician_decision_needed: boolean;
};

export type EvidenceOverlay = {
  clinical_questions: string[];
  suggestions: EvidenceSuggestion[];
  guideline_validations?: GuidelineValidation[];
  not_for_auto_insertion: true;
};

// ── Pattern / Phenotype Matching ─────────────────────────────────────────────

export type PatternEvidenceBasis =
  | "symptom_based"     // derived from transcript symptoms only, no lab confirmation
  | "lab_backed"        // confirmed by linked lab values
  | "combined"          // transcript + lab data together
  | "insufficient";     // not enough data to assess

export type PatternConfidence =
  | "possible"          // early signal — needs confirmation
  | "probable"          // strong symptomatic or lab signal
  | "confirmed";        // meets diagnostic/clinical criteria with evidence

export type PatternCategory =
  | "perimenopause"
  | "testosterone_optimization"
  | "insulin_resistance"
  | "thyroid"
  | "lipid_cardiometabolic"
  | "adrenal_hpa"
  | "nutrient_deficiency"
  | "other";

export type PatternMatch = {
  pattern_name: string;
  category: PatternCategory;
  evidence_basis: PatternEvidenceBasis;
  confidence: PatternConfidence;
  supporting_evidence: string[];    // quotes or facts from transcript/labs
  contradicting_evidence: string[]; // things that argue against this pattern
  recommended_considerations: string[];
  requires_lab_confirmation: boolean;
  lab_markers_to_evaluate?: string[];
  notes: string;
};

export type PatternMatchResult = {
  mode: "transcript_only" | "context_linked";
  matched_patterns: PatternMatch[];
  symptom_clusters: string[];        // symptom groupings noted in the visit
  unmatched_concerns: string[];      // things discussed that don't fit a pattern
  lab_context_used: boolean;         // whether linked lab data was incorporated
  lab_result_id?: number;            // which lab result was used (if any)
  generated_at: string;              // ISO timestamp
};

export type ValidationFlag = {
  type: "unsupported_diagnosis" | "unsupported_medication" | "unsupported_exam" | "missing_citation" | "contradicts_visit" | "unsupported_plan_jump";
  item: string;
  detail: string;
  severity: "warning" | "error";
};

export type ValidationResult = {
  soap_flags: ValidationFlag[];
  evidence_flags: ValidationFlag[];
  validated_at: string;
  overall_status: "pass" | "flag" | "fail";
};

export const clinicalEncounters = pgTable("clinical_encounters", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  visitDate: timestamp("visit_date").notNull(),
  visitType: varchar("visit_type", { length: 50 }).notNull().default("follow-up"),
  chiefComplaint: text("chief_complaint"),
  transcription: text("transcription"),
  audioProcessed: boolean("audio_processed").notNull().default(false),
  linkedLabResultId: integer("linked_lab_result_id").references(() => labResults.id, { onDelete: 'set null' }),
  soapNote: jsonb("soap_note").$type<SoapNote>(),
  soapGeneratedAt: timestamp("soap_generated_at"),
  patientSummary: text("patient_summary"),
  summaryPublished: boolean("summary_published").notNull().default(false),
  summaryPublishedAt: timestamp("summary_published_at"),
  clinicianNotes: text("clinician_notes"),
  diarizedTranscript: jsonb("diarized_transcript").$type<DiarizedUtterance[]>(),
  clinicalExtraction: jsonb("clinical_extraction").$type<ClinicalExtraction>(),
  evidenceSuggestions: jsonb("evidence_suggestions").$type<EvidenceOverlay>(),
  patternMatch: jsonb("pattern_match").$type<PatternMatchResult>(),
  // ── Signing & Amendment (EMR-style chart locking) ────────────────────────
  signedAt: timestamp("signed_at"),
  signedBy: varchar("signed_by", { length: 300 }),        // "Title First Last, Credentials"
  isAmended: boolean("is_amended").notNull().default(false),
  amendedAt: timestamp("amended_at"),
  encounterVersions: jsonb("encounter_versions").$type<EncounterVersion[]>(), // audit trail
  // ── Multi-clinic foundation (nullable — populated by migration) ──────────
  clinicId: integer("clinic_id"),   // No FK constraint during initial rollout
  providerId: integer("provider_id"), // No FK constraint during initial rollout
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClinicalEncounter = typeof clinicalEncounters.$inferSelect;
export const insertClinicalEncounterSchema = createInsertSchema(clinicalEncounters).omit({
  id: true, createdAt: true, updatedAt: true, soapGeneratedAt: true, summaryPublishedAt: true,
});
export type InsertClinicalEncounter = z.infer<typeof insertClinicalEncounterSchema>;

// ─── Appointments (Boulevard sync via Zapier) ──────────────────────────────
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").references(() => patients.id, { onDelete: "set null" }),
  boulevardAppointmentId: varchar("boulevard_appointment_id", { length: 255 }).notNull(),
  patientName: varchar("patient_name", { length: 200 }).notNull(),
  patientEmail: varchar("patient_email", { length: 255 }),
  patientPhone: varchar("patient_phone", { length: 50 }),
  serviceType: varchar("service_type", { length: 255 }),
  staffName: varchar("staff_name", { length: 200 }),
  locationName: varchar("location_name", { length: 255 }),
  appointmentStart: timestamp("appointment_start").notNull(),
  appointmentEnd: timestamp("appointment_end"),
  durationMinutes: integer("duration_minutes"),
  status: varchar("status", { length: 50 }).notNull().default("scheduled"),
  notes: text("notes"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true, createdAt: true, updatedAt: true,
});

// ─── Patient Chart (EHR-style persistent clinical history) ────────────────
// Stores medication list, medical/family/social/surgical history and allergies.
// AI extracts a draft from encounter transcripts/SOAP; clinician approves before save.

export type PatientChartDraft = {
  currentMedications: string[];
  medicalHistory: string[];
  familyHistory: string[];
  socialHistory: string[];
  allergies: string[];
  surgicalHistory: string[];
  extractedAt: string;    // ISO timestamp
  encounterId: number;
  encounterDate: string;  // display string
  visitType: string;
};

export const patientCharts = pgTable("patient_charts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Approved / saved sections (stored as JSON arrays for flexibility)
  currentMedications: jsonb("current_medications").$type<string[]>().notNull().default([]),
  medicalHistory: jsonb("medical_history").$type<string[]>().notNull().default([]),
  familyHistory: jsonb("family_history").$type<string[]>().notNull().default([]),
  socialHistory: jsonb("social_history").$type<string[]>().notNull().default([]),
  allergies: jsonb("allergies").$type<string[]>().notNull().default([]),
  surgicalHistory: jsonb("surgical_history").$type<string[]>().notNull().default([]),
  // AI-extracted draft pending clinician approval
  draftExtraction: jsonb("draft_extraction").$type<PatientChartDraft>(),
  draftFromEncounterId: integer("draft_from_encounter_id"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PatientChart = typeof patientCharts.$inferSelect;
export const insertPatientChartSchema = createInsertSchema(patientCharts).omit({
  id: true, updatedAt: true,
});
export type InsertPatientChart = z.infer<typeof insertPatientChartSchema>;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;

// ─── Medication Dictionary ─────────────────────────────────────────────────
export const medicationDictionaries = pgTable("medication_dictionaries", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  entryCount: integer("entry_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const insertMedicationDictionarySchema = createInsertSchema(medicationDictionaries).omit({ id: true, uploadedAt: true });
export type InsertMedicationDictionary = z.infer<typeof insertMedicationDictionarySchema>;
export type MedicationDictionary = typeof medicationDictionaries.$inferSelect;

export const medicationEntries = pgTable("medication_entries", {
  id: serial("id").primaryKey(),
  dictionaryId: integer("dictionary_id").notNull().references(() => medicationDictionaries.id, { onDelete: "cascade" }),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  genericName: varchar("generic_name", { length: 255 }).notNull(),
  brandNames: text("brand_names").array().notNull().default([]),
  commonSpokenVariants: text("common_spoken_variants").array().notNull().default([]),
  commonMisspellings: text("common_misspellings").array().notNull().default([]),
  drugClass: varchar("drug_class", { length: 255 }),
  subclass: varchar("subclass", { length: 255 }),
  route: varchar("route", { length: 100 }),
  notes: text("notes"),
});

export const insertMedicationEntrySchema = createInsertSchema(medicationEntries).omit({ id: true });
export type InsertMedicationEntry = z.infer<typeof insertMedicationEntrySchema>;
export type MedicationEntry = typeof medicationEntries.$inferSelect;

export type MedicationMatch = {
  originalTerm: string;
  canonicalName: string;
  drugClass: string | null;
  subclass: string | null;
  route: string | null;
  matchType: "generic" | "brand" | "spoken_variant" | "misspelling" | "fuzzy";
  confidence: number;
  needsReview: boolean;
  notes: string | null;
  startIndex: number;
  endIndex: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-CLINIC SUITE FOUNDATION
// All tables below are ADDITIVE. Existing solo-provider workflows continue
// to function unchanged via the legacy userId ownership model. These tables
// support future multi-provider clinic suites without disrupting launch.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Clinics ──────────────────────────────────────────────────────────────
// Top-level account entity. Each solo user maps to one clinic (1:1 today,
// 1:many in future multi-provider mode).
export const clinics = pgTable("clinics", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 100 }),
  ownerUserId: integer("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  // Plan gating — enforced at application level, not by separate ownership structure.
  // Solo plan: maxProviders = 1. Clinic plan: maxProviders = null (unlimited) or a set number.
  // Upgrading Solo → Clinic is a maxProviders change only; no data migration required.
  subscriptionStatus: varchar("subscription_status", { length: 30 }),
  subscriptionPlan: varchar("subscription_plan", { length: 30 }), // 'solo' | 'suite' | 'enterprise'
  // Seat model:
  //   maxProviders         = baseProviderLimit + extraProviderSeats  (the authoritative cap)
  //   baseProviderLimit    = providers included in the plan price (solo=1, suite=2)
  //   extraProviderSeats   = purchased add-on seats billed at $79/mo each
  maxProviders: integer("max_providers").notNull().default(1),
  baseProviderLimit: integer("base_provider_limit").notNull().default(1),
  extraProviderSeats: integer("extra_provider_seats").notNull().default(0),
  stripeCustomerId: varchar("stripe_customer_id", { length: 100 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 100 }),
  trialEndsAt: timestamp("trial_ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Clinic = typeof clinics.$inferSelect;
export const insertClinicSchema = createInsertSchema(clinics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinic = z.infer<typeof insertClinicSchema>;

// ─── Clinic Memberships ───────────────────────────────────────────────────
// Connects users to clinics with a role. A user may eventually belong to
// multiple clinics (multi-clinic network). For now: one membership per user.
export const clinicMemberships = pgTable("clinic_memberships", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Legacy single-role field — kept for backward compat. Use clinicalRole + adminRole going forward.
  role: varchar("role", { length: 30 }).notNull().default("provider"), // 'admin' | 'provider' | 'staff'
  // Clinical role: what this person does clinically (signing authority, rendering provider, etc.)
  // 'provider' = MD/DO/NP/PA — can sign notes, appears as rendering clinician
  // 'rn'       = Registered Nurse — limited signing authority
  // 'staff'    = Non-clinical staff — no signing authority
  clinicalRole: varchar("clinical_role", { length: 30 }).notNull().default("provider"),
  // Administrative role: what this person can manage operationally
  // 'owner'         = Full control including billing and user management
  // 'admin'         = Full operational access, no billing
  // 'limited_admin' = Can manage forms, scheduling; no billing/user-management
  // 'standard'      = No admin access
  adminRole: varchar("admin_role", { length: 30 }).notNull().default("standard"),
  isActive: boolean("is_active").notNull().default(true),
  isPrimaryClinic: boolean("is_primary_clinic").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ClinicMembership = typeof clinicMemberships.$inferSelect;
export const insertClinicMembershipSchema = createInsertSchema(clinicMemberships).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClinicMembership = z.infer<typeof insertClinicMembershipSchema>;

// ─── Providers ────────────────────────────────────────────────────────────
// Provider profile layer. Current solo users each get one provider record.
// Future: a clinic may have multiple providers; users with role='staff' may
// not have a provider record at all.
export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: varchar("display_name", { length: 200 }).notNull(),
  credentials: varchar("credentials", { length: 100 }),
  specialty: varchar("specialty", { length: 100 }),
  npi: varchar("npi", { length: 20 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type Provider = typeof providers.$inferSelect;
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;

// ─── Patient Assignments ──────────────────────────────────────────────────
// Assigns patients to providers. Supports primary and future collaborative
// assignments. Additive — existing patient.userId ownership still works.
export const patientAssignments = pgTable("patient_assignments", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  assignmentType: varchar("assignment_type", { length: 30 }).notNull().default("primary"),
  isActive: boolean("is_active").notNull().default(true),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  assignedByUserId: integer("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type PatientAssignment = typeof patientAssignments.$inferSelect;
export const insertPatientAssignmentSchema = createInsertSchema(patientAssignments).omit({ id: true, assignedAt: true, createdAt: true, updatedAt: true });
export type InsertPatientAssignment = z.infer<typeof insertPatientAssignmentSchema>;

// ─── Internal Messages ────────────────────────────────────────────────────
// Clinic-internal messaging between staff/providers. Backend foundation only
// — no UI rollout until messaging feature is fully designed.
export const internalMessages = pgTable("internal_messages", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  senderUserId: integer("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientUserId: integer("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  patientId: integer("patient_id").references(() => patients.id, { onDelete: "set null" }),
  subject: varchar("subject", { length: 255 }),
  body: text("body").notNull(),
  threadId: integer("thread_id"), // self-reference; null = thread root
  messageType: varchar("message_type", { length: 30 }).notNull().default("direct"), // 'direct' | 'patient_thread' | 'system'
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type InternalMessage = typeof internalMessages.$inferSelect;
export const insertInternalMessageSchema = createInsertSchema(internalMessages).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInternalMessage = z.infer<typeof insertInternalMessageSchema>;

// ─── Internal Message Participants ────────────────────────────────────────
export const internalMessageParticipants = pgTable("internal_message_participants", {
  id: serial("id").primaryKey(),
  messageThreadId: integer("message_thread_id").notNull().references(() => internalMessages.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type InternalMessageParticipant = typeof internalMessageParticipants.$inferSelect;

// ─── Appointment Types ────────────────────────────────────────────────────
// Clinic-defined visit types for future scheduling (foundation only).
export const appointmentTypes = pgTable("appointment_types", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  color: varchar("color", { length: 20 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type AppointmentType = typeof appointmentTypes.$inferSelect;
export const insertAppointmentTypeSchema = createInsertSchema(appointmentTypes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppointmentType = z.infer<typeof insertAppointmentTypeSchema>;

// ─── Provider Availability ────────────────────────────────────────────────
// Weekly availability windows per provider (scheduling foundation).
export const providerAvailability = pgTable("provider_availability", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun … 6=Sat
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  timezone: varchar("timezone", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type ProviderAvailability = typeof providerAvailability.$inferSelect;
export const insertProviderAvailabilitySchema = createInsertSchema(providerAvailability).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProviderAvailability = z.infer<typeof insertProviderAvailabilitySchema>;

// ─── Calendar Blocks ──────────────────────────────────────────────────────
// Blocked time on a provider's calendar (breaks, time-off, admin time).
export const calendarBlocks = pgTable("calendar_blocks", {
  id: serial("id").primaryKey(),
  clinicId: integer("clinic_id").notNull().references(() => clinics.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  blockType: varchar("block_type", { length: 30 }).notNull().default("other"), // 'break' | 'time_off' | 'admin' | 'other'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type CalendarBlock = typeof calendarBlocks.$inferSelect;
export const insertCalendarBlockSchema = createInsertSchema(calendarBlocks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalendarBlock = z.infer<typeof insertCalendarBlockSchema>;

// ─── Smart Intake + Digital Forms ───────────────────────────────────────────

export const intakeForms = pgTable("intake_forms", {
  id: serial("id").primaryKey(),
  clinicianId: integer("clinician_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 120 }),
  description: text("description"),
  category: varchar("category", { length: 60 }).notNull().default("custom"),
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  brandingJson: jsonb("branding_json"),
  settingsJson: jsonb("settings_json"),
  requiresPatientSignature: boolean("requires_patient_signature").notNull().default(false),
  requiresStaffSignature: boolean("requires_staff_signature").notNull().default(false),
  allowLink: boolean("allow_link").notNull().default(true),
  allowEmbed: boolean("allow_embed").notNull().default(true),
  allowTablet: boolean("allow_tablet").notNull().default(true),
  isPublic: boolean("is_public").notNull().default(false),
  expirationType: varchar("expiration_type", { length: 20 }).notNull().default("none"),
  expirationIntervalDays: integer("expiration_interval_days"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type IntakeForm = typeof intakeForms.$inferSelect;
export const insertIntakeFormSchema = createInsertSchema(intakeForms).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIntakeForm = z.infer<typeof insertIntakeFormSchema>;

export const formSections = pgTable("form_sections", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => intakeForms.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  isRepeatable: boolean("is_repeatable").notNull().default(false),
  conditionalLogicJson: jsonb("conditional_logic_json"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type FormSection = typeof formSections.$inferSelect;
export const insertFormSectionSchema = createInsertSchema(formSections).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormSection = z.infer<typeof insertFormSectionSchema>;

export const formFields = pgTable("form_fields", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => intakeForms.id, { onDelete: "cascade" }),
  sectionId: integer("section_id").references(() => formSections.id, { onDelete: "set null" }),
  fieldKey: varchar("field_key", { length: 120 }).notNull(),
  smartFieldKey: varchar("smart_field_key", { length: 60 }),
  label: text("label").notNull(),
  fieldType: varchar("field_type", { length: 40 }).notNull(),
  helpText: text("help_text"),
  placeholder: text("placeholder"),
  isRequired: boolean("is_required").notNull().default(false),
  isHidden: boolean("is_hidden").notNull().default(false),
  defaultValueJson: jsonb("default_value_json"),
  optionsJson: jsonb("options_json"),
  validationJson: jsonb("validation_json"),
  conditionalLogicJson: jsonb("conditional_logic_json"),
  layoutJson: jsonb("layout_json"),
  syncConfigJson: jsonb("sync_config_json"),
  duplicateHandlingJson: jsonb("duplicate_handling_json"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type FormField = typeof formFields.$inferSelect;
export const insertFormFieldSchema = createInsertSchema(formFields).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormField = z.infer<typeof insertFormFieldSchema>;

export const formPublications = pgTable("form_publications", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => intakeForms.id, { onDelete: "cascade" }),
  publicToken: varchar("public_token", { length: 80 }).notNull().unique(),
  mode: varchar("mode", { length: 20 }).notNull().default("link"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  embedSettingsJson: jsonb("embed_settings_json"),
  linkSettingsJson: jsonb("link_settings_json"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type FormPublication = typeof formPublications.$inferSelect;
export const insertFormPublicationSchema = createInsertSchema(formPublications).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormPublication = z.infer<typeof insertFormPublicationSchema>;

export const patientFormAssignments = pgTable("patient_form_assignments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  formId: integer("form_id").notNull().references(() => intakeForms.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  dueAt: timestamp("due_at"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  completionRequired: boolean("completion_required").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type PatientFormAssignment = typeof patientFormAssignments.$inferSelect;
export const insertPatientFormAssignmentSchema = createInsertSchema(patientFormAssignments).omit({ id: true, assignedAt: true, createdAt: true, updatedAt: true });
export type InsertPatientFormAssignment = z.infer<typeof insertPatientFormAssignmentSchema>;

export const formSubmissions = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  formId: integer("form_id").notNull().references(() => intakeForms.id, { onDelete: "cascade" }),
  formVersion: integer("form_version").notNull().default(1),
  clinicianId: integer("clinician_id").references(() => users.id),
  patientId: integer("patient_id").references(() => patients.id, { onDelete: "set null" }),
  assignmentId: integer("assignment_id").references(() => patientFormAssignments.id, { onDelete: "set null" }),
  submittedByPatient: boolean("submitted_by_patient").notNull().default(false),
  submittedByStaff: boolean("submitted_by_staff").notNull().default(false),
  submissionSource: varchar("submission_source", { length: 20 }).notNull().default("link"),
  status: varchar("status", { length: 20 }).notNull().default("submitted"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  rawSubmissionJson: jsonb("raw_submission_json").notNull(),
  normalizedSubmissionJson: jsonb("normalized_submission_json"),
  signatureJson: jsonb("signature_json"),
  reviewStatus: varchar("review_status", { length: 20 }).notNull().default("pending"),
  syncStatus: varchar("sync_status", { length: 20 }).notNull().default("not_synced"),
  syncSummaryJson: jsonb("sync_summary_json"),
  submitterName: text("submitter_name"),
  submitterEmail: text("submitter_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type FormSubmission = typeof formSubmissions.$inferSelect;
export const insertFormSubmissionSchema = createInsertSchema(formSubmissions).omit({ id: true, submittedAt: true, createdAt: true, updatedAt: true });
export type InsertFormSubmission = z.infer<typeof insertFormSubmissionSchema>;

export const formSyncEvents = pgTable("form_sync_events", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id").notNull().references(() => formSubmissions.id, { onDelete: "cascade" }),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  targetDomain: varchar("target_domain", { length: 40 }).notNull(),
  targetRecordId: integer("target_record_id"),
  actionType: varchar("action_type", { length: 30 }).notNull(),
  resultStatus: varchar("result_status", { length: 20 }).notNull().default("success"),
  reviewRequired: boolean("review_required").notNull().default(false),
  duplicateDetected: boolean("duplicate_detected").notNull().default(false),
  detailsJson: jsonb("details_json"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type FormSyncEvent = typeof formSyncEvents.$inferSelect;
export const insertFormSyncEventSchema = createInsertSchema(formSyncEvents).omit({ id: true, createdAt: true });
export type InsertFormSyncEvent = z.infer<typeof insertFormSyncEventSchema>;

export const formExpirationTracking = pgTable("form_expiration_tracking", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  formId: integer("form_id").notNull().references(() => intakeForms.id, { onDelete: "cascade" }),
  latestSubmissionId: integer("latest_submission_id").references(() => formSubmissions.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at"),
  renewalStatus: varchar("renewal_status", { length: 20 }).notNull().default("current"),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type FormExpirationTracking = typeof formExpirationTracking.$inferSelect;
export const insertFormExpirationTrackingSchema = createInsertSchema(formExpirationTracking).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFormExpirationTracking = z.infer<typeof insertFormExpirationTrackingSchema>;
