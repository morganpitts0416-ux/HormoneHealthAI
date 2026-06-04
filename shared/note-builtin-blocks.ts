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
  | "physical_exam"
  | "assessment_plan"
  | "care_plan"
  | "follow_up"
  | "vitals";

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
  category: "subjective" | "objective" | "assessment" | "plan";
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
  {
    id: "assessment_plan",
    label: "Assessment / Plan",
    shortLabel: "Assessment / Plan",
    triggers: ["ap", "assessment", "a/p"],
    category: "assessment",
    list: false,
    chart: false,
  },
  {
    id: "care_plan",
    label: "Care Plan",
    shortLabel: "Care Plan",
    triggers: ["careplan", "care"],
    category: "plan",
    list: false,
    chart: false,
  },
  {
    id: "follow_up",
    label: "Follow-Up",
    shortLabel: "Follow-Up",
    triggers: ["fu", "followup", "follow"],
    category: "plan",
    list: false,
    chart: false,
  },
  {
    id: "vitals",
    label: "Vital Signs",
    shortLabel: "Vital Signs",
    triggers: ["vitals", "vs", "vital"],
    category: "objective",
    list: false,
    chart: false,
  },
];

export interface VitalsData {
  systolicBp?: number | null;
  diastolicBp?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  temperature?: number | null;
  oxygenSaturation?: number | null;
  painScore?: number | null;
  heightInches?: number | null;
  weightLbs?: number | null;
  bmi?: number | null;
}

/** Format a vitals data object into a single-line clinical string for note embedding. */
export function buildVitalSignsText(v: VitalsData): string {
  const parts: string[] = [];
  if (v.systolicBp != null && v.diastolicBp != null) parts.push(`BP: ${v.systolicBp}/${v.diastolicBp} mmHg`);
  else if (v.systolicBp != null) parts.push(`BP: ${v.systolicBp}/— mmHg`);
  if (v.heartRate != null) parts.push(`HR: ${v.heartRate} bpm`);
  if (v.respiratoryRate != null) parts.push(`RR: ${v.respiratoryRate} rpm`);
  if (v.temperature != null) parts.push(`Temp: ${v.temperature}°F`);
  if (v.oxygenSaturation != null) parts.push(`SpO2: ${v.oxygenSaturation}%`);
  if (v.painScore != null) parts.push(`Pain: ${v.painScore}/10`);
  if (v.heightInches != null) parts.push(`Ht: ${v.heightInches} in`);
  if (v.weightLbs != null) parts.push(`Wt: ${v.weightLbs} lbs`);
  if (v.bmi != null) parts.push(`BMI: ${v.bmi}`);
  if (parts.length === 0) return "";
  return `Vital Signs: ${parts.join("  |  ")}`;
}

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

/** Per-clinician override of one ROS / PE system: a custom display name and
 *  an optional default-finding string used when the row is left at "normal"
 *  with no extra notes. */
export interface ClinicalSystemOverride {
  name: string;
  defaultFinding: string;
}

/** Bundle of per-clinician overrides resolved server-side. Either or both
 *  lists may be null/missing; missing means "use shipped defaults". */
export interface ClinicalBlockOverrides {
  rosSystems?: ClinicalSystemOverride[] | null;
  peSystems?: ClinicalSystemOverride[] | null;
}

/** Resolve the effective system list for a chart kind, honoring overrides. */
export function resolveSystemList(
  kind: "ros" | "physical_exam",
  overrides?: ClinicalBlockOverrides | null,
): string[] {
  const list = kind === "ros" ? overrides?.rosSystems : overrides?.peSystems;
  if (list && list.length > 0) {
    return list.map(s => s.name).filter(Boolean);
  }
  return kind === "ros" ? [...ROS_SYSTEMS] : [...PE_SYSTEMS];
}

/** Map of system-name → default normal-finding text for a chart kind. */
export function resolveDefaultFindings(
  kind: "ros" | "physical_exam",
  overrides?: ClinicalBlockOverrides | null,
): Record<string, string> {
  const list = kind === "ros" ? overrides?.rosSystems : overrides?.peSystems;
  if (!list || list.length === 0) return {};
  const out: Record<string, string> = {};
  for (const s of list) {
    if (s?.name && (s.defaultFinding ?? "").trim()) {
      out[s.name] = s.defaultFinding.trim();
    }
  }
  return out;
}

export type ChartRow = { status: string; notes: string; visible: boolean };
export type ChartData = Record<string, ChartRow>;

export function createChartData(systems: string[]): ChartData {
  const data: ChartData = {};
  systems.forEach(s => { data[s] = { status: "normal", notes: "", visible: true }; });
  return data;
}

/** Render chart-mode ROS / PE data. Hidden rows and "not examined" rows with
 *  no notes are stripped on save (no clinical signal). When `defaultFindings`
 *  has an entry for a system AND that row is at status="normal" with no
 *  user-typed notes, the default finding text replaces the canonical
 *  "Normal/Negative" label so the rendered note reads naturally
 *  (e.g. "Cardiovascular: RRR, no murmurs"). */
