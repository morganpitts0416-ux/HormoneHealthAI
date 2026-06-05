---
name: Vitals persist from note text
description: How vitals get saved from AI-generated SOAP and template notes, and the cache key split that was needed.
---

## Rule
After AI SOAP or template note generation, vitals mentioned in the note text must be explicitly extracted and saved to `patient_vitals` — they are NOT automatically captured from the generated text.

## How it works (as of fix)
- `extractVitalsFromNoteText(text)` in `server/routes.ts` (~line 326) parses the VITAL SIGNS section using regex: BP, HR, Temp, RR, SpO2, Pain, Height, Weight.
- `persistVitalsFromNoteText(patientId, clinicianId, noteText)` (~line 365) calls `storage.createPatientVital()` fire-and-forget after extracting values.
- Called in `generate-soap` route right before `res.json()` after note save.
- Called in `generate-template-note` route right after `storage.updateEncounter(...)`.

## Cache key split
Two query keys exist for patient vitals:
- `["/api/patients", patientId, "vitals"]` — used by context rail, VitalTrendsDialog
- `["/api/patients", patientId, "vitals", "all"]` — used by MonitoringCheckInsPanel

All save/delete operations in vitals-dialog.tsx, nurse-note-builder.tsx, and encounters.tsx (VitalsInsertDialog) must invalidate BOTH keys.

**Why:** MonitoringCheckInsPanel used the same key as the context rail but wrapped its response, causing a cache shape conflict. The "all" suffix disambiguates them. Forgetting to invalidate one key makes the trend charts appear stale even when the DB write succeeded.
