import { useState } from "react";

const TABS = ["Work", "Artifacts", "Context"] as const;
type WorkTab = (typeof TABS)[number];

export function WorkPanelPane() {
  const [activeTab, setActiveTab] = useState<WorkTab>("Work");

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50">
      <div className="border-b border-zinc-200 px-3 py-2">
        <div className="flex gap-1" role="tablist" aria-label="Work panel">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`rounded px-2 py-1 text-xs ${
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
      <div className="flex-1 overflow-y-auto p-3 text-sm text-zinc-600">
        {activeTab === "Work" ? (
          <p>Current assignment, pending decisions, and run summaries will appear here.</p>
        ) : null}
        {activeTab === "Artifacts" ? (
          <p>Artifact revisions and previews will appear here.</p>
        ) : null}
        {activeTab === "Context" ? (
          <p>Channel context envelope and pinned references will appear here.</p>
        ) : null}
      </div>
    </aside>
  );
}
