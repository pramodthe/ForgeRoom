import type { ChannelRosterCoworker, ForgeRoomActivityContent } from "@forgeroom/contracts";
import type { ReactNode } from "react";
import { Avatar } from "../ui/avatar";

type ControlledUiContent = Extract<
  ForgeRoomActivityContent,
  { activityType: "forgeroom.controlled_ui.v1" }
>;

export function ControlledUiPrimaryChrome(props: {
  content: ControlledUiContent;
  roster: readonly ChannelRosterCoworker[];
  ownerCoworkerId?: string;
  children: ReactNode;
}) {
  const coworker = props.ownerCoworkerId
    ? props.roster.find((entry) => entry.coworker_id === props.ownerCoworkerId)
    : undefined;
  const ownerName = coworker?.name ?? "Coworker";
  const revisionLabel = [
    props.content.componentVersion,
    props.content.renderRevision !== null ? `render r${props.content.renderRevision}` : null,
    props.content.stateRevision !== null ? `state r${props.content.stateRevision}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="flex justify-start"
      data-primary-response="controlled-ui"
      data-ui-instance-id={props.content.surfaceId}
    >
      <div className="flex max-w-[92%] items-start gap-2.5">
        <Avatar
          name={ownerName}
          tone={coworker?.handle === "analyst" ? "violet" : "blue"}
          size="sm"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="font-medium text-zinc-700">{ownerName}</span>
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                Reviewed component
              </span>
              <span className="text-zinc-400">{props.content.componentName}</span>
            </div>
            <p className="text-sm leading-6 text-zinc-800">{props.content.textAlternative}</p>
            {revisionLabel ? (
              <details className="mt-2 text-[11px] text-zinc-400">
                <summary className="cursor-pointer select-none hover:text-zinc-600">
                  Replay details
                </summary>
                <p className="mt-1 font-mono">{revisionLabel}</p>
                <p className="mt-0.5 font-mono">surface {props.content.surfaceId}</p>
              </details>
            ) : null}
          </div>
          {props.children}
        </div>
      </div>
    </article>
  );
}
