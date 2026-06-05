---
name: Drizzle array column insert
description: Drizzle .returning() can misdeserialize DB-default array columns that were omitted from .values(); must be passed explicitly.
---

## The Rule
When inserting into a table that has a PostgreSQL array column with a DB-level default (e.g. `text[].default(sql\`ARRAY[]::text[]\`)`), always include that column explicitly in the Drizzle `.values({})` call — even when you intend to use the default.

**BAD** (omits symptoms — Drizzle omits it from INSERT, DB default applies, but .returning() may not deserialize `'{}'` correctly):
```ts
.values({ patientId, clinicianId, systolicBp: ..., source: "clinic" })
```

**GOOD** (explicit empty array — Drizzle serializes [] → `'{}'`, and deserializes it back as [] correctly):
```ts
.values({ patientId, clinicianId, systolicBp: ..., source: "clinic", symptoms: data.symptoms ?? [] })
```

**Why:** When a column is absent from `.values({})`, Drizzle omits it from the INSERT column list entirely. The DB applies the SQL-expression default (`ARRAY[]::text[]`). On `.returning()`, Drizzle gets back the PostgreSQL empty-array literal `{}`. Because the column wasn't in the original values, Drizzle's per-column type metadata may not be fully resolved during deserialization, causing a runtime TypeError or returning a raw string `'{}'` instead of `[]`.

**How to apply:** Any time you write a Drizzle INSERT that touches a table with `text().array()`, `integer().array()`, or similar array-typed columns, include all of them in `.values({})` with `data.field ?? []` (or `data.field ?? null` if nullable with no default). The monitoring-episode insert already does this correctly at storage.ts ~line 3829 — use that as the reference pattern.
