import { createHash } from "node:crypto";
import type { AgentChannelEnvelope, P0PersistedAguiEvent } from "@forgeroom/contracts";
import { canonicalizeJson } from "@forgeroom/domain";
import { buildEnvelope } from "./event-builders";
import { assertPersistableChannelEnvelope } from "./event-guard";
import type { ChannelEventInsert, ChannelEventRecord } from "./store";

export function resolveAguiEventRecordMessageOrActivityId(
  aguiEvent: P0PersistedAguiEvent,
  sourceMessageId?: string | null,
): string | null {
  switch (aguiEvent.type) {
    case "TEXT_MESSAGE_START":
    case "TEXT_MESSAGE_CONTENT":
    case "TEXT_MESSAGE_END":
    case "ACTIVITY_SNAPSHOT":
    case "ACTIVITY_DELTA":
      return aguiEvent.messageId ?? null;
    case "RUN_STARTED":
    case "RUN_ERROR":
    case "RUN_FINISHED":
      return sourceMessageId ?? null;
    default:
      return null;
  }
}

export function resolveAguiRunIdFromPersistedEvent(aguiEvent: P0PersistedAguiEvent): string | null {
  if (
    aguiEvent.type === "RUN_STARTED" ||
    aguiEvent.type === "RUN_ERROR" ||
    aguiEvent.type === "RUN_FINISHED"
  ) {
    return aguiEvent.runId ?? null;
  }
  return null;
}

export function materializeChannelEvent(
  channelId: string,
  sequence: number,
  insert: ChannelEventInsert,
): { envelope: AgentChannelEnvelope; event: ChannelEventRecord } {
  const envelope = assertPersistableChannelEnvelope(
    buildEnvelope(sequence, {
      channelId,
      actorKind: insert.draft.actorKind,
      applicationRunId: insert.draft.applicationRunId,
      runStepId: insert.draft.runStepId,
      agentTurnId: insert.draft.agentTurnId,
      coworkerId: insert.draft.coworkerId,
      logicalThreadId: insert.draft.logicalThreadId ?? insert.logicalThreadId ?? undefined,
      sourceMessageId: insert.draft.sourceMessageId,
      aguiEvent: insert.draft.aguiEvent,
    }),
  );

  const event: ChannelEventRecord = {
    id: insert.id,
    channelId,
    sequence,
    type: insert.type,
    actorType: insert.actorType,
    actorId: insert.actorId,
    runId: insert.runId ?? null,
    payloadJson: envelope,
    aguiEventType: envelope.aguiEvent.type,
    aguiEventJson: envelope.aguiEvent,
    logicalThreadId: envelope.logicalThreadId ?? insert.logicalThreadId ?? null,
    createdAt: insert.createdAt,
  };
  return { envelope, event };
}

export function hashAguiEvent(aguiEvent: unknown): string {
  const digest = createHash("sha256").update(canonicalizeJson(aguiEvent), "utf8").digest("hex");
  return `sha256:${digest}`;
}
