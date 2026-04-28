// ─── Vital signs analyzer ────────────────────────────────────────────────
// Shared helpers used by both /api/interpret-labs and /api/interpret-labs-female.
//
// When a clinician enters systolic blood pressure and/or BMI alongside a lab
// panel, we want three things to happen:
//   1. The vital becomes part of the lab interpretation table (so the
//      clinician sees it in the same color-coded results UI).
//   2. Severe vitals trigger a red flag (hypertensive crisis, BMI >= 40).
//   3. The vital is added to the AI prompt so recommendations factor in
//      hypertension and BMI context (lifestyle, medication choice,
//      cardiovascular risk discussion).
//
// All categorization here follows widely accepted clinical guidelines:
//   - Blood pressure: AHA/ACC 2017 hypertension guideline (systolic only,
//     since the lab eval form only captures systolic right now).
//   - BMI: WHO/CDC adult classification (kg/m²).
//
// Design notes:
//   - These functions take only the demographics block and never throw.
//   - They return empty arrays when the relevant vital is missing so callers
//     can spread their results unconditionally.

import type { LabInterpretation, RedFlag } from "@shared/schema";

type VitalsInput = {
  systolicBP?: number | null;
  bmi?: number | null;
};

export type VitalsSnapshot = {
  systolicBP: number | null;
  bmi: number | null;
  bpStatus: "normal" | "elevated" | "stage1" | "stage2" | "crisis" | null;
  bmiCategory: "underweight" | "normal" | "overweight" | "obese_1" | "obese_2" | "obese_3" | null;
};

export function summarizeVitals(demographics?: VitalsInput | null): VitalsSnapshot {
  const sbp = numOrNull(demographics?.systolicBP);
  const bmi = numOrNull(demographics?.bmi);
  return {
    systolicBP: sbp,
    bmi,
    bpStatus: classifySystolic(sbp),
    bmiCategory: classifyBmi(bmi),
  };
}

// ── LabInterpretation rows for the results table ─────────────────────────

export function buildVitalInterpretations(demographics?: VitalsInput | null): LabInterpretation[] {
  const rows: LabInterpretation[] = [];
  const snap = summarizeVitals(demographics);
  if (snap.systolicBP !== null) {
    rows.push({
      category: "Blood Pressure (Systolic)",
      value: snap.systolicBP,
      unit: "mmHg",
      status: bpStatusToRowStatus(snap.bpStatus),
      referenceRange: "<120 mmHg (normal) · 120-129 elevated · 130-139 Stage 1 · ≥140 Stage 2 · ≥180 crisis",
      interpretation: bpInterpretationText(snap.bpStatus, snap.systolicBP),
      recommendation: bpRecommendationText(snap.bpStatus),
      recheckTiming: bpRecheckTiming(snap.bpStatus),
    });
  }
  if (snap.bmi !== null) {
    rows.push({
      category: "BMI (Body Mass Index)",
      value: round1(snap.bmi),
      unit: "kg/m²",
      status: bmiCategoryToRowStatus(snap.bmiCategory),
      referenceRange: "18.5-24.9 normal · 25-29.9 overweight · 30-34.9 class I · 35-39.9 class II · ≥40 class III",
      interpretation: bmiInterpretationText(snap.bmiCategory, snap.bmi),
      recommendation: bmiRecommendationText(snap.bmiCategory),
      recheckTiming: bmiRecheckTiming(snap.bmiCategory),
    });
  }
  return rows;
}

// ── Red flags for severe vitals ──────────────────────────────────────────

