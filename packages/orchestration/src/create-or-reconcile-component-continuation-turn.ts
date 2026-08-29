import type { TrueForgeClient, TrueForgeTurn, TurnInputItem } from "@forgeroom/trueforge";
import {
  buildComponentContinuationTurnInput,
  decideCreateOrReconcileComponentContinuationTurn,
  type ComponentContinuationResponse,
  type ComponentContinuationTurnCreateDecision,
} from "./component-continuation";

export type CreateOrReconcileComponentContinuationTurnDeps = {
  client: Pick<TrueForgeClient, "createTurn" | "listTurns">;
  lockForCreate: () => Promise<
    { ok: true; state: "creating" | "uncertain" } | { ok: false; reason: string }
  >;
  bindTurn: (input: {
    agentTurnId: string;
    trueforgeTurnId: string;
    previousTrueforgeTurnId: string | null;
    bindingSource: "create_response" | "history_reconciliation";
  }) => Promise<{ ok: true } | { ok: false; reason: string }>;
  markUncertain: (input: { agentTurnId: string; error: Record<string, unknown> }) => Promise<void>;
  onContinued?: (input: { interruptId: string; agentTurnId: string }) => Promise<void>;
};

export type CreateOrReconcileComponentContinuationTurnInput = {
  agentTurnId: string;
  trueforgeSessionId: string;
  applicationRunToken: string;
  previousTrueforgeTurnId: string;
  response: ComponentContinuationResponse;
  localTrueforgeTurnId: string | null;
  forceReconcile: boolean;
};

export type CreateOrReconcileComponentContinuationTurnResult =
  | {
      ok: true;
      trueforgeTurnId: string;
      created: boolean;
      decision: ComponentContinuationTurnCreateDecision;
      inputHash: string;
    }
  | { ok: false; reason: "ambiguous_history" | "create_failed" };

export async function createOrReconcileComponentContinuationTurn(
  deps: CreateOrReconcileComponentContinuationTurnDeps,
  input: CreateOrReconcileComponentContinuationTurnInput,
): Promise<CreateOrReconcileComponentContinuationTurnResult> {
  const locked = await deps.lockForCreate();
  if (!locked.ok) {
    return { ok: false, reason: "create_failed" };
  }

  const built = buildComponentContinuationTurnInput({
    applicationRunToken: input.applicationRunToken,
    previousTrueforgeTurnId: input.previousTrueforgeTurnId,
    response: input.response,
  });

  let history: TrueForgeTurn[] = [];
  if (input.forceReconcile || input.localTrueforgeTurnId) {
    try {
      let pageToken: string | undefined;
      do {
        const listed = await deps.client.listTurns(input.trueforgeSessionId, {
          limit: 50,
          pageToken,
        });
        history = history.concat(listed.turns);
        pageToken = listed.nextPageToken ?? undefined;
      } while (pageToken);
    } catch (error) {
      await deps.markUncertain({
        agentTurnId: input.agentTurnId,
        error: {
          reason: "history_read_failed",
          message: error instanceof Error ? error.message : "unknown",
        },
      });
      return { ok: false, reason: "create_failed" };
    }
  }

  const decision = decideCreateOrReconcileComponentContinuationTurn({
    localTrueforgeTurnId: input.localTrueforgeTurnId,
    history,
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

  if (decision.action === "create_new" && (input.forceReconcile || locked.state === "uncertain")) {
    await deps.markUncertain({
      agentTurnId: input.agentTurnId,
      error: { reason: "history_no_exact_match" },
    });
    return { ok: false, reason: "ambiguous_history" };
  }

  const bind = async (
    trueforgeTurnId: string,
    previousTrueforgeTurnId: string | null,
    bindingSource: "create_response" | "history_reconciliation",
  ): Promise<boolean> => {
    const bound = await deps.bindTurn({
      agentTurnId: input.agentTurnId,
      trueforgeTurnId,
      previousTrueforgeTurnId,
      bindingSource,
    });
    if (!bound.ok) {
      await deps.markUncertain({
        agentTurnId: input.agentTurnId,
        error: { reason: "bind_failed", detail: bound.reason },
      });
      return false;
    }
    if (deps.onContinued) {
      await deps.onContinued({
        interruptId: input.response.interruptId,
        agentTurnId: input.agentTurnId,
      });
    }
    return true;
  };

  if (decision.action === "bind_existing") {
    if (!(await bind(decision.turn.id, decision.turn.previous_turn_id, "history_reconciliation"))) {
      return { ok: false, reason: "create_failed" };
    }
    return {
      ok: true,
      trueforgeTurnId: decision.turn.id,
      created: false,
      decision,
      inputHash: built.inputHash,
    };
  }

  try {
    const created = await deps.client.createTurn(input.trueforgeSessionId, {
      input: built.input as TurnInputItem[],
      previousTurnId: built.previousTurnId,
      stream: false,
    });
    if (!(await bind(created.id, created.previous_turn_id, "create_response"))) {
      return { ok: false, reason: "create_failed" };
    }
    return {
      ok: true,
      trueforgeTurnId: created.id,
      created: true,
      decision,
      inputHash: built.inputHash,
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
