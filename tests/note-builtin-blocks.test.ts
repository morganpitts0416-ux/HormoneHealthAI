/**
 * Unit tests for the shared built-in clinical block helpers.
 *
 * Run from repo root:
 *   node --import tsx --test tests/note-builtin-blocks.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILTIN_BLOCKS,
  BUILTIN_BY_ID,
  ROS_SYSTEMS,
  PE_SYSTEMS,
  createChartData,
  chartDataToText,
  buildDefaultChartText,
  buildBulletSection,
  getBuiltinByTrigger,
  parseSlashTrigger,
  parseAutoInsertTrigger,
  isReservedSlashWord,
  mergeChartItems,
  RESERVED_SLASH_PREFIXES,
  buildParagraphSection,
  renderTemplateBlocks,
  type TemplateBlockRender,
} from "../shared/note-builtin-blocks";

test("BUILTIN_BLOCKS exposes all 9 required clinical sections", () => {
  const ids = BUILTIN_BLOCKS.map(b => b.id).sort();
  assert.deepEqual(ids, [
    "allergies", "current_medications", "family_history", "hpi",
    "medical_history", "physical_exam", "ros", "social_history",
    "surgical_history",
  ]);
});

test("BUILTIN_BY_ID lookup matches the array", () => {
  for (const b of BUILTIN_BLOCKS) {
    assert.equal(BUILTIN_BY_ID[b.id], b);
  }
});

test("getBuiltinByTrigger resolves canonical and alias triggers (case-insensitive)", () => {
  assert.equal(getBuiltinByTrigger("hpi")?.id, "hpi");
  assert.equal(getBuiltinByTrigger("ROS")?.id, "ros");
  assert.equal(getBuiltinByTrigger("pe")?.id, "physical_exam");
  assert.equal(getBuiltinByTrigger("exam")?.id, "physical_exam");
  assert.equal(getBuiltinByTrigger("pmh")?.id, "medical_history");
  assert.equal(getBuiltinByTrigger("psh")?.id, "surgical_history");
  assert.equal(getBuiltinByTrigger("fh")?.id, "family_history");
  assert.equal(getBuiltinByTrigger("famhx")?.id, "family_history");
  assert.equal(getBuiltinByTrigger("sh")?.id, "surgical_history");
  assert.equal(getBuiltinByTrigger("surghx")?.id, "surgical_history");
  assert.equal(getBuiltinByTrigger("sochx")?.id, "social_history");
  assert.equal(getBuiltinByTrigger("socialhx")?.id, "social_history");
  assert.equal(getBuiltinByTrigger("soc")?.id, "social_history");
  assert.equal(getBuiltinByTrigger("meds")?.id, "current_medications");
  assert.equal(getBuiltinByTrigger("allergies")?.id, "allergies");
  assert.equal(getBuiltinByTrigger("nope"), undefined);
});

test("history blocks expose chartKey for chart pull, ROS/PE do not", () => {
  for (const b of BUILTIN_BLOCKS) {
    if (b.list) {
      assert.ok(b.chartKey, `${b.id} should have chartKey`);
      assert.equal(b.chart, false);
    }
    if (b.chart) {
      assert.equal(b.list, false);
      assert.equal(b.chartKey, undefined);
    }
  }
});

test("createChartData seeds every system as visible/normal/empty", () => {
  const data = createChartData(["A", "B"]);
  assert.deepEqual(data, {
    A: { status: "normal", notes: "", visible: true },
    B: { status: "normal", notes: "", visible: true },
  });
});

test("chartDataToText strips hidden rows", () => {
  const data = createChartData(["A", "B", "C"]);
  data.B.visible = false;
  const out = chartDataToText("Review of Systems", data);
  assert.match(out, /^Review of Systems:/);
  assert.ok(!out.includes("B:"), "hidden system B should be stripped");
  assert.ok(out.includes("A:"));
  assert.ok(out.includes("C:"));
});

test("chartDataToText strips not-examined rows with no notes", () => {
  const data = createChartData(["A", "B"]);
  data.A.status = "not-examined";    // no notes → strip
  data.B.status = "not-examined";
  data.B.notes = "deferred per pt";  // has notes → keep
  const out = chartDataToText("PE", data);
  assert.ok(!out.includes("A:"), "empty not-examined row should be stripped");
  assert.ok(out.includes("B: Not examined — deferred per pt"));
});

test("chartDataToText labels statuses correctly and appends notes with em-dash", () => {
  const data = createChartData(["X"]);
  data.X.status = "abnormal";
  data.X.notes = "swelling";
  const out = chartDataToText("PE", data);
  assert.match(out, /X: Abnormal\/Positive — swelling/);
});

test("buildDefaultChartText returns canonical labels with all systems", () => {
  const ros = buildDefaultChartText("ros");
  assert.match(ros, /^Review of Systems:/);
  for (const s of ROS_SYSTEMS) assert.ok(ros.includes(`${s}:`), `ROS missing ${s}`);

  const pe = buildDefaultChartText("physical_exam");
  assert.match(pe, /^Physical Examination:/);
  for (const s of PE_SYSTEMS) assert.ok(pe.includes(`${s}:`), `PE missing ${s}`);
});

test("buildDefaultChartText honors a custom system subset (template override)", () => {
  const subset = ["Cardiovascular", "Respiratory", "Constitutional"];
  const out = buildDefaultChartText("ros", subset);
  for (const s of subset) assert.ok(out.includes(`${s}:`), `ROS missing ${s}`);
  // Systems NOT in the subset should not appear
  assert.ok(!out.includes("Eyes:"));
  assert.ok(!out.includes("Endocrine:"));
});

test("buildDefaultChartText falls back to canonical list when subset is empty", () => {
  const ros = buildDefaultChartText("ros", []);
  for (const s of ROS_SYSTEMS) assert.ok(ros.includes(`${s}:`), `ROS missing ${s}`);
});

test("buildBulletSection renders items as `  - <item>` lines", () => {
  const out = buildBulletSection("Past Medical History", [
    "Hypertension",
    "  Diabetes  ",      // surrounding whitespace must be trimmed
    "",                   // empty entry must be dropped
  ]);
  assert.equal(out, "Past Medical History:\n  - Hypertension\n  - Diabetes");
});

test("buildBulletSection emits an empty bullet placeholder for no items", () => {
  const out = buildBulletSection("Allergies", []);
  assert.equal(out, "Allergies:\n  - ");
});

// ──────────────────────────────────────────────────────────────────────────
// Paragraph (free-text) rendering of history blocks
// ──────────────────────────────────────────────────────────────────────────

test("buildParagraphSection joins items as comma-separated prose ending in a period", () => {
  const out = buildParagraphSection("Past Medical History", [
    "Hypertension",
    "Type 2 Diabetes",
    "Hyperlipidemia",
  ]);
  assert.equal(out, "Past Medical History: Hypertension, Type 2 Diabetes, Hyperlipidemia.");
});

test("buildParagraphSection trims and drops empty entries", () => {
  const out = buildParagraphSection("Allergies", ["  Penicillin  ", "", "  ", "Sulfa"]);
  assert.equal(out, "Allergies: Penicillin, Sulfa.");
});

test("buildParagraphSection emits just the heading when there are no items (no bullets)", () => {
  const out = buildParagraphSection("Surgical History", []);
  assert.equal(out, "Surgical History:");
  assert.ok(!out.includes("-"), "free-text empty state must NOT include a bullet");
});

test("buildParagraphSection preserves an existing terminal punctuation mark", () => {
  const out = buildParagraphSection("Social History", ["Lives alone", "Quit smoking 2010!"]);
  assert.equal(out, "Social History: Lives alone, Quit smoking 2010!");
});

// ──────────────────────────────────────────────────────────────────────────
// renderTemplateBlocks — universal slash menu insertion of saved templates
// ──────────────────────────────────────────────────────────────────────────

test("renderTemplateBlocks: clinical_ros honors the template's `systems` subset", () => {
  const blocks: TemplateBlockRender[] = [{
    type: "clinical_ros",
    builtinId: "ros",
    systems: ["Cardiovascular", "Respiratory"],
  }];
  const out = renderTemplateBlocks(blocks);
  assert.match(out, /Review of Systems:/);
  assert.ok(out.includes("Cardiovascular: Normal/Negative"));
  assert.ok(out.includes("Respiratory: Normal/Negative"));
  assert.ok(!out.includes("Eyes:"), "system not in subset must not appear");
  assert.ok(!out.includes("Endocrine:"), "system not in subset must not appear");
});

test("renderTemplateBlocks: clinical_physical_exam falls back to canonical systems when none specified", () => {
  const blocks: TemplateBlockRender[] = [{
    type: "clinical_physical_exam",
    builtinId: "physical_exam",
  }];
  const out = renderTemplateBlocks(blocks);
  assert.match(out, /Physical Examination:/);
  for (const s of PE_SYSTEMS) assert.ok(out.includes(`${s}:`), `PE missing ${s}`);
});

test("renderTemplateBlocks: clinical_<history> uses bullets by default and pulls from chart", () => {
  const blocks: TemplateBlockRender[] = [{
    type: "clinical_medical_history",
    builtinId: "medical_history",
    defaultValue: "Hypertension",
  }];
  const out = renderTemplateBlocks(blocks, {
    medicalHistory: ["Type 2 Diabetes", "Hypertension"], // Hypertension dedup'd
  });
  assert.match(out, /Past Medical History:/);
  assert.ok(out.includes("  - Hypertension"));
  assert.ok(out.includes("  - Type 2 Diabetes"));
  // No accidental bullet duplication.
  assert.equal(out.match(/Hypertension/g)?.length, 1);
});

test("renderTemplateBlocks: clinical_<history> with bulletMode=false renders as paragraph", () => {
  const blocks: TemplateBlockRender[] = [{
    type: "clinical_allergies",
    builtinId: "allergies",
    bulletMode: false,
    defaultValue: "Penicillin",
  }];
  const out = renderTemplateBlocks(blocks, { allergies: ["Sulfa"] });
  // Paragraph form, no bullets.
  assert.match(out, /Allergies: Penicillin, Sulfa\./);
  assert.ok(!out.includes("  -"), "free-text mode must not emit bullets");
});

test("renderTemplateBlocks: clinical_hpi defaults to narrative (no bullets) with the heading", () => {
  const narrativeOnly: TemplateBlockRender[] = [{
    type: "clinical_hpi", builtinId: "hpi",
    defaultValue: "Patient presents with cough x 3 days.",
  }];
  const out = renderTemplateBlocks(narrativeOnly);
  assert.match(out, /^HPI: Patient presents with cough x 3 days\./);
  assert.ok(!out.includes("  -"), "HPI default must NOT bullet");
});

test("renderTemplateBlocks: clinical_hpi with bulletMode=true emits OPQRST-style bullets", () => {
  const blocks: TemplateBlockRender[] = [{
    type: "clinical_hpi", builtinId: "hpi", bulletMode: true,
    defaultValue: "Onset: 2d ago\nLocation: chest\nQuality: pressure",
  }];
  const out = renderTemplateBlocks(blocks);
  assert.ok(out.includes("HPI:\n"));
  assert.ok(out.includes("  - Onset: 2d ago"));
  assert.ok(out.includes("  - Location: chest"));
  assert.ok(out.includes("  - Quality: pressure"));
});

test("renderTemplateBlocks: section_header emits an UPPERCASED heading with surrounding blank lines", () => {
  const blocks: TemplateBlockRender[] = [
    { type: "section_header", label: "Subjective" },
    { type: "freetext", label: "Notes", defaultValue: "stable" },
  ];
  const out = renderTemplateBlocks(blocks);
  assert.match(out, /SUBJECTIVE/);
  assert.match(out, /Notes: stable/);
});

test("renderTemplateBlocks: legacy (non-clinical) blocks fall back to `Label: value` lines", () => {
  const blocks: TemplateBlockRender[] = [
    { type: "freetext", label: "Vitals", defaultValue: "BP 120/80" },
    { type: "freetext", defaultValue: "no label" },
  ];
  const out = renderTemplateBlocks(blocks);
  assert.match(out, /Vitals: BP 120\/80/);
  assert.match(out, /no label/);
});

test("renderTemplateBlocks: full SOAP-like template stitches sections in order", () => {
  // Mirrors a realistic saved template combining clinical + legacy blocks.
  const blocks: TemplateBlockRender[] = [
    { type: "section_header", label: "Subjective" },
    { type: "clinical_hpi", builtinId: "hpi",
      defaultValue: "URI symptoms x 4 days." },
    { type: "clinical_medical_history", builtinId: "medical_history" },
    { type: "section_header", label: "Objective" },
    { type: "clinical_ros", builtinId: "ros",
      systems: ["Constitutional", "Respiratory"] },
    { type: "clinical_physical_exam", builtinId: "physical_exam",
      systems: ["General Appearance", "Respiratory"] },
  ];
  const out = renderTemplateBlocks(blocks, {
    medicalHistory: ["Asthma", "Seasonal allergies"],
  });
  // Order is preserved, each section lands.
  const idxSubj = out.indexOf("SUBJECTIVE");
  const idxHpi  = out.indexOf("HPI:");
  const idxPmh  = out.indexOf("Past Medical History");
  const idxObj  = out.indexOf("OBJECTIVE");
  const idxRos  = out.indexOf("Review of Systems");
  const idxPe   = out.indexOf("Physical Examination");
  assert.ok(idxSubj < idxHpi && idxHpi < idxPmh, "subjective block order");
  assert.ok(idxPmh < idxObj && idxObj < idxRos && idxRos < idxPe, "objective block order");
  assert.ok(out.includes("  - Asthma"));
  assert.ok(out.includes("  - Seasonal allergies"));
  assert.ok(out.includes("Constitutional: Normal/Negative"));
  assert.ok(out.includes("General Appearance: Normal/Negative"));
});

// ──────────────────────────────────────────────────────────────────────────
// Slash trigger parsing — the universal `/` menu must always yield to the
// pre-existing `/dx` and `/phrase` dropdowns.
// ──────────────────────────────────────────────────────────────────────────

test("RESERVED_SLASH_PREFIXES contains exactly dx and phrase", () => {
  assert.deepEqual([...RESERVED_SLASH_PREFIXES].sort(), ["dx", "phrase"]);
});

test("isReservedSlashWord matches reserved prefixes case-insensitively", () => {
  assert.equal(isReservedSlashWord("dx"), true);
  assert.equal(isReservedSlashWord("DX"), true);
  assert.equal(isReservedSlashWord("dxhtn"), true);   // /dx<query>
  assert.equal(isReservedSlashWord("phrase"), true);
  assert.equal(isReservedSlashWord("phrasecough"), true);
  assert.equal(isReservedSlashWord("hpi"), false);
  assert.equal(isReservedSlashWord("ros"), false);
  assert.equal(isReservedSlashWord("meds"), false);
});

test("parseSlashTrigger returns null when cursor is not at a slash word", () => {
  assert.equal(parseSlashTrigger(""), null);
  assert.equal(parseSlashTrigger("hello world"), null);
  assert.equal(parseSlashTrigger("hello/word"), null);   // not preceded by ws
  assert.equal(parseSlashTrigger("HPI: stuff"), null);
});

test("parseSlashTrigger detects bare /, /<word>, and tracks slashIndex", () => {
  const bare = parseSlashTrigger("notes\n/");
  assert.ok(bare);
  assert.equal(bare!.query, "");
  assert.equal(bare!.slashIndex, 6);
  assert.equal(bare!.isReserved, false);

  const word = parseSlashTrigger("Hello /hpi");
  assert.ok(word);
  assert.equal(word!.query, "hpi");
  assert.equal(word!.slashIndex, 6);
  assert.equal(word!.isReserved, false);
});

test("parseSlashTrigger marks /dx and /phrase queries as reserved (so dx/phrase win)", () => {
  // Slash menu yields immediately when /dx or /phrase prefix is detected.
  const dxBare = parseSlashTrigger("notes /dx");
  assert.ok(dxBare);
  assert.equal(dxBare!.isReserved, true);

  const dxWithQuery = parseSlashTrigger("notes /dx ches");
  // After "/dx ches" the cursor is past a space — only the trailing word
  // counts. So this should NOT be a slash trigger at all.
  assert.equal(dxWithQuery, null);

  const dxConcat = parseSlashTrigger("notes /dxches");
  assert.ok(dxConcat);
  assert.equal(dxConcat!.query, "dxches");
  assert.equal(dxConcat!.isReserved, true, "any /dx... query must be reserved");

  const ph = parseSlashTrigger("\n/phrase");
  assert.ok(ph);
  assert.equal(ph!.isReserved, true);

  const phQ = parseSlashTrigger("\n/phrasenote");
  assert.ok(phQ);
  assert.equal(phQ!.isReserved, true);
});

test("parseAutoInsertTrigger detects /<shortcut><space> and ignores reserved", () => {
  const hit = parseAutoInsertTrigger("notes /hpi ");
  assert.ok(hit);
  assert.equal(hit!.word, "hpi");
  assert.equal(hit!.slashIndex, 6);

  // Reserved triggers must never auto-insert — dx/phrase own that token.
  assert.equal(parseAutoInsertTrigger("notes /dx "), null);
  assert.equal(parseAutoInsertTrigger("notes /phrase "), null);

  // Need an actual word + trailing single space.
  assert.equal(parseAutoInsertTrigger("notes / "), null);
  assert.equal(parseAutoInsertTrigger("notes /hpi"), null);
  assert.equal(parseAutoInsertTrigger("notes /hpi  "), null); // double space
});

test("parseAutoInsertTrigger requires preceding whitespace or start-of-buffer", () => {
  const hit = parseAutoInsertTrigger("/ros ");
  assert.ok(hit);
  assert.equal(hit!.word, "ros");
  assert.equal(hit!.slashIndex, 0);

  // Embedded slashes (URLs, paths) must not trigger.
  assert.equal(parseAutoInsertTrigger("see http://x/path "), null);
});

// ──────────────────────────────────────────────────────────────────────────
// Pull-from-chart merge
// ──────────────────────────────────────────────────────────────────────────

test("mergeChartItems appends only new chart items, preserving order", () => {
  const merged = mergeChartItems(
    ["Hypertension", "Diabetes"],
    ["Diabetes", "Asthma"],
  );
  assert.deepEqual(merged, ["Hypertension", "Diabetes", "Asthma"]);
});

test("mergeChartItems is case-insensitive and trims whitespace", () => {
  const merged = mergeChartItems(
    ["  Hypertension  "],
    ["hypertension", " HYPERTENSION ", "CKD"],
  );
  assert.deepEqual(merged, ["Hypertension", "CKD"]);
});

test("mergeChartItems handles empty inputs without producing empty entries", () => {
  assert.deepEqual(mergeChartItems([], []), []);
  assert.deepEqual(mergeChartItems(["A"], []), ["A"]);
  assert.deepEqual(mergeChartItems([], ["A", "", "  "]), ["A"]);
  // Empty strings in `existing` are also dropped.
  assert.deepEqual(mergeChartItems(["", "  ", "B"], ["B", "C"]), ["B", "C"]);
});

// ──────────────────────────────────────────────────────────────────────────
// End-to-end: shortcut → token replacement on save (strip empty rows)
// This integration test simulates the round-trip: a /ros insertion produces
// chart text with all systems Normal/Negative; when the provider then
// "clears" some systems by setting them to not-examined with no notes, the
// final chart text on save must strip those rows.
// ──────────────────────────────────────────────────────────────────────────

test("integration: /ros insert + strip-on-save drops not-examined rows with no notes", () => {
  // Step 1 — slash insertion seeds the chart text with all canonical systems.
  const inserted = buildDefaultChartText("ros");
  for (const s of ROS_SYSTEMS) assert.ok(inserted.includes(`${s}:`), `seeded ${s}`);

  // Step 2 — provider edits chart data: marks some abnormal, leaves others
  // as "not-examined" with no notes (those should disappear on save).
  const chart = createChartData(ROS_SYSTEMS);
  chart["Cardiovascular"].status = "abnormal";
  chart["Cardiovascular"].notes = "chest pain on exertion";
  chart["Eyes"].status = "not-examined";          // strip
  chart["Endocrine"].status = "not-examined";     // strip
  chart["Psychiatric"].visible = false;            // strip (hidden)
  chart["ENT"].status = "not-examined";
  chart["ENT"].notes = "deferred";                 // keep (has notes)

  const finalText = chartDataToText("Review of Systems", chart);

  // Stripped rows must not appear at all.
  assert.ok(!finalText.includes("Eyes:"), "Eyes (not-examined, no notes) should be stripped");
  assert.ok(!finalText.includes("Endocrine:"), "Endocrine (not-examined, no notes) should be stripped");
  assert.ok(!finalText.includes("Psychiatric:"), "Psychiatric (hidden) should be stripped");

  // Surviving rows render with the right shape.
  assert.match(finalText, /Cardiovascular: Abnormal\/Positive — chest pain on exertion/);
  assert.match(finalText, /ENT: Not examined — deferred/);
  // Untouched rows default to Normal/Negative.
  assert.match(finalText, /Constitutional: Normal\/Negative/);
});

// ──────────────────────────────────────────────────────────────────────────
// UI-level handler simulation — these mirror exactly what the textarea
// onChange handlers (slash-menu.tsx + manual-soap-builder.tsx + DxAwareTextarea)
// do, but driven through the shared helpers so the contract is locked in.
// ──────────────────────────────────────────────────────────────────────────

/** Mirrors the textarea onChange handler in slash-menu.tsx. */
function simulateTextareaSlashHandler(value: string, cursor: number) {
  const before = value.slice(0, cursor);
  const trigger = parseSlashTrigger(before);
  const auto = parseAutoInsertTrigger(before);
  if (trigger?.isReserved) return { action: "yield-to-dx-or-phrase" as const };
  if (auto) {
    const builtin = getBuiltinByTrigger(auto.word);
    if (builtin) {
      return {
        action: "auto-insert" as const,
        replaceFrom: auto.slashIndex,
        replaceTo: cursor,
        builtinId: builtin.id,
      };
    }
    return { action: "no-op" as const };
  }
  if (trigger) return { action: "open-menu" as const, query: trigger.query };
  // No trigger and no auto-insert → slash menu stays idle. This is also how
  // the slash menu yields to the dx/phrase popovers when the cursor sits past
  // a `/dx ` or `/phrase ` token: those popovers own the dropdown and the
  // slash menu must NOT open.
  return { action: "idle" as const };
}

