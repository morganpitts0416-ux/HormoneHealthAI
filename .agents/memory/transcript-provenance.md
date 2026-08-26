---
name: Transcript provenance
description: Rules for preserving audio-transcription source integrity across recording, retry, and clinical-note generation.
---

Treat raw STT as immutable, server-owned source evidence. Editable encounter transcription remains a compatibility/editor field and diarized or normalized text remains derived assistance; neither is automatically authoritative when provenance segments exist.

**Why:** Clinical vocabulary prompts, arbitrary derived-model output, mutable raw fields, and completion-order assembly can introduce or preserve content that did not come from the recording.

**How to apply:** Persist every STT outcome—including empty and failed segments—under a deterministic recording-session/segment sequence. Retries replace that exact slot rather than adding a duplicate. Resolve clinical generation input from ordered raw segments first, using legacy text only where no provenance exists, and keep gaps explicit.

Clinical review must fetch that ordered server source only after all segment uploads and last-chance retries settle; browser-local text is in-progress feedback, never final clinical text. Keep an immutable per-attempt record separate from the source slot so retries retain byte size, timing, hashes, model/fallback, outcome, and protected result without logging PHI.

**Why:** A local browser result can diverge from persisted source, and replacing a source slot alone cannot distinguish capture, provider, transport, persistence, and display failures.

**How to apply:** A late failed retry must not replace an already-completed source segment. Use protected attempt records for forensic analysis; ordinary logs contain only operational errors, not transcript text.