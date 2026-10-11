import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runReadOnlyStartupValidation } from "../../server/startup-safety";
describe("Read-only application startup", () => {
  it("only invokes metadata validation and never calls broad migration or chart cleanup", async () => {
    const validate = vi.fn(async () => {});
    await runReadOnlyStartupValidation(validate);
    expect(validate).toHaveBeenCalledTimes(1);
    const source = readFileSync("server/index.ts", "utf8");
    expect(source).not.toMatch(/await\s+ensureSchema\s*\(/);
    expect(source).not.toMatch(/await\s+cleanupObjectObjectChartEntries\s*\(/);
  });
});
