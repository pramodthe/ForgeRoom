import { useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import type { ConnectionStatus } from "@forgeroom/contracts";
import { useState } from "react";
import {
  getConnectionStatus,
  listConnections,
  reconnectConnection,
  testConnection,
} from "../api/workspace-api";
import { newIdempotencyKey } from "../api/http-client";
import { isFixtureMode } from "../api/mode";
import { useSession } from "../auth/session-context";
import { formatVerifiedAt } from "./settings-helpers";

export function ConnectionsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/connections" });
  const connectionsQuery = useQuery({
    queryKey: ["connections", workspaceId],
    queryFn: () => listConnections(workspaceId),
  });
  if (connectionsQuery.isLoading) return <LoadingState title="Loading connections…" />;
  if (connectionsQuery.error) return <RouteErrorState title="Unable to load connections" />;
  const connections = connectionsQuery.data ?? [];
  const latestVerified = connections
    .map((connection) => connection.verified_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <div>
          <p className="text-xs font-medium text-violet-700">Fixed service identity</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Connections</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Verify the exact accounts and tools coworkers can use.
          </p>
        </div>
        <section className="mt-6 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-950 text-sm font-bold text-white">
              FR
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-zinc-950">ForgeRoom workspace service account</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                  Active
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                One fixed acting identity · account switching is unavailable in P0
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <div>Last verified</div>
            <div className="mt-1 font-medium text-zinc-800">{formatVerifiedAt(latestVerified)}</div>
          </div>
        </section>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {connections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} />
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          <strong>Least privilege by design.</strong> This screen cannot browse Composio&apos;s full
          catalog, add another account, switch identity, or expand grants. Those changes require
          reviewed server configuration.
        </div>
      </div>
    </main>
  );
}

