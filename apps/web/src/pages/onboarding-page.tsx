import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { useSession } from "../auth/session-context";
import {
  completeFixtureOnboarding,
  DEFAULT_FIXTURE_ONBOARDING_VALUES,
  readFixtureOnboarding,
  saveFixtureOnboardingDraft,
  type FixtureOnboardingValues,
} from "../onboarding/fixture-onboarding";
import { workspaceFeedPath } from "../routes/paths";

type OnboardingStep = "welcome" | "agent" | "context" | "workspace" | "complete";

const ONBOARDING_STEPS: OnboardingStep[] = ["welcome", "agent", "context", "workspace", "complete"];

export function OnboardingPage() {
  const { session } = useSession();
  if (!session) {
    return (
      <p className="grid min-h-full place-items-center bg-zinc-950 text-sm text-zinc-400">
        Loading…
      </p>
    );
  }
  return <OnboardingFlow key={session.workspace_id} workspaceId={session.workspace_id} />;
}

function OnboardingFlow({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const stored = readFixtureOnboarding(workspaceId);
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [values, setValues] = useState<FixtureOnboardingValues>(() => ({
    ...DEFAULT_FIXTURE_ONBOARDING_VALUES,
    ...(stored ?? {}),
  }));
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);

  function persistDraft(next: FixtureOnboardingValues): void {
    setValues(next);
    saveFixtureOnboardingDraft(workspaceId, next);
  }

  function submitAgent(event: FormEvent): void {
    event.preventDefault();
    if (!values.primaryAgentName.trim()) {
      setError("Give your primary agent a name.");
      return;
    }
    setError(null);
    persistDraft(values);
    setStep("context");
  }

  function submitContext(event: FormEvent): void {
    event.preventDefault();
    setError(null);
    persistDraft(values);
    setStep("workspace");
  }

  function skipContext(): void {
    setError(null);
    persistDraft({ ...values, businessContext: "" });
    setStep("workspace");
  }

  function submitWorkspace(event: FormEvent): void {
    event.preventDefault();
    if (!values.workspaceName.trim()) {
      setError("Name your workspace or team.");
      return;
    }
    setError(null);
    persistDraft(values);
    setStep("complete");
  }

  async function enterWorkspace(): Promise<void> {
    setEntering(true);
    try {
      completeFixtureOnboarding(workspaceId, values);
      await navigate({
        to: workspaceFeedPath(workspaceId),
        replace: true,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to enter the workspace.");
      setEntering(false);
    }
  }

  const stepIndex = ONBOARDING_STEPS.indexOf(step);
  return (
    <main className="relative grid min-h-full place-items-center overflow-hidden bg-zinc-950 px-6 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(124,58,237,0.2),transparent_32%),radial-gradient(circle_at_85%_90%,rgba(14,165,233,0.12),transparent_30%)]" />
      <section className="relative w-full max-w-xl" aria-labelledby="onboarding-title">
        <div className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white font-bold text-zinc-950">
              F
            </span>
            <span className="text-sm font-semibold">ForgeRoom</span>
          </div>
          <ol className="flex gap-1.5" aria-label="Onboarding progress">
            {ONBOARDING_STEPS.map((item, index) => (
              <li
                key={item}
                aria-current={item === step ? "step" : undefined}
                className={`h-1.5 rounded-full transition-all ${index <= stepIndex ? "w-7 bg-violet-400" : "w-4 bg-white/15"}`}
              />
            ))}
          </ol>
        </div>

        {step === "welcome" ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
              Your AI team starts here
            </p>
            <h1
              id="onboarding-title"
              className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl"
            >
              Build a room where people and agents work together.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-400">
              Set up your first agent and workspace. You can change capability details later.
            </p>
            <button
              type="button"
              onClick={() => setStep("agent")}
              className="mt-9 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              Get started
            </button>
          </div>
        ) : null}

        {step === "agent" ? (
          <OnboardingForm
            eyebrow="Step 1"
            title="Name your primary agent"
            description="This is the teammate you will mention first in channels."
            onSubmit={submitAgent}
            onBack={() => setStep("welcome")}
          >
            <label className="block text-sm font-medium text-zinc-200">
              Agent name
              <input
                autoFocus
                value={values.primaryAgentName}
                onChange={(event) => setValues({ ...values, primaryAgentName: event.target.value })}
                placeholder="Operator"
                className="mt-3 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-base text-white outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              />
            </label>
          </OnboardingForm>
        ) : null}

        {step === "context" ? (
          <OnboardingForm
            eyebrow="Step 2 · Optional"
            title="Add a little business context"
            description="A sentence is enough. Keep secrets and credentials out of this field."
            onSubmit={submitContext}
            onBack={() => setStep("agent")}
            secondaryAction={
              <button
                type="button"
                onClick={skipContext}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-zinc-400 hover:text-white"
              >
                Skip
              </button>
            }
          >
            <label className="block text-sm font-medium text-zinc-200">
              What does your team do?
              <textarea
                autoFocus
                rows={4}
                value={values.businessContext}
                onChange={(event) => setValues({ ...values, businessContext: event.target.value })}
                placeholder="We help support teams turn customer feedback into product decisions."
                className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-base leading-7 text-white outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              />
            </label>
          </OnboardingForm>
        ) : null}

        {step === "workspace" ? (
          <OnboardingForm
            eyebrow="Step 3"
            title="Name your workspace"
            description="Use your company, project, or team name."
            onSubmit={submitWorkspace}
            onBack={() => setStep("context")}
          >
            <label className="block text-sm font-medium text-zinc-200">
              Workspace or team name
              <input
                autoFocus
                value={values.workspaceName}
                onChange={(event) => setValues({ ...values, workspaceName: event.target.value })}
                placeholder="Acme support"
                className="mt-3 w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3.5 text-base text-white outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
              />
            </label>
          </OnboardingForm>
        ) : null}

        {step === "complete" ? (
          <div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-xl font-bold text-zinc-950">
              ✓
            </span>
            <p className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Ready to work
            </p>
            <h1 id="onboarding-title" className="mt-3 text-4xl font-semibold tracking-tight">
              {values.workspaceName.trim()} is ready.
            </h1>
            <p className="mt-4 text-base leading-7 text-zinc-400">
              {values.primaryAgentName.trim()} is waiting in your first channel.
            </p>
            <button
              type="button"
              onClick={() => void enterWorkspace()}
              disabled={entering}
              className="mt-9 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
            >
              {entering ? "Opening workspace…" : "Enter workspace"}
            </button>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function OnboardingForm({
  eyebrow,
  title,
  description,
  onSubmit,
  onBack,
  secondaryAction,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
  secondaryAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">{eyebrow}</p>
      <h1 id="onboarding-title" className="mt-3 text-4xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
      <div className="mt-8">{children}</div>
      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-zinc-400 hover:text-white"
        >
          Back
        </button>
        <div className="flex items-center gap-2">
          {secondaryAction}
          <button
            type="submit"
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
          >
            Continue
          </button>
        </div>
      </div>
    </form>
  );
}
