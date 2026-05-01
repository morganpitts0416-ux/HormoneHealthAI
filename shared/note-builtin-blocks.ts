/** Built-in clinical blocks shared by the template builder, manual SOAP
 *  builder, and universal slash menu. */

export type BuiltinBlockId =
  | "hpi"
  | "medical_history"
  | "surgical_history"
  | "family_history"
  | "social_history"
  | "current_medications"
  | "allergies"
  | "ros"
  | "physical_exam";

export type ChartDomainKey =
  | "medicalHistory"
  | "surgicalHistory"
  | "socialHistory"
  | "familyHistory"
  | "currentMedications"
  | "allergies";

export interface BuiltinBlockDef {
  id: BuiltinBlockId;
  label: string;          // human title used in pickers / template builder
  shortLabel: string;     // shorter title used in the inserted note section header
  triggers: string[];     // slash triggers (lowercase, no `/`)
  category: "subjective" | "objective";
  /**
   * Bullet-style history blocks render as a list of items rather than free
   * text. They also support pulling items from the patient chart.
   */
  list: boolean;
  /**
   * Chart-style blocks (ROS, Physical Exam) render as a system-by-system table
   * when in chart mode, with normal/abnormal/not-examined per row.
   */
  chart: boolean;
  /** Mapping to the patient chart key (only set for list blocks). */
  chartKey?: ChartDomainKey;
}

export const BUILTIN_BLOCKS: BuiltinBlockDef[] = [
  {
    id: "hpi",
    label: "HPI",
    shortLabel: "HPI",
    triggers: ["hpi"],
    category: "subjective",
    list: false,
    chart: false,
  },
  {
    id: "medical_history",
    label: "Medical History",
    shortLabel: "Past Medical History",
    triggers: ["mh", "pmh", "medhx"],
    category: "subjective",
    list: true,
    chart: false,
    chartKey: "medicalHistory",
  },
  {
    id: "surgical_history",
    label: "Surgical History",
    shortLabel: "Past Surgical History",
    triggers: ["sh", "psh", "surghx", "surgicalhx"],
    category: "subjective",
    list: true,
    chart: false,
    chartKey: "surgicalHistory",
  },
  {
    id: "social_history",
    label: "Social History",
    shortLabel: "Social History",
    triggers: ["sochx", "socialhx", "soc"],
    category: "subjective",
    list: true,
    chart: false,
    chartKey: "socialHistory",
  },
  {
    id: "family_history",
    label: "Family History",
    shortLabel: "Family History",
    triggers: ["fh", "fhx", "famhx"],
    category: "subjective",
    list: true,
    chart: false,
    chartKey: "familyHistory",
  },
  {
    id: "current_medications",
    label: "Current Medications",
    shortLabel: "Current Medications",
    triggers: ["meds", "medications"],
    category: "subjective",
    list: true,
    chart: false,
    chartKey: "currentMedications",
  },
  {
    id: "allergies",
    label: "Allergies",
    shortLabel: "Allergies",
    triggers: ["allergies", "allergy", "rxn"],
    category: "subjective",
    list: true,
    chart: false,
    chartKey: "allergies",
  },
  {
    id: "ros",
    label: "Review of Systems",
    shortLabel: "Review of Systems",
    triggers: ["ros"],
    category: "objective",
    list: false,
    chart: true,
  },
  {
    id: "physical_exam",
    label: "Physical Examination",
    shortLabel: "Physical Examination",
    triggers: ["pe", "exam", "physical"],
    category: "objective",
    list: false,
    chart: true,
  },
];

export const BUILTIN_BY_ID: Record<BuiltinBlockId, BuiltinBlockDef> =
  BUILTIN_BLOCKS.reduce((acc, b) => { acc[b.id] = b; return acc; }, {} as Record<BuiltinBlockId, BuiltinBlockDef>);

export function getBuiltinByTrigger(trigger: string): BuiltinBlockDef | undefined {
  const t = trigger.toLowerCase();
  return BUILTIN_BLOCKS.find(b => b.triggers.includes(t));
}

