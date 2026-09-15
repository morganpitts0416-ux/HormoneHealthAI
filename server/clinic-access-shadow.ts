/**
 * Failure-contained, non-enforcing clinic access observation.
 *
 * This module deliberately accepts a small, sanitised projection of a route.
 * It does not accept an Express request (or any request-like object), and it
 * never retains the actor's identity.  The only state retained by an
 * observer is a count keyed by route and decision reason.
 */

import {
  compareShadowDecision,
  type ShadowComparisonReason,
} from "./team-access-compatibility";
import {
  combineLegacyAndProposedDecision,
  type ClinicAccessActor,
  type ClinicAccessDecision,
  type ClinicAccessRequest,
  type ClinicAccessResult,
  type ClinicActorType,
  type ClinicRouteMode,
} from "./clinic-access-resolver";

export { combineLegacyAndProposedDecision };

export type ClinicShadowRouteClass =
  | "base-auth-only"
  | "patient-portal"
  | "integration"
  | "webhook"
  | "system"
  | "public"
  | "clinic";

export type ClinicShadowRouteKind = "ordinary" | "download" | "job" | "chart-review";

export interface ClinicAccessShadowRouteClassification {
  readonly classification: ClinicShadowRouteClass;
  readonly mode: ClinicRouteMode;
  readonly kind: ClinicShadowRouteKind;
}

const ACTOR_TYPES = new Set<ClinicActorType>([
  "clinician",
  "staff",
  "patient_portal",
  "integration",
  "webhook",
  "system",
  "anonymous",
  "unknown",
]);

const ROUTE_KINDS = new Set<ClinicShadowRouteKind>([
  "ordinary",
  "download",
  "job",
  "chart-review",
]);

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Route paths are deliberately not parsed as URLs.  A route path is not
 * allowed to contain a query, fragment, authority, whitespace, or control
 * character.  This also makes it impossible to accidentally retain a query
 * string in an aggregate key.
 */
export function normalizeClinicAccessRoutePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !path ||
    !path.startsWith("/") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f\s]/.test(path) ||
    /%(?:3f|23|00|09|0a|0d)/i.test(path) ||
    path.includes("://")
  ) {
    return null;
  }
  const collapsed = path.replace(/\/{2,}/g, "/");
  const withoutTrailingSlash = collapsed.length > 1
    ? collapsed.replace(/\/+$/, "")
    : collapsed;
  return withoutTrailingSlash.toLowerCase();
}

export function normalizeClinicAccessMethod(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const method = value.trim().toUpperCase();
  return /^[A-Z]+$/.test(method) && method.length <= 16 ? method : null;
}

function pathIs(path: string, pattern: RegExp): boolean {
  return pattern.test(path);
}

export function isBaseAuthClinicRoute(value: unknown): boolean {
  const path = normalizeClinicAccessRoutePath(value);
  return !!path && pathIs(
    path,
    /(?:^|\/)(?:logout|auth\/me|memberships|active-clinic)(?:\/|$)/,
  );
}

export function isPatientPortalClinicRoute(value: unknown): boolean {
  const path = normalizeClinicAccessRoutePath(value);
  return !!path && pathIs(path, /(?:^|\/)(?:patient-portal|patient_portal|portal)(?:\/|$)/);
}

export function isIntegrationWebhookSystemRoute(value: unknown): boolean {
  const path = normalizeClinicAccessRoutePath(value);
  return !!path && pathIs(
    path,
    /(?:^|\/)(?:integrations?|webhooks?|system)(?:\/|$)/,
  );
}

export function isPublicClinicRoute(value: unknown): boolean {
  const path = normalizeClinicAccessRoutePath(value);
  return !!path && pathIs(
    path,
    /(?:^|\/)(?:public|health|healthz|readyz|login|register)(?:\/|$)/,
  );
}

