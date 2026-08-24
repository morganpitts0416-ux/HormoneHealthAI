import type {
  ProviderOverrides,
  SupplementRecommendation,
} from "./schema";

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
  const normalizedName = (name: string) => name.trim().toLocaleLowerCase();
  const hiddenNames = new Set(
    (overrides?.hiddenSupplementNames ?? []).map(normalizedName),
  );
  const resolved = new Map<string, SupplementRecommendation>();

  for (const recommendation of brainRecommendations ?? []) {
    if (!recommendation?.name || hiddenNames.has(normalizedName(recommendation.name))) {
      continue;
    }
    const key = normalizedName(recommendation.name);
    if (!resolved.has(key)) {
      resolved.set(key, recommendation);
    }
  }

  // An added product is an explicit clinician decision and therefore wins if
  // it has the same display name as an auto-selected Brain recommendation.
  for (const recommendation of overrides?.addedSupplements ?? []) {
    if (!recommendation?.name) continue;
    const key = normalizedName(recommendation.name);
    resolved.delete(key);
    resolved.set(key, recommendation);
  }

  return Array.from(resolved.values());
}