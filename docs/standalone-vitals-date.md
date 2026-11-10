# Standalone vital-sign measurement dates

## Release boundary

- Branch: `release/standalone-vitals-date-20261110`
- Workspace: `.local/releases/standalone-vitals-date-20261110`
- Exact parent: `3cb1e88f9e6904fb07100b93c8c1b225272e9f83`
- The user reports that parent was deployed and tested on
  `hormonehealthai-00603-xon`. This work does not query GCP or independently
  attest the running container image.
- Local preparation only: no push, main merge, deployment, service restart,
  production connection, migration or historical repair.

## Behavior

The standalone Vital Signs dialog's Add Vitals form has a required **Date Taken**
picker. Each new form opening defaults to today's clinician-local calendar date,
not today's UTC date. Historical selections are submitted as `recordedAt`.
Failed saves retain the selected date and entered measurements. Switching patient
context clears the draft so it cannot carry into another patient's form.

Saved readings can be edited through the existing Vital Trends editor. Date Taken
initializes from the saved measurement date, including after closing/reopening.
Changing a standalone reading's date updates that reading's measurement date.
Leaving its date unchanged does not truncate a legacy timestamp. Encounter-linked
readings display the inherited date read-only and never submit a date override.

The existing `public.patient_vitals.recorded_at` timestamp column carries the
measurement date; no new field or table is needed. Date-only entries use the same
UTC calendar-date carrier as the existing encounter-date release. Midnight in
this representation is not a claim that measurements were taken at midnight.
Existing timestamp callers retain their timestamp precision and default-on-
omission behavior. Invalid date-only values, including invalid leap dates, are
rejected before writing. The existing `created_at` audit timestamp is unchanged.

History/trends continue sorting by `recordedAt`. The patient-chart summary now
formats its date in UTC, consistently with the existing history/trends views,
instead of displaying date-only readings on the previous day in western time
zones. Existing stored measurements are not rewritten.

## Authorization and encounter protection

Existing patient access checks, clinician identity, effective-clinic resolution,
authentication middleware and encounter-linked storage guards are retained.
Independent date edits use the existing PATCH route and storage method, not a
new authorization path. The PATCH route now returns the existing date errors'
400/423 status instead of converting them to a generic 500.

An encounter-derived vital's clinical date remains server-controlled. Existing
signed, locked and pending-review protections and encounter-date audit/version
behavior are unchanged. No note-generation, transcription, prescription or
temporary/permanent portal-transfer code is introduced.

## Validation

- **115 unit/component/regression tests passed**, including all 103 inherited
  unit tests and 12 new standalone-date tests. Actual modal/editor interactions
  cover default date, historical save, date persistence, cache refresh, failed
  save retention, patient-context reset, legacy timestamps and linked read-only
  dates. Query/HTTP responses are synthetic; charts are stubbed in these tests.
- **11 real PostgreSQL tests passed** in a newly initialized PostgreSQL 18.4
  cluster using an explicit synthetic identity and private Unix socket, no TCP.
  All eight inherited encounter tests remain, plus three tests exercising the
  actual vital POST/PATCH callbacks and authentication/clinic helpers against
  real storage. They cover historical saves/edits, invalid-date rejection,
  unchanged creation timestamps, unauthorized/cross-clinic rejection, linked
  date locks, measurement-date ordering and legacy timestamp preservation.
- **Production application build passed**, with no undefined-import warnings.
- **242 TypeScript diagnostics remain**, exactly matching the pinned parent's
  normalized file/code/message multiset; no new diagnostics. The type check
  remains globally failing for inherited issues.
- Existing startup/post-merge/schema-push safety guards passed.
- Signed-in browser interaction and live GCP behavior were not exercised.

The complete run has **126 passing tests** and no skipped PostgreSQL checks.
Build warnings about bundle size, Browserslist data and PostCSS are inherited.
Evidence logs are in
`.local/releases/standalone-vitals-date-evidence-20261110/`.

## Migration and review

**No database migration is required.** Schema definitions, dependency manifests,
lockfile, migration scripts and startup/post-merge behavior are unchanged from
the parent. No historical date-repair script was run. The inherited request-time
intake-form schema fallback is outside this change and remains unchanged.

Changed-file manifest:

1. `client/src/components/vitals-dialog.tsx`
2. `client/src/components/vital-trends-dialog.tsx`
3. `client/src/pages/patient-profiles.tsx`
4. `server/storage.ts`
5. `server/routes.ts`
6. `shared/vital-date.ts`
7. `tests/unit/standalone-vital-date.test.tsx`
8. `tests/unit/encounter-date-postgres.test.ts`
9. `docs/standalone-vitals-date.md`

This preparation is not authorization to push, merge, deploy or alter production
traffic. Review and separate approval are required before those actions.
