import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
    globalSetup: ["./test/postgres-harness.ts"],
    // One database, shared by every spec, and specs truncate it between cases — so they
    // must not run at the same time as each other.
    fileParallelism: false,
    // initdb + migrate deploy on a cold run is comfortably past vitest's 60s default.
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
