import { expect, type Page } from "@playwright/test";
import { channelPath, coworkersPath, FIXTURE, tasksPath } from "./routes";

export async function gotoChannel(
  page: Page,
  channelId: string = FIXTURE.channelGeneral,
): Promise<void> {
  await page.goto(channelPath(channelId));
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

export async function gotoCoworkers(page: Page): Promise<void> {
  await page.goto(coworkersPath());
  await expect(page.getByRole("heading", { name: /coworker/i }).first()).toBeVisible();
}

export async function gotoTasks(page: Page): Promise<void> {
  await page.goto(tasksPath());
  await expect(page.getByRole("heading", { name: /task/i }).first()).toBeVisible();
}

export async function assertP0SurfacesAbsent(page: Page): Promise<void> {
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /component catalogue/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /coordinator/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /native subagent/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /component catalogue/i })).toHaveCount(0);
}
