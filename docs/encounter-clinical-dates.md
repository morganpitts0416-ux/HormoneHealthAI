# Encounter clinical dates

`visit_date` remains authoritative wall-calendar metadata. Input is validated
without offset conversion; timestamp suffixes on legacy encounter transport
values do not change the intended calendar date. Creation, generation,
publication, amendment and signature timestamps remain event timestamps.

The existing `patient_vitals.recorded_at` column carries the encounter's calendar
date for verified encounter-derived clinic readings. Its midnight representation
is a **date carrier, not an observed measurement time**. `time_of_day` is null,
and note readings are displayed with date precision only. Other readings retain
their own measurement dates/times. No new database column or migration is needed.

Metadata writes and encounter-linked vital upserts serialize on the source
encounter row. Date corrections require the editor's original `expectedVisitDate`
baseline, preserve values and creation timestamps, and synchronize linked dates
in the same transaction. A stale editor receives a conflict rather than silently
restoring an obsolete date. Signed and review-locked dates require the established
amendment/review unlock process. New signature versions capture their clinical
date under the same row lock; missing legacy snapshot dates remain unknown.

## Historical preview and repair boundary

`scripts/preview-encounter-vital-dates.sql` is a read-only review query. It has NOT
been run against any existing application database. Run only with permission for
the chosen environment. It returns candidate IDs and dates only, with verified
matching patient/clinic relationships. Patient logs, monitoring readings, and
ambiguous/unlinked relationships are excluded.

A future repair requires separate approval of environment and candidate IDs,
an authorized operator, a reviewed backup/recovery procedure, and an idempotent
transaction using expected old dates to reject concurrent changes. Recheck
relationships and source encounter date under lock at execution time; skip
ambiguous/duplicate candidates for manual review. Change only approved clinical
date carriers and remove fabricated note measurement times; never rewrite
measurement values, creation timestamps, signature timestamps, signers, or
previous signature versions. Retain counts and an audit of approved old/new dates.
No production deployment or historical repair is authorized by this feature.

## Focused verification

- `npx vitest run tests/unit/encounter-clinical-date.test.tsx`
- `bash scripts/run-encounter-date-postgres-tests.sh` (fresh private local DB only)
- `npm run build` (check for undefined schema-export warnings)

The isolated tests exercise the actual storage implementation with synthetic
rows, never the application's development or production connection.

## Isolated GitHub-main release preparation

Baseline: `320a534de8d95265d535085ef0cf06cf95202577`.
Encounter-date source: `420d4f502b152f0a565e57c48919334d9ce25851`.
Local review branch: `release/encounter-clinical-dates-20261110`.

This is a new single-parent release based on GitHub main, not a publication of
the development branch or its additional portal/prescription commits. Agent
memory is excluded. The route changes were reconciled onto main; the storage
conflict was resolved by retaining only the new encounter-vital method, not the
earlier development branch's clinic-vitals helper. The PostgreSQL test uses
main's existing `db.$client`, not a later portal-related pool export.

### Explicit startup/build safety changes

- Startup no longer calls broad `ensureSchema()` or clinical-chart cleanup.
- Session initialization uses `createTableIfMissing: false`; the existing session
  table must already exist.
- The post-merge helper uses `npm ci --ignore-scripts` and never runs `db:push`.
  This helper was syntax-checked, not executed during release preparation.
- Build/start package lifecycle commands contain no migration invocation. The
  manual `db:push` package command remains available but is not called.
- Prepared runtime/AST tests verify those boundaries and the absence of transfer
  module dependencies. No production startup or GCP deployment was attempted.

This does not remove every pre-existing request-time schema fallback: the intake
form update handler can add missing GHL webhook columns when invoked. It is not
part of application startup and is unchanged. Verify those existing columns in
production rather than relying on that fallback.

No DDL or data migration is required by this date change. Verify the existing
encounter date/version, vital source/link/date/time/monitoring columns and session
table before deployment. The added signature-version date is JSON content, not a
new database column. Do not run the historical preview as a repair/backfill.

### Verification results

All commands ran with production credentials absent, using the existing installed
dependencies. No package manifest or lockfile changes were made.

| Check | GitHub-main baseline | Isolated release |
|---|---|---|
| Production Vite/esbuild build | PASS | PASS |
| Undefined schema-import build warnings | None | None |
| Existing regression suites | 71 passed | 71 passed |
| Date semantics/editor/signature UI | Not present | 21 passed |
| Startup/build/portal-independence guards | Not present | 3 passed |
| Actual storage with private PostgreSQL 18.4 | Not present | 8 passed |
| TypeScript (`tsc --noEmit --incremental false`) | FAIL: 247 diagnostics | FAIL: 245 diagnostics |

Release tests total **103 passed**, without skipped PostgreSQL checks. The
PostgreSQL runner creates and removes a new private socket cluster; it never
resolves inherited application database credentials. Its installed Vitest binary
is invoked directly to avoid package downloads or the Nix npx wrapper's environment
requirements.

TypeScript diagnostics were compared by file, error code and message with line
coordinates normalized. There are **no newly introduced diagnostics**; two prior
route argument-type errors are eliminated. Both builds retain existing large
chunk/bundle warnings. This is not a globally clean TypeScript release.

### Deployment disposition: NO-GO pending review

GitHub main already contains runtime-risk diagnostics including:

- The male lab page references undefined `savedLabId`.
- The Spruce patient-rematching route references undefined `db`.
- Other pre-existing diagnostics include missing storage-interface members and
  downlevel iteration issues; these were not broadly remediated.

Those first two references are preserved unchanged from main to respect the
encounter-date-only scope. Passing date/regression tests do not certify these
uncovered paths or establish parity with the current production image. Restore
the separately reviewed fixes and verify the final release before approving
production deployment. No push, main merge, container build, production database
operation, historical repair or GCP deployment has been performed.
