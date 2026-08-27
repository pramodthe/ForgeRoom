import type { AgentChannelEnvelope, P0PersistedAguiEvent } from "@forgeroom/contracts";
import { persistedMessagesSnapshotEventSchema } from "@forgeroom/contracts";

/**
 * Fold each completed TEXT_MESSAGE_* triple into a coworker-lane MESSAGES_SNAPSHOT.
 * Incomplete streams and non-text events are preserved. Compaction keeps the first
 * channelSequence of each message so full and compacted replay share message order.
 */
export function compactChannelEnvelopes(envelopes: AgentChannelEnvelope[]): AgentChannelEnvelope[] {
  const output: AgentChannelEnvelope[] = [];
  const open = new Map<
    string,
    {
      messageId: string;
      name?: string;
      content: string;
      started: boolean;
      first: AgentChannelEnvelope;
      events: AgentChannelEnvelope[];
    }
  >();

  const flushIncomplete = (streamKey: string) => {
    const stream = open.get(streamKey);
    if (!stream) return;
    output.push(...stream.events);
    open.delete(streamKey);
  };

  for (const envelope of envelopes) {
    const event = envelope.aguiEvent;
    const isText =
      event.type === "TEXT_MESSAGE_START" ||
      event.type === "TEXT_MESSAGE_CONTENT" ||
      event.type === "TEXT_MESSAGE_END";

    if (
      !isText ||
      envelope.actorKind !== "coworker" ||
      !envelope.coworkerId ||
      !envelope.logicalThreadId
    ) {
      for (const key of [...open.keys()]) flushIncomplete(key);
      output.push(envelope);
      continue;
    }

    const streamKey = `${envelope.channelId}:${envelope.coworkerId}:${envelope.logicalThreadId}:${event.messageId}`;
    const stream = open.get(streamKey) ?? {
      messageId: event.messageId,
      content: "",
      started: false,
      first: envelope,
      events: [],
    };
    stream.events.push(envelope);

    if (event.type === "TEXT_MESSAGE_START") {
      stream.started = true;
      if (event.name) stream.name = event.name;
      open.set(streamKey, stream);
      continue;
    }

    if (event.type === "TEXT_MESSAGE_CONTENT") {
      stream.content += event.delta;
      open.set(streamKey, stream);
      continue;
    }

    // TEXT_MESSAGE_END
    if (!stream.started || stream.content.length === 0) {
      flushIncomplete(streamKey);
      continue;
    }

    const snapshot = persistedMessagesSnapshotEventSchema.parse({
      type: "MESSAGES_SNAPSHOT",
      messages: [
        {
          id: stream.messageId,
          role: "assistant",
          content: stream.content,
          ...(stream.name ? { name: stream.name } : {}),
        },
      ],
    });
    output.push({
      ...stream.first,
      aguiEvent: snapshot,
    });
    open.delete(streamKey);
  }

  for (const key of [...open.keys()]) flushIncomplete(key);
  return output;
}

export function isMessagesSnapshotEvent(
  event: P0PersistedAguiEvent,
): event is Extract<P0PersistedAguiEvent, { type: "MESSAGES_SNAPSHOT" }> {
  return event.type === "MESSAGES_SNAPSHOT";
}
