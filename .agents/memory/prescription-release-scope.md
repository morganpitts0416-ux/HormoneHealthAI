---
name: Prescription release scope
description: Clinical scope and approval boundaries for the initial prescription workflow.
---

The initial prescription workflow uses the provider's existing saved account
signature and is limited to noncontrolled prescriptions. Automated
controlled-substance verification remains out of scope.

Saved SIG directions are shared within the clinic, not personal to each
prescriber and not shared across clinics.

**Why:** The user explicitly chose clinic-shared SIGs.

**How to apply:** Medication-specific direction libraries and their management
must remain clinic-scoped; signing authority remains individual.

**Why:** The user explicitly set this initial-release scope.

**How to apply:** Do not expand prescription eligibility or replace the saved
account signature workflow without a new instruction. Human-reviewed
noncontrolled eligibility evidence must not be populated from guessed or
AI-inferred drug classifications.

Database migrations, Google Cloud deployment, and enabling live prescription
signing require approval.

**Why:** The user explicitly required approval for these steps when integrating
the Cloud Shell handoff.

**How to apply:** Offline code, review-only schema scripts, and synthetic
verification are not permission to apply schema, deploy, or activate signing.
Do not substitute the Cloud Shell handoff's core routes, schema, or encounter
screen wholesale for newer unrelated work in this repository.
