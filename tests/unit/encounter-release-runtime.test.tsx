import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../../shared/schema";
import { PatientSummary } from "../../client/src/components/patient-summary";

const routes = ts.createSourceFile("routes.ts", readFileSync("server/routes.ts", "utf8"), ts.ScriptTarget.Latest, true);
const routePath = "/api/spruce/rematch-patients";
let callback: ts.Node | undefined;
let authArgument: string | undefined;
const helpers = new Map<string, ts.FunctionDeclaration>();
function find(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) helpers.set(node.name.text, node);
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "post" && node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === routePath) {
    authArgument = node.arguments[1].getText(routes);
    callback = node.arguments[node.arguments.length - 1];
  }
  ts.forEachChild(node, find);
}
find(routes);
function evaluate(node: ts.Node, globals: Record<string, unknown>) {
  const js = ts.transpileModule(`(${node.getText(routes)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return runInNewContext(js, globals);
}
function request(clinicId: number | null = 10, session: Record<string, unknown> = {}) {
  return { user: { defaultClinicId: clinicId }, session, isAuthenticated: () => true };
}
function harness(failQuery = false, failBackfill = false) {
  expect(callback).toBeDefined();
  expect(authArgument).toBe("requireAuth");
  const getEffectiveClinicId = evaluate(helpers.get("getEffectiveClinicId")!, {});
  const requireAuth = evaluate(helpers.get("requireAuth")!, {});
  const rows = [
    { id: 101, clinicId: 10, phone: "synthetic-phone-one" },
    { id: 102, clinicId: 10, phone: null },
    { id: 103, clinicId: 10, phone: "" },
    { id: 201, clinicId: 20, phone: "synthetic-phone-two" },
  ];
  const where = vi.fn(async (condition: any) => {
    if (failQuery) throw new Error("synthetic database failure");
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.sql).toContain('"patients"."clinic_id" = $1');
    expect(query.sql).toContain('"patients"."phone" IS NOT NULL');
    expect(query.sql).toContain('"patients"."phone" != \'\'');
    expect(query.params).toHaveLength(1);
    return rows.filter(row => row.clinicId === query.params[0] && row.phone);
  });
  const from = vi.fn((table: unknown) => {
    expect(table).toBe(schema.patients);
    return { where };
  });
  const storageDb = { select: vi.fn(() => ({ from })) };
  const storage = { backfillSprucePatientLinks: vi.fn(async () => {
    if (failBackfill) throw new Error("synthetic rematch failure");
  }) };
  const handler = evaluate(callback!, {
    getEffectiveClinicId, storageDb, storage, schema, eq, and, sql,
    console: { error: vi.fn() },
  });
  async function invoke(req = request()) {
    const res = {
      statusCode: 200, body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    let allowed = false;
    requireAuth(req, res, () => { allowed = true; });
    if (allowed) await handler(req, res);
    return res;
  }
  return { invoke, storageDb, storage };
}

describe("Male lab runtime correction", () => {
  it("renders the actual PatientSummary JSX without an undefined savedLabId", () => {
    const page = ts.createSourceFile("page.tsx", readFileSync("client/src/pages/lab-interpretation.tsx", "utf8"),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let summary: ts.JsxSelfClosingElement | undefined;
    function visit(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(page) === "PatientSummary") summary = node;
      ts.forEachChild(node, visit);
    }
    visit(page);
    expect(summary).toBeDefined();
    // These obsolete identifiers are not props of the existing summary component.
    expect(summary!.getText(page)).not.toMatch(/\b(?:savedLabId|labId|patientId)\b/);
    const js = ts.transpileModule(`(${summary!.getText(page)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
    }).outputText;
    const element = runInNewContext(js, {
      React, PatientSummary, labValues: {},
      interpretationResult: { patientSummary: "Synthetic male lab summary", patientSummaryGenerationStatus: "generated" },
    });
    expect(renderToStaticMarkup(element)).toContain("Synthetic male lab summary");
  });
});

describe("Actual Spruce rematch handler and authentication", () => {
  it("rejects unauthenticated requests before querying the database", async () => {
    const h = harness();
    const res = await h.invoke({ ...request(), isAuthenticated: () => false });
    expect(res.statusCode).toBe(401);
    expect(h.storageDb.select).not.toHaveBeenCalled();
  });
  it("rejects missing clinic context without reading patient information", async () => {
    const h = harness();
    expect((await h.invoke(request(null))).statusCode).toBe(400);
    expect(h.storageDb.select).not.toHaveBeenCalled();
  });
  it("uses the existing database alias and rematches only nonempty phones in the current clinic", async () => {
    const h = harness();
    const res = await h.invoke();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, patientsScanned: 1 });
    expect(h.storage.backfillSprucePatientLinks).toHaveBeenCalledExactlyOnceWith(10, 101, "synthetic-phone-one");
  });
  it("honors the existing session-scoped active clinic", async () => {
    const h = harness();
    expect((await h.invoke(request(10, { activeClinicId: 20 }))).statusCode).toBe(200);
    expect(h.storage.backfillSprucePatientLinks).toHaveBeenCalledExactlyOnceWith(20, 201, "synthetic-phone-two");
  });
  it("preserves staff authentication and clinic scoping", async () => {
    const h = harness();
    const req = { ...request(10, { staffId: 5, staffClinicianId: 8, staffClinicianClinicId: 20 }),
      isAuthenticated: () => false };
    expect((await h.invoke(req)).statusCode).toBe(200);
    expect(h.storage.backfillSprucePatientLinks).toHaveBeenCalledExactlyOnceWith(20, 201, "synthetic-phone-two");
  });
  it("returns the existing error response on database failure without rematching", async () => {
    const h = harness(true);
    expect((await h.invoke()).statusCode).toBe(500);
    expect(h.storage.backfillSprucePatientLinks).not.toHaveBeenCalled();
  });
  it("returns the existing error response on a backfill failure", async () => {
    const h = harness(false, true);
    expect((await h.invoke()).statusCode).toBe(500);
  });
});
