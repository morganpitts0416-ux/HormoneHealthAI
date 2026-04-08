/**
 * Returns true if the visitor is on the real production app subdomain.
 * Dev / Replit preview environments are never treated as the app subdomain.
 */
export function isAppSubdomain(): boolean {
  const h = window.location.hostname;
  if (
    h === "localhost" ||
    h.includes("replit")
  ) return false;
  return h.startsWith("app.");
}

/**
 * Returns true if we are on the public marketing domain (not the app subdomain,
 * not localhost, not a Replit preview URL).
 */
export function isMarketingDomain(): boolean {
  const h = window.location.hostname;
  if (h === "localhost" || h.includes("replit")) return false;
  return !h.startsWith("app.");
}

/**
 * Returns the full URL for an app-side path.
 *
 * - On the marketing domain  → https://app.<host><path>
 * - On the app subdomain     → <path>  (relative — already there)
 * - On localhost / Replit    → <path>  (relative — dev mode)
 */
export function appUrl(path: string): string {
  const h = window.location.hostname;
  if (h === "localhost" || h.includes("replit")) return path;
  if (!h.startsWith("app.")) return `https://app.${h}${path}`;
  return path;
}
