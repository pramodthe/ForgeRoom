import { useMemo, useRef, useState } from "react";
import type { ChannelRosterCoworker } from "@forgeroom/contracts";
import { postChannelMessage, type PostedChannelMessage } from "../api/workspace-api";
import {
  buildComposerMessageCommand,
  composerBlockReason,
  composerSendBlocked,
  previewComposerRecipients,
} from "./composer-routing";
import { buildWorkflowStarters } from "./workflow-starters";

type ChannelComposerProps = {
  channelId: string;
  roster: readonly ChannelRosterCoworker[];
  csrfToken: string;
  disabled?: boolean;
  onCreateTask?: (input: {
    posted: PostedChannelMessage;
    body: string;
    assigneeId: string | null;
  }) => Promise<void>;
  onSent?: (result: PostedChannelMessage, body: string) => void;
};

export function ChannelComposer({
  channelId,
  roster,
  csrfToken,
  disabled = false,
  onCreateTask,
  onSent,
}: ChannelComposerProps) {
  const [body, setBody] = useState("");
  const [sendMode, setSendMode] = useState<"message" | "task">("message");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendIdempotencyKey, setSendIdempotencyKey] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const workflowStarters = useMemo(() => buildWorkflowStarters(roster), [roster]);

  const preview = useMemo(
    () => previewComposerRecipients({ body: body.trim(), roster }),
    [body, roster],
  );
  const blocked = composerSendBlocked(preview.resolution);
  const blockReason = composerBlockReason(preview.resolution);
  const canSend = !disabled && !submitting && body.trim().length > 0 && !blocked;

  async function handleSend() {
    if (!canSend) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const idempotencyKey = sendIdempotencyKey ?? `msg_${crypto.randomUUID()}`;
    setSendIdempotencyKey(idempotencyKey);
    const commandResult = buildComposerMessageCommand({ body, roster, idempotencyKey });
    if (!commandResult.ok) {
      setError(commandResult.message);
      setSubmitting(false);
      return;
    }

    try {
      const result = await postChannelMessage({
        channelId,
        csrfToken,
        command: commandResult.command,
      });
      const sentBody = commandResult.command.body;
      let taskError: string | null = null;
      if (sendMode === "task" && onCreateTask) {
        const recipientHandle = commandResult.command.recipient_handles[0];
        const assigneeId =
          commandResult.command.routing_mode === "direct"
            ? (roster.find((row) => row.handle === recipientHandle)?.coworker_id ?? null)
            : null;
        try {
          await onCreateTask({ posted: result, body: sentBody, assigneeId });
        } catch (createError) {
          taskError =
            createError instanceof Error ? createError.message : "Unable to create the task.";
        }
      }
      setBody("");
      setSendMode("message");
      setSendIdempotencyKey(null);
      onSent?.(result, sentBody);
      if (taskError) {
        setError(`Message sent, but the task was not created: ${taskError}`);
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <footer className="shrink-0 bg-[#222222] px-5 pb-4 pt-2">
      <div className="mx-auto max-w-[800px] rounded-2xl border border-[#4a4a4a] bg-[#292929] px-3 py-2 shadow-[0_14px_40px_rgba(0,0,0,0.24)] transition focus-within:border-violet-400/70 focus-within:ring-1 focus-within:ring-violet-400/30">
        <div className="space-y-2">
          <label className="sr-only" htmlFor="channel-composer">
            Message
          </label>
          <textarea
            ref={composerRef}
            id="channel-composer"
            className="min-h-[54px] w-full resize-none border-0 bg-transparent px-1 py-1.5 text-sm leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
            placeholder="Write a message… Use @coworker or @team when multiple coworkers are in the channel."
            value={body}
            disabled={disabled || submitting}
            onChange={(event) => {
              setBody(event.target.value);
              // Body edits start a new logical send — never reuse a prior attempt key.
              setSendIdempotencyKey(null);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void handleSend();
              }
            }}
          />

          {!disabled && body.trim().length === 0 && workflowStarters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Workflow starters">
              <span className="mr-1 text-[10px] font-medium text-zinc-500">Start a workflow</span>
              {workflowStarters.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[10px] font-medium text-violet-300 transition hover:border-violet-400/40 hover:bg-violet-400/15"
                  onClick={() => {
                    setBody(starter.prompt);
                    setSendIdempotencyKey(null);
                    window.requestAnimationFrame(() => composerRef.current?.focus());
                  }}
                >
                  {starter.label}
                </button>
              ))}
            </div>
          ) : null}

          {body.trim() ? <RecipientPreview preview={preview} blockReason={blockReason} /> : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
                aria-label="Send mode"
              >
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${sendMode === "message" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                  aria-pressed={sendMode === "message"}
                  onClick={() => setSendMode("message")}
                >
                  Message
                </button>
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${sendMode === "task" ? "bg-violet-500/25 text-violet-200" : "text-zinc-500 hover:text-zinc-300"}`}
                  aria-pressed={sendMode === "task"}
                  onClick={() => setSendMode("task")}
                >
                  Assign as task
                </button>
              </div>
              <p className="hidden text-[10px] text-zinc-600 xl:block">
                {sendMode === "task" ? "Creates a linked TaskRecord" : "⌘/Ctrl + Enter"}
              </p>
            </div>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full bg-violet-500 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-zinc-600"
              aria-label={sendMode === "task" ? "Send and create task" : "Send"}
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              <span aria-hidden="true">{submitting ? "…" : "↑"}</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

function RecipientPreview({
  preview,
  blockReason,
}: {
  preview: ReturnType<typeof previewComposerRecipients>;
  blockReason: string | null;
}) {
  if (blockReason) {
    return (
      <div
        className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
        role="alert"
      >
        {blockReason}
      </div>
    );
  }

  if (preview.recipients.length === 0) {
    return null;
  }

  const routingMode = preview.resolution.ok ? preview.resolution.routing_mode : "direct";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">
      <div className="font-medium text-zinc-200">
        Recipients ({routingMode === "team" ? "team fan-out" : "direct"})
      </div>
      <ul className="mt-2 space-y-1">
        {preview.recipients.map((recipient) => (
          <li key={recipient.handle}>
            <span className="font-medium text-zinc-200">{recipient.name}</span>
            <span className="text-zinc-500"> @{recipient.handle}</span>
            <span className="text-zinc-500"> · {recipient.toolsSummary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
