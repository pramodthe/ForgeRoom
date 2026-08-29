import { describe, expect, it } from "vitest";
import {
  buildNormalTurnInput,
  decideCreateOrReconcile,
  extractApplicationRunTokenFromInput,
  hashTurnCreateIntent,
  matchTurnFromHistory,
} from "./turn-creation";
import type { TrueForgeTurn } from "@forgeroom/trueforge";

function turn(partial: Partial<TrueForgeTurn> & Pick<TrueForgeTurn, "id">): TrueForgeTurn {
  return {
    session_id: "sess_1",
    previous_turn_id: null,
    input: [],
    state: { status: "done", required_actions: [] },
    created_at: "2026-08-26T00:00:00.000Z",
    ...partial,
  };
}

describe("turn creation intent", () => {
  it("embeds a deterministic application run token and predecessor", () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_abc",
      content: "Inspect the fixture",
      previousTrueforgeTurnId: null,
    });
    expect(built.previousTurnId).toBe("none");
    expect(built.inputHash.startsWith("sha256:")).toBe(true);
    expect(extractApplicationRunTokenFromInput(built.input)).toBe("art_abc");
    expect(hashTurnCreateIntent(built)).toBe(built.inputHash);
  });

  it("matches history by token before creating again", () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_1",
      content: "hello",
      previousTrueforgeTurnId: "tf_prev",
    });
    const remote = turn({
      id: "tf_found",
      previous_turn_id: "tf_prev",
      input: built.input,
    });
    expect(
      matchTurnFromHistory({
        turns: [remote],
        applicationRunToken: "art_1",
        inputHash: built.inputHash,
        previousTurnId: "tf_prev",
      }),
    ).toEqual({ turn: remote, matchedBy: "application_run_token" });

    expect(
      decideCreateOrReconcile({
        localTrueforgeTurnId: null,
        history: [remote],
        applicationRunToken: "art_1",
        inputHash: built.inputHash,
        previousTurnId: "tf_prev",
      }),
    ).toEqual({ action: "bind_existing", turn: remote, matchedBy: "application_run_token" });
  });

  it("fails closed on ambiguous history instead of blind create", () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_dup",
      content: "hello",
      previousTrueforgeTurnId: null,
    });
    const a = turn({ id: "tf_a", input: built.input, previous_turn_id: null });
    const b = turn({ id: "tf_b", input: built.input, previous_turn_id: null });
    expect(
      decideCreateOrReconcile({
        localTrueforgeTurnId: null,
        history: [a, b],
        applicationRunToken: "art_dup",
        inputHash: built.inputHash,
        previousTurnId: "none",
      }),
    ).toEqual({ action: "fail_closed", reason: "ambiguous_history" });
  });

  it("creates new only when history has no match", () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_new",
      content: "hello",
      previousTrueforgeTurnId: null,
    });
    expect(
      decideCreateOrReconcile({
        localTrueforgeTurnId: null,
        history: [],
        applicationRunToken: "art_new",
        inputHash: built.inputHash,
        previousTurnId: "none",
      }),
    ).toEqual({ action: "create_new" });
  });

  it("rejects an id-only history hit whose predecessor and input do not match", () => {
    const built = buildNormalTurnInput({
      applicationRunToken: "art_expected",
      content: "expected",
      previousTrueforgeTurnId: "tf_expected_prev",
    });
    const idOnly = turn({
      id: "tf_local",
      previous_turn_id: "tf_wrong_prev",
      input: buildNormalTurnInput({
        applicationRunToken: "art_wrong",
        content: "wrong",
        previousTrueforgeTurnId: "tf_wrong_prev",
      }).input,
    });

    expect(
      decideCreateOrReconcile({
        localTrueforgeTurnId: "tf_local",
        history: [idOnly],
        applicationRunToken: "art_expected",
        inputHash: built.inputHash,
        previousTurnId: built.previousTurnId,
      }),
    ).toEqual({ action: "fail_closed", reason: "ambiguous_history" });
  });
});
