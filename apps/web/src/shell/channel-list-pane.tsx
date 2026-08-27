import { Link } from "@tanstack/react-router";
import type { Channel } from "@forgeroom/contracts";
import type { ConnectionFixture } from "../api/mock-fixtures";
import { workspaceChannelPath } from "../routes/paths";

type ChannelListPaneProps = {
  workspaceId: string;
  channels: Channel[];
  selectedChannelId: string;
  connections: ConnectionFixture[];
};

export function ChannelListPane({
  workspaceId,
  channels,
  selectedChannelId,
  connections,
}: ChannelListPaneProps) {
  const activeConnections = connections.filter(
    (connection) => connection.status === "active",
  ).length;
  const systemHealthy = connections.length > 0 && activeConnections === connections.length;
  return (
    <>
      <nav
        className="flex shrink-0 gap-2 overflow-x-auto border-b border-zinc-200 bg-zinc-50 p-2 lg:hidden"
        aria-label="Channel switcher"
      >
        {channels.map((channel) => {
          const selected = channel.id === selectedChannelId;
          return (
            <Link
              key={channel.id}
              to={workspaceChannelPath(workspaceId, channel.id)}
              aria-current={selected ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm ${selected ? "bg-zinc-950 font-medium text-white" : "bg-white text-zinc-700"}`}
            >
              # {channel.name}
            </Link>
          );
        })}
      </nav>
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/80 lg:flex">
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-3">
          <div>
            <h2 className="text-xs font-semibold text-zinc-800">Channels</h2>
            <p className="mt-0.5 text-[10px] text-zinc-400">2 rooms · 2 coworkers</p>
          </div>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-lg border border-zinc-200 bg-white text-base text-zinc-500 shadow-sm hover:text-zinc-900"
            aria-label="Create channel"
          >
            +
          </button>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-2">
          {channels.map((channel) => {
            const selected = channel.id === selectedChannelId;
            return (
              <li key={channel.id}>
                <Link
                  to={workspaceChannelPath(workspaceId, channel.id)}
                  className={`group flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${
                    selected
                      ? "bg-white font-medium text-zinc-950 shadow-sm ring-1 ring-zinc-200/70"
                      : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                  }`}
                  aria-current={selected ? "page" : undefined}
                >
                  <span className={`text-zinc-400 ${selected ? "text-zinc-700" : ""}`}>#</span>
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {channel.name === "General" ? (
                    <span
                      className="h-2 w-2 rounded-full bg-violet-500 ring-2 ring-violet-100"
                      aria-label="Active run"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-zinc-200 p-3">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200/70">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-800">
              <span
                className={`h-2 w-2 rounded-full ${systemHealthy ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {systemHealthy ? "System healthy" : "Connections need attention"}
            </div>
            <p className="mt-1 text-[10px] leading-4 text-zinc-500">
              {connections.length === 0
                ? "Connection status is unavailable."
                : `${activeConnections} of ${connections.length} connections active.`}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
