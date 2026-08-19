---
name: SOAP model test endpoint
description: Architecture and gotchas for the gpt-5.6-sol comparison endpoint added to the SOAP pipeline
---

## What was built
`POST /api/encounters/:id/test-soap-model` — read-only model comparison endpoint.

## Key decisions

**Model**: Hard-coded to `gpt-5.6-sol`. Not configurable from request body.

**Temperature**: Must be OMITTED entirely. `temperature: 0.3` returns HTTP 400:
"Only the default (1) value is supported." Response includes `temperatureOmitted: true`.

**Mode A** (apples-to-apples): Uses `buildSoapGenerationMessages()` — same prompts as production Step 4.
- Reuses stored `encounter.clinicalExtraction` (required; returns 400 if absent)
- Reuses stored `encounter.patternMatch` via `storedPatternMatch` param → `patternMatchRegenerated: false`
- Re-runs `medicalNormalizationAndInference()` and `buildTopicInventory()` fresh → `normalizedRegenerated: true`, `topicInventoryRegenerated: true`
- Passes `ctx.patientName` (same as production, not undefined)

**Mode B** (transcript-direct): Uses `buildSoapCoreSystemPrompt(true)` + raw transcript + historical/lab context only. No extraction pipeline.

**Strictly read-only**: `persistPatternMatch: false` passed to helper ensures zero DB writes.

## Refactoring done

`server/soap-pipeline.ts` — 7 new exports:
- `export interface NormalizedExtraction`
- `export function normalizeSpeakerRoles()`
- `export async function medicalNormalizationAndInference()`
- `export async function buildTopicInventory()`
- `export function buildSoapCoreSystemPrompt(transcriptDirect)` — returns static ClinIQ rules text
- `export function buildSoapGenerationMessages(...)` — returns `{ systemPrompt, userPrompt }`, NO model call
- `async function generateSoapSections()` — now a thin wrapper (production model unchanged: gpt-4o)

`server/routes.ts` — 2 additions:
- `async function buildSoapEncounterContext(params)` — shared context builder for production + test
  - `persistPatternMatch: boolean` — production passes `true`, test passes `false`
  - `storedPatternMatch?: any` — test passes stored result to skip AI re-run
- `POST /api/encounters/:id/test-soap-model` — the test endpoint itself

## Persistence of pipeline outputs
| Output | Stored? | Column |
|---|---|---|
| `clinicalExtraction` | YES | `encounters.clinical_extraction` |
| `patternMatch` | YES | `encounters.pattern_match` |
| `medicalNormalizationAndInference` result | NO | — |
| `buildTopicInventory` result | NO | — |

**Why:** Normalization and inventory are cheap enough to re-run; storing them would require schema changes.
