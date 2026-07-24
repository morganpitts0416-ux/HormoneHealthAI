---
name: SOAP pipeline prompt-rule conflicts
description: When adding new rules to the SOAP note generation/QA prompts, check them against existing locked rules for contradictions.
---

The SOAP pipeline has multiple layered rule systems (generation critical violations, reconciliation checklist, QA verification checks, restore pass). New rules easily contradict existing ones.

**Why:** An architect review caught two conflicts when adding agency/ICD rules: (1) example text "she is agreeable" collided with the existing NO BOILERPLATE CONSENT PHRASES ban; (2) a "drop unsupported ICD codes" rule collided with DIAGNOSIS PRESERVATION ("err on keeping diagnoses"). Conflicting instructions make model behavior unstable.

**How to apply:** Before adding any prompt rule to soap-pipeline.ts, grep for existing rules covering the same territory (boilerplate bans, diagnosis preservation, provider-voice rules, decision-state language). Scope new rules explicitly (e.g., "individual ICD codes, NOT Assessment items — DIAGNOSIS PRESERVATION takes precedence") and keep example sentences compliant with every existing ban. Also: new extraction fields must be piped in three places — extraction JSON schema, writer user-prompt injection blocks, and the QA NORMALIZED INTELLIGENCE block.
