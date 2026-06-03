/**
 * Returns today's date as a local-timezone YYYY-MM-DD string.
 *
 * Using `new Date().toISOString().slice(0, 10)` returns the UTC date,
 * which is one day behind for users west of UTC (e.g. all US time zones)
 * after midnight local time. Use this helper everywhere a date input needs
 * to be pre-filled with "today".
 */
export function localDateStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Converts any Date object to a local-timezone YYYY-MM-DD string.
 *
 * Use this instead of `date.toISOString().split("T")[0]` whenever the
 * result will be displayed to the user or written into a date input field.
 * Server-side UTC storage is fine to keep using toISOString() directly.
 */
export function toLocalDateStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Extracts the UTC date portion (YYYY-MM-DD) from a Date.
 *
 * Use this for values stored in the database as UTC-midnight timestamps
 * representing date-only fields (e.g. dateOfBirth stored as a `timestamp`
 * column). The UTC date component faithfully reflects the intended calendar
 * date regardless of the viewer's local timezone, because the value was
 * stored as midnight UTC when the user submitted a date-only form field.
 *
 * Do NOT use this to display "today's date" to users — use localDateStr()
 * for that purpose.
 */
export function utcDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Returns the current local date and time as a YYYY-MM-DDTHH:MM string
 * suitable for datetime-local input fields.
 *
 * Using `new Date().toISOString().slice(0, 16)` returns the UTC datetime,
 * which is offset from local time for users outside UTC. Use this helper
 * everywhere a datetime-local input needs to be pre-filled with "now".
 */
export function localDateTimeStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Parses a date string in either YYYY-MM-DD or MM/DD/YYYY format and
 * returns a stable YYYY-MM-DD string without going through Date local
 * getters, which would shift the date for users west of UTC.
 *
 * Use this for dates that arrive as formatted strings (e.g. from AI PDF
 * extraction) where the string itself already encodes the intended local
 * calendar date. Running such strings through `new Date()` then local
 * getters is unsafe because YYYY-MM-DD strings are parsed as UTC midnight
 * and the local-getter conversion then shifts to the previous day in US zones.
 *
 * Returns null if the string does not match either expected format.
 */
export function parseDateOnlyStr(s: string): string | null {
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return s;
  }
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}
