import type { Channel } from "@forgeroom/contracts";

export function LiveContextTab(props: { channel: Channel }) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Channel summary
        </h3>
        <p className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-600">
          {props.channel.mission_brief.trim() || `${props.channel.name} has no mission brief yet.`}
        </p>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Pinned context
          </h3>
          <span className="text-[11px] text-zinc-400">0 items</span>
        </div>
        <p className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-500">
          No pinned context yet. Pin a sourced message or artifact from the channel when that action
          is available.
        </p>
      </section>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
        Only sourced channel context is shown here. ForgeRoom does not expose hidden agent memory in
        P0.
      </div>
    </div>
  );
}
