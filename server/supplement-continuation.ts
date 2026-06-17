/**
 * supplement-continuation.ts
 *
 * Post-processing layer that annotates engine supplement recommendations with
 * "continue current regimen" messaging when:
 *   Scenario A — the engine recommends a supplement AND the patient is already
 *                taking it (lab may or may not be optimal).
 *   Scenario B — the engine did NOT recommend a supplement because the lab is
 *                already optimal, AND the patient is actively taking it.
 *
 * Rules enforced:
 *  1. Does not touch scoring, ranking, phenotype logic, or firing thresholds.
 *  2. Only appends after the engine + clinician-custom + context-annotation
 *     passes have already run.
 *  3. Prevents duplicates: Scenario A annotates; Scenario B inserts once.
 *  4. Conservative wording — "while taking", never "caused by".
 *  5. Scenario B only fires when the associated lab marker is clearly optimal.
 *  6. No Scenario B entry for supplements without a reliable lab marker
 *     (magnesium, probiotics, CoQ10, etc.).
 */

import type { SupplementRecommendation } from "@shared/schema";

// ── Continuation map ────────────────────────────────────────────────────────

interface ContinuationEntry {
  /** Lowercase keywords matched against the patient's medication/supplement text */
  keywords: string[];
  /** Lowercase keywords matched against the engine's recommended supplement name */
  engineKeywords: string[];
  /** Display label used when creating a Scenario B entry */
  label: string;
  /** Drizzle category enum value for Scenario B entries */
  category: SupplementRecommendation["category"];
  /** Single lab key on the labs object (null = use labKeys multi-check) */
  labKey: string | null;
  /** Multiple lab keys for supplements with no single dedicated marker */
  labKeys?: string[];
  /** Returns true when the scalar lab value is in the optimal range */
  optimalCheck: ((v: number) => boolean) | null;
  /** Human-readable description of the lab value and its meaning */
  valueDescription: ((v: number) => string) | null;
}

