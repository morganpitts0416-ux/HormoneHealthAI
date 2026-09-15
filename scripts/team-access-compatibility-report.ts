/**
 * Read-only development report for the team-access compatibility rollout.
 *
 * This file intentionally owns the database adapter rather than importing the
 * application's storage singleton.  Importing this module is side-effect free:
 * a pool is created only when the exported adapter or the CLI entry point is
 * used.  The adapter has no write-capable methods and the SQL below contains
 * no DDL or data-changing statements.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, inArray, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import {
  buildTeamAccessCompatibilityReport,
  type ActiveSessionAccessSnapshot,
  type TeamAccessCompatibilityReport,
  type TeamAccessSnapshots,
} from "../server/team-access-compatibility";

export const TEAM_ACCESS_PROJECTION_ALLOWLIST = {
  users: ["id", "defaultClinicId"],
  clinicMemberships: [
    "userId",
    "clinicId",
    "isActive",
    "acceptanceStatus",
    "role",
    "clinicalRole",
    "adminRole",
    "accessScope",
  ],
  clinicianStaff: ["id", "clinicianId", "clinicId", "isActive", "role"],
  clinics: ["id", "ownerUserId", "isActive"],
  providers: ["id", "clinicId", "userId", "staffId", "isActive"],
  authorizationShadowDecisions: ["entityId", "clinicId", "currentDecision", "proposedDecision"],
  sessions: [
    "passportUserId",
    "staffId",
    "staffClinicianId",
    "activeClinicId",
    "staffClinicianClinicId",
    "count",
  ],
} as const;

export type TeamAccessProjectionName = keyof typeof TEAM_ACCESS_PROJECTION_ALLOWLIST;

export interface UserProjection {
  id: unknown;
  defaultClinicId: unknown;
}

export interface ClinicMembershipProjection {
  userId: unknown;
  clinicId: unknown;
  isActive: unknown;
  acceptanceStatus: unknown;
  role: unknown;
  clinicalRole: unknown;
  adminRole: unknown;
  accessScope?: unknown;
}

export interface ClinicianStaffProjection {
  id: unknown;
  clinicianId: unknown;
  clinicId: unknown;
  isActive: unknown;
  role: unknown;
}

export interface ClinicProjection {
  id: unknown;
  ownerUserId: unknown;
  isActive: unknown;
}

export interface ProviderProjection {
  id: unknown;
  clinicId: unknown;
  userId: unknown;
  staffId: unknown;
  isActive: unknown;
}

/** Safe projection of authorization_shadow_decisions.actor_id as entityId. */
export interface AuthorizationShadowDecisionProjection {
  entityId: unknown;
  clinicId: unknown;
  currentDecision: unknown;
  proposedDecision: unknown;
}

/** The only values selected from connect-pg-simple's session JSON. */
export interface SessionProjectionRow {
  passportUserId: unknown;
  staffId: unknown;
  staffClinicianId: unknown;
  activeClinicId: unknown;
  staffClinicianClinicId: unknown;
  count: unknown;
}

export interface DevelopmentAccessProjections {
  users: readonly UserProjection[];
  clinicMemberships: readonly ClinicMembershipProjection[];
  clinicianStaff: readonly ClinicianStaffProjection[];
  clinics: readonly ClinicProjection[];
  providers: readonly ProviderProjection[];
  authorizationShadowDecisions: readonly AuthorizationShadowDecisionProjection[];
  sessions: readonly SessionProjectionRow[];
}

const projectionKeys = new Map<TeamAccessProjectionName, ReadonlySet<string>>(
  Object.entries(TEAM_ACCESS_PROJECTION_ALLOWLIST).map(([name, keys]) => [
    name as TeamAccessProjectionName,
    new Set(keys),
  ]),
);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

function nullableInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  return safeInteger(value);
}

