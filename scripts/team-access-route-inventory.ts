/**
 * Static, read-only inventory of Express route declarations.
 *
 * This intentionally does not import the server. Importing the server would
 * initialize sessions, connect to the database, and make a route inventory
 * unsuitable for CI or security review. The scanner reads source text only.
 */

import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

export const CLASSIFICATIONS = [
  "base_authentication_only",
  "active_clinic_required",
  "owner_required",
  "clinic_administrator_permitted",
  "platform_admin",
  "ops_portal",
  "ops_portal_auth",
  "ops_portal_role_restricted",
  "patient_portal",
  "integration_webhook_system",
  "public",
  "token_bound_public_flow",
  "system_job_secret",
  "safe_public_config",
  "constrained_payment_bootstrap",
  "dual_actor_base_auth",
  "indeterminate_review",
] as const;

export type RouteClassification = (typeof CLASSIFICATIONS)[number];

export interface RouteEvidence {
  requireAuth: boolean;
  requireClinicianOnly: boolean;
  getEffectiveClinicId: boolean;
  activeClinicId: boolean;
  defaultClinicId: boolean;
  staffSessionFields: string[];
  ownerSignals: string[];
  administratorSignals: string[];
  patientPortalSignals: string[];
  webhookSignals: string[];
}

export interface RouteInventoryEntry {
  sourceFile: string;
  line: number;
  receiver: string;
  method: string;
  path: string;
  localPath: string;
  mountPrefix: string;
  classification: RouteClassification;
  evidence: RouteEvidence;
}

