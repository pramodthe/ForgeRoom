import { AgUiActivitySlot, ControlledComponentSlot } from "@forgeroom/ui-components";
import type { Channel } from "@forgeroom/contracts";

type ChannelTimelinePaneProps = {
  channel: Channel;
};

export function ChannelTimelinePane({ channel }: ChannelTimelinePaneProps) {
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-white">
      <header className="border-b border-zinc-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-zinc-900">{channel.name}</h1>
        <p className="mt-1 text-sm text-zinc-600">{channel.mission_brief}</p>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <AgUiActivitySlot slotId={`${channel.id}-activity-seed`} />
        <ControlledComponentSlot slotId={`${channel.id}-component-seed`} />
        <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
          Timeline cards and structured work items will render here in later P0 tasks.
        </div>
      </div>
      <footer className="border-t border-zinc-200 p-4">
        <div
          className="rounded border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
          aria-label="Composer placeholder"
        >
          Composer placeholder — recipient preview and send controls arrive in P0-402.
        </div>
      </footer>
    </section>
  );
}
