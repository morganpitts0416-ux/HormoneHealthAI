/**
 * Clinical Lexicon System
 *
 * Grouped medical term lexicons used for:
 *  1. Whisper transcription priming (prompt hints)
 *  2. GPT-4o normalization stage (term correction)
 *
 * At runtime only the relevant groups for the inferred visit type are loaded,
 * keeping prompt sizes small and normalization focused.
 */

export type LexiconGroup =
  | "hormones_and_menopause"
  | "metabolic_and_weight"
  | "lipid_and_cardiometabolic"
  | "primary_care"
  | "medication_names"
  | "lab_markers"
  | "symptom_terms"
  | "procedure_terms";

export const LEXICONS: Record<LexiconGroup, string[]> = {
  hormones_and_menopause: [
    "estradiol", "estradiol patch", "estradiol gel", "estradiol pellet",
    "progesterone", "micronized progesterone", "prometrium",
    "testosterone", "testosterone cypionate", "testosterone enanthate",
    "testosterone cream", "testosterone gel", "testosterone pellet",
    "DHEA", "DHEA-S", "dehydroepiandrosterone", "pregnenolone",
    "SHBG", "sex hormone-binding globulin",
    "LH", "luteinizing hormone", "FSH", "follicle-stimulating hormone",
    "estrone", "estriol", "progesterone receptor",
    "perimenopause", "menopause", "postmenopause", "premature ovarian insufficiency",
    "vasomotor symptoms", "hot flashes", "night sweats",
    "GSM", "genitourinary syndrome of menopause",
    "vulvovaginal atrophy", "dyspareunia", "vaginal dryness",
    "HRT", "hormone replacement therapy", "bioidentical hormone therapy",
    "anastrozole", "aromatase inhibitor", "clomiphene", "letrozole",
    "hypogonadism", "testosterone deficiency", "andropause",
    "follicular phase", "luteal phase", "ovulation",
    "menstrual cycle", "amenorrhea", "oligomenorrhea",
    "compounded HRT", "compounded testosterone",
  ],

  metabolic_and_weight: [
    "insulin resistance", "metabolic syndrome", "hyperinsulinemia",
    "fasting insulin", "fasting glucose", "HOMA-IR",
    "HbA1c", "hemoglobin A1c", "glycated hemoglobin",
    "prediabetes", "type 2 diabetes", "impaired fasting glucose",
    "semaglutide", "Ozempic", "Wegovy",
    "tirzepatide", "Mounjaro", "Zepbound",
    "GLP-1", "GIP", "incretin",
    "metformin", "metformin XR", "metformin extended-release",
    "berberine", "inositol", "myo-inositol",
    "adiposity", "visceral fat", "subcutaneous fat",
    "BMI", "body mass index", "waist circumference",
    "leptin", "adiponectin", "ghrelin",
    "insulin sensitizer", "caloric deficit", "low glycemic",
    "hepatic steatosis", "NAFLD", "MASLD", "fatty liver",
    "FIB-4", "FIB-4 score", "liver fibrosis",
  ],

  lipid_and_cardiometabolic: [
    "lipid panel", "total cholesterol", "LDL", "LDL-C", "LDL cholesterol",
    "HDL", "HDL-C", "HDL cholesterol", "triglycerides",
    "ApoB", "apolipoprotein B", "Lp(a)", "lipoprotein(a)",
    "hs-CRP", "high-sensitivity CRP", "C-reactive protein",
    "homocysteine", "fibrinogen",
    "VLDL", "non-HDL cholesterol", "remnant cholesterol",
    "cardiovascular risk", "ASCVD", "atherosclerotic cardiovascular disease",
    "PREVENT score", "10-year CVD risk", "30-year CVD risk",
    "statin", "rosuvastatin", "atorvastatin", "pravastatin",
    "ezetimibe", "PCSK9 inhibitor", "evolocumab", "alirocumab",
    "heart failure", "coronary artery disease", "CAD",
    "hypertension", "systolic blood pressure", "diastolic blood pressure",
    "endothelial dysfunction", "arterial stiffness",
    "omega-3", "fish oil", "eicosapentaenoic acid", "EPA",
  ],

  primary_care: [
    "hypothyroidism", "hyperthyroidism", "Hashimoto's", "Graves' disease",
    "TSH", "thyroid-stimulating hormone", "free T4", "free T3", "T3", "T4",
    "levothyroxine", "liothyronine", "Synthroid", "Armour thyroid",
    "vitamin D", "25-hydroxyvitamin D", "vitamin D deficiency",
    "ferritin", "iron deficiency", "iron overload",
    "B12", "folate", "methylcobalamin",
    "CBC", "complete blood count", "WBC", "RBC", "hemoglobin", "hematocrit",
    "erythrocytosis", "polycythemia", "phlebotomy", "therapeutic phlebotomy",
    "CMP", "complete metabolic panel", "BMP", "BUN", "creatinine", "eGFR",
    "STOP-BANG", "sleep apnea", "obstructive sleep apnea", "OSA", "CPAP",
    "cortisol", "adrenal", "HPA axis", "adrenal fatigue",
    "IGF-1", "growth hormone", "GH",
    "PSA", "prostate-specific antigen",
    "colonoscopy", "mammogram", "Pap smear", "DEXA scan",
    "anxiety", "depression", "cognitive function", "brain fog",
    "insomnia", "sleep hygiene",
  ],

  medication_names: [
    "semaglutide", "Ozempic", "Wegovy",
    "tirzepatide", "Mounjaro", "Zepbound",
    "metformin", "metformin XR",
    "levothyroxine", "liothyronine", "Synthroid", "Armour thyroid",
    "rosuvastatin", "atorvastatin", "pravastatin", "simvastatin",
    "ezetimibe", "Zetia",
    "anastrozole", "Arimidex",
    "clomiphene", "Clomid",
    "testosterone cypionate", "testosterone enanthate",
    "micronized progesterone", "Prometrium",
    "estradiol", "Vivelle-Dot", "Climara",
    "bupropion", "Wellbutrin",
    "gabapentin",
    "berberine", "magnesium glycinate", "NAC", "coenzyme Q10",
    "omega-3", "fish oil",
    "vitamin D3", "vitamin K2",
    "DHEA", "pregnenolone",
    "spironolactone",
    "naltrexone", "low-dose naltrexone", "LDN",
    "compounded", "sustained-release",
  ],

  lab_markers: [
    "testosterone", "total testosterone", "free testosterone", "bioavailable testosterone",
    "estradiol", "progesterone", "DHEA-S", "SHBG",
    "LH", "FSH", "prolactin", "IGF-1",
    "TSH", "free T4", "free T3", "reverse T3",
    "cortisol", "ACTH", "aldosterone",
    "fasting glucose", "fasting insulin", "HbA1c", "HOMA-IR",
    "lipid panel", "LDL", "HDL", "triglycerides", "ApoB", "Lp(a)",
    "hs-CRP", "homocysteine", "fibrinogen",
    "CBC", "WBC", "hemoglobin", "hematocrit", "platelet count",
    "ferritin", "iron", "TIBC", "transferrin saturation",
    "CMP", "BUN", "creatinine", "eGFR", "AST", "ALT", "GGT",
    "vitamin D", "B12", "folate", "zinc", "magnesium",
    "PSA", "CA-125",
    "FIB-4",
  ],

  symptom_terms: [
    "fatigue", "brain fog", "cognitive dysfunction",
    "hot flashes", "night sweats", "vasomotor symptoms",
    "insomnia", "sleep disturbance", "poor sleep",
    "weight gain", "difficulty losing weight", "weight loss",
    "low libido", "decreased libido", "sexual dysfunction",
    "dyspareunia", "vaginal dryness", "pelvic pain",
    "mood changes", "irritability", "anxiety", "depression",
    "hair loss", "alopecia", "hair thinning",
    "acne", "hirsutism", "virilization",
    "joint pain", "muscle pain", "myalgia",
    "palpitations", "racing heart",
    "bloating", "constipation", "diarrhea",
    "headache", "migraine",
    "urinary frequency", "urinary urgency", "urinary incontinence",
    "edema", "swelling",
  ],

  procedure_terms: [
    "venipuncture", "phlebotomy", "therapeutic phlebotomy",
    "subcutaneous injection", "intramuscular injection", "IM injection",
    "pellet insertion", "pellet implant",
    "pap smear", "colposcopy",
    "mammogram", "breast ultrasound",
    "DEXA scan", "bone density",
    "colonoscopy", "endoscopy",
    "ultrasound", "thyroid ultrasound", "pelvic ultrasound",
    "EKG", "electrocardiogram",
  ],
};

