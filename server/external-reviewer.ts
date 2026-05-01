/**
 * external-reviewer.ts — Helpers + middleware for the external collaborating
 * physician (chart-review-only) role.
 *
 * KEY INVARIANTS
 * --------------
 * 1. Every patient-data read by a user whose ACTIVE clinic membership has
 *    clinicalRole='external_reviewer' AND accessScope='chart_review_only'
 *    must be rejected unless the route is explicitly on the allow-list.
 * 2. Cross-clinic isolation: when an external reviewer switches clinics,
 *    `getEffectiveClinicId()` must return the active clinic; the deny-list
 *    middleware re-evaluates membership per-request.
 * 3. The provider/Stripe path is NEVER touched for chart_review_only invites.
 */

import type { Request, Response, NextFunction } from "express";
import { db } from "./storage";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { logAudit } from "./audit";

export type AccessScope = "full" | "chart_review_only";
export type ClinicalRole = "provider" | "rn" | "staff" | "external_reviewer";
export type AcceptanceStatus = "active" | "pending_acceptance";

export interface ActiveMembership {
  membershipId: number;
  clinicId: number;
  userId: number;
  clinicalRole: ClinicalRole | string;
  adminRole: string;
  accessScope: AccessScope | string;
  acceptanceStatus: AcceptanceStatus | string;
  isActive: boolean;
}

export function isExternalReviewerMembership(
  m: Pick<ActiveMembership, "clinicalRole" | "accessScope"> | null | undefined
): boolean {
  if (!m) return false;
  return m.clinicalRole === "external_reviewer" && m.accessScope === "chart_review_only";
}

/** Look up the membership for (userId, clinicId). Returns undefined if none. */
export async function getMembership(
  userId: number,
  clinicId: number
): Promise<ActiveMembership | undefined> {
  const [row] = await db
    .select({
      membershipId: schema.clinicMemberships.id,
      clinicId: schema.clinicMemberships.clinicId,
      userId: schema.clinicMemberships.userId,
      clinicalRole: schema.clinicMemberships.clinicalRole,
      adminRole: schema.clinicMemberships.adminRole,
      accessScope: schema.clinicMemberships.accessScope,
      acceptanceStatus: schema.clinicMemberships.acceptanceStatus,
      isActive: schema.clinicMemberships.isActive,
    })
    .from(schema.clinicMemberships)
    .where(
      and(
        eq(schema.clinicMemberships.userId, userId),
        eq(schema.clinicMemberships.clinicId, clinicId)
      )
    )
    .limit(1);
  return row as ActiveMembership | undefined;
}

/** All memberships (active + pending_acceptance) for a user, with clinic name. */
export async function listMembershipsForUser(userId: number): Promise<
  Array<ActiveMembership & { clinicName: string }>
> {
  const rows = await db
    .select({
      membershipId: schema.clinicMemberships.id,
      clinicId: schema.clinicMemberships.clinicId,
      userId: schema.clinicMemberships.userId,
      clinicalRole: schema.clinicMemberships.clinicalRole,
      adminRole: schema.clinicMemberships.adminRole,
      accessScope: schema.clinicMemberships.accessScope,
      acceptanceStatus: schema.clinicMemberships.acceptanceStatus,
      isActive: schema.clinicMemberships.isActive,
      clinicName: schema.clinics.name,
    })
    .from(schema.clinicMemberships)
    .innerJoin(schema.clinics, eq(schema.clinics.id, schema.clinicMemberships.clinicId))
    .where(
      and(
        eq(schema.clinicMemberships.userId, userId),
        eq(schema.clinicMemberships.isActive, true)
      )
    );
  return rows as any;
}

/**
 * Resolve the *effective* clinic ID for a request. External reviewers can have
 * memberships in many clinics; we honour an explicit session-scoped override
 * (`activeClinicId`) so a clinic switcher can swap the data context. Falls back
 * to the user's defaultClinicId for normal clinicians.
 */
export function resolveActiveClinicId(req: Request): number | null {
  const sess = req.session as any;
  if (sess?.staffId) {
    return (sess.staffClinicianClinicId as number | undefined) ?? null;
  }
  if (sess?.activeClinicId && Number.isFinite(sess.activeClinicId)) {
    return sess.activeClinicId as number;
  }
  return (req.user as any)?.defaultClinicId ?? null;
}

/**
 * Get the active membership for the current request. Cached on the request
 * object for the duration of a single HTTP request so middleware + handlers
 * don't double-query.
 */
