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
    const bindTurn = vi.fn(async () => undefined);
    const markUncertain = vi.fn(async () => undefined);

    const result = await createOrReconcileTurn(
      {
        client: { createTurn, listTurns },
        lockForCreate: async () => ({ ok: true }),
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
    });
  });
});
