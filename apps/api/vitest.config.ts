import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // API suites provision and migrate isolated PostgreSQL databases. Under the
    // exact recursive release command those setup-heavy tests run alongside all
    // workspace suites, so Vitest's 5-second unit-test default is too short.
    testTimeout: 60_000,
  },
});
