import {
  channelUIStateV1Schema,
  stateDeltaEventSchema,
  stateSnapshotEventSchema,
  threadUIStateV1Schema,
  type AgentChannelEnvelope,
  type ChannelUIStateV1,
  type ThreadUIStateV1,
} from "@forgeroom/contracts";
import { applyJsonPatch, type JsonPatchOp } from "./json-patch";

export type UiPresentationState = {
  channel: ChannelUIStateV1 | null;
  threads: Record<string, ThreadUIStateV1>;
  needChannelSnapshot: boolean;
  needThreadSnapshots: Record<string, true>;
};

export function initialUiPresentationState(): UiPresentationState {
  return {
    channel: null,
    threads: {},
    needChannelSnapshot: false,
    needThreadSnapshots: {},
  };
}

function markNeedThreadSnapshot(
  state: UiPresentationState,
  logicalThreadId: string,
): UiPresentationState {
  return {
    ...state,
    needThreadSnapshots: {
      ...state.needThreadSnapshots,
      [logicalThreadId]: true,
    },
  };
}

function clearNeedThreadSnapshot(
  state: UiPresentationState,
  logicalThreadId: string,
): UiPresentationState {
  if (!state.needThreadSnapshots[logicalThreadId]) return state;
  const needThreadSnapshots = { ...state.needThreadSnapshots };
  delete needThreadSnapshots[logicalThreadId];
  return { ...state, needThreadSnapshots };
}

function applyChannelSnapshot(
  state: UiPresentationState,
  envelope: AgentChannelEnvelope,
  snapshot: ChannelUIStateV1,
): UiPresentationState {
  if (envelope.actorKind !== "system" || envelope.coworkerId || envelope.logicalThreadId) {
    return { ...state, needChannelSnapshot: true };
  }
  if (snapshot.channel.id !== envelope.channelId) {
    return { ...state, needChannelSnapshot: true };
  }
  const parsed = channelUIStateV1Schema.safeParse(snapshot);
  if (!parsed.success) {
    return { ...state, needChannelSnapshot: true };
  }
  return {
    ...state,
    channel: parsed.data,
    needChannelSnapshot: false,
  };
}

function applyThreadSnapshot(
  state: UiPresentationState,
  envelope: AgentChannelEnvelope,
  snapshot: ThreadUIStateV1,
): UiPresentationState {
  if (envelope.actorKind !== "coworker" || !envelope.coworkerId || !envelope.logicalThreadId) {
    return markNeedThreadSnapshot(state, snapshot.logicalThreadId);
  }
  if (
    envelope.coworkerId !== snapshot.coworkerId ||
    envelope.logicalThreadId !== snapshot.logicalThreadId
  ) {
    return markNeedThreadSnapshot(state, snapshot.logicalThreadId);
  }
  const parsed = threadUIStateV1Schema.safeParse(snapshot);
  if (!parsed.success) {
    return markNeedThreadSnapshot(state, snapshot.logicalThreadId);
  }
  return clearNeedThreadSnapshot(
    {
      ...state,
      threads: {
        ...state.threads,
        [parsed.data.logicalThreadId]: parsed.data,
      },
    },
    parsed.data.logicalThreadId,
  );
}

function applyChannelDelta(
  state: UiPresentationState,
  envelope: AgentChannelEnvelope,
  revision: number,
  patch: JsonPatchOp[],
): UiPresentationState {
  if (state.needChannelSnapshot) {
    return state;
  }
  if (envelope.actorKind !== "system" || envelope.coworkerId || envelope.logicalThreadId) {
    return { ...state, needChannelSnapshot: true };
  }
  if (!state.channel || state.channel.revision !== revision) {
    return { ...state, needChannelSnapshot: true };
  }
  const next = applyJsonPatch(state.channel, patch);
  const parsed = channelUIStateV1Schema.safeParse(next);
  if (!parsed.success) {
    return { ...state, needChannelSnapshot: true };
  }
  return {
    ...state,
    channel: parsed.data,
    needChannelSnapshot: false,
  };
}

function applyThreadDelta(
  state: UiPresentationState,
  envelope: AgentChannelEnvelope,
  revision: number,
  patch: JsonPatchOp[],
): UiPresentationState {
  const logicalThreadId = envelope.logicalThreadId;
  if (!logicalThreadId) {
    return state;
  }
  if (state.needThreadSnapshots[logicalThreadId]) {
    return state;
  }
  if (envelope.actorKind !== "coworker" || !envelope.coworkerId) {
    return markNeedThreadSnapshot(state, logicalThreadId);
  }
  const current = state.threads[logicalThreadId];
  if (!current || current.revision !== revision) {
    return markNeedThreadSnapshot(state, logicalThreadId);
  }
  if (current.coworkerId !== envelope.coworkerId) {
    return markNeedThreadSnapshot(state, logicalThreadId);
  }
  const next = applyJsonPatch(current, patch);
  const parsed = threadUIStateV1Schema.safeParse(next);
  if (!parsed.success) {
    return markNeedThreadSnapshot(state, logicalThreadId);
  }
  if (
    parsed.data.logicalThreadId !== logicalThreadId ||
    parsed.data.coworkerId !== envelope.coworkerId
  ) {
    return markNeedThreadSnapshot(state, logicalThreadId);
  }
  return clearNeedThreadSnapshot(
    {
      ...state,
      threads: {
        ...state.threads,
        [logicalThreadId]: parsed.data,
      },
    },
    logicalThreadId,
  );
}

/**
 * Pure ChannelUIState / ThreadUIState reducer.
 * Channel state is owned only by the system lane; thread state is per-coworker.
 * Wrong base, failed patch, or lane clash requests a fresh snapshot instead of guessing.
 */
export function reduceUiPresentationState(
  state: UiPresentationState,
  envelope: AgentChannelEnvelope,
): UiPresentationState {
  const event = envelope.aguiEvent;

  if (event.type === "STATE_SNAPSHOT") {
    const parsed = stateSnapshotEventSchema.safeParse(event);
    if (!parsed.success) {
      return event.snapshot.stateKind === "channel"
        ? { ...state, needChannelSnapshot: true }
        : markNeedThreadSnapshot(state, event.snapshot.logicalThreadId);
    }
    if (parsed.data.snapshot.stateKind === "channel") {
      return applyChannelSnapshot(state, envelope, parsed.data.snapshot);
    }
    return applyThreadSnapshot(state, envelope, parsed.data.snapshot);
  }

  if (event.type === "STATE_DELTA") {
    const parsed = stateDeltaEventSchema.safeParse(event);
    if (!parsed.success) {
      if (event.stateKind === "channel") {
        return { ...state, needChannelSnapshot: true };
      }
      return envelope.logicalThreadId
        ? markNeedThreadSnapshot(state, envelope.logicalThreadId)
        : state;
    }
    const patch = parsed.data.patch as JsonPatchOp[];
    if (parsed.data.stateKind === "channel") {
      return applyChannelDelta(state, envelope, parsed.data.revision, patch);
    }
    return applyThreadDelta(state, envelope, parsed.data.revision, patch);
  }

  return state;
}
