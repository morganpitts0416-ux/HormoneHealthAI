// Reusable patient-therapy context layer.
//
// Goal: before any lab-driven recommendation engine (default supplements,
// clinician custom supplements, AI clinical recommendations, AI patient
// summary, AI SOAP note, Ask ClinIQ chat) tells a clinician to "initiate"
// or "start" a therapy, we look at what the patient is already on and, if
// the indicated class is already on board, rewrite the recommendation as
// adherence assessment + dose optimization instead of a duplicate
// initiation.
//
// IMPORTANT: This module does NOT change clinical thresholds, optimized
// ranges, red flag rules, or any algorithm output. It only post-processes
// recommendation TEXT and supplement RECORDS to add an "already on
// therapy" flag/note.
//
// Design rules:
//   1. One taxonomy of therapy classes — used for both patient-side
//      matching (what's in the chart) and recommendation-side matching
//      (what is being suggested). No class lives in two places.
//   2. Pattern matching is regex-based, case-insensitive, with word
//      boundaries. Prefer specific brand/INN tokens over loose prefixes
//      so "vitamin K" does not match "vitamin K2 (MK-7)" by accident.
//   3. Annotation never deletes information — it adds a flag and an
//      adherence note alongside the original.

import type { SupplementRecommendation } from "@shared/schema";

// ────────────────────────────────────────────────────────────────────────────
// Therapy taxonomy
// ────────────────────────────────────────────────────────────────────────────

export interface TherapyClass {
  id: string;
  label: string;
  /**
   * Patterns that identify this class. Used both to detect a patient's
   * current chart entries and to detect recommendation text suggesting
   * the same therapy. Patterns are case-insensitive.
   */
  patterns: RegExp[];
}

// Helper to keep the taxonomy compact and case-insensitive by default.
const r = (s: string): RegExp => new RegExp(s, "i");

