// Lab passthrough enrichment + EHR-style ordering.
//
// The clinical-logic engines (server/clinical-logic.ts and
// server/clinical-logic-female.ts) only emit interpretations for markers that
// have hard-coded protocol/algorithm/red-flag logic. Anything else extracted
// from an uploaded lab PDF (e.g. chloride, CO2, bilirubin, AMH, TPO antibodies)
// would otherwise be dropped from the report.
//
// This module:
//   1) Appends a "passthrough" LabInterpretation for each numeric extracted lab
//      that isn't already represented in the engine output. Clinician range
//      overrides are honored when present, otherwise we fall back to
//      LAB_MARKER_DEFAULTS for the patient's gender. Markers without any
//      configured range still appear, just labeled "Reference range not
//      configured".
//   2) Sorts the FINAL interpretations array into a sensible EHR panel order
//      (CBC -> CMP -> Lipids -> Inflammation -> Iron -> Metabolic -> Thyroid
//      -> Hormones -> Micronutrients -> Cardio Risk -> Vitals -> Screening
//      -> Other). Ordering is stable within each panel so the engine's
//      hand-tuned per-marker order is preserved.
//
// Intentionally non-destructive: never modifies engine-produced entries, never
// changes optimized values, supplements, red flags, or risk calculations.

import type { LabInterpretation, ClinicianLabPreference } from "@shared/schema";
import { LAB_MARKER_DEFAULTS } from "./lab-marker-defaults";
import { buildResolvedRangeLookup, type ResolvedRange } from "./lab-range-overrides";

type Gender = "male" | "female";

type PanelKey =
  | "cbc"
  | "cmp"
  | "lipids"
  | "inflammation"
  | "iron"
  | "metabolic"
  | "thyroid"
  | "hormones"
  | "micronutrients"
  | "cardio_risk"
  | "vitals"
  | "screening"
  | "other";

const PANEL_ORDER: PanelKey[] = [
  "cbc",
  "cmp",
  "lipids",
  "inflammation",
  "iron",
  "metabolic",
  "thyroid",
  "hormones",
  "micronutrients",
  "cardio_risk",
  "vitals",
  "screening",
  "other",
];

interface MarkerMeta {
  displayName: string;
  unit: string;
  panel: PanelKey;
  // Alternate display names the clinical-logic engines may emit. Used purely
  // for duplicate detection — if any of these aliases appear in the existing
  // interpretations array, the passthrough is suppressed.
  aliases?: string[];
}

