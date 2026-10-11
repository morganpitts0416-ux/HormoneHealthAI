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

The approved release brief permits offline implementation, synthetic verification,
and dedicated local release branches/commits. It does not permit remote pushes or
merges, GCP resources/configuration/traffic changes, production restarts, applied
database migrations, or live signing activation without separate approval.

**Why:** The user requires independent production provenance and distinct code,
staging-verification, and production-approval gates.

**How to apply:** Missing production baseline or infrastructure access is a
reported release blocker, not permission to substitute development source or
claim staging/production verification. Finish safe code before requesting those
approvals.

Clinic business contacts must be explicitly reviewed before use on prescription
letterhead; an account's Clinic Information phone/address is not automatically
proof of a clinic-specific business contact.

**Why:** Legacy account information can be personal or belong to another clinic,
and the user prohibits substituting a prescriber's personal phone for the clinic.

**How to apply:** Offer legacy values only for explicit authorized review, never
silently copy/fall back; keep independent clinic-scoped letterhead authority.

Prescriber approval must be independent: even an owner cannot approve themselves.

**Why:** The user explicitly requires independent credential verification and an
audit trail.

**How to apply:** Clinic administration does not itself establish signing authority;
approved identity and current clinic/provider access must be checked separately.
