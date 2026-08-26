---
name: SOAP pipeline prompt-rule conflicts
description: When adding new rules to the SOAP note generation/QA prompts, check them against existing locked rules for contradictions.
---

The SOAP pipeline has multiple layered rule systems (generation critical violations, reconciliation checklist, QA verification checks, restore pass). New rules easily contradict existing ones.

**Why:** An architect review caught two conflicts when adding agency/ICD rules: (1) example text "she is agreeable" collided with the existing NO BOILERPLATE CONSENT PHRASES ban; (2) a "drop unsupported ICD codes" rule collided with DIAGNOSIS PRESERVATION ("err on keeping diagnoses"). Conflicting instructions make model behavior unstable.

**How to apply:** Before adding any prompt rule to soap-pipeline.ts, grep for existing rules covering the same territory (boilerplate bans, diagnosis preservation, provider-voice rules, decision-state language). Scope new rules explicitly (e.g., "individual ICD codes, NOT Assessment items — DIAGNOSIS PRESERVATION takes precedence") and keep example sentences compliant with every existing ban. Also: new extraction fields must be piped in three places — extraction JSON schema, writer user-prompt injection blocks, and the QA NORMALIZED INTELLIGENCE block.

**Section ownership and completeness:** Preserve the full clinically meaningful encounter story in the HPI, while routing each fact to the form required by the section that owns it: focused synthesis in Overall Clinical Impression, decision-relevant evidence in Clinical Rationale, actions in Plan, and patient instructions/safety information in Care Plan. Required cross-section medication/action coverage must remain.

**Why:** Broad completeness rules can cause the model to replay the same history, counseling exchange, and alternatives discussion across every SOAP section. “Focused” must never be treated as permission to summarize away meaningful clinical content.

**How to apply:** When revising writer or QA rules, distinguish repetition of safety-critical action details from repetition of clinical narrative. Align writer injection blocks and QA coverage rules with section function. Preserve the resolved clinically-consequential decision-state ambiguity guardrail; do not broaden or alter that QA check without explicit user approval.

### Medication identity uncertainty versus patient action

Internal extraction confidence for an unrecoverable medication/product name must not become a patient-facing confirmation task. When the treatment category and decision are established, document that supported plan without inventing product details; when the intervention is not established as active treatment, omit it from active Plan/Care Plan. Reserve provider review for clinically consequential conflicts among identifiable treatments, doses, routes, or decisions.

**Why:** A broad "unclear identity" safeguard can turn missing transcript detail into unsafe or artificial instructions for patients to verify a medication with the clinic or pharmacy.

**How to apply:** Align normalization, writer, QA, and injected extraction-summary language. Preserve stated medication details and true conflict flags, but never create Care Plan work solely because the transcript lacks prescription detail.
