---
name: Transcript provenance
description: Rules for preserving audio-transcription source integrity across recording, retry, and clinical-note generation.
---

Treat raw STT as immutable, server-owned source evidence. Editable encounter transcription remains a compatibility/editor field and diarized or normalized text remains derived assistance; neither is automatically authoritative when provenance segments exist.

**Why:** Clinical vocabulary prompts, arbitrary derived-model output, mutable raw fields, and completion-order assembly can introduce or preserve content that did not come from the recording.

**How to apply:** Persist every STT outcome—including empty and failed segments—under a deterministic recording-session/segment sequence. Retries replace that exact slot rather than adding a duplicate. Resolve clinical generation input from ordered raw segments first, using legacy text only where no provenance exists, and keep gaps explicit.