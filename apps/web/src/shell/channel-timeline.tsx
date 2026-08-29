import { Fragment, useEffect, useRef, type ReactNode } from "react";
import type { ChannelRosterCoworker } from "@forgeroom/contracts";
import {
  AgUiActivitySlot,
  ControlledComponentSlot,
  CustomEventActivityCard,
  ForgeRoomActivityCard,
  InertUnsupportedActivityCard,
  InertUnknownActivityCard,
  RunCountersFooter,
  ToolCallActivityCard,
} from "@forgeroom/ui-components";
import { ControlledUiActivity } from "./controlled-ui-activity";
import type {
  ActivityPresentationState,
  ToolCallPresentationState,
} from "@forgeroom/ag-ui/browser";
import type { TimelineConnection } from "../ag-ui/use-channel-timeline";
import type { TimelineItem, TimelineMessage, TimelineRun } from "../ag-ui/channel-timeline-reducer";
import { resolveActivityEntry, resolveToolCallEntry } from "../ag-ui/channel-timeline-reducer";
import { isFixtureMode } from "../api/mode";
import { PinSourceButton } from "./pin-source-button";
import { pinLabelFromMessageBody } from "./pin-source-label";
import { Avatar } from "../ui/avatar";
import {
  ConnectionRecoveryCards,
  OperationsPlanCards,
  SupportBriefArtifactCard,
  SupportEvidenceTable,
  SupportInsightsCard,
} from "./demo-rich-response";