export function buildVitalRedFlags(demographics?: VitalsInput | null): RedFlag[] {
  const flags: RedFlag[] = [];
  const snap = summarizeVitals(demographics);
  if (snap.bpStatus === "crisis") {
    flags.push({
      category: "Hypertensive Crisis",
      severity: "critical",
      message: `Systolic blood pressure ${snap.systolicBP} mmHg meets criteria for hypertensive urgency/emergency (≥180 mmHg).`,
      action: "Repeat BP after 5 minutes of rest. If still ≥180 mmHg, evaluate for end-organ damage and contact provider immediately. Same-day intervention required.",
    });
  } else if (snap.bpStatus === "stage2") {
    flags.push({
      category: "Stage 2 Hypertension",
      severity: "urgent",
      message: `Systolic blood pressure ${snap.systolicBP} mmHg meets criteria for Stage 2 hypertension (≥140 mmHg).`,
      action: "Confirm with repeat measurement. Initiate or escalate antihypertensive therapy and lifestyle intervention. Recheck within 1 month.",
    });
  }
  if (snap.bmiCategory === "obese_3") {
    flags.push({
      category: "Class III Obesity",
      severity: "urgent",
      message: `BMI ${round1(snap.bmi!)} kg/m² meets criteria for class III (severe) obesity.`,
      action: "Discuss comprehensive weight management including pharmacotherapy and metabolic/bariatric surgery referral. Screen for OSA, NAFLD, and cardiometabolic comorbidities.",
    });
  }
  return flags;
}

// ── AI prompt block ──────────────────────────────────────────────────────

export function buildVitalsPromptBlock(demographics?: VitalsInput | null): string {
  const snap = summarizeVitals(demographics);
  if (snap.systolicBP === null && snap.bmi === null) return "";
  const lines: string[] = ["VITAL SIGNS (consider in cardiovascular and metabolic recommendations):"];
  if (snap.systolicBP !== null) {
    lines.push(`- Systolic BP: ${snap.systolicBP} mmHg [${bpStatusLabel(snap.bpStatus)}]`);
  }
  if (snap.bmi !== null) {
    lines.push(`- BMI: ${round1(snap.bmi)} kg/m² [${bmiCategoryLabel(snap.bmiCategory)}]`);
  }
  return lines.join("\n") + "\n\n";
}

// ── Internal classification helpers ──────────────────────────────────────

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function classifySystolic(sbp: number | null): VitalsSnapshot["bpStatus"] {
  if (sbp === null) return null;
  if (sbp >= 180) return "crisis";
  if (sbp >= 140) return "stage2";
  if (sbp >= 130) return "stage1";
  if (sbp >= 120) return "elevated";
  return "normal";
}

function classifyBmi(bmi: number | null): VitalsSnapshot["bmiCategory"] {
  if (bmi === null) return null;
  if (bmi >= 40) return "obese_3";
  if (bmi >= 35) return "obese_2";
  if (bmi >= 30) return "obese_1";
  if (bmi >= 25) return "overweight";
  if (bmi < 18.5) return "underweight";
  return "normal";
}

function bpStatusToRowStatus(s: VitalsSnapshot["bpStatus"]): LabInterpretation["status"] {
  switch (s) {
    case "crisis": return "critical";
    case "stage2": return "abnormal";
    case "stage1": return "borderline";
    case "elevated": return "borderline";
    case "normal": return "normal";
    default: return "normal";
  }
}

function bmiCategoryToRowStatus(c: VitalsSnapshot["bmiCategory"]): LabInterpretation["status"] {
  switch (c) {
    case "obese_3": return "critical";
    case "obese_2": return "abnormal";
    case "obese_1": return "abnormal";
    case "overweight": return "borderline";
    case "underweight": return "borderline";
    case "normal": return "normal";
    default: return "normal";
  }
}

function bpStatusLabel(s: VitalsSnapshot["bpStatus"]): string {
  switch (s) {
    case "crisis": return "hypertensive crisis";
    case "stage2": return "Stage 2 hypertension";
    case "stage1": return "Stage 1 hypertension";
    case "elevated": return "elevated";
    case "normal": return "normal";
    default: return "unknown";
  }
}

function bmiCategoryLabel(c: VitalsSnapshot["bmiCategory"]): string {
  switch (c) {
    case "obese_3": return "class III obesity";
    case "obese_2": return "class II obesity";
    case "obese_1": return "class I obesity";
    case "overweight": return "overweight";
    case "underweight": return "underweight";
    case "normal": return "normal weight";
    default: return "unknown";
  }
}