function assertProjectionKeys(
  projection: TeamAccessProjectionName,
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new Error(`Team-access ${projection} projection must be a plain object`);
  }
  const allowed = projectionKeys.get(projection)!;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Team-access ${projection} projection contains non-allowlisted key: ${key}`);
    }
  }
}

function assertBoolean(value: unknown, label: string): void {
  if (typeof value !== "boolean") throw new Error(`Team-access ${label} must be boolean`);
}

function assertNullableInteger(value: unknown, label: string): void {
  if (nullableInteger(value) === undefined) {
    throw new Error(`Team-access ${label} must be a safe numeric ID or null`);
  }
}

function assertStringOrNull(value: unknown, label: string): void {
  if (value !== null && value !== undefined && typeof value !== "string") {
    throw new Error(`Team-access ${label} must be a string or null`);
  }
}

/**
 * Assert that a row contains no fields outside the explicitly selected
 * projection.  This is exported so synthetic tests can prove that a future
 * adapter change cannot accidentally pass through an email, password, or
 * session payload.
 */
export function assertTeamAccessProjectionAllowed(
  projection: TeamAccessProjectionName,
  value: unknown,
): void {
  assertProjectionKeys(projection, value);
  const row = value;

  if (projection === "users") {
    assertNullableInteger(row.id, "users.id");
    assertNullableInteger(row.defaultClinicId, "users.defaultClinicId");
  } else if (projection === "clinicMemberships") {
    assertNullableInteger(row.userId, "clinicMemberships.userId");
    assertNullableInteger(row.clinicId, "clinicMemberships.clinicId");
    assertBoolean(row.isActive, "clinicMemberships.isActive");
    assertStringOrNull(row.acceptanceStatus, "clinicMemberships.acceptanceStatus");
    assertStringOrNull(row.role, "clinicMemberships.role");
    assertStringOrNull(row.clinicalRole, "clinicMemberships.clinicalRole");
    assertStringOrNull(row.adminRole, "clinicMemberships.adminRole");
    assertStringOrNull(row.accessScope, "clinicMemberships.accessScope");
  } else if (projection === "clinicianStaff") {
    assertNullableInteger(row.id, "clinicianStaff.id");
    assertNullableInteger(row.clinicianId, "clinicianStaff.clinicianId");
    assertNullableInteger(row.clinicId, "clinicianStaff.clinicId");
    assertBoolean(row.isActive, "clinicianStaff.isActive");
    assertStringOrNull(row.role, "clinicianStaff.role");
  } else if (projection === "clinics") {
    assertNullableInteger(row.id, "clinics.id");
    assertNullableInteger(row.ownerUserId, "clinics.ownerUserId");
    assertBoolean(row.isActive, "clinics.isActive");
  } else if (projection === "providers") {
    assertNullableInteger(row.id, "providers.id");
    assertNullableInteger(row.clinicId, "providers.clinicId");
    assertNullableInteger(row.userId, "providers.userId");
    assertNullableInteger(row.staffId, "providers.staffId");
    assertBoolean(row.isActive, "providers.isActive");
  } else if (projection === "authorizationShadowDecisions") {
    assertNullableInteger(row.entityId, "authorizationShadowDecisions.entityId");
    assertNullableInteger(row.clinicId, "authorizationShadowDecisions.clinicId");
    assertStringOrNull(row.currentDecision, "authorizationShadowDecisions.currentDecision");
    assertStringOrNull(row.proposedDecision, "authorizationShadowDecisions.proposedDecision");
  } else {
    for (const key of TEAM_ACCESS_PROJECTION_ALLOWLIST.sessions) {
      if (key === "count") {
        assertNullableInteger(row[key], "sessions.count");
      } else {
        assertNullableInteger(row[key], `sessions.${key}`);
      }
    }
  }
}

const PROHIBITED_KEY =
  /(?:^|_)(?:email|first|last|full|display|patient|password|passwd|token|secret|sid|sess|raw|phi|diagnosis|medication|lab|encounter|soap|request|session)(?:_|$)|(?:first|last|display)name|(?:session|request)(?:id|identifier|key|token)/i;
const PROHIBITED_VALUE =
  /(?:@[\w.-]+\.[a-z]{2,}|password|passwd|bearer|token|secret|raw\s*sess|session\s*(?:id|identifier)|request\s*(?:id|identifier)|\b(?:phi|diagnosis|medication|patient|lab result|encounter|soap note)\b|clinical\s+(?:content|data|note|record|history|text|information))/i;

/**
 * Recursively assert that a value is safe to serialize as the report.  The
 * report is intentionally a numeric/reason-code artifact, not a generic
 * object serializer.  Unknown sensitive keys and sensitive-looking string
 * values fail closed instead of being silently redacted.
 */
export function assertSanitizedTeamAccessOutput(value: unknown): void {
  const seen = new Set<object>();
  const visit = (current: unknown, pathName: string): void => {
    if (typeof current === "string") {
      if (PROHIBITED_VALUE.test(current)) {
        throw new Error(`Prohibited team-access output value at ${pathName}`);
      }
      return;
    }
    if (
      current === null ||
      typeof current === "number" ||
      typeof current === "boolean"
    ) {
      return;
    }
    if (typeof current === "bigint" || typeof current === "function" || typeof current === "symbol") {
      throw new Error(`Non-JSON team-access output value at ${pathName}`);
    }
    if (typeof current !== "object") {
      throw new Error(`Unsupported team-access output value at ${pathName}`);
    }
    if (seen.has(current)) throw new Error(`Circular team-access output at ${pathName}`);
    seen.add(current);
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${pathName}[${index}]`));
    } else {
      for (const [key, item] of Object.entries(current)) {
        if (PROHIBITED_KEY.test(key)) {
          throw new Error(`Prohibited team-access output key at ${pathName}.${key}`);
        }
        visit(item, `${pathName}.${key}`);
      }
    }
    seen.delete(current);
  };
  visit(value, "$");
}