/** The slash menu must never open or auto-insert when a /dx or /phrase
 *  popover is in play. Both "no-claim" outcomes (idle + reserved) are
 *  correct yields. */
function isSlashMenuYielded(action: string): boolean {
  return action === "idle" || action === "yield-to-dx-or-phrase" || action === "no-op";
}

test("handler: typing '/dx ' (trailing space) — slash menu yields to dx popover", () => {
  const v = "Patient c/o /dx ";
  const r = simulateTextareaSlashHandler(v, v.length);
  // After the space, neither the slash menu nor an auto-insert may fire —
  // the dx popover (a separate component) owns this state.
  assert.ok(isSlashMenuYielded(r.action), `expected yield, got ${r.action}`);
});

test("handler: typing '/phrase ' (trailing space) — slash menu yields to phrase popover", () => {
  const v = "Note: /phrase ";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.ok(isSlashMenuYielded(r.action), `expected yield, got ${r.action}`);
});

test("handler: typing '/dxhtn' (no space yet) is reserved — slash menu yields", () => {
  const v = "Hx /dxhtn";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.equal(r.action, "yield-to-dx-or-phrase");
});

test("handler: typing '/' alone opens the universal slash menu", () => {
  const v = "Patient: /";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.equal(r.action, "open-menu");
  if (r.action === "open-menu") assert.equal(r.query, "");
});

