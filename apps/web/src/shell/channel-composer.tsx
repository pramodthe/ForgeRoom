import { useMemo, useState } from "react";
import type { ChannelRosterCoworker } from "@forgeroom/contracts";
import { postChannelMessage } from "../api/workspace-api";
import {
  buildComposerMessageCommand,
  composerBlockReason,
  composerSendBlocked,
  previewComposerRecipients,
} from "./composer-routing";

type ChannelComposerProps = {
  channelId: string;
  roster: readonly ChannelRosterCoworker[];
  csrfToken: string;
  disabled?: boolean;
  onSent?: (messageId: string) => void;
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
      setBody("");
      setSendIdempotencyKey(null);
      onSent?.(result.message_id);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <footer className="border-t border-zinc-200 p-4">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-zinc-700" htmlFor="channel-composer">
          Message
        </label>
        <textarea
          id="channel-composer"
          className="min-h-[88px] w-full resize-y rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none"
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

        <RecipientPreview preview={preview} blockReason={blockReason} />

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            ⌘/Ctrl + Enter to send. File attachments are not supported in P0.
          </p>
          <button
            type="button"
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
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