/** Alias kept intentionally descriptive for callers writing security tests. */
export const assertTeamAccessOutputSanitized = assertSanitizedTeamAccessOutput;

function normalizedId(value: unknown): number | null {
  const result = nullableInteger(value);
  return result === undefined ? null : result;
}

function normalizedBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizedString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Collapse session rows by the values that are safe to report.  Session IDs
 * and the raw JSON are not accepted by this function and therefore cannot
 * influence either the grouping key or its output.
 */
export function aggregateTeamAccessSessions(
  rows: readonly SessionProjectionRow[],
): readonly SessionProjectionRow[] {
  const grouped = new Map<string, SessionProjectionRow>();
  for (const row of rows) {
    assertTeamAccessProjectionAllowed("sessions", row);
    const normalized = {
      passportUserId: normalizedId(row.passportUserId),
      staffId: normalizedId(row.staffId),
      staffClinicianId: normalizedId(row.staffClinicianId),
      activeClinicId: normalizedId(row.activeClinicId),
      staffClinicianClinicId: normalizedId(row.staffClinicianClinicId),
      count: normalizedId(row.count) ?? 0,
    };
    if (normalized.count <= 0) continue;
    if (normalized.passportUserId === null && normalized.staffId === null) continue;
    const key = JSON.stringify([
      normalized.passportUserId,
      normalized.staffId,
      normalized.staffClinicianId,
      normalized.activeClinicId,
      normalized.staffClinicianClinicId,
    ]);
    const previous = grouped.get(key);
    if (previous) {
      previous.count = (previous.count as number) + normalized.count;
    } else {
      grouped.set(key, normalized);
    }
  }
  return Array.from(grouped.values()).map((row) => ({ ...row }));
}

function repeatSession(snapshot: ActiveSessionAccessSnapshot, count: number): ActiveSessionAccessSnapshot[] {
  // The pure report intentionally accepts one session observation at a time.
  // Expanding only the already aggregated safe count preserves its duplicate
  // collapsing semantics without passing raw session records downstream.
  return Array.from({ length: count }, () => ({ ...snapshot }));
}

/**
 * Convert strictly allowlisted database rows into the small snapshot accepted
 * by the pure report.  Every output row is freshly allocated, so callers can
 * prove this helper does not mutate DB results.
 */
