---
name: Lab Evaluation Provider Overrides
description: How the providerOverrides JSONB column works and which files own each layer
---

## Rule
`providerOverrides` is a JSONB column on `lab_results`. The LabDetailModal is the
sole writer (via PATCH endpoint). The portal GET route is the sole reader that applies
them when serving patient data.

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
- `patientSummaryDraft` — string override for the patient communication summary

## How to apply
**Effective supplements** = `autoSupps.filter(s => !hiddenSuppNames.includes(s.name))` + `addedSupplements`

**Effective summary** = `typeof ov.patientSummaryDraft === 'string' ? ov.patientSummaryDraft : interp.patientSummary`

Portal GET (`GET /api/portal/labs`) applies all overrides server-side — never send raw data.

Publish flow (`publishProtocolMutation`) computes effective supplements from the lab's
overrides before posting; `handlePublishLab` pre-fills the summary textarea from
`patientSummaryDraft`.

Patient Report PDF passes `effectiveSupplements` as `selectedSupplements` param
(both `generatePatientWellnessPDF` and `generateMalePatientWellnessPDF` accept it).

## Auto-save pattern in LabDetailModal
900ms debounced PATCH via `saveOverridesMutation`. State machine: `saved` → `unsaved`
(on any toggle) → `saving` (debounce fires) → `saved` / `unsaved` (on result).
Cleanup effect clears the timer on unmount to avoid stale PATCH.
