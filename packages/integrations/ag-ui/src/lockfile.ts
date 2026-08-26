import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SELECTED_AG_UI_VERSIONS } from "./profile";

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

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    try {
      readFileSync(join(dir, "pnpm-workspace.yaml"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error("Could not find repository root");
}

export function repoRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  return findRepoRoot(from);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const TRACKED_PACKAGES = ["@ag-ui/core", "@ag-ui/client"] as const;

function collectResolvedVersions(lockfile: string): Record<string, Set<string>> {
  const resolved: Record<string, Set<string>> = {
    "@ag-ui/core": new Set(),
    "@ag-ui/client": new Set(),
  };
  for (const pkg of TRACKED_PACKAGES) {
    const pattern = new RegExp(`'${pkg.replace("/", "\\/")}@([^']+)'`, "g");
    for (const match of lockfile.matchAll(pattern)) {
      const version = match[1];
      if (version) resolved[pkg]?.add(version);
    }
  }
  return resolved;
}

export function inspectAgUiLockfile(options?: {
  root?: string;
  lockfileContent?: string;
}): AgUiLockfileInspection {
  const root = options?.root ?? repoRoot();
  const lockfileContent =
    options?.lockfileContent ?? readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  const rootPackageJson = readJson<PackageJson>(join(root, "package.json"));
  const violations: string[] = [];
  const resolvedVersions = collectResolvedVersions(lockfileContent);

  for (const pkg of TRACKED_PACKAGES) {
    const versions = [...(resolvedVersions[pkg] ?? new Set<string>())].sort();
    const expected = SELECTED_AG_UI_VERSIONS[pkg];
    if (versions.length === 0) violations.push(`missing lockfile resolution for ${pkg}@${expected}`);
    else if (versions.length > 1)
      violations.push(`duplicate ${pkg} versions in lockfile: ${versions.join(", ")}`);
    else if (!versions.includes(expected))
      violations.push(`${pkg} must resolve to ${expected}; found ${versions.join(", ")}`);
  }

  const agUiOverrides = Object.entries(rootPackageJson.pnpm?.overrides ?? {})
    .filter(([name]) => /^@ag-ui\//.test(name))
    .map(([name, version]) => `${name}=${version}`);
  if (agUiOverrides.length > 0)
    violations.push(`pnpm overrides for AG-UI packages are prohibited: ${agUiOverrides.join(", ")}`);
  if (/@ag-ui\/(core|client)@canary/.test(lockfileContent))
    violations.push("canary AG-UI packages are prohibited");

  const apiPackage = readJson<PackageJson>(join(root, "apps/api/package.json"));
  const apiDeps = [
    ...Object.keys(apiPackage.dependencies ?? {}),
    ...Object.keys(apiPackage.devDependencies ?? {}),
  ];
  if (apiDeps.includes("@copilotkit/runtime"))
    violations.push("forbidden CopilotKit runtime in server graph: @copilotkit/runtime");

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
  if (!inspection.ok)
    throw new Error(`AG-UI lockfile inspection failed: ${inspection.violations.join("; ")}`);
}
