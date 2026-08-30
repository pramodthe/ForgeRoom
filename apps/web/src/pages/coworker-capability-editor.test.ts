import { describe, expect, it } from "vitest";
import type { CoworkerDetail } from "../api/workspace-api";
import {
  buildCoworkerUpdateCommand,
  formatExactGrantList,
  parseExactGrantList,
} from "./coworkers-page";

const coworker: CoworkerDetail = {
  schemaVersion: 1,
  id: "cw_1",
  workspace_id: "workspace_1",
  handle: "operator",
  name: "Operator",
  title: "Operations specialist",
  status: "active",
  native_subagents_enabled: false,
  current_version_id: "cwv_1",
  config_revision: 1,
  config: {
    standing_instructions: "Coordinate approved work.",
    model_preset: "default",
    channel_ids: ["ch_1"],
    budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
    task_record_grants: [{ channel_id: "ch_1", operations: ["create"] }],
    tool_grants: ["GITHUB_GET_ISSUES"],
    skill_version_ids: ["skillv_1"],
    component_version_ids: ["compv_1"],
  },
};

describe("coworker capability editor helpers", () => {
  it("normalizes exact grant lists without changing their order", () => {
    expect(parseExactGrantList(" GITHUB_GET_ISSUES\n\nSUPPORT_SEARCH\nGITHUB_GET_ISSUES ")).toEqual(
      ["GITHUB_GET_ISSUES", "SUPPORT_SEARCH"],
    );
    expect(formatExactGrantList(["skillv_1", "skillv_2"])).toBe("skillv_1\nskillv_2");
  });

  it("builds the existing update contract from editable capabilities", () => {
    expect(
      buildCoworkerUpdateCommand(coworker, {
        name: "Operator",
        handle: "operator",
        title: "Support operator",
        instructions: "Handle approved support work.",
        modelPreset: " openai/gpt-5-4-mini ",
        toolGrants: "SUPPORT_SEARCH\nINTERCOM_UPDATE_MACRO",
        skillBindings: "skillv_2",
        componentGrants: "compv_2\ncompv_3",
        genUiEnabled: true,
      }),
    ).toEqual({
      name: "Operator",
      handle: "operator",
      title: "Support operator",
      standing_instructions: "Handle approved support work.",
      model_preset: "openai/gpt-5-4-mini",
      native_subagents_enabled: false,
      channel_ids: ["ch_1"],
      budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
      task_record_grants: [{ channel_id: "ch_1", operations: ["create"] }],
      tool_grants: ["SUPPORT_SEARCH", "INTERCOM_UPDATE_MACRO"],
      skill_version_ids: ["skillv_2"],
      component_version_ids: ["compv_2", "compv_3"],
    });
  });

  it("requires a model and a component grant when GenUI is enabled", () => {
    const base = {
      name: "Operator",
      handle: "operator",
      title: "Operations specialist",
      instructions: "Coordinate approved work.",
      modelPreset: "default",
      toolGrants: "",
      skillBindings: "",
      componentGrants: "",
      genUiEnabled: false,
    };
    expect(() => buildCoworkerUpdateCommand(coworker, { ...base, modelPreset: " " })).toThrow(
      "Model preset is required.",
    );
    expect(() =>
      buildCoworkerUpdateCommand(coworker, { ...base, modelPreset: "anthropic/claude-3-5-sonnet" }),
    ).toThrow("Model preset must be one of: default, openai/gpt-5-4-mini.");
    expect(() => buildCoworkerUpdateCommand(coworker, { ...base, genUiEnabled: true })).toThrow(
      "Add at least one published component version or turn GenUI off.",
    );
    expect(
      buildCoworkerUpdateCommand(coworker, { ...base, componentGrants: "compv_stale" })
        .component_version_ids,
    ).toEqual([]);
  });
});