export async function getActiveMembershipForRequest(
  req: Request
): Promise<ActiveMembership | undefined> {
  const cached = (req as any)._activeMembership as
    | ActiveMembership
    | "missing"
    | undefined;
  if (cached === "missing") return undefined;
  if (cached) return cached;

  const sess = req.session as any;
  // Staff path: staff are not external reviewers; just leave undefined.
  if (sess?.staffId) {
    (req as any)._activeMembership = "missing";
    return undefined;
  }
  const user = req.user as any;
  const clinicId = resolveActiveClinicId(req);
  if (!user?.id || !clinicId) {
    (req as any)._activeMembership = "missing";
    return undefined;
  }
  const m = await getMembership(user.id, clinicId);
  (req as any)._activeMembership = m ?? "missing";
  return m;
}

// ─── Allow-list for external reviewer (chart_review_only) ────────────────────
// These are the ONLY API path patterns an external_reviewer may hit. Anything
// else returns 403 from the deny-list middleware. Patterns are matched with
// startsWith() against `req.path`.
// Allow-list patterns that need *no further authorization* beyond
// "external reviewer is logged in." Patient-data routes are NOT in this list
// — they live in `EXTERNAL_REVIEWER_PATIENT_ROUTES` below and require
// per-request scope checks against the chart-review queue.
const EXTERNAL_REVIEWER_ALLOWLIST: ReadonlyArray<string | RegExp> = [
  // Identity / session basics
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/profile",
  "/api/me/memberships",
  "/api/me/active-clinic",
  "/api/billing/status", // BillingGate calls this on every page load

  // BAA — per-user, required before viewing any PHI even as an external
  // reviewer. They sign the BAA once and it covers all clinics they review for.
  "/api/baa/status",
  "/api/baa/sign",

  // Header chrome — these polling endpoints just return counts and are safe.
  // Returning 403 here would spam the toaster with errors during normal use.
  "/api/clinician/notifications",
  "/api/clinician/inbox-notifications/unread-count",

  // Chart-review surface — the entire reason this role exists. The chart-review
  // endpoints already filter by the reviewer's collaborator memberships
  // server-side (see chartReviewStorage.listQueueForPhysician).
  "/api/chart-review/agreements",
  "/api/chart-review/queue/physician",
  "/api/chart-review/items",
];

/**
 * Encounter-shaped routes that an external reviewer MAY hit, but only for
 * encounters that are queued chart-review items in an agreement they
 * collaborate on. The path's encounter ID is extracted by the
 * `extractEncounterId` regex below and validated server-side.
 *
 * NOTE: do NOT widen this — every entry here is a potential cross-clinic
 * data-leak surface if the patient-scope check is bypassed.
 */
const EXTERNAL_REVIEWER_ENCOUNTER_ROUTES: ReadonlyArray<RegExp> = [
  /^\/api\/encounters\/(\d+)$/,
  /^\/api\/encounters\/(\d+)\/(soap|signed-note|comments)$/,
];

/** True if this path is OK for an external reviewer to hit. */
export function isAllowedForExternalReviewer(path: string): boolean {
  for (const pat of EXTERNAL_REVIEWER_ALLOWLIST) {
    if (typeof pat === "string") {
      if (path === pat || path.startsWith(pat + "/") || path.startsWith(pat + "?")) {
        return true;
      }
    } else if (pat.test(path)) {
      return true;
    }
  }
  return false;
}

/**
 * If `path` is an encounter-shaped route the external reviewer may *potentially*
 * access, return the encounter ID. Otherwise return null. The middleware then
 * runs a server-authoritative scope check.
 */
function matchExternalReviewerEncounterRoute(path: string): number | null {
  for (const re of EXTERNAL_REVIEWER_ENCOUNTER_ROUTES) {
    const m = path.match(re);
    if (m && m[1]) {
      const id = parseInt(m[1], 10);
      if (Number.isFinite(id)) return id;
    }
  }
  return null;
}

/**
 * SERVER-AUTHORITATIVE patient scope check. Returns true iff:
 *   - encounter exists in the reviewer's ACTIVE clinic, AND
 *   - encounter has a chart_review_items row (i.e. it has been queued for
 *     chart review), AND
 *   - the reviewer is a chart_review_collaborators row on that item's
 *     agreement.
 *
 * Anything else returns false → 403 + audit. This is the ONLY layer between an
 * external reviewer and arbitrary encounters in the active clinic, so it must
 * never be skipped.
 */
