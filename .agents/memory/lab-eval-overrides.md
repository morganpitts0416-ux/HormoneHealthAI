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
