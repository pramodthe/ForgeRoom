import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import type { TaskRecordV1, TaskStatus } from "@forgeroom/contracts";
import { useState, type ReactNode } from "react";
import {
  getTask,
  listChannels,
  listCoworkers,
  listTasks,
  updateFixtureTaskStatus,
} from "../api/workspace-api";
import { isFixtureMode } from "../api/mode";
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
  const [filter, setFilter] = useState<"All" | "Open" | "Mine">("All");
  const [sort, setSort] = useState<"updated" | "due">("updated");
  const tasksQuery = useQuery({
    queryKey: ["tasks", workspaceId],
    queryFn: () => listTasks(workspaceId),
  });
  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });
  if (tasksQuery.isLoading || coworkersQuery.isLoading)
    return <LoadingState title="Loading tasks…" />;
  if (tasksQuery.error || coworkersQuery.error)
    return <RouteErrorState title="Unable to load tasks" />;
  const tasks = tasksQuery.data ?? [];
  const coworkers = new Map((coworkersQuery.data ?? []).map((coworker) => [coworker.id, coworker]));
  const open = tasks.filter((task) => !["done", "cancelled"].includes(task.status));
  const needsAttention = tasks.filter((task) => ["blocked", "in_review"].includes(task.status));
  const completed = tasks.filter((task) => task.status === "done");
  const visibleTasks = tasks
    .filter((task) =>
      filter === "Open"
        ? !["done", "cancelled"].includes(task.status)
        : filter === "Mine"
          ? task.assignee_type === "human"
          : true,
    )
    .sort((left, right) => {
      const leftValue = sort === "due" ? (left.due_at ?? "9999") : left.updated_at;
      const rightValue = sort === "due" ? (right.due_at ?? "9999") : right.updated_at;
      return sort === "due"
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue);
    });

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
            disabled
            title="Task creation API is not connected yet"
            className="rounded-xl bg-zinc-300 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed"
          >
            Task creation pending
          </button>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Summary
            label="Open tasks"
            value={String(open.length)}
            detail={`${open.filter((task) => task.assignee_id !== null).length} assigned`}
          />
          <Summary
            label="Needs attention"
            value={String(needsAttention.length)}
            detail={needsAttention.length ? "Blocked or in review" : "Nothing waiting"}
            tone="amber"
          />
          <Summary
            label="Completed"
            value={String(completed.length)}
            detail="From loaded records"
            tone="green"
          />
        </div>
        <section className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
              {(["All", "Open", "Mine"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === option ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}
                >
                  {option}
                </button>
              ))}
            </div>
            <label className="text-xs text-zinc-500">
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as "updated" | "due")}
                className="ml-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-zinc-700"
              >
                <option value="updated">Recently updated</option>
                <option value="due">Due date</option>
              </select>
            </label>
          </div>
          <div className="divide-y divide-zinc-100">
            {visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                workspaceId={workspaceId}
                assigneeName={
                  task.assignee_type === "coworker" && task.assignee_id
                    ? coworkers.get(task.assignee_id)?.name
                    : undefined
                }
              />
            ))}
            {visibleTasks.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                No tasks match this filter.
              </p>
            ) : null}
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

