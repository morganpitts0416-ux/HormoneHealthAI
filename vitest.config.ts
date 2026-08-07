import { defineConfig } from "vitest/config";
import path from "path";

// Unit-test config (CI-runnable, no live server needed).
// Only picks up tests/unit/** — the older tests in tests/*.test.ts are
// node:test-based integration tests that talk to a running server, and
// tests/e2e/** belongs to Playwright.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
