/**
 * System-wide medication dictionary — available to every clinician automatically.
 * Covers the core drug categories used in hormone, primary care, and weight management clinics.
 * Clinicians can add their own custom entries on top via the Medication Dictionary page.
 */

export type SeedEntry = {
  genericName: string;
  brandNames: string[];
  commonSpokenVariants: string[];
  commonMisspellings: string[];
  drugClass: string;
  subclass?: string;
  route?: string;
  notes?: string;
};

export const SYSTEM_MEDICATIONS: SeedEntry[] = [

  // ─── Hormones ────────────────────────────────────────────────────────────────
  {
    genericName: "testosterone",
    brandNames: ["AndroGel", "Testim", "Axiron", "Natesto", "Xyosted", "Depo-Testosterone", "Aveed"],
    commonSpokenVariants: ["T", "T shot", "T injections", "testosterone shot", "testosterone injection", "testosterone gel", "testosterone cream", "hormone injection", "low T medication", "TRT", "testosterone therapy", "weekly shot"],
    commonMisspellings: ["testoterone", "testostrone", "tesosterone", "testosteron"],
    drugClass: "Androgen",
    subclass: "Testosterone",
    route: "injection / topical",
  },
  {
    genericName: "estradiol",
    brandNames: ["Estrace", "Vivelle-Dot", "Climara", "Alora", "Dotti", "Minivelle", "Divigel", "Elestrin", "Evamist", "Estring", "Vagifem", "Yuvafem"],
    commonSpokenVariants: ["estrogen", "estrogen patch", "estrogen cream", "E2", "E2 patch", "hormone patch", "hormone cream", "bio-identical estrogen", "bioidentical estrogen", "vaginal estrogen", "estrogen ring", "estrogen gel"],
    commonMisspellings: ["estradol", "estradiol", "oestradiol", "estriadol"],
    drugClass: "Estrogen",
    subclass: "17β-Estradiol",
    route: "patch / cream / oral / vaginal",
  },
  {
    genericName: "progesterone",
    brandNames: ["Prometrium", "Crinone", "Prochieve", "Endometrin"],
    commonSpokenVariants: ["P4", "progest", "natural progesterone", "bio-identical progesterone", "bioidentical progesterone", "progesterone capsule", "progesterone cream", "hormone capsule"],
    commonMisspellings: ["progestrone", "progresteron", "progesteron", "progestrone"],
    drugClass: "Progestogen",
    subclass: "Natural Progesterone",
    route: "oral / vaginal / topical",
  },
  {
    genericName: "DHEA",
    brandNames: ["Intrarosa", "Prasterone"],
    commonSpokenVariants: ["DHEA supplement", "dehydroepiandrosterone", "adrenal hormone", "anti-aging hormone", "DHEA cream", "vaginal DHEA"],
    commonMisspellings: ["DHAE", "DEHA"],
    drugClass: "Adrenal Androgen",
    route: "oral / vaginal",
  },
  {
    genericName: "pregnenolone",
    brandNames: [],
    commonSpokenVariants: ["preg", "pregnenolone supplement", "master hormone", "memory hormone"],
    commonMisspellings: ["pregneolone", "pregnenalone", "pregnenolone"],
    drugClass: "Neurosteroid",
    route: "oral / topical",
  },
  {
    genericName: "estriol",
    brandNames: ["Bi-Est", "Tri-Est"],
    commonSpokenVariants: ["E3", "weak estrogen", "estriol cream", "compounded estrogen"],
    commonMisspellings: ["estriol", "oestriol"],
    drugClass: "Estrogen",
    subclass: "Estriol",
    route: "topical / vaginal",
  },
  {
    genericName: "human chorionic gonadotropin",
    brandNames: ["Pregnyl", "Novarel", "Chorex"],
    commonSpokenVariants: ["HCG", "hCG injection", "fertility shot", "HCG shot", "HCG diet", "HCG therapy"],
    commonMisspellings: ["HCG", "hcg"],
    drugClass: "Gonadotropin",
    route: "injection",
  },

  // ─── GLP-1 / Weight Management ───────────────────────────────────────────────
  {
    genericName: "semaglutide",
    brandNames: ["Ozempic", "Wegovy", "Rybelsus"],
    commonSpokenVariants: ["Ozempic shot", "Wegovy shot", "GLP-1 shot", "weight loss shot", "GLP", "sema", "weekly injection", "diabetes shot", "semaglutide injection"],
    commonMisspellings: ["semalgutide", "semaglutiide", "semagluside", "ozempik"],
    drugClass: "GLP-1 Receptor Agonist",
    route: "subcutaneous / oral",
  },
  {
    genericName: "tirzepatide",
    brandNames: ["Mounjaro", "Zepbound"],
    commonSpokenVariants: ["tirza", "tirzep", "Mounjaro shot", "Zepbound shot", "GIP GLP shot", "dual agonist", "weekly Mounjaro"],
    commonMisspellings: ["tersapeptide", "tirzepeptide", "tirzepatid", "tirzapatide", "tirzepatitde"],
    drugClass: "GIP/GLP-1 Dual Agonist",
    route: "subcutaneous",
  },
  {
    genericName: "liraglutide",
    brandNames: ["Victoza", "Saxenda"],
    commonSpokenVariants: ["Saxenda pen", "Victoza shot", "daily GLP shot", "liraglutide injection"],
    commonMisspellings: ["liraglutid", "liraglutied", "liraglutiide"],
    drugClass: "GLP-1 Receptor Agonist",
    route: "subcutaneous",
  },
  {
    genericName: "phentermine",
    brandNames: ["Adipex-P", "Lomaira", "Qsymia"],
    commonSpokenVariants: ["phen", "diet pill", "appetite pill", "weight pill", "phentermine tablet"],
    commonMisspellings: ["phentamine", "phenteramin", "fentramine"],
    drugClass: "Sympathomimetic Amine",
    subclass: "Anorectic",
    route: "oral",
  },
  {
    genericName: "bupropion/naltrexone",
    brandNames: ["Contrave"],
    commonSpokenVariants: ["Contrave", "weight loss combination", "naltrexone bupropion"],
    commonMisspellings: ["contrave", "Contrrave"],
    drugClass: "Weight Management Combination",
    route: "oral",
  },
  {
    genericName: "metformin",
    brandNames: ["Glucophage", "Glumetza", "Fortamet"],
    commonSpokenVariants: ["metformin tablet", "diabetes pill", "sugar pill", "Glucophage", "metformin ER", "extended release metformin"],
    commonMisspellings: ["metphormin", "metfromin", "metformine"],
    drugClass: "Biguanide",
    route: "oral",
  },

  // ─── Thyroid ─────────────────────────────────────────────────────────────────
  {
    genericName: "levothyroxine",
    brandNames: ["Synthroid", "Levoxyl", "Tirosint", "Unithroid", "Euthyrox"],
    commonSpokenVariants: ["thyroid pill", "thyroid medication", "thyroid hormone", "T4", "Synthroid tablet", "thyroid replacement", "thyroid supplement", "T4 medication"],
    commonMisspellings: ["levothyroxin", "levothyoxine", "levothyroxi", "levothyroxne", "levothyroxine"],
    drugClass: "Thyroid Hormone",
    subclass: "T4",
    route: "oral",
  },
  {
    genericName: "liothyronine",
    brandNames: ["Cytomel", "Triostat"],
    commonSpokenVariants: ["T3", "T3 medication", "Cytomel", "T3 pill", "active thyroid hormone"],
    commonMisspellings: ["liothyronin", "liothrionine", "liothyroinine"],
    drugClass: "Thyroid Hormone",
    subclass: "T3",
    route: "oral",
  },
  {
    genericName: "desiccated thyroid",
    brandNames: ["Armour Thyroid", "Nature-Throid", "NP Thyroid", "WP Thyroid"],
    commonSpokenVariants: ["Armour", "natural thyroid", "porcine thyroid", "NDT", "natural desiccated thyroid", "pig thyroid", "whole thyroid"],
    commonMisspellings: ["dessicated thyroid", "desicated thyroid", "desiccated thyriod"],
    drugClass: "Thyroid Hormone",
    subclass: "Natural Desiccated Thyroid",
    route: "oral",
  },
  {
    genericName: "methimazole",
    brandNames: ["Tapazole"],
    commonSpokenVariants: ["anti-thyroid medication", "thyroid blocker", "hyperthyroid medication"],
    commonMisspellings: ["methimazol", "methimizole"],
    drugClass: "Antithyroid Agent",
    route: "oral",
  },

  // ─── Lipid Management ────────────────────────────────────────────────────────
  {
    genericName: "atorvastatin",
    brandNames: ["Lipitor"],
    commonSpokenVariants: ["statin", "cholesterol pill", "Lipitor", "cholesterol medication"],
    commonMisspellings: ["atorvastatin", "atoravastin", "atrovastatin"],
    drugClass: "Statin",
    route: "oral",
  },
  {
    genericName: "rosuvastatin",
    brandNames: ["Crestor", "Ezallor"],
    commonSpokenVariants: ["Crestor", "statin", "cholesterol pill"],
    commonMisspellings: ["rosuvasatin", "rosuvastatine", "rosuvastain"],
    drugClass: "Statin",
    route: "oral",
  },
  {
    genericName: "ezetimibe",
    brandNames: ["Zetia", "Ezetrol"],
    commonSpokenVariants: ["Zetia", "cholesterol absorption inhibitor"],
    commonMisspellings: ["ezetimibe", "ezetemibe", "ezetimib"],
    drugClass: "Cholesterol Absorption Inhibitor",
    route: "oral",
  },
  {
    genericName: "fenofibrate",
    brandNames: ["Tricor", "Fenoglide", "Triglide", "Antara"],
    commonSpokenVariants: ["fibrate", "triglyceride medication", "Tricor"],
    commonMisspellings: ["fenofibrat", "fenofibrrate"],
    drugClass: "Fibrate",
    route: "oral",
  },
  {
    genericName: "omega-3 fatty acids",
    brandNames: ["Vascepa", "Lovaza", "Epanova"],
    commonSpokenVariants: ["fish oil", "omega-3", "fish oil capsule", "DHA EPA", "prescription fish oil", "Vascepa"],
    commonMisspellings: ["omega3", "omega 3", "omaga-3"],
    drugClass: "Omega-3 Supplement",
    route: "oral",
  },
  {
    genericName: "evolocumab",
    brandNames: ["Repatha"],
    commonSpokenVariants: ["PCSK9 inhibitor", "Repatha injection", "cholesterol injection"],
    commonMisspellings: ["evolocumab", "evolocumab"],
    drugClass: "PCSK9 Inhibitor",
    route: "subcutaneous",
  },

  // ─── Cardiovascular ──────────────────────────────────────────────────────────
  {
    genericName: "metoprolol",
    brandNames: ["Lopressor", "Toprol XL"],
    commonSpokenVariants: ["beta blocker", "heart rate pill", "Toprol", "metoprolol succinate", "metoprolol tartrate"],
    commonMisspellings: ["metoprolole", "metapolol", "metoprolol"],
    drugClass: "Beta Blocker",
    subclass: "Beta-1 Selective",
    route: "oral",
  },
  {
    genericName: "lisinopril",
    brandNames: ["Prinivil", "Zestril", "Qbrelis"],
    commonSpokenVariants: ["ACE inhibitor", "blood pressure pill", "heart pill", "Prinivil"],
    commonMisspellings: ["lisinopirl", "lisinopirl", "lisenopril", "lisonopril"],
    drugClass: "ACE Inhibitor",
    route: "oral",
  },
  {
    genericName: "losartan",
    brandNames: ["Cozaar"],
    commonSpokenVariants: ["ARB", "blood pressure medication", "Cozaar", "angiotensin blocker"],
    commonMisspellings: ["losartn", "lozartan", "losarton"],
    drugClass: "ARB",
    subclass: "Angiotensin Receptor Blocker",
    route: "oral",
  },
  {
    genericName: "amlodipine",
    brandNames: ["Norvasc"],
    commonSpokenVariants: ["calcium channel blocker", "blood pressure pill", "Norvasc"],
    commonMisspellings: ["amlodipine", "amlodopine", "amlodapine"],
    drugClass: "Calcium Channel Blocker",
    route: "oral",
  },
  {
    genericName: "furosemide",
    brandNames: ["Lasix"],
    commonSpokenVariants: ["water pill", "fluid pill", "Lasix", "diuretic", "pee pill", "swelling pill"],
    commonMisspellings: ["furosimide", "furosemid", "furesemide"],
    drugClass: "Loop Diuretic",
    route: "oral",
  },
  {
    genericName: "spironolactone",
    brandNames: ["Aldactone", "CaroSpir"],
    commonSpokenVariants: ["spiro", "potassium-sparing diuretic", "anti-androgen", "acne pill", "water pill", "hormone acne medication"],
    commonMisspellings: ["spironolacone", "spironolacton", "spironaolactone"],
    drugClass: "Aldosterone Antagonist",
    route: "oral",
  },
  {
    genericName: "hydrochlorothiazide",
    brandNames: ["Microzide", "Esidrix"],
    commonSpokenVariants: ["HCTZ", "thiazide diuretic", "water pill", "blood pressure pill"],
    commonMisspellings: ["hydrochlorthiazide", "hydrochlorothiazid", "HCTZ"],
    drugClass: "Thiazide Diuretic",
    route: "oral",
  },
  {
    genericName: "aspirin",
    brandNames: ["Bayer", "Ecotrin", "Bufferin"],
    commonSpokenVariants: ["baby aspirin", "low dose aspirin", "81mg aspirin", "heart aspirin", "blood thinner"],
    commonMisspellings: ["asprin", "asperin"],
    drugClass: "Antiplatelet / NSAID",
    route: "oral",
  },
  {
    genericName: "clopidogrel",
    brandNames: ["Plavix"],
    commonSpokenVariants: ["Plavix", "blood thinner", "antiplatelet"],
    commonMisspellings: ["clopidorel", "clopidogrol"],
    drugClass: "Antiplatelet",
    route: "oral",
  },

  // ─── Psychiatry / Mental Health ──────────────────────────────────────────────
  {
    genericName: "sertraline",
    brandNames: ["Zoloft"],
    commonSpokenVariants: ["Zoloft", "SSRI", "antidepressant", "anxiety medication", "depression pill"],
    commonMisspellings: ["sertaline", "sertralin", "sertralline"],
    drugClass: "SSRI",
    route: "oral",
  },
  {
    genericName: "escitalopram",
    brandNames: ["Lexapro"],
    commonSpokenVariants: ["Lexapro", "SSRI", "anxiety pill", "antidepressant"],
    commonMisspellings: ["escitalopran", "escitaloprm", "escitalopram"],
    drugClass: "SSRI",
    route: "oral",
  },
  {
    genericName: "bupropion",
    brandNames: ["Wellbutrin", "Zyban", "Aplenzin"],
    commonSpokenVariants: ["Wellbutrin", "NDRI", "antidepressant", "smoking cessation medication", "Zyban"],
    commonMisspellings: ["buproprion", "bupropoin", "buproprian"],
    drugClass: "NDRI",
    subclass: "Norepinephrine-Dopamine Reuptake Inhibitor",
    route: "oral",
  },
  {
    genericName: "venlafaxine",
    brandNames: ["Effexor", "Effexor XR"],
    commonSpokenVariants: ["Effexor", "SNRI", "antidepressant", "anxiety medication"],
    commonMisspellings: ["venlafaxin", "venlafaxne", "venflafaxine"],
    drugClass: "SNRI",
    route: "oral",
  },
  {
    genericName: "duloxetine",
    brandNames: ["Cymbalta"],
    commonSpokenVariants: ["Cymbalta", "SNRI", "pain and depression medication", "nerve pain medication"],
    commonMisspellings: ["duloxetine", "duloxetin", "duloxatine"],
    drugClass: "SNRI",
    route: "oral",
  },
  {
    genericName: "alprazolam",
    brandNames: ["Xanax"],
    commonSpokenVariants: ["Xanax", "benzo", "anxiety medication", "panic attack medication"],
    commonMisspellings: ["alprazolem", "alprazolan", "alprazolam"],
    drugClass: "Benzodiazepine",
    route: "oral",
  },
  {
    genericName: "trazodone",
    brandNames: ["Desyrel", "Oleptro"],
    commonSpokenVariants: ["sleep medication", "sleep aid", "antidepressant sleep", "trazadone"],
    commonMisspellings: ["trazadone", "trazdone", "trazadon"],
    drugClass: "Serotonin Antagonist and Reuptake Inhibitor",
    route: "oral",
  },
  {
    genericName: "buspirone",
    brandNames: ["Buspar"],
    commonSpokenVariants: ["Buspar", "anxiety medication", "non-benzo anxiety"],
    commonMisspellings: ["busprone", "busparone", "busprirone"],
    drugClass: "Anxiolytic",
    route: "oral",
  },

  // ─── Sleep ───────────────────────────────────────────────────────────────────
  {
    genericName: "zolpidem",
    brandNames: ["Ambien", "Ambien CR", "Edluar", "Intermezzo"],
    commonSpokenVariants: ["Ambien", "sleep medication", "sleep pill", "sleeping pill"],
    commonMisspellings: ["zolpidm", "zolpidiem", "zolpidem"],
    drugClass: "Sedative-Hypnotic",
    route: "oral",
  },
  {
    genericName: "melatonin",
    brandNames: [],
    commonSpokenVariants: ["sleep supplement", "natural sleep aid", "melatonin gummy", "melatonin tablet"],
    commonMisspellings: ["melotonin", "melatonine", "melotonin"],
    drugClass: "Supplement",
    subclass: "Sleep Aid",
    route: "oral",
  },

  // ─── Respiratory ─────────────────────────────────────────────────────────────
  {
    genericName: "albuterol",
    brandNames: ["ProAir", "Ventolin", "Proventil", "AccuNeb"],
    commonSpokenVariants: ["rescue inhaler", "blue inhaler", "puffer", "breathing treatment", "asthma inhaler", "ProAir inhaler", "quick relief inhaler"],
    commonMisspellings: ["albuerol", "albuteral", "albuterole"],
    drugClass: "Short-Acting Beta-2 Agonist",
    subclass: "SABA",
    route: "inhaled",
  },
  {
    genericName: "fluticasone",
    brandNames: ["Flovent", "Flonase", "Arnuity", "Xhance"],
    commonSpokenVariants: ["Flonase", "steroid inhaler", "nasal spray", "allergy spray", "nose spray", "Flovent inhaler"],
    commonMisspellings: ["fluticasone", "fluticason", "flutocasone"],
    drugClass: "Inhaled Corticosteroid",
    route: "inhaled / intranasal",
  },
  {
    genericName: "montelukast",
    brandNames: ["Singulair"],
    commonSpokenVariants: ["Singulair", "allergy tablet", "asthma tablet", "leukotriene modifier"],
    commonMisspellings: ["montelucast", "montilukast", "montelucast"],
    drugClass: "Leukotriene Receptor Antagonist",
    route: "oral",
  },

  // ─── GI ──────────────────────────────────────────────────────────────────────
  {
    genericName: "omeprazole",
    brandNames: ["Prilosec", "Zegerid"],
    commonSpokenVariants: ["Prilosec", "acid pill", "stomach pill", "reflux medication", "heartburn pill", "PPI", "proton pump inhibitor"],
    commonMisspellings: ["omeprazol", "omeprazole", "omeprazle"],
    drugClass: "Proton Pump Inhibitor",
    route: "oral",
  },
  {
    genericName: "pantoprazole",
    brandNames: ["Protonix"],
    commonSpokenVariants: ["Protonix", "acid reflux pill", "PPI", "stomach medication"],
    commonMisspellings: ["pantoprazol", "pantoprazole", "pantoprazle"],
    drugClass: "Proton Pump Inhibitor",
    route: "oral",
  },
  {
    genericName: "ondansetron",
    brandNames: ["Zofran"],
    commonSpokenVariants: ["Zofran", "nausea medication", "anti-nausea tablet", "nausea pill", "vomiting medication"],
    commonMisspellings: ["ondansetrone", "ondansatron", "ondansetron"],
    drugClass: "5-HT3 Antagonist",
    subclass: "Antiemetic",
    route: "oral / IV",
  },

  // ─── Diabetes ────────────────────────────────────────────────────────────────
  {
    genericName: "empagliflozin",
    brandNames: ["Jardiance"],
    commonSpokenVariants: ["Jardiance", "SGLT2 inhibitor", "diabetes medication", "sugar pill", "heart failure pill"],
    commonMisspellings: ["empagliflozin", "empaglflozin", "empagliflosin"],
    drugClass: "SGLT2 Inhibitor",
    route: "oral",
  },
  {
    genericName: "insulin",
    brandNames: ["Lantus", "Basaglar", "Toujeo", "Levemir", "Tresiba", "Novolog", "Humalog", "Fiasp", "Ozempic"],
    commonSpokenVariants: ["insulin shot", "insulin injection", "basal insulin", "long-acting insulin", "short-acting insulin", "rapid insulin", "insulin pen"],
    commonMisspellings: ["insuline", "insolin"],
    drugClass: "Insulin",
    route: "subcutaneous",
  },

  // ─── Pain / Musculoskeletal ───────────────────────────────────────────────────
  {
    genericName: "gabapentin",
    brandNames: ["Neurontin", "Gralise", "Horizant"],
    commonSpokenVariants: ["Neurontin", "nerve pain medication", "neuropathy medication", "pain medication", "gabapentin pill"],
    commonMisspellings: ["gabapentine", "gabapentan", "gabapentine"],
    drugClass: "Anticonvulsant",
    subclass: "Gabapentinoid",
    route: "oral",
  },
  {
    genericName: "meloxicam",
    brandNames: ["Mobic"],
    commonSpokenVariants: ["Mobic", "anti-inflammatory", "NSAID", "joint pain pill", "arthritis medication"],
    commonMisspellings: ["meloxicam", "meloxicam", "melloxicam"],
    drugClass: "NSAID",
    route: "oral",
  },
  {
    genericName: "cyclobenzaprine",
    brandNames: ["Flexeril", "Amrix"],
    commonSpokenVariants: ["Flexeril", "muscle relaxer", "muscle relaxant"],
    commonMisspellings: ["cyclobenzaprene", "cyclobenzaprine", "cyclobenazprine"],
    drugClass: "Muscle Relaxant",
    route: "oral",
  },

  // ─── Dermatology / Hair ──────────────────────────────────────────────────────
  {
    genericName: "finasteride",
    brandNames: ["Propecia", "Proscar"],
    commonSpokenVariants: ["Propecia", "hair loss medication", "hair pill", "DHT blocker", "5-alpha reductase inhibitor"],
    commonMisspellings: ["finasterid", "finasteride", "fineasteride"],
    drugClass: "5-Alpha Reductase Inhibitor",
    route: "oral",
  },
  {
    genericName: "dutasteride",
    brandNames: ["Avodart"],
    commonSpokenVariants: ["Avodart", "hair loss medication", "DHT blocker", "5-alpha reductase inhibitor"],
    commonMisspellings: ["dutasterid", "dutasteride"],
    drugClass: "5-Alpha Reductase Inhibitor",
    route: "oral",
  },
  {
    genericName: "minoxidil",
    brandNames: ["Rogaine", "Kirkland Minoxidil", "Theroxidil"],
    commonSpokenVariants: ["Rogaine", "hair regrowth", "hair serum", "topical hair medication", "minoxidil solution", "minoxidil foam"],
    commonMisspellings: ["minoxidol", "minoxidile", "monoxidil"],
    drugClass: "Vasodilator",
    subclass: "Hair Loss Treatment",
    route: "topical / oral",
  },
  {
    genericName: "tretinoin",
    brandNames: ["Retin-A", "Atralin", "Avita", "Tretin-X"],
    commonSpokenVariants: ["Retin-A", "retinoid cream", "vitamin A cream", "retinol prescription", "anti-aging cream"],
    commonMisspellings: ["tretinoine", "tretinion", "tretinoiin"],
    drugClass: "Retinoid",
    route: "topical",
  },

  // ─── Supplements / Nutraceuticals ────────────────────────────────────────────
  {
    genericName: "vitamin D3",
    brandNames: ["D-Drops", "NatureWise", "BioTech D3"],
    commonSpokenVariants: ["vitamin D", "D3 supplement", "cholecalciferol", "sunshine vitamin", "vitamin D capsule", "vitamin D drops"],
    commonMisspellings: ["vitamine D", "vitamin D3", "vit D3"],
    drugClass: "Supplement",
    subclass: "Fat-Soluble Vitamin",
    route: "oral",
  },
  {
    genericName: "vitamin B12",
    brandNames: ["Nascobal", "Eligen B12"],
    commonSpokenVariants: ["B12", "B12 injection", "B12 shot", "cobalamin", "cyanocobalamin", "methylcobalamin", "energy shot", "B12 supplement"],
    commonMisspellings: ["vitamin B-12", "vit B12", "B-12"],
    drugClass: "Supplement",
    subclass: "Water-Soluble Vitamin",
    route: "oral / injection",
  },
  {
    genericName: "magnesium",
    brandNames: ["Slow-Mag", "Mag-Ox"],
    commonSpokenVariants: ["magnesium supplement", "mag glycinate", "magnesium glycinate", "mag threonate", "magnesium threonate", "magnesium oxide", "muscle supplement", "sleep supplement"],
    commonMisspellings: ["magnisium", "magnesium", "magnezium"],
    drugClass: "Supplement",
    subclass: "Mineral",
    route: "oral",
  },
  {
    genericName: "zinc",
    brandNames: [],
    commonSpokenVariants: ["zinc supplement", "zinc tablet", "zinc capsule", "immune supplement"],
    commonMisspellings: ["zing", "zinck"],
    drugClass: "Supplement",
    subclass: "Mineral",
    route: "oral",
  },
  {
    genericName: "berberine",
    brandNames: [],
    commonSpokenVariants: ["berberine supplement", "natural metformin", "glucose supplement", "insulin resistance supplement"],
    commonMisspellings: ["berberine", "berberain", "barbarine"],
    drugClass: "Supplement",
    subclass: "Alkaloid",
    route: "oral",
  },
  {
    genericName: "N-acetylcysteine",
    brandNames: ["Mucomyst"],
    commonSpokenVariants: ["NAC", "NAC supplement", "antioxidant supplement", "glutathione precursor"],
    commonMisspellings: ["N-acetylcystein", "NAC supplement"],
    drugClass: "Supplement",
    subclass: "Antioxidant",
    route: "oral",
  },
  {
    genericName: "coenzyme Q10",
    brandNames: ["CoQ10"],
    commonSpokenVariants: ["CoQ10", "ubiquinol", "heart supplement", "energy supplement", "mitochondria supplement"],
    commonMisspellings: ["CoQ 10", "coQ10", "co-enzyme Q10"],
    drugClass: "Supplement",
    subclass: "Antioxidant",
    route: "oral",
  },
  {
    genericName: "ashwagandha",
    brandNames: ["KSM-66", "Sensoril"],
    commonSpokenVariants: ["adaptogen", "stress supplement", "cortisol supplement", "ashwagandha capsule", "ashwa"],
    commonMisspellings: ["ashwaghanda", "ashwaganda", "ashwagandha"],
    drugClass: "Supplement",
    subclass: "Adaptogen",
    route: "oral",
  },
  {
    genericName: "maca",
    brandNames: [],
    commonSpokenVariants: ["maca root", "maca supplement", "libido supplement", "energy root", "Peruvian ginseng"],
    commonMisspellings: ["maka", "macca"],
    drugClass: "Supplement",
    subclass: "Adaptogen",
    route: "oral",
  },
  {
    genericName: "alpha-lipoic acid",
    brandNames: [],
    commonSpokenVariants: ["ALA", "alpha lipoic acid", "antioxidant supplement", "nerve supplement", "neuropathy supplement"],
    commonMisspellings: ["alpha lipoic", "ALA supplement"],
    drugClass: "Supplement",
    subclass: "Antioxidant",
    route: "oral",
  },
  {
    genericName: "glutathione",
    brandNames: ["Lypo-Spheric", "ReadiSorb"],
    commonSpokenVariants: ["master antioxidant", "glutathione IV", "glutathione injection", "detox supplement", "glutathione push"],
    commonMisspellings: ["glutathion", "glutothione", "gluthathione"],
    drugClass: "Supplement",
    subclass: "Antioxidant",
    route: "oral / IV / injection",
  },
  {
    genericName: "iodine",
    brandNames: ["Lugol's", "Iodoral"],
    commonSpokenVariants: ["iodine supplement", "Lugols", "thyroid iodine", "potassium iodide"],
    commonMisspellings: ["iodin", "iodide"],
    drugClass: "Supplement",
    subclass: "Mineral",
    route: "oral",
  },
];

/**
 * Convert a SeedEntry to a MedicationEntry-compatible object with virtual IDs.
 * System entries use negative IDs so they never clash with DB-assigned IDs.
 */
export function getSeedAsEntries() {
  return SYSTEM_MEDICATIONS.map((s, idx): {
    id: number;
    dictionaryId: number;
    clinicianId: number | null;
    genericName: string;
    brandNames: string[];
    commonSpokenVariants: string[];
    commonMisspellings: string[];
    drugClass: string | null;
    subclass: string | null;
    route: string | null;
    notes: string | null;
    isSystem: true;
  } => ({
    id: -(idx + 1),
    dictionaryId: -1,
    clinicianId: null,
    genericName: s.genericName,
    brandNames: s.brandNames,
    commonSpokenVariants: s.commonSpokenVariants,
    commonMisspellings: s.commonMisspellings,
    drugClass: s.drugClass ?? null,
    subclass: s.subclass ?? null,
    route: s.route ?? null,
    notes: s.notes ?? null,
    isSystem: true,
  }));
}
