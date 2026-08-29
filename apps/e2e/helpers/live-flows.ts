import { expect, type Page } from "@playwright/test";
import {
  DEMO,
  demoChannelPath,
  demoCoworkersPath,
  demoTasksPath,
  hasProviderCredentials,
  missingProviderCredentials,
} from "./live";

export async function loginAsOwner(page: Page): Promise<void> {
  // API login via request context sets the session cookie without typing the fixture
  // password into the DOM (keeps Playwright traces cleaner for redaction scans).
  const origin = process.env.FORGEROOM_E2E_BASE_URL ?? "http://127.0.0.1:5173";
  const response = await page.request.post("/api/auth/login", {
    data: { email: DEMO.ownerEmail, password: DEMO.ownerPassword },
    headers: { Origin: origin, "content-type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(`login failed: ${response.status()} ${await response.text()}`);
  }
  await page.goto(demoChannelPath());
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({
    timeout: 30_000,
  });
}

export async function gotoDemoChannel(page: Page): Promise<void> {
  await page.goto(demoChannelPath());
  await expect(page.getByRole("heading", { name: `# ${DEMO.channelName}` })).toBeVisible({
    timeout: 30_000,
  });
}

export async function gotoDemoCoworkers(page: Page): Promise<void> {
  await page.goto(demoCoworkersPath());
  await expect(page.getByRole("heading", { name: "Coworkers" })).toBeVisible();
}

export async function gotoDemoTasks(page: Page): Promise<void> {
  await page.goto(demoTasksPath());
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

export async function assertLiveP0SurfacesAbsent(page: Page): Promise<void> {
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /component catalogue/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /coordinator/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /native subagent/i })).toHaveCount(0);
}

export async function createResearchCoworker(page: Page): Promise<void> {
  await gotoDemoCoworkers(page);
  await page
    .getByRole("button", { name: /new coworker/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /create a coworker/i });
  await expect(dialog).toBeVisible();
  const prompt = dialog.getByLabel(/What should this coworker own/i);
  await prompt.fill(DEMO.researchPrompt);
  await dialog.getByRole("button", { name: /generate review draft/i }).click();
  await expect(dialog.getByText(/Write tools \(blocked/i)).toBeVisible({ timeout: 120_000 });
  await expect(dialog.getByText(/Native child agents/i)).toBeVisible();
  await dialog.getByRole("button", { name: /Create Research/i }).click();
  await expect(page.getByText(/is ready/i)).toBeVisible({ timeout: 180_000 });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Coworkers" })).toBeVisible();
  await expect(page.getByText(/Research/i).first()).toBeVisible();
}

export async function sendTeamTask(page: Page): Promise<void> {
  await gotoDemoChannel(page);
  const composer = page.getByLabel("Message");
  await composer.fill(`@team ${DEMO.taskTitle}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible({ timeout: 60_000 });
}

/** Steps 5–15 after the Task is already in flight on the demo channel. */
export async function runProviderBackedNarrative(page: Page): Promise<void> {
  await gotoDemoChannel(page);

  // 5 — controlled DataTable / chart from Composio read
  await expect(
    page.getByRole("heading", { name: /Synthetic demo records|Synthetic record counts/i }).first(),
  ).toBeVisible({ timeout: 180_000 });

  // 6 — bounded ChoiceForm
  await expect(page.getByRole("heading", { name: /Filter synthetic records/i })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Apply filter" }).click();

  // 7 — ArtifactCard
  await expect(page.getByRole("heading", { name: /Sandbox summary/i })).toBeVisible({
    timeout: 180_000,
  });

  // 8 — trusted approval
  const approval = page.getByLabel("Trusted approval card");
  await expect(approval).toBeVisible({ timeout: 180_000 });

  // 9 — deny; expect host decision chrome (provider unchanged verified later via reconcile)
  await approval.getByRole("button", { name: "Deny" }).click();
  await expect(page.getByText(/Decision recorded/i).first()).toBeVisible({ timeout: 60_000 });

  // 10 — re-request: send a follow-up that should produce a new write proposal
  const composer = page.getByLabel("Message");
  await composer.fill(
    `@operator Retry the deterministic label update on the synthetic demo record after denial.`,
  );
  await page.getByRole("button", { name: "Send" }).click();

  const approvalAgain = page.getByLabel("Trusted approval card");
  await expect(approvalAgain).toBeVisible({ timeout: 180_000 });

  // 11 — refresh restores exact pending proposal
  await page.reload();
  await expect(page.getByLabel("Trusted approval card")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible();

  // 12 — approve
  await page.getByLabel("Trusted approval card").getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Decision recorded/i).first()).toBeVisible({ timeout: 60_000 });

  // 13 — reconcile / receipt path
  await expect(page.getByRole("button", { name: "Receipt" }).first()).toBeVisible({
    timeout: 180_000,
  });
  await page.getByRole("button", { name: "Receipt" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // 14 — save as skill
  await page.getByRole("button", { name: "Save as skill" }).click();
  await page.getByRole("button", { name: /Publish v1 and attach/i }).click();
  await expect(page.getByText(/Skill published and attached/i)).toBeVisible({ timeout: 180_000 });

  // 15 — lineage / P0 absences
  await assertLiveP0SurfacesAbsent(page);
}

export function requireProvidersOrSkip(test: {
  skip: (condition: boolean, description?: string) => void;
}): void {
  test.skip(!hasProviderCredentials(), "Provider credentials required for full live scenario");
}

export function assertProvidersConfigured(): void {
  const missing = missingProviderCredentials();
  if (missing.length > 0) {
    throw new Error(
      `FORGEROOM_E2E_LIVE=providers requires env: ${missing.join(", ")}. ` +
        `Copy values into .env (never commit). See apps/e2e/scripts/start-providers-stack.sh.`,
    );
  }
}
