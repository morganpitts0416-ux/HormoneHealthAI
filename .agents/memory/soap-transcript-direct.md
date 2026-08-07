---
name: Transcript-direct SOAP mode
description: SOAP_TRANSCRIPT_DIRECT env flag enables transcript-first generation; disabled by default pending quality comparison on real encounters.
---

# Transcript-Direct SOAP Mode

## The rule
Set `SOAP_TRANSCRIPT_DIRECT=true` to enable. **Disabled by default** — must run quality comparison on ≥3 real encounter transcripts before enabling in production.

**Why:** Extraction compresses the transcript into structured fields, losing patient voice, temporal reasoning, and mid-visit plan changes. Transcript-direct feeds the raw conversation as primary and uses extraction only as a QA anchor.

**How to apply:**
- Enable via env var only after side-by-side quality comparison confirms richer, accurate notes (see follow-up task)
- The gap-detector pass is findings-only — it never rewrites the note directly. Any correction routes through the comprehensive `qaCheck` which holds the full clinical safety contract. This design is intentional and must be preserved if the pipeline is refactored.
- The existing `qaCheck` always runs in both modes; the transcript-direct scan is additive, not a replacement.
