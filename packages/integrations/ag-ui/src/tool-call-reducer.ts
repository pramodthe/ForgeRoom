import type { AgentChannelEnvelope } from "@forgeroom/contracts";
import type { ActivityLaneOwner } from "./activity-reducer";

export type ToolCallEntry = {
  toolCallId: string;
  toolName: string;
  status: "running" | "complete";
  parentMessageId?: string;
  owner: ActivityLaneOwner;
};

export type ToolCallPresentationState = {
  toolCalls: Record<string, ToolCallEntry>;
};

export function initialToolCallPresentationState(): ToolCallPresentationState {
  return { toolCalls: {} };
}

function ownerFromEnvelope(envelope: AgentChannelEnvelope): ActivityLaneOwner {
  return {
    actorKind: envelope.actorKind,
    ...(envelope.coworkerId ? { coworkerId: envelope.coworkerId } : {}),
    ...(envelope.logicalThreadId ? { logicalThreadId: envelope.logicalThreadId } : {}),
  };
}

function sameOwner(left: ActivityLaneOwner, right: ActivityLaneOwner): boolean {
  return (
    left.actorKind === right.actorKind &&
    left.coworkerId === right.coworkerId &&
    left.logicalThreadId === right.logicalThreadId
  );
}

/**
 * Pure tool-call presentation reducer keyed by toolCallId.
 * TOOL_CALL_ARGS deltas are accepted for correlation but not retained in browser state.
 */
export function reduceToolCallPresentationState(
  state: ToolCallPresentationState,
  envelope: AgentChannelEnvelope,
): ToolCallPresentationState {
  const event = envelope.aguiEvent;
  const owner = ownerFromEnvelope(envelope);

  if (event.type === "TOOL_CALL_START") {
    const prior = state.toolCalls[event.toolCallId];
    if (prior && !sameOwner(prior.owner, owner)) {
      return state;
    }
    return {
      toolCalls: {
        ...state.toolCalls,
        [event.toolCallId]: {
          toolCallId: event.toolCallId,
          toolName: event.toolCallName,
          status: prior?.status ?? "running",
          ...(event.parentMessageId
            ? { parentMessageId: event.parentMessageId }
            : prior?.parentMessageId
              ? { parentMessageId: prior.parentMessageId }
              : {}),
          owner,
        },
      },
    };
  }

  if (event.type === "TOOL_CALL_ARGS" || event.type === "TOOL_CALL_END") {
    const prior = state.toolCalls[event.toolCallId];
    if (!prior || !sameOwner(prior.owner, owner)) {
      return state;
    }
    return {
      toolCalls: {
        ...state.toolCalls,
        [event.toolCallId]: {
          ...prior,
          status: event.type === "TOOL_CALL_END" ? "complete" : prior.status,
        },
      },
    };
  }

  if (event.type === "TOOL_CALL_RESULT") {
    const prior = state.toolCalls[event.toolCallId];
    if (prior && !sameOwner(prior.owner, owner)) {
      return state;
    }
    return {
      toolCalls: {
        ...state.toolCalls,
        [event.toolCallId]: {
          toolCallId: event.toolCallId,
          toolName: prior?.toolName ?? "Tool",
          status: "complete",
          ...(prior?.parentMessageId ? { parentMessageId: prior.parentMessageId } : {}),
          owner: prior?.owner ?? owner,
        },
      },
    };
  }

  return state;
}
