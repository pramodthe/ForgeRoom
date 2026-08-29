import { useState } from "react";
import type { RunDecisionSummary } from "@forgeroom/contracts";
import { useTrustedHitlHost } from "./trusted-hitl-host-context";

export function OpenHitlCardButton(props: { decision: RunDecisionSummary }) {
  const { openExistingCard } = useTrustedHitlHost();
  const [missed, setMissed] = useState(false);

  if (!props.decision.waiting) {
    return null;
  }

  const kind = props.decision.kind === "approval" ? "approval" : "question";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="shrink-0 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
        onClick={() => {
          const opened = openExistingCard({ kind, id: props.decision.id });
          setMissed(!opened);
        }}
      >
        Open card
      </button>
      {missed ? (
        <span className="max-w-[10rem] text-right text-[10px] text-amber-800" role="status">
          Card not visible in timeline.
        </span>
      ) : null}
    </div>
  );
}
