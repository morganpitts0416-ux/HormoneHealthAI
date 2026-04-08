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
    // GLP-1 / GIP agonists
    "semaglutide", "Ozempic", "Wegovy", "Rybelsus",
    "tirzepatide", "Mounjaro", "Zepbound",
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
 * Build a Whisper transcription prompt that reads like natural clinical notes.
 * Whisper treats the prompt as "prior context", so it biases toward spellings
 * that appear in the prompt. Front-loading the most commonly mispronounced
 * drug names and clinical acronyms significantly improves accuracy.
 *
 * Whisper caps the useful prompt at ~224 tokens — we stay well under that.
 * Strategy: include the drugs most likely to be phonetically mangled first,
 * then layer in visit-type-specific extras.
 */
export function buildWhisperPrompt(visitType: string): string {
  // Tier 1: drugs and terms Whisper most frequently mangles — ALWAYS included
  const tier1 =
    "semaglutide, tirzepatide, Ozempic, Wegovy, Mounjaro, Zepbound, " +
    "testosterone, estradiol, progesterone, DHEA, DHEA-S, SHBG, " +
    "HbA1c, HOMA-IR, ApoB, Lp(a), hs-CRP, eGFR, FIB-4, IGF-1, " +
    "anastrozole, metformin, berberine, myo-inositol, " +
    "micronized progesterone, testosterone cypionate, testosterone pellet, " +
    "PCOS, GLP-1, ASCVD, HRT, LH, FSH";

  // Tier 2: cardiovascular drugs Whisper frequently misreads — ALWAYS included
  // "Liz Sartan" → losartan, "liz in o pril" → lisinopril, etc.
  const tier2 =
    "losartan, valsartan, olmesartan, telmisartan, candesartan, irbesartan, " +
    "lisinopril, enalapril, ramipril, " +
    "metoprolol, atenolol, carvedilol, bisoprolol, " +
    "amlodipine, diltiazem, " +
    "hydrochlorothiazide, HCTZ, chlorthalidone, spironolactone, " +
    "rosuvastatin, atorvastatin, ezetimibe, " +
    "apixaban, rivaroxaban, clopidogrel, " +
    "empagliflozin, dapagliflozin, sitagliptin";

  // Tier 3: visit-type-specific extras
  const groups = getRelevantLexiconGroups(visitType);
  const extras = new Set<string>();
  for (const g of groups) {
    if (g === "lipid_and_cardiometabolic") {
      ["triglycerides", "LDL-C", "HDL-C", "VLDL", "homocysteine",
       "evolocumab", "alirocumab", "inclisiran"].forEach(t => extras.add(t));
    }
    if (g === "hormones_and_menopause") {
      ["perimenopause", "menopause", "vasomotor symptoms",
       "compounded HRT", "bioidentical hormone therapy", "aromatase inhibitor",
       "letrozole", "clomiphene"].forEach(t => extras.add(t));
    }
    if (g === "metabolic_and_weight") {
      ["insulin resistance", "metabolic syndrome", "hepatic steatosis",
       "NAFLD", "MASLD", "hyperinsulinemia", "adiponectin",
       "pioglitazone", "empagliflozin"].forEach(t => extras.add(t));
    }
    if (g === "primary_care") {
      ["levothyroxine", "liothyronine", "Armour thyroid",
       "naltrexone", "low-dose naltrexone", "LDN",
       "sildenafil", "tadalafil", "finasteride"].forEach(t => extras.add(t));
    }
  }

  const extrasStr = extras.size ? `, ${[...extras].join(", ")}` : "";

  // Written as a natural partial sentence so Whisper uses it as prior context
  return (
    `Hormone and primary care clinic visit. ` +
    `Medications and lab markers discussed: ${tier1}, ${tier2}${extrasStr}.`
  );
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
- "Liz Sartan" or "liz artan" or "low sartan" → "losartan"
- "val sartan" or "val zar tan" → "valsartan"
- "olm e sartan" or "olm eh sartan" → "olmesartan"
- "tel mee sartan" or "tel miss artan" → "telmisartan"
- "can de sartan" → "candesartan"
- "liz in o pril" or "liz in oh pril" or "liz inn o pril" → "lisinopril"
- "en a la pril" or "en al a pril" → "enalapril"
- "ram i pril" or "ram ee pril" → "ramipril"
- "am lo di pine" or "am lo deh pine" → "amlodipine"
- "met o pro lol" or "met o pro lal" → "metoprolol"
- "car ve di lol" or "car ve da lol" → "carvedilol"
- "bis o pro lol" → "bisoprolol"
- "hydro chloro thigh a zide" or "H C T Z" → "hydrochlorothiazide"
- "chlor thal i done" or "chlor thal eh done" → "chlorthalidone"
- "roz u vas ta tin" or "roz oo vas ta tin" → "rosuvastatin"
- "a tor vas ta tin" or "a torr va sta tin" → "atorvastatin"
- "em pag li flo zin" or "em pa gli flo zin" → "empagliflozin"
- "dap a gli flo zin" → "dapagliflozin"
- "sit a glip tin" or "sit ag lip tin" → "sitagliptin"
- "a pix a ban" or "a pix aban" → "apixaban"
- "riva rox aban" or "riva rox a ban" → "rivaroxaban"
- "clop i do grel" or "clop id o grel" → "clopidogrel"
- "spiro no lac tone" or "spiro no lac ton" → "spironolactone"
- "boo pro pi on" or "byoo pro pee on" → "bupropion"
- "ser tra line" or "sert ra leen" → "sertraline"
- "es cit a lo pram" → "escitalopram"
- "ven la fax een" → "venlafaxine"
- "dul ox e teen" → "duloxetine"
- "gab a pen tin" or "gab a pen teen" → "gabapentin"
- "prega balin" or "preg a ba lin" → "pregabalin"
- "fin as ter ide" or "fin ass ter ide" → "finasteride"
- "ana stroz ole" or "an as tra zole" → "anastrozole"
- "le tro zole" or "let ra zole" → "letrozole"
- "evan deh koo mab" or "ev o loo koo mab" → "evolocumab"
- "al ih roo koo mab" → "alirocumab"
- "N A C" → "NAC"
- "co enzyme Q 10" or "co Q 10" → "CoQ10"
- "alpha lipoic" → "alpha-lipoic acid"
- "myo in a sit ol" or "myo inositol" → "myo-inositol"
- "ash wa ganda" or "ash wa gandha" → "ashwagandha"
`.trim();
