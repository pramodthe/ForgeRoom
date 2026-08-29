import { describe, expect, it } from "vitest";
import type { CoworkerDetail } from "../api/workspace-api";
import {
  approvalPolicyLines,
  coworkersBoundToSkillVersion,
  formatCapability,
  formatVerifiedAt,
  summarizeCoworkerGrants,
} from "./settings-helpers";

const sampleCoworker: CoworkerDetail = {
  schemaVersion: 1,
  id: "cw_1",
  workspace_id: "ws_1",
  handle: "operator",
  name: "Operator",
  title: "Operations specialist",
  status: "active",
  native_subagents_enabled: false,
  current_version_id: "cwv_1",
  config_revision: 2,
  config: {
    standing_instructions: "Execute approved work.",
    model_preset: "default",
    channel_ids: ["ch_1", "ch_2"],
    budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
    task_record_grants: [{ channel_id: "ch_1", operations: ["create", "update_status"] }],
    tool_grants: ["INTERCOM_UPDATE_MACRO", "SANDBOX_RUN"],
    skill_version_ids: ["skill_version_001"],
    component_version_ids: ["component_v1"],
  },
};

describe("settings helpers", () => {
  it("formats capability labels for display", () => {
    expect(formatCapability("component_data_table_v1")).toBe("Data Table");
  });

  it("formats missing verification timestamps", () => {
    expect(formatVerifiedAt(null)).toBe("Not verified yet");
    expect(formatVerifiedAt("2026-08-11T12:00:00.000Z")).toContain("Aug");
  });

  it("finds coworkers bound to a skill version", () => {
    expect(coworkersBoundToSkillVersion([sampleCoworker], "skill_version_001")).toHaveLength(1);
    expect(coworkersBoundToSkillVersion([sampleCoworker], "skill_version_999")).toHaveLength(0);
  });

  it("summarizes grant counts for roster cards", () => {
    expect(summarizeCoworkerGrants(sampleCoworker)).toEqual({
      tools: ["INTERCOM_UPDATE_MACRO", "SANDBOX_RUN"],
      skills: 1,
      channels: 2,
    });
  });

  it("describes approval policy lines for the editor", () => {
    const lines = approvalPolicyLines(sampleCoworker);
    expect(lines.some((line) => line.includes("TaskRecord create, update_status"))).toBe(true);
    expect(lines.some((line) => line.includes("External writes require human approval"))).toBe(
      true,
    );
  });
});
