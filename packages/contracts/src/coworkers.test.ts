import { describe, expect, it } from "vitest";
import {
  coworkerModelPresetError,
  coworkerUpdateCommandSchema,
  P0_COWORKER_MODEL_PRESETS,
} from "./coworkers";

const baseUpdate = {
  name: "Operator",
  handle: "operator",
  title: "Operations specialist",
  standing_instructions: "Coordinate approved work.",
  native_subagents_enabled: false as const,
  channel_ids: ["ch_1"],
  budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
  task_record_grants: [{ channel_id: "ch_1", operations: ["create"] as const }],
  tool_grants: ["GITHUB_GET_ISSUES"],
  skill_version_ids: ["skillv_1"],
  component_version_ids: [],
};

describe("coworker model presets", () => {
  it("accepts the P0 catalog presets", () => {
    for (const model_preset of P0_COWORKER_MODEL_PRESETS) {
      expect(coworkerModelPresetError(model_preset)).toBeNull();
      expect(coworkerUpdateCommandSchema.safeParse({ ...baseUpdate, model_preset }).success).toBe(
        true,
      );
    }
  });

  it("rejects arbitrary provider/model names outside the P0 catalog", () => {
    expect(coworkerModelPresetError("anthropic/claude-3-5-sonnet")).toMatch(/must be one of/);
    expect(
      coworkerUpdateCommandSchema.safeParse({
        ...baseUpdate,
        model_preset: "anthropic/claude-3-5-sonnet",
      }).success,
    ).toBe(false);
  });
});