/**
 * Classify only from a normalised route path.  Ordering is intentional:
 * authentication endpoints win over broad integration/public patterns.
 */
export function classifyClinicAccessRoute(
  value: unknown,
  actorType?: ClinicActorType,
): ClinicShadowRouteClass {
  const path = normalizeClinicAccessRoutePath(value);
  if (!path) return "clinic";
  if (isBaseAuthClinicRoute(path)) return "base-auth-only";
  if (isPatientPortalClinicRoute(path) || actorType === "patient_portal") return "patient-portal";
  if (pathIs(path, /(?:^|\/)webhooks?(?:\/|$)/) || actorType === "webhook") return "webhook";
  if (pathIs(path, /(?:^|\/)integrations?(?:\/|$)/) || actorType === "integration") return "integration";
  if (pathIs(path, /(?:^|\/)system(?:\/|$)/) || actorType === "system") return "system";
  if (isPublicClinicRoute(path)) return "public";
  return "clinic";
}

export function clinicAccessRouteClassification(
  value: unknown,
  actorType?: ClinicActorType,
): ClinicAccessShadowRouteClassification {
  const classification = classifyClinicAccessRoute(value, actorType);
  const mode: ClinicRouteMode = classification === "base-auth-only"
    ? "base-auth-only"
    : classification === "public"
      ? "public"
      : "clinic";
  return {
    classification,
    mode,
    kind: "ordinary",
  };
}

export const classifyClinicRoute = classifyClinicAccessRoute;
export const classifyClinicAccessRouteMode = (
  value: unknown,
  actorType?: ClinicActorType,
): ClinicRouteMode => clinicAccessRouteClassification(value, actorType).mode;

type SafeLegacyDecision = "allow" | "deny";

/**
 * This is intentionally not a request type.  In particular, there is no
 * `headers`, `body`, `query`, session, credential, or free-form actor field.
 */
export interface ClinicAccessShadowInput {
  readonly method: string;
  readonly routePath?: string;
  readonly path?: string;
  readonly actor: ClinicAccessActor | { readonly type: string };
  readonly selectedClinicId?: number | null;
  readonly selectedClinic?: number | null;
  /** Aliases are useful to adapters, but only one explicit value is used. */
  readonly clinicId?: number | null;
  readonly routeMode?: ClinicRouteMode | ClinicShadowRouteClass;
  readonly mode?: ClinicRouteMode | ClinicShadowRouteClass;
  readonly route?: {
    readonly mode?: ClinicRouteMode | ClinicShadowRouteClass;
    readonly kind?: ClinicShadowRouteKind;
  };
  readonly routeKind?: ClinicShadowRouteKind;
  readonly kind?: ClinicShadowRouteKind;
  readonly legacyDecision?: SafeLegacyDecision;
  readonly legacy?: SafeLegacyDecision;
  readonly legacyAllow?: boolean;
}

export interface ClinicAccessShadowObservation {
  readonly method: string;
  readonly routePath: string;
  readonly actorType: ClinicActorType;
  readonly clinicId: number | null;
  readonly legacyDecision: SafeLegacyDecision;
  readonly proposedDecision: ClinicAccessDecision;
  readonly reason: ShadowComparisonReason;
  readonly count: number;
}

export interface ClinicAccessShadowCounts {
  readonly legacyAllowNewDeny: number;
  readonly legacyDenyNewAllow: number;
  readonly indeterminate: number;
  readonly agreement: number;
  readonly total: number;
}

export interface ClinicAccessShadowSnapshot {
  readonly observations: readonly ClinicAccessShadowObservation[];
  readonly counts: ClinicAccessShadowCounts;
}

export type ClinicAccessShadowFlagReader =
  (flagName: string) => boolean | Promise<boolean>;

export type ClinicAccessShadowResolver = {
  resolve: (
    request: Omit<ClinicAccessRequest, "evidence">,
  ) => ClinicAccessResult | Promise<ClinicAccessResult>;
} | ((
  request: Omit<ClinicAccessRequest, "evidence">,
) => ClinicAccessResult | Promise<ClinicAccessResult>);

