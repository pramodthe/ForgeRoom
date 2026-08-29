import type { UiInstanceReplayResponse } from "@forgeroom/contracts";

type UiInstanceStatus = UiInstanceReplayResponse["status"];
import { CONTROLLED_SURFACE_CLASS } from "./theme";

type InstanceStateProps = {
  title: string;
  detail: string;
  textAlternative?: string;
};

function StateCard({ title, detail, textAlternative }: InstanceStateProps) {
  return (
    <div className={`${CONTROLLED_SURFACE_CLASS} p-4`} role="status">
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-600">{detail}</p>
      {textAlternative ? (
        <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
          {textAlternative}
        </p>
      ) : null}
    </div>
  );
}

export function PreparingControlledState({ textAlternative }: { textAlternative?: string }) {
  return (
    <StateCard
      title="Preparing component"
      detail="Validated props are loading. The transcript remains available below."
      textAlternative={textAlternative}
    />
  );
}

export function InertControlledState({
  reason,
  textAlternative,
}: {
  reason: string;
  textAlternative: string;
}) {
  return (
    <StateCard title="Component unavailable" detail={reason} textAlternative={textAlternative} />
  );
}

export function ControlledStatusFallback({
  status,
  textAlternative,
}: {
  status: UiInstanceStatus;
  textAlternative: string;
}) {
  const labels: Record<UiInstanceStatus, { title: string; detail: string }> = {
    building: { title: "Building", detail: "The component is still being prepared." },
    ready: { title: "Ready", detail: "Waiting for render data." },
    degraded: { title: "Degraded", detail: "Showing the last known-safe representation." },
    failed: { title: "Render failed", detail: "This surface could not be rendered safely." },
    revoked: { title: "Revoked", detail: "Grants for this component were revoked." },
    closed: { title: "Closed", detail: "This interactive surface has closed." },
  };
  const copy = labels[status];
  return <StateCard title={copy.title} detail={copy.detail} textAlternative={textAlternative} />;
}
