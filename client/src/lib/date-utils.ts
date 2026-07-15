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
  return toLocalDateTimeStr(new Date());
}

/**
 * Converts any Date object to a local-timezone YYYY-MM-DDTHH:MM string
 * suitable for datetime-local input fields.
 *
 * Use this instead of `date.toISOString().slice(0, 16)` whenever an existing
 * Date (e.g. a stored appointment time) needs to be displayed in a
 * datetime-local input. Unlike toISOString(), this uses local clock getters
 * so the value reflects the user's timezone rather than UTC.
 */
export function toLocalDateTimeStr(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}T${hh}:${min}`;
}

/**
 * Formats a lab date for display using UTC calendar components.
 *
 * Lab dates are stored as UTC-midnight timestamps (e.g. "2026-06-01T00:00:00.000Z").
 * Using local-timezone getters (toLocaleDateString, date-fns format) shifts that to
 * the previous evening for users west of UTC, causing an off-by-one-day bug. Reading
 * UTC components directly recovers the correct calendar date.
 *
 * @param labDate  ISO string or Date returned from the server
 * @param style    "M/d" (default) → "6/1"  |  "short" → "Jun '26"  |  "long" → "Jun 1, 2026"
 */
export function formatLabDate(
  labDate: string | Date,
  style: "M/d" | "short" | "long" = "M/d"
): string {
  const d = typeof labDate === "string" ? new Date(labDate) : labDate;
  if (isNaN(d.getTime())) return "—";
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (style === "M/d")  return `${m + 1}/${day}`;
  if (style === "short") return `${MONTHS[m]} '${String(year).slice(2)}`;
  return `${MONTHS[m]} ${day}, ${year}`;
}

/**
 * Extracts YYYY-MM-DDTHH:mm from an API-returned `timestamp without time zone` value
 * for use in a datetime-local input field.
 *
 * node-postgres serializes `timestamp without time zone` columns as UTC ISO strings
 * (e.g. "2026-07-15T08:20:00.000Z") even though the stored value has no timezone —
 * the Z suffix is misleading. Passing this through `new Date()` applies the browser's
 * UTC offset and produces the wrong wall-clock time (e.g. 03:20 in America/Chicago
 * instead of 08:20).
 *
 * This helper strips the Z / offset suffix and slices to 16 chars, recovering the
 * original wall-clock value exactly as stored, with no timezone math applied.
 *
 * Use this ONLY for `timestamp without time zone` encounter visit dates. Do NOT use
 * it for UTC-intent fields (lab dates, dateOfBirth, signedAt) which use separate helpers.
 */
export function visitDateToInputStr(raw: string | Date): string {
  const s = typeof raw === "string" ? raw : raw.toISOString();
  // Remove Z or ±HH:MM suffix, then take first 16 chars: YYYY-MM-DDTHH:mm
  return s.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "").slice(0, 16);
}

/**
 * Extracts YYYY-MM-DD from an API-returned `timestamp without time zone` value
 * for use in a date-only input field.
 *
 * Same rationale as visitDateToInputStr — strips the misleading Z suffix before
 * slicing so no UTC-offset shift is applied.
 */
export function visitDateToDateStr(raw: string | Date): string {
  return visitDateToInputStr(raw).slice(0, 10);
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