export type ClinicAccessShadowSink =
  (observation: ClinicAccessShadowObservation) => void | Promise<void>;

export interface ClinicAccessShadowObserverOptions {
  readonly featureFlag?: string | boolean;
  readonly flag?: string | boolean;
  readonly flagReader?: ClinicAccessShadowFlagReader;
  readonly readFeatureFlag?: ClinicAccessShadowFlagReader;
  readonly featureFlagReader?: ClinicAccessShadowFlagReader;
  readonly resolver?: ClinicAccessShadowResolver;
  readonly sink?: ClinicAccessShadowSink;
  readonly record?: ClinicAccessShadowSink;
  /**
   * A direct opt-in is useful for isolated callers.  It is still disabled by
   * default and is ignored when a named flag is supplied without a reader.
   */
  readonly enabled?: boolean;
}

function safeActor(
  actor: ClinicAccessShadowInput["actor"],
): { actor: ClinicAccessActor; actorType: ClinicActorType } {
  const rawType = (actor as { type?: unknown } | null | undefined)?.type;
  const actorType: ClinicActorType = typeof rawType === "string" && ACTOR_TYPES.has(rawType as ClinicActorType)
    ? rawType as ClinicActorType
    : "unknown";

  // Only numeric entity IDs needed by the resolver are copied.  String
  // service identifiers are deliberately not accepted: they could be tokens.
  if (actorType === "clinician") {
    const source = actor as { userId?: unknown; authenticated?: unknown };
    return {
      actor: {
        type: "clinician",
        ...(positiveId(source.userId) ? { userId: source.userId } : {}),
        ...(typeof source.authenticated === "boolean" ? { authenticated: source.authenticated } : {}),
      } as ClinicAccessActor,
      actorType,
    };
  }
  if (actorType === "staff") {
    const source = actor as { staffId?: unknown; clinicianId?: unknown; authenticated?: unknown };
    return {
      actor: {
        type: "staff",
        ...(positiveId(source.staffId) ? { staffId: source.staffId } : {}),
        ...(positiveId(source.clinicianId) ? { clinicianId: source.clinicianId } : {}),
        ...(typeof source.authenticated === "boolean" ? { authenticated: source.authenticated } : {}),
      } as ClinicAccessActor,
      actorType,
    };
  }
  if (actorType === "anonymous") return { actor: { type: "anonymous" }, actorType };
  // These actors intentionally carry no identity into the resolver.
  const authenticated = (actor as { authenticated?: unknown }).authenticated;
  return {
    actor: {
      type: actorType,
      ...(typeof authenticated === "boolean" ? { authenticated } : {}),
    } as ClinicAccessActor,
    actorType,
  };
}

function safeRouteMode(
  input: ClinicAccessShadowInput,
  classification: ClinicShadowRouteClass,
): ClinicRouteMode {
  const supplied = input.routeMode ?? input.mode ?? input.route?.mode;
  if (supplied === "base-auth-only" || supplied === "public" || supplied === "clinic") {
    return supplied;
  }
  return classification === "base-auth-only"
    ? "base-auth-only"
    : classification === "public"
      ? "public"
      : "clinic";
}

function safeRouteKind(input: ClinicAccessShadowInput): ClinicShadowRouteKind {
  const kind = input.routeKind ?? input.kind ?? input.route?.kind;
  return kind && ROUTE_KINDS.has(kind) ? kind : "ordinary";
}

function freezeObservation(
  observation: ClinicAccessShadowObservation,
): ClinicAccessShadowObservation {
  return Object.freeze(observation);
}

