/**
 * Encounter dates are wall-calendar metadata, NOT event instants.
 * Legacy visit_date is timestamp-without-time-zone; UTC is only its transport.
 */
export function parseEncounterDate(value: unknown): Date {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/.test(value)) {
    throw new Error("Invalid encounter date");
  }
  const day = value.slice(0, 10);
  const clock = value.length > 10 ? value.slice(11).replace(/Z$|[+-]\d{2}:?\d{2}$/, "") : "00:00:00";
  const date = new Date(`${day}T${clock}Z`);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.toISOString().slice(0, 10) !== day ||
      Number(clock.slice(0, 2)) > 23 || Number(clock.slice(3, 5)) > 59 ||
      (clock.length > 5 && Number(clock.slice(6)) >= 60)) throw new Error("Invalid encounter date");
  return date;
}

export function encounterDay(value: string | Date): string {
  return (value instanceof Date ? value.toISOString() : parseEncounterDate(value).toISOString()).slice(0, 10);
}

/** Date carrier in the legacy recorded_at column, not an observed midnight measurement.
 * Linked note readings have date precision only; never display this carrier as a time.
 */
export function encounterVitalDate(value: string | Date): Date {
  return new Date(`${encounterDay(value)}T00:00:00.000Z`);
}

export class EncounterDateError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function assertEncounterDateEdit(
  current: { visitDate: Date; signedAt?: Date | null; lockedAt?: Date | null; pendingCollabReview?: boolean },
  next: Date,
  expected: unknown,
) {
  if (next.getTime() === current.visitDate.getTime()) return;
  if (current.signedAt || current.lockedAt || current.pendingCollabReview) {
    throw new EncounterDateError("Encounter date is locked. Use the amendment or review process first.", 423);
  }
  let matches = false;
  try { matches = typeof expected === "string" && parseEncounterDate(expected).getTime() === current.visitDate.getTime(); }
  catch { /* Invalid concurrency baselines are conflicts, never a server error. */ }
  if (!matches) {
    throw new EncounterDateError("Encounter date changed or was not confirmed. Reopen the encounter before saving.", 409);
  }
}