function TaskRow({
  task,
  workspaceId,
  assigneeName,
}: {
  task: TaskRecordV1;
  workspaceId: string;
  assigneeName?: string;
}) {
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
        {assigneeName ? (
          <>
            <Avatar name={assigneeName} tone="blue" size="sm" />
            <span className="text-xs text-zinc-600">{assigneeName}</span>
          </>
        ) : (
          <span className="text-xs text-zinc-400">Unassigned</span>
        )}
      </div>
      <div className="text-xs text-zinc-500">
        {task.due_at ? `Due ${formatDate(task.due_at)}` : "No due date"}
      </div>
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
  const channelsQuery = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => listChannels(workspaceId),
  });
  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });
  if (taskQuery.isLoading || channelsQuery.isLoading || coworkersQuery.isLoading)
    return <LoadingState title="Loading task…" />;
  if (taskQuery.error || channelsQuery.error || coworkersQuery.error)
    return <RouteErrorState title="Unable to load task" />;
  const task = taskQuery.data;
  if (!task) {
    return (
      <RouteErrorState
        title="Task not found"
        action={<Link to={workspaceTasksPath(workspaceId)}>Back to tasks</Link>}
      />
    );
  }
  const channel = (channelsQuery.data ?? []).find((candidate) => candidate.id === task.channel_id);
  const assignee =
    task.assignee_type === "coworker" && task.assignee_id
      ? (coworkersQuery.data ?? []).find((candidate) => candidate.id === task.assignee_id)
      : null;

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
                disabled
                title="Additional task actions are not connected yet"
                className="cursor-not-allowed rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-400"
              >
                •••
              </button>
            </div>
            <div className="mt-7 border-t border-zinc-100 pt-5">
              <h2 className="text-sm font-semibold text-zinc-900">Activity</h2>
              <div className="mt-4 space-y-5">
                <History
                  title="Task created"
                  detail={`Created by ${task.created_by_type} ${task.created_by_id}`}
                  time={formatDateTime(task.created_at)}
                  tone="blue"
                />
                <History
                  title={`Status: ${task.status.replace("_", " ")}`}
                  detail={`Current revision ${task.current_revision}`}
                  time={formatDateTime(task.updated_at)}
                  tone="violet"
                />
                {task.source_run_id ? (
                  <History
                    title="Linked to source run"
                    detail={task.source_run_id}
                    time={formatDateTime(task.created_at)}
                    tone="amber"
                  />
                ) : null}
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
                  {assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={assignee.name} tone="blue" size="sm" />
                      <span className="font-medium text-zinc-800">{assignee.name}</span>
                    </div>
                  ) : (
                    <span className="text-zinc-500">Unassigned</span>
                  )}
                </Detail>
                <Detail label="Channel">
                  <span className="font-medium text-zinc-800">
                    {channel ? `# ${channel.name}` : task.channel_id}
                  </span>
                </Detail>
                <Detail label="Due">
                  <span className="font-medium text-zinc-800">
                    {task.due_at ? formatDate(task.due_at) : "No due date"}
                  </span>
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
              <TaskTransitionPanel workspaceId={workspaceId} task={task} />
            </section>
            <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs leading-5 text-violet-800">
              <strong>
                {task.source_message_id || task.source_run_id
                  ? "Source lineage preserved."
                  : "No source lineage."}
              </strong>
              {task.source_message_id || task.source_run_id ? (
                <>
                  <br />
                  {task.source_message_id
                    ? `Message ${task.source_message_id}`
                    : "No source message"}
                  {task.source_run_id ? ` · Run ${task.source_run_id}` : ""}
                </>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function TaskTransitionPanel({ workspaceId, task }: { workspaceId: string; task: TaskRecordV1 }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: TaskStatus) =>
      updateFixtureTaskStatus({ workspaceId, taskId: task.id, status }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(["task", workspaceId, task.id], updated);
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
    },
  });

  return (
    <div className="mt-3 space-y-2">
      {!isFixtureMode ? (
        <p className="rounded-lg bg-zinc-100 p-3 text-[11px] text-zinc-600">
          Task transitions are unavailable until the live Task API is connected.
        </p>
      ) : null}
      {mutation.error ? (
        <p className="rounded-lg bg-red-50 p-3 text-[11px] text-red-800" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => mutation.mutate("done")}
        disabled={!isFixtureMode || mutation.isPending || task.status === "done"}
        className="w-full rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {task.status === "done" ? "Done recorded" : mutation.isPending ? "Saving…" : "Mark done"}
      </button>
      <button
        type="button"
        onClick={() => mutation.mutate("blocked")}
        disabled={!isFixtureMode || mutation.isPending || task.status === "blocked"}
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-400"
      >
        {task.status === "blocked" ? "Blocked recorded" : "Mark blocked"}
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