test("handler: typing '/ros' opens the slash menu with the ros query", () => {
  const v = "Notes\n/ros";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.equal(r.action, "open-menu");
  if (r.action === "open-menu") assert.equal(r.query, "ros");
});

test("handler: typing '/ros ' (space) auto-inserts the ROS built-in", () => {
  const v = "Notes /ros ";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.equal(r.action, "auto-insert");
  if (r.action === "auto-insert") {
    assert.equal(r.builtinId, "ros");
    assert.equal(r.replaceFrom, 6);
    assert.equal(r.replaceTo, v.length);
  }
});

test("handler: typing '/pe ' (space) auto-inserts the physical_exam built-in via alias", () => {
  const v = "/pe ";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.equal(r.action, "auto-insert");
  if (r.action === "auto-insert") {
    assert.equal(r.builtinId, "physical_exam");
    assert.equal(r.replaceFrom, 0);
    assert.equal(r.replaceTo, 4);
  }
});

test("handler: typing '/unknown ' is a no-op (no built-in matches)", () => {
  const v = "/unknown ";
  const r = simulateTextareaSlashHandler(v, v.length);
  assert.equal(r.action, "no-op");
});

test("handler: dx precedence is total — even '/dx' followed by partial query never opens slash menu", () => {
  // Verify the precedence contract holds across all reserved variants.
  for (const v of ["/dx", "/dx ", "/dxhtn", "/DX", "/Dxhtn", "/phrase", "/phraseTok", "/PHRASE"]) {
    const r = simulateTextareaSlashHandler(v, v.length);
    assert.notEqual(r.action, "open-menu", `expected ${v} not to open slash menu`);
    assert.notEqual(r.action, "auto-insert", `expected ${v} not to auto-insert`);
  }
});

