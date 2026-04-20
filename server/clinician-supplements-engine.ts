// Evaluate a clinician's custom supplement library against a patient's labs and
// (optionally) reported symptoms. Used to either layer the clinician's catalog
// alongside the built-in defaults or to fully replace the defaults, depending on
// the clinician's `supplementMode` setting.
//
// Defaults remain the source of truth in 'defaults_plus_custom' mode. In
// 'custom_only' mode, screening tools (insulin resistance phenotype, menstrual
// phase logic, etc.) still run as normal — we just stop emitting any
// patient-facing supplement recommendation when the clinician's library has
// nothing matching a triggered finding.

import type {
  ClinicianSupplement,
  ClinicianSupplementRule,
  LabValues,
  SupplementRecommendation,
} from "@shared/schema";

type AnyLabs = Record<string, any>;

/**
 * Read a numeric lab value by marker key from any of the supported lab payload
 * shapes (male LabValues or FemaleLabValues).
 */
function readLabValue(labs: AnyLabs, markerKey: string): number | undefined {
  if (!labs || !markerKey) return undefined;
  const v = labs[markerKey];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return undefined;
}

function ruleMatchesLab(rule: ClinicianSupplementRule, labs: AnyLabs): boolean {
  if (!rule.labMarker) return false;
  const value = readLabValue(labs, rule.labMarker);
  if (value === undefined) return false;
  if (rule.labMin != null && value < rule.labMin) return false;
  if (rule.labMax != null && value > rule.labMax) return false;
  return true;
}

function ruleMatchesSymptom(
  rule: ClinicianSupplementRule,
  symptoms: Set<string>,
): boolean {
  if (!rule.symptomKey) return false;
  return symptoms.has(rule.symptomKey);
}

function ruleMatches(
  rule: ClinicianSupplementRule,
  labs: AnyLabs,
  symptoms: Set<string>,
): boolean {
  switch (rule.triggerType) {
    case "lab":
      return ruleMatchesLab(rule, labs);
    case "symptom":
      return ruleMatchesSymptom(rule, symptoms);
    case "both": {
      const lab = ruleMatchesLab(rule, labs);
      const sym = ruleMatchesSymptom(rule, symptoms);
      return rule.combinationLogic === "AND" ? (lab && sym) : (lab || sym);
    }
    default:
      return false;
  }
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function priorityRank(p?: string): number {
  return PRIORITY_ORDER[p ?? "medium"] ?? 1;
}

// Map any free-form clinician category onto the constrained
// SupplementRecommendation enum so the result validates against the schema.
const CATEGORY_MAP: Record<string, SupplementRecommendation["category"]> = {
  iron: "iron",
  vitamin: "vitamin",
  mineral: "mineral",
  hormone: "hormone-support",
  "hormone-support": "hormone-support",
  cardiovascular: "cardiovascular",
  thyroid: "thyroid",
  bone: "bone",
  detox: "detox",
  metabolic: "metabolic",
  probiotic: "probiotic",
  general: "general",
};

function normalizeCategory(c?: string): SupplementRecommendation["category"] {
  if (!c) return "general";
  return CATEGORY_MAP[c.toLowerCase()] ?? "general";
}

export interface ClinicianSupplementEvalArgs {
  labs: LabValues | AnyLabs;
  /** All clinician-owned custom supplements (active only should be passed in). */
  supplements: ClinicianSupplement[];
  /** All trigger rules belonging to those supplements. */
  rules: ClinicianSupplementRule[];
  /** Patient gender for filtering supplements tagged 'male'/'female'/'both'. */
  gender: "male" | "female";
  /**
   * Optional set of patient-reported symptom keys (matches `symptomKey` in
   * rules). For pipelines that don't yet collect symptoms, pass undefined.
   */
  symptoms?: Iterable<string>;
}

/**
 * Returns supplement recommendations matching the clinician's custom rules.
 * One recommendation per supplement, deduped by name. Indication text comes
 * from the most-specific matching rule.
 */
export function evaluateClinicianSupplements(
  args: ClinicianSupplementEvalArgs,
): SupplementRecommendation[] {
  const { labs, supplements, rules, gender } = args;
  const symptomSet = new Set<string>(args.symptoms ?? []);

  if (!supplements.length || !rules.length) return [];

  const supplementById = new Map<number, ClinicianSupplement>();
  for (const s of supplements) {
    if (s.isActive === false) continue;
    if (s.gender !== "both" && s.gender !== gender) continue;
    supplementById.set(s.id, s);
  }

  // Group rules by supplement, in priority order.
  const matchedBySupplement = new Map<
    number,
    { supp: ClinicianSupplement; rule: ClinicianSupplementRule }
  >();

  for (const rule of rules) {
    const supp = supplementById.get(rule.supplementId);
    if (!supp) continue;
    if (!ruleMatches(rule, labs as AnyLabs, symptomSet)) continue;

    const existing = matchedBySupplement.get(supp.id);
    if (
      !existing ||
      priorityRank(rule.priority) < priorityRank(existing.rule.priority)
    ) {
      matchedBySupplement.set(supp.id, { supp, rule });
    }
  }

  const recs: SupplementRecommendation[] = [];
  for (const { supp, rule } of Array.from(matchedBySupplement.values())) {
    const indicationText = (rule.indicationText && rule.indicationText.trim())
      || `${supp.name} indicated by your provider's custom protocol`;
    const rationaleText = (supp.clinicalRationale && supp.clinicalRationale.trim())
      || (supp.description && supp.description.trim())
      || `Recommended from your provider's customized supplement library.`;

    const priority: SupplementRecommendation["priority"] =
      (rule.priority === "high" || rule.priority === "low") ? rule.priority : "medium";

    recs.push({
      name: supp.name,
      dose: supp.dose,
      indication: indicationText,
      rationale: rationaleText,
      priority,
      category: normalizeCategory(supp.category),
      caution: supp.description ?? undefined,
    });
  }

  // Sort high → medium → low for stable display.
  recs.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  return recs;
}

/**
 * Merge the existing default recommendations with the clinician's custom
 * matches according to the clinician's supplementMode. Defaults to
 * 'defaults_plus_custom' (preserves existing behavior). Custom supplements
 * with the same name as a default replace the default entry.
 */
export function combineSupplementRecommendations(
  defaults: SupplementRecommendation[],
  custom: SupplementRecommendation[],
  mode: string | null | undefined,
): SupplementRecommendation[] {
  if (mode === "custom_only") return custom;

  // Default behavior: defaults + custom, custom wins on name collision.
  const byName = new Map<string, SupplementRecommendation>();
  for (const d of defaults) byName.set(d.name.toLowerCase(), d);
  for (const c of custom) byName.set(c.name.toLowerCase(), c);

  const merged = Array.from(byName.values());
  merged.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  return merged;
}
