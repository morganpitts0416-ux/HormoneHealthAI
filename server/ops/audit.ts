import { db } from "../storage";
import { opsAuditLog } from "@shared/schema";

export interface OpsAuditOpts {
  adminId: number | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write a record to ops_audit_log. Never throws — failures are logged to
 * stderr so a bad audit write never breaks the primary request.
 */
export async function logOpsAudit(opts: OpsAuditOpts): Promise<void> {
  try {
    await db.insert(opsAuditLog).values({
      adminId: opts.adminId ?? null,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId !== undefined ? String(opts.targetId) : null,
      details: (opts.details ?? null) as any,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    });
  } catch (err) {
    console.error("[ops-audit] Failed to write audit event:", opts.action, err);
  }
}
