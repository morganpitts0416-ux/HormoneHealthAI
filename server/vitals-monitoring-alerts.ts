// Vitals Monitoring alert engine.
//
// Pure functions that classify a single patient-logged BP reading and decide
// what (if any) provider notification should fire. Heavy lifting (DB writes,
// inbox notifications) lives in the route layer — this module is intentionally
// side-effect free so it can be unit tested.
//
// Thresholds (per ACC/AHA 2017):
//   • Severe BP    → SBP >= 180 OR DBP >= 120  (urgent, fires every time)
//   • Stage 2 BP   → SBP >= 140 OR DBP >= 90   (urgent after 3rd reading in episode)
//   • Stage 1 BP   → SBP 130–139 OR DBP 80–89  (informational, no alert here)
//   • Elevated BP  → SBP 120–129 AND DBP < 80  (informational)
//
// Per spec — patient-facing copy must NEVER advise medication changes or diagnose.

export type BpClassification =
  | "normal"
  | "elevated"
  | "stage_1"
  | "stage_2"
  | "severe";

export interface BpReading {
  systolicBp: number | null | undefined;
  diastolicBp: number | null | undefined;
}

export function classifyBp(reading: BpReading): BpClassification {
  const sbp = Number(reading.systolicBp ?? 0);
  const dbp = Number(reading.diastolicBp ?? 0);
  if (!Number.isFinite(sbp) || !Number.isFinite(dbp) || sbp <= 0 || dbp <= 0) return "normal";
  if (sbp >= 180 || dbp >= 120) return "severe";
  if (sbp >= 140 || dbp >= 90) return "stage_2";
  if (sbp >= 130 || dbp >= 80) return "stage_1";
  if (sbp >= 120 && dbp < 80) return "elevated";
  return "normal";
}

export function isStage2OrSevere(reading: BpReading): boolean {
  const c = classifyBp(reading);
  return c === "stage_2" || c === "severe";
}

export interface AlertDecision {
  // Fires immediately on any severe reading (>=180/120).
  fireSevere: boolean;
  // Fires the FIRST time the cumulative count of stage-2+ readings in the
  // episode crosses the threshold (>=3 per spec). Caller is responsible for
  // dedupe via vitals_monitoring_alerts.
  fireStage2Pattern: boolean;
  classification: BpClassification;
}

/**
 * Evaluate a single new reading against the running tally of prior stage-2+
 * readings in the episode. Caller passes `priorStage2OrSevereCount` (count of
 * existing stage-2+ readings in this episode BEFORE the new one is committed).
 */
export function evaluateBpReading(
  reading: BpReading,
  priorStage2OrSevereCount: number,
): AlertDecision {
  const classification = classifyBp(reading);
  const isAtOrAboveStage2 = classification === "stage_2" || classification === "severe";
  const newCount = priorStage2OrSevereCount + (isAtOrAboveStage2 ? 1 : 0);
  return {
    fireSevere: classification === "severe",
    // Per spec: "If patient logs more than 2 Stage 2 readings, notify provider".
    // We fire when crossing from 2 → 3 (idempotency enforced by caller via
    // hasVitalsMonitoringAlert(episodeId, "stage_2_bp_pattern")).
    fireStage2Pattern: isAtOrAboveStage2 && newCount >= 3,
    classification,
  };
}

// Patient-facing severe BP warning copy. Verbatim from spec — no medication
// or diagnosis language.
export const SEVERE_BP_PATIENT_WARNING =
  "This reading is very high. Please recheck after sitting quietly for 5 minutes. " +
  "If it remains this high or you have chest pain, shortness of breath, severe headache, " +
  "weakness, confusion, or vision changes, seek urgent/emergency care.";

// Symptom checkbox values offered with BP logs (BP-only).
export const BP_SYMPTOM_OPTIONS = [
  { value: "headache",            label: "Headache" },
  { value: "chest_pain",          label: "Chest pain" },
  { value: "shortness_of_breath", label: "Shortness of breath" },
  { value: "dizziness",           label: "Dizziness" },
  { value: "vision_changes",      label: "Vision changes" },
  { value: "weakness",            label: "Weakness" },
  { value: "confusion",           label: "Confusion" },
  { value: "none",                label: "None of these" },
] as const;
