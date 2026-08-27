import { describe, expect, it } from "vitest";
import {
  evaluateTurnDoneOutcome,
  normalizeTrueForgeEvent,
  redactSensitiveFields,
} from "./event-normalize";

describe("event normalization", () => {
  it("strips credentials, reasoning, signatures and raw tool bodies", () => {
    const redacted = redactSensitiveFields({
      type: "tool.response",
      id: "evt_1",
      api_key: "secret",
      reasoning: "hidden",
      request_signature: "sig",
      raw_tool_body: { nested: true },
      safe: "ok",
      nested: { refresh_token: "nope", label: "keep" },
    });
    expect(redacted).toEqual({
      type: "tool.response",
      id: "evt_1",
      safe: "ok",
      nested: { label: "keep" },
    });
  });

  it("dedupe keys use event id and track sequence separately", () => {
    const normalized = normalizeTrueForgeEvent({
      type: "model.message.delta",
      id: "evt_shared",
      sequence_number: 7,
      thread_id: "thr_1",
      text: "hi",
    });
    expect(normalized.trueforgeEventId).toBe("evt_shared");
    expect(normalized.sequenceNumber).toBe(7);
    expect(normalized.threadId).toBe("thr_1");
    expect(normalized.payloadRedacted).toEqual({
      type: "model.message.delta",
      text: "hi",
    });
    expect(JSON.stringify(normalized.payloadRedacted)).not.toContain("evt_shared");
    expect(JSON.stringify(normalized.payloadRedacted)).not.toContain("thr_1");
  });

  it("excludes arbitrary tool bodies and provider action ids from normalized JSON", () => {
    const tool = normalizeTrueForgeEvent({
      type: "tool.call",
      id: "evt_tool_private",
      thread_id: "thread_private",
      arguments: { access_token: "secret", query: "private query" },
    });
    expect(tool.payloadRedacted).toEqual({ type: "tool.call" });

    const done = normalizeTrueForgeEvent({
      type: "turn.done",
      id: "evt_done_private",
      state: {
        required_actions: [
          {
            type: "tool.approval_required",
            id: "provider_action_private",
            arguments: { repository: "private" },
          },
        ],
      },
    });
    expect(done.payloadRedacted).toEqual({
      type: "turn.done",
      state: {
        required_actions: [{ type: "tool.approval_required" }],
      },
    });
  });

  it("keeps RunStep nonterminal when turn.done has required actions", () => {
    expect(
      evaluateTurnDoneOutcome({
        type: "turn.done",
        state: {
          status: "done",
          required_actions: [{ type: "tool.approval_required", id: "ra_1" }],
        },
      }),
    ).toEqual({
      kind: "required_actions",
      agentTurnState: "required_actions",
      runStepState: "awaiting_approval",
      requiredActionCount: 1,
    });

    expect(
      evaluateTurnDoneOutcome({
        type: "turn.done",
        state: {
          required_actions: [{ type: "mcp.auth_required", id: "ra_conn" }],
        },
      }),
    ).toEqual({
      kind: "required_actions",
      agentTurnState: "required_actions",
      runStepState: "blocked_connection",
      requiredActionCount: 1,
    });

    expect(
      evaluateTurnDoneOutcome({
        type: "turn.done",
        requiredActions: [],
      }),
    ).toEqual({
      kind: "terminal_success",
      agentTurnState: "completed",
      runStepState: "completed",
      requiredActionCount: 0,
    });
  });
});
