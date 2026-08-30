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

    // Channel membership mutates and can be restored in fixture mode.
    const removeAnalyst = page.locator('button[aria-label="Remove Analyst from channel"]');
    await removeAnalyst.locator("..").hover();
    await removeAnalyst.click();
    const addCoworker = page.getByLabel("Add coworker to channel");
    await expect(addCoworker.getByRole("option", { name: /Analyst/ })).toBeAttached();
    await addCoworker.selectOption("cw_analyst_002");
    await expect(page.getByText("Analyst").first()).toBeVisible();

    // Pinned context persists in the right-hand Context panel and can be removed.
    await page.getByRole("button", { name: "Pin message to channel context" }).first().click();
    await page.getByRole("tab", { name: "Context" }).click();
    await expect(page.getByText("1 items")).toBeVisible();
    await page.getByRole("button", { name: "Unpin" }).click();
    await expect(page.getByText("0 items")).toBeVisible();
    await page.getByRole("tab", { name: "Work" }).click();

    // Composer assignment creates both a channel message and an authoritative TaskRecord.
    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("@analyst Prepare launch checklist");
    await page.getByRole("button", { name: "Assign as task" }).click();
    await page.getByRole("button", { name: "Send and create task" }).click();
    await expect(composer).toHaveValue("");
    await gotoTasks(page);
    await expect(page.getByText("Prepare launch checklist").first()).toBeVisible();
    await gotoChannel(page);

    // Controlled GenUI chrome (fixture demo) — chart / table / artifact
    await expect(page.getByRole("heading", { name: "Escalation drivers" })).toBeVisible();
    const chartGroup = page.getByRole("group", { name: "Chart view" });
    await expect(chartGroup).toBeVisible();
    await chartGroup.getByRole("button", { name: "table" }).click();
    await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Support evidence" })).toBeVisible();
    await expect(page.getByLabel("Filter themes")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Support operations brief" })).toBeVisible();

    // Every visible rich-response control must produce a real state change, download, or route.
    await page.getByRole("button", { name: "View source" }).click();
    await expect(page.getByText(/428 synthetic conversations/i)).toBeVisible();

    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download full CSV" }).click();
    expect((await csvDownload).suggestedFilename()).toBe("support-evidence.csv");

    await page.getByRole("button", { name: "Open authenticated preview" }).click();
    await expect(
      page.getByRole("region", { name: "Authenticated support brief preview" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close preview" }).click();

    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    expect((await pdfDownload).suggestedFilename()).toBe("support-operations-brief.pdf");

    await page.getByRole("link", { name: "Open task →" }).click();
    await expect(page.getByRole("heading", { name: "Reduce billing escalations" })).toBeVisible();
    await gotoChannel(page);

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

    // Capability editor saves real model and exact-grant changes across refresh.
    await page.getByRole("link", { name: /Analyst/i }).click();
    await page.getByLabel("Model preset").fill("demo-fast");
    const toolGrants = page.getByLabel("Tool names");
    await toolGrants.fill(`${await toolGrants.inputValue()}\nSUPPORT_EXPORT`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(/Changes saved.*sessions will rotate/i)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Model preset")).toHaveValue("demo-fast");
    await expect(page.getByLabel("Tool names")).toHaveValue(/SUPPORT_EXPORT/);

    // Authoritative Task list
    await gotoTasks(page);
    await expect(page.getByText(/Reconcile the synthetic demo record/i).first()).toBeVisible();

    // Bounded choice on Operations channel
    await gotoChannel(page, FIXTURE.channelOps);
    await expect(page.getByRole("heading", { name: "# Operations" })).toBeVisible();
    const choiceHeading = page.getByText(/How should I continue/i);
    if (await choiceHeading.isVisible()) {
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByText(/Choice cancelled/i)).toBeVisible();
      await page.reload();
      await expect(page.getByText(/Choice cancelled/i)).toBeVisible();
      await page.getByRole("button", { name: "Choose again" }).click();
      await page.getByRole("button", { name: /Submit choice/i }).click();
      await expect(page.getByText(/Choice recorded: wait for reconnect/i)).toBeVisible();
    }

    // Demo receipt + save-as-skill entry (fixture work panel)
    await gotoChannel(page);
    await page.getByRole("button", { name: "Inspect run receipt" }).click();
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
