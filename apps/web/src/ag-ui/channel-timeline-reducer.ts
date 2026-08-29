import type {
  AgentChannelEnvelope,
  ChannelTimelineMessage,
  RunActivityCounters,
  RunLifecycle,
} from "@forgeroom/contracts";
import { applicationSourceNameSchema } from "@forgeroom/contracts";
import {
  initialActivityPresentationState,
  reduceActivityPresentationState,
  initialUiPresentationState,
  reduceUiPresentationState,
  type ActivityLaneOwner,
  type ActivityPresentationState,
  type UiPresentationState,
} from "@forgeroom/ag-ui/browser";

export type TimelineMessage = {
  key: string;
  messageId?: string;
  sequence: number;
  kind: "human" | "coworker";
  authorId: string;
  content: string;
  status: "sent" | "streaming" | "complete" | "failed";
};

export type TimelineRun = {
  runStepId: string;
  applicationRunId?: string;
  coworkerId: string;
  sequence: number;
  status: "running" | "complete" | "partial" | "needs_input" | "failed";
  message?: string;
  lifecycle?: RunLifecycle;
  counters?: RunActivityCounters;
};

export type ApplicationSourceName = import("@forgeroom/contracts").ApplicationSourceName;

export type TimelineCustomEvent = {
  key: string;
  sequence: number;
  name: ApplicationSourceName;
  lifecycle?: RunLifecycle;
  activity?: RunActivityCounters;
  actorKind: AgentChannelEnvelope["actorKind"];
  coworkerId?: string;
};

export type TimelineInertActivity = {
  key: string;
  sequence: number;
  messageId: string;
  reason: "unsupported_capability" | "unknown";
  summary?: string;
};

export type TimelineActivityRef = {
  key: string;
  sequence: number;
  messageId: string;
  owner: ActivityLaneOwner;
};

export type ChannelTimelineState = {
  channelId: string;
  messages: Record<string, TimelineMessage>;
  runs: Record<string, TimelineRun>;
  activityState: ActivityPresentationState;
  uiState: UiPresentationState;
  activitySequences: Record<string, number>;
  activityRefs: Record<string, TimelineActivityRef>;
  customEvents: Record<string, TimelineCustomEvent>;
  inertActivities: Record<string, TimelineInertActivity>;
  seenSequences: Record<string, true>;
};

export type ChannelTimelineAction =
  | { type: "reset"; channelId: string }
  | { type: "merge_messages"; messages: ChannelTimelineMessage[] }
  | { type: "event"; envelope: AgentChannelEnvelope };

function isTerminalRunStatus(status: TimelineRun["status"]): boolean {
  return status === "complete" || status === "partial" || status === "failed";
}

export function initialChannelTimelineState(channelId: string): ChannelTimelineState {
  return {
    channelId,
    messages: {},
    runs: {},
    activityState: initialActivityPresentationState(),
    uiState: initialUiPresentationState(),
    activitySequences: {},
    activityRefs: {},
    customEvents: {},
    inertActivities: {},
    seenSequences: {},
  };
}

function threadPhaseKeepsLogicalTurnBusy(phase: string | undefined): boolean {
  return phase === "running" || phase === "queued" || phase === "interrupted";
}

function applicationRunLifecycleKeepsBusy(lifecycle: RunLifecycle | undefined): boolean {
  return lifecycle === "active" || lifecycle === "queued";
}

function resolveWireRunOutcome(input: {
  envelope: AgentChannelEnvelope;
  event: Extract<AgentChannelEnvelope["aguiEvent"], { type: "RUN_FINISHED" | "RUN_ERROR" }>;
  uiState: UiPresentationState;
  prior?: TimelineRun;
}): Pick<TimelineRun, "status" | "lifecycle"> & { message?: string } {
  if (input.event.type === "RUN_ERROR") {
    return {
      status: "failed",
      lifecycle: "failed",
      message: input.event.message,
    };
  }

  if (input.event.outcome.type === "interrupt") {
    return {
      status: "needs_input",
      lifecycle: "active",
      message: input.event.outcome.interrupts[0]?.message ?? "Human input is required.",
    };
  }

  const threadPhase = input.envelope.logicalThreadId
    ? input.uiState.threads[input.envelope.logicalThreadId]?.phase
    : undefined;
  const channelRunLifecycle = input.envelope.applicationRunId
    ? input.uiState.channel?.runs[input.envelope.applicationRunId]?.lifecycle
    : undefined;

  if (
    threadPhaseKeepsLogicalTurnBusy(threadPhase) ||
    applicationRunLifecycleKeepsBusy(channelRunLifecycle)
  ) {
    return {
      status: "running",
      lifecycle: channelRunLifecycle ?? input.prior?.lifecycle ?? "active",
      ...(input.prior?.message ? { message: input.prior.message } : {}),
    };
  }

  return {
    status: "complete",
    lifecycle: "completed",
  };
}

