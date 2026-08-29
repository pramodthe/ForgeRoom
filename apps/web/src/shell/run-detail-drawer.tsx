import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Run, RunStep, SkillDraft } from "@forgeroom/contracts";
import { useEffect, useRef, useState, useId } from "react";
import { cancelRun, getRun, getRunReceipt } from "../api/channel-resources-api";
import { apiUrl } from "../api/http-client";
import { newIdempotencyKey } from "../api/http-client";
import { isFixtureMode } from "../api/mode";
import {
  createSkillDraftFromRun,
  createSkillBinding,
  getCoworker,
  getSkillDraft,
  listChannelRoster,
  publishFixtureRunSkill,
  publishSkillDraft,
} from "../api/workspace-api";
import {
  clearSkillDraftReview,
  friendlyApiError,
  persistSkillDraftReview,
  readSkillDraftReview,
} from "../pages/review-flow-helpers";
import { useSession } from "../auth/session-context";
import { Avatar } from "../ui/avatar";
import { useDialogFocus } from "../ui/use-dialog-focus";
import { PoliteStatus } from "./polite-status";
import { PinSourceButton } from "./pin-source-button";
import { pinLabelFromArtifactName } from "./pin-source-label";
import { OpenHitlCardButton } from "./open-hitl-card-button";

type RunDetailDrawerProps = {
  workspaceId: string;
  channelId: string;
  runId: string;
  archived?: boolean;
  onClose: () => void;
};

const STOPPED_RUN_KEY = "forgeroom:fixture:run:v1:run_4A91:stopped";

const STOPPABLE_STEP_STATES = new Set<RunStep["state"]>([
  "queued",
  "acquiring_session",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "blocked_connection",
]);

