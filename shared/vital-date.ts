import { EncounterDateError, parseEncounterDate } from "./encounter-date";

/** Today in the clinician's local calendar, not the UTC date. */
export function localClinicalDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Date-only entries use the existing UTC calendar-date carrier in recorded_at.
 * Existing timestamp callers retain their original timestamp precision.
 * Neither representation changes the independent created_at audit timestamp.
 */
export function vitalMeasurementDate(value: string | Date): Date {
  try {
    const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? parseEncounterDate(value)
      : new Date(value instanceof Date ? value.getTime() : value);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid date");
    return date;
  } catch {
    throw new EncounterDateError("Date Taken must be a valid measurement date.", 400);
  }
}
