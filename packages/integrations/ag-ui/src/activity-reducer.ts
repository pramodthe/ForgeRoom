import {
  activityDeltaEventSchema,
  activitySnapshotEventSchema,
  forgeRoomActivityContentSchema,
  type AgentChannelEnvelope,
  type ForgeRoomActivityContent,
} from "@forgeroom/contracts";
import { applyJsonPatch, type JsonPatchOp } from "./json-patch";

export type ActivityPresentationState = {
  activities: Record<string, ForgeRoomActivityContent>;
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

function envelopeOwnsActivity(
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
  // Channel/system activities may be emitted by system; coworker-scoped types still require the
  // coworker lane when the envelope carries coworker identity.
  if (envelope.actorKind === "coworker") {
    return Boolean(envelope.coworkerId && envelope.logicalThreadId);
  }
  return envelope.actorKind === "system";
}

/**
 * Pure activity presentation reducer.
 * ACTIVITY_SNAPSHOT replaces by messageId; ACTIVITY_DELTA requires an exact activityRevision base.
 * Divergence latches needActivitySnapshots until an authoritative non-stale snapshot arrives.
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
    if (!envelopeOwnsActivity(envelope, content)) {
      return markNeedSnapshot(state, messageId);
    }

    const current = state.activities[messageId];
    if (current) {
      if (!identityFieldsMatch(current, content)) {
        return markNeedSnapshot(state, messageId);
      }
      // Stale/pre-resync snapshots must not roll revision backward.
      if (content.activityRevision < current.activityRevision) {
        return markNeedSnapshot(state, messageId);
      }
    }

    return clearNeedSnapshot(
      {
        ...state,
        activities: {
          ...state.activities,
          [messageId]: content,
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
    if (!current || current.activityType !== parsed.data.activityType) {
      return markNeedSnapshot(state, messageId);
    }
    if (!envelopeOwnsActivity(envelope, current)) {
      return markNeedSnapshot(state, messageId);
    }

    const baseRevision = parsed.data.patch[0];
    if (
      !baseRevision ||
      baseRevision.op !== "test" ||
      baseRevision.path !== "/activityRevision" ||
      baseRevision.value !== current.activityRevision
    ) {
      return markNeedSnapshot(state, messageId);
    }

    const nextDocument = applyJsonPatch(current, parsed.data.patch as JsonPatchOp[]);
    const nextParsed = forgeRoomActivityContentSchema.safeParse(nextDocument);
    if (!nextParsed.success || !identityFieldsMatch(current, nextParsed.data)) {
      return markNeedSnapshot(state, messageId);
    }

    return clearNeedSnapshot(
      {
        ...state,
        activities: {
          ...state.activities,
          [messageId]: nextParsed.data,
        },
      },
      messageId,
    );
  }

  return state;
}
