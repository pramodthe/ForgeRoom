import { test } from "@playwright/test";

/**
 * Full 15-step live scenario from test-plan.md.
 * Enable with FORGEROOM_E2E_LIVE=1 against a seeded API + providers.
 * Slice 1 ships the gated shell; live steps land as credentials and seed IDs stabilize.
 */
test.describe("P0-504 complete browser scenario (live)", () => {
  test.skip(
    process.env.FORGEROOM_E2E_LIVE !== "1",
    "Set FORGEROOM_E2E_LIVE=1 for provider-backed E2E",
  );

  test("executes every numbered test-plan step", async () => {
    test.fail(true, "Live provider scenario implementation follows prototype smoke (slice 1).");
  });
});
