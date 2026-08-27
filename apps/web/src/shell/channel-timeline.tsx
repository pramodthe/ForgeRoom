import { Fragment, useEffect, useRef } from "react";
import type { ChannelRosterCoworker } from "@forgeroom/contracts";
import { ControlledComponentSlot } from "@forgeroom/ui-components";
import type { TimelineConnection } from "../ag-ui/use-channel-timeline";
import type { TimelineMessage, TimelineRun } from "../ag-ui/channel-timeline-reducer";
import { isFixtureMode } from "../api/mode";
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

export function ChannelTimeline(props: {
  channelId: string;
  messages: TimelineMessage[];
  runs: Record<string, TimelineRun>;
  roster: readonly ChannelRosterCoworker[];
  connection: TimelineConnection;
  archived: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const coworkerById = new Map(props.roster.map((coworker) => [coworker.coworker_id, coworker]));
  const activeRuns = Object.values(props.runs).filter((run) => run.status !== "complete");
  const connectionLabel = CONNECTION_LABEL[props.connection];
  const connectionLive = props.connection === "live";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [props.messages, props.runs]);

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
                    : "animate-pulse bg-amber-500"
              }`}
            />
            {!connectionLive ? (
              <span className="font-medium">{connectionLabel}</span>
            ) : (
              connectionLabel
            )}
          </span>
        </div>

        {props.messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center">
            <p className="font-medium text-zinc-900">Start the room</p>
            <p className="mt-1 text-sm text-zinc-500">
              Message a coworker or use @team. Their streamed work will appear here.
            </p>
          </div>
        ) : (
          props.messages.map((message) => {
            const coworker =
              message.kind === "coworker" ? coworkerById.get(message.authorId) : undefined;
            const richResponse =
              isFixtureMode &&
              props.channelId === "ch_general_001" &&
              message.authorId === "cw_analyst_002" ? (
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
              ) : isFixtureMode &&
                props.channelId === "ch_general_001" &&
                message.authorId === "cw_operator_001" ? (
                <ControlledComponentSlot slotId="ui_operations_plan_rev_2">
                  <OperationsPlanCards />
                </ControlledComponentSlot>
              ) : isFixtureMode &&
                props.channelId === "ch_ops_002" &&
                message.authorId === "cw_operator_001" ? (
                <ControlledComponentSlot slotId="ui_connection_recovery_rev_1">
                  <ConnectionRecoveryCards />
                </ControlledComponentSlot>
              ) : null;
            return (
              <Fragment key={message.key}>
                <article
                  className={`flex ${message.kind === "human" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex max-w-[88%] items-start gap-2.5 ${message.kind === "human" ? "flex-row-reverse" : ""}`}
                  >
                    <Avatar
                      name={message.kind === "human" ? "Pramod" : (coworker?.name ?? "Coworker")}
                      tone={
                        message.kind === "human"
                          ? "zinc"
                          : coworker?.handle === "analyst"
                            ? "violet"
                            : "blue"
                      }
                      size="sm"
                    />
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                        message.kind === "human"
                          ? "rounded-br-md bg-zinc-900 text-white"
                          : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900"
                      }`}
                    >
                      <div
                        className={`mb-1 text-xs font-medium ${message.kind === "human" ? "text-zinc-300" : "text-zinc-500"}`}
                      >
                        {message.kind === "human" ? "You" : (coworker?.name ?? "Coworker")}
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {message.content || (message.status === "streaming" ? "Working…" : "")}
                      </p>
                      {message.status === "streaming" ? (
                        <span className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                          streaming
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
                {richResponse ? <div className="ml-9">{richResponse}</div> : null}
              </Fragment>
            );
          })
        )}

        {activeRuns.map((run) => {
          const coworker = coworkerById.get(run.coworkerId);
          return (
            <div
              key={run.runStepId}
              className={`rounded-lg border px-3 py-2 text-sm ${
                run.status === "failed"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : run.status === "needs_input"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-violet-200 bg-violet-50 text-violet-900"
              }`}
            >
              <span className="font-medium">{coworker?.name ?? "Coworker"}</span>{" "}
              {run.status === "running" ? "is working…" : run.message}
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