// Source-of-truth descriptor for every numeric lab field we surface.
// Field name == key in labValuesSchema / femaleLabValuesSchema.
const MARKER_META: Record<string, MarkerMeta> = {
  // CBC (Hematology)
  hemoglobin: { displayName: "Hemoglobin", unit: "g/dL", panel: "cbc" },
  hematocrit: { displayName: "Hematocrit", unit: "%", panel: "cbc" },
  rbc: { displayName: "RBC", unit: "M/µL", panel: "cbc", aliases: ["RBC Count", "Red Blood Cell Count"] },
  wbc: { displayName: "WBC", unit: "K/µL", panel: "cbc", aliases: ["WBC Count", "White Blood Cell Count"] },
  platelets: { displayName: "Platelets", unit: "K/µL", panel: "cbc", aliases: ["Platelet Count"] },
  mcv: { displayName: "MCV", unit: "fL", panel: "cbc" },

  // CMP (Chemistry / Electrolytes / Liver / Kidney)
  glucose: { displayName: "Glucose", unit: "mg/dL", panel: "cmp", aliases: ["Glucose (Fasting)", "Fasting Glucose"] },
  sodium: { displayName: "Sodium", unit: "mEq/L", panel: "cmp" },
  potassium: { displayName: "Potassium", unit: "mEq/L", panel: "cmp" },
  chloride: { displayName: "Chloride", unit: "mEq/L", panel: "cmp" },
  co2: { displayName: "CO2 (Bicarbonate)", unit: "mEq/L", panel: "cmp", aliases: ["Bicarbonate", "CO2"] },
  bun: { displayName: "BUN", unit: "mg/dL", panel: "cmp", aliases: ["Blood Urea Nitrogen"] },
  creatinine: { displayName: "Creatinine", unit: "mg/dL", panel: "cmp" },
  egfr: { displayName: "eGFR", unit: "mL/min", panel: "cmp" },
  calcium: { displayName: "Calcium", unit: "mg/dL", panel: "cmp" },
  albumin: { displayName: "Albumin", unit: "g/dL", panel: "cmp" },
  totalProtein: { displayName: "Total Protein", unit: "g/dL", panel: "cmp" },
  ast: { displayName: "AST", unit: "U/L", panel: "cmp" },
  alt: { displayName: "ALT", unit: "U/L", panel: "cmp" },
  bilirubin: { displayName: "Total Bilirubin", unit: "mg/dL", panel: "cmp", aliases: ["Bilirubin (Total)", "Bilirubin"] },
  uricAcid: { displayName: "Uric Acid", unit: "mg/dL", panel: "cmp" },

  // Lipids
  totalCholesterol: { displayName: "Total Cholesterol", unit: "mg/dL", panel: "lipids" },
  ldl: { displayName: "LDL Cholesterol", unit: "mg/dL", panel: "lipids" },
  hdl: { displayName: "HDL Cholesterol", unit: "mg/dL", panel: "lipids" },
  triglycerides: { displayName: "Triglycerides", unit: "mg/dL", panel: "lipids" },
  apoB: { displayName: "ApoB", unit: "mg/dL", panel: "lipids", aliases: ["Apolipoprotein B", "ApoB (Apolipoprotein B)"] },
  lpa: { displayName: "Lipoprotein(a)", unit: "nmol/L", panel: "lipids", aliases: ["Lp(a)", "Lipoprotein a"] },

  // Inflammation
  hsCRP: { displayName: "hs-CRP", unit: "mg/L", panel: "inflammation", aliases: ["High-Sensitivity CRP"] },
  homocysteine: { displayName: "Homocysteine", unit: "µmol/L", panel: "inflammation" },

  // Iron studies
  iron: { displayName: "Iron", unit: "µg/dL", panel: "iron", aliases: ["Serum Iron"] },
  tibc: { displayName: "TIBC", unit: "µg/dL", panel: "iron", aliases: ["TIBC (Iron Binding Capacity)", "Total Iron Binding Capacity"] },
  ferritin: { displayName: "Ferritin", unit: "ng/mL", panel: "iron" },

  // Metabolic / Glycemic
  a1c: { displayName: "Hemoglobin A1c", unit: "%", panel: "metabolic", aliases: ["HbA1c", "A1c"] },
  insulin: { displayName: "Fasting Insulin", unit: "µIU/mL", panel: "metabolic", aliases: ["Insulin"] },

  // Thyroid
  tsh: { displayName: "TSH", unit: "mIU/L", panel: "thyroid", aliases: ["Thyroid Stimulating Hormone"] },
  freeT4: { displayName: "Free T4", unit: "ng/dL", panel: "thyroid", aliases: ["Free Thyroxine"] },
  freeT3: { displayName: "Free T3", unit: "pg/mL", panel: "thyroid", aliases: ["Free Triiodothyronine"] },
  tpoAntibodies: { displayName: "TPO Antibodies", unit: "IU/mL", panel: "thyroid", aliases: ["Thyroid Peroxidase Antibodies", "Anti-TPO"] },

  // Hormones
  testosterone: { displayName: "Total Testosterone", unit: "ng/dL", panel: "hormones", aliases: ["Testosterone (Total)", "Testosterone Total"] },
  freeTestosterone: { displayName: "Free Testosterone", unit: "pg/mL", panel: "hormones" },
  bioavailableTestosterone: { displayName: "Bioavailable Testosterone", unit: "ng/dL", panel: "hormones" },
  shbg: { displayName: "SHBG", unit: "nmol/L", panel: "hormones", aliases: ["Sex Hormone Binding Globulin"] },
  estradiol: { displayName: "Estradiol", unit: "pg/mL", panel: "hormones", aliases: ["E2"] },
  progesterone: { displayName: "Progesterone", unit: "ng/mL", panel: "hormones" },
  fsh: { displayName: "FSH", unit: "mIU/mL", panel: "hormones", aliases: ["Follicle Stimulating Hormone"] },
  lh: { displayName: "LH", unit: "mIU/mL", panel: "hormones", aliases: ["Luteinizing Hormone"] },
  prolactin: { displayName: "Prolactin", unit: "ng/mL", panel: "hormones" },
  dhea: { displayName: "DHEA-S", unit: "µg/dL", panel: "hormones", aliases: ["DHEA Sulfate", "DHEAS"] },
  dheas: { displayName: "DHEA-S", unit: "µg/dL", panel: "hormones", aliases: ["DHEA Sulfate", "DHEAS"] },
  amh: { displayName: "AMH", unit: "ng/mL", panel: "hormones", aliases: ["Anti-Müllerian Hormone", "Anti-Mullerian Hormone", "Anti-Müllerian Hormone (AMH)"] },

  // Micronutrients
  vitaminD: { displayName: "Vitamin D (25-OH)", unit: "ng/mL", panel: "micronutrients", aliases: ["Vitamin D", "25-OH Vitamin D", "25-Hydroxyvitamin D"] },
  vitaminB12: { displayName: "Vitamin B12", unit: "pg/mL", panel: "micronutrients", aliases: ["B12", "Cobalamin"] },
  folate: { displayName: "Folate", unit: "ng/mL", panel: "micronutrients", aliases: ["Folic Acid"] },

  // Other / oncology screening
  psa: { displayName: "PSA", unit: "ng/mL", panel: "other", aliases: ["Prostate Specific Antigen"] },
};

