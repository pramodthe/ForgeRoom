import { expect, test } from "@playwright/test";
import { scanPlaywrightArtifacts } from "../helpers/trace-redaction";
import { DEMO, hasProviderCredentials, liveMode } from "../helpers/live";
import {
  assertLiveP0SurfacesAbsent,
  assertProvidersConfigured,
  createResearchCoworker,
  gotoDemoChannel,
  gotoDemoTasks,
  loginAsOwner,
  resetProviderFixture,
  runProviderBackedNarrative,
  sendTeamTask,
} from "../helpers/live-flows";

/**
 * Full 15-step live scenario from test-plan.md.
 *
 * Modes:
 * - FORGEROOM_E2E_LIVE=api — seeded API structure; provider steps soft-skipped
 * - FORGEROOM_E2E_LIVE=1|providers — one serial narrative (requires provider env + TrueForge)
 */
test.describe("P0-504 complete browser scenario (live)", () => {
  test.skip(liveMode() === "off", "Set FORGEROOM_E2E_LIVE=api or FORGEROOM_E2E_LIVE=1");

  test.beforeEach(() => {
    if (liveMode() === "providers") {
      assertProvidersConfigured();
      resetProviderFixture();
    }
  });

  test.afterEach(() => {
    if (liveMode() === "providers") {
      assertProvidersConfigured();
      resetProviderFixture();
    }
  });

  test("api structure: auth, channel, soft-skip providers", async ({ page }) => {
    test.skip(liveMode() !== "api", "api-mode structure coverage only");

    await loginAsOwner(page);
    await gotoDemoChannel(page);
    await expect(page.getByText("Workspace service account")).toBeVisible();
    await expect(page.getByText(/Operator/i).first()).toBeVisible();
    await assertLiveP0SurfacesAbsent(page);

    test.info().annotations.push({
      type: "soft-skip",
      description: "Research/task/GenUI/approval deferred to FORGEROOM_E2E_LIVE=providers",
    });
  });

  test("providers: full 15-step demo narrative", async ({ page }, testInfo) => {
    test.skip(liveMode() !== "providers", "Set FORGEROOM_E2E_LIVE=1|providers");
    assertProvidersConfigured();

    // 1–2 auth + seeded channel
    await loginAsOwner(page);
    await gotoDemoChannel(page);
    await expect(page.getByText("Workspace service account")).toBeVisible();
    await expect(page.getByText(/Operator/i).first()).toBeVisible();
    await assertLiveP0SurfacesAbsent(page);

    // 3 Research coworker
    await createResearchCoworker(page);

    // 4 task fan-out
    const runId = await sendTeamTask(page);
    await gotoDemoTasks(page);
    await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible({ timeout: 60_000 });

    // 5–15 GenUI → deny → refresh → approve → skill → receipt
    await runProviderBackedNarrative(page, runId);

    await testInfo.attach("providers-final", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test.afterAll(() => {
    if (liveMode() === "providers" && !hasProviderCredentials()) {
      return;
    }
    const scan = scanPlaywrightArtifacts([
      "test-results",
      "playwright-report",
      "apps/e2e/test-results",
      "apps/e2e/playwright-report",
    ]);
    expect(scan.hits, `Forbidden secret patterns in traces: ${JSON.stringify(scan.hits)}`).toEqual(
      [],
    );
  });
});
