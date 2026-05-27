import type { Express } from "express";
import { opsSessionMiddleware } from "./session";
import { createOpsRouter } from "./routes";

/**
 * Register all ops-portal routes onto the Express app.
 *
 * Isolated from clinician auth:
 *  - Uses a custom opsSessionMiddleware that reads the ops.sid cookie only.
 *  - Never reads req.session or req.user.
 *  - All routes live under /api/ops/.
 *  - Disabled entirely when OPS_PORTAL_ENABLED !== 'true'.
 */
export function registerOpsRoutes(app: Express): void {
  app.use("/api/ops", opsSessionMiddleware);
  app.use("/api/ops", createOpsRouter());
}
