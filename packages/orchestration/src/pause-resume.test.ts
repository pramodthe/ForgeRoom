import { describe, expect, it, vi } from "vitest";
import {
  assertResponseOnlyNoNormalMessage,
  authorizeAgUiPauseGroupResume,
  buildResponseOnlyTurnInput,
  ciphertextExpiryAt,
  decideCreateOrReconcileResponseTurn,
  PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS,
} from "./pause-resume";
import { createOrReconcileResponseTurn } from "./create-or-reconcile-response-turn";
import type { TrueForgeTurn } from "@forgeroom/trueforge";

const HASH = `sha256:${"ab".repeat(32)}`;

describe("buildResponseOnlyTurnInput", () => {
  it("builds approval and question items with no normal message", () => {
    const built = buildResponseOnlyTurnInput({
      applicationRunToken: "art_1",
      previousTrueforgeTurnId: "tf_paused",
      responses: [
        {
          kind: "question",
          requiredActionId: "ra_q",
          providerActionId: "prov_q",
          threadId: "thread_1",
          toolCallId: "tc_q",
          content: "yes",
        },
        {
          kind: "approval",
          requiredActionId: "ra_a",
          providerActionId: "prov_a",
          threadId: "thread_1",
          toolCallId: "tc_a",
          approval: { status: "allow" },
        },
      ],
    });
    expect(built.previousTurnId).toBe("tf_paused");
    expect(built.input.map((item) => (item as { type: string }).type)).toEqual([
      "user.tool_approval",
      "user.tool_response",
    ]);
    expect(built.input.some((item) => (item as { type: string }).type === "user.message")).toBe(
      false,
    );
    expect(built.responsePayloadHash.startsWith("sha256:")).toBe(true);
  });

  it("rejects normal messages in response-only sets", () => {
    expect(() =>
      assertResponseOnlyNoNormalMessage([{ type: "user.message", content: "hi" }]),
    ).toThrow(/normal user\.message/);
  });
});

describe("authorizeAgUiPauseGroupResume", () => {
  it("rejects forged interrupt ids and decision-bearing payloads", () => {
    expect(
      authorizeAgUiPauseGroupResume({
        resume: [{ interruptId: "forged" }],
        actionAliases: [{ requiredActionId: "ra_1", providerActionId: "prov_1" }],
        requiredActionCount: 1,
        pauseGroupReady: true,
      }).ok,
    ).toBe(false);

    expect(
      authorizeAgUiPauseGroupResume({
        resume: [{ interruptId: "ra_1", payload: { decision: "allow" } }],
        actionAliases: [{ requiredActionId: "ra_1", providerActionId: "prov_1" }],
        requiredActionCount: 1,
        pauseGroupReady: true,
      }),
    ).toEqual({ ok: false, reason: "payload_bypass" });

    expect(
      authorizeAgUiPauseGroupResume({
        resume: [{ interruptId: "ra_1" }, { interruptId: "ra_2" }],
        actionAliases: [
          { requiredActionId: "ra_1", providerActionId: "prov_1" },
          { requiredActionId: "ra_2", providerActionId: "prov_2" },
        ],
        requiredActionCount: 2,
        pauseGroupReady: true,
      }),
    ).toEqual({ ok: true });
  });

  it("counts durable and provider aliases as one canonical action", () => {
    expect(
      authorizeAgUiPauseGroupResume({
        resume: [{ interruptId: "ra_1" }, { interruptId: "prov_1" }],
        actionAliases: [{ requiredActionId: "ra_1", providerActionId: "prov_1" }],
        requiredActionCount: 1,
        pauseGroupReady: true,
      }),
    ).toEqual({ ok: false, reason: "forged_interrupt" });

    expect(
      authorizeAgUiPauseGroupResume({
        resume: [{ interruptId: "shared" }],
        actionAliases: [
          { requiredActionId: "ra_1", providerActionId: "shared" },
          { requiredActionId: "shared", providerActionId: "prov_2" },
        ],
        requiredActionCount: 2,
        pauseGroupReady: true,
      }),
    ).toEqual({ ok: false, reason: "forged_interrupt" });
  });

  it("blocks resume until the group is ready", () => {
    expect(
      authorizeAgUiPauseGroupResume({
        resume: [{ interruptId: "ra_1" }],
        actionAliases: [{ requiredActionId: "ra_1", providerActionId: "prov_1" }],
        requiredActionCount: 1,
        pauseGroupReady: false,
      }),
    ).toEqual({ ok: false, reason: "incomplete_group" });
  });
});

