// Default optimal lab ranges — the "hardwired brain" used as fallback when no clinician override exists
// Clinicians can override any of these via their Preferences settings

export interface LabMarkerDefault {
  key: string;
  displayName: string;
  unit: string;
  gender: 'male' | 'female' | 'both';
  optimalMin?: number;
  optimalMax?: number;
  normalMin?: number;
  normalMax?: number;
  notes?: string;
}

export const LAB_MARKER_DEFAULTS: LabMarkerDefault[] = [
  // ── HORMONES (Male) ───────────────────────────────────────────────────
  { key: 'testosterone', displayName: 'Total Testosterone', unit: 'ng/dL', gender: 'male', optimalMin: 600, optimalMax: 1200, normalMin: 300, normalMax: 1000, notes: 'Functional optimal range for TRT-managed patients' },
  { key: 'freeTestosterone', displayName: 'Free Testosterone', unit: 'pg/mL', gender: 'male', optimalMin: 15, optimalMax: 25, normalMin: 9, normalMax: 30, notes: 'Optimal free T for symptom resolution' },
  { key: 'shbg', displayName: 'SHBG', unit: 'nmol/L', gender: 'male', optimalMin: 20, optimalMax: 40, normalMin: 10, normalMax: 57 },
  { key: 'estradiol', displayName: 'Estradiol (Male)', unit: 'pg/mL', gender: 'male', optimalMin: 20, optimalMax: 40, normalMin: 10, normalMax: 50 },
  { key: 'psa', displayName: 'PSA', unit: 'ng/mL', gender: 'male', normalMin: 0, normalMax: 4.0, notes: 'Flag if >4.0 or velocity >1.4/year' },
  { key: 'dhea', displayName: 'DHEA-S', unit: 'µg/dL', gender: 'male', optimalMin: 300, optimalMax: 500, normalMin: 100, normalMax: 600 },
  { key: 'lh', displayName: 'LH', unit: 'mIU/mL', gender: 'male', normalMin: 1.5, normalMax: 9.3 },
  { key: 'prolactin', displayName: 'Prolactin', unit: 'ng/mL', gender: 'male', normalMin: 2, normalMax: 18 },

  // ── HORMONES (Female) ─────────────────────────────────────────────────
  { key: 'testosterone', displayName: 'Total Testosterone', unit: 'ng/dL', gender: 'female', optimalMin: 70, optimalMax: 150, normalMin: 15, normalMax: 70, notes: 'Functional optimization range for women' },
  { key: 'freeTestosterone', displayName: 'Free Testosterone', unit: 'pg/mL', gender: 'female', optimalMin: 3, optimalMax: 10, normalMin: 0.1, normalMax: 6.4 },
  { key: 'estradiol', displayName: 'Estradiol', unit: 'pg/mL', gender: 'female', optimalMin: 100, optimalMax: 250, normalMin: 20, normalMax: 400, notes: 'Varies by cycle phase and HRT status' },
  { key: 'progesterone', displayName: 'Progesterone', unit: 'ng/mL', gender: 'female', optimalMin: 5, optimalMax: 25, normalMin: 0.1, normalMax: 25, notes: 'Luteal phase optimal; postmenopausal goal 0.5-2 on HRT' },
  { key: 'fsh', displayName: 'FSH', unit: 'mIU/mL', gender: 'female', normalMin: 3, normalMax: 10, notes: 'Elevated in menopause (>30)' },
  { key: 'lh', displayName: 'LH', unit: 'mIU/mL', gender: 'female', normalMin: 2, normalMax: 15 },
  { key: 'dhea', displayName: 'DHEA-S', unit: 'µg/dL', gender: 'female', optimalMin: 150, optimalMax: 350, normalMin: 35, normalMax: 430 },
  { key: 'prolactin', displayName: 'Prolactin', unit: 'ng/mL', gender: 'female', normalMin: 2, normalMax: 29 },
  { key: 'shbg', displayName: 'SHBG', unit: 'nmol/L', gender: 'female', optimalMin: 30, optimalMax: 60, normalMin: 17, normalMax: 124 },

  // ── THYROID (Both) ────────────────────────────────────────────────────
  { key: 'tsh', displayName: 'TSH', unit: 'mIU/L', gender: 'both', optimalMin: 1.0, optimalMax: 2.5, normalMin: 0.4, normalMax: 4.5, notes: 'Functional optimal 1.0–2.5' },
  { key: 'freeT4', displayName: 'Free T4', unit: 'ng/dL', gender: 'both', optimalMin: 1.1, optimalMax: 1.6, normalMin: 0.8, normalMax: 1.8 },
  { key: 'freeT3', displayName: 'Free T3', unit: 'pg/mL', gender: 'both', optimalMin: 3.2, optimalMax: 4.2, normalMin: 2.3, normalMax: 4.2 },

  // ── BLOOD COUNTS (Both) ───────────────────────────────────────────────
  { key: 'hematocrit', displayName: 'Hematocrit', unit: '%', gender: 'male', optimalMin: 40, optimalMax: 50, normalMin: 38.5, normalMax: 54, notes: 'Flag if ≥50% on TRT; hold at ≥54%' },
  { key: 'hematocrit', displayName: 'Hematocrit', unit: '%', gender: 'female', optimalMin: 37, optimalMax: 46, normalMin: 35, normalMax: 47 },
  { key: 'hemoglobin', displayName: 'Hemoglobin', unit: 'g/dL', gender: 'male', optimalMin: 13.5, optimalMax: 17.5, normalMin: 13, normalMax: 18 },
  { key: 'hemoglobin', displayName: 'Hemoglobin', unit: 'g/dL', gender: 'female', optimalMin: 12, optimalMax: 16, normalMin: 11.5, normalMax: 16.5 },
  { key: 'rbc', displayName: 'RBC', unit: 'M/µL', gender: 'male', normalMin: 4.5, normalMax: 5.9 },
  { key: 'rbc', displayName: 'RBC', unit: 'M/µL', gender: 'female', normalMin: 4.0, normalMax: 5.2 },
  { key: 'wbc', displayName: 'WBC', unit: 'K/µL', gender: 'both', optimalMin: 4.5, optimalMax: 7.5, normalMin: 3.5, normalMax: 10.5 },
  { key: 'platelets', displayName: 'Platelets', unit: 'K/µL', gender: 'both', normalMin: 150, normalMax: 400 },
  { key: 'mcv', displayName: 'MCV', unit: 'fL', gender: 'both', optimalMin: 82, optimalMax: 94, normalMin: 80, normalMax: 100 },
  { key: 'ferritin', displayName: 'Ferritin', unit: 'ng/mL', gender: 'male', optimalMin: 70, optimalMax: 150, normalMin: 30, normalMax: 400 },
  { key: 'ferritin', displayName: 'Ferritin', unit: 'ng/mL', gender: 'female', optimalMin: 70, optimalMax: 150, normalMin: 15, normalMax: 200 },

  // ── METABOLIC (Both) ──────────────────────────────────────────────────
  { key: 'glucose', displayName: 'Fasting Glucose', unit: 'mg/dL', gender: 'both', optimalMin: 72, optimalMax: 90, normalMin: 70, normalMax: 99 },
  { key: 'a1c', displayName: 'Hemoglobin A1c', unit: '%', gender: 'both', optimalMin: 4.6, optimalMax: 5.3, normalMin: 4.0, normalMax: 5.7 },
  { key: 'insulin', displayName: 'Fasting Insulin', unit: 'µIU/mL', gender: 'both', optimalMin: 2, optimalMax: 6, normalMin: 2, normalMax: 25, notes: 'Functional optimal <6 for insulin sensitivity' },

  // ── LIPIDS (Both) ─────────────────────────────────────────────────────
  { key: 'totalCholesterol', displayName: 'Total Cholesterol', unit: 'mg/dL', gender: 'both', optimalMin: 160, optimalMax: 200, normalMin: 0, normalMax: 200 },
  { key: 'ldl', displayName: 'LDL Cholesterol', unit: 'mg/dL', gender: 'both', optimalMin: 0, optimalMax: 100, normalMin: 0, normalMax: 130 },
  { key: 'hdl', displayName: 'HDL Cholesterol', unit: 'mg/dL', gender: 'male', optimalMin: 50, optimalMax: 80, normalMin: 40, normalMax: 100 },
  { key: 'hdl', displayName: 'HDL Cholesterol', unit: 'mg/dL', gender: 'female', optimalMin: 55, optimalMax: 85, normalMin: 50, normalMax: 100 },
  { key: 'triglycerides', displayName: 'Triglycerides', unit: 'mg/dL', gender: 'both', optimalMin: 0, optimalMax: 100, normalMin: 0, normalMax: 150 },
  { key: 'apoB', displayName: 'ApoB', unit: 'mg/dL', gender: 'both', optimalMin: 0, optimalMax: 90, normalMin: 0, normalMax: 120 },
  { key: 'lpa', displayName: 'Lipoprotein(a)', unit: 'nmol/L', gender: 'both', optimalMin: 0, optimalMax: 75, normalMin: 0, normalMax: 125 },
  { key: 'hsCRP', displayName: 'hs-CRP', unit: 'mg/L', gender: 'both', optimalMin: 0, optimalMax: 1.0, normalMin: 0, normalMax: 3.0 },
  { key: 'homocysteine', displayName: 'Homocysteine', unit: 'µmol/L', gender: 'both', optimalMin: 6, optimalMax: 10, normalMin: 5, normalMax: 15 },

  // ── KIDNEY/LIVER (Both) ───────────────────────────────────────────────
  { key: 'creatinine', displayName: 'Creatinine', unit: 'mg/dL', gender: 'male', normalMin: 0.7, normalMax: 1.3 },
  { key: 'creatinine', displayName: 'Creatinine', unit: 'mg/dL', gender: 'female', normalMin: 0.5, normalMax: 1.1 },
  { key: 'egfr', displayName: 'eGFR', unit: 'mL/min', gender: 'both', optimalMin: 60, optimalMax: 120, normalMin: 60, normalMax: 120 },
  { key: 'bun', displayName: 'BUN', unit: 'mg/dL', gender: 'both', normalMin: 7, normalMax: 25 },
  { key: 'ast', displayName: 'AST', unit: 'U/L', gender: 'both', optimalMin: 10, optimalMax: 30, normalMin: 10, normalMax: 40 },
  { key: 'alt', displayName: 'ALT', unit: 'U/L', gender: 'both', optimalMin: 10, optimalMax: 30, normalMin: 7, normalMax: 45 },
  { key: 'bilirubin', displayName: 'Total Bilirubin', unit: 'mg/dL', gender: 'both', normalMin: 0.1, normalMax: 1.2 },

  // ── MICRONUTRIENTS (Both) ─────────────────────────────────────────────
  { key: 'vitaminD', displayName: 'Vitamin D (25-OH)', unit: 'ng/mL', gender: 'both', optimalMin: 60, optimalMax: 100, normalMin: 30, normalMax: 100, notes: 'Functional optimal 60–100 for hormone optimization' },
  { key: 'vitaminB12', displayName: 'Vitamin B12', unit: 'pg/mL', gender: 'both', optimalMin: 600, optimalMax: 1200, normalMin: 200, normalMax: 900, notes: 'Functional optimal ≥600 for neurologic health' },
  { key: 'folate', displayName: 'Folate', unit: 'ng/mL', gender: 'both', optimalMin: 15, optimalMax: 40, normalMin: 3, normalMax: 17 },

  // ── ELECTROLYTES (Both) ───────────────────────────────────────────────
  { key: 'sodium', displayName: 'Sodium', unit: 'mEq/L', gender: 'both', normalMin: 136, normalMax: 145 },
  { key: 'potassium', displayName: 'Potassium', unit: 'mEq/L', gender: 'both', optimalMin: 4.0, optimalMax: 4.8, normalMin: 3.5, normalMax: 5.0 },

  // ── OTHER (Both) ──────────────────────────────────────────────────────
  { key: 'uricAcid', displayName: 'Uric Acid', unit: 'mg/dL', gender: 'male', optimalMin: 3.5, optimalMax: 6.0, normalMin: 3.4, normalMax: 7.0 },
  { key: 'uricAcid', displayName: 'Uric Acid', unit: 'mg/dL', gender: 'female', optimalMin: 3.0, optimalMax: 5.5, normalMin: 2.4, normalMax: 6.0 },
];

