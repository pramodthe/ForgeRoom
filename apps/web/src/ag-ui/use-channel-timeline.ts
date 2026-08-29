import { agentChannelEnvelopeSchema, type ChannelTimelineMessage } from "@forgeroom/contracts";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { apiUrl } from "../api/http-client";
import { isFixtureMode } from "../api/mode";
import {
  channelTimelineReducer,
  initialChannelTimelineState,
  orderedTimelineItems,
  orderedTimelineMessages,
} from "./channel-timeline-reducer";

export type TimelineConnection = "connecting" | "live" | "reconnecting" | "offline";

const RECONNECT_DELAY_MS = 1_500;

export function useChannelTimeline(input: {
  channelId: string;
  initialMessages: ChannelTimelineMessage[];
  onMessageCreated: () => void;
}) {
  const [state, dispatch] = useReducer(
    channelTimelineReducer,
    input.channelId,
    initialChannelTimelineState,
  );
  const [connection, setConnection] = useState<TimelineConnection>("connecting");
  const lastSeenSequenceRef = useRef(-1);
  const onMessageCreatedRef = useRef(input.onMessageCreated);
  onMessageCreatedRef.current = input.onMessageCreated;

  useEffect(() => {
    dispatch({ type: "reset", channelId: input.channelId });
    lastSeenSequenceRef.current = -1;
  }, [input.channelId]);

  useEffect(() => {
    dispatch({ type: "merge_messages", messages: input.initialMessages });
  }, [input.initialMessages]);

  useEffect(() => {
    if (isFixtureMode) {
      setConnection("live");
      return;
    }
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;
    let resumedFromGap = false;

    const connect = (afterSequence: number) => {
      source?.close();
      setConnection("connecting");
      resumedFromGap = afterSequence >= 0;

      source = new EventSource(
        apiUrl(
          `/api/channels/${encodeURIComponent(input.channelId)}/stream?afterSequence=${afterSequence}`,
        ),
        { withCredentials: true },
      );

      source.onopen = () => {
        setConnection("live");
        if (resumedFromGap) {
          onMessageCreatedRef.current();
        }
      };

      source.onerror = () => {
        if (cancelled || !source) return;
        setConnection(source.readyState === EventSource.CLOSED ? "offline" : "reconnecting");
        source.close();
        scheduleReconnect();
      };

      source.addEventListener("channel_event", (message) => {
        let raw: unknown;
        try {
          raw = JSON.parse((message as MessageEvent<string>).data);
        } catch {
          return;
        }
        const parsed = agentChannelEnvelopeSchema.safeParse(raw);
        if (!parsed.success) return;

        if (parsed.data.channelSequence > lastSeenSequenceRef.current) {
          lastSeenSequenceRef.current = parsed.data.channelSequence;
        }

        dispatch({ type: "event", envelope: parsed.data });
        if (
          parsed.data.aguiEvent.type === "CUSTOM" &&
          parsed.data.aguiEvent.name === "message.created"
        ) {
          onMessageCreatedRef.current();
        }
      });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectTimer = window.setTimeout(() => {
        const lastSeen = lastSeenSequenceRef.current;
        connect(lastSeen >= 0 ? lastSeen : -1);
      }, RECONNECT_DELAY_MS);
    };

    connect(-1);

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      source?.close();
    };
  }, [input.channelId]);

  const mergeMessages = useCallback((messages: ChannelTimelineMessage[]) => {
    dispatch({ type: "merge_messages", messages });
  }, []);

  return {
    connection,
    messages: useMemo(() => orderedTimelineMessages(state), [state]),
    items: useMemo(() => orderedTimelineItems(state), [state]),
    runs: state.runs,
    activityState: state.activityState,
    uiState: state.uiState,
    mergeMessages,
  };
}