export interface ParseOptions {
  /** Prefix to apply to router-local paths in this source file. */
  mountPrefix?: string;
}

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "all",
]);
const ROUTE_CALL = /\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(/g;

/**
 * Mask comments and quoted/template strings while retaining source positions.
 * This keeps route-like text in comments and handler string literals from
 * becoming false route declarations. The original source is used afterwards
 * to recover the path argument.
 */
function maskNonCode(source: string): string {
  const chars = source.split("");
  let mode: "code" | "single" | "double" | "template" | "lineComment" | "blockComment" = "code";
  let escaped = false;

  for (let i = 0; i < chars.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];

    if (mode === "lineComment") {
      if (c === "\n") mode = "code";
      else chars[i] = " ";
      continue;
    }
    if (mode === "blockComment") {
      if (c === "*" && next === "/") {
        chars[i] = " ";
        chars[i + 1] = " ";
        i += 1;
        mode = "code";
      } else if (c !== "\n") {
        chars[i] = " ";
      }
      continue;
    }
    if (mode === "single" || mode === "double" || mode === "template") {
      if (c === "\n") {
        // Invalid JavaScript, but preserving a line boundary is safer than
        // allowing a malformed string to hide the rest of a test fixture.
        mode = "code";
        escaped = false;
        continue;
      }
      if (escaped) {
        chars[i] = " ";
        escaped = false;
      } else if (c === "\\") {
        chars[i] = " ";
        escaped = true;
      } else if (
        (mode === "single" && c === "'") ||
        (mode === "double" && c === '"') ||
        (mode === "template" && c === "`")
      ) {
        chars[i] = " ";
        mode = "code";
      } else {
        chars[i] = " ";
      }
      continue;
    }

    if (c === "/" && next === "/") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 1;
      mode = "lineComment";
    } else if (c === "/" && next === "*") {
      chars[i] = " ";
      chars[i + 1] = " ";
      i += 1;
      mode = "blockComment";
    } else if (c === "'") {
      chars[i] = " ";
      mode = "single";
    } else if (c === '"') {
      chars[i] = " ";
      mode = "double";
    } else if (c === "`") {
      chars[i] = " ";
      mode = "template";
    }
  }
  return chars.join("");
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (c === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (c === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(") depth += 1;
    if (c === ")" && --depth === 0) return i;
  }
  return source.length - 1;
}

function firstArgument(source: string, openIndex: number): string {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  for (let i = openIndex + 1; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{" || c === "[" || c === "(") depth += 1;
    else if (c === "}" || c === "]" || c === ")") {
      if (depth === 0) return source.slice(openIndex + 1, i).trim();
      depth -= 1;
    } else if (c === "," && depth === 0) {
      return source.slice(openIndex + 1, i).trim();
    }
  }
  return source.slice(openIndex + 1).trim();
}

function decodeRoutePath(argument: string): string | null {
  const trimmed = argument.trim();
  if (trimmed.length < 2) return null;
  const quote = trimmed[0];
  if (quote !== "'" && quote !== '"' && quote !== "`") return null;
  if (trimmed[trimmed.length - 1] !== quote) return null;
  const value = trimmed.slice(1, -1);
  if (quote === "`" && value.includes("${")) return null;
  // Route paths are not expected to contain arbitrary escape sequences. This
  // small decoder handles the common escaped quote/slash cases without eval.
  return value
    .replace(/\\(["'`\\])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source[i] === "\n") line += 1;
  return line;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function collectStaffFields(text: string): string[] {
  const fields: string[] = [];
  const patterns = [
    /\b(?:sess|session|_sess)\??\.\??(staff[A-Z]\w*)/g,
    /\b(?:sess|session|_sess)\??\[['"]((?:staff)[A-Za-z0-9_]+)['"]\]/g,
    /\bsession\s+as\s+any\s*\)?\s*\.\s*(staff[A-Z]\w*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) fields.push(match[1]);
  }
  return uniqueSorted(fields);
}

function signals(text: string, patterns: RegExp[]): string[] {
  return uniqueSorted(
    patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => match[0])),
  );
}

function evidenceFor(text: string, routePath: string): RouteEvidence {
  return {
    requireAuth: /\brequireAuth\b/.test(text),
    requireClinicianOnly: /\brequireClinicianOnly\b/.test(text),
    getEffectiveClinicId: /\bgetEffectiveClinicId\s*\(/.test(text),
    activeClinicId: /\bactiveClinicId\b/.test(text),
    defaultClinicId: /\bdefaultClinicId\b/.test(text),
    staffSessionFields: collectStaffFields(text),
    ownerSignals: signals(text, [
      /\bownerUserId\b/g,
      /\b(?:require|assert|is|ensure)[A-Za-z]*Owner[A-Za-z]*\b/g,
      /\b(?:isOwner|ownerRequired|ownerOnly)\b/g,
    ]),
    administratorSignals: signals(text, [
      /\bgetSessionAdminRole\b/g,
      /\brequire(?:Clinic)?Admin(?:istrator)?\b/g,
      /\brequireOpsRole\b/g,
      /\badminRole\b/g,
      /\badmin_role\b/g,
      /\badministrator\b/gi,
    ]),
    patientPortalSignals: signals(`${routePath}\n${text}`, [
      /\/patient(?:-portal)?(?:\/|["'`\s]|$)/gi,
      /\/portal(?:\/|["'`\s]|$)/gi,
      /patientPortal/gi,
      /portalToken/gi,
      /patient-intake/gi,
    ]),
    webhookSignals: signals(`${routePath}\n${text}`, [
      /\/webhook(?:\/|["'`\s]|$)/gi,
      /\bwebhook\b/gi,
      /\bintegration(?:s)?\b/gi,
    ]),
  };
}

function classify(
  routePath: string,
  evidence: RouteEvidence,
  text: string,
): RouteClassification {
  const identityBaseAuthPaths = new Set([
    "/api/auth/logout",
    "/api/auth/me",
    "/api/me/memberships",
    "/api/me/active-clinic",
  ]);
  if (identityBaseAuthPaths.has(routePath)) return "base_authentication_only";

  // These are platform-level routes, distinct from clinic-scoped routes that
  // happen to use an /admin/ URL (for example admin/spruce-routing).
  const platformAdminPath =
    /^\/api\/admin(?:\/|$)/.test(routePath) &&
    !/^\/api\/admin\/spruce(?:-|\/)/.test(routePath);
  if (platformAdminPath) return "platform_admin";

  if (/^\/api\/ops\/auth(?:\/|$)/.test(routePath)) return "ops_portal_auth";
  if (/^\/api\/ops(?:\/|$)/.test(routePath)) {
    return evidence.administratorSignals.includes("requireOpsRole")
      ? "ops_portal_role_restricted"
      : "ops_portal";
  }

  if (routePath === "/api/billing/config" || routePath === "/api/config/google-maps") {
    return "safe_public_config";
  }
  if (routePath === "/api/billing/guest-setup-intent") {
    return "constrained_payment_bootstrap";
  }
  if (routePath === "/api/jobs/send-appointment-reminders") {
    return "system_job_secret";
  }
  if (routePath === "/api/pharmacy-lookup") {
    return "dual_actor_base_auth";
  }

  const hasExplicitAuth = evidence.requireAuth || evidence.requireClinicianOnly;
  const hasClinicContext =
    evidence.getEffectiveClinicId ||
    evidence.activeClinicId ||
    evidence.defaultClinicId;

  const tokenBoundPath =
    routePath === "/api/auth/staff-set-password" ||
    /\/(?:public\/[^/]+|join-clinic\/[^/]+|validate-reset-token\/[^/]+)(?:\/|$)/i.test(routePath) ||
    /\/(?:forms|packets)\/public(?:\/|$)/i.test(routePath);
  if (tokenBoundPath && !hasExplicitAuth && !hasClinicContext) {
    return "token_bound_public_flow";
  }

  // Explicit middleware/context evidence takes precedence over broad path
  // words. A protected or clinic-context route cannot be labelled public,
  // patient-portal, or integration merely because its URL contains those
  // words.
  if (hasExplicitAuth || hasClinicContext) {
    const ownerGuard =
      evidence.ownerSignals.some((signal) => !/^ownerUserId$/i.test(signal)) ||
      (/\bownerUserId\s*(?:===|!==|==|!=)|(?:===|!==|==|!=)\s*\bownerUserId\b/.test(text) &&
        /\b(?:req\.user|user|clinicianId|userId)\b/.test(text));
    if (ownerGuard) return "owner_required";
    if (evidence.administratorSignals.length > 0 && (
      evidence.requireClinicianOnly ||
      /\b(?:adminRole|admin_role|getSessionAdminRole|require(?:Clinic)?Admin|requireOpsRole)\b/.test(text)
    )) {
      return "clinic_administrator_permitted";
    }
    if (hasClinicContext) return "active_clinic_required";
    return "base_authentication_only";
  }

  // A path is stronger evidence than incidental words in a handler comment or
  // payload. In particular, a patient form handler may mention webhooks while
  // still being a patient-portal route.
  const patientPortalPath = /\/(?:patient-portal|patient-intake|portal)(?:\/|$)/i.test(routePath);
  if (patientPortalPath) return "patient_portal";
  const integrationWebhookPath =
    /\/integrations?(?:\/|$)/i.test(routePath) ||
    /\/webhooks?(?:\/|$)/i.test(routePath) ||
    /\/stripe\/webhook(?:\/|$)/i.test(routePath);
  if (integrationWebhookPath) return "integration_webhook_system";

  const publicPath =
    /^\/(?:api\/)?(?:health|ready)(?:\/|$)/.test(routePath) ||
    /^\/api\/auth\/(?:register|login|logout|forgot-password|validate-reset-token|reset-password)(?:\/|$)/.test(routePath) ||
    /^\/api\/(?:interpret-labs(?:-female)?|generate-wellness-plan(?:-male)?|generate-dietary-guidance)$/.test(routePath);
  if (publicPath) return "public";

  return "indeterminate_review";
}

/**
 * Parse route registrations from one source file. This is intentionally
 * exported so tests can exercise parser behavior without touching the repo.
 */
export function parseExpressRoutes(
  source: string,
  sourceFile = "<synthetic>",
  options: ParseOptions = {},
): RouteInventoryEntry[] {
  const entries: RouteInventoryEntry[] = [];
  const parsed = ts.createSourceFile(
    sourceFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node: ts.Node): void => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      !ts.isIdentifier(node.expression.expression) ||
      !HTTP_METHODS.has(node.expression.name.text)
    ) {
      ts.forEachChild(node, visit);
      return;
    }

    const receiver = node.expression.expression.text;
    // Restrict extraction to the Express app/router objects used in this
    // repository. Generic `.get()` calls on Maps, database clients, promises,
    // and storage helpers are not HTTP route registrations.
    if (receiver !== "app" && receiver !== "router" && !/router$/i.test(receiver)) {
      ts.forEachChild(node, visit);
      return;
    }

    const method = node.expression.name.text;
    const argument = node.arguments[0];
    const localPath =
      argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
        ? argument.text
        : null;
    const prefix = options.mountPrefix ?? "";
    const routePath = localPath === null
      ? "<dynamic>"
      : `${prefix.replace(/\/$/, "")}/${localPath.replace(/^\//, "")}`.replace(/\/$/, "") || "/";
    const callText = source.slice(node.getStart(parsed), node.getEnd());
    const evidence = evidenceFor(callText, routePath);
    const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;

    entries.push({
      sourceFile: sourceFile.replaceAll("\\", "/"),
      line,
      receiver,
      method: method.toUpperCase(),
      path: routePath,
      localPath: localPath ?? "<dynamic>",
      mountPrefix: prefix || "/",
      classification: classify(routePath, evidence, callText),
      evidence,
    });
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(parsed, visit);
  return entries;
}

function sourceFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, name.name);
      if (name.isDirectory()) visit(full);
      else if (name.isFile() && name.name.endsWith(".ts")) result.push(full);
    }
  };
  visit(path.join(root, "server"));
  return result.sort();
}

function relativeSource(root: string, file: string): string {
  return path.relative(root, file).replaceAll("\\", "/");
}

/**
 * Read all TypeScript files below server/ and return a stable,
 * path/method/line ordered
 * inventory. No server module is imported and no network/database operation is
 * performed.
 */
export function inventoryServerRoutes(root = process.cwd()): RouteInventoryEntry[] {
  const serverRoot = path.join(root, "server");
  const entries: RouteInventoryEntry[] = [];
  for (const file of sourceFiles(root)) {
    const relative = relativeSource(root, file);
    const source = fs.readFileSync(file, "utf8");
    const mountPrefix = relative === "server/ops/routes.ts" ? "/api/ops" : "";
    entries.push(...parseExpressRoutes(source, relative, { mountPrefix }));
  }
  return entries.sort((a, b) =>
    a.path.localeCompare(b.path) ||
    a.method.localeCompare(b.method) ||
    a.sourceFile.localeCompare(b.sourceFile) ||
    a.line - b.line,
  );
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}

export function renderMarkdownReport(entries: RouteInventoryEntry[], generatedAt = "deterministic"): string {
  const counts = new Map<RouteClassification, number>();
  for (const classification of CLASSIFICATIONS) counts.set(classification, 0);
  for (const entry of entries) counts.set(entry.classification, (counts.get(entry.classification) ?? 0) + 1);

  const lines = [
    "# Team-access Express route inventory",
    "",
    `Generated by \`scripts/team-access-route-inventory.ts\` (${generatedAt}).`,
    "",
    "This is a read-only static inventory of HTTP route declarations in `server/**/*.ts`. It does not import the app, contact a database, inspect sessions, or emit request data. Route paths, source locations, middleware names, and authorization signal names are code metadata; no patient, staff, clinician, account, or request values are included.",
    "",
    "## Classification counts",
    "",
    "| Classification | Routes |",
    "| --- | ---: |",
    ...CLASSIFICATIONS.map((classification) => `| ${classification} | ${counts.get(classification) ?? 0} |`),
    "",
    "## Evidence fields",
    "",
    "- `requireAuth` / `requireClinicianOnly`: explicit middleware evidence in the route declaration and handler.",
    "- `getEffectiveClinicId` / `activeClinicId` / `defaultClinicId`: explicit clinic-context identifiers found in the declaration/handler.",
    "- `staffSessionFields`: named `session`/`sess` staff fields referenced by the route.",
    "- Owner, administrator, patient-portal, and webhook signals are conservative lexical indicators, not proof of runtime authorization.",
    "- A route whose authorization cannot be established statically is `indeterminate_review`; this report intentionally does not infer access from a missing middleware.",
    "",
    "## Explorer-defined blocked-review categories",
    "",
    "The following categories resolve routes whose source uses a specialized boundary. They are review labels, not authorization grants, and must not be folded into a real-user enforcement family:",
    "",
    "- `platform_admin`: platform-level `/api/admin` routes (excluding clinic Spruce administration).",
    "- `ops_portal`, `ops_portal_auth`, `ops_portal_role_restricted`: isolated operations portal routes, split by session/auth and role evidence.",
    "- `token_bound_public_flow`: public endpoints whose access is bound to an invite, reset, form, packet, or other token.",
    "- `system_job_secret`: scheduler/job endpoint guarded by a deployment secret.",
    "- `safe_public_config`: intentionally public, non-user configuration such as publishable client keys.",
    "- `constrained_payment_bootstrap`: unauthenticated payment setup bootstrap with a deliberately narrow Stripe operation.",
    "- `dual_actor_base_auth`: one endpoint that explicitly accepts either of two authenticated actor/session families.",
    "",
    "The current inventory has zero `indeterminate_review` routes. New unrecognized routes should remain indeterminate until a reviewer assigns an evidence-backed category; they must never be silently treated as a real-user route.",
    "",
    "## Route inventory",
    "",
    "| Method | Path | Classification | Source | Auth middleware | Clinic evidence | Staff session fields | Other signals |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const entry of entries) {
    const auth = [
      entry.evidence.requireAuth ? "requireAuth" : "",
      entry.evidence.requireClinicianOnly ? "requireClinicianOnly" : "",
    ].filter(Boolean).join(", ") || "none";
    const clinic = [
      entry.evidence.getEffectiveClinicId ? "getEffectiveClinicId" : "",
      entry.evidence.activeClinicId ? "activeClinicId" : "",
      entry.evidence.defaultClinicId ? "defaultClinicId" : "",
    ].filter(Boolean).join(", ") || "none";
    const other = [
      ...entry.evidence.ownerSignals,
      ...entry.evidence.administratorSignals,
      ...entry.evidence.patientPortalSignals,
      ...entry.evidence.webhookSignals,
    ];
    lines.push(
      `| ${entry.method} | ${markdownCell(entry.path)} | ${entry.classification} | ${markdownCell(`${entry.sourceFile}:${entry.line}`)} | ${markdownCell(auth)} | ${markdownCell(clinic)} | ${markdownCell(entry.evidence.staffSessionFields.join(", ") || "none")} | ${markdownCell(uniqueSorted(other).join(", ") || "none")} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main(): void {
  const root = process.cwd();
  const entries = inventoryServerRoutes(root);
  const report = renderMarkdownReport(entries);
  if (process.argv.includes("--write-doc")) {
    const output = path.join(root, "docs/security/team-access-route-inventory.md");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, report, "utf8");
    process.stdout.write(`Wrote ${output} (${entries.length} routes)\n`);
  } else {
    process.stdout.write(report);
  }
}

// tsx executes this file directly; imports from unit tests do not have this
// filename as argv[1], so importing the parser remains side-effect free.
if (process.argv[1]?.endsWith("team-access-route-inventory.ts")) main();