export const THERAPY_CLASSES: TherapyClass[] = [
  // ── Vitamins / minerals / nutrients ───────────────────────────────────
  {
    id: "vitamin_d",
    label: "Vitamin D",
    patterns: [
      r("\\bvitamin\\s*d3?\\b"),
      r("\\bvit\\s*d3?\\b"),
      r("\\bcholecalciferol\\b"),
      r("\\bergocalciferol\\b"),
      r("\\bd3\\s*(?:\\d+\\s*(?:iu|mcg|µg))"),
      r("\\bd3\\b\\s*[\\d,]"),
      r("\\b25[-\\s]?oh\\s*d3?\\b"),
    ],
  },
  {
    id: "vitamin_k",
    label: "Vitamin K",
    patterns: [
      r("\\bvitamin\\s*k(?:1|2)?\\b"),
      r("\\bvit\\s*k(?:1|2)?\\b"),
      r("\\bmenaquinone\\b"),
      r("\\bphytonadione\\b"),
      r("\\bmk-?7\\b"),
    ],
  },
  {
    id: "vitamin_b12",
    label: "Vitamin B12",
    patterns: [
      r("\\bb-?12\\b"),
      r("\\bvitamin\\s*b\\s*12\\b"),
      r("\\bcyanocobalamin\\b"),
      r("\\bmethylcobalamin\\b"),
      r("\\bhydroxocobalamin\\b"),
    ],
  },
  {
    id: "folate",
    label: "Folate",
    patterns: [
      r("\\bfolate\\b"),
      r("\\bfolic\\s*acid\\b"),
      r("\\bmethylfolate\\b"),
      r("\\bl-?methylfolate\\b"),
      r("\\b5-?mthf\\b"),
    ],
  },
  {
    id: "iron",
    label: "Iron",
    patterns: [
      r("\\biron\\s+(?:supplement|sulfate|gluconate|bisglycinate|fumarate|polysaccharide|glycinate)?\\b"),
      r("\\bferrous\\s+(?:sulfate|gluconate|fumarate|bisglycinate)\\b"),
      r("\\bferric\\s+(?:carboxymaltose|maltol|citrate)\\b"),
      r("\\bferrochel\\b"),
      r("\\biron\\s*\\d+\\s*mg\\b"),
    ],
  },
  {
    id: "magnesium",
    label: "Magnesium",
    patterns: [
      r("\\bmagnesium\\b"),
      r("\\bmag\\s+(?:glycinate|citrate|threonate|oxide|malate)\\b"),
    ],
  },
  {
    id: "zinc",
    label: "Zinc",
    patterns: [r("\\bzinc\\b"), r("\\bzn\\s*\\d+\\s*mg\\b")],
  },
  {
    id: "selenium",
    label: "Selenium",
    patterns: [r("\\bselenium\\b"), r("\\bse-?methylselenocysteine\\b")],
  },
  {
    id: "omega3",
    label: "Omega-3 / Fish Oil",
    patterns: [
      r("\\bomega-?3\\b"),
      r("\\bfish\\s*oil\\b"),
      r("\\bepa(?:[\\s/-]+dha)?\\b"),
      r("\\bdha\\s*\\d+\\b"),
      r("\\bomegagenics\\b"),
    ],
  },
  {
    id: "icosapent_ethyl",
    label: "Icosapent Ethyl (Vascepa)",
    patterns: [r("\\bicosapent\\s*ethyl\\b"), r("\\bvascepa\\b")],
  },
  {
    id: "coq10",
    label: "CoQ10",
    patterns: [r("\\bcoq-?10\\b"), r("\\bcoenzyme\\s*q10\\b"), r("\\bubiquinol\\b"), r("\\bubiquinone\\b")],
  },
  {
    id: "berberine",
    label: "Berberine",
    patterns: [r("\\bberberine\\b"), r("\\bmetabolicsynergy\\b")],
  },
  {
    id: "inositol",
    label: "Inositol",
    patterns: [r("\\binositol\\b"), r("\\bmyo-?inositol\\b"), r("\\bd-?chiro-?inositol\\b")],
  },
  {
    id: "nac",
    label: "N-Acetylcysteine",
    patterns: [r("\\bn-?acetyl\\s*cysteine\\b"), r("\\bnac\\b")],
  },

  // ── Lipid-lowering medications ────────────────────────────────────────
  {
    id: "statin",
    label: "Statin",
    patterns: [
      r("\\bstatin\\b"),
      r("\\batorvastatin\\b"),
      r("\\bsimvastatin\\b"),
      r("\\brosuvastatin\\b"),
      r("\\bpravastatin\\b"),
      r("\\blovastatin\\b"),
      r("\\bpitavastatin\\b"),
      r("\\bfluvastatin\\b"),
      r("\\blipitor\\b"),
      r("\\bcrestor\\b"),
      r("\\bzocor\\b"),
      r("\\blivalo\\b"),
    ],
  },
  {
    id: "ezetimibe",
    label: "Ezetimibe",
    patterns: [r("\\bezetimibe\\b"), r("\\bzetia\\b")],
  },
  {
    id: "pcsk9",
    label: "PCSK9 inhibitor",
    patterns: [
      r("\\bpcsk9\\b"),
      r("\\balirocumab\\b"),
      r("\\bevolocumab\\b"),
      r("\\brepatha\\b"),
      r("\\bpraluent\\b"),
      r("\\binclisiran\\b"),
      r("\\bleqvio\\b"),
    ],
  },
  {
    id: "fibrate",
    label: "Fibrate",
    patterns: [r("\\bfibrate\\b"), r("\\bfenofibrate\\b"), r("\\bgemfibrozil\\b"), r("\\btricor\\b"), r("\\blopid\\b")],
  },
  {
    id: "bempedoic_acid",
    label: "Bempedoic Acid",
    patterns: [r("\\bbempedoic\\s*acid\\b"), r("\\bnexletol\\b")],
  },
  {
    id: "niacin",
    label: "Niacin",
    patterns: [r("\\bniacin\\b"), r("\\bnicotinic\\s*acid\\b"), r("\\bniaspan\\b")],
  },

  // ── Glycemic medications ──────────────────────────────────────────────
  {
    id: "metformin",
    label: "Metformin",
    patterns: [r("\\bmetformin\\b"), r("\\bglucophage\\b"), r("\\bfortamet\\b"), r("\\briomet\\b")],
  },
  {
    id: "glp1",
    label: "GLP-1 agonist",
    patterns: [
      r("\\bglp-?1\\b"),
      r("\\bsemaglutide\\b"),
      r("\\bliraglutide\\b"),
      r("\\btirzepatide\\b"),
      r("\\bdulaglutide\\b"),
      r("\\bexenatide\\b"),
      r("\\bozempic\\b"),
      r("\\bwegovy\\b"),
      r("\\brybelsus\\b"),
      r("\\bmounjaro\\b"),
      r("\\bzepbound\\b"),
      r("\\bvictoza\\b"),
      r("\\bsaxenda\\b"),
      r("\\btrulicity\\b"),
    ],
  },
  {
    id: "sglt2",
    label: "SGLT2 inhibitor",
    patterns: [
      r("\\bsglt-?2\\b"),
      r("\\bempagliflozin\\b"),
      r("\\bdapagliflozin\\b"),
      r("\\bcanagliflozin\\b"),
      r("\\bertugliflozin\\b"),
      r("\\bjardiance\\b"),
      r("\\bfarxiga\\b"),
      r("\\binvokana\\b"),
      r("\\bsteglatro\\b"),
    ],
  },
  {
    id: "dpp4",
    label: "DPP-4 inhibitor",
    patterns: [
      r("\\bdpp-?4\\b"),
      r("\\bsitagliptin\\b"),
      r("\\blinagliptin\\b"),
      r("\\bsaxagliptin\\b"),
      r("\\bjanuvia\\b"),
      r("\\btradjenta\\b"),
      r("\\bonglyza\\b"),
    ],
  },
  {
    id: "sulfonylurea",
    label: "Sulfonylurea",
    patterns: [
      r("\\bsulfonylurea\\b"),
      r("\\bglipizide\\b"),
      r("\\bglyburide\\b"),
      r("\\bglimepiride\\b"),
      r("\\bglucotrol\\b"),
      r("\\bamaryl\\b"),
    ],
  },
  {
    id: "insulin",
    label: "Insulin",
    patterns: [
      r("\\binsulin\\b"),
      r("\\blantus\\b"),
      r("\\blevemir\\b"),
      r("\\btresiba\\b"),
      r("\\bhumalog\\b"),
      r("\\bnovolog\\b"),
      r("\\btoujeo\\b"),
      r("\\bbasaglar\\b"),
    ],
  },

  // ── Antihypertensives ─────────────────────────────────────────────────
  {
    id: "ace_inhibitor",
    label: "ACE inhibitor",
    patterns: [
      r("\\bace\\s+inhibitor\\b"),
      r("\\blisinopril\\b"),
      r("\\benalapril\\b"),
      r("\\bbenazepril\\b"),
      r("\\bramipril\\b"),
      r("\\bquinapril\\b"),
      r("\\bcaptopril\\b"),
      r("\\bperindopril\\b"),
      r("\\btrandolapril\\b"),
      r("\\bzestril\\b"),
      r("\\bprinivil\\b"),
      r("\\bvasotec\\b"),
      r("\\baltace\\b"),
    ],
  },
  {
    id: "arb",
    label: "ARB",
    patterns: [
      r("\\barb\\b"),
      r("\\blosartan\\b"),
      r("\\bvalsartan\\b"),
      r("\\bolmesartan\\b"),
      r("\\btelmisartan\\b"),
      r("\\bcandesartan\\b"),
      r("\\birbesartan\\b"),
      r("\\bazilsartan\\b"),
      r("\\bcozaar\\b"),
      r("\\bdiovan\\b"),
      r("\\bbenicar\\b"),
      r("\\bmicardis\\b"),
    ],
  },
  {
    id: "beta_blocker",
    label: "Beta blocker",
    patterns: [
      r("\\bbeta[-\\s]?blocker\\b"),
      r("\\bmetoprolol\\b"),
      r("\\batenolol\\b"),
      r("\\bpropranolol\\b"),
      r("\\bcarvedilol\\b"),
      r("\\bnebivolol\\b"),
      r("\\blabetalol\\b"),
      r("\\bbisoprolol\\b"),
      r("\\btoprol\\b"),
      r("\\btenormin\\b"),
      r("\\binderal\\b"),
      r("\\bcoreg\\b"),
      r("\\bbystolic\\b"),
    ],
  },
  {
    id: "ccb",
    label: "Calcium channel blocker",
    patterns: [
      r("\\bcalcium\\s+channel\\s+blocker\\b"),
      r("\\bamlodipine\\b"),
      r("\\bnifedipine\\b"),
      r("\\bdiltiazem\\b"),
      r("\\bverapamil\\b"),
      r("\\bnorvasc\\b"),
      r("\\bcardizem\\b"),
      r("\\bprocardia\\b"),
    ],
  },
  {
    id: "thiazide",
    label: "Thiazide diuretic",
    patterns: [
      r("\\bthiazide\\b"),
      r("\\bhydrochlorothiazide\\b"),
      r("\\bhctz\\b"),
      r("\\bchlorthalidone\\b"),
      r("\\bindapamide\\b"),
    ],
  },
  {
    id: "spironolactone",
    label: "Spironolactone",
    patterns: [r("\\bspironolactone\\b"), r("\\baldactone\\b")],
  },

  // ── Psychotropics ─────────────────────────────────────────────────────
  {
    id: "ssri",
    label: "SSRI",
    patterns: [
      r("\\bssri\\b"),
      r("\\bsertraline\\b"),
      r("\\bfluoxetine\\b"),
      r("\\bescitalopram\\b"),
      r("\\bcitalopram\\b"),
      r("\\bparoxetine\\b"),
      r("\\bzoloft\\b"),
      r("\\blexapro\\b"),
      r("\\bprozac\\b"),
      r("\\bcelexa\\b"),
      r("\\bpaxil\\b"),
    ],
  },
  {
    id: "snri",
    label: "SNRI",
    patterns: [
      r("\\bsnri\\b"),
      r("\\bvenlafaxine\\b"),
      r("\\bduloxetine\\b"),
      r("\\bdesvenlafaxine\\b"),
      r("\\beffexor\\b"),
      r("\\bcymbalta\\b"),
      r("\\bpristiq\\b"),
    ],
  },

  // ── Hormone-related ──────────────────────────────────────────────────
  {
    id: "thyroid_hormone",
    label: "Thyroid hormone",
    patterns: [
      r("\\blevothyroxine\\b"),
      r("\\bliothyronine\\b"),
      r("\\bsynthroid\\b"),
      r("\\btirosint\\b"),
      r("\\beuthyrox\\b"),
      r("\\blevoxyl\\b"),
      r("\\bcytomel\\b"),
      r("\\barmour\\s*thyroid\\b"),
      r("\\bnp\\s*thyroid\\b"),
      r("\\bnature[-\\s]?throid\\b"),
      r("\\bdesiccated\\s+thyroid\\b"),
    ],
  },
  {
    id: "testosterone",
    label: "Testosterone therapy",
    patterns: [
      r("\\btestosterone\\b"),
      r("\\btrt\\b"),
      r("\\bcypionate\\b"),
      r("\\benanthate\\b"),
      r("\\btestopel\\b"),
      r("\\bandrogel\\b"),
      r("\\btestim\\b"),
      r("\\baveed\\b"),
      r("\\baxiron\\b"),
      r("\\bnatesto\\b"),
      r("\\bxyosted\\b"),
    ],
  },
  {
    id: "estradiol",
    label: "Estrogen therapy",
    patterns: [
      r("\\bestradiol\\b"),
      r("\\bestrogen\\b"),
      r("\\bpremarin\\b"),
      r("\\bclimara\\b"),
      r("\\bvivelle\\b"),
      r("\\bestrace\\b"),
      r("\\bestring\\b"),
    ],
  },
  {
    id: "progesterone",
    label: "Progesterone",
    patterns: [
      r("\\bprogesterone\\b"),
      r("\\bprometrium\\b"),
      r("\\bmedroxyprogesterone\\b"),
      r("\\bprovera\\b"),
      r("\\bcrinone\\b"),
    ],
  },
  {
    id: "dhea",
    label: "DHEA",
    patterns: [r("\\bdhea\\b"), r("\\bdehydroepiandrosterone\\b")],
  },
  {
    id: "anastrozole",
    label: "Aromatase inhibitor",
    patterns: [
      r("\\baromatase\\s+inhibitor\\b"),
      r("\\banastrozole\\b"),
      r("\\barimidex\\b"),
      r("\\bletrozole\\b"),
      r("\\bfemara\\b"),
      r("\\bexemestane\\b"),
      r("\\baromasin\\b"),
    ],
  },
  {
    id: "clomiphene",
    label: "Clomiphene / Enclomiphene",
    patterns: [r("\\bclomiphene\\b"), r("\\benclomiphene\\b"), r("\\bclomid\\b")],
  },
  {
    id: "5ar_inhibitor",
    label: "5-Alpha reductase inhibitor",
    patterns: [
      r("\\bfinasteride\\b"),
      r("\\bdutasteride\\b"),
      r("\\bproscar\\b"),
      r("\\bpropecia\\b"),
      r("\\bavodart\\b"),
    ],
  },
];

