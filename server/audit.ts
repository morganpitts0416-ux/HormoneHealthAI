import type { Request } from "express";
import { db } from "./storage";
import * as schema from "@shared/schema";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED"
  | "LOGOUT"
  | "PATIENT_VIEWED"
  | "PATIENT_CREATED"
  | "PATIENT_UPDATED"
  | "PATIENT_DELETED"
  | "LAB_RESULT_CREATED"
  | "LAB_RESULT_DELETED"
  | "PORTAL_LOGIN"
  | "PORTAL_LOGIN_FAILED"
  | "PASSWORD_CHANGED"
  | "PROFILE_UPDATED"
  // External-reviewer specific (HIPAA: every chart open by an outside MD/DO)
  | "EXTERNAL_REVIEWER_VIEW_ITEM"
  | "EXTERNAL_REVIEWER_VIEW_QUEUE"
  | "EXTERNAL_REVIEWER_SIGN"
  | "EXTERNAL_REVIEWER_REJECT"
  | "EXTERNAL_REVIEWER_SWITCH_CLINIC"
  | "EXTERNAL_REVIEWER_DENIED"
  | "EXTERNAL_REVIEWER_INVITE_CREATED"
  | "EXTERNAL_REVIEWER_INVITE_ACCEPTED"
  | "EXTERNAL_REVIEWER_INVITE_CANCELLED"
  | "EXTERNAL_REVIEWER_UPGRADED";

interface AuditOptions {
  action: AuditAction;
  resourceType?: string;
  resourceId?: number;
  patientId?: number;
  clinicianId?: number | null;
  staffId?: number | null;
  details?: Record<string, unknown>;
}

export function logAudit(req: Request, opts: AuditOptions): void {
  const sess = req.session as any;

  const clinicianId: number | null =
    opts.clinicianId !== undefined
      ? opts.clinicianId
      : (sess?.staffClinicianId ?? (req.user as any)?.id ?? null);

  const staffId: number | null =
    opts.staffId !== undefined ? opts.staffId : (sess?.staffId ?? null);

  const ipAddress =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  db.insert(schema.auditLogs)
    .values({
      clinicianId,
      staffId,
      action: opts.action,
      resourceType: opts.resourceType ?? null,
      resourceId: opts.resourceId ?? null,
      patientId: opts.patientId ?? null,
      ipAddress,
      userAgent,
      details: opts.details ?? null,
    } as any)
    .catch((err) => {
      console.error("[AUDIT] Failed to write audit log:", err);
    });
}
