import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { getTask, listTasks } from "../api/workspace-api";
import { workspaceTaskDetailPath, workspaceTasksPath } from "../routes/paths";

export function TasksPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/tasks" });
  const tasksQuery = useQuery({
    queryKey: ["tasks", workspaceId],
    queryFn: () => listTasks(workspaceId),
  });

  if (tasksQuery.isLoading) {
    return <LoadingState title="Loading tasks…" />;
  }

  if (tasksQuery.error) {
    return <RouteErrorState title="Unable to load tasks" />;
  }

  const tasks = tasksQuery.data ?? [];
  if (tasks.length === 0) {
    return <EmptyState title="No tasks yet" description="Task records will appear here." />;
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Tasks</h1>
      <ul className="mt-4 space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <Link
              to={workspaceTaskDetailPath(workspaceId, task.id)}
              className="block rounded border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50"
            >
              <span className="font-medium text-zinc-900">{task.title}</span>
              <span className="ml-2 text-sm text-zinc-500">{task.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TaskDetailPage() {
  const { workspaceId, taskId } = useParams({ from: "/w/$workspaceId/tasks/$taskId" });
  const taskQuery = useQuery({
    queryKey: ["task", workspaceId, taskId],
    queryFn: () => getTask(workspaceId, taskId),
  });

  if (taskQuery.isLoading) {
    return <LoadingState title="Loading task…" />;
  }

  const task = taskQuery.data;
  if (!task) {
    return (
      <RouteErrorState
        title="Task not found"
        action={
          <Link to={workspaceTasksPath(workspaceId)} className="text-sm text-zinc-700 underline">
            Back to tasks
          </Link>
        }
      />
    );
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <Link to={workspaceTasksPath(workspaceId)} className="text-sm text-zinc-600 underline">
        Tasks
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-zinc-900">{task.title}</h1>
      <p className="mt-2 text-sm text-zinc-600">{task.description ?? "No description."}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-zinc-500">Status</dt>
          <dd className="font-medium text-zinc-900">{task.status}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Revision</dt>
          <dd className="font-medium text-zinc-900">{task.current_revision}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Created by</dt>
          <dd className="font-medium text-zinc-900">
            {task.created_by_type}:{task.created_by_id}
          </dd>
        </div>
      </dl>
    </section>
  );
}
