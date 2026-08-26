import type { AgentChannelEnvelope, P0PersistedAguiEvent } from "@forgeroom/contracts";

export type CustomSourceEventName =
  | "channel.created"
  | "channel.renamed"
  | "channel.archived"
  | "participant.added"
  | "participant.removed"
  | "message.created"
  | "pin.created"
  | "pin.removed";

export function customAguiEvent(name: CustomSourceEventName): P0PersistedAguiEvent {
  if (name === "message.created") {
    throw new Error("message.created requires authoritative routing payload");
  }
  return {
    type: "CUSTOM",
    name,
    payload: { schemaVersion: 1 },
  };
}

export function pinAguiEvent(
  name: "pin.created" | "pin.removed",
  pinId: string,
): P0PersistedAguiEvent {
  return {
    type: "CUSTOM",
    name,
    payload: { schemaVersion: 1, pin_id: pinId },
  };
}

export function messageCreatedAguiEvent(input: {
  routing_mode: "direct" | "team";
  recipient_handles: readonly string[];
}): P0PersistedAguiEvent {
  return {
    type: "CUSTOM",
    name: "message.created",
    payload: {
      schemaVersion: 1,
      routing_mode: input.routing_mode,
      recipient_handles: [...input.recipient_handles],
    },
  };
}

export type EnvelopeDraft = {
  channelId: string;
  actorKind: AgentChannelEnvelope["actorKind"];
  applicationRunId?: string;
  runStepId?: string;
  agentTurnId?: string;
  coworkerId?: string;
  logicalThreadId?: string;
  sourceMessageId?: string;
  aguiEvent: P0PersistedAguiEvent;
};

export function buildEnvelope(sequence: number, draft: EnvelopeDraft): AgentChannelEnvelope {
  return {
    schemaVersion: 1,
    channelId: draft.channelId,
    channelSequence: sequence,
    actorKind: draft.actorKind,
    ...(draft.applicationRunId ? { applicationRunId: draft.applicationRunId } : {}),
    ...(draft.runStepId ? { runStepId: draft.runStepId } : {}),
    ...(draft.agentTurnId ? { agentTurnId: draft.agentTurnId } : {}),
    ...(draft.coworkerId ? { coworkerId: draft.coworkerId } : {}),
    ...(draft.logicalThreadId ? { logicalThreadId: draft.logicalThreadId } : {}),
    ...(draft.sourceMessageId ? { sourceMessageId: draft.sourceMessageId } : {}),
    aguiEvent: draft.aguiEvent,
  };
}
