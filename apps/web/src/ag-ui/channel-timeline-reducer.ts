import type { AgentChannelEnvelope, ChannelTimelineMessage } from "@forgeroom/contracts";

export type TimelineMessage = {
  key: string;
  sequence: number;
  kind: "human" | "coworker";
  authorId: string;
  content: string;
  status: "sent" | "streaming" | "complete" | "failed";
};

export type TimelineRun = {
  runStepId: string;
  coworkerId: string;
  sequence: number;
  status: "running" | "complete" | "needs_input" | "failed";
  message?: string;
};

export type ChannelTimelineState = {
  channelId: string;
  messages: Record<string, TimelineMessage>;
  runs: Record<string, TimelineRun>;
  seenSequences: Record<string, true>;
};

export type ChannelTimelineAction =
  | { type: "reset"; channelId: string }
  | { type: "merge_messages"; messages: ChannelTimelineMessage[] }
  | { type: "event"; envelope: AgentChannelEnvelope };

export function initialChannelTimelineState(channelId: string): ChannelTimelineState {
  return { channelId, messages: {}, runs: {}, seenSequences: {} };
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

  const seenSequences = {
    ...state.seenSequences,
    [String(envelope.channelSequence)]: true as const,
  };
  const event = envelope.aguiEvent;
  const runStepId = envelope.runStepId;

  if (event.type === "RUN_STARTED" && runStepId && envelope.coworkerId) {
    return {
      ...state,
      seenSequences,
      runs: {
        ...state.runs,
        [runStepId]: {
          runStepId,
          coworkerId: envelope.coworkerId,
          sequence: envelope.channelSequence,
          status: "running",
        },
      },
    };
  }

  if (
    (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") &&
    runStepId &&
    envelope.coworkerId
  ) {
    const interrupted = event.type === "RUN_FINISHED" && event.outcome.type === "interrupt";
    const statusMessage =
      event.type === "RUN_ERROR"
        ? event.message
        : event.outcome.type === "interrupt"
          ? (event.outcome.interrupts[0]?.message ?? "Human input is required.")
          : undefined;
    return {
      ...state,
      seenSequences,
      runs: {
        ...state.runs,
        [runStepId]: {
          runStepId,
          coworkerId: envelope.coworkerId,
          sequence: state.runs[runStepId]?.sequence ?? envelope.channelSequence,
          status: event.type === "RUN_ERROR" ? "failed" : interrupted ? "needs_input" : "complete",
          ...(statusMessage ? { message: statusMessage } : {}),
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
    const prior = state.messages[key];
    const content =
      event.type === "TEXT_MESSAGE_CONTENT"
        ? `${prior?.content ?? ""}${event.delta}`
        : (prior?.content ?? "");
    const messages = { ...state.messages };
    const restPlaceholderKey = `seq:${envelope.channelSequence}`;
    if (messages[restPlaceholderKey]) {
      delete messages[restPlaceholderKey];
    }
    messages[key] = {
      key,
      sequence: prior?.sequence ?? envelope.channelSequence,
      kind: "coworker",
      authorId: envelope.coworkerId,
      content,
      status: event.type === "TEXT_MESSAGE_END" ? "complete" : "streaming",
    };
    return {
      ...state,
      seenSequences,
      messages,
    };
  }

  return { ...state, seenSequences };
}

export function orderedTimelineMessages(state: ChannelTimelineState): TimelineMessage[] {
  return Object.values(state.messages).sort(
    (left, right) => left.sequence - right.sequence || left.key.localeCompare(right.key),
  );
}
