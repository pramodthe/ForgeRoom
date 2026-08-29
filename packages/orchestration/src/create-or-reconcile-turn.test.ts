import { describe, expect, it, vi } from "vitest";
import { createOrReconcileTurn } from "./create-or-reconcile-turn";
import { buildNormalTurnInput } from "./turn-creation";
import type { TrueForgeTurn } from "@forgeroom/trueforge";

describe("createOrReconcileTurn", () => {
  it("queries history before creating when reconciling a lost create", async () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_lost",
      content: "ping",
      previousTrueforgeTurnId: null,
    });
    const remote: TrueForgeTurn = {
      id: "tf_existing",
      session_id: "sess_1",
      previous_turn_id: null,
      input: built.input,
      state: { status: "running" },
      created_at: "2026-08-26T00:00:00.000Z",
    };
    const createTurn = vi.fn();
    const listTurns = vi.fn(async () => ({ turns: [remote], nextPageToken: null }));
    const bindTurn = vi.fn(async () => ({ ok: true as const }));
    const markUncertain = vi.fn(async () => undefined);

    const result = await createOrReconcileTurn(
      {
        client: { createTurn, listTurns },
        lockForCreate: async () => ({ ok: true, state: "uncertain" }),
        bindTurn,
        markUncertain,
      },
      {
        agentTurnId: "aturn_1",
        trueforgeSessionId: "sess_1",
        applicationRunToken: "art_lost",
        content: "ping",
        previousTrueforgeTurnId: null,
        localTrueforgeTurnId: null,
        forceReconcile: true,
      },
    );

    expect(result).toMatchObject({ ok: true, created: false, trueforgeTurnId: "tf_existing" });
    expect(createTurn).not.toHaveBeenCalled();
    expect(bindTurn).toHaveBeenCalledWith({
      agentTurnId: "aturn_1",
      trueforgeTurnId: "tf_existing",
      previousTrueforgeTurnId: null,
      bindingSource: "history_reconciliation",
    });
  });

  it("labels a successful create response separately from history reconciliation", async () => {
    const bindTurn = vi.fn(async () => ({ ok: true as const }));
    const result = await createOrReconcileTurn(
      {
        client: {
          createTurn: vi.fn(async () => ({
            id: "tf_created",
            session_id: "sess_1",
            previous_turn_id: null,
            input: [],
            state: { status: "running" },
            created_at: "2026-08-29T00:00:00.000Z",
          })),
          listTurns: vi.fn(),
        },
        lockForCreate: async () => ({ ok: true, state: "creating" }),
        bindTurn,
        markUncertain: vi.fn(async () => undefined),
      },
      {
        agentTurnId: "aturn_2",
        trueforgeSessionId: "sess_1",
        applicationRunToken: "art_create",
        content: "ping",
        previousTrueforgeTurnId: null,
        localTrueforgeTurnId: null,
        forceReconcile: false,
      },
    );

    expect(result).toMatchObject({ ok: true, created: true, trueforgeTurnId: "tf_created" });
    expect(bindTurn).toHaveBeenCalledWith({
      agentTurnId: "aturn_2",
      trueforgeTurnId: "tf_created",
      previousTrueforgeTurnId: null,
      bindingSource: "create_response",
    });
  });

  it("fails closed when a reconciled remote turn cannot be durably bound", async () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_bind_fail",
      content: "ping",
      previousTrueforgeTurnId: null,
    });
    const markUncertain = vi.fn(async () => undefined);
    const result = await createOrReconcileTurn(
      {
        client: {
          createTurn: vi.fn(),
          listTurns: vi.fn(async () => ({
            turns: [
              {
                id: "tf_existing",
                session_id: "sess_1",
                previous_turn_id: null,
                input: built.input,
                state: { status: "running" },
                created_at: "2026-08-29T00:00:00.000Z",
              },
            ],
            nextPageToken: null,
          })),
        },
        lockForCreate: async () => ({ ok: true, state: "uncertain" }),
        bindTurn: async () => ({ ok: false, reason: "state_mismatch" }),
        markUncertain,
      },
      {
        agentTurnId: "aturn_bind_fail",
        trueforgeSessionId: "sess_1",
        applicationRunToken: "art_bind_fail",
        content: "ping",
        previousTrueforgeTurnId: null,
        localTrueforgeTurnId: null,
        forceReconcile: true,
      },
    );

    expect(result).toEqual({ ok: false, reason: "create_failed" });
    expect(markUncertain).toHaveBeenCalledWith({
      agentTurnId: "aturn_bind_fail",
      error: { reason: "bind_failed", detail: "state_mismatch" },
    });
  });

  it("does not create replacement work when uncertain history has no exact match", async () => {
    const createTurn = vi.fn();
    const markUncertain = vi.fn(async () => undefined);
    const result = await createOrReconcileTurn(
      {
        client: {
          createTurn,
          listTurns: vi.fn(async () => ({ turns: [], nextPageToken: null })),
        },
        lockForCreate: async () => ({ ok: true, state: "uncertain" }),
        bindTurn: vi.fn(),
        markUncertain,
      },
      {
        agentTurnId: "aturn_uncertain_empty",
        trueforgeSessionId: "sess_1",
        applicationRunToken: "art_uncertain_empty",
        content: "ping",
        previousTrueforgeTurnId: null,
        localTrueforgeTurnId: null,
        forceReconcile: true,
      },
    );

    expect(result).toEqual({ ok: false, reason: "ambiguous_history" });
    expect(createTurn).not.toHaveBeenCalled();
    expect(markUncertain).toHaveBeenCalledWith({
      agentTurnId: "aturn_uncertain_empty",
      error: { reason: "history_no_exact_match" },
    });
  });
});
