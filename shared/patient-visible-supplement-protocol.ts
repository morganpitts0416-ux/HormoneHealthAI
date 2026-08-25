import type {
  ProviderOverrides,
  SupplementPriority,
  SupplementRecommendation,
} from "./schema";

/** The single canonical key for matching supplement decisions across all layers. */
export function normalizeSupplementName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function isSupplementPriority(value: unknown): value is SupplementPriority {
  return value === "high" || value === "medium" || value === "low";
}

/**
 * Canonicalizes priority override keys at the API persistence boundary.
 * Invalid values are excluded so they cannot affect patient-facing output.
 */
export function normalizeSupplementPriorityOverrides(
  input: unknown,
): Record<string, SupplementPriority> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const normalized: Record<string, SupplementPriority> = {};
  for (const [name, priority] of Object.entries(input)) {
    const normalizedName = normalizeSupplementName(name);
    if (normalizedName && isSupplementPriority(priority)) {
      normalized[normalizedName] = priority;
    }
  }
  return normalized;
}

/** Reads a provider priority decision using the same normalized name everywhere. */
export function getSupplementPriorityOverride(
  overrides: ProviderOverrides | null | undefined,
  supplementName: string,
): SupplementPriority | undefined {
  const normalizedName = normalizeSupplementName(supplementName);
  if (!normalizedName) return undefined;

  for (const [name, priority] of Object.entries(overrides?.supplementPriorityOverrides ?? {})) {
    if (normalizeSupplementName(name) === normalizedName && isSupplementPriority(priority)) {
      return priority;
    }
  }
  return undefined;
}

/**
 * Resolves the one patient-visible Supplement Protocol from ClinIQ Brain
 * recommendations and explicit clinician choices. This intentionally does not
 * score, select, or otherwise alter Brain recommendations.
 *
 * Ordering is stable: Brain recommendations retain their order, while an
 * explicitly clinician-added product replaces a matching Brain product and is
 * placed at the end of the protocol. This keeps clinician decisions visible
 * and prevents duplicate product instructions.
 */
export function resolvePatientVisibleSupplementProtocol(
  brainRecommendations: readonly SupplementRecommendation[] | null | undefined,
  overrides: ProviderOverrides | null | undefined,
): SupplementRecommendation[] {
  const hiddenNames = new Set(
    (overrides?.hiddenSupplementNames ?? []).map(normalizeSupplementName),
  );
  const resolved = new Map<string, SupplementRecommendation>();

  for (const recommendation of brainRecommendations ?? []) {
    if (!recommendation?.name || hiddenNames.has(normalizeSupplementName(recommendation.name))) {
      continue;
    }
    const key = normalizeSupplementName(recommendation.name);
    if (!resolved.has(key)) {
      const priority = getSupplementPriorityOverride(overrides, recommendation.name);
      resolved.set(key, priority ? { ...recommendation, priority } : recommendation);
    }
  }

  // An added product is an explicit clinician decision and therefore wins if
  // it has the same display name as an auto-selected Brain recommendation.
  for (const recommendation of overrides?.addedSupplements ?? []) {
    if (!recommendation?.name) continue;
    const key = normalizeSupplementName(recommendation.name);
    resolved.delete(key);
    const priority = getSupplementPriorityOverride(overrides, recommendation.name);
    resolved.set(key, priority ? { ...recommendation, priority } : recommendation);
  }

  return Array.from(resolved.values());
}