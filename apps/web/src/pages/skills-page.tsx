import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { useState } from "react";
import {
  getSkillDraft,
  getSkillVersion,
  listCoworkerDirectory,
  listSkillDrafts,
  listSkillVersions,
  publishSkillDraft,
} from "../api/workspace-api";
import { newIdempotencyKey } from "../api/http-client";
import { useSession } from "../auth/session-context";
import { workspaceSkillDetailPath, workspaceSkillsPath } from "../routes/paths";
import {
  coworkersBoundToSkillVersion,
  formatCapability,
  formatVerifiedAt,
} from "./settings-helpers";

export function SkillsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/skills" });
  const draftsQuery = useQuery({
    queryKey: ["skill-drafts", workspaceId],
    queryFn: () => listSkillDrafts(workspaceId),
  });
  const versionsQuery = useQuery({
    queryKey: ["skill-versions", workspaceId],
    queryFn: () => listSkillVersions(workspaceId),
  });
  const coworkersQuery = useQuery({
    queryKey: ["coworker-directory", workspaceId],
    queryFn: () => listCoworkerDirectory(workspaceId),
  });
  if (draftsQuery.isLoading || versionsQuery.isLoading || coworkersQuery.isLoading)
    return <LoadingState title="Loading skills…" />;
  if (draftsQuery.error || versionsQuery.error || coworkersQuery.error)
    return <RouteErrorState title="Unable to load skills" />;

  const coworkers = coworkersQuery.data ?? [];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-violet-700">Private workspace library</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">Skills</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Reusable, reviewed procedures saved from successful work.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500 shadow-sm">
            Skills are created from completed Runs
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {(versionsQuery.data ?? []).map((skill) => {
            const attached = coworkersBoundToSkillVersion(coworkers, skill.id);
            return (
              <Link
                key={skill.id}
                to={workspaceSkillDetailPath(workspaceId, skill.skill_id)}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Published · v{skill.version}
                  </span>
                  <span className="text-zinc-300">→</span>
                </div>
                <h2 className="mt-4 font-semibold text-zinc-950">{skillTitle(skill)}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  Immutable manifest from Run {skill.source_run_id}.
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {[...skill.required_tools, ...skill.required_components].map((item) => (
                    <span
                      key={item}
                      className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600"
                    >
                      {formatCapability(item)}
                    </span>
                  ))}
                  {skill.required_tools.length + skill.required_components.length === 0 ? (
                    <span className="text-[11px] text-zinc-400">No tool or component grants</span>
                  ) : null}
                </div>
                <div className="mt-4 border-t border-zinc-100 pt-3 text-[11px] text-zinc-500">
                  Source Run {skill.source_run_id}
                  {attached.length > 0
                    ? ` · attached to ${attached.map((coworker) => `@${coworker.handle}`).join(", ")}`
                    : " · not attached to any coworker"}
                </div>
              </Link>
            );
          })}
          {(draftsQuery.data ?? []).map((skill) => (
            <Link
              key={skill.id}
              to={workspaceSkillDetailPath(workspaceId, skill.id)}
              className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Draft · revision {skill.revision}
                </span>
                <span className="text-zinc-300">→</span>
              </div>
              <h2 className="mt-4 font-semibold text-zinc-950">{skill.when_to_use}</h2>
              <p className="mt-1 text-sm leading-6 text-zinc-600">{skill.when_to_use}</p>
              <ol className="mt-4 space-y-2">
                {skill.method.map((step, index) => (
                  <li key={step} className="flex gap-2 text-xs text-zinc-600">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white font-medium text-zinc-500">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-4 border-t border-amber-100 pt-3 text-[11px] text-amber-800">
                Review required before publish and attach · source Run {skill.source_run_id}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export function SkillDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const { workspaceId, skillId } = useParams({ from: "/w/$workspaceId/skills/$skillId" });
  const [publishError, setPublishError] = useState<string | null>(null);
  const draftQuery = useQuery({
    queryKey: ["skill-draft", workspaceId, skillId],
    queryFn: () => getSkillDraft(workspaceId, skillId),
  });
  const versionQuery = useQuery({
    queryKey: ["skill-version", workspaceId, skillId],
    queryFn: () => getSkillVersion(workspaceId, skillId),
  });
  const coworkersQuery = useQuery({
    queryKey: ["coworker-directory", workspaceId],
    queryFn: () => listCoworkerDirectory(workspaceId),
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      const draft = draftQuery.data;
      if (!draft) throw new Error("Draft not found.");
      if (!session) throw new Error("Your session expired. Sign in again.");
      return publishSkillDraft({
        draftId: draft.id,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_revision: draft.revision,
          expected_draft_hash: draft.draft_hash,
          expected_source_content_hash: draft.source_content_hash,
          idempotency_key: newIdempotencyKey("skill_publish"),
        },
      });
    },
    onSuccess: async (version) => {
      setPublishError(null);
      await queryClient.invalidateQueries({ queryKey: ["skill-drafts", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["skill-versions", workspaceId] });
      await navigate({ to: workspaceSkillDetailPath(workspaceId, version.skill_id) });
    },
    onError: (error) => {
      setPublishError(error instanceof Error ? error.message : "Unable to publish skill.");
    },
  });
  if (draftQuery.isLoading || versionQuery.isLoading || coworkersQuery.isLoading)
    return <LoadingState title="Loading skill…" />;
  if (draftQuery.error || versionQuery.error || coworkersQuery.error)
    return <RouteErrorState title="Unable to load skill" />;
  const draft = draftQuery.data;
  const version = versionQuery.data;
  if (!draft && !version)
    return (
      <RouteErrorState
        title="Skill not found"
        action={<Link to={workspaceSkillsPath(workspaceId)}>Back to skills</Link>}
      />
    );
  const steps = draft?.method ?? [];
  const attached =
    version && coworkersQuery.data
      ? coworkersBoundToSkillVersion(coworkersQuery.data, version.id)
      : [];
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
      <div className="mx-auto max-w-5xl px-6 py-7">
        <Link to={workspaceSkillsPath(workspaceId)} className="text-xs font-medium text-zinc-500">
          ← All skills
        </Link>
        <div className="mt-4 grid grid-cols-[1fr_280px] gap-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${draft ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
              >
                {draft ? `Draft · revision ${draft.revision}` : `Published · v${version?.version}`}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950">
              {draft?.when_to_use ?? skillTitle(version!)}
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {draft?.when_to_use ??
                `Immutable private skill version published ${formatVerifiedAt(version?.published_at)}.`}
            </p>
            <div className="mt-6 border-t border-zinc-100 pt-5">
              <h2 className="text-sm font-semibold text-zinc-900">Method</h2>
              <ol className="mt-4 space-y-3">
                {steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-xs font-semibold text-violet-700">
                      {index + 1}
                    </span>
                    <div className="pt-1 text-sm text-zinc-700">{step}</div>
                  </li>
                ))}
                {steps.length === 0 ? (
                  <li className="text-sm text-zinc-500">
                    Method steps are stored in the manifest.
                  </li>
                ) : null}
              </ol>
            </div>
            {draft ? (
              <div className="mt-6 grid grid-cols-2 gap-3">
                <Info title="Validation" body={draft.validation} />
                <Info title="Output" body={draft.output} />
                <Info
                  title="No data"
                  body="Return a sourced no-change summary; never fabricate trends."
                />
                <Info title="Failure behavior" body={draft.failures.join(" · ") || "None listed"} />
              </div>
            ) : null}
          </section>
          <aside className="space-y-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Requirements
              </h2>
              <div className="mt-3 space-y-3">
                <Requirement
                  label="Tools"
                  items={draft?.required_tools ?? version?.required_tools ?? []}
                />
                <Requirement
                  label="Components"
                  items={draft?.required_components ?? version?.required_components ?? []}
                />
                <Requirement
                  label="Approval boundary"
                  items={draft?.required_approvals ?? version?.required_approvals ?? []}
                />
              </div>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Lineage
              </h2>
              <dl className="mt-3 space-y-3 text-xs">
                <div>
                  <dt className="text-zinc-400">Source Run</dt>
                  <dd className="mt-1 font-medium text-zinc-700">
                    {draft?.source_run_id ?? version?.source_run_id}
                  </dd>
                </div>
                {version ? (
                  <div>
                    <dt className="text-zinc-400">Published</dt>
                    <dd className="mt-1 font-medium text-zinc-700">
                      {formatVerifiedAt(version.published_at)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Attachment
              </h2>
              <div className="mt-3 text-xs text-zinc-600">
                {draft ? (
                  <p>Publish the draft before attaching it to a coworker.</p>
                ) : attached.length > 0 ? (
                  <ul className="space-y-2">
                    {attached.map((coworker) => (
                      <li key={coworker.id} className="font-medium text-zinc-700">
                        @{coworker.handle} · {coworker.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Not attached to any coworker yet.</p>
                )}
              </div>
            </section>
            {draft ? (
              <>
                <button
                  type="button"
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                  className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {publishMutation.isPending ? "Publishing…" : "Publish immutable version"}
                </button>
                {publishError ? (
                  <p
                    className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800"
                    role="alert"
                  >
                    {publishError}
                  </p>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <p className="mt-1.5 text-xs leading-5 text-zinc-600">{body}</p>
    </div>
  );
}
function Requirement({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className="rounded-md bg-zinc-100 px-2 py-1 text-[10px] text-zinc-600">
            {formatCapability(item)}
          </span>
        ))}
        {items.length === 0 ? <span className="text-[10px] text-zinc-400">None</span> : null}
      </div>
    </div>
  );
}

function skillTitle(skill: { skill_id: string; source_run_id: string }): string {
  return `Skill ${skill.skill_id} from Run ${skill.source_run_id}`;
}
