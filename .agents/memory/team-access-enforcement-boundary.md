---
name: Team-access enforcement boundary
description: Approval boundary for moving clinic-access shadow decisions toward enforcement.
---

Do not add a real-user request-denial path for team access without separate explicit approval. The transitional rule is non-escalating (`legacyAllow && proposedAllow`). Development Express enforcement is permitted only for exact, separately approved route cohorts, an in-process server marker, and synthetic requests. Family flags remain absent/off.

**Why:** The accepted development boundary requires that no real account can be denied and that proposed clinic access can never bypass legacy authentication, ownership, role, or resource checks. A later explicit approval allowed narrowly mounted Express middleware after authenticated production-route registration and synthetic rollback proof.

**How to apply:** For each new family, require an exact reviewed allowlist, actor revalidation before resource or PHI work, tenant constraints in SQL, denied-side-effect tests, and rollback evidence. Obtain separate approval before adding routes, enabling flags, or affecting real users.