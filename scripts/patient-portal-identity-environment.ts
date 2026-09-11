export function isReplitDevelopmentWorkspace(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development"
    && env.REPLIT_DEPLOYMENT !== "1"
    && env.CI !== "true"
    && Boolean(env.REPL_ID?.trim())
    && Boolean(env.REPLIT_DEV_DOMAIN?.trim());
}

export function requireReplitDevelopmentWorkspace(operation: string): void {
  if (!isReplitDevelopmentWorkspace()) {
    throw new Error(`${operation} requires an attested Replit development workspace`);
  }
}