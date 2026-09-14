# Account 2 Phase E Stopping Addendum

## Purpose

This is a sanitized, development-only stopping record for the accepted bounded Phase E apply. It contains internal numeric identifiers and state metadata only. It contains no patient name, email, password, password hash, token, session identifier, clinical data, or other PHI.

No account, identity, relationship, session, feature flag, authentication, authorization, schema, or application state was changed during this audit.

## Exact additive state

| Item | Observed state |
|---|---|
| Legacy portal account | 2 |
| Identity | 130 |
| Legacy-account mapping | 64 |
| Patient-clinic relationship | 119 |
| Relationship type | `self` |
| Relationship status | `active` |
| Scope | `full_portal` |
| Verification method | `phase_e_apply` |
| Verification state | Verified: `verified_at` is populated |
| Verified by clinician user | None |
| Verified by staff member | None |
| Expiration | None |
| Revocation state | Not revoked: `revoked_at` is null |
| Mapping state | `identity_ready` |
| Identity session version | 1 |
| Identity-owned synthetic sessions | 0 |
| Enabled identity/access flags | 0 |

The relationship is additive. It did not replace, disable, or alter the legacy portal account.

## Why relationship 119 does not affect current portal access

Current patient authentication remains legacy-authoritative:

- `POST /api/portal/login` reads and compares the password hash on `patient_portal_accounts`, then stores only `portalPatientId` in the existing Express session (`server/routes.ts:5561-5614`).
- The login route does not read `patient_portal_credentials` to make an authentication decision.
- `requirePortalAuth` checks only `req.session.portalPatientId`; it does not load or enforce identity 130, mapping 64, or relationship 119 (`server/routes.ts:5264-5268`).
- The access-foundation relationship logic is observation-only and feature-flagged. With all relevant flags disabled, it does not enforce a decision or change a response (`server/access-foundation.ts:189-253`).

Therefore relationship 119 is not currently consulted as an authorization requirement by legacy portal routes. It is present for reviewed transition provenance only.

## Why identity 130 and mapping 64 cannot authenticate

- No ordinary HTTP login route authenticates a `patient_portal_credentials` row.
- No ordinary HTTP route creates an identity-owned patient session.
- Mapping 64 is `identity_ready`, not `identity_enabled`.
- There are zero identity-owned synthetic sessions.
- All identity/access feature flags are disabled.
- The development synthetic-auth script is not an HTTP route and its authentication path requires controlled state and flag conditions that are not currently present.

Identity 130 and mapping 64 therefore cannot independently authenticate or authorize a portal request.

## No ordinary HTTP enablement path

A source audit found no ordinary HTTP route that writes `patient_portal_identity_legacy_accounts.migration_state` or transitions `identity_ready` to `identity_enabled`.

The only enablement machinery is controlled development tooling. It is environment-attested, flag-gated, bounded, and separate from the running application's HTTP routes. No clinic selector or identity-owned portal login is implemented.

## Historical operation separation

The first apply and later audit correction are distinguishable:

1. Migration run 82 records operation `apply`, status `completed`, at `2026-09-11T17:37:06.029Z`.
2. Migration event 55 records `apply → identity_ready` at `2026-09-11T17:38:36.660Z`.
3. Relationship event 107 records `relationship_verified → active` at `2026-09-11T17:38:36.660Z`.
4. Local checkpoint `c3069b4` contains the accepted Phase E apply machinery.
5. Later local checkpoint `2cf8e6e` contains the audit correction and makes both required audit events atomic for every future apply.

The database therefore preserves the original completed run and later event timestamps rather than rewriting the original apply time. The source history separately records the correction. No additional account-2 mutation was performed for this stopping audit.

## Stopping boundary

- Do not roll back account 2.
- Do not move mapping 64 to `identity_enabled`.
- Do not change identity 130, relationship 119, or their credentials.
- Do not enable identity authentication, relationship enforcement, clinic selection, or identity-owned sessions.
- Do not use account 2 for implementation testing without separate approval.
