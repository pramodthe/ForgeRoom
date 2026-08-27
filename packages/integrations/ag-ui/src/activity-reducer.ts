import {
  activityDeltaEventSchema,
  activitySnapshotEventSchema,
  forgeRoomActivityContentSchema,
  type AgentChannelEnvelope,
  type ForgeRoomActivityContent,
} from "@forgeroom/contracts";
import { applyJsonPatch, type JsonPatchOp } from "./json-patch";

export type ActivityLaneOwner = {
  actorKind: AgentChannelEnvelope["actorKind"];
  coworkerId?: string;
  logicalThreadId?: string;
};

export type ActivityEntry = {
  content: ForgeRoomActivityContent;
  owner: ActivityLaneOwner;
};

export type ActivityPresentationState = {
  activities: Record<string, ActivityEntry>;
  needActivitySnapshots: Record<string, true>;
};

export function initialActivityPresentationState(): ActivityPresentationState {
  return {
    activities: {},
    needActivitySnapshots: {},
  };
}

function markNeedSnapshot(
  state: ActivityPresentationState,
  messageId: string,
): ActivityPresentationState {
  return {
    ...state,
    needActivitySnapshots: {
      ...state.needActivitySnapshots,
      [messageId]: true,
    },
  };
}

function clearNeedSnapshot(
  state: ActivityPresentationState,
  messageId: string,
): ActivityPresentationState {
  if (!state.needActivitySnapshots[messageId]) return state;
  const needActivitySnapshots = { ...state.needActivitySnapshots };
  delete needActivitySnapshots[messageId];
  return { ...state, needActivitySnapshots };
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

function identityFieldsMatch(
  previous: ForgeRoomActivityContent,
  next: ForgeRoomActivityContent,
): boolean {
  if (previous.activityType !== next.activityType) return false;
  switch (previous.activityType) {
    case "forgeroom.coworker_work.v1":
      return (
        next.activityType === previous.activityType &&
        previous.coworkerId === next.coworkerId &&
        previous.logicalThreadId === next.logicalThreadId
      );
    case "forgeroom.task_record.v1":
      return next.activityType === previous.activityType && previous.taskId === next.taskId;
    case "forgeroom.sandbox.v1":
      return next.activityType === previous.activityType && previous.sandboxId === next.sandboxId;
    case "forgeroom.artifact.v1":
      return next.activityType === previous.activityType && previous.artifactId === next.artifactId;
    case "forgeroom.pause_group.v1":
      return (
        next.activityType === previous.activityType && previous.pauseGroupId === next.pauseGroupId
      );
    case "forgeroom.controlled_ui.v1":
      return next.activityType === previous.activityType && previous.surfaceId === next.surfaceId;
    case "forgeroom.connection.v1":
      return (
        next.activityType === previous.activityType && previous.connectionId === next.connectionId
      );
    case "forgeroom.audit_receipt.v1":
      return next.activityType === previous.activityType && previous.runId === next.runId;
    default:
      return false;
  }
}

function envelopeOwnsContent(
  envelope: AgentChannelEnvelope,
  content: ForgeRoomActivityContent,
): boolean {
  if (content.activityType === "forgeroom.coworker_work.v1") {
    return (
      envelope.actorKind === "coworker" &&
      envelope.coworkerId === content.coworkerId &&
      envelope.logicalThreadId === content.logicalThreadId
    );
  }
  if (envelope.actorKind === "system") {
    return !envelope.coworkerId && !envelope.logicalThreadId;
  }
  return (
    envelope.actorKind === "coworker" && Boolean(envelope.coworkerId && envelope.logicalThreadId)
  );
}

/**
 * Pure activity presentation reducer.
 * ACTIVITY_SNAPSHOT replaces by messageId; ACTIVITY_DELTA requires an exact activityRevision base.
 * Each activity is owned by the emitting lane; divergence latches needActivitySnapshots.
 */
export function reduceActivityPresentationState(
  state: ActivityPresentationState,
  envelope: AgentChannelEnvelope,
): ActivityPresentationState {
  const event = envelope.aguiEvent;

  if (event.type === "ACTIVITY_SNAPSHOT") {
    const parsed = activitySnapshotEventSchema.safeParse(event);
    if (!parsed.success) {
      return typeof event.messageId === "string" ? markNeedSnapshot(state, event.messageId) : state;
    }
    const messageId = parsed.data.messageId;
    const contentParsed = forgeRoomActivityContentSchema.safeParse(parsed.data.content);
    if (!contentParsed.success) {
      return markNeedSnapshot(state, messageId);
    }
    const content = contentParsed.data;
    if (!envelopeOwnsContent(envelope, content)) {
      return markNeedSnapshot(state, messageId);
    }

    const owner = ownerFromEnvelope(envelope);
    const current = state.activities[messageId];
    if (current) {
      if (!sameOwner(current.owner, owner) || !identityFieldsMatch(current.content, content)) {
        return markNeedSnapshot(state, messageId);
      }
      // Stale/pre-resync snapshots must not roll revision backward.
      if (content.activityRevision < current.content.activityRevision) {
        return markNeedSnapshot(state, messageId);
      }
    }

    return clearNeedSnapshot(
      {
        ...state,
        activities: {
          ...state.activities,
          [messageId]: { content, owner },
        },
      },
      messageId,
    );
  }

  if (event.type === "ACTIVITY_DELTA") {
    const messageId = typeof event.messageId === "string" ? event.messageId : undefined;
    if (!messageId) return state;
    if (state.needActivitySnapshots[messageId]) {
      return state;
    }

    const parsed = activityDeltaEventSchema.safeParse(event);
    if (!parsed.success) {
      return markNeedSnapshot(state, messageId);
    }

    const current = state.activities[messageId];
    if (!current || current.content.activityType !== parsed.data.activityType) {
      return markNeedSnapshot(state, messageId);
    }
    const owner = ownerFromEnvelope(envelope);
    if (!sameOwner(current.owner, owner) || !envelopeOwnsContent(envelope, current.content)) {
      return markNeedSnapshot(state, messageId);
    }

    const baseRevision = parsed.data.patch[0];
    if (
      !baseRevision ||
      baseRevision.op !== "test" ||
      baseRevision.path !== "/activityRevision" ||
      baseRevision.value !== current.content.activityRevision
    ) {
      return markNeedSnapshot(state, messageId);
    }

    const nextDocument = applyJsonPatch(current.content, parsed.data.patch as JsonPatchOp[]);
    const nextParsed = forgeRoomActivityContentSchema.safeParse(nextDocument);
    if (!nextParsed.success || !identityFieldsMatch(current.content, nextParsed.data)) {
      return markNeedSnapshot(state, messageId);
    }

    return clearNeedSnapshot(
      {
        ...state,
        activities: {
          ...state.activities,
          [messageId]: { content: nextParsed.data, owner: current.owner },
        },
      },
      messageId,
    );
  }

  return state;
}
