import { describe, expect, it } from "vitest";
import { extractLatestUserMessageContent, parseUpstreamAgUiEvent } from "./upstream";

describe("parseUpstreamAgUiEvent", () => {
  it("validates official AG-UI events and rejects RAW", () => {
    expect(parseUpstreamAgUiEvent({ type: "RAW" })).toEqual({
      ok: false,
      capability: "RAW",
      reason: "unsupported_in_p0",
    });
    expect(parseUpstreamAgUiEvent({
      type: "TEXT_MESSAGE_START",
      messageId: "msg_1",
      role: "assistant",
    })).toMatchObject({ ok: true });
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
});
