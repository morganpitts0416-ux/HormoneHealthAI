import type { SupplementRecommendation } from "@shared/schema";

/**
 * Keep the protocol as structured context. The Patient Communication writer
 * must understand why an item was selected, not just its display name.
 */
export function buildPatientVisibleSupplementProtocolPromptBlock(
  supplements: readonly SupplementRecommendation[] | undefined,
): string {
  if (!supplements?.length) return "";

  return `RESOLVED PATIENT-VISIBLE SUPPLEMENT PROTOCOL (structured JSON — the complete itemized protocol is shown elsewhere):
${JSON.stringify(supplements, null, 2)}

SUPPLEMENT INTEGRATION RULES:
- Do not reproduce this as a separate product list or try to mention every item.
- Integrate a supplement naturally only when it materially helps explain a major clinical finding, Brain pattern, recommendation, or monitoring plan. Use its category, indication, rationale, supportingFindings, and phenotypes to determine where it belongs.
- If you mention a supplement, use the exact selected product name. State a dose only exactly as shown above. Never substitute a generic product, alter a dose, or add a product that is absent from this resolved protocol.
- Respect therapy state: a continuationNote or continuationOnly item supports "continue" wording; use "increase" only when the supplied context explicitly documents a lower current regimen and a higher Brain-selected regimen; otherwise do not invent start, continue, or increase language.
- Structured ClinIQ Brain recommendations are authoritative. The full Supplement Protocol, not this communication, remains the itemized source for every recommended product.`;
}