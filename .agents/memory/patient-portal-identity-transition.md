---
name: Patient portal identity transition
description: Safety rules for moving legacy patient portal accounts toward shared identities and multi-clinic access.
---

Legacy portal authentication remains authoritative for every account unless that exact account is deliberately moved to `identity_enabled`. A same-email identity, migration classification, shadow observation, or completed migration must never change a valid legacy response or session.

**Why:** Existing patients must retain their passwords and access while multi-clinic identity data is introduced. Email equality alone does not prove one person, and different bcrypt hashes do not prove different passwords.

**How to apply:** Use many-to-one account-to-identity mappings with database-enforced account/patient/clinic/normalized-email provenance that remains valid under concurrent source changes. Keep shadow evaluation post-success, non-blocking, default-off, PHI-free, and session-neutral.

Phase E apply/enable/rollback tooling is approved only for synthetic validation in an attested Replit development workspace. Apply additionally requires a default-off flag, explicit bounded account IDs, an exact current dry-run report, transaction revalidation, and idempotency. Apply stops at `identity_ready`; completion never activates identity authentication.

**Why:** Development mode alone does not prove the process is running in the intended Replit workspace, and successful migration is not consent to change an existing patient's authoritative login.

**How to apply:** Require positive Replit development metadata and reject deployment or CI contexts before opening a database connection. Never apply to or enable a real account without separate explicit approval. Copy bcrypt bytes exactly, leave legacy hashes unchanged, isolate synthetic sessions from legacy sessions, and make rollback identity-wide.

Reviewed email corrections are identity-global. Because legacy accounts retain exact-email uniqueness while multiple accounts may intentionally share one normalized identity email, sibling raw emails may need deterministic whitespace variants; every sibling must still normalize to the identity email and unrelated normalized collisions must reject.

**Why:** Updating every sibling to one exact raw email violates the legacy uniqueness constraint, while updating only one sibling breaks deferred provenance.

**How to apply:** Lock the whole identity graph, reject unrelated normalized collisions, preserve exact uniqueness deterministically, and force deferred provenance validation before commit.