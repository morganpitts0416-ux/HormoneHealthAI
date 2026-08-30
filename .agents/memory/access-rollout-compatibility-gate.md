---
name: Access rollout compatibility gate
description: Durable safety constraints for subscription lifecycle, recovery, and multi-clinic patient authorization work.
---

The legacy access path remains authoritative while proposed authorization is measured in shadow mode. Migration or backfill completion must never activate enforcement. Ambiguous owner, billing, membership, portal identity, or patient-clinic records stay on the legacy path and enter review rather than being guessed, merged, linked, reassigned, or disabled.

**Why:** Incorrect denials could interrupt care or lock patients out of their own records, while incorrect grants could expose cross-clinic PHI. Identity similarity and billing state are evidence, not authorization on their own.

**How to apply:** Keep every enforcement and production-UX flag disabled until the corresponding report is explicitly approved. Patient-clinic relationships require explicit verification; never create them from matching email, demographics, or legacy patient IDs alone. Treat rollback as disabling shadow/rollout flags without changing current sessions or access.