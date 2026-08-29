import { useId, useState } from "react";
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
  const tabListId = useId();
  const [activeTab, setActiveTab] = useState<WorkTab>("Work");
  const tabPanelIds: Record<WorkTab, string> = {
    Work: `${tabListId}-work`,
    Artifacts: `${tabListId}-artifacts`,
    Context: `${tabListId}-context`,
  };
  const workroomUi = useChannelWorkroomUi();
  const rosterQuery = useQuery({
    queryKey: ["channel-roster", props.channelId],
    queryFn: () => listChannelRoster(props.workspaceId, props.channelId),
  });

  const showFixture = isFixtureMode && props.channelId === "ch_general_001";

  return (
    <aside className="hidden h-full w-[304px] shrink-0 flex-col border-l border-[#343434] bg-[#202020] xl:flex">
      <div className="flex h-14 items-center border-b border-[#343434] px-3">
        <div
          className="flex w-full gap-1 rounded-xl bg-[#292929] p-1"
          role="tablist"
          aria-label="Work panel"
          id={tabListId}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`${tabListId}-${tab.toLowerCase()}`}
              aria-controls={tabPanelIds[tab]}
              aria-selected={activeTab === tab}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                activeTab === tab
                  ? "bg-[#3a3a3a] font-medium text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:bg-[#323232] hover:text-zinc-300"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div
        className="flex-1 overflow-y-auto bg-[#202020] p-3 text-sm text-zinc-400"
        role="tabpanel"
        id={tabPanelIds[activeTab]}
        aria-labelledby={`${tabListId}-${activeTab.toLowerCase()}`}
      >
        {showFixture && activeTab === "Work" ? (
          <FixtureWorkPanel onOpenDemoReceipt={() => workroomUi.openRunDrawer("run_4A91")} />
        ) : activeTab === "Work" ? (
          <LiveWorkTab
            workspaceId={props.workspaceId}
            channelId={props.channelId}
            roster={rosterQuery.data?.coworkers ?? []}
            runs={workroomUi.runs}
            archived={props.channel.status === "archived"}
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

function FixtureWorkPanel({ onOpenDemoReceipt }: { onOpenDemoReceipt: () => void }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#292929] shadow-sm">
        <div className="border-b border-white/5 bg-violet-500/10 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Review ready
          </span>
          <p className="mt-1 font-medium text-zinc-100">Support operations review</p>
        </div>
        <div className="px-4 py-3">
          <p className="mt-1 text-xs text-zinc-500">
            Analyst and Operator completed a coordinated review. Inspect the receipt to see the
            governed work trail and reusable skill controls.
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
            onClick={onOpenDemoReceipt}
          >
            Inspect run receipt
          </button>
        </div>
      </div>
    </div>
  );
}