function bpInterpretationText(s: VitalsSnapshot["bpStatus"], sbp: number): string {
  switch (s) {
    case "crisis":
      return `Systolic ${sbp} mmHg is in the hypertensive crisis range (≥180). Carries acute risk of stroke, MI, and end-organ damage.`;
    case "stage2":
      return `Systolic ${sbp} mmHg meets criteria for Stage 2 hypertension (AHA/ACC 2017). Significantly elevates 10-year cardiovascular risk.`;
    case "stage1":
      return `Systolic ${sbp} mmHg meets criteria for Stage 1 hypertension. Begin lifestyle intervention; consider pharmacotherapy if 10-year ASCVD risk ≥10%.`;
    case "elevated":
      return `Systolic ${sbp} mmHg is in the "elevated" range. Lifestyle intervention recommended; reassess in 3-6 months.`;
    case "normal":
      return `Systolic ${sbp} mmHg is within the normal range.`;
    default:
      return "";
  }
}

function bpRecommendationText(s: VitalsSnapshot["bpStatus"]): string {
  switch (s) {
    case "crisis":
      return "Repeat measurement; if confirmed, evaluate for end-organ damage and treat per hypertensive urgency/emergency protocol. Provider notification required.";
    case "stage2":
      return "Initiate or escalate antihypertensive therapy. Combine with DASH diet, sodium restriction <1500 mg/day, weight management, and aerobic exercise.";
    case "stage1":
      return "Lifestyle intervention first-line. Add pharmacotherapy if ASCVD ≥10% or comorbidities (DM, CKD, known CVD). Home BP monitoring encouraged.";
    case "elevated":
      return "Lifestyle modification: DASH-style diet, reduce sodium, regular aerobic activity, limit alcohol, weight loss if BMI ≥25.";
    case "normal":
      return "Maintain current lifestyle. Reassess at next routine visit.";
    default:
      return "";
  }
}

function bpRecheckTiming(s: VitalsSnapshot["bpStatus"]): string | undefined {
  switch (s) {
    case "crisis": return "Same day";
    case "stage2": return "Within 1 month";
    case "stage1": return "Within 3 months";
    case "elevated": return "3-6 months";
    case "normal": return undefined;
    default: return undefined;
  }
}

function bmiInterpretationText(c: VitalsSnapshot["bmiCategory"], bmi: number): string {
  const v = round1(bmi);
  switch (c) {
    case "obese_3":
      return `BMI ${v} kg/m² (class III / severe obesity). High risk for type 2 diabetes, OSA, NAFLD, and cardiovascular disease. Strongly consider intensive weight management.`;
    case "obese_2":
      return `BMI ${v} kg/m² (class II obesity). Elevated cardiometabolic risk; structured weight loss program and pharmacotherapy candidate.`;
    case "obese_1":
      return `BMI ${v} kg/m² (class I obesity). Increased risk of insulin resistance, hypertension, and dyslipidemia. Lifestyle intervention indicated.`;
    case "overweight":
      return `BMI ${v} kg/m² (overweight). Lifestyle intervention recommended to prevent progression to obesity and reduce metabolic risk.`;
    case "underweight":
      return `BMI ${v} kg/m² (underweight). Evaluate for nutritional deficiency, malabsorption, hypermetabolic state, or eating disorder.`;
    case "normal":
      return `BMI ${v} kg/m² is within the normal range.`;
    default:
      return "";
  }
}

function bmiRecommendationText(c: VitalsSnapshot["bmiCategory"]): string {
  switch (c) {
    case "obese_3":
      return "Discuss comprehensive weight management: structured nutrition, exercise, anti-obesity pharmacotherapy (GLP-1 RA), and metabolic/bariatric surgery referral. Screen for OSA, NAFLD, T2DM.";
    case "obese_2":
      return "Structured weight loss program targeting 5-10% body weight reduction. Anti-obesity medication candidate. Screen for comorbidities.";
    case "obese_1":
      return "Lifestyle intervention with goal of 5-7% weight loss over 6 months. Consider pharmacotherapy if comorbidities present.";
    case "overweight":
      return "Mediterranean or DASH-style diet, 150+ min/week moderate aerobic activity, resistance training 2x/week.";
    case "underweight":
      return "Nutritional assessment; evaluate for occult disease (thyroid, GI malabsorption, malignancy) if unintentional.";
    case "normal":
      return "Maintain current dietary and activity patterns.";
    default:
      return "";
  }
}

function bmiRecheckTiming(c: VitalsSnapshot["bmiCategory"]): string | undefined {
  switch (c) {
    case "obese_3":
    case "obese_2":
    case "obese_1":
      return "3 months";
    case "overweight":
      return "6 months";
    default:
      return undefined;
  }
}
