/**
 * RxNorm Static Reference Dictionary
 *
 * Curated high-value medication list covering hormone, weight-loss,
 * contraception, thyroid, psychiatric, cardiovascular, and metabolic
 * medications common in ClinIQ workflows.
 *
 * Source: RxNorm concept identifiers (rxcui) are from the NIH National
 * Library of Medicine RxNorm database (public domain). This is a static
 * offline snapshot for the high-value medication list only.
 *
 * Usage: additive enrichment only. Never alters medication status,
 * clinical intent, plan decisions, or SOAP structure.
 */

export type RxNormEntry = {
  rxcui: string;
  genericName: string;
  brandNames: string[];
  medicationClass: string;
  aliases: string[];
};

export type LASAPair = {
  names: string[];
  warning: string;
};

// ─── RxNorm concept dictionary ────────────────────────────────────────────────
// Key: normalized lowercase generic name (matches what medication-seed uses)
export const RXNORM_DICT: Record<string, RxNormEntry> = {

  // ── Hormones ────────────────────────────────────────────────────────────────
  "estradiol": {
    rxcui: "4083",
    genericName: "estradiol",
    brandNames: ["Estrace", "Vivelle-Dot", "Climara", "Dotti", "Minivelle", "Alora", "Elestrin", "Divigel", "EstroGel"],
    medicationClass: "Estrogen / Menopausal hormone therapy",
    aliases: ["estrace", "vivelle-dot", "vivelle dot", "climara", "dotti", "minivelle", "alora", "elestrin", "divigel", "estrogel"],
  },

  "progesterone": {
    rxcui: "8925",
    genericName: "progesterone",
    brandNames: ["Prometrium"],
    medicationClass: "Progestogen / Menopausal hormone therapy",
    aliases: ["prometrium", "micronized progesterone"],
  },

  "medroxyprogesterone": {
    rxcui: "6699",
    genericName: "medroxyprogesterone",
    brandNames: ["Provera", "Depo-Provera"],
    medicationClass: "Synthetic progestin",
    aliases: ["provera", "depo-provera", "depo provera"],
  },

  "testosterone": {
    rxcui: "10324",
    genericName: "testosterone",
    brandNames: ["AndroGel", "Testim", "Axiron", "Fortesta", "Androderm"],
    medicationClass: "Androgen / Testosterone therapy",
    aliases: ["androgel", "testim", "axiron", "fortesta", "androderm"],
  },

  "drospirenone": {
    rxcui: "133163",
    genericName: "drospirenone",
    brandNames: ["Slynd"],
    medicationClass: "Progestin-only contraceptive",
    aliases: ["slynd"],
  },

  "norethindrone": {
    rxcui: "7514",
    genericName: "norethindrone",
    brandNames: ["Aygestin", "Micronor", "Camila", "Errin", "Jolivette"],
    medicationClass: "Progestin-only contraceptive",
    aliases: ["aygestin", "micronor", "camila", "errin", "jolivette", "mini pill", "mini-pill"],
  },

  "norgestrel": {
    rxcui: "7570",
    genericName: "norgestrel",
    brandNames: ["Opill"],
    medicationClass: "Progestin-only contraceptive (OTC)",
    aliases: ["opill"],
  },

  "etonogestrel": {
    rxcui: "57552",
    genericName: "etonogestrel",
    brandNames: ["Nexplanon", "Implanon"],
    medicationClass: "Contraceptive implant / Progestin",
    aliases: ["nexplanon", "implanon", "implant", "arm implant"],
  },

  "levonorgestrel": {
    rxcui: "5932",
    genericName: "levonorgestrel",
    brandNames: ["Mirena", "Kyleena", "Liletta", "Skyla", "Plan B"],
    medicationClass: "Progestin / Intrauterine system",
    aliases: ["mirena", "kyleena", "liletta", "skyla", "plan b", "iud", "hormonal iud"],
  },

  // ── Thyroid ─────────────────────────────────────────────────────────────────
  "levothyroxine": {
    rxcui: "10582",
    genericName: "levothyroxine",
    brandNames: ["Synthroid", "Levoxyl", "Unithroid", "Tirosint", "Euthyrox"],
    medicationClass: "Thyroid hormone / T4 replacement",
    aliases: ["synthroid", "levoxyl", "unithroid", "tirosint", "euthyrox"],
  },

  "liothyronine": {
    rxcui: "10584",
    genericName: "liothyronine",
    brandNames: ["Cytomel"],
    medicationClass: "Thyroid hormone / T3",
    aliases: ["cytomel", "t3"],
  },

  "desiccated thyroid": {
    rxcui: "40748",
    genericName: "desiccated thyroid",
    brandNames: ["Armour Thyroid", "NP Thyroid", "Nature-Throid", "WP Thyroid"],
    medicationClass: "Natural desiccated thyroid / T3+T4",
    aliases: ["armour thyroid", "armour", "np thyroid", "nature-throid", "wp thyroid", "adt", "ndt"],
  },

  // ── GLP-1 / Weight management ────────────────────────────────────────────────
  "semaglutide": {
    rxcui: "2200360",
    genericName: "semaglutide",
    brandNames: ["Ozempic", "Wegovy", "Rybelsus"],
    medicationClass: "GLP-1 receptor agonist",
    aliases: ["ozempic", "wegovy", "rybelsus", "sema"],
  },

  "tirzepatide": {
    rxcui: "2395492",
    genericName: "tirzepatide",
    brandNames: ["Mounjaro", "Zepbound"],
    medicationClass: "GLP-1/GIP dual receptor agonist",
    aliases: ["mounjaro", "zepbound", "tirza"],
  },

  "liraglutide": {
    rxcui: "475968",
    genericName: "liraglutide",
    brandNames: ["Victoza", "Saxenda"],
    medicationClass: "GLP-1 receptor agonist",
    aliases: ["victoza", "saxenda"],
  },

  "exenatide": {
    rxcui: "60548",
    genericName: "exenatide",
    brandNames: ["Byetta", "Bydureon"],
    medicationClass: "GLP-1 receptor agonist",
    aliases: ["byetta", "bydureon"],
  },

  "orlistat": {
    rxcui: "37925",
    genericName: "orlistat",
    brandNames: ["Xenical", "Alli"],
    medicationClass: "Lipase inhibitor / Weight management",
    aliases: ["xenical", "alli"],
  },

  "naltrexone-bupropion": {
    rxcui: "1552507",
    genericName: "naltrexone-bupropion",
    brandNames: ["Contrave"],
    medicationClass: "Opioid antagonist + NDRI combination / Weight management",
    aliases: ["contrave"],
  },

  "phentermine-topiramate": {
    rxcui: "1249684",
    genericName: "phentermine-topiramate",
    brandNames: ["Qsymia"],
    medicationClass: "Sympathomimetic + anticonvulsant combination / Weight management",
    aliases: ["qsymia"],
  },

  // ── Cardiovascular / Metabolic ────────────────────────────────────────────────
  "spironolactone": {
    rxcui: "9997",
    genericName: "spironolactone",
    brandNames: ["Aldactone", "CaroSpir"],
    medicationClass: "Aldosterone antagonist / Anti-androgen",
    aliases: ["aldactone", "carospir", "spiro"],
  },

  "metformin": {
    rxcui: "6809",
    genericName: "metformin",
    brandNames: ["Glucophage", "Fortamet", "Glumetza", "Riomet"],
    medicationClass: "Biguanide / Antidiabetic",
    aliases: ["glucophage", "fortamet", "glumetza", "riomet"],
  },

  "atorvastatin": {
    rxcui: "83367",
    genericName: "atorvastatin",
    brandNames: ["Lipitor"],
    medicationClass: "HMG-CoA reductase inhibitor (statin)",
    aliases: ["lipitor"],
  },

  "rosuvastatin": {
    rxcui: "301542",
    genericName: "rosuvastatin",
    brandNames: ["Crestor", "Ezallor"],
    medicationClass: "HMG-CoA reductase inhibitor (statin)",
    aliases: ["crestor", "ezallor"],
  },

  "ezetimibe": {
    rxcui: "341248",
    genericName: "ezetimibe",
    brandNames: ["Zetia"],
    medicationClass: "Cholesterol absorption inhibitor",
    aliases: ["zetia"],
  },

  "berberine": {
    rxcui: "12025",
    genericName: "berberine",
    brandNames: [],
    medicationClass: "Natural supplement / Glucose metabolism",
    aliases: [],
  },

  "empagliflozin": {
    rxcui: "1545653",
    genericName: "empagliflozin",
    brandNames: ["Jardiance"],
    medicationClass: "SGLT-2 inhibitor",
    aliases: ["jardiance"],
  },

  "dapagliflozin": {
    rxcui: "1488574",
    genericName: "dapagliflozin",
    brandNames: ["Farxiga"],
    medicationClass: "SGLT-2 inhibitor",
    aliases: ["farxiga"],
  },

  "lisinopril": {
    rxcui: "29046",
    genericName: "lisinopril",
    brandNames: ["Prinivil", "Zestril"],
    medicationClass: "ACE inhibitor / Antihypertensive",
    aliases: ["prinivil", "zestril"],
  },

  "amlodipine": {
    rxcui: "17767",
    genericName: "amlodipine",
    brandNames: ["Norvasc"],
    medicationClass: "Calcium channel blocker / Antihypertensive",
    aliases: ["norvasc"],
  },

  // ── Psychiatric / Neurological ────────────────────────────────────────────────
  "bupropion": {
    rxcui: "42347",
    genericName: "bupropion",
    brandNames: ["Wellbutrin", "Wellbutrin XL", "Wellbutrin SR", "Zyban"],
    medicationClass: "NDRI antidepressant / Smoking cessation",
    aliases: ["wellbutrin", "wellbutrin xl", "wellbutrin sr", "zyban"],
  },

  "sertraline": {
    rxcui: "36437",
    genericName: "sertraline",
    brandNames: ["Zoloft"],
    medicationClass: "SSRI antidepressant",
    aliases: ["zoloft"],
  },

  "escitalopram": {
    rxcui: "321988",
    genericName: "escitalopram",
    brandNames: ["Lexapro"],
    medicationClass: "SSRI antidepressant",
    aliases: ["lexapro"],
  },

  "fluoxetine": {
    rxcui: "41493",
    genericName: "fluoxetine",
    brandNames: ["Prozac", "Sarafem"],
    medicationClass: "SSRI antidepressant",
    aliases: ["prozac", "sarafem"],
  },

  "venlafaxine": {
    rxcui: "39786",
    genericName: "venlafaxine",
    brandNames: ["Effexor", "Effexor XR"],
    medicationClass: "SNRI antidepressant",
    aliases: ["effexor", "effexor xr"],
  },

  "duloxetine": {
    rxcui: "72625",
    genericName: "duloxetine",
    brandNames: ["Cymbalta"],
    medicationClass: "SNRI antidepressant",
    aliases: ["cymbalta"],
  },

  "risperidone": {
    rxcui: "35636",
    genericName: "risperidone",
    brandNames: ["Risperdal"],
    medicationClass: "Atypical antipsychotic",
    aliases: ["risperdal"],
  },

  "quetiapine": {
    rxcui: "51272",
    genericName: "quetiapine",
    brandNames: ["Seroquel"],
    medicationClass: "Atypical antipsychotic",
    aliases: ["seroquel"],
  },

  "aripiprazole": {
    rxcui: "89013",
    genericName: "aripiprazole",
    brandNames: ["Abilify"],
    medicationClass: "Atypical antipsychotic",
    aliases: ["abilify"],
  },

  "alprazolam": {
    rxcui: "16590",
    genericName: "alprazolam",
    brandNames: ["Xanax"],
    medicationClass: "Benzodiazepine / Anxiolytic",
    aliases: ["xanax"],
  },

  "clonazepam": {
    rxcui: "2598",
    genericName: "clonazepam",
    brandNames: ["Klonopin"],
    medicationClass: "Benzodiazepine / Anxiolytic",
    aliases: ["klonopin"],
  },

  "zolpidem": {
    rxcui: "41493",
    genericName: "zolpidem",
    brandNames: ["Ambien", "Ambien CR"],
    medicationClass: "Non-benzodiazepine hypnotic / Sleep aid",
    aliases: ["ambien", "ambien cr"],
  },

  "naltrexone": {
    rxcui: "36792",
    genericName: "naltrexone",
    brandNames: ["Vivitrol", "ReVia"],
    medicationClass: "Opioid antagonist",
    aliases: ["vivitrol", "revia", "low dose naltrexone", "ldn"],
  },

  // ── Supplements (high-value clinical context) ─────────────────────────────────
  "vitamin d3": {
    rxcui: "11253",
    genericName: "vitamin d3",
    brandNames: [],
    medicationClass: "Fat-soluble vitamin / Supplement",
    aliases: ["cholecalciferol", "vitamin d", "vit d", "d3"],
  },

  "omega-3 fatty acids": {
    rxcui: "3291",
    genericName: "omega-3 fatty acids",
    brandNames: ["Lovaza", "Vascepa"],
    medicationClass: "Lipid-lowering supplement / Omega-3",
    aliases: ["fish oil", "lovaza", "vascepa", "omega 3", "epa dha"],
  },

  "magnesium": {
    rxcui: "4786",
    genericName: "magnesium",
    brandNames: [],
    medicationClass: "Mineral supplement",
    aliases: ["magnesium glycinate", "magnesium citrate", "magnesium oxide"],
  },

};

