import { describe, expect, it } from "vitest";
import {
  extractExistingRunBinding,
  extractLatestUserMessageContent,
  parseUpstreamAgUiEvent,
} from "./upstream";

describe("parseUpstreamAgUiEvent", () => {
  it("validates official AG-UI events and rejects RAW", () => {
    expect(parseUpstreamAgUiEvent({ type: "RAW" })).toEqual({
      ok: false,
      capability: "RAW",
      reason: "unsupported_in_p0",
    });
    expect(
      parseUpstreamAgUiEvent({
        type: "TEXT_MESSAGE_START",
        messageId: "msg_1",
        role: "assistant",
      }),
    ).toMatchObject({ ok: true });
  });

  it("extracts the latest user message content", () => {
    expect(
      extractLatestUserMessageContent({
        threadId: "t",
        runId: "r",
        messages: [
          { id: "m1", role: "assistant", content: "Earlier" },
          { id: "m2", role: "user", content: "  Latest ask  " },
        ],
        tools: [],
        context: [],
        state: {},
      }),
    ).toBe("Latest ask");
  });

  it("accepts only the strict ForgeRoom existing-run binding", () => {
    const input = {
      threadId: "thread_1",
      runId: "run_1",
      messages: [{ id: "message_1", role: "user" as const, content: "Do the work" }],
      tools: [],
      context: [],
      state: {},
      forwardedProps: {
        forgeroomV1: {
          schemaVersion: 1,
          sourceMessageId: "message_1",
          applicationRunId: "application_run_1",
          runStepId: "step_1",
        },
      },
    };
    expect(extractExistingRunBinding(input)).toEqual(input.forwardedProps.forgeroomV1);
    expect(
      extractExistingRunBinding({
        ...input,
        forwardedProps: {
          forgeroomV1: { ...input.forwardedProps.forgeroomV1, trusted: true },
        },
      }),
    ).toBeNull();
  });
});
