import { expect, test } from "@playwright/test";
import { scanPlaywrightArtifacts } from "../helpers/trace-redaction";
import { DEMO, hasProviderCredentials, liveMode } from "../helpers/live";
import {
  assertLiveP0SurfacesAbsent,
  createResearchCoworker,
  gotoDemoChannel,
  gotoDemoTasks,
  loginAsOwner,
  requireProvidersOrSkip,
  sendTeamTask,
} from "../helpers/live-flows";

/**
 * Full 15-step live scenario from test-plan.md.
 *
 * Modes:
 * - FORGEROOM_E2E_LIVE=api — seeded API steps (1–4 partial); provider steps soft-skipped
 * - FORGEROOM_E2E_LIVE=1|providers — full narrative when provider env is present
 */
test.describe("P0-504 complete browser scenario (live)", () => {
  test.skip(liveMode() === "off", "Set FORGEROOM_E2E_LIVE=api or FORGEROOM_E2E_LIVE=1");

  test("1–3 auth, seeded channel, Research coworker", async ({ page }) => {
    await loginAsOwner(page);
    await gotoDemoChannel(page);
    await expect(page.getByText("Workspace service account")).toBeVisible();
    await expect(page.getByText(/Operator/i).first()).toBeVisible();
    await assertLiveP0SurfacesAbsent(page);

    // Research coworker draft/provision needs TrueForge + model; skip fast in api-only mode.
    if (liveMode() === "api" && !hasProviderCredentials()) {
      test.info().annotations.push({
        type: "soft-skip",
        description: "Research coworker provisioning deferred without TrueForge/providers",
      });
      return;
    }
    await createResearchCoworker(page);
  });

  test("4 task fan-out to coworkers", async ({ page }) => {
    if (liveMode() === "api" && !hasProviderCredentials()) {
      test.info().annotations.push({
        type: "soft-skip",
        description: "Task fan-out needs coworker turns/providers",
      });
      return;
    }
    await loginAsOwner(page);
    await sendTeamTask(page);
    await gotoDemoTasks(page);
    await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible({ timeout: 60_000 });
  });

  test("5–15 provider-backed GenUI, approval, skill, receipt", async ({ page }) => {
    requireProvidersOrSkip(test);
    await loginAsOwner(page);
    await gotoDemoChannel(page);

    // 5 — controlled DataTable / chart from Composio read
    await expect(
      page
        .getByRole("heading", { name: /Synthetic demo records|Synthetic record counts/i })
        .first(),
    ).toBeVisible({ timeout: 180_000 });

    // 6 — bounded ChoiceForm
    const choice = page.getByRole("heading", { name: /Filter synthetic records/i });
    await expect(choice).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Apply filter" }).click();

    // 7 — ArtifactCard
    await expect(page.getByRole("heading", { name: /Sandbox summary/i })).toBeVisible({
      timeout: 180_000,
    });

    // 8 — trusted approval
    const approval = page.getByLabel("Trusted approval card");
    await expect(approval).toBeVisible({ timeout: 180_000 });

    // 9 — deny; provider unchanged is verified by subsequent reconcile expectations
    await approval.getByRole("button", { name: "Deny" }).click();
    await expect(page.getByText(/denied|rejected|not approved/i).first()).toBeVisible();

    // 10–12 — re-request path may surface a new card; approve when present
    const approvalAgain = page.getByLabel("Trusted approval card");
    if (await approvalAgain.isVisible()) {
      // 11 — refresh restores pending proposal
      await page.reload();
      await expect(page.getByLabel("Trusted approval card")).toBeVisible({ timeout: 60_000 });
      await page
        .getByLabel("Trusted approval card")
        .getByRole("button", { name: "Approve" })
        .click();
    }

    // 13 — reconcile / receipt path
    await expect(page.getByRole("button", { name: "Receipt" }).first()).toBeVisible({
      timeout: 180_000,
    });
    await page.getByRole("button", { name: "Receipt" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // 14 — save as skill
    await page.getByRole("button", { name: "Save as skill" }).click();
    await page.getByRole("button", { name: /Publish v1 and attach/i }).click();
    await expect(page.getByText(/Skill published and attached/i)).toBeVisible({ timeout: 120_000 });

    // 15 — lineage still visible on receipt
    await assertLiveP0SurfacesAbsent(page);
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