const VISIT_TYPE_LEXICON_MAP: Record<string, LexiconGroup[]> = {
  "new-patient": [
    "hormones_and_menopause", "metabolic_and_weight", "lipid_and_cardiometabolic",
    "primary_care", "medication_names", "lab_markers", "symptom_terms", "procedure_terms",
  ],
  "follow-up": [
    "hormones_and_menopause", "metabolic_and_weight", "lipid_and_cardiometabolic",
    "medication_names", "lab_markers", "symptom_terms",
  ],
  "lab-review": [
    "lab_markers", "hormones_and_menopause", "metabolic_and_weight",
    "lipid_and_cardiometabolic", "primary_care", "medication_names",
  ],
  "wellness": [
    "primary_care", "metabolic_and_weight", "lab_markers", "symptom_terms",
    "medication_names", "lipid_and_cardiometabolic",
  ],
  "acute": ["primary_care", "symptom_terms", "medication_names", "procedure_terms"],
  "telemedicine": [
    "hormones_and_menopause", "metabolic_and_weight", "medication_names",
    "lab_markers", "symptom_terms",
  ],
  "procedure": ["procedure_terms", "medication_names", "primary_care"],
};

export function getRelevantLexiconGroups(visitType: string): LexiconGroup[] {
  return VISIT_TYPE_LEXICON_MAP[visitType] ?? VISIT_TYPE_LEXICON_MAP["follow-up"];
}