// All available symptom keys that can trigger supplement recommendations
export const SYMPTOM_KEYS = [
  { key: 'fatigue', label: 'Fatigue / Low Energy' },
  { key: 'brainFog', label: 'Brain Fog' },
  { key: 'lowLibido', label: 'Low Libido' },
  { key: 'moodChanges', label: 'Mood Changes / Irritability' },
  { key: 'sleepDisruption', label: 'Sleep Disruption' },
  { key: 'anxiety', label: 'Anxiety' },
  { key: 'hairLoss', label: 'Hair Loss / Thinning' },
  { key: 'hotFlashes', label: 'Hot Flashes / Night Sweats' },
  { key: 'bloating', label: 'Bloating / GI Symptoms' },
  { key: 'jointPain', label: 'Joint Pain / Inflammation' },
  { key: 'weightGain', label: 'Weight Gain / Difficulty Losing Weight' },
  { key: 'drySkin', label: 'Dry Skin / Hair' },
  { key: 'coldIntolerance', label: 'Cold Intolerance' },
  { key: 'muscleCramps', label: 'Muscle Cramps / Weakness' },
  { key: 'poorConcentration', label: 'Poor Concentration / Memory' },
  { key: 'restlessLegs', label: 'Restless Legs' },
  { key: 'acne', label: 'Acne' },
  { key: 'headaches', label: 'Headaches' },
];

