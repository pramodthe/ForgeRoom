import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Run, RunStep } from "@forgeroom/contracts";
import { useRef, useState } from "react";
import { cancelRun, getRun, getRunReceipt } from "../api/channel-resources-api";
import { newIdempotencyKey } from "../api/http-client";
import { isFixtureMode } from "../api/mode";
import { listChannelRoster, publishFixtureRunSkill } from "../api/workspace-api";
import { useSession } from "../auth/session-context";
import { Avatar } from "../ui/avatar";
import { useDialogFocus } from "../ui/use-dialog-focus";

type RunDetailDrawerProps = {
  workspaceId: string;
  channelId: string;
  runId: string;
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

function lifecycleLabel(lifecycle: Run["lifecycle"]): string {
  return lifecycle.replaceAll("_", " ");
}

export function RunDetailDrawer({ workspaceId, channelId, runId, onClose }: RunDetailDrawerProps) {
  if (isFixtureMode) {
    return <FixtureRunDetailDrawer workspaceId={workspaceId} onClose={onClose} />;
  }
  return (
    <LiveRunDetailDrawer
      workspaceId={workspaceId}
      channelId={channelId}
      runId={runId}
      onClose={onClose}
    />
  );
}

function LiveRunDetailDrawer({
  workspaceId,
  channelId,
  runId,
  onClose,
}: {
  workspaceId: string;
  channelId: string;
  runId: string;
  onClose: () => void;
}) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [cancelError, setCancelError] = useState<string | null>(null);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["run", runId] }),
        queryClient.invalidateQueries({ queryKey: ["run-receipt", runId] }),
      ]);
    },
    onError: (error) => {
      setCancelError(error instanceof Error ? error.message : "Unable to stop remaining work.");
    },
  });

  const run = runQuery.data?.run;
  const isLoading = runQuery.isLoading || receiptQuery.isLoading;
  const hasLoadError = runQuery.error || receiptQuery.error;
  const stoppable = run?.steps.some((step) => STOPPABLE_STEP_STATES.has(step.state)) ?? false;

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
        </div>
      </section>
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
        <SaveAsSkillReview workspaceId={workspaceId} onClose={() => setSkillReviewOpen(false)} />
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

function SaveAsSkillReview({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<"review" | "publishing" | "attached">("review");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, onClose);

  async function publish() {
    setError(null);
    setStage("publishing");
    try {
      await publishFixtureRunSkill(workspaceId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["skill-versions", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["coworkers", workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ["coworker", workspaceId, "cw_operator_001"] }),
      ]);
      setStage("attached");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish skill.");
      setStage("review");
    }
  }

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
              Trusted skill review · draft revision 1
            </div>
            <h2 id="skill-review-title" className="mt-1 text-xl font-semibold text-zinc-950">
              Save support operations plan
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
                body="After a support review when sourced evidence should become an accountable operating plan."
              />
              <ReviewBlock
                title="Inputs"
                body="Date range, support dataset artifact, operating objective."
              />
              <ReviewBlock
                title="Output"
                body="Chart, TaskRecord, PDF brief, and approval-ready external change."
              />
              <ReviewBlock
                title="Validation"
                body="Every claim cites the source revision; task and artifact must persist before completion."
              />
              <ReviewBlock
                title="No or stale data"
                body="Return a sourced no-change result and ask for a current dataset. Never infer missing facts."
              />
              <ReviewBlock
                title="Failure behavior"
                body="Preserve partial artifacts, name the failed step, and do not retry external writes implicitly."
              />
            </div>
            <section className="mt-4 rounded-2xl border border-zinc-200 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Procedure
              </h3>
              <ol className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-700">
                {[
                  "Read bounded support evidence",
                  "Validate categories and totals",
                  "Create the authoritative TaskRecord",
                  "Publish revisioned artifacts",
                  "Request approval for external writes",
                  "Return the safe final receipt",
                ].map((step, index) => (
                  <li key={step} className="flex gap-2 rounded-lg bg-zinc-50 p-2.5">
                    <span className="font-semibold text-violet-700">{index + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
            </section>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <ReviewBlock
                title="Required tools"
                body="support.read · sandbox.publish_summary · TaskRecord.create · INTERCOM_UPDATE_MACRO"
              />
              <ReviewBlock
                title="Required components"
                body="BarOrLineChart · DataTable · TaskCard · ArtifactCard"
              />
              <ReviewBlock
                title="Approval boundary"
                body="Every external write requires a fresh immutable approval. This skill gains no new authority."
              />
              <ReviewBlock
                title="Source lineage"
                body="Run run_4A91 · Analyst step 1 · Operator step 2 · source content hash locked"
              />
            </div>
            <section className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <h3 className="text-xs font-semibold text-violet-900">Package diff</h3>
              <p className="mt-1 text-xs leading-5 text-violet-800">
                Creates private immutable skill version 1 and attaches it only to Operator. No
                tools, channels, accounts, components, or approval exemptions are added.
              </p>
            </section>
            <div className="mt-5 flex items-center justify-between">
              <p className="max-w-md text-xs leading-5 text-zinc-500">
                Publishing rotates Operator&apos;s channel sessions after current work settles.
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
                ? "Operator will receive the new binding after session rotation."
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
