import { describe, expect, it } from "vitest";
import { inspectAgUiLockfile, repoRoot } from "./lockfile";

describe("inspectAgUiLockfile", () => {
  it("accepts a single 0.0.57 resolution for core and client", () => {
    const lockfileContent = `
packages:
  '@ag-ui/core@0.0.57':
    resolution: {integrity: sha512-example}
  '@ag-ui/client@0.0.57':
    resolution: {integrity: sha512-example}
`;
    const inspection = inspectAgUiLockfile({ root: repoRoot(), lockfileContent });
    expect(inspection.ok).toBe(true);
    expect(inspection.resolvedVersions["@ag-ui/core"]).toEqual(["0.0.57"]);
    expect(inspection.resolvedVersions["@ag-ui/client"]).toEqual(["0.0.57"]);
  });

  it("rejects duplicate AG-UI versions", () => {
    const lockfileContent = `
packages:
  '@ag-ui/core@0.0.57':
    resolution: {integrity: sha512-a}
  '@ag-ui/core@0.0.54':
    resolution: {integrity: sha512-b}
  '@ag-ui/client@0.0.57':
    resolution: {integrity: sha512-c}
`;
    const inspection = inspectAgUiLockfile({ root: repoRoot(), lockfileContent });
    expect(inspection.ok).toBe(false);
    expect(inspection.violations.join(" ")).toMatch(/duplicate @ag-ui\/core/);
  });

  it("rejects canary AG-UI packages", () => {
    const lockfileContent = `
packages:
  '@ag-ui/client@canary':
    resolution: {integrity: sha512-canary}
  '@ag-ui/core@0.0.57':
    resolution: {integrity: sha512-core}
  '@ag-ui/client@0.0.57':
    resolution: {integrity: sha512-client}
`;
    const inspection = inspectAgUiLockfile({ root: repoRoot(), lockfileContent });
    expect(inspection.ok).toBe(false);
    expect(inspection.violations.join(" ")).toMatch(/canary/);
  });
});
