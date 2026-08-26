import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertControlledUiFixturesValid,
  assertP0FeatureProfileFrozen,
  findRepoRoot,
  isForbiddenP0101Dependency,
  loadP0FeatureProfile,
  readProviderFixtureJson,
} from "./index";

describe("isForbiddenP0101Dependency", () => {
  it("allows AG-UI packages only in @forgeroom/ag-ui", () => {
    expect(isForbiddenP0101Dependency("@ag-ui/core")).toBe(true);
    expect(isForbiddenP0101Dependency("@ag-ui/core", "@forgeroom/ag-ui")).toBe(false);
    expect(isForbiddenP0101Dependency("@ag-ui/client", "@forgeroom/ag-ui")).toBe(false);
    expect(isForbiddenP0101Dependency("@ag-ui/core", "@forgeroom/api")).toBe(true);
    expect(isForbiddenP0101Dependency("@copilotkit/runtime")).toBe(true);
    expect(isForbiddenP0101Dependency("zod")).toBe(false);
  });
});

describe("findRepoRoot", () => {
  it("resolves the repository from FORGEROOM_REPO_ROOT when module path is outside checkout", () => {
    const actualRoot = findRepoRoot();
    expect(
      findRepoRoot({
        from: "/tmp/forgeroom-bundle/dist",
        env: { FORGEROOM_REPO_ROOT: actualRoot },
      }),
    ).toBe(actualRoot);
    expect(() =>
      readProviderFixtureJson("p0-feature-profile.json", {
        from: "/tmp/forgeroom-bundle/dist",
        env: { FORGEROOM_REPO_ROOT: actualRoot },
      }),
    ).not.toThrow();
  });

  it("prefers the module path over an unrelated cwd workspace", () => {
    const actualRoot = findRepoRoot();
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/tmp");
    try {
      expect(findRepoRoot({ from: join(actualRoot, "packages/test-fixtures/src") })).toBe(
        actualRoot,
      );
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

describe("P0-000 provider fixtures", () => {
  it("freezes the P0 feature profile disables", () => {
    expect(() => assertP0FeatureProfileFrozen()).not.toThrow();
    const profile = loadP0FeatureProfile();
    expect(profile.disabled.componentCatalogueExpansion.allowedAgentTools).toEqual([
      "DataTable",
      "BarOrLineChart",
      "TaskCard",
      "ArtifactCard",
      "ChoiceForm",
    ]);
  });

  it("records selected pure AG-UI baseline and disabled-unless-parity CopilotKit policy", () => {
    const candidates = readProviderFixtureJson<{
      status: string;
      requiredPureBaseline: { status: string; packages: Record<string, string> };
      optionalCopilotKitTarget: { status: string; enabled: boolean };
    }>("ag-ui/candidates.json");
    const policy = readProviderFixtureJson<{
      optionalCopilotKit: { default: string; enablementPolicy: string };
    }>("ag-ui/policy.json");

    expect(candidates.status).toBe("selected");
    expect(candidates.requiredPureBaseline.status).toBe("selected");
    expect(candidates.requiredPureBaseline.packages).toEqual({
      "@ag-ui/core": "0.0.57",
      "@ag-ui/client": "0.0.57",
    });
    expect(candidates.optionalCopilotKitTarget.status).toBe("candidate");
    expect(candidates.optionalCopilotKitTarget.enabled).toBe(false);
    expect(policy.optionalCopilotKit.default).toBe("disabled");
    expect(policy.optionalCopilotKit.enablementPolicy).toBe("coherent_graph_parity_only");
  });

  it("validates controlled UI fixture props against shared contracts", () => {
    expect(() => assertControlledUiFixturesValid()).not.toThrow();
  });

  it("records verified Composio probe results after live probe", () => {
    const apps = readProviderFixtureJson<{
      verification: string;
      applications: Array<{ composioToolkitSlug: string | null; status: string }>;
    }>("composio/applications.candidate.json");
    const tools = readProviderFixtureJson<{
      verification: string;
      tools: Array<{
        directToolSlug: string | null;
        preferredCandidateSlug?: string | null;
        role: string;
      }>;
      observedDescriptorHashes: { status: string; entries: Array<{ sha256: string }> };
    }>("composio/tools.candidate.json");

    expect(apps.verification).toBe("verified");
    expect(apps.applications[0]?.composioToolkitSlug).toBe("github");
    expect(apps.applications[0]?.status).toBe("verified");
    expect(tools.verification).toBe("verified");
    expect(tools.tools.find((tool) => tool.role === "read")?.directToolSlug).toBe(
      "GITHUB_GET_AN_ISSUE",
    );
    expect(tools.tools.find((tool) => tool.role === "deterministic_write")?.directToolSlug).toBe(
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    );
    expect(tools.observedDescriptorHashes.status).toBe("verified");
    expect(tools.observedDescriptorHashes.entries.length).toBeGreaterThan(0);
    expect(tools.observedDescriptorHashes.entries[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
