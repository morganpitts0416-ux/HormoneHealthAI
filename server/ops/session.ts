import type { Request, Response, NextFunction } from "express";
import { db } from "../storage";
import { opsSessions, platformAdmins } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

export interface OpsAdminContext {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}

declare global {
  namespace Express {
    interface Request {
      opsAdmin?: OpsAdminContext;
    }
  }
}

/** Parse the ops.sid cookie without requiring cookie-parser. */
function parseOpsCookie(req: Request): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    if (name === "ops.sid") {
      try {
        return decodeURIComponent(part.slice(eqIdx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/**
 * Ops session middleware.
 * Reads the ops.sid cookie, validates it against ops_sessions, and attaches
 * req.opsAdmin if the session is valid and the admin is active.
 *
 * Deliberately never reads req.session or req.user — zero coupling to the
 * clinician auth system.
 */
export async function opsSessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = parseOpsCookie(req);
  if (!sessionId) return next();

  try {
    const now = new Date();
    const sessions = await db
      .select({ adminId: opsSessions.adminId })
      .from(opsSessions)
      .where(and(eq(opsSessions.id, sessionId), gt(opsSessions.expiresAt, now)))
      .limit(1);

    if (!sessions.length) return next();

    const admins = await db
      .select({
        id: platformAdmins.id,
        email: platformAdmins.email,
        firstName: platformAdmins.firstName,
        lastName: platformAdmins.lastName,
        role: platformAdmins.role,
        status: platformAdmins.status,
      })
      .from(platformAdmins)
      .where(
        and(
          eq(platformAdmins.id, sessions[0].adminId),
          eq(platformAdmins.status, "active"),
        ),
      )
      .limit(1);

    if (admins.length) {
      req.opsAdmin = admins[0];
    }
  } catch (err) {
    console.error("[ops-session] Error validating session:", err);
  }

  next();
}
