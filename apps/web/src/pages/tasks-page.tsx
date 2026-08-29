import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import type { TaskRecordV1, TaskStatus } from "@forgeroom/contracts";
import { TASK_TRANSITIONS } from "@forgeroom/domain/transitions";
import { useRef, useState, useId, type ReactNode } from "react";
import {
  createTask,
  getTask,
  listChannels,
  listCoworkers,
  listTaskHistory,
  listTasks,
  updateFixtureTaskStatus,
} from "../api/workspace-api";
import { newIdempotencyKey } from "../api/http-client";
import { workspaceTaskDetailPath, workspaceTasksPath } from "../routes/paths";
import { Avatar } from "../ui/avatar";
import { useSession } from "../auth/session-context";
import { useDialogFocus } from "../ui/use-dialog-focus";
import {
  friendlyApiError,
  formatTaskRevisionSummary,
  isStaleTaskRevision,
} from "./review-flow-helpers";
import { PoliteStatus } from "../shell/polite-status";

const STATUS_STYLE: Record<TaskRecordV1["status"], string> = {
  todo: "bg-zinc-100 text-zinc-700",
  in_progress: "bg-sky-50 text-sky-700",
  blocked: "bg-amber-50 text-amber-700",
  in_review: "bg-violet-50 text-violet-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

export function TasksPage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams({ from: "/w/$workspaceId/tasks" });
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [filter, setFilter] = useState<"All" | "Open" | "Mine">("All");
  const [sort, setSort] = useState<"updated" | "due">("updated");
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const tasksQuery = useQuery({
    queryKey: ["tasks", workspaceId],
    queryFn: () => listTasks(workspaceId),
  });
  const channelsQuery = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => listChannels(workspaceId),
  });
  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });
  const createMutation = useMutation({
    mutationFn: async (input: { channelId: string; title: string; description: string }) => {
      if (!session) throw new Error("Your session expired. Sign in again.");
      return createTask({
        workspaceId,
        channelId: input.channelId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          title: input.title,
          description: input.description || null,
          status: "todo",
          assignee_type: null,
          assignee_id: null,
          source_message_id: null,
          source_run_id: null,
          due_at: null,
          idempotency_key: newIdempotencyKey("task_create"),
        },
      });
    },
    onSuccess: async (task) => {
      setCreateError(null);
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      await navigate({ to: workspaceTaskDetailPath(workspaceId, task.id) });
    },
    onError: (error) => {
      setCreateError(friendlyApiError(error));
    },
  });
  if (tasksQuery.isLoading || coworkersQuery.isLoading || channelsQuery.isLoading)
    return <LoadingState title="Loading tasks…" />;
  if (tasksQuery.error || coworkersQuery.error || channelsQuery.error)
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
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
          >
            + New task
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
                channelName={
                  (channelsQuery.data ?? []).find((channel) => channel.id === task.channel_id)?.name
                }
              />
            ))}
            {visibleTasks.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-medium text-zinc-700">
                  {tasks.length === 0 ? "No tasks yet" : "No tasks match this filter"}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {tasks.length === 0
                    ? "Create a task to track work shared across the workspace."
                    : "Try a different filter or create a new task."}
                </p>
                {tasks.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCreateError(null);
                      setCreateOpen(true);
                    }}
                    className="mt-4 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    + New task
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
      {createOpen ? (
        <TaskCreateDialog
          channels={channelsQuery.data ?? []}
          pending={createMutation.isPending}
          error={createError}
          onClose={() => setCreateOpen(false)}
          onCreate={(input) => createMutation.mutate(input)}
        />
      ) : null}
    </main>
  );
}