describe("decideCreateOrReconcileResponseTurn", () => {
  it("binds an existing history match and never blind-creates", () => {
    const input = buildResponseOnlyTurnInput({
      applicationRunToken: "art_r",
      previousTrueforgeTurnId: "tf_paused",
      responses: [
        {
          kind: "approval",
          requiredActionId: "ra_1",
          providerActionId: "prov_1",
          threadId: "t",
          toolCallId: "tc",
          approval: { status: "allow" },
        },
      ],
    });
    const remote: TrueForgeTurn = {
      id: "tf_resume",
      session_id: "sess",
      previous_turn_id: "tf_paused",
      input: input.input,
      state: { status: "running" },
      created_at: "2026-08-27T00:00:00.000Z",
    };
    expect(
      decideCreateOrReconcileResponseTurn({
        localTrueforgeTurnId: null,
        history: [remote],
        inputHash: input.inputHash,
        previousTurnId: input.previousTurnId,
      }),
    ).toEqual({ action: "bind_existing", turn: remote, matchedBy: "input_hash" });
  });
});

describe("createOrReconcileResponseTurn", () => {
  it("reconciles lost create from history without a second createTurn", async () => {
    const responses = [
      {
        kind: "approval" as const,
        requiredActionId: "ra_1",
        providerActionId: "prov_1",
        threadId: "t",
        toolCallId: "tc",
        approval: { status: "allow" as const },
      },
    ];
    const built = buildResponseOnlyTurnInput({
      applicationRunToken: "art_lost",
      previousTrueforgeTurnId: "tf_paused",
      responses,
    });
    const remote: TrueForgeTurn = {
      id: "tf_existing_resume",
      session_id: "sess_1",
      previous_turn_id: "tf_paused",
      input: built.input,
      state: { status: "running" },
      created_at: "2026-08-27T00:00:00.000Z",
    };
    const createTurn = vi.fn();
    const listTurns = vi.fn(async () => ({ turns: [remote], nextPageToken: null }));
    const bindResumeTurn = vi.fn(async () => undefined);
    const markUncertain = vi.fn(async () => undefined);

    const result = await createOrReconcileResponseTurn(
      {
        client: { createTurn, listTurns },
        lockForCreate: async () => ({ ok: true }),
        bindResumeTurn,
        markUncertain,
      },
      {
        pauseResumeId: "pr_1",
        trueforgeSessionId: "sess_1",
        applicationRunToken: "art_lost",
        previousTrueforgeTurnId: "tf_paused",
        responses,
        localTrueforgeResumeTurnId: null,
        forceReconcile: true,
      },
    );

    expect(result).toMatchObject({
      ok: true,
      created: false,
      trueforgeTurnId: "tf_existing_resume",
    });
    expect(createTurn).not.toHaveBeenCalled();
    expect(bindResumeTurn).toHaveBeenCalledWith({
      pauseResumeId: "pr_1",
      trueforgeResumeTurnId: "tf_existing_resume",
    });
  });
});

describe("ciphertextExpiryAt", () => {
  it("expires after the recovery window", () => {
    const completed = "2026-08-27T00:00:00.000Z";
    const before = ciphertextExpiryAt(
      completed,
      new Date(Date.parse(completed) + PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS - 1).toISOString(),
    );
    expect(before.expired).toBe(false);
    const after = ciphertextExpiryAt(
      completed,
      new Date(Date.parse(completed) + PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS).toISOString(),
    );
    expect(after.expired).toBe(true);
    expect(HASH.startsWith("sha256:")).toBe(true);
  });
});
