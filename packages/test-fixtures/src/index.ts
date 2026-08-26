import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  barOrLineChartPropsSchema,
  artifactCardPropsSchema,
  choiceFormPropsSchema,
  dataTablePropsSchema,
  interpretP0Capability,
  taskCardPropsSchema,
} from "@forgeroom/contracts";

const AG_UI_ALLOWED_PACKAGES = new Set(["@forgeroom/ag-ui"]);

export const FORBIDDEN_P0_101_DEPENDENCY_PATTERNS = [/^@copilotkit\//, /copilotkit/i] as const;

export function isForbiddenP0101Dependency(name: string, packageName?: string): boolean {
  if (/^@ag-ui\//.test(name)) {
    return !packageName || !AG_UI_ALLOWED_PACKAGES.has(packageName);
  }
  return FORBIDDEN_P0_101_DEPENDENCY_PATTERNS.some((pattern) => pattern.test(name));
}

function walkUpForRepoRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    try {
      readFileSync(join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        return null;
      }
      dir = parent;
    }
  }
}

export type RepoRootOptions = {
  from?: string;
  env?: NodeJS.ProcessEnv;
};

export function findRepoRoot(options?: RepoRootOptions): string {
  const env = options?.env ?? process.env;
  const starts: string[] = [];

  if (env.FORGEROOM_REPO_ROOT && env.FORGEROOM_REPO_ROOT.length > 0) {
    starts.push(env.FORGEROOM_REPO_ROOT);
  }
  starts.push(process.cwd());
  starts.push(options?.from ?? dirname(fileURLToPath(import.meta.url)));

  for (const start of starts) {
    const root = walkUpForRepoRoot(start);
    if (root) {
      return root;
    }
  }
  throw new Error("Could not find repository root");
}

export function providerFixturesRoot(options?: RepoRootOptions): string {
  return join(findRepoRoot(options), "provider-fixtures");
}

export function readProviderFixtureJson<T = unknown>(
  relativePath: string,
  options?: RepoRootOptions,
): T {
  const absolute = join(providerFixturesRoot(options), relativePath);
  return JSON.parse(readFileSync(absolute, "utf8")) as T;
}

type FeatureProfile = {
  status: string;
  disabled: {
    nativeSubagents: { value: boolean };
    coordinatorSynthesis: { value: boolean };
    componentCatalogueExpansion: { value: boolean; allowedAgentTools: string[] };
    iframe_v1: { value: boolean };
    copilotKitGateway: { value: string };
  };
};

export function loadP0FeatureProfile(): FeatureProfile {
  return readProviderFixtureJson<FeatureProfile>("p0-feature-profile.json");
}

export function assertP0FeatureProfileFrozen(profile = loadP0FeatureProfile()): void {
  if (profile.status !== "frozen") {
    throw new Error("P0 feature profile must be frozen");
  }
  const { disabled } = profile;
  if (disabled.nativeSubagents.value !== false) {
    throw new Error("native subagents must be disabled");
  }
  if (disabled.coordinatorSynthesis.value !== false) {
    throw new Error("coordinator synthesis must be disabled");
  }
  if (disabled.componentCatalogueExpansion.value !== false) {
    throw new Error("component catalogue expansion must be disabled");
  }
  if (disabled.iframe_v1.value !== false) {
    throw new Error("iframe_v1 must be disabled");
  }
  if (disabled.copilotKitGateway.value !== "disabled_unless_parity") {
    throw new Error("CopilotKit gateway must be disabled_unless_parity");
  }
  for (const capability of [
    "native_subagent",
    "coordinator_synthesis",
    "coordinator_planning",
    "component_catalogue",
    "iframe_v1",
  ]) {
    if (interpretP0Capability(capability).ok) {
      throw new Error(`${capability} must be unsupported in P0`);
    }
  }
}

type ControlledUiFixture = {
  componentName: string;
  props: unknown;
};

export function loadControlledUiFixtures(): ControlledUiFixture[] {
  return [
    readProviderFixtureJson("controlled-ui/datatable.fixture.json"),
    readProviderFixtureJson("controlled-ui/bar-or-line-chart.fixture.json"),
    readProviderFixtureJson("controlled-ui/task-card.fixture.json"),
    readProviderFixtureJson("controlled-ui/artifact-card.fixture.json"),
    readProviderFixtureJson("controlled-ui/choice-form-filter.fixture.json"),
  ];
}

const propParsers = {
  DataTable: dataTablePropsSchema,
  BarOrLineChart: barOrLineChartPropsSchema,
  TaskCard: taskCardPropsSchema,
  ArtifactCard: artifactCardPropsSchema,
  ChoiceForm: choiceFormPropsSchema,
} as const;

export function assertControlledUiFixturesValid(fixtures = loadControlledUiFixtures()): void {
  for (const fixture of fixtures) {
    const parser = propParsers[fixture.componentName as keyof typeof propParsers];
    if (!parser) {
      throw new Error(`unexpected controlled UI fixture component ${fixture.componentName}`);
    }
    parser.parse(fixture.props);
  }
}