const CONNECTION_LABEL: Record<TimelineConnection, string> = {
  live: "Live",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

function ownerLabelForItem(
  item: TimelineItem,
  roster: readonly ChannelRosterCoworker[],
  currentHumanName: string,
  threadActivityStates: Record<string, ActivityPresentationState>,
  threadToolCallStates: Record<string, ToolCallPresentationState>,
): string | undefined {
  if (item.kind === "message") {
    if (item.message.kind === "human") return currentHumanName;
    return roster.find((coworker) => coworker.coworker_id === item.message.authorId)?.name;
  }
  if (item.kind === "custom" && item.custom.coworkerId) {
    return roster.find((coworker) => coworker.coworker_id === item.custom.coworkerId)?.name;
  }
  if (item.kind === "activity") {
    const entry = resolveActivityEntry(threadActivityStates, item.messageId);
    if (entry?.owner.coworkerId) {
      return roster.find((coworker) => coworker.coworker_id === entry.owner.coworkerId)?.name;
    }
  }
  if (item.kind === "tool") {
    const entry = resolveToolCallEntry(threadToolCallStates, item.toolCallId);
    if (entry?.owner.coworkerId) {
      return roster.find((coworker) => coworker.coworker_id === entry.owner.coworkerId)?.name;
    }
  }
  return undefined;
}

function MessageBubble(props: {
  message: TimelineMessage;
  roster: readonly ChannelRosterCoworker[];
  currentHumanId: string | null;
  currentHumanName: string;
  richResponse: ReactNode;
  channelId: string;
  archived: boolean;
}) {
  const coworker =
    props.message.kind === "coworker"
      ? props.roster.find((entry) => entry.coworker_id === props.message.authorId)
      : undefined;
  const isCurrentHuman =
    props.message.kind === "human" && props.message.authorId === props.currentHumanId;
  const humanLabel = isCurrentHuman ? "You" : "Workspace member";
  const humanName = isCurrentHuman ? props.currentHumanName : "Workspace member";

  return (
    <Fragment>
      <article
        id={props.message.messageId ? `timeline-message-${props.message.messageId}` : undefined}
        className={`flex ${props.message.kind === "human" ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`flex max-w-[88%] items-start gap-2.5 ${props.message.kind === "human" ? "flex-row-reverse" : ""}`}
        >
          <Avatar
            name={props.message.kind === "human" ? humanName : (coworker?.name ?? "Coworker")}
            tone={
              props.message.kind === "human"
                ? "zinc"
                : coworker?.handle === "analyst"
                  ? "violet"
                  : "blue"
            }
            size="sm"
          />
          <div
            className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
              props.message.kind === "human"
                ? "rounded-br-md bg-zinc-900 text-white"
                : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900"
            }`}
          >
            <div
              className={`mb-1 text-xs font-medium ${props.message.kind === "human" ? "text-zinc-300" : "text-zinc-500"}`}
            >
              {props.message.kind === "human" ? humanLabel : (coworker?.name ?? "Coworker")}
            </div>
            <p className="min-h-[1.25rem] whitespace-pre-wrap text-sm leading-6">
              {props.message.content || (props.message.status === "streaming" ? "Working…" : "")}
            </p>
            {props.message.messageId && props.message.status !== "streaming" ? (
              <div className="mt-2 flex justify-end">
                <PinSourceButton
                  channelId={props.channelId}
                  archived={props.archived}
                  compact
                  target={{
                    kind: "message",
                    messageId: props.message.messageId,
                    label: pinLabelFromMessageBody(props.message.content),
                  }}
                />
              </div>
            ) : null}
            {props.message.status === "streaming" ? (
              <span className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                <span className="h-1.5 w-1.5 motion-safe:animate-pulse rounded-full bg-violet-500" />
                streaming
              </span>
            ) : null}
          </div>
        </div>
      </article>
      {props.richResponse ? <div className="ml-9">{props.richResponse}</div> : null}
    </Fragment>
  );
}

function fixtureRichResponse(input: {
  workspaceId: string;
  channelId: string;
  message: TimelineMessage;
}) {
  if (!isFixtureMode) return null;
  if (input.channelId === "ch_general_001" && input.message.authorId === "cw_analyst_002") {
    return (
      <div className="space-y-3">
        <ControlledComponentSlot slotId="ui_support_insights_rev_3">
          <SupportInsightsCard />
        </ControlledComponentSlot>
        <ControlledComponentSlot slotId="ui_support_evidence_rev_3">
          <SupportEvidenceTable />
        </ControlledComponentSlot>
        <ControlledComponentSlot slotId="ui_support_brief_rev_2">
          <SupportBriefArtifactCard />
        </ControlledComponentSlot>
      </div>
    );
  }
  if (input.channelId === "ch_general_001" && input.message.authorId === "cw_operator_001") {
    return (
      <ControlledComponentSlot slotId="ui_operations_plan_rev_2">
        <OperationsPlanCards workspaceId={input.workspaceId} />
      </ControlledComponentSlot>
    );
  }
  if (input.channelId === "ch_ops_002" && input.message.authorId === "cw_operator_001") {
    return (
      <ControlledComponentSlot slotId="ui_connection_recovery_rev_1">
        <ConnectionRecoveryCards workspaceId={input.workspaceId} />
      </ControlledComponentSlot>
    );
  }
  return null;
}

export function ChannelTimeline(props: {
  workspaceId: string;
  channelId: string;
  items: TimelineItem[];
  runs: Record<string, TimelineRun>;
  threadActivityStates: Record<string, ActivityPresentationState>;
  threadToolCallStates: Record<string, ToolCallPresentationState>;
  roster: readonly ChannelRosterCoworker[];
  connection: TimelineConnection;
  archived: boolean;
  currentHumanId: string | null;
  currentHumanName: string;
  onOpenRun?: (runId: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const coworkerById = new Map(props.roster.map((coworker) => [coworker.coworker_id, coworker]));
  const visibleRunCards = Object.values(props.runs).filter((run) => run.status !== "complete");
  const activeRuns = visibleRunCards.filter(
    (run) => run.status === "running" || run.status === "needs_input",
  );
  const connectionLabel = CONNECTION_LABEL[props.connection];
  const connectionLive = props.connection === "live";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [props.items, props.runs]);

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50/60 px-4 py-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>{props.archived ? "Archived channel" : "Shared channel timeline"}</span>
          <span
            className={`inline-flex items-center gap-1.5 ${connectionLive ? "text-zinc-500" : "text-amber-700"}`}
            aria-label={`Timeline ${props.connection}`}
            role="status"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                connectionLive
                  ? "bg-emerald-500"
                  : props.connection === "offline"
                    ? "bg-red-500"
                    : "motion-safe:animate-pulse bg-amber-500"
              }`}
            />
            {!connectionLive ? (
              <span className="font-medium">{connectionLabel}</span>
            ) : (
              connectionLabel
            )}
          </span>
        </div>

        {props.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="font-medium text-zinc-900">Start the room</p>
            <p className="mt-1 text-sm text-zinc-500">
              Message a coworker or use @team. Their streamed work will appear here.
            </p>
          </div>
        ) : (
          props.items.map((item) => {
            if (item.kind === "message") {
              return (
                <MessageBubble
                  key={item.key}
                  message={item.message}
                  roster={props.roster}
                  currentHumanId={props.currentHumanId}
                  currentHumanName={props.currentHumanName}
                  channelId={props.channelId}
                  archived={props.archived}
                  richResponse={fixtureRichResponse({
                    workspaceId: props.workspaceId,
                    channelId: props.channelId,
                    message: item.message,
                  })}
                />
              );
            }

            if (item.kind === "activity") {
              const entry = resolveActivityEntry(props.threadActivityStates, item.messageId);
              if (!entry) return null;
              const ownerLabel =
                entry.owner.coworkerId !== undefined
                  ? coworkerById.get(entry.owner.coworkerId)?.name
                  : entry.owner.actorKind === "system"
                    ? "System"
                    : undefined;
              return (
                <div key={item.key} className="ml-9">
                  <AgUiActivitySlot slotId={item.messageId}>
                    {entry.content.activityType === "forgeroom.controlled_ui.v1" ? (
                      <ControlledUiActivity content={entry.content} />
                    ) : (
                      <ForgeRoomActivityCard content={entry.content} ownerLabel={ownerLabel} />
                    )}
                  </AgUiActivitySlot>
                </div>
              );
            }

            if (item.kind === "tool") {
              const entry = resolveToolCallEntry(props.threadToolCallStates, item.toolCallId);
              if (!entry) return null;
              const ownerLabel =
                entry.owner.coworkerId !== undefined
                  ? coworkerById.get(entry.owner.coworkerId)?.name
                  : undefined;
              return (
                <div key={item.key} className="ml-9">
                  <AgUiActivitySlot slotId={item.toolCallId}>
                    <ToolCallActivityCard
                      toolName={entry.toolName}
                      status={entry.status}
                      ownerLabel={ownerLabel}
                    />
                  </AgUiActivitySlot>
                </div>
              );
            }

            if (item.kind === "inert") {
              return (
                <div key={item.key} className="ml-9">
                  <AgUiActivitySlot slotId={item.inert.messageId}>
                    {item.inert.reason === "unsupported_capability" ? (
                      <InertUnsupportedActivityCard summary={item.inert.summary} />
                    ) : (
                      <InertUnknownActivityCard />
                    )}
                  </AgUiActivitySlot>
                </div>
              );
            }

            const ownerLabel = ownerLabelForItem(
              item,
              props.roster,
              props.currentHumanName,
              props.threadActivityStates,
              props.threadToolCallStates,
            );
            return (
              <div key={item.key} className="ml-9">
                <CustomEventActivityCard
                  name={item.custom.name}
                  lifecycle={item.custom.lifecycle}
                  activity={item.custom.activity}
                  ownerLabel={ownerLabel}
                />
              </div>
            );
          })
        )}

        {visibleRunCards.map((run) => {
          const coworker = coworkerById.get(run.coworkerId);
          const canOpenReceipt = Boolean(run.applicationRunId && props.onOpenRun);
          return (
            <div
              key={run.runStepId}
              className={`rounded-lg border px-3 py-2 text-sm ${
                run.status === "failed"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : run.status === "needs_input" || run.status === "partial"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-violet-200 bg-violet-50 text-violet-900"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{coworker?.name ?? "Coworker"}</span>{" "}
                  {run.status === "running"
                    ? "is working…"
                    : run.status === "partial"
                      ? (run.message ?? "completed partially.")
                      : run.message}
                </div>
                <div className="flex items-center gap-2">
                  {run.lifecycle ? (
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                      {run.lifecycle}
                    </span>
                  ) : null}
                  {canOpenReceipt ? (
                    <button
                      type="button"
                      onClick={() => props.onOpenRun?.(run.applicationRunId!)}
                      className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-violet-800 ring-1 ring-violet-200 hover:bg-white"
                    >
                      Receipt
                    </button>
                  ) : null}
                </div>
              </div>
              {run.counters ? (
                <div className="mt-2">
                  <RunCountersFooter counters={run.counters} />
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="sr-only" aria-live="polite">
          {activeRuns.map((run) => `${run.coworkerId} ${run.status}`).join(", ")}
        </div>
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  );
}