function advanceSeenEnvelope(
  state: ChannelTimelineState,
  envelope: AgentChannelEnvelope,
): ChannelTimelineState {
  return {
    ...state,
    seenSequences: {
      ...state.seenSequences,
      [String(envelope.channelSequence)]: true,
    },
    uiState: reduceUiPresentationState(state.uiState, envelope),
  };
}

function streamOwnsCoworkerSequence(
  messages: Record<string, TimelineMessage>,
  sequence: number,
): boolean {
  return Object.values(messages).some(
    (message) =>
      message.kind === "coworker" &&
      message.sequence === sequence &&
      !message.key.startsWith("seq:"),
  );
}

function coworkerSequenceIsStreaming(
  messages: Record<string, TimelineMessage>,
  sequence: number,
): boolean {
  return Object.values(messages).some(
    (message) => message.sequence === sequence && message.status === "streaming",
  );
}

function isUnsupportedCapabilitySnapshot(event: AgentChannelEnvelope["aguiEvent"]): {
  messageId: string;
  summary?: string;
} | null {
  if (event.type !== "ACTIVITY_SNAPSHOT" || typeof event.messageId !== "string") return null;
  const content = event.content;
  if (!content || typeof content !== "object") return null;
  const record = content as Record<string, unknown>;
  if (record.phase !== "unsupported_capability") return null;
  return {
    messageId: event.messageId,
    summary: typeof record.summary === "string" ? record.summary : undefined,
  };
}

function applyRunProjection(
  runs: Record<string, TimelineRun>,
  envelope: AgentChannelEnvelope,
  lifecycle?: RunLifecycle,
  counters?: RunActivityCounters,
): Record<string, TimelineRun> {
  if (!envelope.runStepId || !envelope.coworkerId) return runs;
  const prior = runs[envelope.runStepId];
  if (prior && envelope.channelSequence <= prior.sequence) return runs;
  if (
    prior &&
    isTerminalRunStatus(prior.status) &&
    (lifecycle === "queued" || lifecycle === "active")
  ) {
    return runs;
  }
  const projectedStatus =
    lifecycle === "completed"
      ? "complete"
      : lifecycle === "partial"
        ? "partial"
        : lifecycle === "failed" || lifecycle === "cancelled"
          ? "failed"
          : (prior?.status ?? "running");
  return {
    ...runs,
    [envelope.runStepId]: {
      runStepId: envelope.runStepId,
      ...(envelope.applicationRunId
        ? { applicationRunId: envelope.applicationRunId }
        : prior?.applicationRunId
          ? { applicationRunId: prior.applicationRunId }
          : {}),
      coworkerId: envelope.coworkerId,
      sequence: envelope.channelSequence,
      status: projectedStatus,
      ...(prior?.message ? { message: prior.message } : {}),
      ...(lifecycle ? { lifecycle } : prior?.lifecycle ? { lifecycle: prior.lifecycle } : {}),
      ...(counters ? { counters } : prior?.counters ? { counters: prior.counters } : {}),
    },
  };
}

