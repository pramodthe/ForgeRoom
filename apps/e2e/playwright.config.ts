import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { SAFE_TRACE_CONTENT_OPTIONS } from "./helpers/trace-redaction";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = join(repoRoot, ".env");
if (existsSync(envFile)) {
  const controlKeys = [
    "FORGEROOM_E2E_LIVE",
    "FORGEROOM_E2E_BASE_URL",
    "FORGEROOM_E2E_EXTERNAL_STACK",
    "FORGEROOM_E2E_API_PORT",
    "FORGEROOM_E2E_WEB_PORT",
    "FORGEROOM_E2E_OWNER_PASSWORD",
  ] as const;
  const controls = new Map(controlKeys.map((key) => [key, process.env[key]]));
  loadEnvFile(envFile);
  for (const key of controlKeys) {
    const value = controls.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  process.env.FORGEROOM_E2E_OWNER_PASSWORD ??= "correct-horse-battery";
}

const apiPort = process.env.FORGEROOM_E2E_API_PORT ?? "3100";
const webPort = process.env.FORGEROOM_E2E_WEB_PORT ?? "5273";
if (!/^\d{2,5}$/.test(apiPort) || !/^\d{2,5}$/.test(webPort)) {
  throw new Error("FORGEROOM_E2E_API_PORT and FORGEROOM_E2E_WEB_PORT must be numeric ports");
}
const baseURL = process.env.FORGEROOM_E2E_BASE_URL ?? `http://127.0.0.1:${webPort}`;
process.env.FORGEROOM_E2E_BASE_URL = baseURL;
const liveRaw = process.env.FORGEROOM_E2E_LIVE?.trim();
const liveProviders = liveRaw === "1" || liveRaw === "providers";
const liveApi = liveRaw === "api" || liveProviders;
const externalStack = process.env.FORGEROOM_E2E_EXTERNAL_STACK === "1";

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
    trace: { mode: "on", ...SAFE_TRACE_CONTENT_OPTIONS },
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
  webServer: externalStack
    ? undefined
    : liveProviders
      ? {
          command: "bash apps/e2e/scripts/start-providers-stack.sh",
          url: baseURL,
          env: {
            PORT: apiPort,
            FORGEROOM_E2E_WEB_PORT: webPort,
            FORGEROOM_E2E_BASE_URL: baseURL,
            FORGEROOM_E2E_OWNER_PASSWORD:
              process.env.FORGEROOM_E2E_OWNER_PASSWORD ?? "correct-horse-battery",
          },
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
          cwd: repoRoot,
        }
      : liveApi
        ? {
            command: "bash apps/e2e/scripts/start-live-stack.sh",
            url: baseURL,
            env: {
              PORT: apiPort,
              FORGEROOM_E2E_WEB_PORT: webPort,
              FORGEROOM_E2E_BASE_URL: baseURL,
              FORGEROOM_E2E_OWNER_PASSWORD:
                process.env.FORGEROOM_E2E_OWNER_PASSWORD ?? "correct-horse-battery",
            },
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            cwd: repoRoot,
          }
        : {
            command: `pnpm --filter @forgeroom/web exec vite --mode prototype --host 127.0.0.1 --port ${webPort} --strictPort`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            cwd: repoRoot,
          },
});
