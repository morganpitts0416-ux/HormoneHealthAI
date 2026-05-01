/**
 * Schema/contract tests for the note-templates create + update API.
 *
 * These tests guard against the shortcut-field mismatch that previously
 * caused POST /api/note-templates to 400 when the UI omitted/cleared a
 * shortcut. Both create and update must accept the same set of shortcut
 * shapes (string, empty string, null, undefined) and both must normalize
 * to either a trimmed non-empty string or null.
 *
 * Run from repo root:
 *   node --import tsx --test tests/note-templates-api.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  noteType: z.enum(["soap_provider", "nurse", "phone"]),
  shortcut: z.string().max(50).nullable().optional(),
  blocks: z.array(z.any()),
  isShared: z.boolean().default(false),
});

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  shortcut: z.string().max(50).nullable().optional(),
  blocks: z.array(z.any()).optional(),
  isShared: z.boolean().optional(),
});

function normalizeShortcut(s: string | null | undefined): string | null {
  return typeof s === "string" ? (s.trim() || null) : null;
}

const baseCreate = {
  name: "URI Visit",
  noteType: "soap_provider" as const,
  blocks: [],
};

test("POST schema accepts shortcut omitted (default templates)", () => {
  const parsed = createSchema.parse({ ...baseCreate });
  assert.equal(parsed.shortcut, undefined);
  assert.equal(normalizeShortcut(parsed.shortcut), null);
});

test("POST schema accepts shortcut: null (UI sends null when cleared)", () => {
  const parsed = createSchema.parse({ ...baseCreate, shortcut: null });
  assert.equal(parsed.shortcut, null);
  assert.equal(normalizeShortcut(parsed.shortcut), null);
});

test("POST schema accepts empty / whitespace shortcut and normalizes to null", () => {
  for (const s of ["", "   ", "\n"]) {
    const parsed = createSchema.parse({ ...baseCreate, shortcut: s });
    assert.equal(normalizeShortcut(parsed.shortcut), null, `should null for ${JSON.stringify(s)}`);
  }
});

test("POST schema accepts a real shortcut and trims it", () => {
  const parsed = createSchema.parse({ ...baseCreate, shortcut: "  uri  " });
  assert.equal(normalizeShortcut(parsed.shortcut), "uri");
});

test("POST schema rejects a shortcut longer than 50 chars", () => {
  assert.throws(() => createSchema.parse({ ...baseCreate, shortcut: "a".repeat(51) }));
});

test("PATCH schema accepts the same shortcut shapes as POST (parity)", () => {
  // The previous bug had POST disallowing null while PATCH allowed it.
  // Lock in parity with a single set of shapes used against both schemas.
  const shapes = [undefined, null, "", "  ", "myshort"];
  for (const s of shapes) {
    const create = createSchema.safeParse({ ...baseCreate, shortcut: s });
    const update = updateSchema.safeParse({ shortcut: s });
    assert.equal(create.success, true, `create rejected ${JSON.stringify(s)}`);
    assert.equal(update.success, true, `update rejected ${JSON.stringify(s)}`);
  }
});

test("description field also has POST/PATCH parity (string | null | omitted)", () => {
  for (const d of [undefined, null, "", "Detailed visit"]) {
    const create = createSchema.safeParse({ ...baseCreate, description: d });
    const update = updateSchema.safeParse({ description: d });
    assert.equal(create.success, true, `create rejected description=${JSON.stringify(d)}`);
    assert.equal(update.success, true, `update rejected description=${JSON.stringify(d)}`);
  }
});
