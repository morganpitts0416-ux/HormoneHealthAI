import type { Request, Response, NextFunction } from "express";

/** Gate: return 404 if OPS_PORTAL_ENABLED !== 'true'. */
export function requireOpsEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.OPS_PORTAL_ENABLED !== "true") {
    res.status(404).json({ message: "Not found" });
    return;
  }
  next();
}

/** Gate: return 401 if no valid ops session is attached to the request. */
export function requireOpsAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.opsAdmin) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
}

/** Gate: return 403 if the authenticated ops admin does not hold one of the given roles. */
export function requireOpsRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.opsAdmin || !roles.includes(req.opsAdmin.role)) {
      res.status(403).json({ message: "Forbidden — insufficient role" });
      return;
    }
    next();
  };
}
