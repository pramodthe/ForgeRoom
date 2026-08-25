import { describe, expect, it } from "vitest";
import { loginRequestSchema } from "./identity";
import { isForbiddenPayloadKey, safeJsonValueSchema } from "./primitives";
import { actionProposalSchema } from "./pause";
import { HASH, NOW } from "./test-helpers";

describe("safe payload contracts", () => {
  it("rejects known credential and reasoning fields", () => {
    expect(isForbiddenPayloadKey("password")).toBe(true);
    expect(isForbiddenPayloadKey("api_key")).toBe(true);
    expect(isForbiddenPayloadKey("reasoning")).toBe(true);
    expect(isForbiddenPayloadKey("Authorization")).toBe(true);
    expect(safeJsonValueSchema.safeParse({ title: "ok" }).success).toBe(true);
    expect(safeJsonValueSchema.safeParse({ api_key: "secret" }).success).toBe(false);
    expect(safeJsonValueSchema.safeParse({ nested: { reasoning: "hidden chain" } }).success).toBe(
      false,
    );
  });

  it("allows password only on the login command, not on persisted proposals", () => {
    expect(
      loginRequestSchema.parse({ email: "owner@example.test", password: "local-only" }),
    ).toEqual({
      email: "owner@example.test",
      password: "local-only",
    });
    expect(
      actionProposalSchema.safeParse({
        schemaVersion: 1,
        id: "ap_1",
        required_action_id: "ra_1",
        run_id: "run_1",
        run_step_id: "step_1",
        agent_turn_id: "turn_1",
        tool_call_id: "tc_1",
        session_generation_id: "gen_1",
        tool_name: "WRITE",
        observed_descriptor_hash: HASH,
        arguments_hash: HASH,
        target_hash: HASH,
        redacted_arguments: { password: "nope" },
        expected_effect: "set field",
        risk_class: "high",
        state: "proposed",
        expires_at: NOW,
      }).success,
    ).toBe(false);
  });
});