function formatStepState(state: RunStep["state"]): string {
  return state.replaceAll("_", " ");
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function lifecycleLabel(lifecycle: Run["lifecycle"]): string {
  return lifecycle.replaceAll("_", " ");
}

export function RunDetailDrawer({
  workspaceId,
  channelId,
  runId,
  archived,
  onClose,
}: RunDetailDrawerProps) {
  if (isFixtureMode) {
    return <FixtureRunDetailDrawer workspaceId={workspaceId} onClose={onClose} />;
  }
  return (
    <LiveRunDetailDrawer
      workspaceId={workspaceId}
      channelId={channelId}
      runId={runId}
      archived={archived}
      onClose={onClose}
    />
  );
}

function LiveRunDetailDrawer({
  workspaceId,
  channelId,
  runId,
  archived,
  onClose,
}: {
  workspaceId: string;
  channelId: string;
  runId: string;
  archived?: boolean;
  onClose: () => void;
}) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);
  const [skillReviewOpen, setSkillReviewOpen] = useState(false);
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [saveSkillError, setSaveSkillError] = useState<string | null>(null);
  const statusId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  useDialogFocus(drawerRef, onClose);
  const runQuery = useQuery({
    queryKey: ["run", runId],
    queryFn: () => getRun(runId),
  });
  const receiptQuery = useQuery({
    queryKey: ["run-receipt", runId],
    queryFn: () => getRunReceipt(runId),
  });
  const rosterQuery = useQuery({
    queryKey: ["channel-roster", channelId],
    queryFn: () => listChannelRoster(workspaceId, channelId),
  });
  const cancelMutation = useMutation({
    mutationFn: async (run: Run) => {
      if (!session) throw new Error("Session required.");
      return cancelRun({
        runId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_lifecycle: run.lifecycle,
          reason: "Owner requested stop from run drawer",
          idempotency_key: newIdempotencyKey("cancel_run"),
        },
      });
    },
    onSuccess: async () => {
      setCancelError(null);
      setCancelStatus("Stop requested. Remaining work is cancelling.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["run", runId] }),
        queryClient.invalidateQueries({ queryKey: ["run-receipt", runId] }),
      ]);
    },
    onError: (error) => {
      setCancelStatus(null);
      setCancelError(error instanceof Error ? error.message : "Unable to stop remaining work.");
    },
  });

  const run = runQuery.data?.run;
  const runDetail = runQuery.data;
  const isLoading = runQuery.isLoading || receiptQuery.isLoading;
  const hasLoadError = runQuery.error || receiptQuery.error;
  const stoppable = run?.steps.some((step) => STOPPABLE_STEP_STATES.has(step.state)) ?? false;
  const savable =
    run?.lifecycle === "completed" &&
    (run.steps.length === 0 || run.steps.every((step) => step.state === "completed"));
  const attachCoworkerId =
    run?.steps.find((step) => step.state === "completed")?.assigned_coworker_id ?? null;

  useEffect(() => {
    if (isFixtureMode || !session) return;
    const draftId = readSkillDraftReview(runId);
    if (!draftId) return;
    void getSkillDraft(workspaceId, draftId)
      .then((restored) => {
        if (!restored) {
          clearSkillDraftReview(runId);
          return;
        }
        setSkillDraft(restored);
        setSkillReviewOpen(true);
      })
      .catch(() => {
        clearSkillDraftReview(runId);
      });
  }, [runId, session, workspaceId]);

  const createSkillDraftMutation = useMutation({
    mutationFn: async () => {
      if (!session || !run) {
        throw new Error("Session required.");
      }
      const sourceStepIds = run.steps
        .filter((step) => step.state === "completed")
        .map((step) => step.id);
      if (sourceStepIds.length === 0) {
        throw new Error("No completed steps are available for skill drafting.");
      }
      return createSkillDraftFromRun({
        runId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          source_step_ids: sourceStepIds,
          idempotency_key: newIdempotencyKey("skill_draft"),
        },
      });
    },
    onSuccess: (draft) => {
      setSaveSkillError(null);
      setSkillDraft(draft);
      persistSkillDraftReview(runId, draft.id);
      setSkillReviewOpen(true);
    },
    onError: (error) => {
      setSaveSkillError(error instanceof Error ? error.message : "Unable to create skill draft.");
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30" role="presentation">
      <button
        type="button"
        aria-label="Close run details"
        className="h-full flex-1 cursor-default"
        onClick={onClose}
      />
      <section
        ref={drawerRef}
        tabIndex={-1}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-zinc-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-drawer-title"
        aria-describedby={statusId}
        aria-busy={cancelMutation.isPending}
      >
        <PoliteStatus
          id={statusId}
          message={cancelMutation.isPending ? "Stopping remaining work." : cancelStatus}
        />
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-zinc-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
              Run · {runId}
            </div>
            <h2 id="run-drawer-title" className="mt-1 text-xl font-semibold text-zinc-950">
              {run?.goal ?? "Run details"}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {run
                ? `${run.routing_mode === "direct" ? "Direct" : "Team"} routing · ${lifecycleLabel(run.lifecycle)}`
                : "Loading normalized run"}
            </p>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 hover:bg-zinc-50"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close</span>
          </button>
        </header>

        <div className="space-y-4 p-6">
          {isLoading ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
              Loading run details…
            </section>
          ) : null}
          {hasLoadError ? (
            <section
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
              role="alert"
            >
              Unable to load run details.
            </section>
          ) : null}
          {run && runQuery.data ? (
            <>
              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      Source message
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-zinc-700">
                      {runQuery.data.source_message_body}
                    </p>
                  </div>
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium capitalize text-violet-700">
                    {lifecycleLabel(run.lifecycle)}
                  </span>
                </div>
              </section>

              <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-900">Persistent coworker steps</h3>
                  <span className="text-[11px] text-zinc-400">
                    {run.steps.length} step{run.steps.length === 1 ? "" : "s"} · no child agents
                  </span>
                </div>
                <div className="mt-4 space-y-4">
                  {run.steps.map((step) => {
                    const coworker = rosterQuery.data?.coworkers.find(
                      (entry) => entry.coworker_id === step.assigned_coworker_id,
                    );
                    const waiting =
                      step.state === "awaiting_input" || step.state === "awaiting_approval";
                    return (
                      <div key={step.id} className="flex gap-3">
                        <Avatar name={coworker?.name ?? "Coworker"} tone="violet" size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-zinc-900">
                              {coworker?.name ?? step.assigned_coworker_id}
                            </span>
                            <span
                              className={`text-[11px] font-medium capitalize ${
                                waiting ? "text-amber-700" : "text-emerald-700"
                              }`}
                            >
                              {formatStepState(step.state)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-zinc-600">{step.objective}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {runDetail && runDetail.events.length > 0 ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-zinc-900">Normalized activity</h3>
                  <ol className="mt-4 space-y-4">
                    {runDetail.events.map((event) => (
                      <RunTimelineEvent
                        key={event.id}
                        time={formatEventTime(event.occurred_at)}
                        title={event.title}
                        detail={event.detail}
                        waiting={event.waiting}
                      />
                    ))}
                  </ol>
                </section>
              ) : null}

              {runDetail &&
              (runDetail.tasks.length > 0 ||
                runDetail.artifacts.length > 0 ||
                runDetail.decisions.length > 0) ? (
                <div className="grid grid-cols-2 gap-3">
                  <RunDrawerSummary
                    title="Tasks"
                    body={
                      runDetail.tasks.length === 0 ? "None" : `${runDetail.tasks.length} linked`
                    }
                    detail={
                      runDetail.tasks.length === 0
                        ? "No TaskRecords from this run"
                        : runDetail.tasks
                            .map((task) => `${task.title} · rev ${task.current_revision}`)
                            .join(" · ")
                    }
                  />
                  <RunDrawerSummary
                    title="Artifacts"
                    body={
                      runDetail.artifacts.length === 0
                        ? "None"
                        : `${runDetail.artifacts.length} revision${
                            runDetail.artifacts.length === 1 ? "" : "s"
                          }`
                    }
                    detail={
                      runDetail.artifacts.length === 0
                        ? "No durable artifacts"
                        : runDetail.artifacts.map((artifact) => artifact.name).join(" · ")
                    }
                  />
                  <RunDrawerSummary
                    title="Decisions"
                    body={`${runDetail.decisions.filter((decision) => decision.waiting).length} waiting`}
                    detail={
                      runDetail.decisions.length === 0
                        ? "No approvals or questions"
                        : runDetail.decisions
                            .map(
                              (decision) =>
                                `${decision.kind === "approval" ? "Approval" : "Question"}: ${decision.label}`,
                            )
                            .join(" · ")
                    }
                    className="col-span-2"
                  />
                </div>
              ) : null}

              {runDetail && runDetail.artifacts.length > 0 ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-zinc-900">Artifacts</h3>
                  <div className="mt-4 space-y-3">
                    {runDetail.artifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">
                            {artifact.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            {artifact.mime_type} · rev {artifact.revision}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <PinSourceButton
                            channelId={channelId}
                            archived={archived ?? false}
                            compact
                            target={{
                              kind: "artifact",
                              artifactId: artifact.id,
                              label: pinLabelFromArtifactName(artifact.name),
                            }}
                          />
                          <a
                            href={apiUrl(
                              `/api/artifacts/${encodeURIComponent(artifact.id)}/download`,
                            )}
                            className="text-xs font-medium text-violet-700"
                          >
                            Download
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {runDetail && runDetail.decisions.length > 0 ? (
                <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-zinc-900">Approvals and questions</h3>
                  <ul className="mt-4 space-y-3">
                    {runDetail.decisions.map((decision) => (
                      <li
                        key={`${decision.kind}-${decision.id}`}
                        className="flex items-start justify-between gap-3 rounded-xl border border-zinc-100 p-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium capitalize text-zinc-900">
                            {decision.kind}
                          </div>
                          <div className="mt-1 text-zinc-600">{decision.label}</div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <OpenHitlCardButton decision={decision} />
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium capitalize ${
                              decision.waiting
                                ? "bg-amber-50 text-amber-700"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {decision.state.replaceAll("_", " ")}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
          {receiptQuery.data ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-zinc-900">Audit receipt</h3>
              <p className="mt-2 text-xs leading-5 text-zinc-600">{receiptQuery.data.disclaimer}</p>
              <dl className="mt-4 space-y-2 text-xs text-zinc-700">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Receipt hash</dt>
                  <dd className="truncate font-mono text-[11px]">
                    {receiptQuery.data.receipt_hash}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Task</dt>
                  <dd>{receiptQuery.data.receipt.task_id ?? "None"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Artifact</dt>
                  <dd>{receiptQuery.data.receipt.artifact_id ?? "None"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Approvals</dt>
                  <dd>{receiptQuery.data.receipt.approval_ids.length}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          {run && stoppable ? (
            <div className="border-t border-zinc-200 pt-4">
              <button
                type="button"
                aria-label="Stop remaining work on this run"
                disabled={cancelMutation.isPending}
                onClick={() => void cancelMutation.mutate(run)}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
              >
                {cancelMutation.isPending ? "Stopping remaining work…" : "Stop remaining work"}
              </button>
              {cancelError ? (
                <p
                  className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
                  role="alert"
                >
                  {cancelError}
                </p>
              ) : null}
            </div>
          ) : null}
          {run && savable ? (
            <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
              <p className="max-w-md text-xs leading-5 text-zinc-500">
                Save this completed run as a reviewed private skill. Attachment stays within the
                coworker&apos;s existing authority.
              </p>
              <button
                type="button"
                disabled={createSkillDraftMutation.isPending}
                onClick={() => void createSkillDraftMutation.mutate()}
                className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
              >
                {createSkillDraftMutation.isPending ? "Preparing draft…" : "Save as skill"}
              </button>
            </div>
          ) : null}
          {saveSkillError ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {saveSkillError}
            </p>
          ) : null}
        </div>
      </section>
      {skillReviewOpen && skillDraft && attachCoworkerId ? (
        <SaveAsSkillReview
          workspaceId={workspaceId}
          runId={runId}
          draft={skillDraft}
          coworkerId={attachCoworkerId}
          onClose={() => {
            setSkillReviewOpen(false);
            setSkillDraft(null);
            clearSkillDraftReview(runId);
          }}
        />
      ) : null}
    </div>
  );
}

function FixtureRunDetailDrawer({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [skillReviewOpen, setSkillReviewOpen] = useState(false);
  const [stopped, setStopped] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(STOPPED_RUN_KEY) === "true",
  );
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  useDialogFocus(drawerRef, onClose, !skillReviewOpen);

  function stopRemainingWork() {
    window.localStorage.setItem(STOPPED_RUN_KEY, "true");
    setStopped(true);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/30" role="presentation">
      <button
        type="button"
        aria-label="Close run details"
        className="h-full flex-1 cursor-default"
        onClick={onClose}
      />
      <section
        ref={drawerRef}
        tabIndex={-1}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-zinc-200 bg-zinc-50 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-drawer-title"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-zinc-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
              Run receipt · run_4A91
            </div>
            <h2 id="run-drawer-title" className="mt-1 text-xl font-semibold text-zinc-950">
              Weekly support operations review
            </h2>
            <p className="mt-1 text-xs text-zinc-500">Direct team fan-out · Analyst and Operator</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 hover:bg-zinc-50"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close</span>
          </button>
        </header>

        <div className="space-y-4 p-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Source message
                </div>
                <p className="mt-1.5 text-sm leading-6 text-zinc-700">
                  “@team Review this week&apos;s support operations and prepare a clear action
                  plan.”
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                {stopped ? "Stopped" : "Needs approval"}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Persistent coworker steps</h3>
              <span className="text-[11px] text-zinc-400">2 steps · no child agents</span>
            </div>
            <div className="mt-4 space-y-4">
              <RunStep
                name="Analyst"
                tone="violet"
                state="Completed"
                description="Reviewed 428 conversations and produced revisioned insight data."
                tool="support.read"
              />
              <RunStep
                name="Operator"
                tone="blue"
                state={stopped ? "Stopped" : "Waiting for approval"}
                description={
                  stopped
                    ? "Remaining external work was cancelled by the workspace owner."
                    : "Created Task revision 2 and proposed the exact Intercom macro update."
                }
                tool="INTERCOM_UPDATE_MACRO"
                waiting={!stopped}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900">Normalized activity</h3>
            <ol className="mt-4 space-y-4">
              <Event
                time="09:02:00"
                title="Run started"
                detail="Recipients resolved: Analyst, Operator"
              />
              <Event
                time="09:02:12"
                title="Analysis ready"
                detail="Chart data and PDF artifact revision 2 persisted"
              />
              <Event
                time="09:02:26"
                title="Task updated"
                detail="Reduce billing escalations · revision 2"
              />
              <Event
                time="09:02:31"
                title="Approval requested"
                detail="Immutable proposal ap_91F · payload hash verified"
                waiting
              />
            </ol>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <Summary
              title="Artifacts"
              body="2 durable revisions"
              detail="PDF brief · CSV analysis"
            />
            <Summary
              title="Decisions"
              body={stopped ? "0 waiting" : "1 waiting"}
              detail={stopped ? "Remaining work stopped" : "No questions · no failures"}
            />
          </div>

          <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs leading-5 text-violet-900">
            <strong>Safe receipt.</strong> Two persistent coworker steps ran. No native subagent or
            coordinator was created.{" "}
            {stopped
              ? "The remaining external write was stopped."
              : "One external write remains paused until the trusted approval group is resolved."}
          </section>

          <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
            <button
              type="button"
              onClick={stopRemainingWork}
              disabled={stopped}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
            >
              {stopped ? "Remaining work stopped" : "Stop remaining work"}
            </button>
            <button
              type="button"
              onClick={() => setSkillReviewOpen(true)}
              className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Save completed work as skill
            </button>
          </div>
        </div>
      </section>
      {skillReviewOpen ? (
        <SaveAsSkillReview
          workspaceId={workspaceId}
          fixture
          onClose={() => setSkillReviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RunStep(props: {
  name: string;
  tone: "violet" | "blue";
  state: string;
  description: string;
  tool: string;
  waiting?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <Avatar name={props.name} tone={props.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-zinc-900">{props.name}</span>
          <span
            className={`text-[11px] font-medium ${props.waiting ? "text-amber-700" : "text-emerald-700"}`}
          >
            {props.state}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-zinc-600">{props.description}</p>
        <span className="mt-2 inline-block rounded-md bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-500">
          {props.tool}
        </span>
      </div>
    </div>
  );
}

function Event(props: { time: string; title: string; detail: string; waiting?: boolean }) {
  return (
    <li className="grid grid-cols-[58px_10px_1fr] gap-2 text-xs">
      <time className="pt-0.5 tabular-nums text-zinc-400">{props.time}</time>
      <span
        className={`mt-1.5 h-2 w-2 rounded-full ${props.waiting ? "bg-amber-500" : "bg-emerald-500"}`}
      />
      <div>
        <div className="font-medium text-zinc-800">{props.title}</div>
        <div className="mt-0.5 text-zinc-500">{props.detail}</div>
      </div>
    </li>
  );
}

function RunTimelineEvent(props: {
  time: string;
  title: string;
  detail: string;
  waiting?: boolean;
}) {
  return <Event {...props} />;
}

function Summary(props: { title: string; body: string; detail: string }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        {props.title}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-900">{props.body}</div>
      <div className="mt-1 text-xs text-zinc-500">{props.detail}</div>
    </section>
  );
}

function RunDrawerSummary(props: {
  title: string;
  body: string;
  detail: string;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ${props.className ?? ""}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        {props.title}
      </div>
      <div className="mt-2 text-sm font-semibold text-zinc-900">{props.body}</div>
      <div className="mt-1 text-xs text-zinc-500">{props.detail}</div>
    </section>
  );
}

function SaveAsSkillReview({
  workspaceId,
  runId,
  onClose,
  draft,
  coworkerId,
  fixture = false,
}: {
  workspaceId: string;
  runId?: string;
  onClose: () => void;
  draft?: SkillDraft;
  coworkerId?: string;
  fixture?: boolean;
}) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<"review" | "publishing" | "attached">("review");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, onClose);

  async function publish() {
    setError(null);
    setStage("publishing");
    try {
      if (fixture) {
        await publishFixtureRunSkill(workspaceId);
      } else if (draft && coworkerId && session) {
        const coworker = await getCoworker(workspaceId, coworkerId);
        if (!coworker) {
          throw new Error("Coworker not found.");
        }
        const version = await publishSkillDraft({
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
        await createSkillBinding({
          coworkerId,
          csrfToken: session.csrf_token,
          command: {
            schemaVersion: 1,
            skill_version_id: version.id,
            expected_manifest_hash: version.manifest_hash,
            expected_coworker_config_revision: coworker.config_revision,
            idempotency_key: newIdempotencyKey("skill_bind"),
          },
        });
      } else {
        throw new Error("Skill review is missing draft context.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["skill-versions", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["skill-drafts", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["coworker-directory", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["coworker", workspaceId, coworkerId ?? ""] }),
      ]);
      if (runId) {
        clearSkillDraftReview(runId);
      }
      setStage("attached");
    } catch (publishError) {
      setError(friendlyApiError(publishError));
      setStage("review");
    }
  }

  const title = draft?.when_to_use ?? (fixture ? "Save support operations plan" : "Skill draft");
  const methodSteps = draft?.method ?? [];
  const requiredTools = draft?.required_tools ?? [];
  const requiredComponents = draft?.required_components ?? [];
  const requiredApprovals = draft?.required_approvals ?? [];
  const inputs = draft?.inputs ?? [];
  const packageDiff = draft
    ? `Creates private immutable skill revision ${draft.revision}. Requires ${requiredTools.length} tool${requiredTools.length === 1 ? "" : "s"}, ${requiredComponents.length} component${requiredComponents.length === 1 ? "" : "s"}, and ${requiredApprovals.length} approval boundar${requiredApprovals.length === 1 ? "y" : "ies"}. Attaches only to the completed-step coworker.`
    : "Creates private immutable skill version 1 and attaches it only to the completed-step coworker.";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/50 p-6"
      role="presentation"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-review-title"
      >
        <header className="flex items-start justify-between border-b border-zinc-100 px-6 py-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
              Trusted skill review
              {draft ? ` · draft revision ${draft.revision}` : fixture ? " · fixture" : ""}
            </div>
            <h2 id="skill-review-title" className="mt-1 text-xl font-semibold text-zinc-950">
              {title}
            </h2>
          </div>
          <button
            data-autofocus
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-zinc-500"
          >
            Close
          </button>
        </header>
        {stage === "review" ? (
          <div className="p-6">
            <div className="grid grid-cols-2 gap-3">
              <ReviewBlock
                title="When to use"
                body={
                  draft?.when_to_use ?? "Review the draft when to use guidance before publishing."
                }
              />
              <ReviewBlock
                title="Inputs"
                body={
                  inputs.length > 0
                    ? inputs.join(" · ")
                    : "Inputs are captured in the draft manifest."
                }
              />
              <ReviewBlock
                title="Output"
                body={draft?.output ?? "Output is defined in the draft manifest."}
              />
              <ReviewBlock
                title="Validation"
                body={draft?.validation ?? "Validation rules are defined in the draft manifest."}
              />
              <ReviewBlock
                title="No or stale data"
                body={
                  draft?.failures.length
                    ? draft.failures.join(" · ")
                    : "Return a sourced no-change result when evidence is missing."
                }
              />
              <ReviewBlock
                title="Failure behavior"
                body={
                  draft?.failures.length
                    ? draft.failures.join(" · ")
                    : "Preserve partial artifacts and name the failed step."
                }
              />
            </div>
            <section className="mt-4 rounded-2xl border border-zinc-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Procedure
              </h3>
              <ol className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-700">
                {methodSteps.map((step, index) => (
                  <li key={`${step}-${index}`} className="flex gap-2 rounded-lg bg-zinc-50 p-2.5">
                    <span className="font-semibold text-violet-700">{index + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ReviewBlock
                title="Required tools"
                body={requiredTools.length > 0 ? requiredTools.join(" · ") : "None"}
              />
              <ReviewBlock
                title="Required components"
                body={requiredComponents.length > 0 ? requiredComponents.join(" · ") : "None"}
              />
              <ReviewBlock
                title="Approval boundary"
                body={
                  requiredApprovals.length > 0
                    ? `${requiredApprovals.join(" · ")} · This skill gains no new authority.`
                    : "This skill gains no new authority."
                }
              />
              <ReviewBlock
                title="Source lineage"
                body={
                  draft
                    ? `Run ${draft.source_run_id} · manifest hash ${draft.draft_hash}`
                    : "Source run lineage is unavailable."
                }
              />
            </div>
            <section className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <h3 className="text-xs font-semibold text-violet-900">Package diff</h3>
              <p className="mt-1 text-xs leading-5 text-violet-800">{packageDiff}</p>
            </section>
            <div className="mt-5 flex items-center justify-between">
              <p className="max-w-md text-xs leading-5 text-zinc-500">
                Publishing rotates the coworker&apos;s channel sessions after current work settles.
                Pending proposals may become stale.
              </p>
              <button
                type="button"
                onClick={() => void publish()}
                className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Publish v1 and attach
              </button>
            </div>
            {error ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="p-12 text-center" role="status">
            <span
              className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${stage === "attached" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}
            >
              {stage === "attached" ? "✓" : "…"}
            </span>
            <h3 className="mt-4 font-semibold text-zinc-900">
              {stage === "attached"
                ? "Skill published and attached"
                : "Publishing immutable version 1…"}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {stage === "attached"
                ? "The coworker will receive the new binding after session rotation."
                : "Validating manifest, lineage, and exact capability diff."}
            </p>
            {stage === "attached" ? (
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Done
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewBlock({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl bg-zinc-50 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-zinc-700">{body}</p>
    </section>
  );
}
