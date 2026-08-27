import { useState } from "react";
import { isFixtureMode } from "../api/mode";
import { Avatar } from "../ui/avatar";
import { RunDetailDrawer } from "./run-detail-drawer";

const TABS = ["Work", "Artifacts", "Context"] as const;
type WorkTab = (typeof TABS)[number];

export function WorkPanelPane(props: {
  workspaceId: string;
  channelId: string;
  channelName: string;
}) {
  const [activeTab, setActiveTab] = useState<WorkTab>("Work");
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);

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
        {isFixtureMode && props.channelId === "ch_general_001" ? (
          <>
            {activeTab === "Work" ? <FixtureWork onOpenRun={() => setRunDrawerOpen(true)} /> : null}
            {activeTab === "Artifacts" ? <FixtureArtifacts /> : null}
            {activeTab === "Context" ? <FixtureContext channelName={props.channelName} /> : null}
          </>
        ) : (
          <EmptyPanel tab={activeTab} />
        )}
      </div>
      {runDrawerOpen ? (
        <RunDetailDrawer workspaceId={props.workspaceId} onClose={() => setRunDrawerOpen(false)} />
      ) : null}
    </aside>
  );
}

function FixtureWork({ onOpenRun }: { onOpenRun: () => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Counter value="1" label="Running" tone="text-violet-700" />
        <Counter value="1" label="Needs you" tone="text-amber-700" />
        <Counter value="0" label="Queued" tone="text-zinc-700" />
      </div>
      <button
        type="button"
        onClick={onOpenRun}
        className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100"
      >
        Open complete Run details
      </button>
      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Avatar name="Analyst" tone="violet" size="sm" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-zinc-900">Analyst</div>
            <div className="text-[11px] text-emerald-700">Completed</div>
          </div>
          <span className="text-[11px] text-zinc-400">18s</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-600">
          Reviewed support conversations and published an insight chart.
        </p>
      </section>
      <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <Avatar name="Operator" tone="blue" size="sm" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-zinc-900">Operator</div>
            <div className="text-[11px] font-medium text-amber-700">Waiting for approval</div>
          </div>
          <span className="h-2 w-2 rounded-full bg-amber-500" />
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-600">
          Publish updated billing support macro.
        </p>
        <button
          type="button"
          className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs font-medium text-amber-900"
        >
          Review request
        </button>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Linked task
          </span>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
            In progress
          </span>
        </div>
        <h3 className="mt-2 text-sm font-medium text-zinc-900">Reduce billing escalations</h3>
        <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500">
          <span>Revision 2</span>
          <button type="button" className="font-medium text-violet-700">
            Open
          </button>
        </div>
      </section>
    </div>
  );
}

function Counter({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2 text-center shadow-sm">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
    </div>
  );
}

function FixtureArtifacts() {
  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-zinc-500">2 artifacts from this run</p>
      <Artifact
        title="Support operations brief"
        meta="PDF · 842 KB · rev 2"
        tone="bg-violet-100 text-violet-700"
      />
      <Artifact
        title="Escalation analysis"
        meta="CSV · 428 rows · rev 3"
        tone="bg-emerald-100 text-emerald-700"
      />
    </div>
  );
}

function Artifact({ title, meta, tone }: { title: string; meta: string; tone: string }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className={`flex h-28 items-center justify-center rounded-lg ${tone}`}>
        <span className="text-2xl font-semibold">{title.endsWith("brief") ? "PDF" : "CSV"}</span>
      </div>
      <h3 className="mt-3 font-medium text-zinc-900">{title}</h3>
      <p className="mt-0.5 text-[11px] text-zinc-500">{meta}</p>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-zinc-500">Created by Analyst</span>
        <button type="button" className="font-medium text-violet-700">
          Open
        </button>
      </div>
    </section>
  );
}

function FixtureContext({ channelName }: { channelName: string }) {
  const [pins, setPins] = useState([
    { id: "message-goals", label: "Q3 support operating goals", kind: "Message" },
    { id: "artifact-taxonomy", label: "Support taxonomy v4", kind: "Artifact" },
  ]);
  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Channel summary
        </h3>
        <p className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-600">
          {channelName} coordinates weekly operating reviews and turns findings into approved action
          plans.
        </p>
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Pinned context
          </h3>
          <span className="text-[11px] text-zinc-400">{pins.length} items</span>
        </div>
        <div className="mt-2 space-y-2">
          {pins.map((pin) => (
            <ContextPin
              key={pin.id}
              label={pin.label}
              kind={pin.kind}
              onUnpin={() => setPins((current) => current.filter((item) => item.id !== pin.id))}
            />
          ))}
          {pins.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-center text-xs text-zinc-500">
              No pinned context. Pin a sourced message or artifact from the channel.
            </p>
          ) : null}
        </div>
      </section>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
        Only sourced channel context is shown here. ForgeRoom does not expose hidden agent memory in
        P0.
      </div>
    </div>
  );
}

function ContextPin({
  label,
  kind,
  onUnpin,
}: {
  label: string;
  kind: string;
  onUnpin: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{kind}</div>
      <div className="mt-1 text-xs font-medium text-zinc-800">{label}</div>
      <button
        type="button"
        onClick={onUnpin}
        className="mt-2 text-[11px] font-medium text-zinc-500 hover:text-red-700"
      >
        Unpin
      </button>
    </div>
  );
}

function EmptyPanel({ tab }: { tab: WorkTab }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
      <p className="font-medium text-zinc-800">No {tab.toLowerCase()} yet</p>
      <p className="mt-1 text-xs text-zinc-500">
        This panel will update as coworkers make progress.
      </p>
    </div>
  );
}
