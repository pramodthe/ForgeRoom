import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { useState } from "react";
import { getCoworker, listCoworkers } from "../api/workspace-api";
import { workspaceCoworkerDetailPath, workspaceCoworkersPath } from "../routes/paths";
import { Avatar } from "../ui/avatar";

export function CoworkersPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/coworkers" });
  const [builderOpen, setBuilderOpen] = useState(false);
  const coworkersQuery = useQuery({
    queryKey: ["coworkers", workspaceId],
    queryFn: () => listCoworkers(workspaceId),
  });
  if (coworkersQuery.isLoading) return <LoadingState title="Loading coworkers…" />;
  if (coworkersQuery.error) return <RouteErrorState title="Unable to load coworkers" />;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-violet-700">Your AI team</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Coworkers</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Persistent specialists with explicit tools, skills, and permissions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
          >
            + New coworker
          </button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {(coworkersQuery.data ?? []).map((coworker) => {
            const analyst = coworker.handle === "analyst";
            return (
              <Link
                key={coworker.id}
                to={workspaceCoworkerDetailPath(workspaceId, coworker.id)}
                className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={coworker.name} tone={analyst ? "violet" : "blue"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">{coworker.name}</h2>
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-emerald-700">Available</span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      @{coworker.handle} · {coworker.title}
                    </p>
                  </div>
                  <span className="text-zinc-300 group-hover:text-zinc-600">→</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  {analyst
                    ? "Finds patterns across support data and turns evidence into clear visual briefings."
                    : "Turns decisions into governed tasks, artifacts, and approved external actions."}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(analyst
                    ? ["GitHub read", "Support data", "Charts", "Tables"]
                    : ["Intercom", "Sandbox", "Tasks", "Artifacts"]
                  ).map((tool) => (
                    <span
                      key={tool}
                      className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-600"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">
                  <span>
                    {analyst ? "2 channels · 1 private skill" : "2 channels · 2 private skills"}
                  </span>
                  <span>Version {coworker.config_revision}</span>
                </div>
              </Link>
            );
          })}
        </div>
        <section className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-center">
          <h2 className="font-medium text-zinc-900">Build your next specialist conversationally</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-zinc-500">
            Describe the job. ForgeRoom drafts the role and shows every permission for review before
            anything is created.
          </p>
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className="mt-4 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm"
          >
            Open coworker builder
          </button>
        </section>
      </div>
      {builderOpen ? <CoworkerBuilder onClose={() => setBuilderOpen(false)} /> : null}
    </main>
  );
}

function CoworkerBuilder({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<
    "prompt" | "gathering" | "review" | "confirming" | "creating" | "ready"
  >("prompt");
  const [prompt, setPrompt] = useState(
    "Create a customer research coworker that can read support data and GitHub, but cannot modify external systems.",
  );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="builder-title"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
              Trusted coworker builder
            </div>
            <h2 id="builder-title" className="mt-1 text-lg font-semibold text-zinc-950">
              Create a coworker
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-100 text-zinc-500"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          {stage === "prompt" ? (
            <>
              <div className="rounded-2xl bg-zinc-50 p-4">
                <label htmlFor="coworker-job" className="text-xs font-semibold text-zinc-700">
                  What should this coworker own?
                </label>
                <textarea
                  id="coworker-job"
                  rows={5}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="mt-2 w-full resize-none rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-700 outline-none focus:border-violet-400"
                />
                <p className="mt-2 text-[11px] text-zinc-500">
                  Knowledge, memory, workflows, and native child agents are unavailable in P0 and
                  will be called out in review.
                </p>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setStage("gathering");
                    window.setTimeout(() => setStage("review"), 500);
                  }}
                  className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Generate review draft
                </button>
              </div>
            </>
          ) : null}
          {stage === "gathering" ? (
            <BuilderProgress
              title="Gathering the job requirements…"
              detail="Resolving requested tools, denied capabilities, budgets, and data boundaries."
            />
          ) : null}
          {stage === "review" ? (
            <PermissionReview
              onBack={() => setStage("prompt")}
              onCreate={() => {
                setStage("confirming");
                window.setTimeout(() => {
                  setStage("creating");
                  window.setTimeout(() => setStage("ready"), 700);
                }, 350);
              }}
            />
          ) : null}
          {stage === "confirming" ? (
            <BuilderProgress
              title="Confirming draft revision 1…"
              detail="Binding the exact reviewed hash before any profile is created."
            />
          ) : null}
          {stage === "creating" ? (
            <BuilderProgress
              title="Provisioning Researcher…"
              detail="Creating the immutable profile and its General channel session."
            />
          ) : null}
          {stage === "ready" ? (
            <div className="py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-xl text-emerald-700">
                ✓
              </span>
              <h3 className="mt-4 text-lg font-semibold text-zinc-950">Researcher is ready</h3>
              <p className="mt-1 text-sm text-zinc-500">Added to General with read-only tools.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Done
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BuilderProgress({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="py-16 text-center" aria-live="polite" aria-busy="true">
      <span className="mx-auto block h-10 w-10 animate-pulse rounded-2xl bg-violet-100" />
      <h3 className="mt-4 font-semibold text-zinc-900">{title}</h3>
      <p className="mt-1 text-sm text-zinc-500">{detail}</p>
    </div>
  );
}

function PermissionReview({ onBack, onCreate }: { onBack: () => void; onCreate: () => void }) {
  return (
    <div>
      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
        <div className="flex items-start gap-3">
          <Avatar name="Researcher" tone="violet" />
          <div>
            <h3 className="font-semibold text-zinc-950">Researcher</h3>
            <p className="text-xs text-zinc-500">
              Customer research specialist · default model preset
            </p>
            <p className="mt-2 text-sm leading-5 text-zinc-600">
              Analyze support and GitHub evidence, identify customer patterns, and prepare sourced
              briefings.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <ReviewGroup
          title="Access"
          items={[
            "Channel: General only",
            "Acting account: Workspace service account",
            "SUPPORT_SEARCH · read",
            "GITHUB_GET_ISSUES · read",
          ]}
        />
        <ReviewGroup
          title="Capabilities"
          items={[
            "Components: DataTable, BarOrLineChart",
            "Private skill: Support insight brief",
            "TaskRecord: read/create; update own",
            "Sandbox disabled · 20 calls · 12k tokens",
          ]}
        />
        <ReviewGroup
          title="Approval policy"
          items={[
            "No external writes",
            "No destructive tools",
            "Data export requires approval",
            "Read provider data may leave workspace",
          ]}
        />
        <ReviewGroup
          title="Unavailable in P0"
          items={[
            "Knowledge library",
            "Long-term memory",
            "Scheduled workflows",
            "Native subagents",
          ]}
          denied
        />
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        <strong>Data boundary:</strong> support text may be sent to the selected model provider.
        Credentials and raw provider payloads are never included.
      </div>
      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm font-medium text-zinc-500">
          ← Edit request
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Create Researcher · draft revision 1
        </button>
      </div>
    </div>
  );
}

function ReviewGroup({
  title,
  items,
  denied = false,
}: {
  title: string;
  items: string[];
  denied?: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-xs text-zinc-700">
            <span className={denied ? "text-red-500" : "text-emerald-600"}>
              {denied ? "×" : "✓"}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CoworkerDetailPage() {
  const { workspaceId, coworkerId } = useParams({ from: "/w/$workspaceId/coworkers/$coworkerId" });
  const [saved, setSaved] = useState(false);
  const coworkerQuery = useQuery({
    queryKey: ["coworker", workspaceId, coworkerId],
    queryFn: () => getCoworker(workspaceId, coworkerId),
  });
  if (coworkerQuery.isLoading) return <LoadingState title="Loading coworker…" />;
  const coworker = coworkerQuery.data;
  if (!coworker)
    return (
      <RouteErrorState
        title="Coworker not found"
        action={<Link to={workspaceCoworkersPath(workspaceId)}>Back to coworkers</Link>}
      />
    );
  const analyst = coworker.handle === "analyst";
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-5xl px-6 py-7">
        <Link
          to={workspaceCoworkersPath(workspaceId)}
          className="text-xs font-medium text-zinc-500"
        >
          ← All coworkers
        </Link>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={coworker.name} tone={analyst ? "violet" : "blue"} />
            <div>
              <h1 className="text-xl font-semibold text-zinc-950">{coworker.name}</h1>
              <p className="text-xs text-zinc-500">
                @{coworker.handle} · <span className="text-emerald-700">Available</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600"
            >
              Disable
            </button>
            <button
              type="button"
              onClick={() => {
                setSaved(true);
                window.setTimeout(() => setSaved(false), 2500);
              }}
              className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
            >
              Save changes
            </button>
          </div>
        </div>
        {saved ? (
          <div
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            role="status"
          >
            Changes saved. Active channel sessions will rotate; pending proposals may become stale.
          </div>
        ) : null}
        <div className="mt-5 grid grid-cols-[1fr_280px] gap-4">
          <section className="space-y-4">
            <EditorSection title="Identity & instructions">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" value={coworker.name} />
                <Field label="Handle" value={coworker.handle} />
              </div>
              <label className="mt-3 block text-xs text-zinc-500">
                Standing instructions
                <textarea
                  defaultValue={
                    analyst
                      ? "Find evidence, cite sources, and summarize uncertainty. Never modify external systems."
                      : "Turn approved decisions into explicit tasks and artifacts. Ask before any external write."
                  }
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm leading-6 text-zinc-700"
                />
              </label>
            </EditorSection>
            <EditorSection title="Exact tool grants">
              <div className="flex flex-wrap gap-2">
                {(analyst
                  ? ["GITHUB_GET_ISSUES", "SUPPORT_SEARCH", "DATATABLE_RENDER", "CHART_RENDER"]
                  : ["INTERCOM_UPDATE_MACRO", "SANDBOX_RUN", "TASK_WRITE", "ARTIFACT_PUBLISH"]
                ).map((tool) => (
                  <span
                    key={tool}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700"
                  >
                    ✓ {tool}
                  </span>
                ))}
              </div>
            </EditorSection>
            <EditorSection title="Skills & controlled components">
              <div className="grid grid-cols-2 gap-3">
                <GrantList
                  title="Private skills"
                  items={
                    analyst
                      ? ["Support insight brief"]
                      : ["Support operations plan", "Publish approved macro"]
                  }
                />
                <GrantList
                  title="Components"
                  items={
                    analyst
                      ? ["DataTable", "BarOrLineChart"]
                      : ["TaskCard", "ArtifactCard", "ChoiceForm"]
                  }
                />
              </div>
            </EditorSection>
          </section>
          <aside className="space-y-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Runtime
              </h2>
              <dl className="mt-4 space-y-3 text-xs">
                <SideDetail label="Model preset" value="Default balanced" />
                <SideDetail label="Turn budget" value="12k tokens" />
                <SideDetail label="Tool limit" value="20 calls" />
                <SideDetail label="Sandbox" value={analyst ? "Disabled" : "Enabled"} />
                <SideDetail label="GenUI" value="Controlled only" />
                <SideDetail label="Native subagents" value="Unavailable in P0" />
              </dl>
            </section>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              <strong>Capability changes rotate sessions.</strong> Current work completes, but
              pending proposals can become stale.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        defaultValue={value}
        className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-800"
      />
    </label>
  );
}
function GrantList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item} className="text-xs font-medium text-zinc-700">
            ✓ {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
function SideDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right font-medium text-zinc-700">{value}</dd>
    </div>
  );
}
