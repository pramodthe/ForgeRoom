import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.FORGEROOM_E2E_BASE_URL ?? "http://127.0.0.1:5173";
const liveRaw = process.env.FORGEROOM_E2E_LIVE?.trim();
const liveProviders = liveRaw === "1" || liveRaw === "providers";
const liveApi = liveRaw === "api" || liveProviders;
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: liveProviders ? 240_000 : 90_000,
  expect: { timeout: liveProviders ? 30_000 : 15_000 },
  use: {
    baseURL,
    trace: "on",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  },
  projects: [
    // Prototype fixture mode must not share the live API webServer (different seed IDs).
    ...(liveApi || liveProviders
      ? []
      : [
          {
            name: "prototype-chromium",
            testMatch: /prototype-.*\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]),
    ...(liveApi
      ? [
          {
            name: "live-api-chromium",
            testMatch: /live-api-.*\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
    ...(liveProviders
      ? [
          {
            name: "live-providers-chromium",
            testMatch: /complete-scenario\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
    // When LIVE=api, still run complete-scenario soft-skip path for structure coverage
    ...(liveRaw === "api"
      ? [
          {
            name: "live-scenario-api-chromium",
            testMatch: /complete-scenario\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
  ],
  webServer: liveProviders
    ? undefined
    : liveApi
      ? {
          command: "bash apps/e2e/scripts/start-live-stack.sh",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          cwd: repoRoot,
        }
      : {
          command:
            "pnpm --filter @forgeroom/web exec vite --mode prototype --host 127.0.0.1 --port 5173",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          cwd: repoRoot,
        },
});
