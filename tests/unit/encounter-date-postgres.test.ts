// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { getTableColumns, getTableName, SQL, eq } from "drizzle-orm";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";
import { parseEncounterDate, encounterVitalDate } from "../../shared/encounter-date";
import { EncounterDateError } from "../../shared/encounter-date";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual registered vital callbacks and auth/clinic helpers against
// real isolated storage, without starting an app or loading external services.
const routes = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
const functions = new Map<string, ts.Node>();
const handlers = new Map<string, ts.Node>();
function locate(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
      ["/api/patients/:id/vitals", "/api/vitals/:id"].includes(node.arguments[0].text)) {
    expect(node.arguments[1].getText(routes)).toBe("requireAuth");
    handlers.set(`${node.expression.name.text}:${node.arguments[0].text}`, node.arguments[node.arguments.length - 1]);
  }
  ts.forEachChild(node, locate);
}
locate(routes);
function evaluate(node: ts.Node, context: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(`(${node.getText(routes)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
}

// Import the REAL storage with only the connection target replaced. No inherited
// application URL or credential is used, even if this test is invoked manually.
vi.mock("pg", async importOriginal => {
  const original = await importOriginal<typeof import("pg")>();
  class PrivatePool extends original.default.Pool {
    constructor() {
      const socket = process.env.ENCOUNTER_DATE_TEST_SOCKET;
      if (!socket?.startsWith("/tmp/cliniq-encounter-date.") || socket.includes("..")) throw new Error("Private synthetic socket required");
      super({ host: socket, port: 5432, user: "encounter_date_test", database: "encounter_date_test" });
    }
  }
  return { ...original, default: { ...original.default, Pool: PrivatePool } };
});

describe.skipIf(!process.env.ENCOUNTER_DATE_TEST_SOCKET)("Encounter date lifecycle in private PostgreSQL", () => {
  let storage: typeof import("../../server/storage").storage;
  let review: typeof import("../../server/storage").chartReviewStorage;
  let db: typeof import("../../server/storage").db;
  let pool: pg.Pool;
  const oldDay = "2026-02-03";
  const now = new Date("2026-11-09T18:44:12Z");
  beforeAll(async () => {
    ({ storage, chartReviewStorage: review, db } = await import("../../server/storage"));
    // GitHub main exposes its real Drizzle client, not the later development
    // branch's pool export. Do not import unrelated portal storage changes.
    pool = db.$client;
    expect((await pool.query("select current_database() as name")).rows[0].name).toBe("encounter_date_test");
    const tables = [schema.users, schema.clinics, schema.patients, schema.clinicalEncounters,
      schema.patientVitals, schema.chartReviewAgreements, schema.chartReviewItems, schema.chartReviewComments];
    const dialect = new PgDialect();
    for (const table of tables) {
      const columns = Object.entries(getTableColumns(table)).map(([key, col]) => {
        const value = col.default;
        const def = value instanceof SQL ? dialect.sqlToQuery(value).sql
          : value === undefined ? undefined : typeof value === "string" ? `'${value.replaceAll("'", "''")}'`
          : JSON.stringify(value);
        return `"${col.name}" ${key === "id" ? "serial PRIMARY KEY" : col.getSQLType()}${col.notNull ? " NOT NULL" : ""}${key !== "id" && def !== undefined ? ` DEFAULT ${def}` : ""}`;
      });
      await pool.query(`CREATE TABLE "${getTableName(table)}" (${columns.join(", ")})`);
    }
    // Include the real relevant FK constraints, without inventing a uniqueness
    // constraint the application doesn't have on source_encounter_id.
    for (const table of tables) for (const fk of getTableConfig(table).foreignKeys) {
      const ref = fk.reference();
      if (!tables.some(t => getTableName(t) === getTableName(ref.foreignTable))) continue;
      await pool.query(`ALTER TABLE "${getTableName(table)}" ADD FOREIGN KEY (${ref.columns.map(c => `"${c.name}"`).join(",")})
        REFERENCES "${getTableName(ref.foreignTable)}" (${ref.foreignColumns.map(c => `"${c.name}"`).join(",")})`);
    }
    await db.insert(schema.users).values([
      { id: 1, username: "synthetic-one", email: "one@example.invalid", firstName: "Synthetic", lastName: "One", title: "MD", clinicName: "Synthetic", passwordHash: "not-a-login" },
      { id: 2, username: "synthetic-two", email: "two@example.invalid", firstName: "Synthetic", lastName: "Two", title: "MD", clinicName: "Other", passwordHash: "not-a-login" },
    ]);
    await db.insert(schema.clinics).values([{ id: 10, name: "Synthetic" }, { id: 20, name: "Other" }]);
    await db.insert(schema.patients).values([
      { id: 1, userId: 1, clinicId: 10, firstName: "Synthetic", lastName: "One", gender: "male" },
      { id: 2, userId: 2, clinicId: 20, firstName: "Synthetic", lastName: "Two", gender: "male" },
      { id: 3, userId: 1, clinicId: 10, firstName: "Synthetic", lastName: "Three", gender: "male" },
    ]);
  });
  afterAll(async () => { await pool?.end(); });

  const create = (date = oldDay, overrides = {}) => storage.createEncounter({
    clinicianId: 1, patientId: 1, clinicId: 10, visitDate: parseEncounterDate(date),
    soapNote: { fullNote: "Synthetic note, unchanged clinical content." }, ...overrides,
  });
  const vital = (id: number, overrides = {}) => storage.upsertEncounterVital({
    clinicianId: 1, patientId: 1, sourceEncounterId: id, source: "clinic",
    systolicBp: 123, diastolicBp: 78, ...overrides,
  }, 10);
  const correct = (id: number, expected: string | Date, next: string) =>
    storage.updateEncounter(id, 1, { visitDate: parseEncounterDate(next), expectedVisitDate: expected } as any, 10);
  const sign = (id: number, timestamp = now) => storage.updateEncounter(id, 1, {
    signedAt: timestamp, signedBy: "Synthetic Provider", lockedAt: timestamp,
    encounterVersions: [{ action: "initial_sign" }],
  } as any, 10);

  async function invokeVital(method: "post" | "patch", id: number, body: unknown, authenticated = true) {
    const context: Record<string, unknown> = {
      storage, storageDb: db, schema, eq, insertPatientVitalSchema: schema.insertPatientVitalSchema,
      EncounterDateError, console: { error: vi.fn() },
    };
    for (const name of ["getClinicianId", "getEffectiveClinicId", "computeBmi", "requireAuth"]) {
      context[name] = evaluate(functions.get(name)!, context);
    }
    const req = { params: { id: String(id) }, body, session: {},
      user: { id: 1, defaultClinicId: 10 }, isAuthenticated: () => authenticated };
    const res = { statusCode: 200, body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.body = value; return this; } };
    let allowed = false;
    (context.requireAuth as Function)(req, res, () => { allowed = true; });
    if (allowed) {
      const path = method === "post" ? "/api/patients/:id/vitals" : "/api/vitals/:id";
      await evaluate(handlers.get(`${method}:${path}`)!, context)(req, res);
    }
    return res;
  }

  it("creates and corrects standalone measurement dates via real routes/storage without changing audit time", async () => {
    const saved = await invokeVital("post", 1, { source: "clinic", heartRate: 72, recordedAt: "2026-11-02" });
    expect(saved.statusCode).toBe(201);
    expect(saved.body.recordedAt.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    const auditTime = saved.body.createdAt;
    const edited = await invokeVital("patch", saved.body.id, { recordedAt: "2026-10-31" });
    expect(edited.statusCode).toBe(200);
    expect(edited.body.recordedAt.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(edited.body.createdAt).toEqual(auditTime);
    expect(edited.body.clinicianId).toBe(saved.body.clinicianId);
    const reopened = (await storage.getPatientVitals(1)).find(v => v.id === saved.body.id)!;
    expect(reopened.recordedAt.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    for (const value of ["", "not-a-date", "2026-02-29"]) {
      expect((await invokeVital("post", 1, { recordedAt: value })).statusCode).toBe(400);
      expect((await invokeVital("patch", saved.body.id, { recordedAt: value })).statusCode).toBe(400);
    }
    expect((await storage.getPatientVitals(1)).find(v => v.id === saved.body.id)?.recordedAt).toEqual(reopened.recordedAt);
  });

  it("preserves real route authentication, clinic isolation and linked-date locks", async () => {
    expect((await invokeVital("post", 1, { recordedAt: oldDay }, false)).statusCode).toBe(401);
    expect((await invokeVital("post", 2, { recordedAt: oldDay })).statusCode).toBe(404);
    const foreign = await storage.createPatientVital({ patientId: 2, clinicianId: 2, recordedAt: oldDay });
    expect((await invokeVital("patch", foreign.id, { recordedAt: "2026-01-01" })).statusCode).toBe(403);
    expect((await storage.getPatientVitals(2)).find(v => v.id === foreign.id)?.recordedAt.toISOString())
      .toBe(`${oldDay}T00:00:00.000Z`);
    for (const state of [{}, { signedAt: now, lockedAt: now }, { pendingCollabReview: true, lockedAt: now }]) {
      const enc = await create(oldDay);
      const linked = await vital(enc.id, { recordedAt: "2026-11-02" });
      if (Object.keys(state).length) await storage.updateEncounter(enc.id, 1, state as any, 10);
      expect(linked.recordedAt).toEqual(encounterVitalDate(oldDay));
      expect((await invokeVital("patch", linked.id, { recordedAt: "2026-11-02" })).statusCode).toBe(423);
      expect((await storage.getPatientVitals(1)).find(v => v.id === linked.id)?.recordedAt).toEqual(linked.recordedAt);
    }
  });

  it("orders standalone history by measurement date and preserves legacy timestamps", async () => {
    const values = ["2000-02-03", "2000-02-01", "2000-02-02"];
    const readings = await Promise.all(values.map(recordedAt =>
      storage.createPatientVital({ patientId: 3, clinicianId: 1, recordedAt, heartRate: 70 })));
    const history = await storage.getPatientVitals(3);
    expect(history.filter(v => readings.some(r => r.id === v.id)).map(v => v.recordedAt.toISOString().slice(0, 10)))
      .toEqual(["2000-02-03", "2000-02-02", "2000-02-01"]);
    const legacy = await storage.createPatientVital({ patientId: 3, clinicianId: 1, recordedAt: "2026-11-02T23:10:00-06:00" });
    const updated = await storage.updatePatientVital(legacy.id, 3, { heartRate: 75 });
    expect(updated?.recordedAt.toISOString()).toBe("2026-11-03T05:10:00.000Z");
    expect(updated?.createdAt).toEqual(legacy.createdAt);
  });

  it("backdates after auto-creation, generates, saves, reopens, and signs later without changing audit creation", async () => {
    const enc = await create("2026-11-09");
    const corrected = await correct(enc.id, enc.visitDate.toISOString(), oldDay);
    expect(corrected?.createdAt).toEqual(enc.createdAt);
    await storage.updateEncounter(enc.id, 1, { soapGeneratedAt: now, soapNote: enc.soapNote }, 10);
    const v = await vital(enc.id, { recordedAt: now.toISOString() }); // caller's write date is ignored
    expect(v.recordedAt).toEqual(encounterVitalDate(oldDay));
    const signed = await sign(enc.id);
    const reopened = await storage.getEncounter(enc.id, 1, 10);
    expect(reopened?.visitDate).toEqual(parseEncounterDate(oldDay));
    expect(signed?.signedAt).toEqual(now);
    expect(signed?.createdAt).toEqual(enc.createdAt);
    expect(signed?.soapGeneratedAt).toEqual(now);
    expect(signed?.encounterVersions?.[0]).toMatchObject({ visitDate: oldDay, signedAt: now.toISOString(), signedBy: "Synthetic Provider" });
  });

  it("corrects only linked dates atomically, preserving values, created_at and all independent readings", async () => {
    const enc = await create();
    const linked = await vital(enc.id);
    const manual = await storage.createPatientVital({ clinicianId: 1, patientId: 1, source: "clinic", recordedAt: "2026-01-01", heartRate: 60 });
    const logged = await storage.createPatientVital({ clinicianId: 1, patientId: 1, source: "patient_logged", recordedAt: "2026-01-02", heartRate: 61 });
    const lab = await storage.createPatientVital({ clinicianId: 1, patientId: 1, notes: "Lab-derived", recordedAt: "2026-01-03", bmi: 23 });
    const other = await create("2026-01-04");
    const otherVital = await vital(other.id);
    await correct(enc.id, enc.visitDate.toISOString(), "2026-01-30");
    const readings = await storage.getPatientVitals(1);
    expect(readings.find(v => v.id === linked.id)).toEqual({ ...linked, recordedAt: encounterVitalDate("2026-01-30"), timeOfDay: null });
    for (const unchanged of [manual, logged, lab, otherVital]) expect(readings.find(v => v.id === unchanged.id)).toEqual(unchanged);
    const repeated = await vital(enc.id);
    expect(repeated.id).toBe(linked.id);
    expect(repeated.createdAt).toEqual(linked.createdAt);
    expect(repeated.recordedAt).toEqual(encounterVitalDate("2026-01-30"));
  });

  it("serializes concurrent generation/upserts and date correction without duplicates or stale dates", async () => {
    const enc = await create();
    const results = await Promise.all([
      ...Array.from({ length: 8 }, () => vital(enc.id)),
      correct(enc.id, enc.visitDate.toISOString(), "2026-01-29"),
    ]);
    const readings = (await storage.getPatientVitals(1)).filter(v => v.sourceEncounterId === enc.id);
    expect(readings).toHaveLength(1);
    expect(readings[0].recordedAt).toEqual(encounterVitalDate("2026-01-29"));
    expect(results).toHaveLength(9);
    await expect(correct(enc.id, enc.visitDate.toISOString(), "2026-01-28")).rejects.toMatchObject({ status: 409 });
  });

  it("allows only one of two concurrent date edits and rolls back linked changes on failure", async () => {
    const enc = await create();
    const v = await vital(enc.id);
    const edits = await Promise.allSettled([
      correct(enc.id, enc.visitDate.toISOString(), "2026-01-20"),
      correct(enc.id, enc.visitDate.toISOString(), "2026-01-21"),
    ]);
    expect(edits.filter(e => e.status === "fulfilled")).toHaveLength(1);
    const current = (await storage.getEncounter(enc.id, 1, 10))!;
    await pool.query(`CREATE FUNCTION reject_date_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER reject_date_test BEFORE UPDATE ON patient_vitals FOR EACH ROW EXECUTE FUNCTION reject_date_test()`);
    try {
      await expect(correct(enc.id, current.visitDate.toISOString(), "2026-01-22")).rejects.toThrow("synthetic failure");
      expect((await storage.getEncounter(enc.id, 1, 10))?.visitDate).toEqual(current.visitDate);
      expect((await storage.getPatientVitals(1)).find(r => r.id === v.id)?.recordedAt).toEqual(encounterVitalDate(current.visitDate));
    } finally { await pool.query("DROP TRIGGER reject_date_test ON patient_vitals; DROP FUNCTION reject_date_test()"); }
  });

  it("requires amendment/review unlock, preserves signed versions and captures corrected date on re-sign", async () => {
    const enc = await create();
    await vital(enc.id);
    const signed = (await sign(enc.id))!;
    await expect(correct(enc.id, enc.visitDate.toISOString(), "2026-02-04")).rejects.toMatchObject({ status: 423 });
    await storage.updateEncounter(enc.id, 1, { signedAt: null, signedBy: null, lockedAt: null } as any, 10);
    await correct(enc.id, enc.visitDate.toISOString(), "2026-02-04");
    const amended = (await sign(enc.id, new Date("2026-11-10T17:00:00Z")))!;
    expect(amended.encounterVersions?.[0]).toEqual(signed.encounterVersions?.[0]);
    expect(amended.encounterVersions?.[1]?.visitDate).toBe("2026-02-04");
    expect(amended.createdAt).toEqual(enc.createdAt);
    const pending = await create(oldDay, { pendingCollabReview: true, lockedAt: now });
    await expect(correct(pending.id, pending.visitDate.toISOString(), "2026-02-05")).rejects.toMatchObject({ status: 423 });
  });

  it("does not invent missing legacy signature dates", async () => {
    const enc = await create(oldDay, { signedAt: now, signedBy: "Legacy Signer", lockedAt: now });
    const opened = await storage.updateEncounter(enc.id, 1, { signedAt: null, signedBy: null, lockedAt: null } as any, 10);
    expect(opened?.encounterVersions?.[0]).toMatchObject({ visitDate: null, signedAt: now.toISOString(), signedBy: "Legacy Signer" });
  });

  it("rejects wrong clinic/patient, preserves non-encounter dates, and blocks direct linked-date edits", async () => {
    const enc = await create();
    expect(await storage.updateEncounter(enc.id, 2, { visitDate: now }, 20)).toBeUndefined();
    expect(await storage.updateEncounter(enc.id, 1, { visitDate: now }, 20)).toBeUndefined();
    await expect(vital(enc.id, { patientId: 2 })).rejects.toMatchObject({ status: 403 });
    await expect(vital(enc.id, { patientId: 3 })).rejects.toMatchObject({ status: 403 });
    await expect(storage.upsertEncounterVital({ patientId: 1, clinicianId: 2, sourceEncounterId: enc.id }, 20)).rejects.toMatchObject({ status: 403 });
    await expect(vital(enc.id, { source: "patient_logged" })).rejects.toMatchObject({ status: 400 });
    const v = await vital(enc.id);
    await expect(storage.updatePatientVital(v.id, 1, { recordedAt: now })).rejects.toMatchObject({ status: 423 });
    expect((await storage.getEncounter(enc.id, 1, 10))?.visitDate).toEqual(enc.visitDate);
  });

  it("captures the clinical date at physician concurrence without backdating signature time", async () => {
    const enc = await create(oldDay, { pendingCollabReview: true, lockedAt: now, signedBy: "Midlevel" });
    const [agreement] = await db.insert(schema.chartReviewAgreements).values({
      clinicId: 10, midLevelUserId: 1, physicianUserId: 2, reviewType: "prospective",
    } as any).returning();
    const [item] = await db.insert(schema.chartReviewItems).values({
      clinicId: 10, encounterId: enc.id, patientId: 1, agreementId: agreement.id,
      midLevelUserId: 1, status: "pending", signedAt: now, quotaPeriodKey: "2026-11", enforcementDueAt: now,
    } as any).returning();
    await review.concurChartReviewItem(item.id, 10, 2);
    const signed = (await storage.getEncounter(enc.id, 1, 10))!;
    expect(signed.encounterVersions?.[0]?.visitDate).toBe(oldDay);
    expect(signed.signedAt!.getTime()).toBeGreaterThan(parseEncounterDate(oldDay).getTime());
    expect(signed.encounterVersions?.[0]?.signedAt).toBe(signed.signedAt?.toISOString());
    expect(signed.createdAt).toEqual(enc.createdAt);
  });
});
