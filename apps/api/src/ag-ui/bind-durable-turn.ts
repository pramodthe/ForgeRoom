import {
  bindTrueForgeTurnId,
  claimTurnQueueItem,
  createSql,
  lockAgentTurnForCreate,
  markAgentTurnUncertain,
  refreshRunLifecycleForStep,
} from "@forgeroom/db";
import { createOrReconcileTurn } from "@forgeroom/orchestration/create-or-reconcile-turn";
import type { TrueForgeClient } from "@forgeroom/trueforge";

export type SqlClient = ReturnType<typeof createSql>;

export type BoundDurableTurn = {
  agentTurnId: string;
  applicationRunToken: string;
  aguiRunId: string;
  trueforgeTurnId: string;
  trueforgeSessionId: string;
};

async function loadQueueItemForStep(
  sql: SqlClient,
  runStepId: string,
): Promise<{ id: string; state: string } | null> {
  const rows = await sql<{ id: string; state: string }[]>`
    SELECT id, state
    FROM turn_queue_items
    WHERE run_step_id = ${runStepId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function loadBoundTurnForStep(
  sql: SqlClient,
  runStepId: string,
): Promise<BoundDurableTurn | null> {
  const rows = await sql<
    {
      id: string;
      application_run_token: string;
      agui_run_id: string;
      trueforge_turn_id: string | null;
      trueforge_session_id: string;
    }[]
  >`
    SELECT
      t.id,
      t.application_run_token,
      t.agui_run_id,
      t.trueforge_turn_id,
      g.trueforge_session_id
    FROM agent_turns AS t
    JOIN channel_agent_session_generations AS g ON g.id = t.session_generation_id
    WHERE t.run_step_id = ${runStepId}
    ORDER BY t.started_at DESC NULLS LAST
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.trueforge_turn_id) {
    return null;
  }
  return {
    agentTurnId: row.id,
    applicationRunToken: row.application_run_token,
    aguiRunId: row.agui_run_id,
    trueforgeTurnId: row.trueforge_turn_id,
    trueforgeSessionId: row.trueforge_session_id,
  };
}

async function markRunStepFailed(sql: SqlClient, runStepId: string): Promise<void> {
  const now = new Date().toISOString();
  await sql`
    UPDATE run_steps
    SET state = 'failed', completed_at = COALESCE(completed_at, ${now})
    WHERE id = ${runStepId}
      AND state NOT IN ('completed', 'cancelled', 'failed')
  `;
  await refreshRunLifecycleForStep(sql, { runStepId, now });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Claim the durable queue item for a RunStep (or wait for a worker claim),
 * then create/reconcile the TrueForge turn with DB binding — never a synthetic side turn.
 */
export async function bindDurableTrueForgeTurn(input: {
  sql: SqlClient;
  trueforgeClient: Pick<TrueForgeClient, "createTurn" | "listTurns">;
  runStepId: string;
  content: string;
  clientAguiRunId: string;
  timeoutMs?: number;
  intervalMs?: number;
}): Promise<
  | { ok: true; value: BoundDurableTurn }
  | { ok: false; reason: "queue_missing" | "claim_failed" | "create_failed" | "timeout" }
> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const intervalMs = input.intervalMs ?? 100;
  const startedAt = Date.now();
  const workerId = `agui_${input.clientAguiRunId}`;

  while (Date.now() - startedAt < timeoutMs) {
    const existing = await loadBoundTurnForStep(input.sql, input.runStepId);
    if (existing) {
      if (existing.aguiRunId !== input.clientAguiRunId) {
        await input.sql`
          UPDATE agent_turns
          SET agui_run_id = ${input.clientAguiRunId}
          WHERE id = ${existing.agentTurnId}
        `;
      }
      return {
        ok: true,
        value: { ...existing, aguiRunId: input.clientAguiRunId },
      };
    }

    const queueItem = await loadQueueItemForStep(input.sql, input.runStepId);
    if (!queueItem) {
      return { ok: false, reason: "queue_missing" };
    }

    if (queueItem.state === "queued" || queueItem.state === "retryable") {
      const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
      const claim = await claimTurnQueueItem(input.sql, {
        queueItemId: queueItem.id,
        workerId,
        leaseExpiresAt,
        expectedState: queueItem.state === "retryable" ? "retryable" : "queued",
      });
      if (!claim.ok) {
        // Another worker may have claimed; wait for its bind.
        await sleep(intervalMs);
        continue;
      }

      const gens = await input.sql<{ trueforge_session_id: string }[]>`
        SELECT trueforge_session_id
        FROM channel_agent_session_generations
        WHERE id = ${claim.boundSessionGenerationId}
        LIMIT 1
      `;
      const trueforgeSessionId = gens[0]?.trueforge_session_id;
      if (!trueforgeSessionId) {
        await markAgentTurnUncertain(input.sql, {
          agentTurnId: claim.agentTurnId,
          error: { reason: "missing_trueforge_session" },
          expectedStates: ["intended", "acquiring", "creating", "uncertain"],
        });
        await markRunStepFailed(input.sql, input.runStepId);
        return { ok: false, reason: "create_failed" };
      }

      await input.sql`
        UPDATE agent_turns
        SET agui_run_id = ${input.clientAguiRunId}
        WHERE id = ${claim.agentTurnId}
      `;

      const created = await createOrReconcileTurn(
        {
          client: input.trueforgeClient,
          lockForCreate: async () =>
            lockAgentTurnForCreate(input.sql, {
              agentTurnId: claim.agentTurnId,
              expectedStates: ["intended", "acquiring", "creating", "uncertain"],
            }),
          bindTurn: async (bind) => {
            await bindTrueForgeTurnId(input.sql, {
              agentTurnId: bind.agentTurnId,
              trueforgeTurnId: bind.trueforgeTurnId,
              previousTrueforgeTurnId: bind.previousTrueforgeTurnId,
              expectedStates: ["creating", "uncertain"],
              nextState: "streaming",
            });
          },
          markUncertain: async (uncertain) => {
            await markAgentTurnUncertain(input.sql, {
              ...uncertain,
              expectedStates: ["intended", "acquiring", "creating", "uncertain"],
            });
          },
        },
        {
          agentTurnId: claim.agentTurnId,
          trueforgeSessionId,
          applicationRunToken: claim.applicationRunToken,
          content: input.content,
          previousTrueforgeTurnId: null,
          localTrueforgeTurnId: null,
          forceReconcile: false,
        },
      );

      if (!created.ok) {
        await markRunStepFailed(input.sql, input.runStepId);
        return { ok: false, reason: "create_failed" };
      }

      return {
        ok: true,
        value: {
          agentTurnId: claim.agentTurnId,
          applicationRunToken: claim.applicationRunToken,
          aguiRunId: input.clientAguiRunId,
          trueforgeTurnId: created.trueforgeTurnId,
          trueforgeSessionId,
        },
      };
    }

    // Already claimed or in progress — wait for the durable bind.
    await sleep(intervalMs);
  }

  // A timeout here only means this request did not observe another worker's
  // durable bind in time. It does not own that worker's lease and must not
  // terminalize the shared RunStep.
  return { ok: false, reason: "timeout" };
}
