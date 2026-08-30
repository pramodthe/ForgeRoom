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
import { ControlledUiPrimaryChrome } from "./controlled-ui-primary-response";
import type {
  ActivityPresentationState,
  ToolCallPresentationState,
} from "@forgeroom/ag-ui/browser";
import type { TimelineConnection } from "../ag-ui/use-channel-timeline";
import type { TimelineItem, TimelineMessage, TimelineRun } from "../ag-ui/channel-timeline-reducer";
import { resolveActivityEntry, resolveToolCallEntry } from "../ag-ui/channel-timeline-reducer";
import { resolveBackendToolRenderer } from "../ag-ui/renderer-registry";
import { isFixtureMode } from "../api/mode";
import { PinSourceButton } from "./pin-source-button";
import { pinLabelFromMessageBody } from "./pin-source-label";
import { PoliteStatus } from "./polite-status";
import { isNearBottom, timelineLiveAnnouncement } from "./timeline-scroll";
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
        className="group flex justify-start"
      >
        <div className="flex w-full max-w-[760px] items-start gap-3">
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
          <div className="min-w-0 max-w-[680px] flex-1 pt-0.5 text-zinc-200">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-zinc-200">
              {props.message.kind === "human" ? humanLabel : (coworker?.name ?? "Coworker")}
              <span className="text-[10px] font-normal text-zinc-600">
                {props.message.kind === "human" ? "workspace member" : "AI coworker"}
              </span>
            </div>
            <p className="min-h-[1.25rem] whitespace-pre-wrap text-[13px] leading-6 text-zinc-300">
              {props.message.content || (props.message.status === "streaming" ? "Working…" : "")}
            </p>
            {props.message.messageId && props.message.status !== "streaming" ? (
              <div className="mt-1 flex justify-start opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
      {props.richResponse ? <div className="ml-11 max-w-[720px]">{props.richResponse}</div> : null}
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

function RoomWelcomeCard({ coworkerCount }: { coworkerCount: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#292929] shadow-xl">
      <div className="bg-gradient-to-br from-violet-500/10 via-[#292929] to-sky-500/5 px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Your room is ready
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-100">
              Give your AI team a real outcome
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-5 text-zinc-400">
              Choose a workflow starter below or mention a coworker. Work, tools, and approvals stay
              visible in this timeline.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            {coworkerCount} {coworkerCount === 1 ? "coworker" : "coworkers"} available
          </span>
        </div>
        <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="How ForgeRoom works">
          {[
            ["1", "Ask", "Describe the outcome"],
            ["2", "Watch", "Inspect work and tools"],
            ["3", "Approve", "Control sensitive changes"],
          ].map(([step, title, detail]) => (
            <li key={step} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-violet-500 text-[10px] font-semibold text-white">
                  {step}
                </span>
                <span className="text-xs font-semibold text-zinc-200">{title}</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-4 text-zinc-500">{detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const savedScrollTopRef = useRef(0);
  const coworkerById = new Map(props.roster.map((coworker) => [coworker.coworker_id, coworker]));
  const visibleRunCards = Object.values(props.runs);
  const activeRuns = visibleRunCards.filter(
    (run) => run.status === "running" || run.status === "needs_input",
  );
  const needsInputCount = visibleRunCards.filter((run) => run.status === "needs_input").length;
  const connectionLabel = CONNECTION_LABEL[props.connection];
  const connectionLive = props.connection === "live";
  const hasConversation = props.items.some((item) => item.kind === "message");
  const availableCoworkerCount = props.roster.filter(
    (coworker) => coworker.availability === "available",
  ).length;
  const liveAnnouncement = timelineLiveAnnouncement({
    connection: props.connection,
    activeRunCount: activeRuns.length,
    needsInputCount,
  });

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    node.scrollTop = savedScrollTopRef.current;
  }, [props.items, props.runs, props.connection]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto bg-[#222222] px-5 py-5"
      onScroll={(event) => {
        const node = event.currentTarget;
        stickToBottomRef.current = isNearBottom(node);
        savedScrollTopRef.current = node.scrollTop;
      }}
    >
      <div className="mx-auto max-w-[800px] space-y-5">
        <div className="flex items-center justify-between gap-3 text-[10px] text-zinc-600">
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

        {!hasConversation && !props.archived ? (
          <RoomWelcomeCard coworkerCount={availableCoworkerCount} />
        ) : null}

        {props.items.map((item) => {
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
            if (entry.content.activityType === "forgeroom.controlled_ui.v1") {
              return (
                <ControlledUiPrimaryChrome
                  key={item.key}
                  content={entry.content}
                  roster={props.roster}
                  ownerCoworkerId={entry.owner.coworkerId}
                >
                  <AgUiActivitySlot slotId={item.messageId}>
                    <ControlledUiActivity content={entry.content} />
                  </AgUiActivitySlot>
                </ControlledUiPrimaryChrome>
              );
            }
            return (
              <div key={item.key} className="ml-9">
                <AgUiActivitySlot slotId={item.messageId}>
                  <ForgeRoomActivityCard content={entry.content} ownerLabel={ownerLabel} />
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
            const resolved = resolveBackendToolRenderer({
              toolName: entry.toolName,
              status: entry.status,
            });
            return (
              <div key={item.key} className="ml-9">
                <AgUiActivitySlot slotId={item.toolCallId}>
                  <ToolCallActivityCard
                    toolName={entry.toolName}
                    status={entry.status}
                    ownerLabel={ownerLabel}
                    presentation={resolved.presentation}
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

          if (
            item.kind === "custom" &&
            ["channel.created", "channel created"].includes(item.custom.name.toLowerCase())
          ) {
            return (
              <div
                key={item.key}
                className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-[#292929] px-3 py-1.5 text-[11px] text-zinc-500"
                role="status"
              >
                <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-700">
                  ✓
                </span>
                Room created · Ready for coworker work
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
        })}

        {visibleRunCards.map((run) => {
          const coworker = coworkerById.get(run.coworkerId);
          const canOpenReceipt = Boolean(run.applicationRunId && props.onOpenRun);
          return (
            <div
              key={run.runStepId}
              className={`rounded-lg border px-3 py-2 text-sm ${
                run.status === "failed"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : run.status === "complete"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
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
                    : run.status === "complete"
                      ? (run.message ?? "completed the work.")
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
                      data-run-id={run.applicationRunId}
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

        <PoliteStatus id="channel-timeline-live" message={liveAnnouncement} />
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </div>
  );
}
