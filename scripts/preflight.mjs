#!/usr/bin/env node

import { createConnection } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PREFLIGHT_CHECK_IDS = [
  "database",
  "auth",
  "trueforge",
  "model",
  "daytona",
  "composio",
  "agent_spec_approvals",
  "storage",
  "worker",
  "ag_ui_graph",
  "component_registry",
  "coworker_task_skill",
  "p1_disabled",
];

const AG_UI_VERSION = "0.0.57";
const DIRECT_TOOLS = [
  "GITHUB_GET_AN_ISSUE",
  "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
];
const APPROVAL_TOOLS = ["GITHUB_ADD_LABELS_TO_AN_ISSUE", "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE"];
const AGENT_COMPONENTS = ["ArtifactCard", "BarOrLineChart", "ChoiceForm", "DataTable", "TaskCard"];
const SERVER_COMPONENTS = ["ApprovalCard", "ConnectionCard", "RequiredQuestionCard"];

function check(id, label, scope, status, ready, detail) {
  return { id, label, scope, status, ready, detail };
}

function valuePresent(env, name) {
  return typeof env[name] === "string" && env[name].trim().length > 0;
}

function jsonAt(root, relativePath) {
  try {
    return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
  } catch {
    return null;
  }
}

function sortedStrings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").sort((a, b) => a.localeCompare(b))
    : [];
}

function sameStrings(left, right) {
  return JSON.stringify(sortedStrings(left)) === JSON.stringify(sortedStrings(right));
}

export function parseDotEnv(source) {
  const parsed = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;
    let value = match[2] ?? "";
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, "").trim();
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

export function loadPreflightEnv(root, explicitEnv = process.env) {
  let fromFile = {};
  try {
    fromFile = parseDotEnv(readFileSync(join(root, ".env"), "utf8"));
  } catch {
    // A clean clone may not have .env yet; the report will identify missing configuration.
  }
  return { ...fromFile, ...explicitEnv };
}

