import { useState } from "react";
import type { Channel } from "@forgeroom/contracts";
import { useQuery } from "@tanstack/react-query";
import { isFixtureMode } from "../api/mode";
import { listChannelRoster } from "../api/workspace-api";
import { RunDetailDrawer } from "./run-detail-drawer";
import { useChannelWorkroomUi } from "./channel-workroom-ui-context";
import { LiveArtifactsTab } from "./work-panel/live-artifacts-tab";
import { LiveContextTab } from "./work-panel/live-context-tab";
import { LiveWorkTab } from "./work-panel/live-work-tab";

const TABS = ["Work", "Artifacts", "Context"] as const;
type WorkTab = (typeof TABS)[number];

export function WorkPanelPane(props: { workspaceId: string; channelId: string; channel: Channel }) {
  const [activeTab, setActiveTab] = useState<WorkTab>("Work");
  const workroomUi = useChannelWorkroomUi();
  const rosterQuery = useQuery({
    queryKey: ["channel-roster", props.channelId],
    queryFn: () => listChannelRoster(props.workspaceId, props.channelId),
  });

  const showFixture = isFixtureMode && props.channelId === "ch_general_001";

  return (
    <aside className="hidden h-full w-80 shrink-0 flex-col border-l border-zinc-200 bg-white xl:flex">
      <div className="border-b border-zinc-200 px-3 py-3">
        <div className="flex gap-1" role="tablist" aria-label="Work panel">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                activeTab === tab
                  ? "bg-white font-medium text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:bg-white/70"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-zinc-50/60 p-3 text-sm text-zinc-600">
        {showFixture ? (
          <EmptyPanel
            tab={activeTab}
            detail="Fixture demo content remains in prototype mode only."
          />
        ) : activeTab === "Work" ? (
          <LiveWorkTab
            workspaceId={props.workspaceId}
            channelId={props.channelId}
            roster={rosterQuery.data?.coworkers ?? []}
            runs={workroomUi.runs}
            onOpenRun={workroomUi.openRunDrawer}
          />
        ) : activeTab === "Artifacts" ? (
          <LiveArtifactsTab
            channelId={props.channelId}
            runId={workroomUi.selectedRunId}
            archived={props.channel.status === "archived"}
          />
        ) : (
          <LiveContextTab channel={props.channel} />
        )}
      </div>
      {workroomUi.selectedRunId ? (
        <RunDetailDrawer
          workspaceId={props.workspaceId}
          channelId={props.channelId}
          runId={workroomUi.selectedRunId}
          archived={props.channel.status === "archived"}
          onClose={workroomUi.closeRunDrawer}
        />
      ) : null}
    </aside>
  );
}

function EmptyPanel({ tab, detail }: { tab: WorkTab; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
      <p className="font-medium text-zinc-800">No {tab.toLowerCase()} yet</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
