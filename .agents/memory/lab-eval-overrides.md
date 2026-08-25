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

Portal GET (`GET /api/portal/labs`) applies all overrides server-side — never send raw data.

Publish flow computes effective supplements from the lab's overrides before posting.
Published protocol summaries are historical snapshots, never the current portal/PDF
source. A publish-dialog text change is first saved to the canonical summary.

Patient Report PDF passes `effectiveSupplements` as `selectedSupplements` param
(both `generatePatientWellnessPDF` and `generateMalePatientWellnessPDF` accept it).
The Wellness PDF's “Understanding Your Results” must render the canonical summary,
not independently generated wellness-plan educational content.

## Auto-save pattern in LabDetailModal
900ms debounced PATCH via `saveOverridesMutation`. State machine: `saved` → `unsaved`
(on any toggle) → `saving` (debounce fires) → `saved` / `unsaved` (on result).
Cleanup effect clears the timer on unmount to avoid stale PATCH.