function ConnectionCard({
  connection,
}: {
  connection: Awaited<ReturnType<typeof listConnections>>[number];
}) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [testing, setTesting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["connection-status", connection.id],
    queryFn: () => getConnectionStatus(connection.id),
  });
  const statusView = statusQuery.data;
  const status = statusView?.status ?? connection.status;
  const trueforge = connection.provider === "trueforge";
  const tools =
    statusView?.tools.map((tool) => tool.tool_name) ??
    (trueforge
      ? ["sandbox.create", "sandbox.execute", "artifact.download"]
      : ["GITHUB_GET_ISSUES", "INTERCOM_UPDATE_MACRO", "SUPPORT_SEARCH"]);
  const descriptorHash = statusView?.tools[0]?.descriptor_hash ?? connection.descriptor_hash;
  const scopes = statusView?.scopes ?? [];
  const verifiedAt = statusView?.verified_at ?? connection.verified_at;

  async function test() {
    setActionError(null);
    setNotice(null);
    if (isFixtureMode) {
      setTesting(true);
      window.setTimeout(() => {
        setTesting(false);
        void queryClient.invalidateQueries({ queryKey: ["connection-status", connection.id] });
        setNotice("Prototype verification completed against the fixture adapter.");
      }, 700);
      return;
    }
    if (!session || !statusView) {
      setActionError("Your session expired or connection details are still loading.");
      return;
    }
    setTesting(true);
    try {
      const result = await testConnection({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_connection_id: connection.id,
          expected_descriptor_hash: descriptorHash,
          idempotency_key: newIdempotencyKey("connection_test"),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["connection-status", connection.id] });
      await queryClient.invalidateQueries({ queryKey: ["connections"] });
      setNotice(result.safe_summary ?? "Connection verification completed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to test connection.");
    } finally {
      setTesting(false);
    }
  }

  async function reconnect() {
    setActionError(null);
    setNotice(null);
    if (isFixtureMode) {
      setReconnecting(true);
      window.setTimeout(() => {
        setReconnecting(false);
        void queryClient.invalidateQueries({ queryKey: ["connection-status", connection.id] });
        setNotice("Prototype reconnect completed against the fixture adapter.");
      }, 900);
      return;
    }
    if (!session || !statusView) {
      setActionError("Your session expired or connection details are still loading.");
      return;
    }
    setReconnecting(true);
    try {
      const result = await reconnectConnection({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_connection_id: connection.id,
          expected_status: statusView.status,
          idempotency_key: newIdempotencyKey("connection_reconnect"),
        },
      });
      window.open(result.redirect_url, "_blank", "noopener,noreferrer");
      setNotice("Reconnect link opened in a new tab. Return here after authorization completes.");
      await queryClient.invalidateQueries({ queryKey: ["connection-status", connection.id] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to start reconnect.");
    } finally {
      setReconnecting(false);
    }
  }

  const statusPresentation = CONNECTION_STATUS_PRESENTATION[status];
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-bold ${trueforge ? "bg-orange-100 text-orange-700" : "bg-violet-100 text-violet-700"}`}
          >
            {trueforge ? "TF" : "C"}
          </span>
          <div>
            <h2 className="font-semibold capitalize text-zinc-950">
              {statusView?.toolkit ?? connection.label}
            </h2>
            <p className="text-xs text-zinc-500">
              {statusView?.acting_identity.account_display ?? connection.label}
              {statusView ? ` · …${statusView.account_suffix}` : null}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${statusPresentation.badge}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusPresentation.dot}`} />
          {reconnecting ? "Reconnecting" : statusPresentation.label}
        </span>
      </div>
      {scopes.length > 0 ? (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Scopes
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scopes.map((scope) => (
              <span
                key={scope}
                className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600"
              >
                {scope}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          Exact granted tools
        </div>
        <div className="mt-2 space-y-1.5">
          {(
            statusView?.tools ??
            tools.map((tool) => ({ tool_name: tool, descriptor_hash: descriptorHash }))
          ).map((tool) => (
            <div
              key={tool.tool_name}
              className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs"
            >
              <span className="font-medium text-zinc-700">{tool.tool_name}</span>
              <span className="text-[10px] text-zinc-400">direct</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
        <span>Verified {formatVerifiedAt(verifiedAt)}</span>
        {statusView?.blocks_dispatch ? (
          <span className="font-medium text-amber-700">Dispatch blocked</span>
        ) : (
          <span className="font-medium text-emerald-700">Dispatch allowed</span>
        )}
      </div>
      <details className="mt-4 rounded-lg border border-zinc-100 px-3 py-2 text-[11px] text-zinc-500">
        <summary className="cursor-pointer font-medium text-zinc-600">Descriptor integrity</summary>
        <div className="mt-2 space-y-2">
          {(statusView?.tools ?? [{ tool_name: "primary", descriptor_hash: descriptorHash }]).map(
            (tool) => (
              <div key={tool.tool_name}>
                <div className="font-medium text-zinc-600">{tool.tool_name}</div>
                <div className="mt-1 break-all font-mono text-[9px] leading-4">
                  {tool.descriptor_hash}
                </div>
              </div>
            ),
          )}
        </div>
      </details>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void test()}
          disabled={testing || reconnecting || statusQuery.isLoading}
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
        >
          {testing ? "Testing…" : status === "active" ? "Test connection" : "Verify connection"}
        </button>
        <button
          type="button"
          onClick={() => void reconnect()}
          disabled={testing || reconnecting || statusQuery.isLoading}
          className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {reconnecting ? "Reconnecting…" : "Reconnect"}
        </button>
      </div>
      {notice ? (
        <p
          className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-[11px] text-violet-800"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800" role="alert">
          {actionError}
        </p>
      ) : null}
      {statusQuery.error ? (
        <p
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
          role="alert"
        >
          Unable to load connection health details.
        </p>
      ) : null}
    </section>
  );
}

const CONNECTION_STATUS_PRESENTATION: Record<
  ConnectionStatus,
  { label: string; badge: string; dot: string }
> = {
  unconfigured: {
    label: "Not configured",
    badge: "bg-zinc-100 text-zinc-600",
    dot: "bg-zinc-400",
  },
  connecting: {
    label: "Connecting",
    badge: "bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  active: {
    label: "Verified",
    badge: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  expired: {
    label: "Expired",
    badge: "bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  revoked: {
    label: "Revoked",
    badge: "bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  drifted: {
    label: "Drift detected",
    badge: "bg-orange-50 text-orange-800",
    dot: "bg-orange-500",
  },
};
