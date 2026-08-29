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
  onSent?: (result: PostedChannelMessage, body: string) => void;
};

export function ChannelComposer({
  channelId,
  roster,
  csrfToken,
  disabled = false,
  onSent,
}: ChannelComposerProps) {
  const [body, setBody] = useState("");
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
      setBody("");
      setSendIdempotencyKey(null);
      onSent?.(result, sentBody);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <footer className="border-t border-zinc-200 bg-white px-4 py-3">
      <div className="space-y-2">
        <label className="sr-only" htmlFor="channel-composer">
          Message
        </label>
        <textarea
          ref={composerRef}
          id="channel-composer"
          className="min-h-[58px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
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
            <span className="mr-1 text-[11px] font-medium text-zinc-500">Start a workflow</span>
            {workflowStarters.map((starter) => (
              <button
                key={starter.label}
                type="button"
                className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
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
          <p className="text-[11px] text-zinc-400">Use @coworker or @team · ⌘/Ctrl + Enter</p>
          <button
            type="button"
            className="rounded-lg bg-zinc-950 px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            {submitting ? "Sending…" : "Send"}
          </button>
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
        className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
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
    <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
      <div className="font-medium text-zinc-900">
        Recipients ({routingMode === "team" ? "team fan-out" : "direct"})
      </div>
      <ul className="mt-2 space-y-1">
        {preview.recipients.map((recipient) => (
          <li key={recipient.handle}>
            <span className="font-medium text-zinc-900">{recipient.name}</span>
            <span className="text-zinc-500"> @{recipient.handle}</span>
            <span className="text-zinc-500"> · {recipient.toolsSummary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
