import { randomBytes } from "node:crypto";
import type postgres from "postgres";

type SqlExecutor = postgres.Sql | postgres.TransactionSql;

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export async function enqueueComponentInterruptContinuationInTx(
  tx: SqlExecutor,
  input: {
    interactionId: string;
    uiInstanceId: string;
    interruptId: string;
    runStepId: string;
    channelAgentSessionId: string;
    sessionGenerationId: string;
    now: string;
  },
): Promise<{ ok: true; queueItemId: string } | { ok: false; message: string }> {
  const queueItemId = opaqueId("q");
  await tx`
    SELECT id FROM channel_agent_sessions WHERE id = ${input.channelAgentSessionId} FOR UPDATE
  `;
  await tx`
    INSERT INTO turn_queue_items (
      id, channel_agent_session_id, run_step_id, bound_session_generation_id,
      input_type, input_payload_redacted_json, fifo_sequence, state, created_at
    )
    SELECT
      ${queueItemId},
      ${input.channelAgentSessionId},
      ${input.runStepId},
      ${input.sessionGenerationId},
      'component_interaction_response',
      ${JSON.stringify({
        interaction_id: input.interactionId,
        ui_instance_id: input.uiInstanceId,
        component_interrupt_id: input.interruptId,
      })}::jsonb,
      COALESCE(
        (SELECT MAX(fifo_sequence) + 1 FROM turn_queue_items WHERE channel_agent_session_id = ${input.channelAgentSessionId}),
        0
      ),
      'queued',
      ${input.now}
  `;

  const resolved = await tx<{ id: string }[]>`
    UPDATE ui_component_interrupts
    SET state = 'resolved',
        continuation_queue_item_id = ${queueItemId},
        resolved_at = ${input.now}
    WHERE id = ${input.interruptId}
      AND state = 'waiting'
    RETURNING id
  `;
  if (!resolved[0]) {
    return {
      ok: false,
      message: "Component interrupt could not be compare-and-swapped to resolved.",
    };
  }

  return { ok: true, queueItemId };
}