export async function probeTcpUrl(urlText, timeoutMs = 2_000) {
  let url;
  try {
    url = new URL(urlText);
  } catch {
    return false;
  }
  const port = Number(url.port || (url.protocol === "postgres:" ? 5432 : 0));
  if (!url.hostname || !Number.isInteger(port) || port <= 0 || port > 65_535) return false;
  return new Promise((resolveProbe) => {
    const socket = createConnection({ host: url.hostname, port });
    const finish = (result) => {
      socket.destroy();
      resolveProbe(result);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

export async function probeTrueForge(baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 2_000) {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  for (const path of ["/health", "/"]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/u, "")}${path}`, {
        headers,
        signal: controller.signal,
      });
      if (response.ok) return true;
    } catch {
      // Try the fallback endpoint without including network details in the report.
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

export async function probeStorage(root, configuredPath) {
  const storageRoot = configuredPath
    ? resolve(root, configuredPath)
    : join(root, ".data", "artifacts");
  const probePath = join(storageRoot, `.forgeroom-preflight-${process.pid}`);
  try {
    await mkdir(storageRoot, { recursive: true });
    await writeFile(probePath, "forgeroom-preflight\n", { flag: "wx" });
    await rm(probePath, { force: true });
    return true;
  } catch {
    await rm(probePath, { force: true }).catch(() => undefined);
    return false;
  }
}

export function inspectAgUiGraph(root) {
  const packageJson = jsonAt(root, "packages/integrations/ag-ui/package.json");
  let lockfile = "";
  try {
    lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  } catch {
    return false;
  }
  if (
    packageJson?.dependencies?.["@ag-ui/core"] !== AG_UI_VERSION ||
    packageJson?.dependencies?.["@ag-ui/client"] !== AG_UI_VERSION
  ) {
    return false;
  }
  const coreVersions = [
    ...new Set(
      [...lockfile.matchAll(/^\s{2}'?@ag-ui\/core@([^':]+)'?:\s*$/gmu)].map((match) => match[1]),
    ),
  ];
  const clientVersions = [
    ...new Set(
      [...lockfile.matchAll(/^\s{2}'?@ag-ui\/client@([^':]+)'?:\s*$/gmu)].map((match) => match[1]),
    ),
  ];
  return (
    sameStrings(coreVersions, [AG_UI_VERSION]) &&
    sameStrings(clientVersions, [AG_UI_VERSION]) &&
    !lockfile.includes("@copilotkit/") &&
    !/canary/iu.test(coreVersions.concat(clientVersions).join(" "))
  );
}

function inspectAgentSpecApprovals(root) {
  const fixture = jsonAt(root, "provider-fixtures/composio/preflight.verified.json");
  return Boolean(
    fixture?.status === "verified" &&
    fixture?.descriptorHashes?.matched === true &&
    sameStrings(fixture?.compiledAllowlist?.enabledTools, DIRECT_TOOLS) &&
    sameStrings(fixture?.compiledAllowlist?.approvalRequiredTools, APPROVAL_TOOLS) &&
    existsSync(join(root, "packages/integrations/trueforge/src/agent-spec-verification.ts")),
  );
}

function inspectComponentRegistry(root) {
  const profile = jsonAt(root, "provider-fixtures/p0-feature-profile.json");
  let source = "";
  try {
    source = readFileSync(join(root, "packages/domain/src/components/registry.ts"), "utf8");
  } catch {
    return false;
  }
  const declared = [...source.matchAll(/name:\s*"([A-Za-z0-9]+)"/gu)].map((match) => match[1]);
  return (
    profile?.disabled?.componentCatalogueExpansion?.value === false &&
    sameStrings(
      profile?.disabled?.componentCatalogueExpansion?.allowedAgentTools,
      AGENT_COMPONENTS,
    ) &&
    [...AGENT_COMPONENTS, ...SERVER_COMPONENTS].every((name) => declared.includes(name)) &&
    existsSync(join(root, "provider-fixtures/controlled-ui/datatable.fixture.json")) &&
    existsSync(join(root, "provider-fixtures/controlled-ui/bar-or-line-chart.fixture.json")) &&
    existsSync(join(root, "provider-fixtures/controlled-ui/choice-form-filter.fixture.json")) &&
    existsSync(join(root, "provider-fixtures/controlled-ui/task-card.fixture.json")) &&
    existsSync(join(root, "provider-fixtures/controlled-ui/artifact-card.fixture.json"))
  );
}

function inspectCoworkerTaskSkill(root) {
  const coworker = jsonAt(
    root,
    "provider-fixtures/coworkers/conversational-research-draft.candidate.json",
  );
  const task = jsonAt(root, "provider-fixtures/tasks/task-record.candidate.json");
  const skill = jsonAt(root, "provider-fixtures/tasks/save-as-skill.candidate.json");
  return Boolean(
    coworker?.expectedProposal?.native_subagents_enabled === false &&
    coworker?.expectedPermissionPreview?.exactDiff &&
    task?.status === "verified" &&
    task?.idempotentReset?.status === "verified" &&
    skill?.status === "verified" &&
    skill?.skillVersion?.instructionOnly === true &&
    skill?.skillVersion?.newAuthority === false &&
    existsSync(join(root, "apps/api/src/workspace/coworker-drafts.ts")) &&
    existsSync(join(root, "apps/api/src/tasks/index.ts")) &&
    existsSync(join(root, "apps/api/src/skills/publish.ts")),
  );
}

function inspectP1Disabled(root, agUiVerified) {
  const profile = jsonAt(root, "provider-fixtures/p0-feature-profile.json");
  return Boolean(
    profile?.status === "frozen" &&
    profile?.compiledAgentSpec?.dynamic_sub_agents === false &&
    profile?.disabled?.nativeSubagents?.value === false &&
    profile?.disabled?.coordinatorSynthesis?.value === false &&
    profile?.disabled?.componentCatalogueExpansion?.value === false &&
    profile?.disabled?.iframe_v1?.value === false &&
    profile?.disabled?.copilotKitGateway?.value === "disabled_unless_parity" &&
    agUiVerified,
  );
}

function inspectComposio(root, env) {
  const preflight = jsonAt(root, "provider-fixtures/composio/preflight.verified.json");
  const tools = jsonAt(root, "provider-fixtures/composio/tools.candidate.json");
  const configNames = [
    "COMPOSIO_API_KEY",
    "COMPOSIO_CONNECTED_ACCOUNT_ID",
    "COMPOSIO_USER_ID",
    "FORGEROOM_E2E_GITHUB_OWNER",
    "FORGEROOM_E2E_GITHUB_REPOSITORY",
  ];
  const configured = configNames.every((name) => valuePresent(env, name));
  const fixtureVerified = Boolean(
    preflight?.status === "verified" &&
    preflight?.pinnedAccount?.status === "ACTIVE" &&
    preflight?.descriptorHashes?.matched === true &&
    sameStrings(preflight?.compiledAllowlist?.enabledTools, DIRECT_TOOLS) &&
    tools?.syntheticProviderFixture?.status === "verified",
  );
  const suffixMatches =
    configured &&
    typeof preflight?.pinnedAccount?.redactedSuffix === "string" &&
    env.COMPOSIO_CONNECTED_ACCOUNT_ID.trim().endsWith(preflight.pinnedAccount.redactedSuffix);
  const targetMatches =
    configured &&
    env.FORGEROOM_E2E_GITHUB_OWNER === tools?.syntheticProviderFixture?.owner &&
    env.FORGEROOM_E2E_GITHUB_REPOSITORY === tools?.syntheticProviderFixture?.repo;
  return { configured, fixtureVerified, suffixMatches, targetMatches };
}

export async function buildPreflightReport(options = {}) {
  const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const env = options.env ?? loadPreflightEnv(root);
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  const trueForgeBaseUrl = env.TRUEFORGE_BASE_URL?.trim() || "http://127.0.0.1:8790";
  const [databaseReachable, trueForgeReachable, storageWritable] = await Promise.all([
    databaseUrl ? (options.databaseProbe ?? probeTcpUrl)(databaseUrl) : Promise.resolve(false),
    (options.trueForgeProbe ?? probeTrueForge)(
      trueForgeBaseUrl,
      env.TRUEFORGE_API_KEY?.trim() || "",
    ),
    (options.storageProbe ?? probeStorage)(root, env.ARTIFACT_STORAGE_DIR?.trim() || ""),
  ]);

  const database = !databaseUrl
    ? check("database", "Database", "both", "blocked", false, "DATABASE_URL is missing.")
    : databaseReachable
      ? check(
          "database",
          "Database",
          "both",
          "reachable",
          true,
          "PostgreSQL TCP endpoint is reachable; schema gates remain in test:integration.",
        )
      : check(
          "database",
          "Database",
          "both",
          "configured",
          false,
          "DATABASE_URL is configured but its endpoint is not reachable.",
        );

  const production = env.NODE_ENV === "production";
  const authBypass = env.AUTH_BYPASS === "true";
  const hasLocalCredential =
    valuePresent(env, "OWNER_PASSWORD_HASH") || valuePresent(env, "OWNER_PASSWORD");
  const authValid =
    !authBypass &&
    hasLocalCredential &&
    (!production ||
      (valuePresent(env, "OWNER_PASSWORD_HASH") &&
        !valuePresent(env, "OWNER_PASSWORD") &&
        env.AUTH_STORE !== "memory"));
  const auth = authValid
    ? check(
        "auth",
        "Application auth",
        "both",
        "verified",
        true,
        "Owner credential mode and production bypass rules are valid.",
      )
    : check(
        "auth",
        "Application auth",
        "both",
        "blocked",
        false,
        "Owner credentials are missing or the selected auth mode is unsafe.",
      );

  const trueforge = trueForgeReachable
    ? check(
        "trueforge",
        "TrueForge",
        "both",
        "reachable",
        true,
        "TrueForge health/root endpoint is reachable.",
      )
    : check(
        "trueforge",
        "TrueForge",
        "both",
        "configured",
        false,
        "TRUEFORGE_BASE_URL is configured/defaulted but not reachable.",
      );

  const modelConfigured =
    valuePresent(env, "OPENAI_API_KEY") || valuePresent(env, "MODEL_PROVIDER_API_KEY");
  const model = modelConfigured
    ? check(
        "model",
        "Model provider",
        "provider",
        "configured",
        true,
        "OpenAI credential is configured; a live TrueForge model turn is required for verification.",
      )
    : check(
        "model",
        "Model provider",
        "provider",
        "blocked",
        false,
        "No model credential is configured; harness settings are not inferred.",
      );

  const daytonaFixture = jsonAt(root, "provider-fixtures/daytona/sample-artifact.verified.json");
  const daytonaConfigured = valuePresent(env, "DAYTONA_API_KEY");
  const daytonaEvidence =
    daytonaFixture?.daytonaSdkProbe?.status === "verified" &&
    daytonaFixture?.credentialCanary?.absent === true;
  const daytona =
    daytonaConfigured && daytonaEvidence
      ? check(
          "daytona",
          "Daytona",
          "provider",
          "configured",
          true,
          "Credential is configured and redacted sandbox fixture evidence is valid; no sandbox was created.",
        )
      : check(
          "daytona",
          "Daytona",
          "provider",
          "blocked",
          false,
          daytonaConfigured
            ? "Credential is configured but required redacted fixture evidence is invalid."
            : "DAYTONA_API_KEY is missing; local static checks still run.",
        );

  const composioInspection = inspectComposio(root, env);
  const composioReady = Object.values(composioInspection).every(Boolean);
  const composio = composioReady
    ? check(
        "composio",
        "Composio account/tools",
        "provider",
        "configured",
        true,
        "Pinned account, synthetic target and credentials match redacted verified tool fixtures; current account health is not probed.",
      )
    : check(
        "composio",
        "Composio account/tools",
        "provider",
        "blocked",
        false,
        composioInspection.configured
          ? "Configured values do not match the redacted pinned-account/tool fixture."
          : "Required Composio account/tool configuration is incomplete; local fixtures were still checked.",
      );

  const approvalsVerified = inspectAgentSpecApprovals(root);
  const approvals = approvalsVerified
    ? check(
        "agent_spec_approvals",
        "AgentSpec approvals",
        "both",
        "verified",
        true,
        "Exact direct-tool and write-approval sets match verified descriptor evidence.",
      )
    : check(
        "agent_spec_approvals",
        "AgentSpec approvals",
        "both",
        "blocked",
        false,
        "Compiled allowlist/approval evidence is missing or inconsistent.",
      );

  const storage = storageWritable
    ? check(
        "storage",
        "Artifact storage",
        "both",
        "verified",
        true,
        "Local artifact directory passed a write/remove probe.",
      )
    : check(
        "storage",
        "Artifact storage",
        "both",
        "blocked",
        false,
        "Local artifact directory is not writable.",
      );

  const workerPresent =
    existsSync(join(root, "apps/worker/src/main.ts")) &&
    existsSync(join(root, "apps/worker/src/index.ts")) &&
    existsSync(join(root, "apps/worker/package.json"));
  const worker = workerPresent
    ? check(
        "worker",
        "Worker",
        "both",
        "configured",
        true,
        env.FORGEROOM_EMBED_WORKER === "false"
          ? "Standalone worker entrypoint is present; live queue heartbeat is exercised by integration/E2E gates."
          : "Embedded worker is selected by default; live queue heartbeat is exercised by integration/E2E gates.",
      )
    : check("worker", "Worker", "both", "blocked", false, "Worker entrypoint is missing.");

  const agUiVerified = inspectAgUiGraph(root);
  const agUi = agUiVerified
    ? check(
        "ag_ui_graph",
        "AG-UI package graph",
        "local",
        "verified",
        true,
        "Core/client resolve only to 0.0.57 and no CopilotKit package is present.",
      )
    : check(
        "ag_ui_graph",
        "AG-UI package graph",
        "local",
        "blocked",
        false,
        "Pinned AG-UI graph is mixed, missing, canary, or contains CopilotKit.",
      );

  const componentVerified = inspectComponentRegistry(root);
  const components = componentVerified
    ? check(
        "component_registry",
        "Fixed component registry",
        "local",
        "verified",
        true,
        "Five agent tools, three trusted host cards and controlled fixtures are fixed.",
      )
    : check(
        "component_registry",
        "Fixed component registry",
        "local",
        "blocked",
        false,
        "Registry/profile/controlled fixture set is incomplete or expanded.",
      );

  const domainReady = inspectCoworkerTaskSkill(root);
  const coworkerTaskSkill = domainReady
    ? check(
        "coworker_task_skill",
        "CoworkerDraft, Task and skill",
        "local",
        "verified",
        true,
        "Local production surfaces and bounded fixture manifests are present and internally consistent.",
      )
    : check(
        "coworker_task_skill",
        "CoworkerDraft, Task and skill",
        "local",
        "blocked",
        false,
        "One or more production surfaces or bounded fixture manifests are missing/inconsistent.",
      );

  const p1Verified = inspectP1Disabled(root, agUiVerified);
  const p1 = p1Verified
    ? check(
        "p1_disabled",
        "P1 capabilities disabled",
        "local",
        "verified",
        true,
        "Native subagents, synthesis, catalogue expansion, iframe_v1 and CopilotKit remain disabled.",
      )
    : check(
        "p1_disabled",
        "P1 capabilities disabled",
        "local",
        "blocked",
        false,
        "Frozen P1-disable profile or dependency closure is inconsistent.",
      );

  const checks = [
    database,
    auth,
    trueforge,
    model,
    daytona,
    composio,
    approvals,
    storage,
    worker,
    agUi,
    components,
    coworkerTaskSkill,
    p1,
  ];
  const localChecks = checks.filter((item) => item.scope === "local" || item.scope === "both");
  const providerChecks = checks.filter(
    (item) => item.scope === "provider" || item.scope === "both",
  );
  const counts = Object.fromEntries(
    ["verified", "reachable", "configured", "blocked"].map((status) => [
      status,
      checks.filter((item) => item.status === status).length,
    ]),
  );
  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    localReady: localChecks.every((item) => item.ready),
    providerReady: providerChecks.every((item) => item.ready),
    counts,
    checks,
  };
}

export function formatPreflightReport(report) {
  const lines = [
    "ForgeRoom P0 preflight",
    `Local readiness: ${report.localReady ? "READY" : "BLOCKED"}`,
    `Provider readiness: ${report.providerReady ? "READY TO TEST" : "BLOCKED"}`,
    "",
  ];
  for (const item of report.checks) {
    lines.push(`${item.ready ? "PASS" : "BLOCK"}  ${item.label} [${item.status}] — ${item.detail}`);
  }
  lines.push(
    "",
    "Status meanings: verified=local invariant/evidence checked; reachable=endpoint answered; configured=inputs present but live behavior not proven; blocked=missing, inconsistent, or unreachable requirement.",
    "No secret values are included in this report.",
  );
  return lines.join("\n");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const report = await buildPreflightReport({ root, env: loadPreflightEnv(root) });
  process.stdout.write(
    args.has("--json")
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatPreflightReport(report)}\n`,
  );
  if (!report.localReady || (args.has("--require-providers") && !report.providerReady)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