const CONTINUATION_MAP: ContinuationEntry[] = [
  {
    keywords: [
      "vitamin d", "vit d", "vit. d", "d3", "d 3", "cholecalciferol",
      "d3+k2", "d3 + k2", "d3+k", "k2+d3", "d3/k2",
    ],
    engineKeywords: ["vitamin d", "vit d", "d3", "cholecalciferol"],
    label: "Vitamin D3",
    category: "vitamin",
    labKey: "vitaminD",
    optimalCheck: (v) => v >= 60,
    valueDescription: (v) => `Vitamin D level of ${v} ng/mL`,
  },
  {
    keywords: [
      "b12", "vitamin b12", "methylcobalamin", "cyanocobalamin",
      "cobalamin", "methyl b12", "methyl-b12",
    ],
    engineKeywords: ["b12", "cobalamin"],
    label: "Vitamin B12",
    category: "vitamin",
    labKey: "vitaminB12",
    optimalCheck: (v) => v >= 500,
    valueDescription: (v) => `Vitamin B12 level of ${v} pg/mL`,
  },
  {
    keywords: [
      "iron", "ferrous", "hemagenics", "hemaplex", "ferrochel",
      "ferrous sulfate", "ferrous gluconate", "iron supplement",
    ],
    engineKeywords: ["iron", "ferrous", "hemagenics"],
    label: "Iron",
    category: "iron",
    labKey: "ferritin",
    optimalCheck: (v) => v >= 50,
    valueDescription: (v) => `ferritin of ${v} ng/mL`,
  },
  {
    keywords: [
      "folate", "methylfolate", "folic acid", "l-methylfolate",
      "5-mthf", "5 mthf", "metafolin", "folinic acid",
    ],
    engineKeywords: ["folate", "methylfolate", "folic"],
    label: "Folate",
    category: "vitamin",
    labKey: "folate",
    optimalCheck: (v) => v >= 10,
    valueDescription: (v) => `folate level of ${v} ng/mL`,
  },
  {
    keywords: [
      "omega", "fish oil", "epa", "dha", "omega-3", "omega 3",
      "omegagenics", "fish-oil", "cod liver oil",
    ],
    engineKeywords: ["omega", "fish oil", "epa", "dha", "omegagenics"],
    label: "Omega-3 / Fish Oil",
    category: "cardiovascular",
    labKey: "triglycerides",
    optimalCheck: (v) => v <= 150,
    valueDescription: (v) => `triglycerides of ${v} mg/dL`,
  },
  {
    keywords: ["berberine"],
    engineKeywords: ["berberine"],
    label: "Berberine",
    category: "metabolic",
    labKey: null,
    labKeys: ["hba1c", "glucose", "fastingInsulin"],
    optimalCheck: null,
    valueDescription: null,
  },
  {
    keywords: [
      "inositol", "myo-inositol", "myo inositol",
      "d-chiro-inositol", "d-chiro inositol",
    ],
    engineKeywords: ["inositol"],
    label: "Inositol",
    category: "metabolic",
    labKey: null,
    labKeys: ["hba1c", "glucose", "fastingInsulin"],
    optimalCheck: null,
    valueDescription: null,
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[®™°·•]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function medMatchesEntry(normalizedMed: string, entry: ContinuationEntry): boolean {
  return entry.keywords.some((kw) => normalizedMed.includes(kw));
}

function engineSuppMatchesEntry(
  normalizedSuppName: string,
  entry: ContinuationEntry,
): boolean {
  return entry.engineKeywords.some((kw) => normalizedSuppName.includes(kw));
}

/**
 * Resolve whether the relevant lab marker is optimal for this entry.
 * Returns a human-readable value description when optimal, null otherwise.
 */
function resolveOptimal(
  entry: ContinuationEntry,
  labs: Record<string, unknown>,
): { valueDesc: string } | null {
  // Single-marker path
  if (entry.labKey && entry.optimalCheck && entry.valueDescription) {
    const raw = labs[entry.labKey];
    if (typeof raw !== "number") return null;
    if (!entry.optimalCheck(raw)) return null;
    return { valueDesc: entry.valueDescription(raw) };
  }

  // Multi-marker path (berberine, inositol)
  if (entry.labKeys) {
    const a1c = labs["hba1c"];
    const glucose = labs["glucose"];
    const insulin = labs["fastingInsulin"];

    if (typeof a1c === "number" && a1c < 5.7)
      return { valueDesc: `A1c of ${a1c}%` };
    if (typeof glucose === "number" && glucose < 100)
      return { valueDesc: `fasting glucose of ${glucose} mg/dL` };
    if (typeof insulin === "number" && insulin < 10)
      return { valueDesc: `fasting insulin of ${insulin} μIU/mL` };
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Apply the supplement continuation layer after all engine + annotation passes.
 *
 * @param supplements  Final list from the scoring engine (already annotated by
 *                     annotateSupplementsWithContext).
 * @param currentMeds  Patient's active medication/supplement list as plain strings
 *                     (from chart.currentMedications or structured meds table).
 * @param labs         Lab values object cast to a generic record for field access.
 */
export function applySupplementContinuation(
  supplements: SupplementRecommendation[],
  currentMeds: string[],
  labs: Record<string, unknown>,
): SupplementRecommendation[] {
  if (!currentMeds || currentMeds.length === 0) return supplements;

  // Work on a shallow copy so we never mutate the input array
  const result: SupplementRecommendation[] = supplements.map((s) => ({ ...s }));

  for (const med of currentMeds) {
    if (!med || typeof med !== "string") continue;
    const normalizedMed = normalize(med);

    for (const entry of CONTINUATION_MAP) {
      if (!medMatchesEntry(normalizedMed, entry)) continue;

      // Lab optimality check (required for both scenarios)
      const optimal = resolveOptimal(entry, labs);
      if (!optimal) continue; // lab absent or not optimal — skip

      const medLabel = med.trim();

      // Find an existing engine recommendation that matches this entry
      const existingIdx = result.findIndex((s) =>
        engineSuppMatchesEntry(normalize(s.name), entry),
      );

      if (existingIdx >= 0) {
        // ── Scenario A: annotate the existing engine recommendation ──────────
        // Only annotate once; skip if already set by a prior med in the list.
        if (!result[existingIdx].continuationNote) {
          result[existingIdx] = {
            ...result[existingIdx],
            continuationNote:
              `Patient is currently taking ${medLabel} — ${optimal.valueDesc} ` +
              `is in the optimal range. Reinforce continuation of current regimen.`,
          };
        }
      } else {
        // ── Scenario B: add a continuation-only entry ────────────────────────
        // Only insert once per entry (guard against multiple med strings
        // matching the same entry, e.g. "D3 5000" and "K2 + D3 combo").
        const alreadyInserted = result.some(
          (s) => s.continuationOnly && engineSuppMatchesEntry(normalize(s.name), entry),
        );
        if (alreadyInserted) continue;

        const continuationNote =
          `${entry.label} — Continue current regimen. Your ${optimal.valueDesc} is ` +
          `in the optimal range while taking ${medLabel}. Continue your current ` +
          `regimen unless your provider recommends a dose change.`;

        result.push({
          name: entry.label,
          dose: medLabel,
          indication: `Currently taking — ${optimal.valueDesc} is optimal`,
          rationale:
            `Patient is currently taking ${medLabel}. The ${optimal.valueDesc} is in the ` +
            `optimal range, suggesting the current regimen is effective. No new ` +
            `recommendation needed — reinforce continuation.`,
          priority: "low",
          category: entry.category,
          patientExplanation: continuationNote,
          continuationNote,
          continuationOnly: true,
          supportingFindings: [
            `${optimal.valueDesc} — optimal while taking ${entry.label}`,
          ],
          confidenceLevel: "supportive",
        } as SupplementRecommendation);
      }

      // Each med string matches at most one continuation entry
      break;
    }
  }

  return result;
}
