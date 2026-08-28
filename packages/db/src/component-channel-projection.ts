import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import {
  activitySnapshotEventSchema,
  agentChannelEnvelopeSchema,
  type P0PersistedAguiEvent,
} from "@forgeroom/contracts";
import { canonicalizeJson } from "@forgeroom/domain";

type SqlExecutor = postgres.Sql | postgres.TransactionSql;

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function hashAguiEvent(aguiEvent: P0PersistedAguiEvent): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(aguiEvent), "utf8").digest("hex")}`;
}

export async function appendComponentBrokerChannelProjectionInTx(
  tx: SqlExecutor,
  input: {
    channelId: string;
    coworkerId: string;
    logicalThreadId: string;
    applicationRunId: string;
    runStepId: string;
    agentTurnId: string;
    sourceMessageId: string;
    uiInstanceId: string;
    activityMessageId: string;
    stableName: string;
    componentVersion: string;
    renderRevision: number;
    textAlternative: string;
    now: string;
  },
): Promise<{ channelEventId: string; channelSequence: number }> {
  const channels = await tx<{ next_sequence: number }[]>`
    SELECT next_sequence
    FROM channels
    WHERE id = ${input.channelId}
    FOR UPDATE
  `;
  const channel = channels[0];
  if (!channel) {
    throw new Error(`channel ${input.channelId} not found`);
  }

  const aguiRunRows = await tx<{ agui_run_id: string }[]>`
    SELECT agui_run_id FROM agent_turns WHERE id = ${input.agentTurnId} LIMIT 1
  `;
  const aguiRunId = aguiRunRows[0]?.agui_run_id ?? null;

  const sequence = channel.next_sequence;
  const channelEventId = opaqueId("evt");
  const aguiEvent = activitySnapshotEventSchema.parse({
    type: "ACTIVITY_SNAPSHOT",
    messageId: input.activityMessageId,
    activityType: "forgeroom.controlled_ui.v1",
    replace: true,
    content: {
      schemaVersion: 1,
      activityRevision: 0,
      activityType: "forgeroom.controlled_ui.v1",
      surfaceId: input.uiInstanceId,
      rail: "registry_v1",
      componentName: input.stableName,
      componentVersion: input.componentVersion,
      status: "ready",
      renderRevision: input.renderRevision,
      stateRevision: null,
      textAlternative: input.textAlternative,
    },
  });

  const envelope = agentChannelEnvelopeSchema.parse({
    schemaVersion: 1,
    channelId: input.channelId,
    channelSequence: sequence,
    applicationRunId: input.applicationRunId,
    runStepId: input.runStepId,
    agentTurnId: input.agentTurnId,
    actorKind: "coworker",
    coworkerId: input.coworkerId,
    logicalThreadId: input.logicalThreadId,
    sourceMessageId: input.sourceMessageId,
    aguiEvent,
  });

  await tx`
    INSERT INTO channel_events (
      id, channel_id, sequence, type, actor_type, actor_id, run_id,
      payload_json, agui_event_type, agui_event_json, logical_thread_id, created_at
    )
    VALUES (
      ${channelEventId},
      ${input.channelId},
      ${sequence},
      ${`agui.${aguiEvent.type.toLowerCase()}`},
      'coworker',
      ${input.coworkerId},
      ${input.applicationRunId},
      ${JSON.stringify(envelope)}::jsonb,
      ${aguiEvent.type},
      ${JSON.stringify(aguiEvent)}::jsonb,
      ${input.logicalThreadId},
      ${input.now}
    )
  `;

  await tx`
    INSERT INTO agui_event_records (
      id, channel_event_id, agent_turn_id, logical_thread_id, agui_run_id,
      event_type, message_or_activity_id, storage_kind, event_json,
      schema_profile, event_hash, created_at
    )
    VALUES (
      ${opaqueId("agui")},
      ${channelEventId},
      ${input.agentTurnId},
      ${input.logicalThreadId},
      ${aguiRunId},
      ${aguiEvent.type},
      ${input.activityMessageId},
      'full_event',
      ${JSON.stringify(aguiEvent)}::jsonb,
      'p0_persisted_agui',
      ${hashAguiEvent(aguiEvent)},
      ${input.now}
    )
  `;

  await tx`
    UPDATE channels
    SET next_sequence = ${sequence + 1}, updated_at = ${input.now}
    WHERE id = ${input.channelId}
  `;

  return { channelEventId, channelSequence: sequence };
}
