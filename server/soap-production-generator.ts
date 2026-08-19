export const LEGACY_SOAP_PRODUCTION_GENERATOR = "enhanced_gpt4o" as const;
export const MODE_B_SOL_SOAP_PRODUCTION_GENERATOR = "mode_b_gpt_5_6_sol" as const;
export const MODE_B_SOL_MODEL = "gpt-5.6-sol" as const;

export type ProductionSoapGenerator =
  | typeof LEGACY_SOAP_PRODUCTION_GENERATOR
  | typeof MODE_B_SOL_SOAP_PRODUCTION_GENERATOR;

/**
 * The legacy enhanced GPT-4o pipeline is the safe default. Unknown values also
 * resolve to legacy so a typo cannot unexpectedly enable the trial.
 */
export function resolveProductionSoapGenerator(
  configuredValue = process.env.SOAP_PRODUCTION_GENERATOR,
): ProductionSoapGenerator {
  return configuredValue === MODE_B_SOL_SOAP_PRODUCTION_GENERATOR
    ? MODE_B_SOL_SOAP_PRODUCTION_GENERATOR
    : LEGACY_SOAP_PRODUCTION_GENERATOR;
}

/**
 * GPT-5.6 Sol only accepts its default temperature. Keep the request shape in
 * one place so the production trial and read-only comparison cannot drift.
 */
export function buildModeBSolChatCompletionRequest(systemPrompt: string, userPrompt: string) {
  return {
    model: MODE_B_SOL_MODEL,
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ],
    response_format: { type: "json_object" as const },
  };
}