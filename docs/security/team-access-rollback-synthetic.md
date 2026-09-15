# Team-access rollback-only synthetic validation

Run this validator only against a development database:

```sh
npm run validate:team-access-rollback
```

The package command supplies `NODE_ENV=development` and the explicit
`--development-rollback` attestation. The validator additionally requires a
non-empty `REPLIT_DEV_DOMAIN`, refuses any `REPLIT_DEPLOYMENT` value, and
requires `DATABASE_URL`. It checks that all required team-access and patient
identity tables exist, then opens one PostgreSQL transaction. Every fixture
row is tagged with a fresh `SYNTH-TEAM-ACCESS-*` value, including the session
row.
The transaction is unconditionally rolled back in `finally`; no delete or
update cleanup is used and no application workflow is started.

The fresh sample exercises active and revoked clinician/staff identities,
stale cookies, missing and multi-clinic memberships, stale defaults and
active selections, same/cross/nonexistent resources, owner/administrator/
standard roles, and ambiguous/sole ownership. Evidence is queried back from
the inserted memberships, staff links, clinics, providers, and all five
session projections. Membership rows have no tag column, so their joins to
both tagged synthetic users and tagged synthetic clinics are validated before
they are admitted as evidence. Provider `display_name` and session JSON carry
the tag directly; each session JSON also carries exactly one explicit
synthetic scenario key, and missing/duplicate/unexpected keys fail closed. It
creates **no** synthetic
patient, portal-account, identity, mapping, credential, or relationship row.
The only existing patient graph inspected is `patient_portal_accounts.id=2`.
Its complete account row, linked patient row, and graph are read before,
during, and after the transaction and compared by deterministic
digest/cardinality only. Identity IDs are discovered through both account
links and relationships for account 2's linked patient. Relationship events,
identity-related authorization shadow decisions, and migration runs/events
are traversed when those historical tables exist; schema discovery permits
those optional tables to be absent while core tables fail closed.

Output is a JSON evidence artifact containing:

- exact `before`, in-transaction `during`, and post-rollback `after` counts
  for users, memberships, staff, clinics, providers, sessions, patients,
  portal accounts, identities, identity mappings, credentials, synthetic
  identity sessions, patient-clinic relationships, migration/shadow event
  tables, and authorization flags;
- exact in-transaction deltas of `users=+4`, `clinics=+3`,
  `clinic_memberships=+6`, `clinician_staff=+2`, `providers=+3`, and
  `session=+5`; every patient/portal/identity/credential/relationship,
  synthetic-identity-session, migration/shadow-event, and flag table must be
  `0`;
- scenario decisions and reason codes from the pure clinic-access resolver;
- a SHA-256 run digest and account-2 complete-row, access/credential,
  identity-flag, relationship-event, shadow-decision, and migration graph
  digests plus row cardinalities and identity-ready/not-enabled booleans.

Raw emails, passwords, password hashes, session IDs, request IDs, patient
values, database IDs, and synthetic tags are never printed. The report is
passed through the existing output sanitizer before it is emitted. Patient and
identity table deltas are asserted to be zero during the transaction. This is
validation evidence only: it does not enable enforcement, alter ownership, or
modify existing accounts, patients, clinics, identity records, or sessions.

## Ordinary clinic access development boundary

The approved synthetic-only enforcement boundary is an exact method/path
allowlist:

- `GET /api/preferences/defaults`
- `GET /api/preferences/supplements`
- `POST /api/preferences/supplements`
- `GET /api/preferences/lab-ranges`
- `PUT /api/preferences/lab-ranges`
- `GET /api/note-templates`
- `POST /api/note-templates`
- `GET /api/note-phrases`
- `POST /api/note-phrases`

These handlers were audited before inclusion. They require the existing
authenticated clinician/staff session, require clinic context, and do not
accept patient or resource identifiers. Resource-ID, patient/chart/document/
download/lab/encounter, jobs/workflows/integration, billing/cancellation,
owner/admin/staff/provider/invitation/team-management, patient portal/intake,
platform operations, public/token/bootstrap/webhook/system-secret, login/
logout/auth-me/membership/reselection route families remain excluded.

The enforcement middleware is placed after session/passport authentication and
the external-reviewer legacy deny-list, then after `requireAuth` on each
allowlisted route. Existing handler role, validation, ownership, and resource
checks remain in place. It computes
`finalAllow = legacyAllow && proposedAllow`; it can only restrict a legacy
allow.

`SHADOW_ORDINARY_CLINIC_ACCESS_AUTHZ` and
`ENFORCE_ORDINARY_CLINIC_ACCESS_AUTHZ` are absent/off by default. Missing,
expired, or unreadable flag state preserves legacy behavior exactly. Even when
the enforcement flag is enabled, only a server-side marker attached by a
development validation harness can activate the boundary. Browser headers,
query/body values, and unsigned cookies are never accepted as markers or
clinic context. Synthetic denials use the uniform sanitized response
`{"message":"Access denied"}`; no clinic existence or membership detail is
returned. No real user, session format, clinic selection, login/password
behavior, or database record is changed by this boundary.