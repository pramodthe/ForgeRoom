import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { getCoworker, listCoworkers } from "../api/workspace-api";
import { workspaceCoworkerDetailPath, workspaceCoworkersPath } from "../routes/paths";

export function CoworkersPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/coworkers" });
  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });

  if (coworkersQuery.isLoading) {
    return <LoadingState title="Loading coworkers…" />;
  }

  if (coworkersQuery.error) {
    return <RouteErrorState title="Unable to load coworkers" />;
  }

  const coworkers = coworkersQuery.data ?? [];
  if (coworkers.length === 0) {
    return <EmptyState title="No coworkers yet" />;
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Coworkers</h1>
      <ul className="mt-4 space-y-2">
        {coworkers.map((coworker) => (
          <li key={coworker.id}>
            <Link
              to={workspaceCoworkerDetailPath(workspaceId, coworker.id)}
              className="block rounded border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50"
            >
              <span className="font-medium text-zinc-900">{coworker.name}</span>
              <span className="ml-2 text-sm text-zinc-500">@{coworker.handle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CoworkerDetailPage() {
  const { workspaceId, coworkerId } = useParams({ from: "/w/$workspaceId/coworkers/$coworkerId" });
  const coworkerQuery = useQuery({
    queryKey: ["coworker", workspaceId, coworkerId],
    queryFn: () => getCoworker(workspaceId, coworkerId),
  });

  if (coworkerQuery.isLoading) {
    return <LoadingState title="Loading coworker…" />;
  }

  const coworker = coworkerQuery.data;
  if (!coworker) {
    return (
      <RouteErrorState
        title="Coworker not found"
        action={
          <Link
            to={workspaceCoworkersPath(workspaceId)}
            className="text-sm text-zinc-700 underline"
          >
            Back to coworkers
          </Link>
        }
      />
    );
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <Link to={workspaceCoworkersPath(workspaceId)} className="text-sm text-zinc-600 underline">
        Coworkers
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-zinc-900">{coworker.name}</h1>
      <p className="text-sm text-zinc-600">
        @{coworker.handle} · {coworker.title}
      </p>
      <p className="mt-2 text-sm text-zinc-600">Status: {coworker.status}</p>
    </section>
  );
}