/** Tokenize a string into significant lowercase word tokens. */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 2),
  );
}

/**
 * True when an existing interpretation already represents this marker.
 * We say a candidate name is covered when ALL significant tokens of the
 * candidate appear somewhere in an existing category string. Handles
 * variations like "Total Testosterone" vs "Testosterone (Total)" or
 * "Hematocrit" vs "Erythrocytosis - Critical Hematocrit". Each marker
 * may also declare aliases (e.g. "Platelets" ≈ "Platelet Count") that are
 * tried in addition to its primary display name.
 */
function isMarkerCovered(
  displayName: string,
  aliases: string[] | undefined,
  existingTokens: Set<string>[],
): boolean {
  const candidates = [displayName, ...(aliases ?? [])];
  for (const cand of candidates) {
    const need = tokenize(cand);
    if (need.size === 0) continue;
    for (const have of existingTokens) {
      let allMatch = true;
      for (const t of need) {
        if (!have.has(t)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) return true;
    }
  }
  return false;
}

function formatRange(min?: number, max?: number, unit?: string): string {
  const u = unit ? ` ${unit}` : "";
  if (min !== undefined && max !== undefined) return `${min}–${max}${u}`;
  if (min !== undefined) return `≥ ${min}${u}`;
  if (max !== undefined) return `≤ ${max}${u}`;
  return "";
}

function buildReferenceRangeText(r: ResolvedRange): string {
  const optimal = formatRange(r.optimalMin, r.optimalMax, r.unit);
  const reference = formatRange(r.normalMin, r.normalMax, r.unit);
  if (optimal && reference) return `Optimal ${optimal} (Reference ${reference})`;
  return optimal || reference || "";
}

function statusFromRange(value: number, r: ResolvedRange): LabInterpretation["status"] {
  const inOptimal =
    (r.optimalMin === undefined || value >= r.optimalMin) &&
    (r.optimalMax === undefined || value <= r.optimalMax);
  if (inOptimal && (r.optimalMin !== undefined || r.optimalMax !== undefined)) {
    return "normal";
  }
  const inReference =
    (r.normalMin === undefined || value >= r.normalMin) &&
    (r.normalMax === undefined || value <= r.normalMax);
  if (inReference) {
    if (r.optimalMin !== undefined || r.optimalMax !== undefined) return "borderline";
    return "normal";
  }
  return "abnormal";
}

function defaultRangeForKey(labKey: string, gender: Gender): ResolvedRange | undefined {
  // Prefer gender-specific entry, fall back to 'both'.
  const candidates = LAB_MARKER_DEFAULTS.filter(
    d => d.key === labKey && (d.gender === gender || d.gender === "both"),
  );
  const match =
    candidates.find(d => d.gender === gender) ||
    candidates.find(d => d.gender === "both");
  if (!match) return undefined;
  return {
    markerKey: match.key,
    displayName: match.displayName,
    unit: match.unit,
    optimalMin: match.optimalMin,
    optimalMax: match.optimalMax,
    normalMin: match.normalMin,
    normalMax: match.normalMax,
    isCustom: false,
  };
}

/**
 * Append passthrough interpretations for any extracted numeric lab values
 * that are not already represented in the existing interpretations array.
 */
export function appendPassthroughInterpretations(
  labs: Record<string, unknown>,
  existing: LabInterpretation[],
  gender: Gender,
  clinicianPrefs: ClinicianLabPreference[] = [],
): LabInterpretation[] {
  const customLookup = clinicianPrefs.length
    ? buildResolvedRangeLookup(clinicianPrefs, gender)
    : new Map<string, ResolvedRange>();

  const existingTokens = existing.map(i => tokenize(i.category));
  const additions: LabInterpretation[] = [];

  for (const [labKey, rawVal] of Object.entries(labs)) {
    if (typeof rawVal !== "number" || !Number.isFinite(rawVal)) continue;
    const meta = MARKER_META[labKey];
    if (!meta) continue; // not a known displayable lab field
    if (isMarkerCovered(meta.displayName, meta.aliases, existingTokens)) continue;

    // Resolve range: clinician override (matched by displayName) wins, else default.
    const customRange = customLookup.get(meta.displayName.toLowerCase());
    const defaultRange = defaultRangeForKey(labKey, gender);
    const resolved: ResolvedRange | undefined =
      customRange?.isCustom ? customRange : defaultRange || customRange;

    let status: LabInterpretation["status"] = "normal";
    let referenceRange = "Reference range not configured";
    let interpretationText =
      "Reported value — no automated interpretation available. Provider review recommended.";
    let recommendation = "";
    let unit = meta.unit;

    if (resolved) {
      unit = resolved.unit || unit;
      const refText = buildReferenceRangeText(resolved);
      if (refText) referenceRange = refText;
      status = statusFromRange(rawVal, resolved);

      if (status === "abnormal") {
        interpretationText = `Result is outside the configured reference range. Provider review recommended.`;
      } else if (status === "borderline") {
        interpretationText = `Result is within reference range but outside the optimized target range.`;
      } else {
        interpretationText = `Result is within the configured reference range.`;
      }

      if (resolved.isCustom) {
        const optimal = formatRange(resolved.optimalMin, resolved.optimalMax, resolved.unit);
        recommendation = optimal
          ? `Provider's optimized target range applied for this marker: ${optimal}.`
          : "Provider's customized reference range applied for this marker.";
      }
    }

    additions.push({
      category: meta.displayName,
      value: rawVal,
      unit,
      status,
      referenceRange,
      interpretation: interpretationText,
      recommendation,
    });

    // Reflect into the running covered set so duplicate keys (e.g. dhea + dheas)
    // don't both produce a passthrough.
    existingTokens.push(tokenize(meta.displayName));
  }

  return additions.length ? [...existing, ...additions] : existing;
}

/** Classify any LabInterpretation category into a panel for ordering. */
function panelForCategory(category: string): PanelKey {
  const c = category.toLowerCase();

  // Computed risk / screening / vitals first because they often contain
  // marker-name keywords (e.g. "PREVENT" includes lipid-derived metrics).
  if (
    c.includes("prevent") ||
    c.includes("ascvd") ||
    c.includes("cvd risk") ||
    c.includes("cardiovascular risk") ||
    c.includes("heart failure") ||
    c.includes("hf risk") ||
    c.includes("framingham")
  ) {
    return "cardio_risk";
  }
  if (
    c.includes("blood pressure") ||
    c.startsWith("bp ") ||
    c.includes("vital -") ||
    c.includes("bmi") ||
    c.includes("body mass")
  ) {
    return "vitals";
  }
  if (
    c.includes("insulin resistance") ||
    c.includes("stop-bang") ||
    c.includes("stop bang") ||
    c.includes("sleep apnea") ||
    c.includes("screening")
  ) {
    return "screening";
  }

  // CBC / hematology
  if (
    c.includes("hemoglobin") && !c.includes("a1c") ||
    c.includes("hematocrit") ||
    c.includes("erythrocytosis") ||
    c.includes("mcv") ||
    c.includes("rbc") ||
    c.includes("wbc") ||
    c.includes("leukopenia") ||
    c.includes("thrombocyto") ||
    c.includes("platelet") ||
    c.includes("cbc")
  ) {
    return "cbc";
  }

  // Lipids
  if (
    c.includes("cholesterol") ||
    c.includes("ldl") ||
    c.includes("hdl") ||
    c.includes("triglyceride") ||
    c.includes("apob") ||
    c.includes("lipoprotein") ||
    c.includes("lp(a)") ||
    c.includes("lipid")
  ) {
    return "lipids";
  }

  // Inflammation
  if (c.includes("crp") || c.includes("homocysteine") || c.includes("inflammation")) {
    return "inflammation";
  }

  // Iron
  if (c.includes("ferritin") || c.includes("tibc") || (c.includes("iron") && !c.includes("environment"))) {
    return "iron";
  }

  // Metabolic / glycemic
  if (
    c.includes("a1c") ||
    c.includes("glucose") ||
    c.includes("insulin") ||
    c.includes("diabetes")
  ) {
    return "metabolic";
  }

  // Thyroid
  if (
    c.includes("tsh") ||
    c.includes("thyroid") ||
    c.includes("free t4") ||
    c.includes("free t3") ||
    c.includes("tpo")
  ) {
    return "thyroid";
  }

  // Hormones (sex hormones / adrenal)
  if (
    c.includes("testosterone") ||
    c.includes("estradiol") ||
    c.includes("progesterone") ||
    c.includes("fsh") ||
    c.includes("lh") ||
    c.includes("prolactin") ||
    c.includes("shbg") ||
    c.includes("dhea") ||
    c.includes("amh") ||
    c.includes("müllerian") ||
    c.includes("mullerian") ||
    c.includes("hormone")
  ) {
    return "hormones";
  }

  // Micronutrients
  if (
    c.includes("vitamin") ||
    c.includes("folate") ||
    c.includes("b12") ||
    c.includes("25-oh")
  ) {
    return "micronutrients";
  }

  // CMP / Electrolytes / Liver / Kidney
  if (
    c.includes("sodium") ||
    c.includes("potassium") ||
    c.includes("chloride") ||
    c.includes("bicarb") ||
    c.includes("co2") ||
    c.includes("bun") ||
    c.includes("creatinine") ||
    c.includes("egfr") ||
    c.includes("kidney") ||
    c.includes("calcium") ||
    c.includes("albumin") ||
    c.includes("protein") ||
    c.includes("ast") ||
    c.includes("alt") ||
    c.includes("bilirubin") ||
    c.includes("liver") ||
    c.includes("fib-4") ||
    c.includes("electrolyte") ||
    c.includes("uric acid")
  ) {
    return "cmp";
  }

  return "other";
}

/**
 * Sort interpretations into EHR panel order. Stable within each panel so the
 * engine's existing per-marker ordering is preserved.
 */
export function orderInterpretationsByPanel(
  interpretations: LabInterpretation[],
): LabInterpretation[] {
  const panelIndex = new Map<PanelKey, number>();
  PANEL_ORDER.forEach((p, i) => panelIndex.set(p, i));

  const indexed = interpretations.map((interp, originalIdx) => ({
    interp,
    originalIdx,
    panel: panelIndex.get(panelForCategory(interp.category)) ?? PANEL_ORDER.length,
  }));

  indexed.sort((a, b) => {
    if (a.panel !== b.panel) return a.panel - b.panel;
    return a.originalIdx - b.originalIdx;
  });

  return indexed.map(x => x.interp);
}