export const ROS_SYSTEMS = [
  "Constitutional", "Eyes", "ENT", "Cardiovascular", "Respiratory",
  "Gastrointestinal", "Genitourinary", "Musculoskeletal", "Integumentary",
  "Neurological", "Psychiatric", "Endocrine", "Hematologic/Lymphatic",
  "Allergic/Immunologic",
];

export const PE_SYSTEMS = [
  "General Appearance", "Head", "Eyes", "ENT", "Neck", "Cardiovascular",
  "Respiratory", "Abdomen", "Musculoskeletal", "Neurological", "Skin",
  "Psychiatric", "Lymphatic",
];

export type ChartRow = { status: string; notes: string; visible: boolean };
export type ChartData = Record<string, ChartRow>;

export function createChartData(systems: string[]): ChartData {
  const data: ChartData = {};
  systems.forEach(s => { data[s] = { status: "normal", notes: "", visible: true }; });
  return data;
}

/** Render chart-mode ROS / PE data. Hidden rows and "not examined" rows with
 *  no notes are stripped on save (no clinical signal). */
export function chartDataToText(label: string, chartData: ChartData): string {
  const lines: string[] = [`${label}:`];
  Object.entries(chartData).forEach(([system, data]) => {
    if (!data || data.visible === false) return;
    const notes = (data.notes ?? "").trim();
    if (data.status === "not-examined" && !notes) return;
    const statusLabel =
      data.status === "normal"   ? "Normal/Negative" :
      data.status === "abnormal" ? "Abnormal/Positive" :
                                   "Not examined";
    const notePart = notes ? ` — ${notes}` : "";
    lines.push(`  ${system}: ${statusLabel}${notePart}`);
  });
  return lines.join("\n");
}

/** Pre-filled chart text for a `/ros` or `/pe` insertion. Templates may pass
 *  a `systems` subset; otherwise the full canonical list is used. */
export function buildDefaultChartText(kind: "ros" | "physical_exam", systems?: string[]): string {
  const fallback = kind === "ros" ? ROS_SYSTEMS : PE_SYSTEMS;
  const list = systems && systems.length > 0 ? systems : fallback;
  const def = BUILTIN_BY_ID[kind];
  return chartDataToText(def.shortLabel, createChartData(list));
}

/** Labelled bullet list for a history block. */
export function buildBulletSection(label: string, items: string[]): string {
  const filtered = items.map(s => s.trim()).filter(Boolean);
  if (filtered.length === 0) return `${label}:\n  - `;
  return `${label}:\n${filtered.map(i => `  - ${i}`).join("\n")}`;
}

/** Paragraph rendering of a history block (free-text mode):
 *  "Label: a, b, c." */
export function buildParagraphSection(label: string, items: string[]): string {
  const filtered = items.map(s => s.trim()).filter(Boolean);
  if (filtered.length === 0) return `${label}:`;
  const joined = filtered.join(", ");
  const ends = /[.!?]$/.test(joined) ? "" : ".";
  return `${label}: ${joined}${ends}`;
}

// Template-block rendering used by the slash menu when a provider invokes a
// saved template via /<template-shortcut>. Honors clinical_* metadata: ROS/PE
// chart text + system subsets, history bullets vs paragraph, HPI narrative
// vs bullets, section_header. Falls back to `Label: value` for legacy blocks.

export interface TemplateBlockRender {
  type: string;
  label?: string;
  defaultValue?: string;
  builtinId?: BuiltinBlockId;
  bulletMode?: boolean;
  systems?: string[];
}

export interface TemplateRenderChart {
  medicalHistory?: string[];
  surgicalHistory?: string[];
  socialHistory?: string[];
  familyHistory?: string[];
  currentMedications?: string[];
  allergies?: string[];
}

