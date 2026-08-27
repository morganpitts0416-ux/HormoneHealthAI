---
name: Recording segment loss & audio gap markers
description: Why hour-long encounter recordings lost most of their transcript, and the invariants added to prevent silent audio loss
---

## Rule
Segmented (1-min) encounter recordings must never lose audio silently. Every failure path must either retry or leave a visible `[AUDIO GAP …]` marker in the transcript, and the SOAP pipeline appends a deterministic needs_clinician_review warning whenever the transcript contains `[AUDIO GAP`.

**Why:** A real 60+ minute encounter produced only ~7 minutes of transcript; failed segment uploads were swallowed as empty strings (toast only) and a failed MediaRecorder restart silently ended recording. Notes generated from the truncated transcript then omitted/fabricated clinical decisions (e.g. "consider hormone therapy" when the provider said "let's start the estrogen patch").

**How to apply:**
- Recording context: 3x upload retries with backoff, failed blobs retained for a last-chance retry at finalize, recorder restart auto-retried 3x, `recordingAbortedRef` blocks finalize→review after an unrecoverable recorder failure.
- Client gates SOAP/template/auto generation with a confirm dialog if transcript contains `[AUDIO GAP`.
- Never rely on prompt rules alone for gap disclosure — the deterministic backstop at the end of the SOAP pipeline is the guarantee.
- Prompt-side legal-record rules: decisions NOT to treat stay provider-attributed (never "patient hesitant"), plan verbs are exact (Initiate/Increase/Discontinue/Continue/Future Considerations), prior diagnostic workup mentioned in-visit must appear in the HPI timeline.

## Listener architecture history

The historical encounter “live transcription” feature was not true streaming recognition: it finalized and uploaded a one-minute MediaRecorder segment, then appended that completed STT result while capture continued. The global recorder migration relocated the page callback into recording context but retained that minute-cadence behavior.

**Why:** Git history contains no encounter use of Web Speech, WebSocket, or realtime transcription. Treating the older UI label as evidence of word-by-word transcription would send diagnosis toward a listener architecture that the repository never had.

**How to apply:** When comparing old and current capture failures, separate the unchanged 60-second batch/STT cadence from later recorder/provenance changes. Do not infer that `MediaRecorder.start(1000)` uploads one-second chunks; it only emits chunks for local assembly until segment stop.
