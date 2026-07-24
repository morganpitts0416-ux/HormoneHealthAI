---
name: Encounter metadata staleness before note generation
description: Why every pre-generation encounter save must include current UI metadata, not just the transcript
---
Rule: any client flow that saves an encounter right before AI note generation must persist ALL user-editable encounter metadata (visitType, chiefComplaint) from current UI state — not only the transcription.
**Why:** An encounter is often auto-created early (e.g., when recording starts) with whatever metadata was selected at that moment. If the clinician changes the visit type afterward, transcript-only PUTs leave the DB stale and the generated note uses the wrong visit type ("follow-up" instead of new patient) — a legal-document error.
**How to apply:** When adding any new generate/auto-save path in the encounters page, include visitType/chiefComplaint (and expectedPatientId tripwire) in the pre-generation PUT. Writer prompt also treats visit_type="new-patient" as banning follow-up framing.
