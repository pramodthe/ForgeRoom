import { describe, expect, it } from "vitest";
import type { TrueForgeTurn } from "@forgeroom/trueforge";
import {
  buildComponentContinuationTurnInput,
  decideCreateOrReconcileComponentContinuationTurn,
} from "./component-continuation";

describe("component continuation turn", () => {
  it("builds a response-only tool_response without user.message", () => {
    const built = buildComponentContinuationTurnInput({
      applicationRunToken: "art_1",
      previousTrueforgeTurnId: "tf_prev",
      response: {
        interruptId: "intr_1",
        toolCallId: "tc_1",
        threadId: "thread_1",
        resultRedacted: { selectedRowId: "row_1" },
      },
    });
    expect(built.input).toEqual([
      {
        type: "user.tool_response",
        thread_id: "thread_1",
        tool_call_id: "tc_1",
        content: '[[forgeroom:application_run_token=art_1]]\n{"selectedRowId":"row_1"}',
      },
    ]);
    expect(built.previousTurnId).toBe("tf_prev");
    expect(built.inputHash).toMatch(/^sha256:/);
    expect(built.responsePayloadHash).toMatch(/^sha256:/);
  });

  it("does not reconcile an identical response from a different application attempt", () => {
    const expected = buildComponentContinuationTurnInput({
      applicationRunToken: "art_expected",
      previousTrueforgeTurnId: "tf_prev",
      response: {
        interruptId: "intr_1",
        toolCallId: "tc_1",
        threadId: "thread_1",
        resultRedacted: { ok: true },
      },
    });
    const otherAttempt = buildComponentContinuationTurnInput({
      applicationRunToken: "art_other",
      previousTrueforgeTurnId: "tf_prev",
      response: {
        interruptId: "intr_1",
        toolCallId: "tc_1",
        threadId: "thread_1",
        resultRedacted: { ok: true },
      },
    });

    expect(
      decideCreateOrReconcileComponentContinuationTurn({
        localTrueforgeTurnId: null,
        history: [
          {
            id: "tf_other_attempt",
            session_id: "sess_1",
            previous_turn_id: "tf_prev",
            input: otherAttempt.input,
            state: { status: "running" },
            created_at: "2026-08-26T00:00:00.000Z",
          } satisfies TrueForgeTurn,
        ],
        inputHash: expected.inputHash,
        previousTurnId: expected.previousTurnId,
      }),
    ).toEqual({ action: "create_new" });
  });

  it("reconciles continuation turns by predecessor and input hash", () => {
    const built = buildComponentContinuationTurnInput({
      applicationRunToken: "art_1",
      previousTrueforgeTurnId: "tf_prev",
      response: {
        interruptId: "intr_1",
        toolCallId: "tc_1",
        threadId: "thread_1",
        resultRedacted: { ok: true },
      },
    });
    const decision = decideCreateOrReconcileComponentContinuationTurn({
      localTrueforgeTurnId: null,
      history: [
        {
          id: "tf_resume",
          session_id: "sess_1",
          previous_turn_id: "tf_prev",
          input: built.input,
          state: { status: "running" },
          created_at: "2026-08-26T00:00:00.000Z",
        } satisfies TrueForgeTurn,
      ],
      inputHash: built.inputHash,
      previousTurnId: built.previousTurnId,
    });
    expect(decision).toMatchObject({
      action: "bind_existing",
      turn: { id: "tf_resume" },
    });
  });

  it("rejects an id-only continuation hit with mismatched intent", () => {
    const built = buildComponentContinuationTurnInput({
      applicationRunToken: "art_1",
      previousTrueforgeTurnId: "tf_prev",
      response: {
        interruptId: "intr_1",
        toolCallId: "tc_1",
        threadId: "thread_1",
        resultRedacted: { ok: true },
      },
    });
    const decision = decideCreateOrReconcileComponentContinuationTurn({
      localTrueforgeTurnId: "tf_local",
      history: [
        {
          id: "tf_local",
          session_id: "sess_1",
          previous_turn_id: "tf_wrong_prev",
          input: [],
          state: { status: "running" },
          created_at: "2026-08-26T00:00:00.000Z",
        } satisfies TrueForgeTurn,
      ],
      inputHash: built.inputHash,
      previousTurnId: built.previousTurnId,
    });

    expect(decision).toEqual({ action: "fail_closed", reason: "ambiguous_history" });
  });
});
