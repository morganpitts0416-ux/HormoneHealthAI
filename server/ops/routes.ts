import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { db } from "../storage";
import { platformAdmins, opsSessions, opsAuditLog } from "@shared/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import { logOpsAudit } from "./audit";
import { requireOpsEnabled, requireOpsAuth, requireOpsRole } from "./middleware";

// ── Rate limiter — ops portal login only (5 attempts / 15 min / IP) ─────────
const opsLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please wait 15 minutes and try again." },
  skipSuccessfulRequests: true,
});

// ── Constants ────────────────────────────────────────────────────────────────
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OPS_COOKIE = "ops.sid";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────
function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    ""
  );
}

function getUA(req: Request): string {
  return req.headers["user-agent"] || "";
}

function parsePagination(query: any): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit) || DEFAULT_LIMIT));
  return { limit, offset: (page - 1) * limit, page };
}

function setOpsCookie(res: Response, value: string, maxAgeMs: number): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", [
    `${OPS_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`,
  ]);
}

function clearOpsCookie(res: Response): void {
  res.setHeader("Set-Cookie", [
    `${OPS_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`,
  ]);
}

function parseRawCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie || "";
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eqIdx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// ── Router ───────────────────────────────────────────────────────────────────
export function createOpsRouter(): Router {
  const router = Router();

  // ── GET /status — no auth required ─────────────────────────────────────
  router.get("/status", requireOpsEnabled, async (_req, res) => {
    try {
      const result = await db
        .select({ cnt: sql<number>`cast(count(*) as int)` })
        .from(platformAdmins);
      return res.json({ enabled: true, bootstrapped: (result[0]?.cnt ?? 0) > 0 });
    } catch {
      return res.json({ enabled: true, bootstrapped: false });
    }
  });

  // ── GET /overview — aggregate counts, no PHI ────────────────────────────
  router.get("/overview", requireOpsEnabled, requireOpsAuth, async (req, res) => {
    try {
      const [clinicCount] = await db.execute(
        sql`SELECT count(*)::int AS total FROM clinics`,
      );
      const [userCount] = await db.execute(
        sql`SELECT count(*)::int AS total FROM users`,
      );
      const [baaCount] = await db.execute(
        sql`SELECT count(*)::int AS total FROM baa_signatures`,
      );
      const [activeCount] = await db.execute(
        sql`SELECT count(*)::int AS total FROM clinics WHERE subscription_status = 'active'`,
      );
      const [trialCount] = await db.execute(
        sql`SELECT count(*)::int AS total FROM clinics WHERE subscription_status = 'trial'`,
      );
      const recentAudit = await db
        .select({
          id: opsAuditLog.id,
          action: opsAuditLog.action,
          adminId: opsAuditLog.adminId,
          targetType: opsAuditLog.targetType,
          createdAt: opsAuditLog.createdAt,
        })
        .from(opsAuditLog)
        .orderBy(desc(opsAuditLog.createdAt))
        .limit(10);

      return res.json({
        totalClinics: (clinicCount as any).total ?? 0,
        totalUsers: (userCount as any).total ?? 0,
        totalBaaSigned: (baaCount as any).total ?? 0,
        activeClinics: (activeCount as any).total ?? 0,
        trialClinics: (trialCount as any).total ?? 0,
        recentAuditEvents: recentAudit,
      });
    } catch (err) {
      console.error("[ops/overview]", err);
      return res.status(500).json({ message: "Failed to fetch overview" });
    }
  });

  // ── POST /bootstrap — one-time first-owner creation ────────────────────
  router.post("/bootstrap", requireOpsEnabled, async (req, res) => {
    const ip = getIp(req);
    const ua = getUA(req);
    try {
      // Trim the stored secret — Replit's secret vault can silently add a
      // trailing newline or spaces, which causes an exact-match false negative
      // even when the user copies the value correctly.
      const envToken = (process.env.OPS_BOOTSTRAP_TOKEN ?? "").trim();
      if (!envToken) {
        return res.status(503).json({
          message: "Bootstrap not configured — OPS_BOOTSTRAP_TOKEN secret is not set",
        });
      }
      const { token, email, password, firstName, lastName } = req.body ?? {};
      // Trim the submitted token too — catches any browser/paste whitespace.
      const submittedToken = typeof token === "string" ? token.trim() : "";

      // ── TEMPORARY DEBUG — logs only lengths + SHA-256 prefixes, never the raw token ──
      {
        const envLen   = envToken.length;
        const subLen   = submittedToken.length;
        const envHash  = crypto.createHash("sha256").update(envToken).digest("hex").slice(0, 8);
        const subHash  = submittedToken.length > 0
          ? crypto.createHash("sha256").update(submittedToken).digest("hex").slice(0, 8)
          : "N/A";
        const exact    = submittedToken === envToken;
        const revision = process.env.K_REVISION ?? process.env.CLOUD_RUN_REVISION ?? "unknown";
        console.log(
          "[ops/bootstrap/debug]",
          JSON.stringify({ envLen, subLen, envHash, subHash, exact, revision })
        );
      }
      // ── END TEMPORARY DEBUG ────────────────────────────────────────────────────

      if (!submittedToken || submittedToken !== envToken) {
        await logOpsAudit({
          adminId: null,
          action: "OPS_BOOTSTRAP_FAILED",
          ipAddress: ip,
          userAgent: ua,
          details: { reason: "invalid_token" },
        });
        return res.status(403).json({ message: "Invalid bootstrap token" });
      }
      const [existing] = await db
        .select({ cnt: sql<number>`cast(count(*) as int)` })
        .from(platformAdmins);
      if ((existing?.cnt ?? 0) > 0) {
        return res.status(409).json({
          message: "Bootstrap already complete — log in at /ops",
        });
      }
      if (!email || !password || !firstName || !lastName) {
        return res
          .status(400)
          .json({ message: "email, password, firstName, and lastName are required" });
      }
      if (password.length < 12) {
        return res
          .status(400)
          .json({ message: "Password must be at least 12 characters" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const [newAdmin] = await db
        .insert(platformAdmins)
        .values({
          email: email.toLowerCase().trim(),
          passwordHash,
          passwordChangedAt: new Date(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: "owner",
          status: "active",
        })
        .returning({ id: platformAdmins.id, email: platformAdmins.email });

      await logOpsAudit({
        adminId: newAdmin.id,
        action: "BOOTSTRAP_OWNER_CREATED",
        targetType: "platform_admin",
        targetId: newAdmin.id,
        details: { email: newAdmin.email },
        ipAddress: ip,
        userAgent: ua,
      });

      return res.json({ ok: true, message: "Owner account created. Log in at /ops." });
    } catch (err: any) {
      console.error("[ops/bootstrap]", err);
      return res.status(500).json({ message: "Bootstrap failed" });
    }
  });

  // ── POST /auth/login ────────────────────────────────────────────────────
  router.post("/auth/login", requireOpsEnabled, opsLoginLimiter, async (req, res) => {
    const ip = getIp(req);
    const ua = getUA(req);
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    try {
      const admins = await db
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.email, email.toLowerCase().trim()))
        .limit(1);
      const admin = admins[0];

      // Constant-time path even when admin is not found
      if (!admin) {
        await bcrypt.hash(password, 12);
        await logOpsAudit({
          adminId: null,
          action: "OPS_LOGIN_FAILED",
          ipAddress: ip,
          userAgent: ua,
          details: { email, reason: "not_found" },
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (admin.status !== "active") {
        await logOpsAudit({
          adminId: admin.id,
          action: "OPS_LOGIN_FAILED",
          ipAddress: ip,
          userAgent: ua,
          details: { reason: `status_${admin.status}` },
        });
        return res.status(403).json({ message: "Account is not active" });
      }

      if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
        await logOpsAudit({
          adminId: admin.id,
          action: "OPS_LOGIN_FAILED",
          ipAddress: ip,
          userAgent: ua,
          details: { reason: "account_locked" },
        });
        return res
          .status(403)
          .json({ message: "Account locked due to failed login attempts. Try again later." });
      }

      const valid = await bcrypt.compare(password, admin.passwordHash);

      if (!valid) {
        const newCount = (admin.failedLoginCount || 0) + 1;
        const updates: any = { failedLoginCount: newCount, updatedAt: new Date() };
        if (newCount >= LOCK_THRESHOLD) {
          updates.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
        }
        await db.update(platformAdmins).set(updates).where(eq(platformAdmins.id, admin.id));
        await logOpsAudit({
          adminId: admin.id,
          action: "OPS_LOGIN_FAILED",
          ipAddress: ip,
          userAgent: ua,
          details: { reason: "wrong_password", failedCount: newCount },
        });
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Success
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

      await db.insert(opsSessions).values({
        id: sessionId,
        adminId: admin.id,
        expiresAt,
        ipAddress: ip,
        userAgent: ua,
      });

      await db
        .update(platformAdmins)
        .set({
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          lastLoginIp: ip,
          lastLoginUserAgent: ua,
          updatedAt: new Date(),
        })
        .where(eq(platformAdmins.id, admin.id));

      setOpsCookie(res, sessionId, SESSION_TTL_MS);

      await logOpsAudit({
        adminId: admin.id,
        action: "OPS_LOGIN_SUCCESS",
        ipAddress: ip,
        userAgent: ua,
      });

      return res.json({
        ok: true,
        admin: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
        },
      });
    } catch (err) {
      console.error("[ops/login]", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // ── POST /auth/logout ───────────────────────────────────────────────────
  router.post("/auth/logout", requireOpsEnabled, async (req, res) => {
    const ip = getIp(req);
    const ua = getUA(req);
    const sessionId = parseRawCookie(req, OPS_COOKIE);

    if (sessionId) {
      await db.delete(opsSessions).where(eq(opsSessions.id, sessionId)).catch(() => {});
    }
    clearOpsCookie(res);

    if (req.opsAdmin) {
      await logOpsAudit({ adminId: req.opsAdmin.id, action: "OPS_LOGOUT", ipAddress: ip, userAgent: ua });
    }
    return res.json({ ok: true });
  });

  // ── GET /auth/me ────────────────────────────────────────────────────────
  router.get("/auth/me", requireOpsEnabled, requireOpsAuth, (_req, res) => {
    return res.json({ admin: _req.opsAdmin });
  });

  // ── GET /clinics ────────────────────────────────────────────────────────
  router.get(
    "/clinics",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner", "admin", "viewer"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const { limit, offset, page } = parsePagination(req.query);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

      try {
        const searchCond = search
          ? sql`AND LOWER(c.name) LIKE LOWER(${"%" + search + "%"})`
          : sql``;

        const rows = await db.execute(sql`
          SELECT
            c.id, c.name, c.slug, c.subscription_plan, c.subscription_status,
            c.max_providers, c.is_active, c.created_at, c.trial_ends_at,
            u.id AS owner_id, u.email AS owner_email,
            u.first_name AS owner_first_name, u.last_name AS owner_last_name,
            u.title AS owner_title,
            (SELECT COUNT(*)::int FROM clinic_memberships cm
             WHERE cm.clinic_id = c.id AND cm.is_active = true) AS member_count
          FROM clinics c
          LEFT JOIN users u ON u.id = c.owner_user_id
          WHERE 1=1 ${searchCond}
          ORDER BY c.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const totalRow = await db.execute(sql`
          SELECT COUNT(*)::int AS total FROM clinics c WHERE 1=1 ${searchCond}
        `);

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_CLINICS_VIEWED",
          ipAddress: ip,
          userAgent: ua,
          details: { page, limit, ...(search ? { search } : {}) },
        });

        return res.json({ data: rows.rows, total: (totalRow.rows[0] as any)?.total ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/clinics]", err);
        return res.status(500).json({ message: "Failed to fetch clinics" });
      }
    },
  );

  // ── GET /users ──────────────────────────────────────────────────────────
  router.get(
    "/users",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner", "admin", "viewer"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const { limit, offset, page } = parsePagination(req.query);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

      try {
        const searchCond = search
          ? sql`AND (LOWER(u.email) LIKE LOWER(${"%" + search + "%"})
                OR LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER(${"%" + search + "%"}))`
          : sql``;

        const rows = await db.execute(sql`
          SELECT
            u.id, u.email, u.first_name, u.last_name, u.title,
            u.subscription_status, u.free_account, u.created_at,
            u.user_type, u.clinic_name, u.default_clinic_id,
            (SELECT COUNT(*)::int FROM clinic_memberships cm
             WHERE cm.user_id = u.id AND cm.is_active = true) AS clinic_count
          FROM users u
          WHERE 1=1 ${searchCond}
          ORDER BY u.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const totalRow = await db.execute(sql`
          SELECT COUNT(*)::int AS total FROM users u WHERE 1=1 ${searchCond}
        `);

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_USERS_VIEWED",
          ipAddress: ip,
          userAgent: ua,
          details: { page, limit, ...(search ? { search } : {}) },
        });

        return res.json({ data: rows.rows, total: (totalRow.rows[0] as any)?.total ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/users]", err);
        return res.status(500).json({ message: "Failed to fetch users" });
      }
    },
  );

  // ── GET /baa-signatures ─────────────────────────────────────────────────
  router.get(
    "/baa-signatures",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner", "admin", "viewer"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const { limit, offset, page } = parsePagination(req.query);
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

      try {
        const searchCond = search
          ? sql`AND (LOWER(u.email) LIKE LOWER(${"%" + search + "%"})
                OR LOWER(u.first_name || ' ' || u.last_name) LIKE LOWER(${"%" + search + "%"}))`
          : sql``;

        const rows = await db.execute(sql`
          SELECT
            bs.id, bs.signed_at, bs.signature_name, bs.ip_address, bs.baa_version,
            u.id AS user_id, u.email, u.first_name, u.last_name, u.title,
            c.id AS clinic_id, c.name AS clinic_name, c.subscription_plan
          FROM baa_signatures bs
          JOIN users u ON u.id = bs.user_id
          LEFT JOIN clinics c ON c.owner_user_id = bs.user_id
          WHERE 1=1 ${searchCond}
          ORDER BY bs.signed_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const totalRow = await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM baa_signatures bs
          JOIN users u ON u.id = bs.user_id
          WHERE 1=1 ${searchCond}
        `);

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_BAA_VIEWED",
          ipAddress: ip,
          userAgent: ua,
          details: { page, limit, ...(search ? { search } : {}) },
        });

        return res.json({ data: rows.rows, total: (totalRow.rows[0] as any)?.total ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/baa-signatures]", err);
        return res.status(500).json({ message: "Failed to fetch BAA signatures" });
      }
    },
  );

  // ── GET /subscriptions ──────────────────────────────────────────────────
  router.get(
    "/subscriptions",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner", "admin", "viewer"),
    async (req, res) => {
      const { limit, offset, page } = parsePagination(req.query);
      try {
        const rows = await db.execute(sql`
          SELECT
            c.id AS clinic_id, c.name AS clinic_name,
            c.subscription_plan, c.subscription_status,
            c.stripe_customer_id, c.stripe_subscription_id,
            c.trial_ends_at, c.created_at, c.is_active,
            u.email AS owner_email,
            u.first_name AS owner_first_name, u.last_name AS owner_last_name,
            u.free_account
          FROM clinics c
          LEFT JOIN users u ON u.id = c.owner_user_id
          ORDER BY c.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const totalRow = await db.execute(sql`SELECT COUNT(*)::int AS total FROM clinics`);

        return res.json({ data: rows.rows, total: (totalRow.rows[0] as any)?.total ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/subscriptions]", err);
        return res.status(500).json({ message: "Failed to fetch subscriptions" });
      }
    },
  );

  // ── GET /security-events ─────────────────────────────────────────────────
  // Only returns security/auth metadata — explicitly excludes PHI-containing fields.
  router.get(
    "/security-events",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner", "admin", "viewer"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const { limit, offset, page } = parsePagination(req.query);

      try {
        const rows = await db.execute(sql`
          SELECT
            al.id, al.action, al.created_at, al.ip_address,
            al.user_id,
            u.email AS user_email,
            u.first_name, u.last_name
          FROM audit_logs al
          LEFT JOIN users u ON u.id = al.user_id
          WHERE al.action IN (
            'LOGIN','LOGOUT','LOGIN_FAILED','PASSWORD_RESET_REQUESTED',
            'PASSWORD_RESET_COMPLETED','ACCOUNT_LOCKED','REGISTER',
            'SESSION_TIMEOUT','STAFF_LOGIN','STAFF_LOGOUT',
            'PORTAL_LOGIN','PORTAL_LOGOUT','PASSWORD_CHANGED'
          )
          ORDER BY al.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const totalRow = await db.execute(sql`
          SELECT COUNT(*)::int AS total FROM audit_logs
          WHERE action IN (
            'LOGIN','LOGOUT','LOGIN_FAILED','PASSWORD_RESET_REQUESTED',
            'PASSWORD_RESET_COMPLETED','ACCOUNT_LOCKED','REGISTER',
            'SESSION_TIMEOUT','STAFF_LOGIN','STAFF_LOGOUT',
            'PORTAL_LOGIN','PORTAL_LOGOUT','PASSWORD_CHANGED'
          )
        `);

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_SECURITY_EVENTS_VIEWED",
          ipAddress: ip,
          userAgent: ua,
          details: { page, limit },
        });

        return res.json({ data: rows.rows, total: (totalRow.rows[0] as any)?.total ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/security-events]", err);
        return res.status(500).json({ message: "Failed to fetch security events" });
      }
    },
  );

  // ── GET /audit-log ──────────────────────────────────────────────────────
  router.get(
    "/audit-log",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner", "admin"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const { limit, offset, page } = parsePagination(req.query);
      const filterAction =
        typeof req.query.action === "string" ? req.query.action.trim() : "";

      try {
        const filterCond = filterAction
          ? sql`AND oal.action LIKE ${"%" + filterAction + "%"}`
          : sql``;

        const rows = await db.execute(sql`
          SELECT
            oal.id, oal.action, oal.target_type, oal.target_id,
            oal.ip_address, oal.user_agent, oal.created_at, oal.details,
            pa.email AS admin_email,
            pa.first_name AS admin_first_name, pa.last_name AS admin_last_name
          FROM ops_audit_log oal
          LEFT JOIN platform_admins pa ON pa.id = oal.admin_id
          WHERE 1=1 ${filterCond}
          ORDER BY oal.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `);

        const totalRow = await db.execute(sql`
          SELECT COUNT(*)::int AS total FROM ops_audit_log oal WHERE 1=1 ${filterCond}
        `);

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_AUDIT_LOG_VIEWED",
          ipAddress: ip,
          userAgent: ua,
          details: { page, limit, ...(filterAction ? { filterAction } : {}) },
        });

        return res.json({ data: rows.rows, total: (totalRow.rows[0] as any)?.total ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/audit-log]", err);
        return res.status(500).json({ message: "Failed to fetch audit log" });
      }
    },
  );

  // ── GET /admins ─────────────────────────────────────────────────────────
  router.get(
    "/admins",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner"),
    async (req, res) => {
      const { limit, offset, page } = parsePagination(req.query);
      try {
        const rows = await db
          .select({
            id: platformAdmins.id,
            email: platformAdmins.email,
            firstName: platformAdmins.firstName,
            lastName: platformAdmins.lastName,
            role: platformAdmins.role,
            status: platformAdmins.status,
            mfaEnabled: platformAdmins.mfaEnabled,
            createdAt: platformAdmins.createdAt,
            lastLoginAt: platformAdmins.lastLoginAt,
            lastLoginIp: platformAdmins.lastLoginIp,
            failedLoginCount: platformAdmins.failedLoginCount,
            lockedUntil: platformAdmins.lockedUntil,
          })
          .from(platformAdmins)
          .orderBy(desc(platformAdmins.createdAt))
          .limit(limit)
          .offset(offset);

        const [countRow] = await db
          .select({ cnt: sql<number>`cast(count(*) as int)` })
          .from(platformAdmins);

        return res.json({ data: rows, total: countRow?.cnt ?? 0, page, limit });
      } catch (err) {
        console.error("[ops/admins GET]", err);
        return res.status(500).json({ message: "Failed to fetch admins" });
      }
    },
  );

  // ── POST /admins ────────────────────────────────────────────────────────
  router.post(
    "/admins",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const { email, password, firstName, lastName, role } = req.body ?? {};

      if (!email || !password || !firstName || !lastName) {
        return res
          .status(400)
          .json({ message: "email, password, firstName, and lastName are required" });
      }
      if (password.length < 12) {
        return res.status(400).json({ message: "Password must be at least 12 characters" });
      }
      const safeRole = ["owner", "admin", "viewer"].includes(role) ? role : "admin";

      try {
        const passwordHash = await bcrypt.hash(password, 12);
        const [newAdmin] = await db
          .insert(platformAdmins)
          .values({
            email: email.toLowerCase().trim(),
            passwordHash,
            passwordChangedAt: new Date(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            role: safeRole,
            status: "active",
            createdById: req.opsAdmin!.id,
          })
          .returning({
            id: platformAdmins.id,
            email: platformAdmins.email,
            role: platformAdmins.role,
          });

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_ADMIN_CREATED",
          targetType: "platform_admin",
          targetId: newAdmin.id,
          details: { email: newAdmin.email, role: newAdmin.role },
          ipAddress: ip,
          userAgent: ua,
        });

        return res.json({ ok: true, admin: newAdmin });
      } catch (err: any) {
        if (err.code === "23505") {
          return res.status(409).json({ message: "An admin with that email already exists" });
        }
        console.error("[ops/admins POST]", err);
        return res.status(500).json({ message: "Failed to create admin" });
      }
    },
  );

  // ── PATCH /admins/:id ───────────────────────────────────────────────────
  router.patch(
    "/admins/:id",
    requireOpsEnabled,
    requireOpsAuth,
    requireOpsRole("owner"),
    async (req, res) => {
      const ip = getIp(req);
      const ua = getUA(req);
      const targetId = parseInt(req.params.id);

      if (isNaN(targetId)) return res.status(400).json({ message: "Invalid admin ID" });
      if (targetId === req.opsAdmin!.id) {
        return res
          .status(400)
          .json({ message: "You cannot modify your own account here" });
      }

      const { role, status } = req.body ?? {};
      const updates: any = { updatedAt: new Date() };
      if (role && ["owner", "admin", "viewer"].includes(role)) updates.role = role;
      if (status && ["active", "suspended"].includes(status)) updates.status = status;
      if (status === "active") {
        updates.failedLoginCount = 0;
        updates.lockedUntil = null;
      }

      if (Object.keys(updates).length <= 1) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      try {
        const [updated] = await db
          .update(platformAdmins)
          .set(updates)
          .where(eq(platformAdmins.id, targetId))
          .returning({
            id: platformAdmins.id,
            email: platformAdmins.email,
            role: platformAdmins.role,
            status: platformAdmins.status,
          });

        if (!updated) return res.status(404).json({ message: "Admin not found" });

        await logOpsAudit({
          adminId: req.opsAdmin!.id,
          action: "OPS_ADMIN_UPDATED",
          targetType: "platform_admin",
          targetId,
          details: { changes: updates },
          ipAddress: ip,
          userAgent: ua,
        });

        return res.json({ ok: true, admin: updated });
      } catch (err) {
        console.error("[ops/admins PATCH]", err);
        return res.status(500).json({ message: "Failed to update admin" });
      }
    },
  );

  return router;
}
