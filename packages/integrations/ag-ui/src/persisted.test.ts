import { describe, expect, it } from "vitest";
import { toPersistedAgUiEvent } from "./persisted";

describe("toPersistedAgUiEvent", () => {
  it("keeps safe text while dropping provider metadata", () => {
    expect(
      toPersistedAgUiEvent({
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "message_1",
        delta: "Safe answer",
        metadata: { provider_token: "secret" },
        rawEvent: { api_key: "secret" },
      }),
    ).toEqual({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message_1",
      delta: "Safe answer",
    });
  });

  it("strips interrupt metadata and response schemas", () => {
    expect(
      toPersistedAgUiEvent({
        type: "RUN_FINISHED",
        threadId: "thread_1",
        runId: "run_1",
        outcome: {
          type: "interrupt",
          interrupts: [
            {
              id: "interrupt_1",
              reason: "approval_required",
              message: "Approval is required.",
              metadata: { account_id: "hidden" },
              responseSchema: { type: "object" },
            },
          ],
        },
        metadata: { provider: "hidden" },
      }),
    ).toEqual({
      type: "RUN_FINISHED",
      threadId: "thread_1",
      runId: "run_1",
      outcome: {
        type: "interrupt",
        interrupts: [
          {
            id: "interrupt_1",
            reason: "approval_required",
            message: "Approval is required.",
          },
        ],
      },
    });
  });

  it("does not persist unsupported or malformed events", () => {
    expect(toPersistedAgUiEvent({ type: "RAW", event: { secret: true } })).toBeNull();
    expect(toPersistedAgUiEvent({ type: "TEXT_MESSAGE_START", role: "assistant" })).toBeNull();
  });
});
