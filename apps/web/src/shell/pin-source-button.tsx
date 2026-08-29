import { useChannelPinActions, type PinSourceTarget } from "./use-channel-pin-actions";

type PinSourceButtonProps = {
  channelId: string;
  archived: boolean;
  target: PinSourceTarget;
  compact?: boolean;
};

export function PinSourceButton(props: PinSourceButtonProps) {
  const { canPin, isPinned, pinMutation, pinError } = useChannelPinActions(props.channelId);
  const pinned = isPinned(props.target);
  const disabled = props.archived || !canPin || pinMutation.isPending || Boolean(pinned);

  if (props.archived || !canPin) {
    return null;
  }

  const className = props.compact
    ? "rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60"
    : "rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60";

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={
          pinned
            ? "Already pinned to channel context"
            : props.target.kind === "message"
              ? "Pin message to channel context"
              : "Pin artifact to channel context"
        }
        onClick={() => pinMutation.mutate(props.target)}
      >
        {pinMutation.isPending ? "Pinning…" : pinned ? "Pinned" : "Pin"}
      </button>
      {pinError ? (
        <span className="max-w-[12rem] text-right text-[10px] text-red-700" role="alert">
          {pinError}
        </span>
      ) : null}
    </div>
  );
}
