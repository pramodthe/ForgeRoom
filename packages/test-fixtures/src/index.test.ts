import { describe, expect, it } from "vitest";
import {
  assertControlledUiFixturesValid,
  assertP0FeatureProfileFrozen,
  isForbiddenP0101Dependency,
  loadP0FeatureProfile,
  readProviderFixtureJson,
} from "./index";

describe("isForbiddenP0101Dependency", () => {
  it("blocks AG-UI and CopilotKit packages", () => {
    expect(isForbiddenP0101Dependency("@ag-ui/core")).toBe(true);
    expect(isForbiddenP0101Dependency("@copilotkit/runtime")).toBe(true);
    expect(isForbiddenP0101Dependency("zod")).toBe(false);
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

  it("records pure AG-UI candidates and disabled-unless-parity CopilotKit policy", () => {
    const candidates = readProviderFixtureJson<{
      requiredPureBaseline: { packages: Record<string, string> };
      optionalCopilotKitTarget: { enabled: boolean };
    }>("ag-ui/candidates.json");
    const policy = readProviderFixtureJson<{
      optionalCopilotKit: { default: string; enablementPolicy: string };
    }>("ag-ui/policy.json");

    expect(candidates.requiredPureBaseline.packages).toEqual({
      "@ag-ui/core": "0.0.57",
      "@ag-ui/client": "0.0.57",
    });
    expect(candidates.optionalCopilotKitTarget.enabled).toBe(false);
    expect(policy.optionalCopilotKit.default).toBe("disabled");
    expect(policy.optionalCopilotKit.enablementPolicy).toBe("coherent_graph_parity_only");
  });

  it("validates controlled UI fixture props against shared contracts", () => {
    expect(() => assertControlledUiFixturesValid()).not.toThrow();
  });

  it("does not mark Composio tool slugs as verified without a probe", () => {
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
      observedDescriptorHashes: { entries: unknown[] };
    }>("composio/tools.candidate.json");

    expect(apps.verification).toBe("blocked-on-secrets");
    expect(apps.applications[0]?.composioToolkitSlug).toBe("github");
    expect(apps.applications[0]?.status).toBe("candidate");
    expect(tools.verification).toBe("blocked-on-secrets");
    expect(tools.tools.every((tool) => tool.directToolSlug === null)).toBe(true);
    expect(tools.tools.find((tool) => tool.role === "read")?.preferredCandidateSlug).toBe(
      "GITHUB_GET_ISSUE",
    );
    expect(
      tools.tools.find((tool) => tool.role === "deterministic_write")?.preferredCandidateSlug,
    ).toBeNull();
    expect(tools.observedDescriptorHashes.entries).toEqual([]);
  });
});
