import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { listConnections } from "../api/workspace-api";

export function ConnectionsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/connections" });
  const connectionsQuery = useQuery({
    queryKey: ["connections", workspaceId],
    queryFn: () => listConnections(workspaceId),
  });

  if (connectionsQuery.isLoading) {
    return <LoadingState title="Loading connections…" />;
  }

  if (connectionsQuery.error) {
    return <RouteErrorState title="Unable to load connections" />;
  }

  const connections = connectionsQuery.data ?? [];
  if (connections.length === 0) {
    return <EmptyState title="No connections configured" />;
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Connections</h1>
      <ul className="mt-4 space-y-2">
        {connections.map((connection) => (
          <li
            key={connection.id}
            className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <div className="font-medium text-zinc-900">{connection.label}</div>
            <div className="text-zinc-600">
              {connection.provider} · {connection.status}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