function TaskCreateDialog({
  channels,
  pending,
  error,
  onClose,
  onCreate,
}: {
  channels: Awaited<ReturnType<typeof listChannels>>;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: { channelId: string; title: string; description: string }) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-create-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
      >
        <h2 id="task-create-title" className="text-lg font-semibold text-zinc-950">
          Create task
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Authoritative workspace record with revision tracking.
        </p>
        <label className="mt-5 block text-xs text-zinc-500">
          Channel
          <select
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-800"
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-xs text-zinc-500">
          Title
          <input
            data-autofocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-800"
          />
        </label>
        <label className="mt-3 block text-xs text-zinc-500">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm text-zinc-800"
          />
        </label>
        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !title.trim() || !channelId}
            onClick={() =>
              onCreate({ channelId, title: title.trim(), description: description.trim() })
            }
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-zinc-300"
          >
            {pending ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
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
  channelName,
}: {
  task: TaskRecordV1;
  workspaceId: string;
  assigneeName?: string;
  channelName?: string;
}) {
  const lineage = [
    channelName ? `# ${channelName}` : task.channel_id,
    task.source_run_id ? "from run" : null,
    task.source_message_id ? "from message" : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
        <p className="mt-1 truncate text-[11px] text-zinc-400">{lineage}</p>
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
  const historyQuery = useQuery({
    queryKey: ["task-history", workspaceId, taskId],
    queryFn: () => listTaskHistory(workspaceId, taskId),
  });
  if (
    taskQuery.isLoading ||
    channelsQuery.isLoading ||
    coworkersQuery.isLoading ||
    historyQuery.isLoading
  )
    return <LoadingState title="Loading task…" />;
  if (taskQuery.error || channelsQuery.error || coworkersQuery.error || historyQuery.error)
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
  const revisions = historyQuery.data ?? [];

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
              <h2 className="text-sm font-semibold text-zinc-900">Revision history</h2>
              <div className="mt-4 space-y-5">
                {revisions.length > 0 ? (
                  revisions.map((revision) => {
                    const summary = formatTaskRevisionSummary(revision);
                    const tone = revision.changed_fields.includes("created")
                      ? "blue"
                      : revision.changed_fields.includes("status")
                        ? "violet"
                        : "amber";
                    return (
                      <History
                        key={revision.id}
                        title={summary.title}
                        detail={summary.detail}
                        time={formatDateTime(revision.created_at)}
                        tone={tone}
                      />
                    );
                  })
                ) : (
                  <History
                    title="Task created"
                    detail={`Created by ${task.created_by_type} ${task.created_by_id}`}
                    time={formatDateTime(task.created_at)}
                    tone="blue"
                  />
                )}
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
  const { session } = useSession();
  const queryClient = useQueryClient();
  const statusId = useId();
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);
  const mutation = useMutation({
    mutationFn: (status: TaskStatus) =>
      updateFixtureTaskStatus({
        workspaceId,
        taskId: task.id,
        status,
        csrfToken: session?.csrf_token,
      }),
    onSuccess: async (updated) => {
      setConflictNotice(null);
      setPendingStatus(null);
      setSuccessNotice(`Task moved to ${TASK_TRANSITION_LABEL[updated.status] ?? updated.status}.`);
      queryClient.setQueryData(["task", workspaceId, task.id], updated);
      await queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["task-history", workspaceId, task.id] });
    },
    onError: async (error, status) => {
      setSuccessNotice(null);
      if (isStaleTaskRevision(error)) {
        const latest = await getTask(workspaceId, task.id);
        if (latest) {
          queryClient.setQueryData(["task", workspaceId, task.id], latest);
          setConflictNotice(
            `Task updated elsewhere (revision ${latest.current_revision}). Retry your change when ready.`,
          );
          setPendingStatus(status);
          return;
        }
      }
      setConflictNotice(null);
      setPendingStatus(null);
    },
  });
  const transitions = TASK_TRANSITIONS[task.status];
  const statusMessage = mutation.isPending
    ? "Saving task change."
    : (conflictNotice ?? successNotice);

  return (
    <div className="mt-3 space-y-2">
      <PoliteStatus id={statusId} message={statusMessage} />
      {conflictNotice ? (
        <div className="rounded-lg bg-amber-50 p-3 text-[11px] text-amber-900" role="status">
          {conflictNotice}
          {pendingStatus ? (
            <button
              type="button"
              onClick={() => {
                setSuccessNotice(null);
                mutation.mutate(pendingStatus);
              }}
              disabled={mutation.isPending}
              className="mt-2 block w-full rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white disabled:bg-amber-300"
            >
              Retry {TASK_TRANSITION_LABEL[pendingStatus]}
            </button>
          ) : null}
        </div>
      ) : null}
      {mutation.error && !conflictNotice ? (
        <p className="rounded-lg bg-red-50 p-3 text-[11px] text-red-800" role="alert">
          {friendlyApiError(mutation.error)}
        </p>
      ) : null}
      {transitions.map((status, index) => (
        <button
          key={status}
          type="button"
          onClick={() => {
            setSuccessNotice(null);
            mutation.mutate(status);
          }}
          disabled={mutation.isPending}
          className={`${index === 0 ? "bg-zinc-950 font-semibold text-white disabled:bg-zinc-300" : "border border-zinc-200 font-medium text-zinc-700 disabled:text-zinc-400"} w-full rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed`}
        >
          {mutation.isPending && mutation.variables === status
            ? "Saving…"
            : TASK_TRANSITION_LABEL[status]}
        </button>
      ))}
      {transitions.length === 0 ? (
        <p className="rounded-lg bg-zinc-100 p-3 text-[11px] text-zinc-600">
          This task is in a terminal state.
        </p>
      ) : null}
    </div>
  );
}

const TASK_TRANSITION_LABEL: Record<TaskStatus, string> = {
  todo: "Move to todo",
  in_progress: "Start or resume task",
  blocked: "Mark blocked",
  in_review: "Send to review",
  done: "Mark done",
  cancelled: "Cancel task",
};

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
