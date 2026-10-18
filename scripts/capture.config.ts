// Runs the showcase capture (scripts/capture-showcase.ts) under Vitest, which
// already resolves the project's TypeScript sources the way the tests do.
//
//   npx vitest run --config scripts/capture.config.ts

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/capture-showcase.ts"],
    environment: "node",
    testTimeout: 600_000,
  },
});
