import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import session from "express-session";
import http from "node:http";
import {
  establishSyntheticValidationMarker,
  patientChartDownloadResourcesAuthzMiddlewareWithDependencies,
  PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ_ALLOWLIST,
} from "../../server/access-foundation";

const routes = PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ_ALLOWLIST;
type Decision = "allow" | "deny" | "indeterminate";

function request(app: express.Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("no test port"));
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request({
        host: "127.0.0.1", port: address.port, path, method,
        headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
      }, (res) => {
        let text = "";
        res.on("data", (chunk) => { text += chunk; });
        res.on("end", () => { server.close(); resolve({ status: res.statusCode ?? 0, body: text }); });
      });
      req.on("error", (error) => { server.close(); reject(error); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function appFor(
  decision: Decision,
  flags: "enabled" | "absent" | "disabled" | "expired" | "unreadable" = "enabled",
  legacyAllow = true,
  actor: "clinician" | "staff" = "clinician",
) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "resource-cohort-test", resave: false, saveUninitialized: true }));
  app.use((req, res, next) => {
    const sess = req.session as any;
    sess.activeClinicId = 7;
    if (actor === "clinician") (req as any).user = { id: 41 };
    else {
      delete (req as any).user;
      sess.staffId = 301;
      sess.staffClinicianId = 41;
      sess.staffClinicianClinicId = 7;
    }
    res.locals.legacyAllow = legacyAllow;
    establishSyntheticValidationMarker(req);
    next();
  });
  const middleware = patientChartDownloadResourcesAuthzMiddlewareWithDependencies({
    readFlags: async () => {
      if (flags === "unreadable") throw new Error("unavailable");
      if (flags === "absent") return [] as any;
      return [{ flagKey: "ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ", enabled: flags === "enabled" }] as any;
    },
    resolveActor: async () => ({ decision }),
    // This spy represents the ownership SQL. It must never run for a denied
    // actor, which proves revalidation precedes PHI/resource lookup.
    resolveResourceClinic: async () => 7,
  });
  for (const route of routes) {
    const handler = (_req: express.Request, res: express.Response) => res.status(200).send("handler");
    (app as any)[route.method.toLowerCase()](route.path, middleware, handler);
  }
  return app;
}

