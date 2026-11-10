#!/usr/bin/env bash
set -euo pipefail
# NEW private socket cluster only. Never use an application database URL.
tmp="$(mktemp -d /tmp/cliniq-encounter-date.XXXXXX)"
cleanup() {
  pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT
initdb -D "$tmp/data" -U encounter_date_test --auth-local=trust --auth-host=reject --no-locale > "$tmp/init.log"
pg_ctl -D "$tmp/data" -l "$tmp/postgres.log" -o "-c listen_addresses='' -k $tmp -p 5432" start >/dev/null
createdb -h "$tmp" -p 5432 -U encounter_date_test encounter_date_test
# Use only already-installed test tooling; never download packages in this runner.
ENCOUNTER_DATE_TEST_SOCKET="$tmp" ./node_modules/.bin/vitest run tests/unit/encounter-date-postgres.test.ts
