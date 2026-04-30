import type { ClinicalEncounter, ClinicalExtraction, SoapNote } from "@shared/schema";

export const CONTROLLED_SUBSTANCE_GENERICS: { generic: string; schedule: 'II' | 'III' | 'IV' | 'V'; commonBrands: string[] }[] = [
  { generic: "alprazolam", schedule: "IV", commonBrands: ["xanax"] },
  { generic: "lorazepam", schedule: "IV", commonBrands: ["ativan"] },
  { generic: "clonazepam", schedule: "IV", commonBrands: ["klonopin"] },
  { generic: "diazepam", schedule: "IV", commonBrands: ["valium"] },
  { generic: "temazepam", schedule: "IV", commonBrands: ["restoril"] },
  { generic: "zolpidem", schedule: "IV", commonBrands: ["ambien"] },
  { generic: "eszopiclone", schedule: "IV", commonBrands: ["lunesta"] },
  { generic: "tramadol", schedule: "IV", commonBrands: ["ultram"] },
  { generic: "oxycodone", schedule: "II", commonBrands: ["oxycontin", "percocet", "roxicodone"] },
  { generic: "hydrocodone", schedule: "II", commonBrands: ["norco", "vicodin", "lortab"] },
  { generic: "morphine", schedule: "II", commonBrands: ["ms contin", "kadian"] },
  { generic: "fentanyl", schedule: "II", commonBrands: ["duragesic", "actiq"] },
  { generic: "methadone", schedule: "II", commonBrands: ["dolophine", "methadose"] },
  { generic: "hydromorphone", schedule: "II", commonBrands: ["dilaudid"] },
  { generic: "codeine", schedule: "III", commonBrands: ["tylenol with codeine"] },
  { generic: "buprenorphine", schedule: "III", commonBrands: ["suboxone", "subutex"] },
  { generic: "amphetamine", schedule: "II", commonBrands: ["adderall", "evekeo"] },
  { generic: "lisdexamfetamine", schedule: "II", commonBrands: ["vyvanse"] },
  { generic: "methylphenidate", schedule: "II", commonBrands: ["ritalin", "concerta", "focalin"] },
  { generic: "dextroamphetamine", schedule: "II", commonBrands: ["dexedrine"] },
  { generic: "modafinil", schedule: "IV", commonBrands: ["provigil"] },
  { generic: "armodafinil", schedule: "IV", commonBrands: ["nuvigil"] },
  { generic: "testosterone", schedule: "III", commonBrands: ["androgel", "testopel", "depo-testosterone"] },
  { generic: "ketamine", schedule: "III", commonBrands: ["ketalar", "spravato"] },
  { generic: "phentermine", schedule: "IV", commonBrands: ["adipex", "lomaira"] },
  { generic: "pregabalin", schedule: "V", commonBrands: ["lyrica"] },
];

function buildHaystack(encounter: Pick<ClinicalEncounter, "soapNote" | "clinicalExtraction">): string {
  const soap = encounter.soapNote as SoapNote | null;
  const extraction = encounter.clinicalExtraction as ClinicalExtraction | null;
  const parts: string[] = [];
  if (soap) {
    if (soap.plan) parts.push(soap.plan);
    if (soap.assessment) parts.push(soap.assessment);
    if (soap.fullNote) parts.push(soap.fullNote);
  }
  if (extraction) {
    if (Array.isArray(extraction.medications_current)) parts.push(extraction.medications_current.join("\n"));
    if (Array.isArray(extraction.medication_changes_discussed)) parts.push(extraction.medication_changes_discussed.join("\n"));
    if (Array.isArray(extraction.plan_candidates)) parts.push(extraction.plan_candidates.join("\n"));
  }
  return parts.join("\n").toLowerCase();
}

export function detectControlledSubstances(encounter: Pick<ClinicalEncounter, "soapNote" | "clinicalExtraction">): string[] {
  const haystack = buildHaystack(encounter);
  if (!haystack) return [];
  const hits = new Set<string>();
  for (const drug of CONTROLLED_SUBSTANCE_GENERICS) {
    const tokens = [drug.generic, ...drug.commonBrands];
    for (const tok of tokens) {
      const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(haystack)) {
        const display = drug.generic.charAt(0).toUpperCase() + drug.generic.slice(1);
        hits.add(`${display} (Schedule ${drug.schedule})`);
        break;
      }
    }
  }
  return Array.from(hits);
}

function normalizeDx(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Compares dx in `current` vs union of dx in all `prior` encounters for the
// same patient. Returns the dx strings (as found in current) that are new.
export function detectNewDiagnoses(
  current: Pick<ClinicalEncounter, "clinicalExtraction">,
  prior: Array<Pick<ClinicalEncounter, "clinicalExtraction">>
): string[] {
  const currentDx = ((current.clinicalExtraction as ClinicalExtraction | null)?.diagnoses_discussed ?? []).filter(Boolean);
  if (currentDx.length === 0) return [];
  const seen = new Set<string>();
  for (const p of prior) {
    const dx = ((p.clinicalExtraction as ClinicalExtraction | null)?.diagnoses_discussed ?? []).filter(Boolean);
    for (const d of dx) seen.add(normalizeDx(d));
  }
  const newOnes: string[] = [];
  for (const d of currentDx) {
    if (!seen.has(normalizeDx(d))) newOnes.push(d);
  }
  return newOnes;
}

// 'YYYY-MM' / 'YYYY-Q#' / 'YYYY' depending on period.
export function computeQuotaPeriodKey(signedAt: Date, period: 'month' | 'quarter' | 'year'): string {
  const y = signedAt.getUTCFullYear();
  if (period === 'year') return String(y);
  if (period === 'quarter') {
    const q = Math.floor(signedAt.getUTCMonth() / 3) + 1;
    return `${y}-Q${q}`;
  }
  const m = String(signedAt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Returns the LAST millisecond of the enforcement period containing signedAt.
export function computeEnforcementDueAt(signedAt: Date, enforcementPeriod: 'month' | 'quarter' | 'year'): Date {
  const y = signedAt.getUTCFullYear();
  const m = signedAt.getUTCMonth();
  if (enforcementPeriod === 'year') {
    return new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
  }
  if (enforcementPeriod === 'quarter') {
    const qStartMonth = Math.floor(m / 3) * 3; // 0, 3, 6, 9
    const qEndMonth = qStartMonth + 2;         // 2, 5, 8, 11
    // Day 0 of next month = last day of current month.
    return new Date(Date.UTC(y, qEndMonth + 1, 0, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
}

export function daysPastDue(now: Date, enforcementDueAt: Date): number {
  const ms = now.getTime() - enforcementDueAt.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