// O(1) class-id lookup by id.
const CLASS_BY_ID: Map<string, TherapyClass> = new Map(
  THERAPY_CLASSES.map((c) => [c.id, c]),
);

// ────────────────────────────────────────────────────────────────────────────
// Patient-side context
// ────────────────────────────────────────────────────────────────────────────

export interface MatchedClass {
  id: string;
  label: string;
  /** The exact chart strings that triggered this class (e.g. "Vitamin D3 2000 IU daily"). */
  items: string[];
}

export interface TherapyContext {
  /** Map of classId → matched chart items. */
  classes: Map<string, MatchedClass>;
  /** Original chart entries fed into the inference (for display). */
  rawItems: string[];
}

/** Coerce mixed string/object chart entries into a flat string array. */
function normalizeChartItems(items: unknown[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (!it) continue;
    if (typeof it === "string") {
      const t = it.trim();
      if (t) out.push(t);
    } else if (typeof it === "object") {
      const o = it as any;
      const s =
        o.name || o.label || o.medication || o.text || o.value ||
        (o.drugName ? o.drugName : null);
      if (s && typeof s === "string" && s.trim()) out.push(s.trim());
    }
  }
  return out;
}

/**
 * Build a TherapyContext from a chart's currentMedications (and optionally
 * any stored supplement-list strings). Pass anything string-shaped — the
 * normalizer is permissive.
 */