export function channelTimelineReducer(
  state: ChannelTimelineState,
  action: ChannelTimelineAction,
): ChannelTimelineState {
  if (action.type === "reset") return initialChannelTimelineState(action.channelId);

  if (action.type === "merge_messages") {
    const messages = { ...state.messages };
    for (const message of action.messages) {
      if (message.author_type === "human") {
        const key = `human:${message.id}`;
        const existing = messages[key];
        if (existing?.status === "streaming") continue;
        messages[key] = {
          key,
          messageId: message.id,
          sequence: message.channel_sequence,
          kind: "human",
          authorId: message.author_id,
          content: message.body,
          status: "sent",
        };
        continue;
      }

      if (message.author_type !== "coworker") continue;

      const sequence = message.channel_sequence;
      if (
        streamOwnsCoworkerSequence(messages, sequence) ||
        coworkerSequenceIsStreaming(messages, sequence) ||
        state.seenSequences[String(sequence)]
      ) {
        continue;
      }

      const key = `seq:${sequence}`;
      const existing = messages[key];
      if (existing?.status === "streaming") continue;

      messages[key] = {
        key,
        messageId: message.id,
        sequence,
        kind: "coworker",
        authorId: message.author_id,
        content: message.body,
        status: "sent",
      };
    }
    return { ...state, messages };
  }

  const envelope = action.envelope;
  if (
    envelope.channelId !== state.channelId ||
    state.seenSequences[String(envelope.channelSequence)]
  ) {
    return state;
  }

  const next = advanceSeenEnvelope(state, envelope);
  const event = envelope.aguiEvent;
  const runStepId = envelope.runStepId;

  if (event.type === "RUN_STARTED" && runStepId && envelope.coworkerId) {
    const prior = next.runs[runStepId];
    if (
      prior &&
      (envelope.channelSequence <= prior.sequence || isTerminalRunStatus(prior.status))
    ) {
      return next;
    }
    return {
      ...next,
      runs: {
        ...next.runs,
        [runStepId]: {
          runStepId,
          ...(envelope.applicationRunId ? { applicationRunId: envelope.applicationRunId } : {}),
          coworkerId: envelope.coworkerId,
          sequence: envelope.channelSequence,
          status: "running",
          lifecycle: "active",
        },
      },
    };
  }

  if (
    (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") &&
    runStepId &&
    envelope.coworkerId
  ) {
    const prior = next.runs[runStepId];
    if (prior && envelope.channelSequence <= prior.sequence) {
      return next;
    }
    const outcome = resolveWireRunOutcome({
      envelope,
      event,
      uiState: next.uiState,
      prior,
    });
    return {
      ...next,
      runs: {
        ...next.runs,
        [runStepId]: {
          runStepId,
          ...(envelope.applicationRunId
            ? { applicationRunId: envelope.applicationRunId }
            : prior?.applicationRunId
              ? { applicationRunId: prior.applicationRunId }
              : {}),
          coworkerId: envelope.coworkerId,
          sequence: envelope.channelSequence,
          status: outcome.status,
          lifecycle: outcome.lifecycle,
          ...(prior?.counters ? { counters: prior.counters } : {}),
          ...(outcome.message ? { message: outcome.message } : {}),
        },
      },
    };
  }

  if (
    (event.type === "TEXT_MESSAGE_START" ||
      event.type === "TEXT_MESSAGE_CONTENT" ||
      event.type === "TEXT_MESSAGE_END") &&
    envelope.coworkerId
  ) {
    const key = `${envelope.logicalThreadId ?? envelope.coworkerId}:${event.messageId}`;
    const prior = next.messages[key];
    const content =
      event.type === "TEXT_MESSAGE_CONTENT"
        ? `${prior?.content ?? ""}${event.delta}`
        : (prior?.content ?? "");
    const messages = { ...next.messages };
    const restPlaceholderKey = `seq:${envelope.channelSequence}`;
    if (messages[restPlaceholderKey]) {
      delete messages[restPlaceholderKey];
    }
    messages[key] = {
      key,
      messageId: event.messageId,
      sequence: prior?.sequence ?? envelope.channelSequence,
      kind: "coworker",
      authorId: envelope.coworkerId,
      content,
      status: event.type === "TEXT_MESSAGE_END" ? "complete" : "streaming",
    };
    return {
      ...next,
      messages,
    };
  }

  if (event.type === "MESSAGES_SNAPSHOT" && envelope.coworkerId) {
    const messages = { ...next.messages };
    const restPlaceholderKey = `seq:${envelope.channelSequence}`;
    if (messages[restPlaceholderKey]) {
      delete messages[restPlaceholderKey];
    }
    for (const [index, message] of event.messages.entries()) {
      const key = `${envelope.logicalThreadId ?? envelope.coworkerId}:${message.id}`;
      const prior = messages[key];
      messages[key] = {
        key,
        messageId: message.id,
        sequence: prior?.sequence ?? envelope.channelSequence + index,
        kind: "coworker",
        authorId: envelope.coworkerId,
        content: message.content,
        status: "complete",
      };
    }
    return {
      ...next,
      messages,
    };
  }

  if (event.type === "ACTIVITY_SNAPSHOT" || event.type === "ACTIVITY_DELTA") {
    const unsupported = isUnsupportedCapabilitySnapshot(event);
    if (unsupported) {
      const inertKey = `inert:${unsupported.messageId}`;
      return {
        ...next,
        inertActivities: {
          ...next.inertActivities,
          [inertKey]: {
            key: inertKey,
            sequence: envelope.channelSequence,
            messageId: unsupported.messageId,
            reason: "unsupported_capability",
            summary: unsupported.summary,
          },
        },
      };
    }

    const priorActivity = next.activityState.activities[event.messageId ?? ""];
    const nextActivityState = reduceActivityPresentationState(next.activityState, envelope);
    const nextActivity = nextActivityState.activities[event.messageId ?? ""];
    const messageId = typeof event.messageId === "string" ? event.messageId : undefined;
    if (!messageId) {
      return { ...next, activityState: nextActivityState };
    }

    const activityRefs = { ...next.activityRefs };
    const activitySequences = { ...next.activitySequences };
    const inertActivities = { ...next.inertActivities };
    delete inertActivities[`inert:${messageId}`];

    if (nextActivity) {
      activityRefs[`activity:${messageId}`] = {
        key: `activity:${messageId}`,
        sequence: activitySequences[messageId] ?? envelope.channelSequence,
        messageId,
        owner: nextActivity.owner,
      };
      if (!activitySequences[messageId]) {
        activitySequences[messageId] = envelope.channelSequence;
      }
    } else if (!priorActivity && event.type === "ACTIVITY_SNAPSHOT") {
      const inertKey = `inert:${messageId}`;
      inertActivities[inertKey] = {
        key: inertKey,
        sequence: envelope.channelSequence,
        messageId,
        reason: "unknown",
      };
    }

    return {
      ...next,
      activityState: nextActivityState,
      activityRefs,
      activitySequences,
      inertActivities,
    };
  }

  if (event.type === "CUSTOM" && event.name !== "message.created") {
    const parsedName = applicationSourceNameSchema.safeParse(event.name);
    if (!parsedName.success) {
      return next;
    }
    const customKey = `custom:${envelope.channelSequence}`;
    const lifecycle = event.payload.lifecycle;
    const activity = event.payload.activity;
    return {
      ...next,
      customEvents: {
        ...next.customEvents,
        [customKey]: {
          key: customKey,
          sequence: envelope.channelSequence,
          name: parsedName.data,
          ...(lifecycle ? { lifecycle } : {}),
          ...(activity ? { activity } : {}),
          actorKind: envelope.actorKind,
          ...(envelope.coworkerId ? { coworkerId: envelope.coworkerId } : {}),
        },
      },
      runs: applyRunProjection(next.runs, envelope, lifecycle, activity),
    };
  }

  return next;
}

export function orderedTimelineMessages(state: ChannelTimelineState): TimelineMessage[] {
  return Object.values(state.messages).sort(
    (left, right) => left.sequence - right.sequence || left.key.localeCompare(right.key),
  );
}

export type TimelineItem =
  | { kind: "message"; sequence: number; key: string; message: TimelineMessage }
  | { kind: "activity"; sequence: number; key: string; messageId: string }
  | { kind: "inert"; sequence: number; key: string; inert: TimelineInertActivity }
  | { kind: "custom"; sequence: number; key: string; custom: TimelineCustomEvent };

export function orderedTimelineItems(state: ChannelTimelineState): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const message of Object.values(state.messages)) {
    items.push({ kind: "message", sequence: message.sequence, key: message.key, message });
  }
  for (const ref of Object.values(state.activityRefs)) {
    if (state.activityState.activities[ref.messageId]) {
      items.push({
        kind: "activity",
        sequence: ref.sequence,
        key: ref.key,
        messageId: ref.messageId,
      });
    }
  }
  for (const inert of Object.values(state.inertActivities)) {
    items.push({ kind: "inert", sequence: inert.sequence, key: inert.key, inert });
  }
  for (const custom of Object.values(state.customEvents)) {
    items.push({ kind: "custom", sequence: custom.sequence, key: custom.key, custom });
  }
  return items.sort(
    (left, right) => left.sequence - right.sequence || left.key.localeCompare(right.key),
  );
}
