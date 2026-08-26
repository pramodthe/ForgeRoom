import { createHash } from "node:crypto";
import type { AgentChannelEnvelope } from "@forgeroom/contracts";
import { buildEnvelope } from "./event-builders";
import { assertPersistableChannelEnvelope } from "./event-guard";
import type { ChannelEventInsert, ChannelEventRecord } from "./store";

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
  const digest = createHash("sha256").update(JSON.stringify(aguiEvent)).digest("hex");
  return `sha256:${digest}`;
}
