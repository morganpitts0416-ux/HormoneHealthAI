---
name: SOAP development freeze
description: SOAP, transcription, recorder, provenance, prompt, model, and segmentation work is frozen during production promotion
---

## Rule

Do not make additional SOAP, transcription, recorder, STT, provenance, prompt, model, segmentation, or audio-diagnostic changes until the user explicitly restarts that work. Production promotion must use the already-tested immutable image.

**Why:** The recording/transcription failure was manually confirmed to be caused by a muted Windows microphone, and the tested build worked after unmuting it.

**How to apply:** Treat production promotion as a deployment-only operation. Do not rebuild from source or modify application behavior; only remove the two test-only diagnostic environment variables when creating the normal-production revision.