export async function externalReviewerCanAccessEncounter(
  reviewerUserId: number,
  activeClinicId: number,
  encounterId: number
): Promise<boolean> {
  if (!Number.isFinite(reviewerUserId) || !Number.isFinite(activeClinicId) || !Number.isFinite(encounterId)) {
    return false;
  }
  // Single SQL round-trip: encounter must be queued AND reviewer must be a
  // collaborator on that item's agreement, all within the active clinic.
  const rows = await db
    .select({ itemId: schema.chartReviewItems.id })
    .from(schema.chartReviewItems)
    .innerJoin(
      schema.chartReviewCollaborators,
      eq(schema.chartReviewCollaborators.agreementId, schema.chartReviewItems.agreementId)
    )
    .where(
      and(
        eq(schema.chartReviewItems.encounterId, encounterId),
        eq(schema.chartReviewItems.clinicId, activeClinicId),
        eq(schema.chartReviewCollaborators.physicianUserId, reviewerUserId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Express middleware. If the caller's active membership is
 * external_reviewer + chart_review_only, gate the request to the allow-list.
 * Returns 403 (per spec — not 404 — to make audit trails crisp).
 *
 * Mounted globally via app.use() AFTER passport but BEFORE routes; safe for
 * unauthenticated requests (just calls next()).
 */
export function externalReviewerDenyList() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only gate /api/* — static assets and Vite HMR are unaffected.
    if (!req.path.startsWith("/api/")) return next();
    // Unauthenticated requests: let downstream auth middleware handle them.
    const user = req.user as any;
    const sess = req.session as any;
    if (!user?.id && !sess?.staffId) return next();
    try {
      const m = await getActiveMembershipForRequest(req);
      if (!isExternalReviewerMembership(m)) return next();

      // Tier 1 — unconditional allow-list (auth, billing/status, BAA, headers,
      // chart-review surface).
      if (isAllowedForExternalReviewer(req.path)) return next();

      // Tier 2 — encounter routes: server-authoritative patient scope check.
      // The encounter MUST be a queued chart_review_item in an agreement the
      // reviewer collaborates on, all in the active clinic.
      const encId = matchExternalReviewerEncounterRoute(req.path);
      if (encId !== null) {
        // Defense in depth: only safe HTTP methods. External reviewers do their
        // sign-off via /api/chart-review/items/:id/* — they should never hit
        // PUT/POST/DELETE on the encounter itself.
        if (req.method !== "GET") {
          logAudit(req, {
            action: "EXTERNAL_REVIEWER_DENIED",
            resourceType: "encounter",
            resourceId: encId,
            details: { method: req.method, path: req.path, reason: "non-GET method", clinicId: m?.clinicId ?? null },
          });
          res.status(403).json({
            message: "External chart-review accounts cannot modify encounters.",
            externalReviewer: true,
          });
          return;
        }
        const ok = await externalReviewerCanAccessEncounter(
          (req.user as any).id,
          m!.clinicId,
          encId
        );
        if (ok) return next();
        logAudit(req, {
          action: "EXTERNAL_REVIEWER_DENIED",
          resourceType: "encounter",
          resourceId: encId,
          details: {
            method: req.method,
            path: req.path,
            reason: "encounter not in reviewer's chart-review queue",
            clinicId: m?.clinicId ?? null,
          },
        });
        res.status(403).json({
          message:
            "This encounter is not on a chart-review item assigned to you in this clinic.",
          externalReviewer: true,
        });
        return;
      }

      // Default deny + audit.
      logAudit(req, {
        action: "EXTERNAL_REVIEWER_DENIED",
        resourceType: "route",
        details: { method: req.method, path: req.path, clinicId: m?.clinicId ?? null },
      });
      res.status(403).json({
        message:
          "External chart-review accounts may only access assigned charts. Contact the inviting clinic if you need expanded access.",
        externalReviewer: true,
      });
      return;
    } catch (err) {
      console.error("[externalReviewerDenyList] error:", err);
      // Fail closed for safety: if we can't determine membership, deny.
      res.status(503).json({ message: "Access check failed" });
      return;
    }
  };
}

/**
 * Try to find an existing user account for an external collaborating physician.
 * Identity is unified across clinics by (lowercase email) AND, if both sides
 * have an NPI, NPI must match. If the user has no NPI yet, email alone is enough
 * and we'll backfill the NPI on acceptance.
 */
export async function findUserForCollaboratorInvite(opts: {
  email: string;
  npi?: string | null;
}): Promise<schema.User | undefined> {
  const email = opts.email.trim().toLowerCase();
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!u) return undefined;
  // If both sides have an NPI and they don't match, refuse to link.
  if (opts.npi && u.npi && opts.npi.trim() !== u.npi.trim()) {
    return undefined;
  }
  return u as any;
}

export function isValidNpi(npi: string): boolean {
  return /^\d{10}$/.test(npi.trim());
}