export function buildTeamAccessSnapshot(
  projections: DevelopmentAccessProjections,
): TeamAccessSnapshots {
  const users = projections.users.map((row) => {
    assertTeamAccessProjectionAllowed("users", row);
    return { id: normalizedId(row.id) ?? 0, defaultClinicId: normalizedId(row.defaultClinicId) };
  });
  const clinicMemberships = projections.clinicMemberships.map((row) => {
    assertTeamAccessProjectionAllowed("clinicMemberships", row);
    return {
      userId: normalizedId(row.userId) ?? 0,
      clinicId: normalizedId(row.clinicId) ?? 0,
      isActive: normalizedBoolean(row.isActive),
      acceptanceStatus: normalizedString(row.acceptanceStatus),
      role: normalizedString(row.role),
      clinicalRole: normalizedString(row.clinicalRole),
      adminRole: normalizedString(row.adminRole),
    };
  });
  const clinicianStaff = projections.clinicianStaff.map((row) => {
    assertTeamAccessProjectionAllowed("clinicianStaff", row);
    return {
      id: normalizedId(row.id) ?? 0,
      clinicianId: normalizedId(row.clinicianId) ?? 0,
      clinicId: normalizedId(row.clinicId),
      isActive: normalizedBoolean(row.isActive),
      role: normalizedString(row.role),
    };
  });
  const clinics = projections.clinics.map((row) => {
    assertTeamAccessProjectionAllowed("clinics", row);
    return {
      id: normalizedId(row.id) ?? 0,
      ownerUserId: normalizedId(row.ownerUserId),
      isActive: normalizedBoolean(row.isActive),
    };
  });
  const providers = projections.providers.map((row) => {
    assertTeamAccessProjectionAllowed("providers", row);
    return {
      id: normalizedId(row.id) ?? 0,
      clinicId: normalizedId(row.clinicId),
      userId: normalizedId(row.userId),
      staffId: normalizedId(row.staffId),
      isActive: normalizedBoolean(row.isActive),
    };
  });
  const shadowDecisions = projections.authorizationShadowDecisions.map((row) => {
    assertTeamAccessProjectionAllowed("authorizationShadowDecisions", row);
    return {
      ...(normalizedId(row.entityId) !== null ? { entityId: normalizedId(row.entityId)! } : {}),
      ...(normalizedId(row.clinicId) !== null ? { clinicId: normalizedId(row.clinicId)! } : {}),
      currentDecision: normalizedString(row.currentDecision),
      proposedDecision: normalizedString(row.proposedDecision),
    };
  });

  const activeSessions = aggregateTeamAccessSessions(projections.sessions).flatMap((row) => {
    const count = row.count as number;
    const staffId = normalizedId(row.staffId);
    const staffClinicianId = normalizedId(row.staffClinicianId);
    const staffClinicId = normalizedId(row.staffClinicianClinicId);
    if (staffId !== null) {
      return repeatSession(
        {
          actorType: "staff",
          staffId,
          ...(staffClinicianId !== null ? { staffClinicianId } : {}),
          ...(staffClinicId !== null ? { staffClinicId } : {}),
        },
        count,
      );
    }
    const clinicianId = normalizedId(row.passportUserId);
    const activeClinicId = normalizedId(row.activeClinicId);
    if (clinicianId === null || activeClinicId === null) return [];
    return repeatSession({ actorType: "clinician", clinicianId, activeClinicId }, count);
  });

  return {
    users,
    memberships: clinicMemberships,
    staff: clinicianStaff,
    clinics,
    providers,
    shadowDecisions,
    activeSessions,
  };
}

/** Alias for synthetic validators and consumers that prefer "from rows". */
export const buildTeamAccessSnapshotFromProjections = buildTeamAccessSnapshot;

export const READ_ONLY_TEAM_ACCESS_SELECTS = {
  users: ["id", "defaultClinicId"],
  clinicMemberships: [
    "userId",
    "clinicId",
    "isActive",
    "acceptanceStatus",
    "role",
    "clinicalRole",
    "adminRole",
    "accessScope",
  ],
  clinicianStaff: ["id", "clinicianId", "clinicId", "isActive", "role"],
  clinics: ["id", "ownerUserId", "isActive"],
  providers: ["id", "clinicId", "userId", "staffId", "isActive"],
  authorizationShadowDecisions: ["entityId", "clinicId", "currentDecision", "proposedDecision"],
} as const;

const ACTIVE_SESSION_SQL = sql`
  WITH projected_sessions AS (
    SELECT
      CASE
        WHEN (sess -> 'passport' ->> 'user') ~ '^[0-9]+$'
        THEN (sess -> 'passport' ->> 'user')::bigint
        ELSE NULL
      END AS "passportUserId",
      CASE
        WHEN (sess ->> 'staffId') ~ '^[0-9]+$'
        THEN (sess ->> 'staffId')::bigint
        ELSE NULL
      END AS "staffId",
      CASE
        WHEN (sess ->> 'staffClinicianId') ~ '^[0-9]+$'
        THEN (sess ->> 'staffClinicianId')::bigint
        ELSE NULL
      END AS "staffClinicianId",
      CASE
        WHEN (sess ->> 'activeClinicId') ~ '^[0-9]+$'
        THEN (sess ->> 'activeClinicId')::bigint
        ELSE NULL
      END AS "activeClinicId",
      CASE
        WHEN (sess ->> 'staffClinicianClinicId') ~ '^[0-9]+$'
        THEN (sess ->> 'staffClinicianClinicId')::bigint
        ELSE NULL
      END AS "staffClinicianClinicId"
    FROM "session"
    WHERE expire > CURRENT_TIMESTAMP
  )
  SELECT
    "passportUserId",
    "staffId",
    "staffClinicianId",
    "activeClinicId",
    "staffClinicianClinicId",
    COUNT(*)::bigint AS "count"
  FROM projected_sessions
  WHERE "passportUserId" IS NOT NULL OR "staffId" IS NOT NULL
  GROUP BY
    "passportUserId",
    "staffId",
    "staffClinicianId",
    "activeClinicId",
    "staffClinicianClinicId"
`;

