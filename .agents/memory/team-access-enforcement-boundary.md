---
name: Team-access enforcement boundary
description: Approval boundary for moving clinic-access shadow decisions toward enforcement.
---

Do not add a runtime request-denial path for team access without a separate explicit approval. The transitional rule is non-escalating (`legacyAllow && proposedAllow`) and may be exercised only as a pure synthetic policy proof at the current boundary. Family flags remain off.

**Why:** The accepted development boundary requires that no real account can be denied and that proposed clinic access can never bypass legacy authentication, ownership, role, or resource checks. A runtime synthetic marker was judged too easy to mount incorrectly, so synthetic validation stays outside Express.

**How to apply:** For the next approved family, start with a fresh rollback-only synthetic cohort, retain base-auth logout/membership-list/reselection access, require explicit clinic selection, and obtain separate approval before adding any real-request enforcement behavior.