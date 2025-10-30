import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";

// Lab Values Schema - Complete Men's Clinic Panel
export const labValuesSchema = z.object({
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
});

export type InterpretationResult = z.infer<typeof interpretationResultSchema>;

// API Request/Response Types
export const interpretLabsRequestSchema = labValuesSchema;
export type InterpretLabsRequest = z.infer<typeof interpretLabsRequestSchema>;

export const interpretLabsResponseSchema = interpretationResultSchema;
export type InterpretLabsResponse = z.infer<typeof interpretLabsResponseSchema>;