// ─── LASA (Look-Alike / Sound-Alike) pairs ────────────────────────────────────
// Any matched medication whose generic name appears in a LASA pair
// triggers a requires_review flag with a specific warning message.
export const LASA_PAIRS: LASAPair[] = [
  {
    names: ["drospirenone", "risperidone"],
    warning: "Medication requires provider review: possible name confusion between drospirenone (Slynd — progestin-only contraceptive) and risperidone (Risperdal — antipsychotic). These are distinct medications with no therapeutic overlap.",
  },
  {
    names: ["medroxyprogesterone", "progesterone"],
    warning: "Medication requires provider review: medroxyprogesterone (Provera — synthetic progestin) and progesterone (Prometrium — micronized progesterone) are pharmacologically different and must not be substituted.",
  },
  {
    names: ["levothyroxine", "liothyronine"],
    warning: "Medication requires provider review: levothyroxine (T4) and liothyronine (T3, Cytomel) are distinct thyroid hormones with different dosing and clinical uses.",
  },
  {
    names: ["semaglutide", "tirzepatide"],
    warning: "Medication requires provider review: semaglutide (GLP-1 agonist) and tirzepatide (GLP-1/GIP dual agonist) are distinct medications. Confirm which was discussed.",
  },
  {
    names: ["naltrexone", "naltrexone-bupropion"],
    warning: "Medication requires provider review: naltrexone (single agent) vs naltrexone-bupropion (Contrave — combination product) are dispensed and dosed differently.",
  },
  {
    names: ["zolpidem", "alprazolam"],
    warning: "Medication requires provider review: zolpidem (Ambien — sleep aid) and alprazolam (Xanax — benzodiazepine anxiolytic) are different controlled substances.",
  },
  {
    names: ["quetiapine", "risperidone", "aripiprazole"],
    warning: "Medication requires provider review: multiple antipsychotics detected in close context. Confirm which specific medication was discussed.",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

// Build a flat alias→genericName index at module load time (once).
const _aliasIndex = new Map<string, string>();
for (const [genericName, entry] of Object.entries(RXNORM_DICT)) {
  _aliasIndex.set(normalizeKey(genericName), genericName);
  for (const alias of entry.aliases) {
    const k = normalizeKey(alias);
    if (k && !_aliasIndex.has(k)) _aliasIndex.set(k, genericName);
  }
  for (const brand of entry.brandNames) {
    const k = normalizeKey(brand);
    if (k && !_aliasIndex.has(k)) _aliasIndex.set(k, genericName);
  }
}

/**
 * Look up a medication term in the RxNorm dictionary.
 * Tries exact normalized match, then falls back to substring scan for
 * multi-word generics (e.g. "desiccated thyroid").
 */
export function lookupRxNorm(term: string): RxNormEntry | null {
  const key = normalizeKey(term);
  if (!key) return null;

  // Exact match first.
  const exactGeneric = _aliasIndex.get(key);
  if (exactGeneric) return RXNORM_DICT[exactGeneric] ?? null;

  // Substring: does the key contain or is contained by any alias?
  for (const [alias, genericName] of _aliasIndex.entries()) {
    if (key.includes(alias) || alias.includes(key)) {
      return RXNORM_DICT[genericName] ?? null;
    }
  }

  return null;
}

/**
 * Check whether a generic name participates in any LASA pair.
 * Returns every LASA pair that includes this name (may be >1).
 */
export function checkLASA(genericName: string): LASAPair[] {
  const norm = normalizeKey(genericName);
  return LASA_PAIRS.filter(pair =>
    pair.names.some(n => normalizeKey(n) === norm)
  );
}
