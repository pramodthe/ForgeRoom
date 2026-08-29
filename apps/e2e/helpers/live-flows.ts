import { expect, type Page } from "@playwright/test";
import {
  DEMO,
  demoChannelPath,
  demoCoworkersPath,
  demoTasksPath,
  hasProviderCredentials,
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
  await page.getByRole("button", { name: /new coworker/i }).click();
  const dialog = page.getByRole("dialog", { name: /create a coworker/i });
  await expect(dialog).toBeVisible();
  const prompt = dialog.getByLabel(/What should this coworker own/i);
  await prompt.fill(DEMO.researchPrompt);
  await dialog.getByRole("button", { name: /generate review draft/i }).click();
  await expect(dialog.getByText(/Write tools \(blocked/i)).toBeVisible({ timeout: 60_000 });
  await expect(dialog.getByText(/Native child agents/i)).toBeVisible();
  await dialog.getByRole("button", { name: /Create Research/i }).click();
  await expect(page.getByText(/is ready/i)).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Done" }).click();
}

export async function sendTeamTask(page: Page): Promise<void> {
  await gotoDemoChannel(page);
  const composer = page.getByLabel("Message");
  await composer.fill(`@team ${DEMO.taskTitle}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(DEMO.taskTitle).first()).toBeVisible({ timeout: 60_000 });
}

export function requireProvidersOrSkip(test: {
  skip: (condition: boolean, description?: string) => void;
}): void {
  test.skip(!hasProviderCredentials(), "Provider credentials required for full live scenario");
}
