import { expect, test } from "@playwright/test";
import {
  assertP0SurfacesAbsent,
  gotoChannel,
  gotoCoworkers,
  gotoTasks,
} from "../helpers/prototype";
import { FIXTURE } from "../helpers/routes";
import { scanPlaywrightArtifacts } from "../helpers/trace-redaction";

test.describe("P0-504 prototype smoke (fixture mode)", () => {
  test("covers seeded channel, Research coworker, GenUI chrome, approval, skill receipt", async ({
    page,
  }, testInfo) => {
    await gotoChannel(page);
    await expect(page.getByRole("heading", { name: "# General" })).toBeVisible();
    await expect(page.getByText("Workspace service account")).toBeVisible();
    await expect(page.getByText("Operator").first()).toBeVisible();
    await expect(page.getByText("Analyst").first()).toBeVisible();
    await assertP0SurfacesAbsent(page);

    // Controlled GenUI chrome (fixture demo) — chart / table / artifact
    await expect(page.getByRole("heading", { name: "Escalation drivers" })).toBeVisible();
    const chartGroup = page.getByRole("group", { name: "Chart view" });
    await expect(chartGroup).toBeVisible();
    await chartGroup.getByRole("button", { name: "table" }).click();
    await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Support evidence" })).toBeVisible();
    await expect(page.getByLabel("Filter themes")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Support operations brief" })).toBeVisible();

    // Trusted-host-shaped approval on Operator rich response
    const deny = page.getByRole("button", { name: "Deny" });
    if (await deny.isVisible()) {
      await deny.click();
      await expect(page.getByText(/Fixture decision recorded: denied/i)).toBeVisible();
    }

    // Research coworker builder with exact denials
    await gotoCoworkers(page);
    await page.getByRole("button", { name: /new coworker/i }).click();
    const dialog = page.getByRole("dialog", { name: /create a coworker/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("textbox")).toContainText(/Research coworker/i);
    await dialog.getByRole("button", { name: /generate review draft/i }).click();
    await expect(dialog.getByText(/Write tools \(blocked/i)).toBeVisible();
    await expect(dialog.getByText(/Native child agents/i)).toBeVisible();
    await dialog.getByRole("button", { name: /Create Researcher/i }).click();
    await expect(page.getByText(/Researcher is ready/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Done" }).click();

    // Authoritative Task list
    await gotoTasks(page);
    await expect(page.getByText(/Reconcile the synthetic demo record/i).first()).toBeVisible();

    // Bounded choice on Operations channel
    await gotoChannel(page, FIXTURE.channelOps);
    await expect(page.getByRole("heading", { name: "# Operations" })).toBeVisible();
    const choiceHeading = page.getByText(/How should I continue/i);
    if (await choiceHeading.isVisible()) {
      await page.getByRole("button", { name: /Submit choice/i }).click();
    }

    // Demo receipt + save-as-skill entry (fixture work panel)
    await gotoChannel(page);
    await page.getByRole("button", { name: "Open demo run receipt" }).click();
    await expect(
      page.getByRole("dialog", { name: /Weekly support operations review/i }),
    ).toBeVisible();
    await expect(page.getByText(/Run receipt · run_4A91/i)).toBeVisible();
    await expect(page.getByText(/no child agents/i)).toBeVisible();
    const saveSkill = page.getByRole("button", { name: /Save completed work as skill/i });
    await expect(saveSkill).toBeVisible();
    await saveSkill.click();
    const publish = page.getByRole("button", { name: /Publish v1 and attach/i });
    await expect(publish).toBeVisible();
    await publish.click();
    await expect(page.getByText(/Skill published and attached/i)).toBeVisible({
      timeout: 20_000,
    });

    await assertP0SurfacesAbsent(page);

    // Capture evidence without fixed sleeps — wait on network idle after last UI action
    await page.waitForLoadState("networkidle");
    await testInfo.attach("prototype-final", {
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
