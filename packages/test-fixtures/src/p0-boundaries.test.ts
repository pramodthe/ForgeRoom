import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isForbiddenP0101Dependency } from "./index";

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pnpm?: { overrides?: Record<string, string> };
};

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("Could not find repository root");
}

function packageJsonFiles(root: string): string[] {
  const groups = [
    join(root, "package.json"),
    ...listPackageJson(join(root, "apps")),
    ...listPackageJson(join(root, "packages")),
    ...listPackageJson(join(root, "packages", "integrations")),
    ...listPackageJson(join(root, "packages", "ui")),
  ];
  return groups.filter((path) => existsSync(path));
}

function listPackageJson(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(dir, entry.name, "package.json"));
}

function dependencyNames(pkg: PackageJson): string[] {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.pnpm?.overrides ?? {}),
  ];
}

describe("P0-101 package boundaries", () => {
  it("allows AG-UI only in @forgeroom/ag-ui and forbids CopilotKit everywhere", () => {
    const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    const violations: string[] = [];
    for (const file of packageJsonFiles(root)) {
      const pkg = JSON.parse(readFileSync(file, "utf8")) as PackageJson;
      for (const name of dependencyNames(pkg)) {
        if (isForbiddenP0101Dependency(name, pkg.name)) {
          violations.push(`${pkg.name ?? file}: ${name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