export function inferPatientTherapies(items: unknown[]): TherapyContext {
  const rawItems = normalizeChartItems(items);
  const classes = new Map<string, MatchedClass>();

  for (const item of rawItems) {
    for (const klass of THERAPY_CLASSES) {
      if (klass.patterns.some((p) => p.test(item))) {
        const existing = classes.get(klass.id);
        if (existing) {
          if (!existing.items.includes(item)) existing.items.push(item);
        } else {
          classes.set(klass.id, { id: klass.id, label: klass.label, items: [item] });
        }
      }
    }
  }

  return { classes, rawItems };
}

export function isPatientOnClass(ctx: TherapyContext | undefined | null, classId: string): boolean {
  return !!ctx && ctx.classes.has(classId);
}

export function getMatchedItems(ctx: TherapyContext | undefined | null, classId: string): string[] {
  return ctx?.classes.get(classId)?.items ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// Recommendation-side matching
// ────────────────────────────────────────────────────────────────────────────

/** Find the best therapy class that matches a free-form name string. */
export function findClassForName(name: string | null | undefined): TherapyClass | null {
  if (!name) return null;
  for (const klass of THERAPY_CLASSES) {
    if (klass.patterns.some((p) => p.test(name))) return klass;
  }
  return null;
}

/** Find every therapy class mentioned in a free-form text. */
export function findClassesInText(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const klass of THERAPY_CLASSES) {
    if (klass.patterns.some((p) => p.test(text))) out.add(klass.id);
  }
  return out;
}

