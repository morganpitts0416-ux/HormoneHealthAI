import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import session from "express-session";
import http from "node:http";
import {
  establishSyntheticValidationMarker,
  ordinaryClinicAccessEnforcementMiddleware,
  ORDINARY_CLINIC_ACCESS_ALLOWLIST,
  ordinaryClinicAccessAllowlistedRequest,
} from "../../server/access-foundation";

type Decision = "allow" | "deny" | "indeterminate";

type SyntheticSessionState = Readonly<Record<string, unknown>>;

interface ScenarioOptions {
  markRequest?: boolean;
  flagState?: "enabled" | "absent" | "disabled" | "expired" | "unreadable";
  sessionState: SyntheticSessionState;
  user?: Record<string, unknown> | null;
  expectedClinicId: number | null;
  expectedActor: "clinician" | "staff";
}

function httpRequest(
  app: express.Express,
  path: string,
  method = "GET",
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("test server did not bind"));
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request({
        host: "127.0.0.1",
        port: address.port,
        path,
        method,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      }, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { text += chunk; });
        response.on("end", () => {
          server.close();
          let parsed: any = text;
          try { parsed = JSON.parse(text); } catch { /* plain response */ }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      });
      request.on("error", (error) => { server.close(); reject(error); });
      if (payload) request.write(payload);
      request.end();
    });
  });
}

function testApp(
  decision: Decision,
  options: ScenarioOptions,
) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "ordinary-clinic-access-test",
    resave: false,
    saveUninitialized: true,
  }));
  // Simulated server authentication/session hydration. The marker is attached
  // by this harness, never derived from the HTTP request.
  app.use((req, _res, next) => {
    if (options.user === undefined) req.user = { id: 41 } as any;
    else if (options.user !== null) req.user = options.user as any;
    const sess = req.session as any;
    Object.assign(sess, options.sessionState);
    if (options.markRequest) establishSyntheticValidationMarker(req);
    next();
  });
  const middleware = ordinaryClinicAccessEnforcementMiddleware({
    readFlags: async () => {
      if (options.flagState === "unreadable") throw new Error("flag store unavailable");
      if (options.flagState === "absent") return [];
      return [{
        flagKey: "ENFORCE_ORDINARY_CLINIC_ACCESS_AUTHZ",
        enabled: options.flagState === "enabled",
        // This is the resolved-status contract returned by the production
        // flag reader: expired rows have already become enabled=false.
        expiresAt: options.flagState === "expired" ? new Date(Date.now() - 1000) : null,
        clinicId: null,
        reason: null,
        enforcement: true,
      }] as any;
    },
    resolve: async (req, clinicId) => {
      expect(clinicId).toBe(options.expectedClinicId);
      const sess = req.session as any;
      if (options.expectedActor === "staff") {
        expect(sess.staffId).toBeDefined();
        expect(sess.staffClinicianId).toBeDefined();
        expect(sess.staffClinicianClinicId).toBe(options.expectedClinicId);
        expect((req.user as any)?.id).toBeUndefined();
      } else {
        expect((req.user as any)?.id).toBeDefined();
        expect(sess.staffId).toBeUndefined();
      }
      return { decision };
    },
  });
  const auth = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  app.get("/api/preferences/defaults", auth, middleware, (req, res) => {
    res.json({ ok: true, activeClinicId: (req.session as any).activeClinicId ?? null });
  });
  return app;
}