export function renderTemplateBlocks(
  blocks: TemplateBlockRender[],
  chart?: TemplateRenderChart | null,
): string {
  const out: string[] = [];
  for (const tb of blocks) {
    const label = (tb.label ?? "").trim();
    const value = (tb.defaultValue ?? "").trim();

    if (tb.type === "section_header") {
      if (label) out.push("", label.toUpperCase(), "");
      continue;
    }

    if (tb.type.startsWith("clinical_") && tb.builtinId) {
      const def = BUILTIN_BY_ID[tb.builtinId];
      if (!def) continue;

      if (def.chart) {
        // ROS / PE → chart text, honoring template-chosen systems subset.
        out.push(buildDefaultChartText(def.id as "ros" | "physical_exam", tb.systems));
        continue;
      }

      if (def.list) {
        // History list → prefer chart data when available, else split the
        // template's defaultValue lines into items.
        const fromChart =
          chart && def.chartKey ? (chart[def.chartKey] ?? []) : [];
        const fromValue = value
          ? value.split(/\r?\n/).map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean)
          : [];
        const items = mergeChartItems(fromValue, fromChart);
        out.push(
          tb.bulletMode === false
            ? buildParagraphSection(def.shortLabel, items)
            : buildBulletSection(def.shortLabel, items),
        );
        continue;
      }

      // HPI: narrative by default, opt-in to bullets via bulletMode.
      if (def.id === "hpi") {
        if (tb.bulletMode) {
          const items = value
            ? value.split(/\r?\n/).map(s => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean)
            : [];
          out.push(buildBulletSection(def.shortLabel, items));
        } else if (value) {
          out.push(`${def.shortLabel}: ${value}`);
        } else {
          out.push(`${def.shortLabel}:`);
        }
        continue;
      }
    }

    // Plain label/value fallback (legacy non-clinical blocks).
    if (label) out.push(`${label}:${value ? " " + value : ""}`);
    else if (value) out.push(value);
  }
  return out.join("\n").trim() + "\n";
}

// Slash trigger parsing. `dx` and `phrase` are reserved for their dedicated
// dropdowns; the slash menu yields when the typed word starts with either.

export const RESERVED_SLASH_PREFIXES = ["dx", "phrase"] as const;

export function isReservedSlashWord(word: string): boolean {
  const w = word.toLowerCase();
  return RESERVED_SLASH_PREFIXES.some(prefix => w.startsWith(prefix));
}

export interface SlashTrigger {
  /** Index of the `/` character in the source text. */
  slashIndex: number;
  /** The word typed after `/` (lowercased, possibly empty). */
  query: string;
  /** True iff the word starts with a reserved prefix (`dx`, `phrase`). */
  isReserved: boolean;
}

/** Parse the `/...` token at the end of `textBefore`, or null if absent.
 *  The slash must start the buffer or follow whitespace/an open bracket. */
export function parseSlashTrigger(textBefore: string): SlashTrigger | null {
  const match = textBefore.match(/(^|[\s(\[\{])\/([a-z][a-z0-9_-]*)?$/i);
  if (!match) return null;
  const query = (match[2] ?? "").toLowerCase();
  const slashIndex = textBefore.length - (match[2]?.length ?? 0) - 1;
  return { slashIndex, query, isReserved: isReservedSlashWord(query) };
}

/** Detect the "/<word> " trailing-space pattern used by the auto-insert
 *  path. Returns null if the word is missing or reserved. */
export function parseAutoInsertTrigger(
  textBefore: string,
): { slashIndex: number; word: string } | null {
  const match = textBefore.match(/(?:^|[\s(\[\{])\/([a-z][a-z0-9_-]+)( )$/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  if (isReservedSlashWord(word)) return null;
  // index of `/` = end - word length - 2 (one for `/`, one for trailing space)
  const slashIndex = textBefore.length - word.length - 2;
  return { slashIndex, word };
}

/** Merge chart items into an existing list, preserving order and
 *  de-duplicating case-insensitively (so "Pull from chart" is idempotent). */
export function mergeChartItems(existing: string[], chartItems: string[]): string[] {
  const cleanedExisting = existing.map(s => s.trim()).filter(Boolean);
  const seen = new Set(cleanedExisting.map(s => s.toLowerCase()));
  const merged = [...cleanedExisting];
  for (const item of chartItems) {
    const t = item.trim();
    if (t && !seen.has(t.toLowerCase())) {
      merged.push(t);
      seen.add(t.toLowerCase());
    }
  }
  return merged;
}
