// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

describe("Encounter-only release startup and build safety", () => {
  it("does not call schema reconciliation or chart cleanup at startup", () => {
    const source = ts.createSourceFile("index.ts", readFileSync("server/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const calls: string[] = [];
    const sessionSchemaOptions: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.push(node.expression.text);
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === "createTableIfMissing") {
        sessionSchemaOptions.push(node.initializer.getText(source));
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(calls).not.toContain("ensureSchema");
    expect(calls).not.toContain("cleanupObjectObjectChartEntries");
    expect(calls).toContain("validateSchemaDrift");
    expect(sessionSchemaOptions).toEqual(["false"]);
  });

  it("has no package lifecycle schema push and suppresses dependency setup lifecycle scripts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    for (const name of ["preinstall", "install", "postinstall", "prepare", "prebuild", "build", "postbuild", "prestart", "start"]) {
      expect(pkg.scripts?.[name] ?? "").not.toMatch(/db:push|drizzle-kit|prod-migrate|ensureSchema/);
    }
    const hook = readFileSync("scripts/post-merge.sh", "utf8")
      .split("\n").filter(line => !line.trimStart().startsWith("#")).join("\n");
    expect(hook).toContain("npm ci --ignore-scripts");
    expect(hook).not.toMatch(/db:push|drizzle-kit|psql/);
  });

  it("has no dependency on temporary transfer or permanent multi-clinic modules", () => {
    for (const path of ["server/index.ts", "server/routes.ts", "server/storage.ts", "shared/schema.ts", "client/src/App.tsx"]) {
      expect(readFileSync(path, "utf8")).not.toMatch(/portal-transfer|portal_transfer_|portal-clinic-service|PATIENT_PORTAL_TEMPORARY_TRANSFER/);
    }
  });
});
