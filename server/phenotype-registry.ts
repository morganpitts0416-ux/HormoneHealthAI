// Canonical registry of detectable phenotypes / screening outcomes that a
// clinician can attach as a supplement trigger. The `key` is the stable
// identifier persisted in clinician_supplement_rules.phenotype_key. The
// `label` is what the provider sees in the UI. `gender` controls which
// options are offered when adding a rule for a male- vs female-only or
// unisex supplement.
//
// When a new phenotype detection is added in the engines, add a matching
// entry here AND a name->key mapping in detectedPhenotypeKeys() below so
// custom rules can fire on it.

export interface PhenotypeKeyEntry {
  key: string;
  label: string;
  /** Which patient genders this phenotype is detectable for. */
  gender: "male" | "female" | "both";
  /** Short hint shown beneath the option in the dropdown. */
  description?: string;
}

export const PHENOTYPE_KEYS: PhenotypeKeyEntry[] = [
  // ── Insulin Resistance screening (runs for both sexes) ──────────────────
  {
    key: "ir_likelihood_moderate",
    label: "Insulin resistance — Moderate likelihood (any 2 markers positive)",
    gender: "both",
    description: "Fires when the IR screen flags moderate likelihood.",
  },
  {
    key: "ir_likelihood_high",
    label: "Insulin resistance — High likelihood (3+ markers positive)",
    gender: "both",
    description: "Fires when the IR screen flags high likelihood.",
  },
  {
    key: "ir_visceral_metabolic",
    label: "IR phenotype — Visceral / Metabolic",
    gender: "both",
  },
  {
    key: "ir_hepatic",
    label: "IR phenotype — Hepatic",
    gender: "both",
  },
  {
    key: "ir_hormonal_pcos",
    label: "IR phenotype — Hormonal / PCOS",
    gender: "female",
  },
  {
    key: "ir_early_lean",
    label: "IR phenotype — Early / Lean",
    gender: "both",
  },

  // ── PREVENT cardiovascular risk (CVD composite) ─────────────────────────
  { key: "risk_prevent_borderline", label: "PREVENT 10-yr CVD risk — Borderline (5–7.5%)", gender: "both" },
  { key: "risk_prevent_intermediate", label: "PREVENT 10-yr CVD risk — Intermediate (7.5–20%)", gender: "both" },
  { key: "risk_prevent_high", label: "PREVENT 10-yr CVD risk — High (≥20%)", gender: "both" },

  // ── ASCVD-specific risk (heart attack / stroke) ─────────────────────────
  { key: "risk_ascvd_borderline", label: "10-yr ASCVD risk — Borderline (5–7.5%)", gender: "both" },
  { key: "risk_ascvd_intermediate", label: "10-yr ASCVD risk — Intermediate (7.5–20%)", gender: "both" },
  { key: "risk_ascvd_high", label: "10-yr ASCVD risk — High (≥20%)", gender: "both" },

  // ── STOP-BANG sleep apnea screening ─────────────────────────────────────
  { key: "risk_stopbang_intermediate", label: "STOP-BANG — Intermediate risk for OSA", gender: "both" },
  { key: "risk_stopbang_high", label: "STOP-BANG — High risk for OSA", gender: "both" },

  // ── Female clinical phenotypes ──────────────────────────────────────────
  { key: "fp_inflammatory_burden", label: "Female phenotype — Inflammatory Burden", gender: "female" },
  { key: "fp_iron_deficiency", label: "Female phenotype — Iron Deficiency", gender: "female" },
  { key: "fp_insulin_resistance_visceral", label: "Female phenotype — Insulin Resistance / Visceral Adiposity", gender: "female" },
  { key: "fp_menopausal_transition", label: "Female phenotype — Menopausal Transition", gender: "female" },
  { key: "fp_estrogen_dominance", label: "Female phenotype — Estrogen Dominance / Impaired Clearance", gender: "female" },
  { key: "fp_oxidative_stress", label: "Female phenotype — Oxidative Stress Burden", gender: "female" },
  { key: "fp_stress_dysregulation", label: "Female phenotype — Stress / Cortisol Dysregulation", gender: "female" },
  { key: "fp_gut_microbiome", label: "Female phenotype — Gut-Microbiome Support", gender: "female" },
];