function freezeSnapshot(
  observations: readonly ClinicAccessShadowObservation[],
  counts: ClinicAccessShadowCounts,
): ClinicAccessShadowSnapshot {
  return Object.freeze({
    observations: Object.freeze(observations.map((observation) => Object.freeze({ ...observation }))),
    counts: Object.freeze({ ...counts }),
  });
}

function resolverFunction(
  resolver: ClinicAccessShadowResolver | undefined,
): ((request: Omit<ClinicAccessRequest, "evidence">) => ClinicAccessResult | Promise<ClinicAccessResult>) | null {
  if (!resolver) return null;
  return typeof resolver === "function" ? resolver : resolver.resolve;
}

export interface ClinicAccessShadowObserver {
  readonly observe: (input: ClinicAccessShadowInput) => Promise<void>;
  readonly record: (input: ClinicAccessShadowInput) => Promise<void>;
  readonly snapshot: () => ClinicAccessShadowSnapshot;
  readonly getSnapshot: () => ClinicAccessShadowSnapshot;
}

/**
 * Create a disabled-by-default observer.  Every dependency boundary is
 * caught independently: a flag reader, resolver, comparator, or sink can
 * fail without affecting the route which called this observer.
 */
export function createClinicAccessShadowObserver(
  options: ClinicAccessShadowObserverOptions = {},
): ClinicAccessShadowObserver {
  const configuredFlag = options.featureFlag ?? options.flag;
  const flagName = typeof configuredFlag === "string" ? configuredFlag.trim() : undefined;
  const flagReader = options.flagReader ?? options.readFeatureFlag ?? options.featureFlagReader;
  const resolver = resolverFunction(options.resolver);
  const sink = options.sink ?? options.record;
  const aggregate = new Map<string, ClinicAccessShadowObservation>();

  const enabled = async (): Promise<boolean> => {
    if (configuredFlag === true) return true;
    if (configuredFlag === false) return false;
    if (flagName !== undefined) {
      if (!flagName || !flagReader) return false;
      try {
        return (await flagReader(flagName)) === true;
      } catch {
        return false;
      }
    }
    if (options.enabled !== true) return false;
    return true;
  };

  const snapshot = (): ClinicAccessShadowSnapshot => {
    const observations = Array.from(aggregate.values()).sort((left, right) =>
      JSON.stringify([
        left.method,
        left.routePath,
        left.actorType,
        left.clinicId,
        left.legacyDecision,
        left.proposedDecision,
        left.reason,
      ]).localeCompare(JSON.stringify([
        right.method,
        right.routePath,
        right.actorType,
        right.clinicId,
        right.legacyDecision,
        right.proposedDecision,
        right.reason,
      ])),
    );
    const counts: ClinicAccessShadowCounts = {
      legacyAllowNewDeny: observations
        .filter((item) => item.reason === "LEGACY_ALLOW_NEW_DENY")
        .reduce((sum, item) => sum + item.count, 0),
      legacyDenyNewAllow: observations
        .filter((item) => item.reason === "LEGACY_DENY_NEW_ALLOW")
        .reduce((sum, item) => sum + item.count, 0),
      indeterminate: observations
        .filter((item) => item.proposedDecision === "indeterminate")
        .reduce((sum, item) => sum + item.count, 0),
      agreement: observations
        .filter((item) => item.reason === "SHADOW_AGREEMENT_ALLOW" || item.reason === "SHADOW_AGREEMENT_DENY")
        .reduce((sum, item) => sum + item.count, 0),
      total: observations.reduce((sum, item) => sum + item.count, 0),
    };
    return freezeSnapshot(observations, counts);
  };

  const observe = async (input: ClinicAccessShadowInput): Promise<void> => {
    try {
      if (!(await enabled()) || !resolver || !input || typeof input !== "object") return;
      const method = normalizeClinicAccessMethod(input.method);
      const routePath = normalizeClinicAccessRoutePath(input.routePath ?? input.path);
      if (!method || !routePath) return;
      if (
        input.routePath !== undefined &&
        input.path !== undefined &&
        normalizeClinicAccessRoutePath(input.routePath) !== normalizeClinicAccessRoutePath(input.path)
      ) return;
      const legacyDecision = input.legacyDecision
        ?? input.legacy
        ?? (input.legacyAllow === true ? "allow" : input.legacyAllow === false ? "deny" : undefined);
      if (legacyDecision !== "allow" && legacyDecision !== "deny") return;

      const { actor, actorType } = safeActor(input.actor);
      const classification = classifyClinicAccessRoute(routePath, actorType);
      const explicitModes = [input.routeMode, input.mode, input.route?.mode]
        .filter((value): value is ClinicRouteMode | ClinicShadowRouteClass => value !== undefined);
      if (explicitModes.some((value) =>
        !["base-auth-only", "public", "clinic", "patient-portal", "integration", "webhook", "system"].includes(value)
      )) return;
      if (new Set(explicitModes).size > 1) return;
      const explicitKinds = [input.routeKind, input.kind, input.route?.kind]
        .filter((value): value is ClinicShadowRouteKind => value !== undefined);
      if (explicitKinds.some((value) => !ROUTE_KINDS.has(value))) return;
      if (new Set(explicitKinds).size > 1) return;
      const mode = safeRouteMode(input, classification);
      const kind = safeRouteKind(input);
      const suppliedClinic = input.selectedClinicId !== undefined
        ? input.selectedClinicId
        : input.selectedClinic !== undefined
          ? input.selectedClinic
          : input.clinicId;
      if (
        input.selectedClinicId !== undefined &&
        input.selectedClinic !== undefined &&
        input.selectedClinicId !== input.selectedClinic
      ) return;
      if (
        input.selectedClinicId !== undefined &&
        input.clinicId !== undefined &&
        input.selectedClinicId !== input.clinicId
      ) return;
      if (
        input.selectedClinic !== undefined &&
        input.clinicId !== undefined &&
        input.selectedClinic !== input.clinicId
      ) return;
      if (suppliedClinic !== undefined && suppliedClinic !== null && !positiveId(suppliedClinic)) return;
      const clinicId = suppliedClinic === undefined || suppliedClinic === null ? null : suppliedClinic;

      const request: Omit<ClinicAccessRequest, "evidence"> = {
        actor,
        ...(clinicId === null ? {} : { clinicId }),
        route: { mode, kind },
      };
      let result: ClinicAccessResult;
      try {
        result = await resolver(request);
      } catch {
        result = {
          decision: "indeterminate",
          actorType,
          clinicId,
          reason: "EVIDENCE_UNAVAILABLE",
        };
      }
      const proposedDecision: ClinicAccessDecision =
        result?.decision === "allow" || result?.decision === "deny"
          ? result.decision
          : "indeterminate";

      let reason: ShadowComparisonReason;
      try {
        reason = compareShadowDecision({
          legacyDecision,
          newDecision: proposedDecision,
        });
      } catch {
        reason = "INDETERMINATE_SHADOW_DECISION";
      }
      const key = JSON.stringify([
        method,
        routePath,
        actorType,
        clinicId,
        legacyDecision,
        proposedDecision,
        reason,
      ]);
      const previous = aggregate.get(key);
      const observation = freezeObservation({
        method,
        routePath,
        actorType,
        clinicId,
        legacyDecision,
        proposedDecision,
        reason,
        count: (previous?.count ?? 0) + 1,
      });
      aggregate.set(key, observation);
      if (sink) {
        try {
          await sink(observation);
        } catch {
          // Recording is advisory and must never affect the route.
        }
      }
    } catch {
      // Sanitisation, classification, resolver, comparison, and recording
      // are all shadow-only.  No observer failure may escape to a route.
    }
  };

  return { observe, record: observe, snapshot, getSnapshot: snapshot };
}

export const createClinicAccessShadow = createClinicAccessShadowObserver;
