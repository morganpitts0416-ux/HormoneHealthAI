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

/**
 * Collect the set of canonical phenotype keys that are currently "active" for
 * this patient based on the IR screening + female clinical phenotypes that
 * the engines have already produced.
 */
export function detectedPhenotypeKeys(
  irScreening?: IRScreeningShape | null,
  clinicalPhenotypes?: ClinicalPhenotypeShape[] | null,
): Set<string> {
  const keys = new Set<string>();

  if (irScreening) {
    if (irScreening.likelihood === "moderate" || irScreening.likelihood === "high") {
      keys.add("ir_likelihood_moderate");
    }
    if (irScreening.likelihood === "high") {
      keys.add("ir_likelihood_high");
    }
    for (const p of irScreening.phenotypes ?? []) {
      if (p.key) keys.add(`ir_${p.key}`);
    }
  }

  for (const p of clinicalPhenotypes ?? []) {
    const mapped = p.name ? FEMALE_PHENOTYPE_NAME_TO_KEY[p.name] : undefined;
    if (mapped) keys.add(mapped);
  }

  return keys;
}
