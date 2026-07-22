---
name: SOAP Pipeline V2 (SOAP_STRUCTURED_ACTIONS_V2)
description: 9-phase SOAP pipeline improvement behind a feature flag — what was added, where, and how the phases map to code.
---

# SOAP Structured Actions V2

Feature flag: `SOAP_STRUCTURED_ACTIONS_V2=true` env var (default OFF in production).

## Where flag is checked
- `server/routes.ts` ~line 11416 — `useStructuredV2` for inline extraction schema + V2 exLines
- `server/soap-pipeline.ts` `generateSoapSections()` — direct env check for V2 context blocks

## V2 Extraction Fields (added to Stage 1 inline extraction)
- `treatment_actions[]` — confirmed/conditional/future_consideration with action, status, item_name, doses
- `staged_treatment_plan[]` — ordered steps with sequence, status, trigger
- `provider_interpretations[]` — provider's own stated interpretation of labs/symptoms
- `clinical_context[]` — adverse effects, cycle timing, dosing rationale

## Phase → Code Map
- Phases 1-4 (extraction schema + exLines): `server/routes.ts` inline extraction block
- Phase 5-6 (generation prompt V2 context blocks + bundle fix + weight BMI fix): `generateSoapSections()` in `soap-pipeline.ts`
- Phase 7 (QA structured discrepancy audit, check 31a-31h): `qaCheck()` system prompt + `structured_discrepancies` in response schema
- Phase 8 (safe transcript truncation head+tail): `qaCheck()` transcript handling
- Phase 9 (deterministic validation, no model call): `deterministicValidateNote()` + wired into `runEnhancedSoapPipeline()` after QA step

## Weight/BMI Fix
- `generateSoapSections()` and its QA weight check: E66.x only assigned when BMI ≥ 30 (not just for GLP-1 use)
- E66.3 = Overweight (BMI 25-29.9), NOT morbid obesity

## Backward Compatibility
- V2 fields are optional in extraction; `medication_changes_discussed` kept for legacy consumers
- Deterministic validation only runs when `extraction.treatment_actions` is non-empty
- `needs_clinician_review` accumulates high-severity deterministic findings as a safety backstop

**Why:** Supplement stops, staged plans, dose increases were being silently omitted or misdocumented in generated SOAP notes. The 9-phase approach catches these at extraction, generation, QA, and code-level.
