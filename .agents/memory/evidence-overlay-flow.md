---
name: Evidence overlay flow
description: How SOAP evidence generation and rendering must stay aligned across the encounter editor and patient chart.
---

## Rule
Generate evidence through the explicit encounter evidence endpoint only after the SOAP note has been persisted. Do not recreate a fire-and-forget evidence job inside the SOAP-generation route.

**Why:** Parallel/background generation can read the encounter before its finalized SOAP plan is stored, creates duplicate model calls, and gives the clinician no visible success or failure state. The current evidence response also uses citation fields `title`, `source`, `year`, and optional `url`; every UI surface must render that shared schema.

**How to apply:** After a SOAP-only action completes, request evidence explicitly and update the editor state. The combined SOAP-and-evidence flow must sequence SOAP before evidence. Reuse `EvidenceCard` rather than maintaining a second citation renderer in patient profiles.