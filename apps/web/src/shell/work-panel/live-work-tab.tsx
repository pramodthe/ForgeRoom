import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ChannelRosterCoworker, RunLifecycle, TaskRecordV1 } from "@forgeroom/contracts";
import { listChannelTasks } from "../../api/workspace-api";
import { workspaceTaskDetailPath } from "../../routes/paths";
import { Avatar } from "../../ui/avatar";
import type { TimelineRun } from "../../ag-ui/channel-timeline-reducer";
import { useCancelChannelRun } from "../use-cancel-channel-run";
import { PoliteStatus } from "../polite-status";

const STATUS_STYLE: Record<TaskRecordV1["status"], string> = {
  todo: "bg-white/10 text-zinc-300",
  in_progress: "bg-sky-400/15 text-sky-300",
  blocked: "bg-amber-400/15 text-amber-300",
  in_review: "bg-violet-400/15 text-violet-300",
  done: "bg-emerald-400/15 text-emerald-300",
  cancelled: "bg-red-400/15 text-red-300",
};

export function LiveWorkTab(props: {
  workspaceId: string;
  channelId: string;
  roster: readonly ChannelRosterCoworker[];
  runs: Record<string, TimelineRun>;
  archived?: boolean;
  onOpenRun?: (runId: string) => void;
}) {
  const tasksQuery = useQuery({
    queryKey: ["channel-tasks", props.channelId],
    queryFn: () => listChannelTasks(props.channelId),
  });
  const cancelRunMutation = useCancelChannelRun(props.channelId);
  const activeRuns = Object.values(props.runs).filter(
    (run) => run.status === "running" || run.status === "needs_input",
  );
  const completedRuns = Object.values(props.runs)
    .filter((run) => run.status === "complete" && run.applicationRunId)
    .sort((left, right) => right.sequence - left.sequence)
    .slice(0, 3);
  const needsYou = activeRuns.filter((run) => run.status === "needs_input");

  if (tasksQuery.isLoading) {
    return <PanelMessage title="Loading work…" detail="Fetching channel tasks and active runs." />;
  }

  const tasks = tasksQuery.data ?? [];
  const openTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const cancelError =
    cancelRunMutation.error instanceof Error ? cancelRunMutation.error.message : null;

  return (
    <div className="space-y-3">
      <PoliteStatus
        message={
          cancelRunMutation.isSuccess
            ? "Stop requested. Remaining work is cancelling."
            : cancelError
        }
      />
      <div className="grid grid-cols-3 gap-2">
        <Counter value={String(activeRuns.length)} label="Running" tone="text-violet-300" />
        <Counter value={String(needsYou.length)} label="Needs you" tone="text-amber-300" />
        <Counter value={String(openTasks.length)} label="Open tasks" tone="text-zinc-200" />
      </div>

      {activeRuns.length === 0 && openTasks.length === 0 ? <WorkGuide /> : null}

      {activeRuns.length > 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-500">
          Open a run receipt to inspect audit details and linked artifacts.
        </p>
      ) : null}

      {activeRuns.map((run) => {
        const coworker = props.roster.find((entry) => entry.coworker_id === run.coworkerId);
        const canOpenReceipt = Boolean(run.applicationRunId && props.onOpenRun);
        const canStop = Boolean(
          !props.archived &&
          run.applicationRunId &&
          (run.status === "running" || run.status === "needs_input"),
        );
        const stopping =
          cancelRunMutation.isPending &&
          cancelRunMutation.variables?.runId === run.applicationRunId;
        return (
          <section
            key={run.runStepId}
            className="rounded-xl border border-white/10 bg-[#292929] p-3 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={coworker?.name ?? "Coworker"} tone="violet" size="sm" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-100">{coworker?.name ?? "Coworker"}</div>
                <div
                  className={`text-[11px] font-medium ${
                    run.status === "needs_input" ? "text-amber-300" : "text-emerald-300"
                  }`}
                >
                  {run.status === "needs_input" ? "Waiting for input" : "Running"}
                </div>
              </div>
              {canOpenReceipt ? (
                <button
                  type="button"
                  onClick={() => props.onOpenRun?.(run.applicationRunId!)}
                  className="rounded-lg border border-violet-400/30 px-2 py-1 text-[11px] font-medium text-violet-300 hover:bg-violet-400/10"
                >
                  Receipt
                </button>
              ) : null}
              {canStop ? (
                <button
                  type="button"
                  disabled={stopping}
                  aria-busy={stopping}
                  onClick={() =>
                    cancelRunMutation.mutate({
                      runId: run.applicationRunId!,
                      expectedLifecycle: (run.lifecycle ?? "active") as RunLifecycle,
                    })
                  }
                  className="rounded-lg border border-red-400/30 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                >
                  {stopping ? "Stopping…" : "Stop"}
                </button>
              ) : null}
            </div>
            {run.message ? (
              <p className="mt-2 text-xs leading-5 text-zinc-400">{run.message}</p>
            ) : null}
          </section>
        );
      })}

      {completedRuns.length > 0 ? (
        <section className="rounded-xl border border-white/10 bg-[#292929] p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Recent receipts
            </span>
            <span className="text-[11px] text-zinc-400">{completedRuns.length} complete</span>
          </div>
          <div className="mt-2 space-y-2">
            {completedRuns.map((run) => {
              const coworker = props.roster.find((entry) => entry.coworker_id === run.coworkerId);
              return (
                <button
                  key={run.runStepId}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-white/5 px-2.5 py-2 text-left hover:bg-white/5"
                  onClick={() => props.onOpenRun?.(run.applicationRunId!)}
                >
                  <span>
                    <span className="block text-xs font-medium text-zinc-200">
                      {coworker?.name ?? "Coworker"}
                    </span>
                    <span className="block text-[10px] text-zinc-500">
                      {run.message ?? "Work completed"}
                    </span>
                  </span>
                  <span className="text-[11px] font-medium text-violet-300">Open →</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-white/10 bg-[#292929] p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Channel tasks
          </span>
          <span className="text-[11px] text-zinc-400">{openTasks.length} open</span>
        </div>
        <div className="mt-3 space-y-2">
          {openTasks.length === 0 ? (
            <p className="text-xs text-zinc-500">No open tasks in this channel.</p>
          ) : (
            openTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-white/5 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-zinc-100">{task.title}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[task.status]}`}
                  >
                    {task.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Revision {task.current_revision}</span>
                  <Link
                    to={workspaceTaskDetailPath(props.workspaceId, task.id)}
                    className="font-medium text-violet-300"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Counter({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#292929] p-2 text-center shadow-sm">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function WorkGuide() {
  return (
    <section className="overflow-hidden rounded-xl border border-violet-400/20 bg-[#292929] shadow-sm">
      <div className="border-b border-violet-400/10 bg-violet-400/10 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <h3 className="text-xs font-semibold text-zinc-100">Ready for the first run</h3>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-zinc-400">
          Start from the composer. Active work, approvals, and tasks will collect here.
        </p>
      </div>
      <ol className="space-y-0 px-3 py-2 text-[11px]">
        <GuideStep number="1" title="Ask for an outcome" detail="Use a workflow starter" active />
        <GuideStep number="2" title="Inspect the work" detail="Runs and tools stay visible" />
        <GuideStep number="3" title="Approve changes" detail="Sensitive writes wait for you" />
      </ol>
    </section>
  );
}

function GuideStep({
  number,
  title,
  detail,
  active = false,
}: {
  number: string;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 border-b border-white/5 py-2.5 last:border-0">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
          active ? "bg-violet-500 text-white" : "bg-white/10 text-zinc-500"
        }`}
      >
        {number}
      </span>
      <div className="min-w-0">
        <div className="font-medium text-zinc-200">{title}</div>
        <div className="text-zinc-500">{detail}</div>
      </div>
    </li>
  );
}

function PanelMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center">
      <p className="font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
