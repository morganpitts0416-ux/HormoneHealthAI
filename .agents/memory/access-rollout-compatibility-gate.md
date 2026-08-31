---
name: Access rollout compatibility gate
description: Durable safety constraints for subscription lifecycle, recovery, and multi-clinic patient authorization work.
---

The legacy access path remains authoritative while proposed authorization is measured in shadow mode. Migration or backfill completion must never activate enforcement. Ambiguous owner, billing, membership, portal identity, or patient-clinic records stay on the legacy path and enter review rather than being guessed, merged, linked, reassigned, or disabled. A narrow exception is approved for clinician chart and active-workflow reads: both must resolve the patient by ID and authoritative active clinic in the database query and return a non-disclosing 404 otherwise.

**Why:** Incorrect denials could interrupt care or lock patients out of their own records, while incorrect grants could expose cross-clinic PHI. Identity similarity and billing state are evidence, not authorization on their own.

**How to apply:** Keep every other enforcement and production-UX flag disabled until the corresponding report is explicitly approved. Preserve strict tenant scoping on the two approved patient-read routes independently of rollout flags. Patient-clinic relationships require explicit verification; never create them from matching email, demographics, or legacy patient IDs alone.