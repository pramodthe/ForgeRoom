import {
  bindTrueForgeTurnId,
  claimTurnQueueItem,
  loadAgentTurnCreateContext,
  lockAgentTurnForCreate,
  markAgentTurnUncertain,
  markComponentInterruptContinued,
  type createSql,
} from "@forgeroom/db";
import { createOrReconcileComponentContinuationTurn } from "@forgeroom/orchestration/create-or-reconcile-component-continuation-turn";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { AgUiRunBootstrap, AgUiRunService } from "./run-service";

type SqlClient = ReturnType<typeof createSql>;

export type ComponentContinuationRunner = {
  run(
    queueItemId: string,
  ): Promise<
    { ok: true; agentTurnId: string; trueforgeTurnId: string } | { ok: false; reason: string }
  >;
};

async function loadContinuationBootstrap(
  sql: SqlClient,
  agentTurnId: string,
  aguiRunId: string,
  trueforgeTurnId: string,
): Promise<AgUiRunBootstrap | null> {
  const rows = await sql<
    Array<{
      application_run_id: string;
      source_message_id: string;
      run_step_id: string;
      channel_id: string;
      coworker_id: string;
      logical_thread_id: string;
      trueforge_session_id: string;
    }>
  >`
    SELECT
      r.id AS application_run_id,
      r.source_message_id,
      rs.id AS run_step_id,
      r.channel_id,
      rs.assigned_agent_id AS coworker_id,
      cas.logical_agui_thread_id AS logical_thread_id,
      gen.trueforge_session_id
    FROM agent_turns AS turn
    JOIN run_steps AS rs ON rs.id = turn.run_step_id
    JOIN runs AS r ON r.id = rs.run_id
    JOIN channel_agent_sessions AS cas ON cas.id = turn.channel_agent_session_id
    JOIN channel_agent_session_generations AS gen ON gen.id = turn.session_generation_id
    WHERE turn.id = ${agentTurnId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    threadId: row.logical_thread_id,
    aguiRunId,
    applicationRunId: row.application_run_id,
    runStepId: row.run_step_id,
    agentTurnId,
    messageId: row.source_message_id,
    channelId: row.channel_id,
    coworkerId: row.coworker_id,
    trueforgeSessionId: row.trueforge_session_id,
    trueforgeTurnId,
  };
}

/**
 * Consume the exact queue item emitted by a trusted component interaction.
 * Provider work happens after the short claim transaction and is mirrored to
 * the durable channel timeline through the same path as an ordinary AG-UI run.
 */
export function createComponentContinuationRunner(options: {
  sql: SqlClient;
  trueforgeClient: Pick<TrueForgeClient, "createTurn" | "listTurns">;
  streamPreparedRun: AgUiRunService["streamPreparedRun"];
}): ComponentContinuationRunner {
  return {
    async run(queueItemId) {
      const claim = await claimTurnQueueItem(options.sql, {
        queueItemId,
        workerId: `component_${queueItemId}`,
        leaseExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      if (!claim.ok) {
        return { ok: false, reason: claim.reason };
      }
      if (claim.inputType !== "component_interaction_response") {
        await markAgentTurnUncertain(options.sql, {
          agentTurnId: claim.agentTurnId,
          error: { reason: "unexpected_component_continuation_input_type" },
        });
        return { ok: false, reason: "unexpected_input_type" };
      }

      const context = await loadAgentTurnCreateContext(options.sql, claim.agentTurnId);
      if (!context || context.kind !== "component_continuation") {
        await markAgentTurnUncertain(options.sql, {
          agentTurnId: claim.agentTurnId,
          error: { reason: "component_continuation_context_missing" },
        });
        return { ok: false, reason: "context_missing" };
      }

      const created = await createOrReconcileComponentContinuationTurn(
        {
          client: options.trueforgeClient,
          lockForCreate: () =>
            lockAgentTurnForCreate(options.sql, { agentTurnId: claim.agentTurnId }),
          bindTurn: (input) => bindTrueForgeTurnId(options.sql, input),
          markUncertain: async (input) => {
            await markAgentTurnUncertain(options.sql, input);
          },
          onContinued: async ({ interruptId, agentTurnId }) => {
            await markComponentInterruptContinued(options.sql, { interruptId, agentTurnId });
          },
        },
        {
          agentTurnId: claim.agentTurnId,
          trueforgeSessionId: context.trueforgeSessionId,
          applicationRunToken: context.applicationRunToken,
          previousTrueforgeTurnId: context.previousTrueforgeTurnId,
          response: {
            interruptId: context.interruptId,
            toolCallId: context.toolCallId,
            threadId: context.threadId,
            resultRedacted: context.resultRedacted,
          },
          localTrueforgeTurnId: context.localTrueforgeTurnId,
          forceReconcile: false,
        },
      );
      if (!created.ok) {
        return { ok: false, reason: created.reason };
      }

      const bootstrap = await loadContinuationBootstrap(
        options.sql,
        claim.agentTurnId,
        claim.aguiRunId,
        created.trueforgeTurnId,
      );
      if (!bootstrap) {
        await markAgentTurnUncertain(options.sql, {
          agentTurnId: claim.agentTurnId,
          error: { reason: "component_continuation_bootstrap_missing" },
        });
        return { ok: false, reason: "bootstrap_missing" };
      }

      await options.streamPreparedRun(bootstrap, async () => {});
      return {
        ok: true,
        agentTurnId: claim.agentTurnId,
        trueforgeTurnId: created.trueforgeTurnId,
      };
    },
  };
}
