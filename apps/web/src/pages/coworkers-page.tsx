import { Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CoworkerDraft } from "@forgeroom/contracts";
import { LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import { useEffect, useRef, useState } from "react";
import {
  confirmCoworkerDraft,
  createCoworkerDraft,
  createFixtureResearcher,
  disableCoworker,
  getCoworker,
  getCoworkerDraft,
  listCoworkerDirectory,
  reviseCoworkerDraft,
  updateCoworker,
  type CoworkerDetail,
} from "../api/workspace-api";
import { ApiError, newIdempotencyKey } from "../api/http-client";
import { isFixtureMode } from "../api/mode";
import { useSession } from "../auth/session-context";
import { workspaceCoworkerDetailPath, workspaceCoworkersPath } from "../routes/paths";
import { Avatar } from "../ui/avatar";
import { useDialogFocus } from "../ui/use-dialog-focus";
import {
  buildFixtureCoworkerDraft,
  clearCoworkerDraftReview,
  formatTaskRecordGrant,
  friendlyApiError,
  parseCoworkerDraftFromError,
  persistCoworkerDraftReview,
  readCoworkerDraftReview,
} from "./review-flow-helpers";
import { approvalPolicyLines, summarizeCoworkerGrants } from "./settings-helpers";

export function CoworkersPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/coworkers" });
  const queryClient = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const coworkersQuery = useQuery({
    queryKey: ["coworker-directory", workspaceId],
    queryFn: () => listCoworkerDirectory(workspaceId),
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
            const researcher = coworker.handle === "researcher";
            const readOnlySpecialist = analyst || researcher;
            const grants = summarizeCoworkerGrants(coworker);
            const toolLabels = isFixtureMode
              ? readOnlySpecialist
                ? ["GitHub read", "Support data", "Charts", "Tables"]
                : ["Intercom", "Sandbox", "Tasks", "Artifacts"]
              : grants.tools.map((tool) => tool.replaceAll("_", " "));
            return (
              <Link
                key={coworker.id}
                to={workspaceCoworkerDetailPath(workspaceId, coworker.id)}
                className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={coworker.name} tone={readOnlySpecialist ? "violet" : "blue"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-zinc-950">{coworker.name}</h2>
                      <span
                        className={`h-2 w-2 rounded-full ${coworker.status === "active" ? "bg-emerald-500" : "bg-zinc-400"}`}
                      />
                      <span
                        className={`text-[10px] ${coworker.status === "active" ? "text-emerald-700" : "text-zinc-500"}`}
                      >
                        {coworker.status === "active" ? "Available" : "Disabled"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      @{coworker.handle} · {coworker.title}
                    </p>
                  </div>
                  <span className="text-zinc-300 group-hover:text-zinc-600">→</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  {isFixtureMode
                    ? analyst
                      ? "Finds patterns across support data and turns evidence into clear visual briefings."
                      : researcher
                        ? "Researches support and GitHub evidence with read-only tools and sourced briefings."
                        : "Turns decisions into governed tasks, artifacts, and approved external actions."
                    : coworker.config.standing_instructions}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {toolLabels.map((tool) => (
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
                    {isFixtureMode
                      ? researcher
                        ? "1 channel · 1 private skill"
                        : analyst
                          ? "2 channels · 1 private skill"
                          : "2 channels · 2 private skills"
                      : `${grants.channels} channel${grants.channels === 1 ? "" : "s"} · ${grants.skills} private skill${grants.skills === 1 ? "" : "s"}`}
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
      {builderOpen ? (
        <CoworkerBuilder
          workspaceId={workspaceId}
          onClose={() => setBuilderOpen(false)}
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["coworker-directory", workspaceId] })
          }
        />
      ) : null}
    </main>
  );
}

function CoworkerBuilder({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => Promise<unknown>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onClose);
  const { session } = useSession();
  const [stage, setStage] = useState<
    "prompt" | "gathering" | "review" | "revising" | "confirming" | "creating" | "ready" | "failed"
  >("prompt");
  const [prompt, setPrompt] = useState(
    "Create a Research coworker that can read GitHub and web data but cannot modify anything.",
  );
  const [draft, setDraft] = useState<CoworkerDraft | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isFixtureMode || !session) return;
    const draftId = readCoworkerDraftReview(workspaceId);
    if (!draftId) return;
    void getCoworkerDraft({ draftId })
      .then((restored) => {
        setDraft(restored);
        setStage("review");
      })
      .catch(() => {
        clearCoworkerDraftReview(workspaceId);
      });
  }, [session, workspaceId]);

  async function generateDraft() {
    setCreationError(null);
    setStaleNotice(null);
    setStage("gathering");
    try {
      if (isFixtureMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const fixtureDraft = buildFixtureCoworkerDraft(workspaceId, prompt);
        setDraft(fixtureDraft);
        setStage("review");
        return;
      }
      if (!session) {
        throw new Error("Your session expired. Sign in again.");
      }
      const created = await createCoworkerDraft({
        workspaceId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          request: prompt,
          idempotency_key: newIdempotencyKey("coworker_draft"),
        },
      });
      setDraft(created);
      persistCoworkerDraftReview(workspaceId, created.id);
      setStage("review");
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : "Unable to create draft.");
      setStage("prompt");
    }
  }

  async function confirmDraft() {
    setCreationError(null);
    setStaleNotice(null);
    setStage("confirming");
    try {
      if (isFixtureMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        setStage("creating");
        await createFixtureResearcher(workspaceId);
        await onCreated();
        clearCoworkerDraftReview(workspaceId);
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        setStage("ready");
        return;
      }
      if (!session || !draft) {
        throw new Error("Your session expired. Sign in again.");
      }
      const result = await confirmCoworkerDraft({
        draftId: draft.id,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          draft_revision: draft.revision,
          draft_hash: draft.draft_hash,
          policy_revision: draft.policy_revision,
          catalog_revision: draft.catalog_revision,
          idempotency_key: newIdempotencyKey("coworker_confirm"),
        },
      });
      setDraft(result.draft);
      setStage("creating");
      await onCreated();
      clearCoworkerDraftReview(workspaceId);
      setStage("ready");
    } catch (error) {
      const refreshed = parseCoworkerDraftFromError(error);
      if (refreshed) {
        setDraft(refreshed);
        persistCoworkerDraftReview(workspaceId, refreshed.id);
        setStaleNotice(
          "The draft changed on the server. Review the updated revision before creating.",
        );
        setStage("review");
        return;
      }
      if (error instanceof ApiError && error.code === "coworker_provisioning_failed") {
        setCreationError(friendlyApiError(error));
        setStage("failed");
        return;
      }
      if (error instanceof ApiError && error.code === "expired_proposal") {
        clearCoworkerDraftReview(workspaceId);
        setDraft(null);
        setCreationError(error.message);
        setStage("prompt");
        return;
      }
      setCreationError(friendlyApiError(error));
      setStage("review");
    }
  }

  async function reviseDraft(revisionRequest: string) {
    if (!draft) return;
    setCreationError(null);
    setStaleNotice(null);
    setStage("revising");
    try {
      if (isFixtureMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        const nextDraft = buildFixtureCoworkerDraft(workspaceId, revisionRequest);
        setDraft({ ...nextDraft, revision: draft.revision + 1 });
        setStage("review");
        return;
      }
      if (!session) {
        throw new Error("Your session expired. Sign in again.");
      }
      const revised = await reviseCoworkerDraft({
        draftId: draft.id,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          draft_revision: draft.revision,
          draft_hash: draft.draft_hash,
          revision_request: revisionRequest,
          idempotency_key: newIdempotencyKey("coworker_revise"),
        },
      });
      setDraft(revised);
      persistCoworkerDraftReview(workspaceId, revised.id);
      setStage("review");
    } catch (error) {
      const refreshed = parseCoworkerDraftFromError(error);
      if (refreshed) {
        setDraft(refreshed);
        persistCoworkerDraftReview(workspaceId, refreshed.id);
        setStaleNotice(
          "The draft changed on the server. Review the updated revision before creating.",
        );
        setStage("review");
        return;
      }
      setCreationError(friendlyApiError(error));
      setStage("review");
    }
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="builder-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
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
                  data-autofocus
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
                  onClick={() => void generateDraft()}
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
              draft={draft}
              onBack={() => setStage("prompt")}
              onCreate={() => void confirmDraft()}
              onRevise={(request) => void reviseDraft(request)}
            />
          ) : null}
          {stage === "revising" ? (
            <BuilderProgress
              title="Revising draft…"
              detail="Applying your requested changes to the trusted review draft."
            />
          ) : null}
          {staleNotice ? (
            <p
              className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {staleNotice}
            </p>
          ) : null}
          {creationError ? (
            <p
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {creationError}
            </p>
          ) : null}
          {stage === "confirming" ? (
            <BuilderProgress
              title={`Confirming draft revision ${draft?.revision ?? 1}…`}
              detail="Binding the exact reviewed hash before any profile is created."
            />
          ) : null}
          {stage === "creating" ? (
            <BuilderProgress
              title={`Provisioning ${draft?.proposal.name ?? "coworker"}…`}
              detail="Creating the immutable profile and provisioning channel sessions."
            />
          ) : null}
          {stage === "failed" ? (
            <div className="py-10 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-100 text-xl text-red-700">
                !
              </span>
              <h3 className="mt-4 text-lg font-semibold text-zinc-950">Provisioning failed</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
                {creationError ?? "Session provisioning did not complete."}
              </p>
              <button
                type="button"
                onClick={() => setStage("review")}
                className="mt-5 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700"
              >
                Back to review
              </button>
            </div>
          ) : null}
          {stage === "ready" ? (
            <div className="py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-xl text-emerald-700">
                ✓
              </span>
              <h3 className="mt-4 text-lg font-semibold text-zinc-950">
                {draft?.proposal.name ?? "Researcher"} is ready
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                Added to {draft?.proposal.channel_ids.length ?? 1} channel
                {(draft?.proposal.channel_ids.length ?? 1) === 1 ? "" : "s"} with reviewed grants.
              </p>
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

function PermissionReview({
  draft,
  onBack,
  onCreate,
  onRevise,
}: {
  draft: CoworkerDraft | null;
  onBack: () => void;
  onCreate: () => void;
  onRevise: (revisionRequest: string) => void;
}) {
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionRequest, setRevisionRequest] = useState(
    "Remove any write tools and keep GitHub read access only.",
  );
  const name = draft?.proposal.name ?? "Researcher";
  const title = draft?.proposal.title ?? "Customer research specialist";
  const instructions =
    draft?.proposal.standing_instructions ??
    "Analyze support and GitHub evidence, identify customer patterns, and prepare sourced briefings.";
  const tools = draft?.effective_preview.tools ?? [];
  const denials = draft?.effective_preview.denials ?? [];
  const channels = draft?.proposal.channel_ids ?? [];
  const skills = draft?.proposal.skill_version_ids ?? [];
  const components = draft?.proposal.component_version_ids ?? [];
  const taskGrants = draft?.proposal.task_record_grants ?? [];
  if (!draft) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Generate a review draft before confirming permissions.
      </div>
    );
  }
  return (
    <div>
      <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
        <div className="flex items-start gap-3">
          <Avatar name={name} tone="violet" />
          <div>
            <h3 className="font-semibold text-zinc-950">{name}</h3>
            <p className="text-xs text-zinc-500">
              {title} · {draft?.proposal.model_preset ?? "default model preset"}
            </p>
            <p className="mt-2 text-sm leading-5 text-zinc-600">{instructions}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <ReviewGroup
          title="Access"
          items={[
            draft.effective_preview.account,
            `${channels.length} channel${channels.length === 1 ? "" : "s"}`,
            ...tools.map((tool) => `${tool} · direct`),
          ]}
        />
        <ReviewGroup
          title="Capabilities"
          items={[
            `Sandbox ${draft.effective_preview.sandbox ? "enabled" : "disabled"}`,
            `${draft.proposal.budget.max_tool_calls} calls · ${draft.proposal.budget.max_turn_tokens.toLocaleString()} tokens`,
            `${skills.length} private skill${skills.length === 1 ? "" : "s"}`,
            `${components.length} controlled component${components.length === 1 ? "" : "s"}`,
          ]}
        />
        <ReviewGroup
          title="TaskRecord scope"
          items={
            taskGrants.length > 0
              ? taskGrants.map((grant) => formatTaskRecordGrant(grant))
              : ["No TaskRecord write grants"]
          }
        />
        <ReviewGroup
          title="Approval policy"
          items={[
            "External writes require human approval",
            "Destructive tools remain blocked in P0",
            "Read provider data may leave workspace",
          ]}
        />
        <ReviewGroup title="Unavailable / denied in P0" items={denials.slice(0, 6)} denied />
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        <strong>Data boundary:</strong> support text may be sent to the selected model provider.
        Credentials and raw provider payloads are never included.
      </div>
      <details
        className="mt-4 rounded-xl border border-zinc-200 px-4 py-3"
        open={revisionOpen}
        onToggle={(event) => setRevisionOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-zinc-700">
          Request changes before creating
        </summary>
        <label className="mt-3 block text-xs text-zinc-500">
          What should change in this draft?
          <textarea
            value={revisionRequest}
            onChange={(event) => setRevisionRequest(event.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm text-zinc-700"
          />
        </label>
        <button
          type="button"
          onClick={() => onRevise(revisionRequest.trim())}
          disabled={!revisionRequest.trim()}
          className="mt-3 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 disabled:text-zinc-400"
        >
          Revise draft
        </button>
      </details>
      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-sm font-medium text-zinc-500">
          ← Edit request
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Create {name}
          {draft ? ` · draft revision ${draft.revision}` : ""}
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
  const coworkerQuery = useQuery({
    queryKey: ["coworker", workspaceId, coworkerId],
    queryFn: () => getCoworker(workspaceId, coworkerId),
  });
  if (coworkerQuery.isLoading) return <LoadingState title="Loading coworker…" />;
  if (coworkerQuery.error) return <RouteErrorState title="Unable to load coworker" />;
  const coworker = coworkerQuery.data;
  if (!coworker)
    return (
      <RouteErrorState
        title="Coworker not found"
        action={<Link to={workspaceCoworkersPath(workspaceId)}>Back to coworkers</Link>}
      />
    );
  return (
    <CoworkerEditor key={coworker.config_revision} workspaceId={workspaceId} coworker={coworker} />
  );
}

function CoworkerEditor({
  workspaceId,
  coworker,
}: {
  workspaceId: string;
  coworker: CoworkerDetail;
}) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [name, setName] = useState(coworker.name);
  const [handle, setHandle] = useState(coworker.handle);
  const [title, setTitle] = useState(coworker.title);
  const [instructions, setInstructions] = useState(coworker.config.standing_instructions);
  const [saved, setSaved] = useState(false);
  const [disableConfirm, setDisableConfirm] = useState(false);
  const analyst = coworker.handle === "analyst";

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("Your session expired. Sign in again.");
      return updateCoworker({
        coworkerId: coworker.id,
        csrfToken: session.csrf_token,
        command: {
          name,
          handle,
          title,
          standing_instructions: instructions,
          model_preset: coworker.config.model_preset,
          native_subagents_enabled: false,
          channel_ids: coworker.config.channel_ids,
          budget: coworker.config.budget,
          task_record_grants: coworker.config.task_record_grants,
          tool_grants: coworker.config.tool_grants,
          skill_version_ids: coworker.config.skill_version_ids,
          component_version_ids: coworker.config.component_version_ids,
        },
      });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(["coworker", workspaceId, coworker.id], updated);
      await queryClient.invalidateQueries({ queryKey: ["coworker-directory", workspaceId] });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => {
      if (!session) throw new Error("Your session expired. Sign in again.");
      return disableCoworker({
        coworkerId: coworker.id,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_config_revision: coworker.config_revision,
          reason: "Disabled by workspace owner",
          idempotency_key: newIdempotencyKey("disable_coworker"),
        },
      });
    },
    onSuccess: async (disabled) => {
      queryClient.setQueryData(["coworker", workspaceId, coworker.id], {
        ...coworker,
        ...disabled,
      });
      await queryClient.invalidateQueries({ queryKey: ["coworker-directory", workspaceId] });
      setDisableConfirm(false);
    },
  });

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
                @{coworker.handle} ·{" "}
                <span
                  className={coworker.status === "active" ? "text-emerald-700" : "text-zinc-500"}
                >
                  {coworker.status === "active" ? "Available" : "Disabled"}
                </span>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDisableConfirm(true)}
              disabled={coworker.status === "disabled" || disableMutation.isPending}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600"
            >
              {disableMutation.isPending
                ? "Disabling…"
                : coworker.status === "disabled"
                  ? "Disabled"
                  : "Disable"}
            </button>
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={coworker.status === "disabled" || updateMutation.isPending}
              className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
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
        {disableConfirm ? (
          <div
            className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            role="alert"
          >
            <span>
              Disable @{coworker.handle}? It will be removed from channels and cannot accept new
              work.
            </span>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setDisableConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => disableMutation.mutate()}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Confirm disable
              </button>
            </div>
          </div>
        ) : null}
        {updateMutation.error || disableMutation.error ? (
          <div
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {(updateMutation.error ?? disableMutation.error)?.message}
          </div>
        ) : null}
        <div className="mt-5 grid grid-cols-[1fr_280px] gap-4">
          <section className="space-y-4">
            <EditorSection title="Identity & instructions">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" value={name} onChange={setName} />
                <Field label="Handle" value={handle} onChange={setHandle} />
                <Field label="Role title" value={title} onChange={setTitle} />
              </div>
              <label className="mt-3 block text-xs text-zinc-500">
                Model preset
                <input
                  value={coworker.config.model_preset}
                  readOnly
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700"
                />
              </label>
              <label className="mt-3 block text-xs text-zinc-500">
                Standing instructions
                <textarea
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm leading-6 text-zinc-700"
                />
              </label>
            </EditorSection>
            <EditorSection title="Exact tool grants">
              <div className="flex flex-wrap gap-2">
                {coworker.config.tool_grants.map((tool) => (
                  <span
                    key={tool}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700"
                  >
                    ✓ {tool}
                  </span>
                ))}
                {coworker.config.tool_grants.length === 0 ? (
                  <span className="text-xs text-zinc-400">No tool grants</span>
                ) : null}
              </div>
            </EditorSection>
            <EditorSection title="Skills & controlled components">
              <div className="grid grid-cols-2 gap-3">
                <GrantList title="Private skills" items={coworker.config.skill_version_ids} />
                <GrantList title="Components" items={coworker.config.component_version_ids} />
              </div>
            </EditorSection>
            <EditorSection title="Approval settings">
              <ul className="space-y-2">
                {approvalPolicyLines(coworker).map((line) => (
                  <li key={line} className="flex gap-2 text-xs text-zinc-700">
                    <span className="text-emerald-600">✓</span>
                    {line}
                  </li>
                ))}
              </ul>
            </EditorSection>
          </section>
          <aside className="space-y-3">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Runtime
              </h2>
              <dl className="mt-4 space-y-3 text-xs">
                <SideDetail label="Model preset" value={coworker.config.model_preset} />
                <SideDetail
                  label="Turn budget"
                  value={`${coworker.config.budget.max_turn_tokens.toLocaleString()} tokens`}
                />
                <SideDetail
                  label="Tool limit"
                  value={`${coworker.config.budget.max_tool_calls} calls`}
                />
                <SideDetail
                  label="Sandbox"
                  value={
                    coworker.config.tool_grants.some((tool) => tool.includes("SANDBOX"))
                      ? "Granted"
                      : "Not granted"
                  }
                />
                <SideDetail
                  label="GenUI components"
                  value={String(coworker.config.component_version_ids.length)}
                />
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
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs text-zinc-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
        {items.length === 0 ? <li className="text-xs text-zinc-400">None</li> : null}
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
