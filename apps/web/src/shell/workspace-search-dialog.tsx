import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  listChannels,
  listChannelMessages,
  listCoworkerDirectory,
  listTasks,
} from "../api/workspace-api";
import {
  workspaceChannelPath,
  workspaceCoworkerDetailPath,
  workspaceTaskDetailPath,
} from "../routes/paths";
import { useDialogFocus } from "../ui/use-dialog-focus";

export function WorkspaceSearchDialog(props: { workspaceId: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  useDialogFocus(dialogRef, props.onClose);

  const channelsQuery = useQuery({
    queryKey: ["channels", props.workspaceId],
    queryFn: () => listChannels(props.workspaceId),
  });
  const tasksQuery = useQuery({
    queryKey: ["tasks", props.workspaceId],
    queryFn: () => listTasks(props.workspaceId),
  });
  const coworkersQuery = useQuery({
    queryKey: ["coworker-directory", props.workspaceId],
    queryFn: () => listCoworkerDirectory(props.workspaceId),
  });
  const channelIds = (channelsQuery.data ?? []).map((channel) => channel.id);
  const messagesQuery = useQuery({
    queryKey: ["workspace-search-messages", props.workspaceId, channelIds],
    queryFn: async () =>
      Promise.all(
        (channelsQuery.data ?? []).map(async (channel) => ({
          channel,
          messages: (await listChannelMessages(channel.id)).messages,
        })),
      ),
    enabled: channelsQuery.isSuccess,
  });

  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalized) return null;
    const includes = (value: string | null | undefined) =>
      Boolean(value?.toLowerCase().includes(normalized));
    return {
      channels: (channelsQuery.data ?? []).filter(
        (channel) => includes(channel.name) || includes(channel.mission_brief),
      ),
      tasks: (tasksQuery.data ?? []).filter(
        (task) => includes(task.title) || includes(task.description),
      ),
      coworkers: (coworkersQuery.data ?? []).filter(
        (coworker) =>
          includes(coworker.name) || includes(coworker.handle) || includes(coworker.title),
      ),
      messages: (messagesQuery.data ?? []).flatMap(({ channel, messages }) =>
        messages
          .filter((message) => includes(message.body))
          .map((message) => ({ channel, message })),
      ),
    };
  }, [normalized, channelsQuery.data, tasksQuery.data, coworkersQuery.data, messagesQuery.data]);

  const resultCount = results
    ? results.channels.length +
      results.tasks.length +
      results.coworkers.length +
      results.messages.length
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[10vh] backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-search-title"
        className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#242424] shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="text-zinc-500" aria-hidden="true">
            ⌕
          </span>
          <label className="sr-only" htmlFor="workspace-search-input">
            Search workspace
          </label>
          <input
            id="workspace-search-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rooms, messages, tasks, and coworkers"
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-200"
          >
            Esc
          </button>
        </div>
        <div className="min-h-44 overflow-y-auto p-3">
          <h2 id="workspace-search-title" className="sr-only">
            Find
          </h2>
          {!normalized ? (
            <SearchHint />
          ) : channelsQuery.isLoading || tasksQuery.isLoading || coworkersQuery.isLoading ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">Searching workspace…</p>
          ) : resultCount === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-zinc-500">
              No workspace results for “{query.trim()}”.
            </p>
          ) : (
            <div className="space-y-4">
              <ResultGroup title="Rooms" count={results?.channels.length ?? 0}>
                {results?.channels.map((channel) => (
                  <SearchLink
                    key={channel.id}
                    to={workspaceChannelPath(props.workspaceId, channel.id)}
                    title={`# ${channel.name}`}
                    detail={channel.mission_brief}
                    onSelect={props.onClose}
                  />
                ))}
              </ResultGroup>
              <ResultGroup title="Tasks" count={results?.tasks.length ?? 0}>
                {results?.tasks.map((task) => (
                  <SearchLink
                    key={task.id}
                    to={workspaceTaskDetailPath(props.workspaceId, task.id)}
                    title={task.title}
                    detail={`${task.status.replace("_", " ")} · revision ${task.current_revision}`}
                    onSelect={props.onClose}
                  />
                ))}
              </ResultGroup>
              <ResultGroup title="Coworkers" count={results?.coworkers.length ?? 0}>
                {results?.coworkers.map((coworker) => (
                  <SearchLink
                    key={coworker.id}
                    to={workspaceCoworkerDetailPath(props.workspaceId, coworker.id)}
                    title={coworker.name}
                    detail={`@${coworker.handle} · ${coworker.title}`}
                    onSelect={props.onClose}
                  />
                ))}
              </ResultGroup>
              <ResultGroup title="Messages" count={results?.messages.length ?? 0}>
                {results?.messages.slice(0, 8).map(({ channel, message }) => (
                  <SearchLink
                    key={message.id}
                    to={workspaceChannelPath(props.workspaceId, channel.id)}
                    title={`# ${channel.name}`}
                    detail={message.body}
                    onSelect={props.onClose}
                  />
                ))}
              </ResultGroup>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchHint() {
  return (
    <div className="grid gap-2 p-2 sm:grid-cols-2">
      {[
        ["Rooms", "Find a workroom by name or mission"],
        ["Messages", "Search the shared conversation history"],
        ["Tasks", "Open authoritative work records"],
        ["Coworkers", "Jump to an agent profile"],
      ].map(([title, detail]) => (
        <div key={title} className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <div className="text-xs font-medium text-zinc-200">{title}</div>
          <div className="mt-1 text-[11px] text-zinc-500">{detail}</div>
        </div>
      ))}
    </div>
  );
}

function ResultGroup(props: { title: string; count: number; children: React.ReactNode }) {
  if (props.count === 0) return null;
  return (
    <section>
      <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
        {props.title}
      </div>
      <div className="space-y-1">{props.children}</div>
    </section>
  );
}

function SearchLink(props: { to: string; title: string; detail: string; onSelect: () => void }) {
  return (
    <Link
      to={props.to}
      onClick={props.onSelect}
      className="block rounded-xl px-3 py-2.5 hover:bg-white/[0.05]"
    >
      <div className="text-sm font-medium text-zinc-200">{props.title}</div>
      <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">{props.detail}</div>
    </Link>
  );
}