export function chartDataToText(
  label: string,
  chartData: ChartData,
  defaultFindings?: Record<string, string>,
): string {
  const lines: string[] = [`${label}:`];
  Object.entries(chartData).forEach(([system, data]) => {
    if (!data || data.visible === false) return;
    const notes = (data.notes ?? "").trim();
    if (data.status === "not-examined" && !notes) return;
    const customDefault = defaultFindings?.[system]?.trim();
    if (data.status === "normal" && !notes && customDefault) {
      lines.push(`  ${system}: ${customDefault}`);
      return;
    }
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
 *  a `systems` subset; otherwise the resolved (override or shipped) list is
 *  used. Per-system normal-finding overrides flow through `chartDataToText`. */
export function buildDefaultChartText(
  kind: "ros" | "physical_exam",
  systems?: string[],
  overrides?: ClinicalBlockOverrides | null,
): string {
  const resolved = resolveSystemList(kind, overrides);
  const list = systems && systems.length > 0 ? systems : resolved;
  const def = BUILTIN_BY_ID[kind];
  const findings = resolveDefaultFindings(kind, overrides);
  return chartDataToText(def.shortLabel, createChartData(list), findings);
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
  overrides?: ClinicalBlockOverrides | null,
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
        // ROS / PE → chart text, honoring template-chosen systems subset
        // and clinician overrides for default findings.
        out.push(buildDefaultChartText(def.id as "ros" | "physical_exam", tb.systems, overrides));
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

      // HPI, Assessment/Plan, Care Plan, Follow-Up: free-text blocks.
      // HPI supports an opt-in bullet mode; the others are always free text.
      if (!def.list && !def.chart) {
        if (def.id === "hpi" && tb.bulletMode) {
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

/** Canonical chart-section labels written into notes by the slash menu,
 *  templates, and the manual SOAP builder. The reverse-direction parser
 *  below uses these to find a section in a free-text note. */
export const CHART_SECTION_LABELS: Record<ChartDomainKey, string[]> = {
  medicalHistory:     ["Past Medical History", "Medical History", "PMH"],
  surgicalHistory:    ["Past Surgical History", "Surgical History", "PSH"],
  socialHistory:      ["Social History", "SH"],
  familyHistory:      ["Family History", "FH"],
  currentMedications: ["Current Medications", "Medications", "Meds"],
  allergies:          ["Allergies", "Allergy"],
};

/** Parse the bullet/paragraph items written under a labelled chart section.
 *
 *  Supports both renderings produced by `buildBulletSection`
 *  ("Label:\n  - a\n  - b") and `buildParagraphSection`
 *  ("Label: a, b, c."). Reads until a blank line, the next labelled section
 *  (a non-indented "Word:"), or end of text — whichever comes first.
 *
 *  Returns null when no matching section header is present so callers can
 *  distinguish "section missing" from "section explicitly empty". */
export function parseChartSectionItems(
  text: string,
  chartKey: ChartDomainKey,
): string[] | null {
  if (!text) return null;
  const labels = CHART_SECTION_LABELS[chartKey] ?? [];
  if (labels.length === 0) return null;
  const lines = text.split(/\r?\n/);

  // Build a single label-matching regex (case-insensitive, anchored at start
  // of line). Longer aliases come first so "Past Medical History" beats the
  // bare "Medical History" partial.
  const labelPattern = labels
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(l => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const headerRe = new RegExp(`^\\s*(?:${labelPattern})\\s*:\\s*(.*)$`, "i");
  // Sentinel for "the next labelled section" — any non-indented Title-cased
  // run of words ending in `:`. Used to stop reading bullets early.
  const nextSectionRe = /^[A-Z][A-Za-z /-]{0,60}:\s*$/;

  let headerIdx = -1;
  let inlineRest = "";
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRe);
    if (m) { headerIdx = i; inlineRest = (m[1] ?? "").trim(); break; }
  }
  if (headerIdx === -1) return null;

  const items: string[] = [];
  const pushItem = (raw: string) => {
    // Strip optional leading whitespace + bullet marker (`-`, `*`, `•`) and a
    // trailing period so paragraph and bullet renderings normalise the same.
    const cleaned = raw.replace(/^\s*[-*•]\s*/, "").trim().replace(/\.$/, "").trim();
    if (cleaned) items.push(cleaned);
  };

  // Inline content after "Label:" — a comma/semicolon list (paragraph mode)
  // or a single inline bullet. Split conservatively.
  if (inlineRest) {
    inlineRest
      .split(/[,;]+/)
      .forEach(pushItem);
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) {
      // Allow one blank line iff the next non-blank line is still bullets
      // belonging to this section; otherwise the section ends.
      let next = "";
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) { next = lines[j]; break; }
      }
      if (/^\s+[-*•]/.test(next)) continue;
      break;
    }
    if (/^\s+[-*•]/.test(ln)) { pushItem(ln); continue; }
    // Non-indented line that isn't a bullet — must be the next section or
    // free text outside our list. Stop here either way.
    if (nextSectionRe.test(ln) || /^\S/.test(ln)) break;
    pushItem(ln);
  }

  // De-dupe case-insensitively while preserving first-seen order so
  // round-tripping is stable.
  const seen = new Set<string>();
  return items.filter(it => {
    const k = it.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
