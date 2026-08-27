import type { TrueForgeClient, TrueForgeTurn } from "@forgeroom/trueforge";
import {
  buildResponseOnlyTurnInput,
  decideCreateOrReconcileResponseTurn,
  type PauseResumeResponseItem,
  type ResponseTurnCreateOrReconcileDecision,
} from "./pause-resume";

export type CreateOrReconcileResponseTurnDeps = {
  client: Pick<TrueForgeClient, "createTurn" | "listTurns">;
  lockForCreate: () => Promise<{ ok: true } | { ok: false; reason: string }>;
  bindResumeTurn: (input: {
    pauseResumeId: string;
    trueforgeResumeTurnId: string;
  }) => Promise<void>;
  markUncertain: (input: {
    pauseResumeId: string;
    error: Record<string, unknown>;
  }) => Promise<void>;
};

export type CreateOrReconcileResponseTurnInput = {
  pauseResumeId: string;
  trueforgeSessionId: string;
  applicationRunToken: string;
  previousTrueforgeTurnId: string;
  responses: PauseResumeResponseItem[];
  localTrueforgeResumeTurnId: string | null;
  forceReconcile: boolean;
};

export type CreateOrReconcileResponseTurnResult =
  | {
      ok: true;
      trueforgeTurnId: string;
      created: boolean;
      decision: ResponseTurnCreateOrReconcileDecision;
      inputHash: string;
    }
  | { ok: false; reason: "ambiguous_history" | "create_failed" };

/**
 * Create one response-only TrueForge turn, or reconcile a lost create from history.
 * Encrypted PauseResume payload must already be durable before calling this.
 */
export async function createOrReconcileResponseTurn(
  deps: CreateOrReconcileResponseTurnDeps,
  input: CreateOrReconcileResponseTurnInput,
): Promise<CreateOrReconcileResponseTurnResult> {
  const locked = await deps.lockForCreate();
  if (!locked.ok) {
    return { ok: false, reason: "create_failed" };
  }

  const built = buildResponseOnlyTurnInput({
    applicationRunToken: input.applicationRunToken,
    previousTrueforgeTurnId: input.previousTrueforgeTurnId,
    responses: input.responses,
  });

  let history: TrueForgeTurn[] = [];
  if (input.forceReconcile || input.localTrueforgeResumeTurnId) {
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
        pauseResumeId: input.pauseResumeId,
        error: {
          reason: "history_read_failed",
          message: error instanceof Error ? error.message : "unknown",
        },
      });
      return { ok: false, reason: "create_failed" };
    }
  }

  const decision = decideCreateOrReconcileResponseTurn({
    localTrueforgeTurnId: input.localTrueforgeResumeTurnId,
    history,
    inputHash: built.inputHash,
    previousTurnId: built.previousTurnId,
  });

  if (decision.action === "fail_closed") {
    await deps.markUncertain({
      pauseResumeId: input.pauseResumeId,
      error: { reason: decision.reason },
    });
    return { ok: false, reason: "ambiguous_history" };
  }

  if (decision.action === "bind_existing") {
    await deps.bindResumeTurn({
      pauseResumeId: input.pauseResumeId,
      trueforgeResumeTurnId: decision.turn.id,
    });
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
      input: built.input,
      previousTurnId: built.previousTurnId,
      stream: false,
    });
    await deps.bindResumeTurn({
      pauseResumeId: input.pauseResumeId,
      trueforgeResumeTurnId: created.id,
    });
    return {
      ok: true,
      trueforgeTurnId: created.id,
      created: true,
      decision,
      inputHash: built.inputHash,
    };
  } catch (error) {
    await deps.markUncertain({
      pauseResumeId: input.pauseResumeId,
      error: {
        reason: "create_failed",
        message: error instanceof Error ? error.message : "unknown",
      },
    });
    return { ok: false, reason: "create_failed" };
  }
}
