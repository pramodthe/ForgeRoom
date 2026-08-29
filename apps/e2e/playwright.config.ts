import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.FORGEROOM_E2E_BASE_URL ?? "http://127.0.0.1:5173";
const live = process.env.FORGEROOM_E2E_LIVE === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on",
    screenshot: "only-on-failure",
    video: "off",
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  },
  projects: [
    {
      name: "prototype-chromium",
      testMatch: /prototype-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(live
      ? [
          {
            name: "live-chromium",
            testMatch: /complete-scenario\.spec\.ts/,
            use: { ...devices["Desktop Chrome"] },
          },
        ]
      : []),
  ],
  webServer: live
    ? undefined
    : {
        command:
          "pnpm --filter @forgeroom/web exec vite --mode prototype --host 127.0.0.1 --port 5173",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        cwd: "/workspace",
      },
});
