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
