import { Link } from "@tanstack/react-router";
import type { Channel } from "@forgeroom/contracts";
import { workspaceChannelPath } from "../routes/paths";

type ChannelListPaneProps = {
  workspaceId: string;
  channels: Channel[];
  selectedChannelId: string;
};

export function ChannelListPane({
  workspaceId,
  channels,
  selectedChannelId,
}: ChannelListPaneProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Channels</h2>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {channels.map((channel) => {
          const selected = channel.id === selectedChannelId;
          return (
            <li key={channel.id}>
              <Link
                to={workspaceChannelPath(workspaceId, channel.id)}
                className={`block rounded px-2 py-2 text-sm ${
                  selected
                    ? "bg-white font-medium text-zinc-900 shadow-sm"
                    : "text-zinc-700 hover:bg-white/70"
                }`}
                aria-current={selected ? "page" : undefined}
              >
                {channel.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