// Map raw phenotype name (as emitted by the female phenotype detector) →
// canonical key. Names must match the `name:` field used in
// server/phenotype-detection-female.ts exactly.
const FEMALE_PHENOTYPE_NAME_TO_KEY: Record<string, string> = {
  "Inflammatory Burden": "fp_inflammatory_burden",
  "Iron Deficiency": "fp_iron_deficiency",
  "Insulin Resistance / Visceral Adiposity": "fp_insulin_resistance_visceral",
  "Menopausal Transition": "fp_menopausal_transition",
  "Estrogen Dominance / Impaired Clearance": "fp_estrogen_dominance",
  "Oxidative Stress Burden": "fp_oxidative_stress",
  "Stress / Cortisol Dysregulation": "fp_stress_dysregulation",
  "Gut-Microbiome Support": "fp_gut_microbiome",
};

interface IRPhenotypeShape {
  key?: string;
  name?: string;
}
interface IRScreeningShape {
  likelihood?: "none" | "moderate" | "high";
  phenotypes?: IRPhenotypeShape[];
}
interface ClinicalPhenotypeShape {
  name?: string;
}
interface PreventRiskShape {
  riskCategory?: "low" | "borderline" | "intermediate" | "high";
  /** ASCVD-only 10-year risk as a fraction (0.075 = 7.5%) */
  tenYearASCVD?: number;
}
interface StopBangShape {
  riskCategory?: "low" | "intermediate" | "high";
}

export interface DetectedPhenotypeInputs {
  irScreening?: IRScreeningShape | null;
  clinicalPhenotypes?: ClinicalPhenotypeShape[] | null;
  preventRisk?: PreventRiskShape | null;
  stopBangRisk?: StopBangShape | null;
}

function ascvdCategoryFromFraction(fraction: number): "low" | "borderline" | "intermediate" | "high" {
  const pct = fraction * 100;
  if (pct < 5) return "low";
  if (pct < 7.5) return "borderline";
  if (pct < 20) return "intermediate";
  return "high";
}

/**
 * Collect the set of canonical phenotype keys that are currently "active" for
 * this patient based on the IR screening, female clinical phenotypes, and risk
 * scores that the engines have already produced. None of those engines are
 * mutated — we only read their output.
 *
 * Backwards-compatible signature: accepts either positional (irScreening,
 * clinicalPhenotypes) or a single `DetectedPhenotypeInputs` object.
 */
export function detectedPhenotypeKeys(
  arg1?: IRScreeningShape | DetectedPhenotypeInputs | null,
  clinicalPhenotypes?: ClinicalPhenotypeShape[] | null,
): Set<string> {
  const inputs: DetectedPhenotypeInputs =
    arg1 && typeof arg1 === "object" && (
      "preventRisk" in arg1 || "stopBangRisk" in arg1 || "irScreening" in arg1 || "clinicalPhenotypes" in arg1
    )
      ? (arg1 as DetectedPhenotypeInputs)
      : { irScreening: arg1 as IRScreeningShape | null | undefined, clinicalPhenotypes };

  const keys = new Set<string>();

  if (inputs.irScreening) {
    if (inputs.irScreening.likelihood === "moderate" || inputs.irScreening.likelihood === "high") {
      keys.add("ir_likelihood_moderate");
    }
    if (inputs.irScreening.likelihood === "high") {
      keys.add("ir_likelihood_high");
    }
    for (const p of inputs.irScreening.phenotypes ?? []) {
      if (p.key) keys.add(`ir_${p.key}`);
    }
  }

  for (const p of inputs.clinicalPhenotypes ?? []) {
    const mapped = p.name ? FEMALE_PHENOTYPE_NAME_TO_KEY[p.name] : undefined;
    if (mapped) keys.add(mapped);
  }

  // PREVENT composite-CVD bucket
  const preventCat = inputs.preventRisk?.riskCategory;
  if (preventCat === "borderline") keys.add("risk_prevent_borderline");
  else if (preventCat === "intermediate") keys.add("risk_prevent_intermediate");
  else if (preventCat === "high") keys.add("risk_prevent_high");

  // ASCVD-only sub-bucket (computed from tenYearASCVD fraction so we get an
  // ASCVD-specific threshold rather than the composite CVD bucket).
  const ascvdFraction = inputs.preventRisk?.tenYearASCVD;
  if (typeof ascvdFraction === "number" && Number.isFinite(ascvdFraction)) {
    const ascvdCat = ascvdCategoryFromFraction(ascvdFraction);
    if (ascvdCat === "borderline") keys.add("risk_ascvd_borderline");
    else if (ascvdCat === "intermediate") keys.add("risk_ascvd_intermediate");
    else if (ascvdCat === "high") keys.add("risk_ascvd_high");
  }

  // STOP-BANG OSA risk
  const sbCat = inputs.stopBangRisk?.riskCategory;
  if (sbCat === "intermediate") keys.add("risk_stopbang_intermediate");
  else if (sbCat === "high") keys.add("risk_stopbang_high");

  return keys;
}
