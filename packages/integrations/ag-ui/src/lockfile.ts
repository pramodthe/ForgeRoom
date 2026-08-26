import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "@forgeroom/test-fixtures";

export type AgUiLockfileInspection = {
  ok: boolean;
  resolvedVersions: Record<string, string[]>;
  violations: string[];
};

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
};

const SELECTED_AG_UI_VERSIONS = {
  "@ag-ui/core": "0.0.57",
  "@ag-ui/client": "0.0.57",
} as const;

export function repoRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  return findRepoRoot({ from });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const TRACKED_PACKAGES = ["@ag-ui/core", "@ag-ui/client"] as const;
const BASELINE_VERSION = SELECTED_AG_UI_VERSIONS["@ag-ui/core"];

function collectScopedPackageVersions(
  lockfile: string,
  scopePrefix: string,
): Record<string, Set<string>> {
  const escaped = scopePrefix.replace("/", "\\/");
  const pattern = new RegExp(`'(${escaped}[^']+)@([^']+)'`, "g");
  const resolved: Record<string, Set<string>> = {};
  for (const match of lockfile.matchAll(pattern)) {
    const pkg = match[1];
    const version = match[2];
    if (!pkg || !version) continue;
    (resolved[pkg] ??= new Set()).add(version);
  }
  return resolved;
}

function collectTrackedVersions(lockfile: string): Record<string, Set<string>> {
  const allAgUi = collectScopedPackageVersions(lockfile, "@ag-ui/");
  return Object.fromEntries(TRACKED_PACKAGES.map((pkg) => [pkg, new Set(allAgUi[pkg] ?? [])]));
}

function inspectTransitiveClosure(lockfileContent: string): string[] {
  const violations: string[] = [];

  for (const [pkg, versions] of Object.entries(
    collectScopedPackageVersions(lockfileContent, "@copilotkit/"),
  )) {
    violations.push(
      `forbidden CopilotKit package in lockfile transitive closure: ${pkg}@${[...versions].sort().join(", ")}`,
    );
  }

  for (const [pkg, versions] of Object.entries(
    collectScopedPackageVersions(lockfileContent, "@ag-ui/"),
  )) {
    const sorted = [...versions].sort();
    if (sorted.some((version) => version.includes("canary"))) {
      violations.push(`canary AG-UI package prohibited: ${pkg}`);
    }
    if (sorted.length > 1) {
      violations.push(`duplicate ${pkg} versions in lockfile: ${sorted.join(", ")}`);
    } else if (sorted.length === 1 && sorted[0] !== BASELINE_VERSION) {
      violations.push(`${pkg} must resolve to ${BASELINE_VERSION}; found ${sorted[0]}`);
    }
  }

  return violations;
}

export function inspectAgUiLockfile(options?: {
  root?: string;
  lockfileContent?: string;
}): AgUiLockfileInspection {
  const root = options?.root ?? repoRoot();
  const lockfileContent =
    options?.lockfileContent ?? readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  const rootPackageJson = readJson<PackageJson>(join(root, "package.json"));
  const violations: string[] = [...inspectTransitiveClosure(lockfileContent)];
  const resolvedVersions = collectTrackedVersions(lockfileContent);

  for (const pkg of TRACKED_PACKAGES) {
    const versions = [...(resolvedVersions[pkg] ?? new Set<string>())].sort();
    const expected = SELECTED_AG_UI_VERSIONS[pkg];
    if (versions.length === 0) {
      violations.push(`missing lockfile resolution for ${pkg}@${expected}`);
    }
  }

  const agUiOverrides = Object.entries(rootPackageJson.pnpm?.overrides ?? {})
    .filter(([name]) => /^@ag-ui\//.test(name))
    .map(([name, version]) => `${name}=${version}`);
  if (agUiOverrides.length > 0) {
    violations.push(
      `pnpm overrides for AG-UI packages are prohibited: ${agUiOverrides.join(", ")}`,
    );
  }

  const apiPackage = readJson<PackageJson>(join(root, "apps/api/package.json"));
  const apiDeps = [
    ...Object.keys(apiPackage.dependencies ?? {}),
    ...Object.keys(apiPackage.devDependencies ?? {}),
  ];
  if (apiDeps.includes("@copilotkit/runtime")) {
    violations.push("forbidden CopilotKit runtime in server graph: @copilotkit/runtime");
  }

  return {
    ok: violations.length === 0,
    resolvedVersions: Object.fromEntries(
      Object.entries(resolvedVersions).map(([pkg, versions]) => [pkg, [...versions].sort()]),
    ),
    violations,
  };
}

export function assertAgUiLockfileSingleResolution(options?: {
  root?: string;
  lockfileContent?: string;
}): void {
  const inspection = inspectAgUiLockfile(options);
  if (!inspection.ok) {
    throw new Error(`AG-UI lockfile inspection failed: ${inspection.violations.join("; ")}`);
  }
}
