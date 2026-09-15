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

## Scheduling/reference boundary (accepted)

The next development-only read boundary is intentionally split as follows:

* `GET /api/medication-dictionary` is **excluded**. Its handler is already
  authenticated, but the collection is clinician-owned (`clinicianId`) and has
  no clinic context. The caller is the clinician medication-dictionary page;
  no server-side caller was found. It is not clinic reference data, and
  forcing ordinary clinic authorization onto it would invent a tenant
  constraint that the handler/storage contract does not have.
* `GET /api/appointment-types` is **included**. The scheduling page,
  appointment dialog, and account-scheduling page are authenticated
  clinician/staff consumers; no server-side caller was found. The handler
  obtains context only from the server session's effective clinic and
  `getAppointmentTypes` requires `appointment_types.clinic_id = clinicId`;
  `includeInactive` changes only active filtering.
* `GET /api/availability/slots` is **included**. It is an authenticated
  clinic scheduling consumer with no current frontend or server-side caller
  (there is no patient-portal or public-booking caller in the current
  application). The server session supplies the clinic; browser `providerId`,
  `typeId`, and `date` values are selectors, never context. Provider and
  appointment-type IDs are first resolved with same-clinic predicates. A
  provider or type from another clinic produces the existing array response
  (`[]`) and schedule queries are not run.
  Availability, calendar-block, appointment, and type lookups retain their
  clinic predicates, so no provider schedule or slot crosses the boundary.

Only the latter two exact `GET` entries were added to
`ORDINARY_CLINIC_ACCESS_ALLOWLIST`, and their middleware is placed immediately
after `requireAuth`, like the prior ordinary routes. Existing handler checks
and response formats are unchanged. The middleware still computes
`finalAllow = legacyAllow && proposedAllow`; it is development-only, requires
the in-process synthetic `WeakSet` marker, and does not activate for real
users. Missing, disabled, expired, or unreadable family flags preserve legacy
behavior. Browser headers, query/body values, and unsigned cookies cannot
provide either the marker or clinic context.

The focused HTTP matrix covers authenticated active clinician and permitted
staff, revoked/stale clinician and staff sessions, missing membership, stale
default/active clinic, explicit second-clinic selection, cross-clinic
clinic-ID substitution, browser overrides, legacy denial plus proposed allow,
and absent/disabled/expired/unreadable flags. Synthetic fixture tests also
assert that appointment types, providers, and slots from a second clinic are
never returned; they use isolated test stores and do not mutate real records.

This is not a public availability policy. If patient-portal or public-booking
availability is introduced, it requires a separately audited route and policy
covering unauthenticated access, provider publication, booking ownership,
rate limiting, and clinic selection; this boundary must not be reused for it.