interface ReadOnlyQueryDb {
  select: (...args: any[]) => any;
  execute: (query: unknown) => Promise<{ rows: readonly Record<string, unknown>[] }>;
}

export interface ReadOnlyTeamAccessAdapter {
  getSnapshots(): Promise<TeamAccessSnapshots>;
  report(): Promise<TeamAccessCompatibilityReport>;
  close(): Promise<void>;
}

export interface ReadOnlyTeamAccessAdapterOptions {
  connectionString?: string;
  /** Injection point for synthetic tests; no writes are needed or supported. */
  db?: ReadOnlyQueryDb;
  pool?: Pool;
}

export function createReadOnlyDevelopmentDbAdapter(
  options: ReadOnlyTeamAccessAdapterOptions = {},
): ReadOnlyTeamAccessAdapter {
  const ownsPool = !options.pool && !options.db;
  const pool = options.pool ?? (options.db ? undefined : new Pool({
    connectionString: options.connectionString ?? process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10_000,
  }));
  const db = options.db ?? (drizzle(pool!) as unknown as ReadOnlyQueryDb);

  return {
    async getSnapshots() {
      const [
        users,
        clinicMemberships,
        clinicianStaff,
        clinics,
        providers,
        authorizationShadowDecisions,
        sessionResult,
      ] =
        await Promise.all([
          db.select({
            id: schema.users.id,
            defaultClinicId: schema.users.defaultClinicId,
          }).from(schema.users),
          db.select({
            userId: schema.clinicMemberships.userId,
            clinicId: schema.clinicMemberships.clinicId,
            isActive: schema.clinicMemberships.isActive,
            acceptanceStatus: schema.clinicMemberships.acceptanceStatus,
            role: schema.clinicMemberships.role,
            clinicalRole: schema.clinicMemberships.clinicalRole,
            adminRole: schema.clinicMemberships.adminRole,
            accessScope: schema.clinicMemberships.accessScope,
          }).from(schema.clinicMemberships),
          db.select({
            id: schema.clinicianStaff.id,
            clinicianId: schema.clinicianStaff.clinicianId,
            clinicId: schema.clinicianStaff.clinicId,
            isActive: schema.clinicianStaff.isActive,
            role: schema.clinicianStaff.role,
          }).from(schema.clinicianStaff),
          db.select({
            id: schema.clinics.id,
            ownerUserId: schema.clinics.ownerUserId,
            isActive: schema.clinics.isActive,
          }).from(schema.clinics),
          db.select({
            id: schema.providers.id,
            clinicId: schema.providers.clinicId,
            userId: schema.providers.userId,
            staffId: schema.providers.staffId,
            isActive: schema.providers.isActive,
          }).from(schema.providers),
          db.select({
            entityId: schema.authorizationShadowDecisions.actorId,
            clinicId: schema.authorizationShadowDecisions.clinicId,
            currentDecision: schema.authorizationShadowDecisions.currentDecision,
            proposedDecision: schema.authorizationShadowDecisions.proposedDecision,
          })
            .from(schema.authorizationShadowDecisions)
            .where(and(
              inArray(schema.authorizationShadowDecisions.actorType, ["clinician", "staff"]),
              inArray(schema.authorizationShadowDecisions.policyKey, [
                "clinic_membership",
                "staff_membership",
                "tenant_resource_scope",
              ]),
            )),
          db.execute(ACTIVE_SESSION_SQL),
        ]);

      return buildTeamAccessSnapshot({
        users,
        clinicMemberships,
        clinicianStaff,
        clinics,
        providers,
        authorizationShadowDecisions,
        sessions: sessionResult.rows,
      });
    },
    async report() {
      const report = buildTeamAccessCompatibilityReport(await this.getSnapshots());
      assertSanitizedTeamAccessOutput(report);
      return report;
    },
    async close() {
      if (ownsPool && pool) await pool.end();
    },
  };
}

export async function runTeamAccessCompatibilityReport(): Promise<TeamAccessCompatibilityReport> {
  const adapter = createReadOnlyDevelopmentDbAdapter();
  try {
    const report = await adapter.report();
    assertSanitizedTeamAccessOutput(report);
    return report;
  } finally {
    await adapter.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  runTeamAccessCompatibilityReport()
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    })
    .catch(() => {
      process.exitCode = 1;
    });
}