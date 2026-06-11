---
name: prod-migrate column gap pattern
description: Adding a column to schema.ts without a matching ALTER TABLE in prod-migrate.sql silently breaks production with a 500 "column does not exist" error.
---

# prod-migrate.sql column gap

## The rule
Every new column added to any table in `shared/schema.ts` **must** have a matching
`ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type>;` in `server/prod-migrate.sql`.
Without it, the column exists in dev (Drizzle pushes it) but not in production (which only
runs `ensureSchema` → `prod-migrate.sql` at startup).

**Why:** Drizzle's `db.select().from(schema.X)` generates `SELECT ..., new_col, ...` based
on the schema definition. If the column doesn't exist in the DB, PostgreSQL throws
`column "new_col" does not exist` → HTTP 500 → the caller sees an empty array or error,
not a missing-column message. The failure is completely silent to the browser.

## How to apply
After every schema.ts column addition, before committing:
1. Add `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type>;` to prod-migrate.sql
   (add to both migration blocks if the table appears twice — once near the top for
   early-stage migrations and once in the full CREATE TABLE block).
2. `IF NOT EXISTS` makes the statement idempotent — safe to re-run against any DB state.
3. Run `npm run db:push` locally to confirm dev is in sync.

## Real incident
Commit `757e9f6` added `address TEXT` to the `patients` table in schema.ts but omitted the
ALTER TABLE. Production DB was missing the column. Every `getAllPatients` / `searchPatients`
call threw `column "address" does not exist`, returning HTTP 500. Frontend showed 0 patients
for all 1743 clinic records. Fixed by adding the ALTER TABLE to both prod-migrate.sql blocks.
