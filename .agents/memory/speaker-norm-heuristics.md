---
name: Speaker normalization heuristics
description: Gotchas in normalizeSpeakerRoles() signal tuning; test suite location and run command
---

## Production code location
`server/soap-pipeline.ts` — `normalizeSpeakerRoles()` function near top of file.

## Test suite
`server/test-speaker-norm.ts` — 48 tests, 5 scenarios, zero API calls.
Run: `npx tsx server/test-speaker-norm.ts`
**The test file contains an inline copy of the regex arrays and function logic — must be kept in sync with production manually.**

## Signal tuning gotchas

### CLINICIAN_SIGNALS
- **Signal 5** (`recheck|follow-up|...`) previously ended with `weeks?|months?` — too broad. Patients say "about a month" which fired a false clinician signal. **Fixed: removed standalone `weeks?|months?`; only contextual matches remain (`labs? in \d+`).**

### PATIENT_SIGNALS
- **Signal 6** added: covers `my [LAB] is/are/came`, `does that mean I should`, `should I start/stop/...`, `is that bad/good/normal`. Catches patients reporting their own lab values using clinical vocabulary.

### Conflict detection (MEDICATION_PLAN_RE / LAB_INTERPRETATION_RE)
- **MEDICATION_PLAN_RE**: originally only allowed `(the|a|your)?` between action verb and drug noun. Patient saying "start increasing **my** rosuvastatin dose" was missed because "my" wasn't in the optional article group. **Fixed: added `my` to the group.**
- **Coverage**: conflict detection now fires on `speaker === "patient" || speaker === "unknown"` — not just "patient". A patient asking "My Lp(a) is elevated — does that mean I should start increasing my omega-3 dosage?" scores clinician=1 (elevated), patient=1 (my Lp(a) is / does that mean I should) → tie → UNKNOWN → conflict still fires.

## Safety model
Two complementary defenses for Rena Green / drift scenarios:
1. **ANTI-DRIFT prompt rules** (AD-1 through AD-8) in the SOAP buildSoapNote() prompt — prevent AI interpretive prose in A&P.
2. **normalizeSpeakerRoles()** — relabels SPEAKER_1/SPEAKER_2 before SOAP generation; conflict warnings injected into both extraction and SOAP prompts as `speakerConflictContext` / `speakerConflictContext2`.

**Why:** Without role normalization, the SOAP model receives "SPEAKER_2: Lp(a) is elevated — should I start omega-3?" and may write it into A&P as if it were a provider plan.
