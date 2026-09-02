import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel, ChannelPin } from "@forgeroom/contracts";
import { listChannelPins, removeChannelPin } from "../../api/workspace-api";
import { useSession } from "../../auth/session-context";

export function LiveContextTab(props: { channel: Channel }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const pinsQuery = useQuery({
    queryKey: ["channel-pins", props.channel.id],
    queryFn: () => listChannelPins(props.channel.id),
  });

  const unpinMutation = useMutation({
    mutationFn: async (pinId: string) => {
      if (!session) throw new Error("Session required.");
      return removeChannelPin({
        channelId: props.channel.id,
        pinId,
        csrfToken: session.csrf_token,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["channel-pins", props.channel.id] });
    },
  });

  const pins = pinsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Channel summary
        </h3>
        <p className="mt-2 rounded-xl border border-white/10 bg-[#292929] p-3 text-xs leading-5 text-zinc-400">
          {props.channel.mission_brief.trim() || `${props.channel.name} has no mission brief yet.`}
        </p>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Pinned context
          </h3>
          <span className="text-[11px] text-zinc-400">{pins.length} items</span>
        </div>
        {pinsQuery.isLoading ? (
          <p className="mt-2 rounded-xl border border-white/10 bg-[#292929] p-4 text-center text-xs text-zinc-500">
            Loading pins…
          </p>
        ) : pins.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-center text-xs text-zinc-500">
            No pinned context yet. Pin a sourced message or artifact from the channel when that
            action is available.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {pins.map((pin) => (
              <PinRow
                key={pin.id}
                pin={pin}
                busy={unpinMutation.isPending && unpinMutation.variables === pin.id}
                onUnpin={() => unpinMutation.mutate(pin.id)}
                canUnpin={Boolean(session) && props.channel.status !== "archived"}
              />
            ))}
          </div>
        )}
      </section>
      <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-3 text-xs leading-5 text-blue-200">
        Only sourced channel context is shown here. ForgeRoom does not expose hidden agent memory in
        P0.
      </div>
    </div>
  );
}

function PinRow(props: { pin: ChannelPin; busy: boolean; canUnpin: boolean; onUnpin: () => void }) {
  const sourceLabel = props.pin.source_message_id
    ? `Message ${props.pin.source_message_id.slice(-6)}`
    : props.pin.source_artifact_id
      ? `Artifact ${props.pin.source_artifact_id.slice(-6)}`
      : "Sourced item";

  const scrollToSource = () => {
    if (!props.pin.source_message_id) {
      return;
    }
    document
      .getElementById(`timeline-message-${props.pin.source_message_id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <article className="rounded-xl border border-white/10 bg-[#292929] p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-zinc-100">{props.pin.label}</h4>
          {props.pin.source_message_id ? (
            <button
              type="button"
              onClick={scrollToSource}
              className="mt-1 text-left text-[11px] text-sky-300 hover:underline"
            >
              {sourceLabel} · view in timeline
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-zinc-500">{sourceLabel}</p>
          )}
        </div>
        {props.canUnpin ? (
          <button
            type="button"
            onClick={props.onUnpin}
            disabled={props.busy}
            className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            {props.busy ? "Removing…" : "Unpin"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