// Supplement categories
export const SUPPLEMENT_CATEGORIES = [
  { value: 'cardiovascular', label: 'Cardiovascular' },
  { value: 'hormone-support', label: 'Hormone Support' },
  { value: 'thyroid', label: 'Thyroid' },
  { value: 'metabolic', label: 'Metabolic / Blood Sugar' },
  { value: 'mineral', label: 'Minerals' },
  { value: 'vitamin', label: 'Vitamins' },
  { value: 'iron', label: 'Iron / Blood' },
  { value: 'probiotic', label: 'Probiotic / Gut Health' },
  { value: 'bone', label: 'Bone Health' },
  { value: 'detox', label: 'Detox / Liver' },
  { value: 'general', label: 'General Wellness' },
];

// All lab markers available as trigger conditions for supplement rules
export const LAB_MARKER_KEYS = [
  { key: 'testosterone', label: 'Total Testosterone', unit: 'ng/dL' },
  { key: 'freeTestosterone', label: 'Free Testosterone', unit: 'pg/mL' },
  { key: 'estradiol', label: 'Estradiol', unit: 'pg/mL' },
  { key: 'progesterone', label: 'Progesterone', unit: 'ng/mL' },
  { key: 'dhea', label: 'DHEA-S', unit: 'µg/dL' },
  { key: 'shbg', label: 'SHBG', unit: 'nmol/L' },
  { key: 'fsh', label: 'FSH', unit: 'mIU/mL' },
  { key: 'lh', label: 'LH', unit: 'mIU/mL' },
  { key: 'prolactin', label: 'Prolactin', unit: 'ng/mL' },
  { key: 'tsh', label: 'TSH', unit: 'mIU/L' },
  { key: 'freeT4', label: 'Free T4', unit: 'ng/dL' },
  { key: 'freeT3', label: 'Free T3', unit: 'pg/mL' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'ng/mL' },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'pg/mL' },
  { key: 'ferritin', label: 'Ferritin', unit: 'ng/mL' },
  { key: 'glucose', label: 'Fasting Glucose', unit: 'mg/dL' },
  { key: 'a1c', label: 'Hemoglobin A1c', unit: '%' },
  { key: 'insulin', label: 'Fasting Insulin', unit: 'µIU/mL' },
  { key: 'triglycerides', label: 'Triglycerides', unit: 'mg/dL' },
  { key: 'hdl', label: 'HDL Cholesterol', unit: 'mg/dL' },
  { key: 'ldl', label: 'LDL Cholesterol', unit: 'mg/dL' },
  { key: 'totalCholesterol', label: 'Total Cholesterol', unit: 'mg/dL' },
  { key: 'apoB', label: 'ApoB', unit: 'mg/dL' },
  { key: 'hsCRP', label: 'hs-CRP', unit: 'mg/L' },
  { key: 'hematocrit', label: 'Hematocrit', unit: '%' },
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL' },
  { key: 'wbc', label: 'WBC', unit: 'K/µL' },
  { key: 'rbc', label: 'RBC', unit: 'M/µL' },
  { key: 'ast', label: 'AST', unit: 'U/L' },
  { key: 'alt', label: 'ALT', unit: 'U/L' },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL' },
  { key: 'egfr', label: 'eGFR', unit: 'mL/min' },
  { key: 'homocysteine', label: 'Homocysteine', unit: 'µmol/L' },
  { key: 'psa', label: 'PSA', unit: 'ng/mL' },
  { key: 'uricAcid', label: 'Uric Acid', unit: 'mg/dL' },
  { key: 'folate', label: 'Folate', unit: 'ng/mL' },
];
