import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateVitestReleaseResult, withTemporaryVitestReport } from "./release-suite-report.mjs";

const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.error(
    `ForgeRoom release suites require Node >=22.12.0; current runtime is ${process.versions.node}.`,
  );
  process.exit(1);
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const vitestCli = join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
const workspaceDirectories = {
  "@forgeroom/ag-ui": "packages/integrations/ag-ui",
  "@forgeroom/api": "apps/api",
  "@forgeroom/artifacts": "packages/integrations/artifacts",
  "@forgeroom/composio": "packages/integrations/composio",
  "@forgeroom/contracts": "packages/contracts",
  "@forgeroom/db": "packages/db",
  "@forgeroom/domain": "packages/domain",
  "@forgeroom/e2e": "apps/e2e",
  "@forgeroom/orchestration": "packages/orchestration",
  "@forgeroom/trueforge": "packages/integrations/trueforge",
  "@forgeroom/ui-components": "packages/ui/components",
  "@forgeroom/ui-components-mcp": "packages/integrations/ui-components-mcp",
  "@forgeroom/web": "apps/web",
};

const suites = {
  integration: [
    { package: "@forgeroom/db", files: [".integration.test.ts"], workers: 4 },
    { package: "@forgeroom/api", files: [".integration.test.ts"], workers: 4 },
    {
      package: "@forgeroom/orchestration",
      files: [
        "src/create-or-reconcile-turn.test.ts",
        "src/pause-resume.test.ts",
        "src/real-read.test.ts",
        "src/deterministic-write.test.ts",
        "src/sandbox.test.ts",
        "src/session-provisioner.test.ts",
        "src/session-rotator.test.ts",
      ],
    },
    {
      package: "@forgeroom/ag-ui",
      files: [
        "src/adapter.test.ts",
        "src/persisted.test.ts",
        "src/stream-parser.test.ts",
        "src/upstream.test.ts",
      ],
    },
    {
      package: "@forgeroom/composio",
      files: [
        "src/connections.test.ts",
        "src/deterministic-write.test.ts",
        "src/manifest-verification.test.ts",
        "src/real-read.test.ts",
      ],
    },
    {
      package: "@forgeroom/trueforge",
      files: ["src/client.test.ts", "src/mcp-connector.test.ts", "src/sandbox.test.ts"],
    },
    { package: "@forgeroom/artifacts", files: ["src/extraction.test.ts"] },
    { package: "@forgeroom/ui-components-mcp", files: ["src/protocol.test.ts"] },
  ],
  security: [
    {
      package: "@forgeroom/contracts",
      files: [
        "src/commands.test.ts",
        "src/components.test.ts",
        "src/payload-safety.test.ts",
        "src/unsupported.test.ts",
      ],
    },
    {
      package: "@forgeroom/domain",
      files: [
        "src/approvals/decision.test.ts",
        "src/auth.test.ts",
        "src/components/grants.test.ts",
        "src/components/registry.test.ts",
        "src/coworkers/drafts.test.ts",
        "src/skills/draft.test.ts",
        "src/skills/publish.test.ts",
        "src/tasks/grants.test.ts",
        "src/transitions.test.ts",
      ],
    },
    {
      package: "@forgeroom/db",
      workers: 4,
      files: [
        "src/component-grant-rotation-gateway.integration.test.ts",
        "src/component-registry.integration.test.ts",
        "src/component-tool-gateway.integration.test.ts",
        "src/constraints.integration.test.ts",
        "src/p0-exclusions.test.ts",
        "src/pause-crypto.test.ts",
        "src/pause-group.integration.test.ts",
        "src/pause-resume.integration.test.ts",
        "src/retained-data-grants.test.ts",
        "src/session-rotation.integration.test.ts",
        "src/skill-bindings.integration.test.ts",
        "src/skill-drafts.integration.test.ts",
        "src/turn-lifecycle.integration.test.ts",
        "src/ui-interactions.integration.test.ts",
      ],
    },
    {
      package: "@forgeroom/orchestration",
      files: [
        "src/capability-intersection.test.ts",
        "src/context-envelope.test.ts",
        "src/create-or-reconcile-turn.test.ts",
        "src/deterministic-write.test.ts",
        "src/pause-group.test.ts",
        "src/pause-resume.test.ts",
        "src/sandbox.test.ts",
        "src/session-rotator.test.ts",
      ],
    },
    {
      package: "@forgeroom/ag-ui",
      files: [
        "src/copilotkit-policy.test.ts",
        "src/persisted.test.ts",
        "src/profile.test.ts",
        "src/upstream.test.ts",
      ],
    },
    {
      package: "@forgeroom/composio",
      files: [
        "src/deterministic-write.test.ts",
        "src/manifest-verification.test.ts",
        "src/real-read.test.ts",
        "src/tool-policies/tool-policies.test.ts",
      ],
    },
    {
      package: "@forgeroom/trueforge",
      files: ["src/mcp-connector.test.ts", "src/sandbox.test.ts"],
    },
    {
      package: "@forgeroom/ui-components-mcp",
      files: ["src/credentials.test.ts", "src/protocol.test.ts"],
    },
    {
      package: "@forgeroom/api",
      workers: 4,
      files: [
        "src/ag-ui/routes.test.ts",
        "src/approvals/decisions.test.ts",
        "src/auth/rate-limit.test.ts",
        "src/components/grant-rotation.test.ts",
        "src/mcp/ui-components-routes.test.ts",
        "src/questions/answers.test.ts",
        "src/server.test.ts",
        "src/skills/draft-turn.test.ts",
        "src/tasks/task-tool.test.ts",
        "src/ui-instances/p0-exclusions.test.ts",
        "src/ui-instances/ui-instances.test.ts",
        "src/workspace/coworker-drafts.test.ts",
        "src/workspace/coworker-drafts.integration.test.ts",
        "src/workspace/session-provision.test.ts",
      ],
    },
    {
      package: "@forgeroom/web",
      files: [
        "src/ag-ui/credentialed-agui-client.test.ts",
        "src/pages/review-flow-helpers.test.ts",
        "src/shell/pause-group-lifecycle.test.ts",
        "src/shell/trusted-hitl-host.test.ts",
      ],
    },
    {
      package: "@forgeroom/ui-components",
      files: [
        "src/a11y/controlled-fixture-a11y.test.tsx",
        "src/component-host.test.ts",
        "src/controlled/artifact-download.test.ts",
        "src/controlled/presentation-limits.test.ts",
        "src/controlled/validate-props.test.ts",
      ],
    },
    { package: "@forgeroom/e2e", files: ["helpers/trace-redaction.test.ts"] },
  ],
};

const suiteName = process.argv[2];
const selected = suites[suiteName];
if (!selected) {
  console.error(`Usage: node scripts/run-release-suite.mjs ${Object.keys(suites).join("|")}`);
  process.exit(2);
}

function runGroup(group) {
  console.log(`\n[${suiteName}] ${group.package}`);
  const workspaceDirectory = workspaceDirectories[group.package];
  if (!workspaceDirectory) {
    throw new Error(`Release suite has no workspace directory for ${group.package}.`);
  }
  withTemporaryVitestReport((reportPath) => {
    const args = [
      vitestCli,
      "run",
      ...group.files,
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${reportPath}`,
    ];
    if (group.workers) {
      args.push(`--maxWorkers=${group.workers}`);
    }
    const result = spawnSync(process.execPath, args, {
      cwd: join(repositoryRoot, workspaceDirectory),
      stdio: "inherit",
      env: process.env,
    });
    validateVitestReleaseResult({
      packageName: group.package,
      result,
      readReport: () => readFileSync(reportPath, "utf8"),
    });
  });
}

try {
  for (const group of selected) {
    runGroup(group);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