export function buildMedicalTermsList(visitType: string): string {
  const groups = getRelevantLexiconGroups(visitType);
  const terms = new Set<string>();
  for (const g of groups) {
    for (const t of LEXICONS[g]) terms.add(t);
  }
  return [...terms].join(", ");
}

export function buildNormalizationRules(visitType: string): string {
  const groups = getRelevantLexiconGroups(visitType);
  const lines: string[] = [];
  for (const g of groups) {
    lines.push(`${g.replace(/_/g, " ").toUpperCase()}: ${LEXICONS[g].join(", ")}`);
  }
  return lines.join("\n");
}

export const NORMALIZATION_EXAMPLES = `
Examples of speech-to-text errors to correct:
- "A poe bee" → "ApoB"
- "LP little a" or "LP a" → "Lp(a)"
- "HS CRP" or "high sensitivity CRP" → "hs-CRP"
- "S H B G" or "S-H-B-G" → "SHBG"
- "semagloo tide" or "sema glue tide" → "semaglutide"
- "tear zap a tide" or "tirzep a tide" → "tirzepatide"
- "micro nized progesterone" → "micronized progesterone"
- "test a stone" or "testo" → "testosterone"
- "die hydro epi andro sterone" → "DHEA"
- "dee H E A S" → "DHEA-S"
- "H B A 1 C" or "H-B-A-1-C" → "HbA1c"
- "F I B 4" or "fib-4" → "FIB-4"
- "I G F 1" → "IGF-1"
- "E G F R" → "eGFR"
- "P C O S" → "PCOS"
- "A S C V D" → "ASCVD"
- "G L P 1" → "GLP-1"
`.trim();