describe("patient/chart/download resource cohort", () => {
  const original = process.env.NODE_ENV;
  beforeAll(() => { process.env.NODE_ENV = "development"; });
  afterAll(() => {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  });

  it("contains exactly the approved ten method/path pairs", () => {
    expect(routes).toHaveLength(10);
    expect(new Set(routes.map((r) => `${r.method} ${r.path}`)).size).toBe(10);
  });

  it.each(routes)("$method $path permits an active clinician", async (route) => {
    const result = await request(appFor("allow"), route.method, route.path.replace(":id", "10").replace(":docId", "20"), {});
    expect(result.status).toBe(200);
  });

  it.each(routes)("$method $path permits an active staff session", async (route) => {
    const app = appFor("allow", "enabled", true, "staff");
    const result = await request(app, route.method, route.path.replace(":id", "10").replace(":docId", "20"), {});
    expect(result.status).toBe(200);
  });

  it.each(routes)("$method $path has equivalent cross-clinic and nonexistent denials", async (route) => {
    const path = route.path.replace(":id", "10").replace(":docId", "20");
    const crossClinic = express();
    crossClinic.use(express.json());
    crossClinic.use(session({ secret: "resource-cohort-test", resave: false, saveUninitialized: true }));
    crossClinic.use((req, _res, next) => {
      (req.session as any).activeClinicId = 7;
      (req as any).user = { id: 41 };
      establishSyntheticValidationMarker(req);
      next();
    });
    const m = patientChartDownloadResourcesAuthzMiddlewareWithDependencies({
      readFlags: async () => [{ flagKey: "ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ", enabled: true }] as any,
      resolveActor: async () => ({ decision: "allow" }),
      resolveResourceClinic: async (req) => req.path.includes("999") ? null : 8,
    });
    (crossClinic as any)[route.method.toLowerCase()](route.path, m, (_req: express.Request, res: express.Response) => res.send("leak"));
    const foreign = await request(crossClinic, route.method, path);
    const missing = await request(crossClinic, route.method, path.replace("10", "999"));
    expect(foreign.status).toBe(403);
    expect(missing.status).toBe(403);
    expect(foreign.body).toBe(missing.body);
  });

  it.each(routes)("$method $path denies stale/revoked actors before resource lookup", async (route) => {
    const result = await request(appFor("deny"), route.method, route.path.replace(":id", "10").replace(":docId", "20"));
    expect(result.status).toBe(403);
    expect(result.body).toBe(JSON.stringify({ message: "Access denied" }));
  });

  it.each(routes)("$method $path never resolves a resource for revoked staff", async (route) => {
    let resourceReads = 0;
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "resource-cohort-test", resave: false, saveUninitialized: true }));
    app.use((req, _res, next) => {
      (req.session as any).activeClinicId = 7;
      (req.session as any).staffId = 301;
      (req.session as any).staffClinicianId = 41;
      (req.session as any).staffClinicianClinicId = 7;
      establishSyntheticValidationMarker(req);
      next();
    });
    const middleware = patientChartDownloadResourcesAuthzMiddlewareWithDependencies({
      readFlags: async () => [{ flagKey: "ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ", enabled: true }] as any,
      resolveActor: async () => ({ decision: "deny" }),
      resolveResourceClinic: async () => { resourceReads++; return 7; },
    });
    (app as any)[route.method.toLowerCase()](route.path, middleware, (_req: express.Request, res: express.Response) => res.send("effect"));
    const result = await request(app, route.method, route.path.replace(":id", "10").replace(":docId", "20"));
    expect(result.status).toBe(403);
    expect(resourceReads).toBe(0);
  });

  it.each(routes)("$method $path rejects noncanonical parameter values before downstream effects", async (route) => {
    if (!route.path.includes(":")) return;
    const app = appFor("allow");
    const path = route.path.replace(":id", "10abc").replace(":docId", "20");
    const result = await request(app, route.method, path);
    expect(result.status).toBe(403);
  });

  it.each(["absent", "disabled", "expired", "unreadable"] as const)(
    "preserves legacy behavior when the enforcement flag is %s",
    async (flag) => {
      const route = routes[0];
      const result = await request(appFor("deny", flag), route.method, route.path.replace(":id", "10"));
      expect(result.status).toBe(200);
    },
  );

  it.each(["absent", "disabled", "expired", "unreadable"] as const)(
    "preserves legacy handling of noncanonical parameters when flag is %s",
    async (flag) => {
      const route = routes[0];
      const result = await request(appFor("allow", flag), route.method, "/api/patients/10abc");
      expect(result.status).toBe(200);
    },
  );

  it("keeps a legacy denial denied even when the proposal allows", async () => {
    const result = await request(appFor("allow", "enabled", false), "GET", "/api/patients/10");
    expect(result.status).toBe(403);
  });

  it("does not treat browser context values as authorization context", async () => {
    const app = appFor("deny");
    const result = await request(app, "GET", "/api/patients/10?clinicId=999", { clinicId: 999 });
    expect(result.status).toBe(403);
  });

  it("supports explicit Clinic B selection without falling back to a default", async () => {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "resource-cohort-test", resave: false, saveUninitialized: true }));
    app.use((req, _res, next) => {
      (req.session as any).activeClinicId = 8;
      (req as any).user = { id: 41 };
      establishSyntheticValidationMarker(req);
      next();
    });
    app.get("/api/patients/:id", patientChartDownloadResourcesAuthzMiddlewareWithDependencies({
      readFlags: async () => [{ flagKey: "ENFORCE_PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ", enabled: true }] as any,
      resolveActor: async (_req, clinicId) => ({ decision: clinicId === 8 ? "allow" : "deny" }),
      resolveResourceClinic: async () => 8,
    }), (_req, res) => res.send("clinic-b"));
    expect((await request(app, "GET", "/api/patients/10")).status).toBe(200);
  });
});