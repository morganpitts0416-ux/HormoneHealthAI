// USPSTF-based health maintenance screening rules.
// This is intentionally a hardcoded rule set (not a DB table) — these
// guidelines change infrequently and encoding them in code keeps the
// due-date math auditable and testable.

export type ScreeningKey =
  | "mammogram"
  | "pap_smear"
  | "dexa"
  | "psa"
  | "colonoscopy"
  | "lung_ct";

export interface ScreeningDefinition {
  key: ScreeningKey;
  label: string;
  // Order type/subtype used when "Send Order" is clicked from the tracker.
  orderSubtype: string;
  intervalMonths: number;
  eligible: (ctx: EligibilityContext) => boolean;
  // Human-readable criteria shown in the UI.
  criteriaLabel: string;
}

export interface EligibilityContext {
  age: number;
  gender: string | null | undefined; // 'male' | 'female' | other
  smokingStatus?: string | null; // 'never' | 'former' | 'current' | null
  smokingPackYears?: number | null;
  smokingQuitDate?: string | null;
}

function isFemale(gender: string | null | undefined) {
  return (gender || "").toLowerCase() === "female";
}
function isMale(gender: string | null | undefined) {
  return (gender || "").toLowerCase() === "male";
}

function yearsSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

export const SCREENING_DEFINITIONS: ScreeningDefinition[] = [
  {
    key: "mammogram",
    label: "Mammogram",
    orderSubtype: "Mammogram",
    intervalMonths: 24,
    criteriaLabel: "Women 40-74, every 2 years",
    eligible: (ctx) => isFemale(ctx.gender) && ctx.age >= 40 && ctx.age <= 74,
  },
  {
    key: "pap_smear",
    label: "Pap Smear / Cervical Cancer Screening",
    orderSubtype: "Pap Smear",
    intervalMonths: 36,
    criteriaLabel: "Women 21-65, every 3-5 years",
    eligible: (ctx) => isFemale(ctx.gender) && ctx.age >= 21 && ctx.age <= 65,
  },
  {
    key: "dexa",
    label: "DEXA Bone Density Scan",
    orderSubtype: "DEXA Scan",
    intervalMonths: 24,
    criteriaLabel: "Women 65+",
    eligible: (ctx) => isFemale(ctx.gender) && ctx.age >= 65,
  },
  {
    key: "psa",
    label: "PSA Discussion / Screening",
    orderSubtype: "PSA Lab",
    intervalMonths: 12,
    criteriaLabel: "Men 55-69 (shared decision-making)",
    eligible: (ctx) => isMale(ctx.gender) && ctx.age >= 55 && ctx.age <= 69,
  },
  {
    key: "colonoscopy",
    label: "Colonoscopy",
    orderSubtype: "Colonoscopy",
    intervalMonths: 120,
    criteriaLabel: "Adults 45-75, every 10 years",
    eligible: (ctx) => ctx.age >= 45 && ctx.age <= 75,
  },
  {
    key: "lung_ct",
    label: "Low-Dose Lung CT",
    orderSubtype: "Low-Dose Lung CT",
    intervalMonths: 12,
    criteriaLabel: "Adults 55-80 with 20+ pack-year smoking history, current smoker or quit within 15 years",
    eligible: (ctx) => {
      if (ctx.age < 55 || ctx.age > 80) return false;
      if (!ctx.smokingPackYears || ctx.smokingPackYears < 20) return false;
      if (ctx.smokingStatus === "current") return true;
      if (ctx.smokingStatus === "former" && ctx.smokingQuitDate) {
        return yearsSince(ctx.smokingQuitDate) <= 15;
      }
      return false;
    },
  },
];

export function getScreeningDefinition(key: string): ScreeningDefinition | undefined {
  return SCREENING_DEFINITIONS.find((d) => d.key === key);
}

export function computeAge(dateOfBirth: string | null | undefined): number {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function computeEligibleScreenings(ctx: EligibilityContext): ScreeningDefinition[] {
  return SCREENING_DEFINITIONS.filter((d) => d.eligible(ctx));
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Given last completion date (or none) and the definition's interval,
// compute the next due date. If never completed, due immediately (today).
export function computeNextDueDate(def: ScreeningDefinition, lastCompletedDate: string | null | undefined): string {
  if (!lastCompletedDate) {
    return new Date().toISOString().slice(0, 10);
  }
  return addMonths(lastCompletedDate, def.intervalMonths);
}

export function computeStatus(nextDueDate: string | null | undefined, hasOpenOrder: boolean): "due" | "overdue" | "ordered" {
  if (hasOpenOrder) return "ordered";
  if (!nextDueDate) return "due";
  const today = new Date().toISOString().slice(0, 10);
  return nextDueDate < today ? "overdue" : "due";
}

// 30-day re-flag window for dismissed overdue flags.
export function shouldReflag(flagDismissedAt: Date | null | undefined): boolean {
  if (!flagDismissedAt) return true;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(flagDismissedAt).getTime() >= thirtyDaysMs;
}
