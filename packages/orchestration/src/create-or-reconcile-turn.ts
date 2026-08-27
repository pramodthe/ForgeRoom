import type { TrueForgeClient, TrueForgeTurn } from "@forgeroom/trueforge";
import {
  buildNormalTurnInput,
  decideCreateOrReconcile,
  type CreateOrReconcileDecision,
} from "./turn-creation";

export type CreateOrReconcileTurnDeps = {
  client: Pick<TrueForgeClient, "createTurn" | "listTurns">;
  /** Serialize create/reconcile for this AgentTurn before network I/O. */
  lockForCreate: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  bindTurn: (input: {
    agentTurnId: string;
    trueforgeTurnId: string;
    previousTrueforgeTurnId: string | null;
  }) => Promise<void>;
  markUncertain: (input: { agentTurnId: string; error: Record<string, unknown> }) => Promise<void>;
};

export type CreateOrReconcileTurnInput = {
  agentTurnId: string;
  trueforgeSessionId: string;
  applicationRunToken: string;
  content: string;
  previousTrueforgeTurnId: string | null;
  localTrueforgeTurnId: string | null;
  /** When true, always list history before create (uncertain / lost-create path). */
  forceReconcile: boolean;
};

export type CreateOrReconcileTurnResult =
  | { ok: true; trueforgeTurnId: string; created: boolean; decision: CreateOrReconcileDecision }
  | { ok: false; reason: "ambiguous_history" | "create_failed" };

export async function createOrReconcileTurn(
  deps: CreateOrReconcileTurnDeps,
  input: CreateOrReconcileTurnInput,
): Promise<CreateOrReconcileTurnResult> {
  const locked = await deps.lockForCreate();
  if (!locked.ok) {
    return { ok: false, reason: "create_failed" };
  }

  const built = buildNormalTurnInput({
    applicationRunToken: input.applicationRunToken,
    content: input.content,
    previousTrueforgeTurnId: input.previousTrueforgeTurnId,
  });

  let history: TrueForgeTurn[] = [];
  if (input.forceReconcile || input.localTrueforgeTurnId) {
    let pageToken: string | undefined;
    do {
      const listed = await deps.client.listTurns(input.trueforgeSessionId, {
        limit: 50,
        pageToken,
      });
      history = history.concat(listed.turns);
      pageToken = listed.nextPageToken ?? undefined;
    } while (pageToken);
  }

  const decision = decideCreateOrReconcile({
    localTrueforgeTurnId: input.localTrueforgeTurnId,
    history,
    applicationRunToken: input.applicationRunToken,
    inputHash: built.inputHash,
    previousTurnId: built.previousTurnId,
  });

  if (decision.action === "fail_closed") {
    await deps.markUncertain({
      agentTurnId: input.agentTurnId,
      error: { reason: decision.reason },
    });
    return { ok: false, reason: "ambiguous_history" };
  }

  if (decision.action === "bind_existing") {
    await deps.bindTurn({
      agentTurnId: input.agentTurnId,
      trueforgeTurnId: decision.turn.id,
      previousTrueforgeTurnId: decision.turn.previous_turn_id,
    });
    return {
      ok: true,
      trueforgeTurnId: decision.turn.id,
      created: false,
      decision,
    };
  }

  // create_new — if forceReconcile already listed empty history; if not forced, create directly
  // but on failure mark uncertain (caller may retry with forceReconcile).
  try {
    const created = await deps.client.createTurn(input.trueforgeSessionId, {
      input: built.input,
      previousTurnId: built.previousTurnId,
      stream: false,
    });
    await deps.bindTurn({
      agentTurnId: input.agentTurnId,
      trueforgeTurnId: created.id,
      previousTrueforgeTurnId: created.previous_turn_id,
    });
    return {
      ok: true,
      trueforgeTurnId: created.id,
      created: true,
      decision,
    };
  } catch (error) {
    await deps.markUncertain({
      agentTurnId: input.agentTurnId,
      error: {
        reason: "create_failed",
        message: error instanceof Error ? error.message : "unknown",
      },
    });
    return { ok: false, reason: "create_failed" };
  }
}
