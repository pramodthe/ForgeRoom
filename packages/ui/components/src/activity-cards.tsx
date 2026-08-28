import type { ForgeRoomActivityContent } from "@forgeroom/contracts";
import type { RunActivityCounters, RunLifecycle } from "@forgeroom/contracts";
import { ActivityCardShell } from "./activity-card-shell";
import {
  activityIconForEyebrow,
  presentCustomEvent,
  presentForgeRoomActivity,
  presentUnsupportedCapability,
  presentUnknownActivity,
  type ApplicationSourceName,
} from "./activity-presentation";

export type ForgeRoomActivityCardProps = {
  content: ForgeRoomActivityContent;
  ownerLabel?: string;
};

export function ForgeRoomActivityCard({ content, ownerLabel }: ForgeRoomActivityCardProps) {
  const presentation = presentForgeRoomActivity(content);
  return (
    <ActivityCardShell
      icon={activityIconForEyebrow(presentation.eyebrow)}
      eyebrow={presentation.eyebrow}
      title={presentation.title}
      detail={presentation.detail}
      status={presentation.status}
      tone={presentation.tone}
      ownerLabel={ownerLabel}
      inert={presentation.inert}
    />
  );
}

export type InertUnsupportedActivityCardProps = {
  summary?: string;
};

export function InertUnsupportedActivityCard({ summary }: InertUnsupportedActivityCardProps) {
  const presentation = presentUnsupportedCapability(summary);
  return (
    <ActivityCardShell
      icon={activityIconForEyebrow(presentation.eyebrow)}
      eyebrow={presentation.eyebrow}
      title={presentation.title}
      detail={presentation.detail}
      status={presentation.status}
      tone={presentation.tone}
      inert
    />
  );
}

export function InertUnknownActivityCard() {
  const presentation = presentUnknownActivity();
  return (
    <ActivityCardShell
      icon={activityIconForEyebrow(presentation.eyebrow)}
      eyebrow={presentation.eyebrow}
      title={presentation.title}
      detail={presentation.detail}
      status={presentation.status}
      tone={presentation.tone}
      inert
    />
  );
}

export type CustomEventActivityCardProps = {
  name: ApplicationSourceName;
  lifecycle?: RunLifecycle;
  activity?: RunActivityCounters;
  ownerLabel?: string;
};

export function CustomEventActivityCard({
  name,
  lifecycle,
  activity,
  ownerLabel,
}: CustomEventActivityCardProps) {
  const presentation = presentCustomEvent(name, { lifecycle, activity });
  return (
    <ActivityCardShell
      icon={activityIconForEyebrow(presentation.eyebrow)}
      eyebrow={presentation.eyebrow}
      title={presentation.title}
      detail={presentation.detail}
      status={presentation.status}
      tone={presentation.tone}
      ownerLabel={ownerLabel}
      inert={presentation.inert}
    />
  );
}

export function RunCountersFooter({ counters }: { counters: RunActivityCounters }) {
  const chips = [
    ["running", counters.running],
    ["planning", counters.planning],
    ["awaiting input", counters.awaiting_input],
    ["awaiting approval", counters.awaiting_approval],
    ["blocked", counters.blocked_connection],
    ["cancelling", counters.cancelling],
    ["queued", counters.queued],
  ] as const;
  const active = chips.filter(([, count]) => count > 0);
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {active.map(([label, count]) => (
        <span
          key={label}
          className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200"
        >
          {count} {label}
        </span>
      ))}
    </div>
  );
}

export {
  activityIconForEyebrow,
  formatRunActivityCounters,
  presentCustomEvent,
  presentForgeRoomActivity,
  presentUnsupportedCapability,
  presentUnknownActivity,
  type ApplicationSourceName,
} from "./activity-presentation";
export {
  ActivityCardShell,
  type ActivityCardShellProps,
  type ActivityCardTone,
} from "./activity-card-shell";
