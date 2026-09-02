import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ChannelTimelineMessage, TaskRecordV1 } from "@forgeroom/contracts";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { useSession } from "../auth/session-context";
import {
  listChannelMessages,
  listChannelRoster,
  listChannels,
  listTasks,
} from "../api/workspace-api";
import { workspaceChannelPath, workspaceTaskDetailPath } from "../routes/paths";
import { ChannelComposer } from "../shell/channel-composer";

type FeedFilter = "all" | "tasks" | "messages" | "mentions";

type FeedEntry =
  | { kind: "message"; channelId: string; channelName: string; message: ChannelTimelineMessage }
  | { kind: "task"; task: TaskRecordV1; channelName: string };

export function FeedPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/feed" });
  const { session } = useSession();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [selectedChannelId, setSelectedChannelId] = useState("");

  const channelsQuery = useQuery({
    queryKey: ["channels", workspaceId],
    queryFn: () => listChannels(workspaceId),
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", workspaceId],
    queryFn: () => listTasks(workspaceId),
  });
  const messagesQuery = useQuery({
    queryKey: ["feed-messages", workspaceId, channelsQuery.data?.map((channel) => channel.id)],
    queryFn: async () =>
      Promise.all(
        (channelsQuery.data ?? []).map(async (channel) => ({
          channel,
          messages: (await listChannelMessages(channel.id)).messages,
        })),
      ),
    enabled: channelsQuery.isSuccess,
  });

  const channels = channelsQuery.data ?? [];
  const activeChannelId =
    channels.find((channel) => channel.id === selectedChannelId)?.id ?? channels[0]?.id ?? "";
  const activeChannel = channels.find((channel) => channel.id === activeChannelId);
  const rosterQuery = useQuery({
    queryKey: ["channel-roster", activeChannelId],
    queryFn: () => listChannelRoster(workspaceId, activeChannelId),
    enabled: Boolean(activeChannelId),
  });

  const entries = useMemo(() => {
    const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
    const messages: FeedEntry[] = (messagesQuery.data ?? []).flatMap(({ channel, messages }) =>
      messages.map((message) => ({
        kind: "message" as const,
        channelId: channel.id,
        channelName: channel.name,
        message,
      })),
    );
    const tasks: FeedEntry[] = (tasksQuery.data ?? []).map((task) => ({
      kind: "task" as const,
      task,
      channelName: channelNames.get(task.channel_id) ?? "Room",
    }));
    return [...messages, ...tasks]
      .filter((entry) => {
        if (filter === "tasks") return entry.kind === "task";
        if (filter === "messages") return entry.kind === "message";
        if (filter === "mentions") {
          return entry.kind === "message" && /@(team|owner|pramod)\b/i.test(entry.message.body);
        }
        return true;
      })
      .sort((left, right) => feedEntryTime(right).localeCompare(feedEntryTime(left)))
      .slice(0, 18);
  }, [channels, filter, messagesQuery.data, tasksQuery.data]);

  if (channelsQuery.isLoading || tasksQuery.isLoading || messagesQuery.isLoading) {
    return <LoadingState title="Loading your feed…" />;
  }
  if (channelsQuery.error || tasksQuery.error || messagesQuery.error || !session) {
    return (
      <RouteErrorState
        title="Unable to load Feed"
        description="Your workspace activity could not be loaded."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 bg-[#1b1b1b]">
      <aside className="hidden h-full w-[360px] shrink-0 flex-col border-r border-[#303030] bg-[#202020] md:flex">
        <div className="border-b border-[#303030] px-5 pb-3 pt-5">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Feed</h1>
          <div className="mt-4 flex gap-1 overflow-x-auto" aria-label="Feed filters">
            {(
              [
                ["all", "All"],
                ["tasks", "Tasks"],
                ["messages", "Messages"],
                ["mentions", "@me"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                  filter === value
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2.5">
          {entries.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-zinc-600">Nothing in this view yet.</p>
          ) : (
            <ul className="space-y-1">
              {entries.map((entry) => (
                <li key={feedEntryKey(entry)}>
                  <FeedEntryLink workspaceId={workspaceId} entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#1d1d1d]">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#303030] px-5 md:hidden">
          <h1 className="font-semibold text-zinc-100">Feed</h1>
          <span className="text-xs text-zinc-500">{entries.length} recent</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8">
          <div className="w-full max-w-[820px]">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-300 text-lg font-black text-emerald-950 shadow-[0_16px_50px_rgba(110,231,183,0.12)]">
                F
              </div>
              <h2 className="text-2xl font-medium tracking-tight text-zinc-100 sm:text-3xl">
                What should we work on?
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
                Start with an outcome. ForgeRoom will route the work to the right room and
                coworkers.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#424242] bg-[#222222] shadow-[0_28px_80px_rgba(0,0,0,0.3)]">
              <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
                <label htmlFor="feed-room" className="text-[11px] font-medium text-zinc-500">
                  Work in
                </label>
                <select
                  id="feed-room"
                  value={activeChannelId}
                  onChange={(event) => setSelectedChannelId(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#2b2b2b] px-2.5 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-400/60"
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      # {channel.name}
                    </option>
                  ))}
                </select>
                {activeChannel ? (
                  <Link
                    to={workspaceChannelPath(workspaceId, activeChannel.id)}
                    className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-200"
                  >
                    Open room
                  </Link>
                ) : null}
              </div>
              {activeChannelId ? (
                <ChannelComposer
                  channelId={activeChannelId}
                  roster={rosterQuery.data?.coworkers ?? []}
                  csrfToken={session.csrf_token}
                  disabled={rosterQuery.isLoading}
                  onSent={() =>
                    void navigate({ to: workspaceChannelPath(workspaceId, activeChannelId) })
                  }
                />
              ) : (
                <p className="px-5 py-8 text-center text-sm text-zinc-500">
                  Create a room before starting work.
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-600">
              <span>Use @coworker for direct work</span>
              <span>Use @team to coordinate everyone</span>
              <span>Turn any request into a TaskRecord</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeedEntryLink(props: { workspaceId: string; entry: FeedEntry }) {
  const { entry } = props;
  const isTask = entry.kind === "task";
  const href = isTask
    ? workspaceTaskDetailPath(props.workspaceId, entry.task.id)
    : workspaceChannelPath(props.workspaceId, entry.channelId);
  const title = isTask
    ? entry.task.title
    : entry.message.author_type === "human"
      ? "You"
      : "Coworker update";
  const detail = isTask ? entry.task.description || "Open task" : entry.message.body;
  return (
    <Link to={href} className="block rounded-xl px-3 py-3 hover:bg-white/[0.045]">
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] ${
            isTask ? "bg-violet-400/10 text-violet-300" : "bg-emerald-400/10 text-emerald-300"
          }`}
          aria-hidden="true"
        >
          {isTask ? "✓" : "#"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium text-zinc-200">{title}</span>
            <span className="shrink-0 text-[10px] text-zinc-600">{entry.channelName}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{detail}</p>
        </div>
      </div>
    </Link>
  );
}

function feedEntryTime(entry: FeedEntry): string {
  return entry.kind === "task" ? entry.task.updated_at : entry.message.created_at;
}

function feedEntryKey(entry: FeedEntry): string {
  return entry.kind === "task" ? `task:${entry.task.id}` : `message:${entry.message.id}`;
}
