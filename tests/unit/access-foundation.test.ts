import { describe, expect, it, vi } from "vitest";
import {
  authorizationShadowMiddleware,
  type AuthorizationShadowDatabase,
  type AuthorizationShadowDecision,
} from "../../server/access-foundation";

const decision: AuthorizationShadowDecision = {
  requiredFlag: "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ",
  policyKey: "synthetic_policy",
  decision: "allow",
  reason: "synthetic",
  clinicId: 7,
  actorType: "clinician",
  actorId: 10,
  patientId: null,
  relationshipId: null,
  evidence: {},
};

function request(path = "/api/synthetic") {
  return {
    path,
    method: "POST",
    headers: { "x-request-id": "synthetic-request" },
    body: { clinicId: 7, untouched: true },
    session: { userId: 10, activeClinicId: 7 },
    user: { id: 10, defaultClinicId: 7 },
  };
}

function response() {
  let finishListener: (() => void) | undefined;
  const res = {
    statusCode: 201,
    body: { untouched: true },
    on: vi.fn((event: string, listener: () => void) => {
      if (event === "finish") finishListener = listener;
      return res;
    }),
  };
  return {
    res,
    finish: () => finishListener?.(),
  };
}

function fakeDb(values: (payload: unknown) => unknown = () => Promise.resolve()) {
  const valuesCall = vi.fn(values);
  const db: AuthorizationShadowDatabase = {
    insert: vi.fn(() => ({ values: valuesCall })),
  };
  return { db, valuesCall };
}

const enabledFlag = async () => [{
  flagKey: "SHADOW_CLINIC_SUBSCRIPTION_AUTHZ" as const,
  enabled: true,
  clinicId: null,
  expiresAt: null,
  reason: null,
  enforcement: false,
}];

describe("authorization shadow middleware", () => {
  it("does not alter response, request, session, or login flow", async () => {
    const req = request("/api/login");
    const originalBody = req.body;
    const originalSession = { ...req.session };
    const { res } = response();
    const next = vi.fn(() => {
      (req.session as Record<string, unknown>).loginFlowReached = true;
    });

    await authorizationShadowMiddleware({
      readFlags: enabledFlag,
      proposeDecisions: async () => [decision],
      db: fakeDb().db,
    })(
      req as any,
      res as any,
      next as any,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ untouched: true });
    expect(req.body).toBe(originalBody);
    expect(req.session).toEqual({ ...originalSession, loginFlowReached: true });
  });

  it.each([
    ["missing flags", async () => []],
    ["disabled flags", async () => [{
      ...(await enabledFlag())[0],
      enabled: false,
    }]],
    ["flag read failure", async () => {
      throw new Error("flag store unavailable");
    }],
  ])("calls next for %s", async (_label, readFlags) => {
    const next = vi.fn();
    const proposeDecisions = vi.fn(async () => [decision]);

    await authorizationShadowMiddleware({
      readFlags,
      proposeDecisions,
      db: fakeDb().db,
    })(request() as any, response().res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
    expect(proposeDecisions).not.toHaveBeenCalled();
  });

  it("calls next when decision evidence reads fail", async () => {
    const next = vi.fn();
    const { res } = response();
    await authorizationShadowMiddleware({
      readFlags: enabledFlag,
      proposeDecisions: async () => {
        throw new Error("evidence read failed");
      },
      db: fakeDb().db,
    })(request() as any, res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("starts persistence after finish without awaiting it", async () => {
    let resolveWrite!: () => void;
    let writeSettled = false;
    const write = new Promise<void>((resolve) => {
      resolveWrite = () => {
        writeSettled = true;
        resolve();
      };
    });
    const { db, valuesCall } = fakeDb(() => write);
    const { res, finish } = response();
    const next = vi.fn();

    await authorizationShadowMiddleware({
      readFlags: enabledFlag,
      proposeDecisions: async () => [decision],
      db,
    })(request() as any, res as any, next as any);

    finish();
    expect(writeSettled).toBe(false);
    await Promise.resolve();
    expect(valuesCall).toHaveBeenCalledTimes(1);
    expect(writeSettled).toBe(false);

    resolveWrite();
    await write;
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("contains persistence failures after the response finishes", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = fakeDb(() => Promise.reject(new Error("write failed")));
    const { res, finish } = response();

    await authorizationShadowMiddleware({
      readFlags: enabledFlag,
      proposeDecisions: async () => [decision],
      db,
    })(request() as any, res as any, vi.fn() as any);

    expect(() => finish()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith("[auth-shadow] write failed:", "write failed");
    warn.mockRestore();
  });

  it("contains synchronous persistence failures too", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = fakeDb(() => {
      throw new Error("synchronous write failed");
    });
    const { res, finish } = response();

    await authorizationShadowMiddleware({
      readFlags: enabledFlag,
      proposeDecisions: async () => [decision],
      db,
    })(request() as any, res as any, vi.fn() as any);

    expect(() => finish()).not.toThrow();
    expect(warn).toHaveBeenCalledWith("[auth-shadow] write failed:", "synchronous write failed");
    warn.mockRestore();
  });
});