/** Verbs that imply the recommendation is to *initiate* a therapy. */
const INITIATION_VERBS = /\b(initiate|start|begin|add(?:ing)?|consider\s+(?:starting|adding|initiating)|recommend\s+(?:starting|initiating|adding))\b/i;

/** Phrases that say the patient is already being managed — no annotation needed. */
const ALREADY_MANAGED_HINTS = /\b(adherence|already\s+on|continue\s+current|increase\s+(?:dose|the\s+dose)|titrate|optimize\s+dose|dose\s+optimization)\b/i;

// ────────────────────────────────────────────────────────────────────────────
// Annotators
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given a list of structured supplement recommendations and the patient's
 * therapy context, return a NEW list where any supplement whose name maps
 * to a class the patient is already on has its indication / rationale
 * rewritten to focus on adherence + dose optimization instead of
 * initiation. Priority is bumped down to "low" so genuinely-new items
 * surface first.
 */
export function annotateSupplementsWithContext(
  supps: SupplementRecommendation[],
  ctx: TherapyContext | undefined | null,
): SupplementRecommendation[] {
  if (!ctx || ctx.classes.size === 0) return supps;
  return supps.map((s) => {
    // Match deterministically on the supplement *name* only. The indication
    // field is a free-text lab/clinical description and can mention drug
    // classes contextually (e.g. "essential for patients on statins"),
    // which would cause false-positive [Already on ...] tagging — that
    // could over-suppress legitimate recommendations. The supplement-name
    // patterns in THERAPY_CLASSES are broad enough to catch branded names
    // like "D3 10,000 + K", "OmegaGenics® Fish Oil Neuro 1000", "NutraGems
    // CoQ10 300", etc. without false positives.
    const klass = findClassForName(s.name);
    if (!klass || !ctx.classes.has(klass.id)) return s;
    const items = ctx.classes.get(klass.id)!.items.join("; ");
    return {
      ...s,
      priority: "low" as SupplementRecommendation["priority"],
      indication: `[Already on ${klass.label}] ${s.indication}`,
      rationale:
        `Patient is already taking ${items}. Before recommending a new ${klass.label} ` +
        `product, confirm adherence (frequency, missed doses, recent refills), verify the ` +
        `current dose is appropriate for the lab finding, and consider dose optimization or ` +
        `formulation change rather than adding a duplicate supplement. Original protocol ` +
        `rationale: ${s.rationale}`,
    };
  });
}

