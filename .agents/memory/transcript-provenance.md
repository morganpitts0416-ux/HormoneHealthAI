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

Recorder capture transitions must wait for the preceding recorder's final event cycle before starting another recorder, and final microphone shutdown waits for the final capture/upload settlement. Persist capture timing, MIME, byte size, and hash with the deterministic slot; reject only objectively empty, malformed, or duration-incompatible audio before STT and represent it as an explicit source gap.

**Why:** A timer-based restart or early track shutdown can truncate the final Blob while still creating superficially valid source rows. Treating invalid audio as STT uncertainty would hide a capture defect or invite fabricated replacement dialogue.

**How to apply:** Keep validation conservative so a valid short trailing utterance is retained. Recorder diagnostics must be authenticated and encounter-scoped, expose metadata/outcomes only, and omit protected raw STT text.

The OpenAI Node SDK converts a server `fs.ReadStream` into a fresh multipart file that preserves the filename and bytes but has no inferred MIME type; its multipart part is therefore `application/octet-stream` even for a valid `.webm`/Opus capture.

**Why:** The browser upload can correctly identify `audio/webm;codecs=opus` while the final server-to-OpenAI request does not. Do not mistake this MIME difference for corruption without a controlled transcription comparison.

**How to apply:** Preserve the `.webm` extension, verify byte equality at the server boundary, and use a non-PHI WebM/Opus control file through the exact SDK path before changing recorder mechanics or transcription models.