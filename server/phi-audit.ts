/**
 * phi-audit.ts
 *
 * Fire-and-forget helper for writing PHI access audit events.
 * Writes never block the request and never surface errors to the client.
 * All failures are logged to stderr only.
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type PhiActorType = "clinician" | "patient_portal" | "ops_admin";

export interface PhiAuditEvent {
  actorType: PhiActorType;
  actorId?: number | null;
  clinicId?: number | null;
  action: string;
  patientId?: number | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write a PHI access audit record asynchronously.
 * Call and forget — never await in request handlers.
 */
export function logPhiAccess(event: PhiAuditEvent): void {
  pool
    .query(
      `INSERT INTO phi_access_log
         (actor_type, actor_id, clinic_id, action, patient_id, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.actorType,
        event.actorId ?? null,
        event.clinicId ?? null,
        event.action,
        event.patientId ?? null,
        event.resourceId ?? null,
        event.ipAddress ?? null,
        event.userAgent ?? null,
      ],
    )
    .catch((err: Error) => {
      console.error("[phi-audit] write failed (non-fatal):", err?.message ?? err);
    });
}

export function ipFromReq(req: { ip?: string; socket?: { remoteAddress?: string } }): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export function uaFromReq(req: { headers?: Record<string, string | string[] | undefined> }): string | null {
  const ua = req.headers?.["user-agent"];
  return Array.isArray(ua) ? ua[0] ?? null : ua ?? null;
}
