import { describe, expect, it, vi } from "vitest";
import {
  classifyClinicAccessRoute,
  classifyClinicAccessRouteMode,
  createClinicAccessShadowObserver,
  isBaseAuthClinicRoute,
  isIntegrationWebhookSystemRoute,
  isPatientPortalClinicRoute,
  isPublicClinicRoute,
  normalizeClinicAccessRoutePath,
} from "../../server/clinic-access-shadow";

const allowResolver = async (request: any) => ({
  decision: "allow" as const,
  actorType: request.actor.type,
  clinicId: request.clinicId ?? null,
  reason: "BASE_AUTHENTICATED" as const,
});

const input = (overrides: Record<string, unknown> = {}) => ({
  method: "get",
  routePath: "/api/clinics/1",
  actor: { type: "clinician", userId: 10 },
  selectedClinicId: 1,
  routeMode: "clinic" as const,
  routeKind: "ordinary" as const,
  legacyDecision: "allow" as const,
  ...overrides,
});

describe("clinic access shadow observer", () => {
  it("is disabled by default and when the flag is missing or false", async () => {
    const resolver = vi.fn(allowResolver);
    const missing = createClinicAccessShadowObserver({ resolver });
    await missing.observe(input());
    expect(resolver).not.toHaveBeenCalled();
    expect(missing.snapshot().counts.total).toBe(0);

    const disabled = createClinicAccessShadowObserver({
      featureFlag: "clinic-shadow",
      flagReader: () => false,
      resolver,
    });
    await disabled.observe(input());
    expect(resolver).not.toHaveBeenCalled();
  });

  it("contains flag-reader, resolver, and sink failures", async () => {
    const flagError = createClinicAccessShadowObserver({
      featureFlag: "clinic-shadow",
      flagReader: () => { throw new Error("flag"); },
      resolver: vi.fn(allowResolver),
    });
    await expect(flagError.observe(input())).resolves.toBeUndefined();

    const resolver = vi.fn(async () => { throw new Error("resolver"); });
    const sink = vi.fn(async () => { throw new Error("sink"); });
    const observer = createClinicAccessShadowObserver({
      enabled: true,
      resolver,
      sink,
    });
    await expect(observer.observe(input())).resolves.toBeUndefined();
    expect(observer.snapshot().counts.indeterminate).toBe(1);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("compares decisions and aggregates by the sanitised key", async () => {
    const observer = createClinicAccessShadowObserver({ enabled: true, resolver: allowResolver });
    await observer.observe(input({ legacyDecision: "deny" }));
    await observer.observe(input({ legacyDecision: "deny", method: " GET ", routePath: "/api/clinics/1/" }));
    await observer.observe(input({ legacyDecision: "allow" }));
    const snapshot = observer.getSnapshot();
    expect(snapshot.counts).toMatchObject({
      legacyDenyNewAllow: 2,
      agreement: 1,
      total: 3,
    });
    expect(snapshot.observations).toHaveLength(2);
    expect(snapshot.observations[0]).not.toHaveProperty("userId");
    expect(snapshot.observations[0]).not.toHaveProperty("body");
  });

  it("records legacy-allow/new-deny and indeterminate outcomes", async () => {
    const observer = createClinicAccessShadowObserver({
      enabled: true,
      resolver: async (request: any) => ({
        decision: (request.actor.type === "unknown" ? "indeterminate" : "deny") as const,
        actorType: request.actor.type,
        clinicId: request.clinicId ?? null,
        reason: "synthetic",
      }),
    });
    await observer.observe(input());
    await observer.observe(input({ actor: { type: "unknown" }, legacyDecision: "deny" }));
    expect(observer.snapshot().counts).toMatchObject({
      legacyAllowNewDeny: 1,
      indeterminate: 1,
    });
  });

  it("never accepts query strings or incomplete/sensitive context", async () => {
    const resolver = vi.fn(allowResolver);
    const observer = createClinicAccessShadowObserver({ enabled: true, resolver });
    await observer.observe(input({ routePath: "/api/clinics/1?patient=secret" }));
    await observer.observe(input({ method: "", actor: { type: "clinician" } }));
    await observer.observe(input({ actor: { type: "integration", integrationId: "token" } }));
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver.mock.calls[0][0].actor).toEqual({ type: "integration" });
  });

  it("classifies all supported route families", () => {
    expect(isBaseAuthClinicRoute("/api/auth/me")).toBe(true);
    expect(isBaseAuthClinicRoute("/api/active-clinic")).toBe(true);
    expect(isPatientPortalClinicRoute("/api/patient-portal/orders")).toBe(true);
    expect(isIntegrationWebhookSystemRoute("/api/integrations/spruce/webhook")).toBe(true);
    expect(isPublicClinicRoute("/api/public/labs")).toBe(true);
    expect(classifyClinicAccessRoute("/api/webhooks/inbound")).toBe("webhook");
    expect(classifyClinicAccessRoute("/api/system/health")).toBe("system");
    expect(classifyClinicAccessRoute("/api/clinics/1")).toBe("clinic");
    expect(classifyClinicAccessRouteMode("/api/logout")).toBe("base-auth-only");
    expect(normalizeClinicAccessRoutePath("/API//Clinics/1/")).toBe("/api/clinics/1");
    expect(normalizeClinicAccessRoutePath("/api/clinics/1?x=1")).toBeNull();
  });

  it("handles every actor type without retaining identity", async () => {
    const resolver = vi.fn(allowResolver);
    const observer = createClinicAccessShadowObserver({ enabled: true, resolver });
    for (const type of ["clinician", "staff", "patient_portal", "integration", "webhook", "system", "anonymous", "unknown"]) {
      await observer.observe(input({
        actor: { type, userId: 10, staffId: 20, integrationId: "secret" },
        legacyDecision: "deny",
      }));
    }
    const actors = observer.snapshot().observations.map((item) => item.actorType);
    expect(actors).toEqual(expect.arrayContaining([
      "clinician", "staff", "patient_portal", "integration", "webhook", "system", "anonymous", "unknown",
    ]));
    expect(JSON.stringify(observer.snapshot())).not.toContain("secret");
  });
});