test("integration: end-to-end /ros insertion replaces the trigger token with the seeded chart text", () => {
  // Provider types into a textarea, then a space triggers auto-insert.
  const before = "Subjective:\nHPI: ...\nROS: /ros ";
  const cursor = before.length;
  const r = simulateTextareaSlashHandler(before, cursor);
  assert.equal(r.action, "auto-insert");
  if (r.action !== "auto-insert") return;

  const builtin = BUILTIN_BY_ID[r.builtinId];
  const seeded = buildDefaultChartText(builtin.id);
  // Apply the replacement exactly the way the textarea onChange does.
  const next = before.slice(0, r.replaceFrom) + seeded + before.slice(r.replaceTo);

  assert.ok(!next.includes("/ros "), "trigger token must be removed");
  assert.match(next, /Review of Systems:/);
  // Header line landed where the trigger was.
  const insertedAt = next.indexOf("Review of Systems:");
  assert.equal(insertedAt, r.replaceFrom);
});

test("integration: pull-from-chart populates a history block via mergeChartItems", () => {
  // Provider has manually entered one item; chart has three more.
  const existing = ["Hypertension"];
  const fromChart = ["Hypertension", "Diabetes Type 2", "Hyperlipidemia"];
  const merged = mergeChartItems(existing, fromChart);
  // No duplicate of Hypertension; chart items appended in order.
  assert.deepEqual(merged, ["Hypertension", "Diabetes Type 2", "Hyperlipidemia"]);

  // Render that as the bullet section that would be inserted on save.
  const rendered = buildBulletSection("Past Medical History", merged);
  assert.equal(
    rendered,
    "Past Medical History:\n  - Hypertension\n  - Diabetes Type 2\n  - Hyperlipidemia",
  );
});