/**
 * Walk a multi-line recommendation block (markdown bullets, numbered lists,
 * paragraphs). For each line that contains an INITIATION_VERB and a therapy
 * class the patient is already on, append an inline note naming the exact
 * chart item(s). Lines that already mention adherence / continuation / dose
 * titration are left untouched.
 */
export function annotateRecommendationMarkdown(
  text: string,
  ctx: TherapyContext | undefined | null,
): string {
  if (!ctx || ctx.classes.size === 0 || !text) return text;
  const onClasses = new Set<string>(ctx.classes.keys());

  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      if (!INITIATION_VERBS.test(line)) return line;
      if (ALREADY_MANAGED_HINTS.test(line)) return line;

      const matched: string[] = [];
      for (const klass of THERAPY_CLASSES) {
        if (!onClasses.has(klass.id)) continue;
        if (klass.patterns.some((p) => p.test(line))) {
          const items = ctx.classes.get(klass.id)!.items.join("; ");
          matched.push(`patient already on ${klass.label} (${items})`);
        }
      }
      if (matched.length === 0) return line;
      return `${line}  _[Note: ${matched.join("; ")} — assess adherence and consider dose optimization before adding more]_`;
    })
    .join("\n");
}

/** Patient-facing version: softer language, no clinical jargon. */
export function annotatePatientSummary(
  text: string,
  ctx: TherapyContext | undefined | null,
): string {
  if (!ctx || ctx.classes.size === 0 || !text) return text;
  const onClasses = new Set<string>(ctx.classes.keys());

  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      if (!INITIATION_VERBS.test(line)) return line;
      if (ALREADY_MANAGED_HINTS.test(line)) return line;

      const matched: string[] = [];
      for (const klass of THERAPY_CLASSES) {
        if (!onClasses.has(klass.id)) continue;
        if (klass.patterns.some((p) => p.test(line))) {
          const items = ctx.classes.get(klass.id)!.items.join(", ");
          matched.push(`${klass.label} (${items})`);
        }
      }
      if (matched.length === 0) return line;
      return `${line}  (Note: you're already taking ${matched.join("; ")} — keep taking it as prescribed and your provider will review whether the dose needs adjusting.)`;
    })
    .join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// AI prompt support
// ────────────────────────────────────────────────────────────────────────────

/**
 * Render a markdown block describing the patient's current therapies plus a
 * one-line behavior directive. Suitable for prepending to any AI clinical
 * prompt.
 */
export function buildTherapyPromptBlock(ctx: TherapyContext | undefined | null): string {
  if (!ctx || ctx.classes.size === 0) return "";
  const lines: string[] = [];
  lines.push("CURRENT THERAPIES ON BOARD (from patient chart):");
  for (const klass of Array.from(ctx.classes.values())) {
    lines.push(`- ${klass.label}: ${klass.items.join("; ")}`);
  }
  lines.push("");
  lines.push(
    "BEHAVIOR DIRECTIVE: Before recommending initiation of any medication or " +
    "supplement to address a suboptimal lab, cross-check this list. If the " +
    "indicated therapy class is already on board, do NOT phrase the " +
    "recommendation as initiation. Instead, recommend (a) adherence " +
    "assessment (frequency, missed doses, refill history), (b) verifying the " +
    "current dose is adequate for the finding, and (c) dose optimization or " +
    "formulation change as the next step. Name the exact medication/" +
    "supplement from the chart in your recommendation. " +
    "CRITICAL — MEDICATION NAMES: You must ONLY use real, established " +
    "generic or brand names. Do NOT invent, fabricate, or approximate any " +
    "drug or supplement name. If the patient chart lists a therapy class " +
    "without a specific drug name, use the class name only " +
    "(e.g., 'GLP-1 receptor agonist') — never create a fictional brand name."
  );
  return lines.join("\n");
}
