import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import type { TaskRecordV1 } from "@forgeroom/contracts";
import { useState, type ReactNode } from "react";
import { getTask, listTasks } from "../api/workspace-api";
import { workspaceTaskDetailPath, workspaceTasksPath } from "../routes/paths";
import { Avatar } from "../ui/avatar";

const STATUS_STYLE: Record<TaskRecordV1["status"], string> = {
  todo: "bg-zinc-100 text-zinc-700",
  in_progress: "bg-sky-50 text-sky-700",
  blocked: "bg-amber-50 text-amber-700",
  in_review: "bg-violet-50 text-violet-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

export function TasksPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/tasks" });
  const tasksQuery = useQuery({
    queryKey: ["tasks", workspaceId],
    queryFn: () => listTasks(workspaceId),
  });
  if (tasksQuery.isLoading) return <LoadingState title="Loading tasks…" />;
  if (tasksQuery.error) return <RouteErrorState title="Unable to load tasks" />;
  const tasks = tasksQuery.data ?? [];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-violet-700">Workspace records</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Tasks</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Authoritative work shared by you and your coworkers.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
          >
            New task
          </button>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Summary label="Open tasks" value="2" detail="1 assigned" />
          <Summary label="Needs attention" value="1" detail="Approval pending" tone="amber" />
          <Summary label="Completed this week" value="7" detail="+3 from last week" tone="green" />
        </div>
        <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
              {["All", "Open", "Mine"].map((filter, index) => (
                <button
                  key={filter}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${index === 0 ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                >
                  {filter}
                </button>
              ))}
            </div>
            <label className="text-xs text-zinc-500">
              Sort
              <select className="ml-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-zinc-700">
                <option>Recently updated</option>
                <option>Due date</option>
              </select>
            </label>
          </div>
          <div className="divide-y divide-zinc-100">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} workspaceId={workspaceId} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Summary({
  label,
  value,
  detail,
  tone = "violet",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "violet" | "amber" | "green";
}) {
  const color =
    tone === "amber" ? "text-amber-700" : tone === "green" ? "text-emerald-700" : "text-violet-700";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      <div className="mt-1 text-[11px] text-zinc-400">{detail}</div>
    </div>
  );
}

function TaskRow({ task, workspaceId }: { task: TaskRecordV1; workspaceId: string }) {
  const assigned = task.assignee_id === "cw_operator_001";
  return (
    <Link
      to={workspaceTaskDetailPath(workspaceId, task.id)}
      className="grid grid-cols-[1fr_150px_120px_100px] items-center gap-4 px-4 py-4 hover:bg-zinc-50"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900">{task.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[task.status]}`}
          >
            {task.status.replace("_", " ")}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {task.description ?? "No description"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {assigned ? (
          <>
            <Avatar name="Operator" tone="blue" size="sm" />
            <span className="text-xs text-zinc-600">Operator</span>
          </>
        ) : (
          <span className="text-xs text-zinc-400">Unassigned</span>
        )}
      </div>
      <div className="text-xs text-zinc-500">{task.due_at ? "Due Sep 1" : "No due date"}</div>
      <div className="text-right text-xs text-zinc-400">Rev {task.current_revision} →</div>
    </Link>
  );
}

export function TaskDetailPage() {
  const { workspaceId, taskId } = useParams({ from: "/w/$workspaceId/tasks/$taskId" });
  const taskQuery = useQuery({
    queryKey: ["task", workspaceId, taskId],
    queryFn: () => getTask(workspaceId, taskId),
  });
  if (taskQuery.isLoading) return <LoadingState title="Loading task…" />;
  const task = taskQuery.data;
  if (!task) {
    return (
      <RouteErrorState
        title="Task not found"
        action={<Link to={workspaceTasksPath(workspaceId)}>Back to tasks</Link>}
      />
    );
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <Link
          to={workspaceTasksPath(workspaceId)}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          ← All tasks
        </Link>
        <div className="mt-4 grid grid-cols-[1fr_300px] gap-5">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[task.status]}`}
                >
                  {task.status.replace("_", " ")}
                </span>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">
                  {task.title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                  {task.description ?? "No description."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600"
              >
                •••
              </button>
            </div>
            <div className="mt-7 border-t border-zinc-100 pt-5">
              <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
              <div className="mt-4 space-y-5">
                <History
                  title="Operator started work"
                  detail="Assigned from the General channel"
                  time="Today, 9:02 AM"
                  tone="blue"
                />
                <History
                  title="Task updated to in progress"
                  detail="Revision 2 · source Run run_seed_001"
                  time="Today, 9:03 AM"
                  tone="violet"
                />
                <History
                  title="Approval requested"
                  detail="Publish updated support macro"
                  time="Today, 9:04 AM"
                  tone="amber"
                />
              </div>
            </div>
          </section>
          <aside className="space-y-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Details
              </h2>
              <dl className="mt-4 space-y-4 text-xs">
                <Detail label="Assignee">
                  <div className="flex items-center gap-2">
                    <Avatar name="Operator" tone="blue" size="sm" />
                    <span className="font-medium text-zinc-800">Operator</span>
                  </div>
                </Detail>
                <Detail label="Channel">
                  <span className="font-medium text-zinc-800"># General</span>
                </Detail>
                <Detail label="Due">
                  <span className="font-medium text-zinc-800">September 1</span>
                </Detail>
                <Detail label="Revision">
                  <span className="font-medium text-zinc-800">{task.current_revision}</span>
                </Detail>
              </dl>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Allowed transitions
              </h2>
              <TaskTransitionPanel currentRevision={task.current_revision} />
            </section>
            <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs leading-5 text-violet-800">
              <strong>Source lineage preserved.</strong>
              <br />
              Message msg_seed_001 · Run run_seed_001
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function TaskTransitionPanel({ currentRevision }: { currentRevision: number }) {
  const [phase, setPhase] = useState<"idle" | "conflict" | "saved">("idle");
  const [note, setNote] = useState(
    "Validated the updated support macro and seven-day review plan.",
  );

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-[11px] text-zinc-500">
        Transition note
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200 p-2 text-xs leading-5 text-zinc-700"
        />
      </label>
      {phase === "conflict" ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-4 text-amber-900"
          role="alert"
        >
          <strong>Revision conflict.</strong> Operator updated this Task to revision{" "}
          {currentRevision}
          while you were editing. Your note is preserved. Review the latest revision, then retry.
        </div>
      ) : null}
      {phase === "saved" ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-[11px] text-emerald-800" role="status">
          Task updated to done as revision {currentRevision + 1}.
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setPhase(phase === "conflict" ? "saved" : "conflict")}
        className="w-full rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
      >
        {phase === "conflict"
          ? "Retry against latest revision"
          : phase === "saved"
            ? "Done recorded"
            : "Mark done"}
      </button>
      <button
        type="button"
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700"
      >
        Mark blocked
      </button>
    </div>
  );
}

function History({
  title,
  detail,
  time,
  tone,
}: {
  title: string;
  detail: string;
  time: string;
  tone: "blue" | "violet" | "amber";
}) {
  const dot = tone === "blue" ? "bg-sky-500" : tone === "amber" ? "bg-amber-500" : "bg-violet-500";
  return (
    <div className="flex gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div>
        <div className="text-sm font-medium text-zinc-800">{title}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{detail}</div>
        <div className="mt-1 text-[10px] text-zinc-400">{time}</div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="mb-1.5 text-zinc-400">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
