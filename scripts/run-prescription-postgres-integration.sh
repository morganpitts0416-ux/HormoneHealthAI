#!/usr/bin/env bash
set -euo pipefail
# Creates a NEW private Unix-socket PostgreSQL cluster. Never uses DATABASE_URL.
tmp="$(mktemp -d /tmp/cliniq-rx-pg.XXXXXX)"
cleanup() {
  pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$tmp"
}
trap cleanup EXIT
initdb -D "$tmp/data" -U cliniq_synthetic_owner --auth-local=trust --auth-host=reject --no-locale > "$tmp/init.log"
pg_ctl -D "$tmp/data" -l "$tmp/postgres.log" -o "-c listen_addresses='' -k $tmp -p 5432" start >/dev/null
createdb -h "$tmp" -p 5432 -U cliniq_synthetic_owner cliniq_synthetic
npx tsx scripts/prescription-postgres-integration.ts "$tmp" "${1:-}"
