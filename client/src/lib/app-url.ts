/**
 * Domain routing helpers for the ClinIQ dual-domain setup.
 *
 * realignlabeval.com  — the underlying live deployment; no domain logic fires here
 * cliniqapp.ai        — marketing/branding overlay; shows landing page only
 * app.cliniqapp.ai    — full app entry point; unauthenticated → /login
 * localhost / Replit  — dev mode; no domain logic fires
 */

const MARKETING_DOMAINS = ["cliniqapp.ai", "www.cliniqapp.ai"];
const APP_SUBDOMAIN = "app.cliniqapp.ai";

/**
 * True only when the visitor is on app.cliniqapp.ai.
 * Never true on localhost, Replit preview, or realignlabeval.com.
 */
export function isAppSubdomain(): boolean {
  const h = window.location.hostname;
  return h === APP_SUBDOMAIN;
}

/**
 * True only when the visitor is on cliniqapp.ai (the branding overlay).
 * Never true on localhost, Replit preview, or realignlabeval.com.
 */
export function isMarketingDomain(): boolean {
  const h = window.location.hostname;
  return MARKETING_DOMAINS.includes(h);
}

/**
 * Returns the full URL for an app-side path.
 *
 * - On cliniqapp.ai (marketing domain) → https://app.cliniqapp.ai<path>
 * - Everywhere else (app subdomain, realignlabeval.com, localhost, Replit) → relative path
 */
export function appUrl(path: string): string {
  if (isMarketingDomain()) return `https://${APP_SUBDOMAIN}${path}`;
  return path;
}
