import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import session from "express-session";
import http from "node:http";
import {
  createAppointmentTypesReadHandler,
  createAvailabilitySlotsReadHandler,
} from "../../server/scheduling-read-handlers";

type StoreCounters = {
  appointmentTypes: Array<{ clinicId: number; includeInactive: boolean }>;
  providerChecks: Array<{ providerId: number; clinicId: number }>;
  typeChecks: Array<{ typeId: number; clinicId: number }>;
  availability: number;
  blocks: number;
  appointments: number;
  availabilityArgs: Array<{ clinicId: number; providerId: number | null | undefined }>;
  blockArgs: Array<{ clinicId: number; providerId: number | null | undefined }>;
  appointmentArgs: Array<{ clinicId: number; providerId: number | null | undefined }>;
};

function httpRequest(
  app: express.Express,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("server did not bind"));
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request({
        host: "127.0.0.1",
        port: address.port,
        path,
        method: "GET",
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

function makeSchedulingStore() {
  const appointmentTypes = [
    { id: 101, clinicId: 1, name: "Clinic A visit", durationMinutes: 30, isActive: true },
    { id: 102, clinicId: 1, name: "Clinic A inactive", durationMinutes: 30, isActive: false },
    { id: 201, clinicId: 2, name: "Clinic B visit", durationMinutes: 60, isActive: true },
  ];
  const providers = [
    { id: 11, clinicId: 1, displayName: "Clinic A provider", isActive: true },
    { id: 22, clinicId: 2, displayName: "Clinic B provider", isActive: true },
  ];
  const counters: StoreCounters = {
    appointmentTypes: [],
    providerChecks: [],
    typeChecks: [],
    availability: 0,
    blocks: 0,
    appointments: 0,
    availabilityArgs: [],
    blockArgs: [],
    appointmentArgs: [],
  };
  const store = {
    counters,
    async getAppointmentTypes(clinicId: number, includeInactive = false) {
      counters.appointmentTypes.push({ clinicId, includeInactive });
      return appointmentTypes.filter(row => row.clinicId === clinicId && (includeInactive || row.isActive));
    },
    async getProviderByIdInClinic(providerId: number, clinicId: number) {
      counters.providerChecks.push({ providerId, clinicId });
      return providers.find(row => row.id === providerId && row.clinicId === clinicId) ?? null;
    },
    async getAppointmentTypeById(typeId: number, clinicId: number) {
      counters.typeChecks.push({ typeId, clinicId });
      return appointmentTypes.find(row => row.id === typeId && row.clinicId === clinicId) ?? null;
    },
    async getProviderAvailability(clinicId: number, providerId?: number | null) {
      counters.availability += 1;
      counters.availabilityArgs.push({ clinicId, providerId });
      if (clinicId !== 1 || providerId !== 11) return [];
      return [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }];
    },
    async getCalendarBlocks(clinicId: number, _start: Date, _end: Date, providerId?: number | null) {
      counters.blocks += 1;
      counters.blockArgs.push({ clinicId, providerId });
      if (clinicId !== 1 || providerId !== 11) return [];
      return [];
    },
    async getAppointmentsByClinicAndRange(clinicId: number, _start: Date, _end: Date, providerId?: number | null) {
      counters.appointments += 1;
      counters.appointmentArgs.push({ clinicId, providerId });
      if (clinicId !== 1 || providerId !== 11) return [];
      return [];
    },
  };
  return store;
}

function makeAuthenticatedApp(store: ReturnType<typeof makeSchedulingStore>) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "scheduling-reference-test",
    resave: false,
    saveUninitialized: true,
  }));
  // This is the isolated HTTP harness's authenticated server session. Clinic
  // context is deliberately not read from request query/header/body/cookies.
  app.use((req, _res, next) => {
    (req as any).user = { id: 41 };
    (req.session as any).activeClinicId = 1;
    next();
  });
  const getClinicId = (req: express.Request) => Number((req.session as any).activeClinicId) || null;
  app.get("/api/appointment-types", createAppointmentTypesReadHandler({ storage: store as any, getClinicId }));
  app.get("/api/availability/slots", createAvailabilitySlotsReadHandler({ storage: store as any, getClinicId }));
  return app;
}

describe("scheduling reference clinic boundary", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => { process.env.NODE_ENV = "development"; });
  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns only active appointment types for the authenticated clinic", async () => {
    const store = makeSchedulingStore();
    const response = await httpRequest(makeAuthenticatedApp(store), "/api/appointment-types");
    expect(response.status).toBe(200);
    expect(response.body.map((row: any) => row.id)).toEqual([101]);
    expect(store.counters.appointmentTypes).toEqual([{ clinicId: 1, includeInactive: false }]);
  });

  it("does not let browser clinic overrides change appointment-type context", async () => {
    const store = makeSchedulingStore();
    const response = await httpRequest(
      makeAuthenticatedApp(store),
      "/api/appointment-types?clinicId=2",
      {
        "x-clinic-id": "2",
        cookie: "activeClinicId=2",
      },
      { clinicId: 2 },
    );
    expect(response.status).toBe(200);
    expect(response.body.map((row: any) => row.id)).toEqual([101]);
    expect(store.counters.appointmentTypes[0]?.clinicId).toBe(1);
  });

  it("returns [] and does not query schedules for a cross-clinic provider", async () => {
    const store = makeSchedulingStore();
    const response = await httpRequest(
      makeAuthenticatedApp(store),
      "/api/availability/slots?providerId=22&typeId=101&date=2025-01-06",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(store.counters.providerChecks).toEqual([{ providerId: 22, clinicId: 1 }]);
    expect(store.counters.typeChecks).toEqual([{ typeId: 101, clinicId: 1 }]);
    expect(store.counters.availability).toBe(0);
    expect(store.counters.blocks).toBe(0);
    expect(store.counters.appointments).toBe(0);
  });

  it("returns [] and does not query schedules for a cross-clinic appointment type", async () => {
    const store = makeSchedulingStore();
    const response = await httpRequest(
      makeAuthenticatedApp(store),
      "/api/availability/slots?providerId=11&typeId=201&date=2025-01-06",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(store.counters.providerChecks).toEqual([{ providerId: 11, clinicId: 1 }]);
    expect(store.counters.typeChecks).toEqual([{ typeId: 201, clinicId: 1 }]);
    expect(store.counters.availability).toBe(0);
    expect(store.counters.blocks).toBe(0);
    expect(store.counters.appointments).toBe(0);
  });

  it("returns slots only from the active clinic for valid provider and type", async () => {
    const store = makeSchedulingStore();
    const response = await httpRequest(
      makeAuthenticatedApp(store),
      "/api/availability/slots?providerId=11&typeId=101&date=2025-01-06",
      { "x-clinic-id": "2", cookie: "activeClinicId=2" },
      { clinicId: 2 },
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].end).not.toBe(response.body[0].start);
    expect(response.body[1].end).not.toBe(response.body[1].start);
    expect(store.counters.providerChecks).toEqual([{ providerId: 11, clinicId: 1 }]);
    expect(store.counters.typeChecks).toEqual([{ typeId: 101, clinicId: 1 }]);
    expect(store.counters.availability).toBe(1);
    expect(store.counters.blocks).toBe(1);
    expect(store.counters.appointments).toBe(1);
    expect(store.counters.availabilityArgs).toEqual([{ clinicId: 1, providerId: 11 }]);
    expect(store.counters.blockArgs).toEqual([{ clinicId: 1, providerId: 11 }]);
    expect(store.counters.appointmentArgs).toEqual([{ clinicId: 1, providerId: 11 }]);
  });
});