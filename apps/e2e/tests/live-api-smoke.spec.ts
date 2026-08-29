import { expect, test } from "@playwright/test";
import { DEMO, liveMode } from "../helpers/live";
import {
  assertLiveP0SurfacesAbsent,
  gotoDemoChannel,
  gotoDemoCoworkers,
  gotoDemoTasks,
  loginAsOwner,
} from "../helpers/live-flows";
import { scanPlaywrightArtifacts } from "../helpers/trace-redaction";

/**
 * Seeded-API smoke: no COMPOSIO/DAYTONA/OPENAI required.
 * Enable with FORGEROOM_E2E_LIVE=api (or providers).
 */
test.describe("P0-504 live API smoke (seeded DB)", () => {
  test.skip(liveMode() === "off", "Set FORGEROOM_E2E_LIVE=api (or 1) against seeded API + web");

  test("login, seeded channel, coworkers/tasks navigation, P0 absences", async ({
    page,
  }, testInfo) => {
    await loginAsOwner(page);
    await gotoDemoChannel(page);
    await expect(page.getByRole("heading", { name: `# ${DEMO.channelName}` })).toBeVisible();
    await expect(page.getByText("Workspace service account")).toBeVisible();
    await expect(page.getByText(/Operator/i).first()).toBeVisible();
    await expect(page.getByLabel("Message")).toBeVisible();
    await assertLiveP0SurfacesAbsent(page);

    await gotoDemoCoworkers(page);
    await expect(page.getByRole("button", { name: /new coworker/i }).first()).toBeVisible();
    await page
      .getByRole("button", { name: /new coworker/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: /create a coworker/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/What should this coworker own/i)).toHaveValue(/Research/i);
    await page.keyboard.press("Escape");

    await gotoDemoTasks(page);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.getByRole("button", { name: /new task/i }).first()).toBeVisible();

    await assertLiveP0SurfacesAbsent(page);
    await testInfo.attach("live-api-final", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test.afterAll(() => {
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
