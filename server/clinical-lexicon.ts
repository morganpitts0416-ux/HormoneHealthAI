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
  | "cardiovascular_medications"
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
    "retatrutide", "orforglipron", "cagrilintide",
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

  // Comprehensive medication dictionary — the primary layer for correct drug name recognition.
  // Organized by drug class so it's easy to add new medications over time.
  medication_names: [
    // GLP-1 / GIP agonists (including pipeline agents clinicians discuss)
    "semaglutide", "Ozempic", "Wegovy", "Rybelsus",
    "tirzepatide", "Mounjaro", "Zepbound",
    "retatrutide", "orforglipron", "cagrilintide",
    "liraglutide", "Victoza", "Saxenda",
    "dulaglutide", "Trulicity",
    "exenatide", "Byetta", "Bydureon",

    // Biguanides / oral antidiabetics
    "metformin", "metformin XR", "metformin extended-release", "Glucophage",
    "glipizide", "Glucotrol",
    "glyburide", "Micronase",
    "pioglitazone", "Actos",
    "sitagliptin", "Januvia",
    "empagliflozin", "Jardiance",
    "dapagliflozin", "Farxiga",
    "canagliflozin", "Invokana",

    // Thyroid
    "levothyroxine", "Synthroid", "Levoxyl", "Tirosint",
    "liothyronine", "Cytomel",
    "Armour thyroid", "Nature-Throid", "desiccated thyroid",

    // Hormones — HRT and testosterone
    "testosterone cypionate", "testosterone enanthate",
    "testosterone cream", "testosterone gel", "AndroGel",
    "testosterone pellet", "Testopel",
    "micronized progesterone", "Prometrium",
    "estradiol", "Estrace", "Vivelle-Dot", "Climara", "Minivelle",
    "estradiol patch", "estradiol gel", "estradiol pellet",
    "conjugated estrogens", "Premarin",
    "DHEA", "pregnenolone",

    // Aromatase inhibitors / SERMs
    "anastrozole", "Arimidex",
    "letrozole", "Femara",
    "clomiphene", "Clomid",
    "tamoxifen", "Nolvadex",
    "raloxifene", "Evista",

    // Statins
    "rosuvastatin", "Crestor",
    "atorvastatin", "Lipitor",
    "pravastatin", "Pravachol",
    "simvastatin", "Zocor",
    "fluvastatin", "Lescol",
    "pitavastatin", "Livalo",

    // Cholesterol / lipid adjuncts
    "ezetimibe", "Zetia",
    "evolocumab", "Repatha",
    "alirocumab", "Praluent",
    "inclisiran", "Leqvio",
    "bempedoic acid", "Nexletol",
    "fenofibrate", "Tricor",
    "niacin", "nicotinic acid",
    "omega-3", "fish oil", "icosapentaenoic acid", "EPA", "Vascepa",

    // ACE inhibitors
    "lisinopril", "Zestril", "Prinivil",
    "enalapril", "Vasotec",
    "ramipril", "Altace",
    "benazepril", "Lotensin",
    "quinapril", "Accupril",
    "perindopril", "Aceon",
    "captopril", "Capoten",
    "fosinopril", "Monopril",

    // ARBs (Angiotensin Receptor Blockers)
    "losartan", "Cozaar",
    "valsartan", "Diovan",
    "olmesartan", "Benicar",
    "telmisartan", "Micardis",
    "candesartan", "Atacand",
    "irbesartan", "Avapro",
    "azilsartan", "Edarbi",
    "eprosartan", "Teveten",

    // ARNIs
    "sacubitril-valsartan", "Entresto",

    // Beta blockers
    "metoprolol", "metoprolol succinate", "metoprolol tartrate", "Toprol-XL", "Lopressor",
    "atenolol", "Tenormin",
    "carvedilol", "Coreg",
    "bisoprolol", "Zebeta",
    "propranolol", "Inderal",
    "nebivolol", "Bystolic",
    "labetalol", "Normodyne",

    // Calcium channel blockers
    "amlodipine", "Norvasc",
    "diltiazem", "Cardizem",
    "verapamil", "Calan",
    "nifedipine", "Procardia",
    "felodipine", "Plendil",
    "nicardipine", "Cardene",
    "clevidipine", "Cleviprex",

    // Diuretics
    "hydrochlorothiazide", "HCTZ",
    "chlorthalidone",
    "furosemide", "Lasix",
    "spironolactone", "Aldactone",
    "eplerenone", "Inspra",
    "indapamide", "Lozol",
    "triamterene",
    "torsemide", "Demadex",

    // Antiplatelets / anticoagulants
    "aspirin", "clopidogrel", "Plavix",
    "ticagrelor", "Brilinta",
    "apixaban", "Eliquis",
    "rivaroxaban", "Xarelto",
    "warfarin", "Coumadin",
    "dabigatran", "Pradaxa",

    // Psychiatric / neurological (commonly prescribed in primary care)
    "bupropion", "Wellbutrin", "Zyban",
    "sertraline", "Zoloft",
    "fluoxetine", "Prozac",
    "escitalopram", "Lexapro",
    "citalopram", "Celexa",
    "venlafaxine", "Effexor",
    "duloxetine", "Cymbalta",
    "mirtazapine", "Remeron",
    "buspirone", "Buspar",
    "alprazolam", "Xanax",
    "lorazepam", "Ativan",
    "clonazepam", "Klonopin",
    "zolpidem", "Ambien",
    "gabapentin", "Neurontin",
    "pregabalin", "Lyrica",

    // Erectile dysfunction / BPH
    "sildenafil", "Viagra",
    "tadalafil", "Cialis",
    "vardenafil", "Levitra",
    "finasteride", "Propecia", "Proscar",
    "dutasteride", "Avodart",
    "tamsulosin", "Flomax",

    // Bone / osteoporosis
    "alendronate", "Fosamax",
    "risedronate", "Actonel",
    "zoledronic acid", "Reclast",
    "denosumab", "Prolia",
    "teriparatide", "Forteo",
    "romosozumab", "Evenity",

    // Naltrexone
    "naltrexone", "low-dose naltrexone", "LDN", "Vivitrol",

    // Supplements and nutraceuticals
    "berberine", "myo-inositol", "inositol",
    "magnesium glycinate", "magnesium malate", "magnesium",
    "NAC", "N-acetylcysteine",
    "coenzyme Q10", "CoQ10", "ubiquinol",
    "alpha-lipoic acid", "ALA",
    "glutathione", "liposomal glutathione",
    "ashwagandha", "rhodiola", "adaptogen",
    "vitamin D3", "vitamin K2",
    "zinc carnosine", "zinc bisglycinate",
    "B complex", "methylfolate", "methylcobalamin",
    "phosphatidylserine", "phosphatidylcholine",
    "GABA", "L-theanine", "melatonin",
    "probiotics", "Lactobacillus", "Bifidobacterium",

    // Misc common
    "compounded", "sustained-release", "extended-release",
    "sublingual", "subcutaneous", "intramuscular",
    "topical", "transdermal",
  ],

  // Dedicated cardiovascular drug class — layered into lipid and primary care visits
  cardiovascular_medications: [
    "losartan", "valsartan", "olmesartan", "telmisartan", "candesartan", "irbesartan",
    "lisinopril", "enalapril", "ramipril", "benazepril",
    "metoprolol", "atenolol", "carvedilol", "bisoprolol", "propranolol",
    "amlodipine", "diltiazem", "verapamil", "nifedipine",
    "hydrochlorothiazide", "HCTZ", "chlorthalidone", "furosemide", "spironolactone",
    "rosuvastatin", "atorvastatin", "pravastatin", "ezetimibe",
    "apixaban", "rivaroxaban", "clopidogrel", "aspirin",
    "sacubitril-valsartan", "Entresto",
    "evolocumab", "alirocumab", "inclisiran",
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
    "primary_care", "medication_names", "cardiovascular_medications",
    "lab_markers", "symptom_terms", "procedure_terms",
  ],
  "follow-up": [
    "hormones_and_menopause", "metabolic_and_weight", "lipid_and_cardiometabolic",
    "medication_names", "cardiovascular_medications", "lab_markers", "symptom_terms",
  ],
  "lab-review": [
    "lab_markers", "hormones_and_menopause", "metabolic_and_weight",
    "lipid_and_cardiometabolic", "primary_care", "medication_names", "cardiovascular_medications",
  ],
  "wellness": [
    "primary_care", "metabolic_and_weight", "lab_markers", "symptom_terms",
    "medication_names", "cardiovascular_medications", "lipid_and_cardiometabolic",
  ],
  "acute": ["primary_care", "symptom_terms", "medication_names", "cardiovascular_medications", "procedure_terms"],
  "telemedicine": [
    "hormones_and_menopause", "metabolic_and_weight", "medication_names",
    "cardiovascular_medications", "lab_markers", "symptom_terms",
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

/**
 * Build a Whisper / gpt-4o-transcribe prompt that reads like natural clinical chart notes.
 *
 * WHY PROSE WORKS BETTER THAN A TERM LIST:
 * Whisper treats the prompt as "prior context" — the text that came just before the audio.
 * When the prompt reads like the opening lines of a clinical note, the model continues
 * in that register and biases toward the exact spellings seen in those sentences.
 * A comma-separated term dump works, but prose sentences outperform it because:
 *   1. Terms embedded in natural sentences match real spoken medical language patterns.
 *   2. Phrase-level context (e.g. "patient's medications include") anchors word boundaries.
 *   3. Whisper's language model layer predicts the next word — a coherent note opening
 *      gives it a much stronger prior than an isolated vocabulary list.
 *
 * TOKEN BUDGET: Whisper caps useful prompt influence at ~224 tokens.
 * Staying at ~180 leaves headroom for the visit-type suffix.
 */
export function buildWhisperPrompt(visitType: string): string {
  const visitProse: Record<string, string> = {
    "new-patient":
      "New patient presenting for comprehensive hormone, metabolic, and cardiovascular evaluation.",
    "follow-up":
      "Follow-up visit for hormone optimization, metabolic management, and cardiovascular risk review.",
    "lab-review":
      "Lab review appointment. Panels include thyroid, hormone, metabolic, lipid, and inflammatory markers.",
    "wellness":
      "Annual wellness visit with preventive care, metabolic screening, and cardiovascular risk assessment.",
    "acute":
      "Acute care visit. Reviewing current symptoms, medications, and recent labs.",
    "telemedicine":
      "Telemedicine follow-up for hormone and metabolic management.",
    "procedure":
      "Procedure visit. Pellet insertion, therapeutic phlebotomy, or injection today.",
  };

  const intro = visitProse[visitType] ?? visitProse["follow-up"];

  // Core medication sentence — phonetically hardest drugs always included.
  // Written as prose so Whisper sees these spellings in context, not isolation.
  const meds =
    "Patient's medications include semaglutide, tirzepatide, Ozempic, Wegovy, " +
    "Mounjaro, Zepbound, testosterone cypionate, testosterone pellet, " +
    "micronized progesterone, estradiol patch, anastrozole, letrozole, DHEA, " +
    "levothyroxine, liothyronine, Armour thyroid, metformin, empagliflozin, " +
    "dapagliflozin, rosuvastatin, atorvastatin, ezetimibe, evolocumab, inclisiran, " +
    "losartan, lisinopril, amlodipine, metoprolol succinate, carvedilol, " +
    "hydrochlorothiazide, spironolactone, apixaban, rivaroxaban, " +
    "naltrexone, low-dose naltrexone, berberine, myo-inositol, CoQ10.";

  // Core lab marker sentence — acronyms Whisper frequently spells out or mangles.
  const labs =
    "Labs ordered: HbA1c, HOMA-IR, ApoB, Lp(a), hs-CRP, eGFR, FIB-4, IGF-1, " +
    "SHBG, DHEA-S, LH, FSH, TSH, free T3, free T4, reverse T3, " +
    "ferritin, TIBC, transferrin saturation, 25-hydroxyvitamin D, " +
    "CBC, CMP, lipid panel, ASCVD, GLP-1, PCOS.";

  // Visit-type extras woven in as a short prose clause
  const groups = getRelevantLexiconGroups(visitType);
  const extras: string[] = [];
  if (groups.includes("hormones_and_menopause")) {
    extras.push(
      "perimenopause, vasomotor symptoms, bioidentical hormone therapy, " +
      "compounded HRT, aromatase inhibitor, clomiphene, hypogonadism"
    );
  }
  if (groups.includes("metabolic_and_weight")) {
    extras.push(
      "insulin resistance, metabolic syndrome, hepatic steatosis, " +
      "NAFLD, MASLD, hyperinsulinemia, pioglitazone, tirzepatide"
    );
  }
  if (groups.includes("lipid_and_cardiometabolic")) {
    extras.push(
      "PREVENT score, homocysteine, bempedoic acid, Nexletol, " +
      "lipoprotein(a), sacubitril-valsartan, Entresto"
    );
  }
  if (groups.includes("procedure_terms")) {
    extras.push(
      "subcutaneous injection, intramuscular injection, " +
      "therapeutic phlebotomy, pellet insertion, DEXA scan"
    );
  }

  const extrasClause =
    extras.length
      ? ` Also discussed: ${extras.join("; ")}.`
      : "";

  return `${intro} ${meds} ${labs}${extrasClause}`;
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

── Lab markers & acronyms ──
- "A poe bee" → "ApoB"
- "LP little a" or "LP a" or "lipo protein little a" → "Lp(a)"
- "HS CRP" or "high sensitivity CRP" or "high-sensitivity C-reactive protein" → "hs-CRP"
- "S H B G" or "S-H-B-G" or "sex hormone binding glob" → "SHBG"
- "H B A 1 C" or "H-B-A-1-C" or "A1C" or "A 1 C" → "HbA1c"
- "H O M A I R" or "HOMA I R" or "HOMA IR" → "HOMA-IR"
- "F I B 4" or "fib-4" or "fib four" → "FIB-4"
- "I G F 1" or "I G F one" or "IGF one" → "IGF-1"
- "E G F R" or "E-G-F-R" → "eGFR"
- "P C O S" or "P-C-O-S" → "PCOS"
- "A S C V D" or "A-S-C-V-D" → "ASCVD"
- "G L P 1" or "GLP one" → "GLP-1"
- "G I P" → "GIP"
- "T S H" → "TSH"
- "free T 3" or "free tee three" → "free T3"
- "free T 4" or "free tee four" → "free T4"
- "reverse T 3" or "reverse T three" → "reverse T3"
- "T I B C" or "T-I-B-C" → "TIBC"
- "transferrin sat" → "transferrin saturation"
- "25 hydroxy vitamin D" or "25 OH vitamin D" or "25 hydroxy D" → "25-hydroxyvitamin D"
- "dee H E A S" or "D H E A S" → "DHEA-S"
- "die hydro epi andro sterone" or "D H E A" → "DHEA"
- "A C T H" → "ACTH"
- "H P A axis" → "HPA axis"
- "G S M" → "GSM"
- "N A F L D" → "NAFLD"
- "M A S L D" → "MASLD"
- "C A D" → "CAD"
- "L D N" → "LDN"
- "C B C" → "CBC"
- "C M P" → "CMP"
- "B M P" → "BMP"
- "L H" → "LH"
- "F S H" → "FSH"
- "P S A" → "PSA"
- "B U N" → "BUN"
- "A L T" → "ALT"
- "A S T" → "AST"
- "G G T" → "GGT"

── GLP-1 / metabolic drugs ──
- "semagloo tide" or "sema glue tide" or "sema glu tide" → "semaglutide"
- "tear zap a tide" or "tirzep a tide" or "tire zep a tide" → "tirzepatide"
- "ret a troo tide" or "reta troo tide" or "reta tru tide" → "retatrutide"
- "or for gli pron" or "or forge li pron" → "orforglipron"
- "cag ril in tide" or "cag ri lin tide" → "cagrilintide"
- "lira gloo tide" or "lira glue tide" → "liraglutide"
- "do la gloo tide" or "doo la glue tide" → "dulaglutide"
- "pi og li ta zone" or "pee oh gli ta zone" → "pioglitazone"
- "em pag li flo zin" or "em pa gli flo zin" → "empagliflozin"
- "dap a gli flo zin" or "dap a glee flo zin" → "dapagliflozin"
- "can a gli flo zin" or "can a glee flo zin" → "canagliflozin"
- "sit a glip tin" or "sit ag lip tin" → "sitagliptin"
- "met for min" or "met form in" → "metformin"

── Hormones & HRT ──
- "test a stone" or "testo" or "test os ter one" → "testosterone"
- "micro nized progesterone" or "micro nised progesterone" → "micronized progesterone"
- "es tra dye ol" or "es tra di ol" → "estradiol"
- "pro me tree um" or "pro me tri um" → "Prometrium"
- "DHEA S" or "dee H E A S" → "DHEA-S"
- "bio available testosterone" or "bio-available testosterone" → "bioavailable testosterone"
- "ana stroz ole" or "an as tra zole" or "an a stro zole" → "anastrozole"
- "le tro zole" or "let ra zole" or "let ro zole" → "letrozole"
- "clom i feen" or "clom i pheen" → "clomiphene"
- "pre nen o lone" or "preg nen o lone" → "pregnenolone"

── Thyroid ──
- "levo thigh rox een" or "levo thy rox in" → "levothyroxine"
- "lie oh thy ro neen" or "lio thy ro neen" → "liothyronine"
- "ar mour thyroid" or "arm er thyroid" or "armor thyroid" → "Armour thyroid"

── Cardiovascular ──
- "Liz Sartan" or "liz artan" or "low sartan" or "losar tan" → "losartan"
- "val sartan" or "val zar tan" → "valsartan"
- "olm e sartan" or "olm eh sartan" → "olmesartan"
- "tel mee sartan" or "tel miss artan" or "tel mi sartan" → "telmisartan"
- "can de sartan" or "can di sartan" → "candesartan"
- "ir be sartan" or "ir beh sartan" → "irbesartan"
- "liz in o pril" or "liz in oh pril" or "liz inn o pril" → "lisinopril"
- "en a la pril" or "en al a pril" → "enalapril"
- "ram i pril" or "ram ee pril" → "ramipril"
- "am lo di pine" or "am lo deh pine" or "am low di peen" → "amlodipine"
- "met o pro lol" or "met o pro lal" or "meto pro lol" → "metoprolol"
- "met o pro lol suc cin ate" or "metoprolol succ" → "metoprolol succinate"
- "car ve di lol" or "car ve da lol" → "carvedilol"
- "bis o pro lol" or "bis oh pro lol" → "bisoprolol"
- "hydro chloro thigh a zide" or "H C T Z" or "hydro chloro thia zide" → "hydrochlorothiazide"
- "chlor thal i done" or "chlor thal eh done" → "chlorthalidone"
- "spiro no lac tone" or "spiro no lac ton" → "spironolactone"
- "roz u vas ta tin" or "roz oo vas ta tin" or "rozu vastat in" → "rosuvastatin"
- "a tor vas ta tin" or "a torr va sta tin" → "atorvastatin"
- "a pix a ban" or "a pix aban" → "apixaban"
- "riva rox aban" or "riva rox a ban" → "rivaroxaban"
- "clop i do grel" or "clop id o grel" → "clopidogrel"
- "evan deh koo mab" or "ev o loo koo mab" or "ev oh loo koo mab" → "evolocumab"
- "al ih roo koo mab" or "al ee roo koo mab" → "alirocumab"
- "in cli sir an" or "in cli siran" → "inclisiran"
- "bem pe doe ic" or "bem pe do ik" → "bempedoic acid"
- "sac u bit ril" or "sak u bit ril valsartan" → "sacubitril-valsartan"
- "en trest oh" or "en tres toe" → "Entresto"

── Psychiatric / pain / other ──
- "boo pro pi on" or "byoo pro pee on" or "byu pro pee on" → "bupropion"
- "ser tra line" or "sert ra leen" or "ser tra leen" → "sertraline"
- "es cit a lo pram" or "es sit a lo pram" → "escitalopram"
- "ven la fax een" or "ven la fax in" → "venlafaxine"
- "dul ox e teen" or "dull ox e teen" → "duloxetine"
- "gab a pen tin" or "gab a pen teen" → "gabapentin"
- "prega balin" or "preg a ba lin" or "preg a ba leen" → "pregabalin"
- "fin as ter ide" or "fin ass ter ide" → "finasteride"
- "nal trex own" or "nal trex one" or "low dose nal trex one" → "naltrexone"
- "de no su mab" or "den o sue mab" → "denosumab"

── Supplements & nutraceuticals ──
- "N A C" or "N-A-C" → "NAC"
- "co enzyme Q 10" or "co Q 10" or "co-Q-10" → "CoQ10"
- "alpha lipoic" or "alpha lie po ic" → "alpha-lipoic acid"
- "A L A" → "ALA"
- "myo in a sit ol" or "myo inositol" or "my oh in o sit ol" → "myo-inositol"
- "ash wa ganda" or "ash wa gandha" or "ashwa ganda" → "ashwagandha"
- "mag nee zee um glyc in ate" or "mag nee zhum glycinate" → "magnesium glycinate"
- "mag nee zee um mal ate" → "magnesium malate"
- "phos fati dyl serine" or "fos fa ti dyl serine" → "phosphatidylserine"
- "meth yl fo late" or "methyl folate" → "methylfolate"
- "meth yl co bal a min" or "methyl cobalamin" → "methylcobalamin"
- "rho dee o la" or "ro dee o la" → "rhodiola"
- "lipo so mal glutathione" or "lipo so mal gluta thione" → "liposomal glutathione"

── Clinical shorthand & spoken context ──
- "his A1C was five point eight" → preserve as written; flag for review
- "her testosterone came back at two forty" → preserve number; do not alter unit
- "BP was one twenty over eighty" → "BP was 120/80"
- "heart rate of sixty two" → "heart rate of 62"
- "BMI of thirty one" → "BMI of 31"
- "Hx of" → "history of"
- "Rx" → "prescription" or leave as "Rx" (context-dependent)
- "CC" → "chief complaint" when clearly in that context
- "HPI" → "HPI" (keep as-is — recognized abbreviation)
- "f/u" or "follow up" → "follow-up"
- "w/u" → "workup"
- "wt" → "weight"
- "yo" after a number (e.g. "45 yo female") → "45-year-old female"
`.trim();
