import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  PREFLIGHT_CHECK_IDS,
  buildPreflightReport,
  formatPreflightReport,
  inspectAgUiGraph,
  parseDotEnv,
} from "./preflight.mjs";

const repoRoot = resolve(import.meta.dirname, "..");

function localEnv(storageRoot) {
  return {
    NODE_ENV: "development",
    DATABASE_URL: "postgres://secret-user:secret-password@127.0.0.1:5432/forgeroom",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: "secret-owner-password",
    TRUEFORGE_BASE_URL: "http://127.0.0.1:8790",
    ARTIFACT_STORAGE_DIR: storageRoot,
  };
}

async function withTempStorage(callback) {
  const root = await mkdtemp(join(tmpdir(), "forgeroom-preflight-test-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("reports every required P0 surface while provider secrets are absent", async () => {
  await withTempStorage(async (storageRoot) => {
    const report = await buildPreflightReport({
      root: repoRoot,
      env: localEnv(storageRoot),
      databaseProbe: async () => true,
      trueForgeProbe: async () => true,
      now: new Date("2026-08-29T18:00:00.000Z"),
    });

    assert.deepEqual(
      report.checks.map((item) => item.id),
      PREFLIGHT_CHECK_IDS,
    );
    assert.equal(report.localReady, true);
    assert.equal(report.providerReady, false);
    assert.equal(report.checks.find((item) => item.id === "database")?.status, "reachable");
    assert.equal(report.checks.find((item) => item.id === "auth")?.status, "verified");
    assert.equal(report.checks.find((item) => item.id === "trueforge")?.status, "reachable");
    assert.equal(report.checks.find((item) => item.id === "model")?.status, "blocked");
    assert.equal(report.checks.find((item) => item.id === "daytona")?.status, "blocked");
    assert.equal(report.checks.find((item) => item.id === "composio")?.status, "blocked");
    assert.equal(
      report.checks.find((item) => item.id === "agent_spec_approvals")?.status,
      "verified",
    );
    assert.equal(report.checks.find((item) => item.id === "storage")?.status, "verified");
    assert.equal(report.checks.find((item) => item.id === "worker")?.status, "configured");
    assert.equal(report.checks.find((item) => item.id === "ag_ui_graph")?.status, "verified");
    assert.equal(
      report.checks.find((item) => item.id === "component_registry")?.status,
      "verified",
    );
    assert.equal(
      report.checks.find((item) => item.id === "coworker_task_skill")?.status,
      "verified",
    );
    assert.equal(report.checks.find((item) => item.id === "p1_disabled")?.status, "verified");

    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /secret-user|secret-password|secret-owner-password/u);
  });
});

test("distinguishes configured provider inputs from live verification", async () => {
  await withTempStorage(async (storageRoot) => {
    const report = await buildPreflightReport({
      root: repoRoot,
      env: {
        ...localEnv(storageRoot),
        OPENAI_API_KEY: "secret-openai",
        DAYTONA_API_KEY: "secret-daytona",
        COMPOSIO_API_KEY: "secret-composio",
        COMPOSIO_CONNECTED_ACCOUNT_ID: "account-ends-nizY",
        COMPOSIO_USER_ID: "secret-user-id",
        FORGEROOM_E2E_GITHUB_OWNER: "pramodthe",
        FORGEROOM_E2E_GITHUB_REPOSITORY: "ForgeRoom",
      },
      databaseProbe: async () => true,
      trueForgeProbe: async () => true,
    });

    assert.equal(report.providerReady, true);
    assert.equal(report.checks.find((item) => item.id === "model")?.status, "configured");
    assert.equal(report.checks.find((item) => item.id === "daytona")?.status, "configured");
    assert.equal(report.checks.find((item) => item.id === "composio")?.status, "configured");
    const output = formatPreflightReport(report);
    assert.match(output, /configured=inputs present but live behavior not proven/u);
    assert.doesNotMatch(
      output,
      /secret-openai|secret-daytona|secret-composio|account-ends-nizY|secret-user-id/u,
    );
  });
});

test("marks configured but unreachable local dependencies as not ready", async () => {
  await withTempStorage(async (storageRoot) => {
    const report = await buildPreflightReport({
      root: repoRoot,
      env: localEnv(storageRoot),
      databaseProbe: async () => false,
      trueForgeProbe: async () => false,
    });
    assert.equal(report.localReady, false);
    assert.equal(report.checks.find((item) => item.id === "database")?.status, "configured");
    assert.equal(report.checks.find((item) => item.id === "database")?.ready, false);
    assert.equal(report.checks.find((item) => item.id === "trueforge")?.status, "configured");
    assert.equal(report.checks.find((item) => item.id === "trueforge")?.ready, false);
  });
});

test("loads simple .env syntax without executing shell expressions", () => {
  assert.deepEqual(
    parseDotEnv(`
# comment
PLAIN=value
QUOTED="value with spaces"
export SINGLE='literal value'
COMMENTED=safe # ignored
SHELL=$(do-not-run)
`),
    {
      PLAIN: "value",
      QUOTED: "value with spaces",
      SINGLE: "literal value",
      COMMENTED: "safe",
      SHELL: "$(do-not-run)",
    },
  );
});

test("accepts the checked-in pure AG-UI package graph", () => {
  assert.equal(inspectAgUiGraph(repoRoot), true);
});
