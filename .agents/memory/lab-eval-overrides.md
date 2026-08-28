---
name: Lab Evaluation Provider Overrides
description: How the providerOverrides JSONB column works and which files own each layer
---

## Rule
`providerOverrides` is a JSONB column on `lab_results`. The LabDetailModal is the
sole writer (via PATCH endpoint). The portal GET route is the sole reader that applies
them when serving patient data. Patient Communication Summary is deliberately not an
override: it has dedicated canonical columns on `lab_results`.

**Why:** Keeps the override contract narrow — one write path, one read path.

## Final patient-visible Supplement Protocol
All patient-facing protocol consumers must use the shared resolver: Brain
recommendations minus hidden names, plus clinician-added products, with
case-insensitive de-duplication and stable order. A clinician-added product wins on a
name collision.

**Why:** Portal, publishing, Patient Communication, PDFs, and curated note generation
must not independently compute a different protocol. Patient Communication
regeneration first persists the editor's override choices, then resolves from the
stored lab result so its canonical draft cannot mention a transient product choice.

## Provider priority decisions
Provider-selected supplement priorities are stored separately from Brain output as a
normalized-name map in `providerOverrides`. The shared protocol resolver applies that
map to Brain and clinician-added recommendations; the Brain/added priority remains the
fallback.

**Why:** Provider curation must change patient-facing emphasis without mutating Brain
selection or scoring. Every priority write and read uses the shared supplement-name
normalizer so case and whitespace cannot create competing decisions for one product.

**How to apply:** Any patient-facing consumer must use the resolved protocol, not raw
Brain recommendations. The Patient Communication writer treats high as a strong
domain-based inclusion signal, medium as context-dependent, and low as generally
protocol-only; it never turns priority into a mechanical supplement list.

## Shape (ProviderOverrides interface in shared/schema.ts)
- `hiddenSections` — section keys: `labResults`, `preventRisk`, `adjustedRisk`,
  `stopBang`, `insulinResistance`, `hormonePatterns`, `clinicalPhenotypes`, `maleHormonePatterns`
- `hiddenInterpretationCategories` — per-row lab marker names
- `hiddenPhenotypeNames` — female phenotype card items
- `hiddenPatternNames` — male hormone pattern items
- `hiddenHormonePatternCategories` — female hormone pattern rows
- `hiddenSupplementNames` — auto-generated supplement names to exclude
- `addedSupplements` — SupplementRecommendation[] to append (from clinician library)
- `patientSummaryDraft` — legacy field only; migrated into the canonical summary

## How to apply
**Effective supplements** = `autoSupps.filter(s => !hiddenSuppNames.includes(s.name))` + `addedSupplements`

**Patient Communication Summary** = the canonical `lab_results` value. Its explicit
`clinicianEdited` flag is false for an AI draft (safe to refresh on rerun) and becomes
true only when a clinician saves text. Never infer authorship merely because text exists.

Patient Communication generation status is a separate interpretation-result contract:
successful AI output is unmarked in provider UI; generation errors or empty model output
retain the generic fallback text and carry an explicit fallback status. Clinician-authored
canonical text suppresses the AI-failure warning, and patient portal content never receives
the diagnostic warning or error metadata.

**Why:** The patient-facing summary string must remain stable while providers need to know
when they are reviewing fallback copy rather than a real draft.

**How to apply:** Failure logging is allowlisted to function/model, failure kind,
error class/code/status, empty-response and context-limit signals, and request ID. Never
serialize the error object or log prompts, lab values, identifiers, or generated text.

## GPT-5 empty Patient Communication responses

For GPT-5 Chat Completions, `max_completion_tokens` includes hidden reasoning tokens.
A complex completed Brain context can exhaust the completion budget before emitting
patient-facing text: the request succeeds, has a request ID, and returns
`finish_reason=length` with an empty `message.content`.

**Why:** This failure looks like an extraction mismatch or successful empty response,
but it is output-budget exhaustion. A smaller synthetic context may succeed with the
same endpoint and parameters, masking the production failure.

**How to apply:** Keep Patient Communication reasoning effort explicit and reserve
enough completion budget for both reasoning and the requested draft. Temporary
response diagnostics must run synchronously immediately after the SDK resolves and
before extraction/fallback. Log only effective request settings, finish/refusal
metadata, token counts, content type/length, and response/request IDs—never response
values, prompts, lab data, or generated text.

Portal GET (`GET /api/portal/labs`) applies all overrides server-side — never send raw data.

Publish flow computes effective supplements from the lab's overrides before posting.
Published protocol summaries are historical snapshots, never the current portal/PDF
source. A publish-dialog text change is first saved to the canonical summary.

Patient Report PDF passes `effectiveSupplements` as `selectedSupplements` param
(both `generatePatientWellnessPDF` and `generateMalePatientWellnessPDF` accept it).
The Wellness PDF's “Understanding Your Results” must render the canonical summary,
not independently generated wellness-plan educational content.

## Summary parity caveat
The saved chart-detail flow is aligned only after the canonical summary is populated
and saved: the portal reads the canonical column, while the chart-detail PDFs receive
the same editor value. The PDF helpers still retain a legacy fallback to the
interpretation's generated summary, and the standalone lab-interpretation export
passes that generated value directly.

**Why:** The fallback preserves older/unsaved interpretation workflows, but it means
“identical everywhere” is not an absolute guarantee for blank, unsaved, or legacy
exports.

**How to apply:** When auditing patient-visible parity, distinguish the saved
patient-profile flow from standalone interpretation exports. Treat the canonical
column as authoritative for portal and saved-chart PDF comparisons.

## Auto-save pattern in LabDetailModal
900ms debounced PATCH via `saveOverridesMutation`. State machine: `saved` → `unsaved`
(on any toggle) → `saving` (debounce fires) → `saved` / `unsaved` (on result).
Cleanup effect clears the timer on unmount to avoid stale PATCH.
