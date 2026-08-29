import { describe, expect, it } from "vitest";
import {
  compileP0AgentSpec,
  describeTrueForgeBoundary,
  hashAgentSpec,
  hashApprovalPolicy,
} from "./index";

describe("TrueForge boundary", () => {
  it("exposes the P0-201 harness with native subagents and iframe disabled", () => {
    expect(describeTrueForgeBoundary()).toEqual({
      harness: "trueforge",
      sdk: "p0-203",
      nativeSubagents: "disabled",
      iframe_v1: "disabled",
      credentials: "server-side-only",
      mcpRegistration: "header-auth",
    });
  });
});

describe("compileP0AgentSpec", () => {
  it("compiles literal tools with subagents and generative UI off", () => {
    const spec = compileP0AgentSpec({
      modelPreset: "openai/gpt-5-4-mini",
      instructions: "Operate safely.",
      sandboxEnabled: true,
      connectors: [
        {
          name: "github",
          enabledTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
          approvalRequiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        },
      ],
      skillNames: ["demo-skill"],
    });

    expect(spec.model.name).toBe("openai/gpt-5-4-mini");
    expect(spec.config.dynamic_sub_agents).toEqual({ enabled: false });
    expect(spec.config.generative_ui).toEqual({ enabled: false });
    expect(spec.config.ask_user_questions).toEqual({ enabled: false });
    expect(spec.config.sandbox.enabled).toBe(true);
    expect(spec.mcp_servers?.[0]).toMatchObject({
      name: "github",
      enable_tools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      require_approval_for_tools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
    });
    expect(hashAgentSpec(spec).startsWith("sha256:")).toBe(true);
    expect(hashApprovalPolicy(spec).startsWith("sha256:")).toBe(true);
    expect(hashAgentSpec(spec)).not.toBe(hashApprovalPolicy(spec));
  });
});
