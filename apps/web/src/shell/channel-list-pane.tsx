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
        className="flex shrink-0 gap-2 overflow-x-auto border-b border-[#343434] bg-[#202020] p-2 lg:hidden"
        aria-label="Channel switcher"
      >
        {channels.map((channel) => {
          const selected = channel.id === selectedChannelId;
          return (
            <Link
              key={channel.id}
              to={workspaceChannelPath(workspaceId, channel.id)}
              aria-current={selected ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm ${selected ? "bg-violet-500 font-medium text-white" : "bg-[#292929] text-zinc-300"}`}
            >
              # {channel.name}
            </Link>
          );
        })}
      </nav>
      <aside className="hidden h-full w-[272px] shrink-0 flex-col border-r border-[#343434] bg-[#202020] lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-[#343434] px-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Rooms</h2>
            <p className="mt-0.5 text-[10px] text-zinc-500">
              {channels.length} active {channels.length === 1 ? "room" : "rooms"}
            </p>
          </div>
          <span className="text-lg text-zinc-500" aria-hidden="true">
            ···
          </span>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto p-2.5">
          {channels.map((channel) => {
            const selected = channel.id === selectedChannelId;
            return (
              <li key={channel.id}>
                <Link
                  to={workspaceChannelPath(workspaceId, channel.id)}
                  className={`group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                    selected
                      ? "bg-[#303030] font-medium text-white shadow-sm ring-1 ring-white/5"
                      : "text-zinc-400 hover:bg-[#292929] hover:text-zinc-100"
                  }`}
                  aria-current={selected ? "page" : undefined}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-semibold ${
                      selected ? "bg-violet-500/20 text-violet-300" : "bg-[#303030] text-zinc-500"
                    }`}
                  >
                    #
                  </span>
                  <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                  {selected ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-violet-400 ring-2 ring-violet-400/10"
                      aria-label="Selected channel"
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-[#343434] p-3">
          <div className="rounded-xl bg-[#272727] p-3 ring-1 ring-white/5">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
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
