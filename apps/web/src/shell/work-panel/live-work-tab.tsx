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
  todo: "bg-zinc-100 text-zinc-700",
  in_progress: "bg-sky-50 text-sky-700",
  blocked: "bg-amber-50 text-amber-700",
  in_review: "bg-violet-50 text-violet-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
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
        <Counter value={String(activeRuns.length)} label="Running" tone="text-violet-700" />
        <Counter value={String(needsYou.length)} label="Needs you" tone="text-amber-700" />
        <Counter value={String(openTasks.length)} label="Open tasks" tone="text-zinc-700" />
      </div>

      {activeRuns.length === 0 && openTasks.length === 0 ? <WorkGuide /> : null}

      {activeRuns.length > 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
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
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={coworker?.name ?? "Coworker"} tone="violet" size="sm" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-900">{coworker?.name ?? "Coworker"}</div>
                <div
                  className={`text-[11px] font-medium ${
                    run.status === "needs_input" ? "text-amber-700" : "text-emerald-700"
                  }`}
                >
                  {run.status === "needs_input" ? "Waiting for input" : "Running"}
                </div>
              </div>
              {canOpenReceipt ? (
                <button
                  type="button"
                  onClick={() => props.onOpenRun?.(run.applicationRunId!)}
                  className="rounded-lg border border-violet-200 px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
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
                  className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {stopping ? "Stopping…" : "Stop"}
                </button>
              ) : null}
            </div>
            {run.message ? (
              <p className="mt-2 text-xs leading-5 text-zinc-600">{run.message}</p>
            ) : null}
          </section>
        );
      })}

      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
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
              <div key={task.id} className="rounded-lg border border-zinc-100 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-zinc-900">{task.title}</h3>
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
                    className="font-medium text-violet-700"
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
    <div className="rounded-xl border border-zinc-200 bg-white p-2 text-center shadow-sm">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function WorkGuide() {
  return (
    <section className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-violet-50/70 px-3 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <h3 className="text-xs font-semibold text-zinc-900">Ready for the first run</h3>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-zinc-600">
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
    <li className="flex items-center gap-2.5 border-b border-zinc-100 py-2.5 last:border-0">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
          active ? "bg-violet-600 text-white" : "bg-zinc-100 text-zinc-500"
        }`}
      >
        {number}
      </span>
      <div className="min-w-0">
        <div className="font-medium text-zinc-800">{title}</div>
        <div className="text-zinc-500">{detail}</div>
      </div>
    </li>
  );
}

function PanelMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
      <p className="font-medium text-zinc-800">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