describe("ordinary clinic access enforcement boundary", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => { process.env.NODE_ENV = "development"; });
  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("keeps the exact reviewed allowlist narrow", () => {
    expect(ORDINARY_CLINIC_ACCESS_ALLOWLIST).toEqual([
      { method: "GET", path: "/api/preferences/defaults" },
      { method: "GET", path: "/api/preferences/supplements" },
      { method: "POST", path: "/api/preferences/supplements" },
      { method: "GET", path: "/api/preferences/lab-ranges" },
      { method: "PUT", path: "/api/preferences/lab-ranges" },
      { method: "GET", path: "/api/note-templates" },
      { method: "POST", path: "/api/note-templates" },
      { method: "GET", path: "/api/note-phrases" },
      { method: "POST", path: "/api/note-phrases" },
      { method: "GET", path: "/api/appointment-types" },
      { method: "GET", path: "/api/availability/slots" },
    ]);
  });

  it("includes only the two reviewed scheduling reads and excludes clinician-owned medication data", () => {
    const request = (path: string) => {
      const req = { method: "GET", path } as express.Request;
      return ordinaryClinicAccessAllowlistedRequest(req);
    };
    expect(request("/api/appointment-types")?.path).toBe("/api/appointment-types");
    expect(request("/api/availability/slots")?.path).toBe("/api/availability/slots");
    expect(request("/api/medication-dictionary")).toBeNull();
  });

  it.each([
    ["active clinician", "allow", 200, {
      sessionState: { activeClinicId: 7 },
      expectedClinicId: 7,
      expectedActor: "clinician",
    }],
    ["active staff on a staff-permitted route", "allow", 200, {
      user: null,
      sessionState: { staffId: 301, staffClinicianId: 41, staffClinicianClinicId: 7 },
      expectedClinicId: 7,
      expectedActor: "staff",
    }],
    ["revoked clinician stale cookie", "deny", 403, {
      user: { id: 42 },
      sessionState: { activeClinicId: 7 },
      expectedClinicId: 7,
      expectedActor: "clinician",
    }],
    ["revoked staff stale cookie", "deny", 403, {
      user: null,
      sessionState: { staffId: 303, staffClinicianId: 41, staffClinicianClinicId: 7 },
      expectedClinicId: 7,
      expectedActor: "staff",
    }],
    ["missing membership", "deny", 403, {
      user: { id: 43 },
      sessionState: { activeClinicId: 7 },
      expectedClinicId: 7,
      expectedActor: "clinician",
    }],
    ["stale active clinic", "deny", 403, {
      user: { id: 41 },
      sessionState: { activeClinicId: 99 },
      expectedClinicId: 99,
      expectedActor: "clinician",
    }],
    ["stale default clinic without active context", "deny", 403, {
      user: { id: 41, defaultClinicId: 7 },
      sessionState: {},
      expectedClinicId: null,
      expectedActor: "clinician",
    }],
    ["Clinic A revoked, explicitly active Clinic B", "allow", 200, {
      user: { id: 41 },
      sessionState: { activeClinicId: 8 },
      expectedClinicId: 8,
      expectedActor: "clinician",
    }],
    ["staff/clinic mismatch", "deny", 403, {
      user: null,
      sessionState: { staffId: 302, staffClinicianId: 41, staffClinicianClinicId: 8 },
      expectedClinicId: 8,
      expectedActor: "staff",
    }],
  ] as const)("%s uses its explicit server session context", async (_name, decision, expected, options) => {
    const response = await httpRequest(testApp(decision, {
      ...options,
      markRequest: true,
      flagState: "enabled",
    }), "/api/preferences/defaults");
    expect(response.status).toBe(expected);
    if (expected === 200 && options.expectedClinicId === 8) {
      expect(response.body.activeClinicId).toBe(8);
    }
  });

  it("does not let browser headers, query/body values, or unsigned cookies alter server context", async () => {
    const response = await httpRequest(
      testApp("deny", {
        markRequest: true,
        flagState: "enabled",
        sessionState: { activeClinicId: 7 },
        expectedClinicId: 7,
        expectedActor: "clinician",
      }),
      "/api/preferences/defaults?clinicId=999",
      "GET",
      { "x-synthetic-validation": "true", cookie: "activeClinicId=999" },
      { clinicId: 999 },
    );
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: "Access denied" });
  });

  it("does not activate from browser marker-shaped values without a harness marker", async () => {
    const response = await httpRequest(
      testApp("deny", {
        flagState: "enabled",
        sessionState: { activeClinicId: 7 },
        expectedClinicId: 7,
        expectedActor: "clinician",
      }),
      "/api/preferences/defaults?clinicId=999",
      "GET",
      { "x-synthetic-validation": "true", cookie: "activeClinicId=999" },
      { clinicId: 999 },
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, activeClinicId: 7 });
  });

  it("preserves behavior when the family flag is absent, disabled, expired, or unreadable", async () => {
    for (const flagState of ["absent", "disabled", "expired", "unreadable"] as const) {
      const response = await httpRequest(
        testApp("deny", {
          markRequest: true,
          flagState,
          sessionState: { activeClinicId: 7 },
          expectedClinicId: 7,
          expectedActor: "clinician",
        }),
        "/api/preferences/defaults",
      );
      expect(response.status).toBe(200);
    }
  });

  it("keeps a legacy denial denied when the proposed decision allows", async () => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "ordinary-clinic-access-test", resave: false, saveUninitialized: true }));
    app.use((req, res, next) => {
      req.user = { id: 41 } as any;
      (req.session as any).activeClinicId = 7;
      res.locals.legacyAllow = false;
      establishSyntheticValidationMarker(req);
      next();
    });
    app.get(
      "/api/preferences/defaults",
      ordinaryClinicAccessEnforcementMiddleware({
        readFlags: async () => [{ flagKey: "ENFORCE_ORDINARY_CLINIC_ACCESS_AUTHZ", enabled: true }] as any,
        resolve: async () => ({ decision: "allow" }),
      }),
      (_req, res) => res.json({ ok: true }),
    );
    const response = await httpRequest(app, "/api/preferences/defaults");
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: "Access denied" });
  });
});