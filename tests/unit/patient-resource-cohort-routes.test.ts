import { describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { registerRoutes } from "../../server/routes";
import { PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ_ALLOWLIST } from "../../server/access-foundation";

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: vi.fn() } };
    responses = { create: vi.fn() };
  },
}));

/*
 * This is deliberately a registration-level integration test.  It imports the
 * production registerRoutes function, but replaces storage and external
 * dependencies before import-time code can open a pool or contact a service.
 * The authz behavior itself is covered by patient-resource-cohort-authz.test.
 */
const { storageProxy, storageCalls, cohortMiddleware, ordinaryMiddleware } = vi.hoisted(() => {
  const calls = new Map<string, number>();
  const proxy = new Proxy({}, {
    get: (_target, name) => {
      const key = String(name);
      return vi.fn(() => calls.set(key, (calls.get(key) ?? 0) + 1));
    },
  }) as any;
  return {
    storageProxy: proxy,
    storageCalls: calls,
    cohortMiddleware: vi.fn((_req: any, res: any) => res.status(403).json({ message: "Access denied" })),
    ordinaryMiddleware: vi.fn((_req: any, _res: any, next: any) => next()),
  };
});

vi.mock("../../server/storage", () => ({
  storage: storageProxy,
  chartReviewStorage: storageProxy,
  db: storageProxy,
  storageDb: storageProxy,
  setupClinicForNewUser: vi.fn(),
  updateClinicSeats: vi.fn(),
  createProviderWithMembership: vi.fn(),
  updateClinicPlanFromStripe: vi.fn(),
}));

vi.mock("../../server/access-foundation", async () => {
  const actual = await vi.importActual<typeof import("../../server/access-foundation")>(
    "../../server/access-foundation",
  );
  return {
    ...actual,
    patientChartDownloadResourcesAuthzMiddleware: () => cohortMiddleware,
    ordinaryClinicAccessEnforcementMiddleware: () => ordinaryMiddleware,
  };
});

vi.mock("../../server/email-service", () => {
  const noop = vi.fn(async () => undefined);
  return {
    sendInviteEmail: noop,
    sendPasswordResetEmail: noop,
    sendPatientPortalInviteEmail: noop,
    sendProtocolPublishedEmail: noop,
    sendNewPortalMessageEmail: noop,
    sendStaffInviteEmail: noop,
    sendPortalPasswordResetEmail: noop,
    sendProviderInviteEmail: noop,
    sendExternalCollaboratorInviteEmail: noop,
    sendEmail: noop,
  };
});

vi.mock("../../server/external-messaging", () => ({
  forwardMessageToExternalProvider: vi.fn(async () => ({ success: true })),
}));

function httpRequest(app: express.Express, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("no test port"));
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request({
        host: "127.0.0.1",
        port: address.port,
        path,
        method,
        headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
      }, (res) => {
        let text = "";
        res.on("data", (chunk) => { text += chunk; });
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode ?? 0, text });
        });
      });
      req.on("error", (error) => { server.close(); reject(error); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function registeredRoutes(app: express.Express) {
  const router = (app as any)._router;
  return router.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({
      method: Object.keys(layer.route.methods)[0].toUpperCase(),
      path: layer.route.path,
      handlers: layer.route.stack.map((entry: any) => entry.handle),
    }));
}

describe("production patient resource route registration", () => {
  async function productionApp() {
    const app = express();
    app.use(express.json());
    // requireAuth is intentionally exercised, not bypassed: this is the
    // authenticated request context a real session middleware would provide.
    app.use((req: any, _res, next) => {
      req.session = { activeClinicId: 7 };
      req.user = { id: 41 };
      req.isAuthenticated = () => true;
      next();
    });
    await registerRoutes(app);
    return app;
  }

  it("registers every approved cohort route with auth before cohort authorization", async () => {
    const app = express();
    await registerRoutes(app);
    const routes = registeredRoutes(app);

    for (const entry of PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ_ALLOWLIST) {
      const route = routes.find((candidate: any) =>
        candidate.method === entry.method && candidate.path === entry.path,
      );
      expect(route, `${entry.method} ${entry.path}`).toBeDefined();
      expect(route!.handlers.indexOf(cohortMiddleware)).toBeGreaterThan(0);
      expect(route!.handlers.indexOf(cohortMiddleware)).toBe(
        route!.handlers.findIndex((handler: any) => handler.name === "requireAuth") + 1,
      );
    }
  });

  it("does not attach the cohort middleware to an unapproved neighboring route", async () => {
    const app = express();
    await registerRoutes(app);
    const routes = registeredRoutes(app);
    const neighboring = routes.find((entry: any) =>
      entry.path === "/api/patients/:id/reply" && entry.method === "POST",
    );
    expect(neighboring).toBeDefined();
    expect(neighboring!.handlers).not.toContain(cohortMiddleware);
  });

  it("returns sanitized denial through every production cohort route before PHI effects", async () => {
    const app = await productionApp();
    const effectNames = [
      "getPatient", "getPatientInClinic", "getPatientChartInClinic",
      "getPatientDocument", "listPatientDocuments", "getPortalMessages",
      "markPortalMessagesRead", "createPortalMessageInClinic",
      "getEncounter", "getClinicalEncounter", "getActiveClinicalOrders",
    ];
    for (const route of PATIENT_CHART_DOWNLOAD_RESOURCES_AUTHZ_ALLOWLIST) {
      storageCalls.clear();
      cohortMiddleware.mockClear();
      const path = route.path.replace(":id", "10").replace(":docId", "20");
      const body = route.method === "POST" ? { content: "valid patient message" } : undefined;
      const result = await httpRequest(app, route.method, path, body);
      expect(result.status, `${route.method} ${path}`).toBe(403);
      expect(result.text).toBe(JSON.stringify({ message: "Access denied" }));
      expect(cohortMiddleware).toHaveBeenCalledTimes(1);
      for (const effect of effectNames) {
        expect(storageCalls.get(effect) ?? 0, `${effect} for ${route.method} ${path}`).toBe(0);
      }
    }
  });

  it("allows an unapproved neighboring route to proceed without cohort denial", async () => {
    const app = await productionApp();
    storageCalls.clear();
    cohortMiddleware.mockClear();
    const result = await httpRequest(app, "POST", "/api/patients/10/reply", {
      body: "valid neighboring message",
      channel: "portal",
    });
    expect(result.status).not.toBe(403);
    expect(cohortMiddleware).not.toHaveBeenCalled();
  });
});