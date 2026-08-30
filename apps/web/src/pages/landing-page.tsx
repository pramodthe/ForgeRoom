import { Link } from "@tanstack/react-router";
import { isFixtureMode } from "../api/mode";
import { useSession } from "../auth/session-context";
import { isFixtureOnboardingComplete } from "../onboarding/fixture-onboarding";
import { loginPath, onboardingPath, workspaceFeedPath } from "../routes/paths";

const CAPABILITIES = [
  ["Rooms", "Give every project a shared place for people, agents, context, and decisions."],
  ["AI coworkers", "Assign clear roles, tools, skills, budgets, and standing instructions."],
  [
    "Governed actions",
    "Review the exact action and data boundary before sensitive work continues.",
  ],
  [
    "Useful answers",
    "Turn agent work into charts, source tables, tasks, and downloadable artifacts.",
  ],
  ["Task records", "Convert conversation into owned, revisioned work without losing its source."],
  ["Replayable work", "Inspect receipts and decisions, then save successful work as a skill."],
] as const;

export function LandingPage() {
  const { session, isLoading } = useSession();
  const workspacePath = session
    ? isFixtureMode && !isFixtureOnboardingComplete(session.workspace_id)
      ? onboardingPath()
      : workspaceFeedPath(session.workspace_id)
    : loginPath();

  return (
    <main className="min-h-full overflow-x-hidden bg-[#0a0b0b] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(110,231,183,0.13),transparent_35%),radial-gradient(circle_at_8%_36%,rgba(139,92,246,0.08),transparent_24%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-[0.17] [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_68%)]" />

      <header className="relative z-20 mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="ForgeRoom home">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">ForgeRoom</span>
        </a>
        <nav
          className="hidden items-center gap-8 text-sm text-zinc-400 md:flex"
          aria-label="Landing"
        >
          <a className="transition hover:text-white" href="#product">
            Product
          </a>
          <a className="transition hover:text-white" href="#workflow">
            How it works
          </a>
          <a className="transition hover:text-white" href="#governance">
            Governance
          </a>
        </nav>
        <Link
          to={workspacePath}
          className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-zinc-100 backdrop-blur transition hover:border-white/30 hover:bg-white/10"
        >
          {isLoading ? "Loading…" : session ? "Open workspace" : "Sign in"}
        </Link>
      </header>

      <section
        id="top"
        className="relative mx-auto max-w-7xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24 lg:pt-28"
      >
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-[11px] font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,.9)]" />
            A shared workspace for people and AI
          </div>
          <h1 className="mt-7 text-balance text-5xl font-medium leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-[78px]">
            Where teams and AI coworkers{" "}
            <span className="bg-gradient-to-r from-emerald-200 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
              get work done.
            </span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
            Bring conversations, agents, tasks, approvals, and artifacts into one calm workspace.
            See the work, guide the decisions, and keep every outcome accountable.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to={workspacePath}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-300 px-6 py-3.5 text-sm font-semibold text-emerald-950 shadow-[0_16px_50px_rgba(110,231,183,.15)] transition hover:-translate-y-0.5 hover:bg-emerald-200 sm:w-auto"
            >
              Enter ForgeRoom <span aria-hidden="true">→</span>
            </Link>
            <a
              href="#workflow"
              className="inline-flex w-full items-center justify-center rounded-full border border-white/15 px-6 py-3.5 text-sm font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.04] hover:text-white sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-[11px] text-zinc-600">Open the guided demo in under a minute.</p>
        </div>

        <ProductPreview />

        <div className="mt-14 grid grid-cols-2 gap-y-6 border-y border-white/[0.07] py-7 text-center sm:grid-cols-4">
          {[
            ["Shared rooms", "People + agents"],
            ["Exact approvals", "Before external action"],
            ["Source-linked", "Tasks + artifacts"],
            ["Run receipts", "Inspect + replay"],
          ].map(([title, detail]) => (
            <div
              key={title}
              className="px-3 sm:border-l sm:border-white/[0.07] sm:first:border-l-0"
            >
              <div className="text-xs font-medium text-zinc-200">{title}</div>
              <div className="mt-1 text-[10px] text-zinc-600">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="product" className="relative mx-auto max-w-7xl scroll-mt-16 px-5 py-24 sm:px-8">
        <SectionHeading
          eyebrow="One operating layer"
          title="Everything AI work needs. Nothing to hide behind."
          detail="ForgeRoom keeps automation understandable by putting its context, ownership, and controls beside the conversation."
        />
        <div className="mt-14 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(([title, detail], index) => (
            <article
              key={title}
              className="group min-h-56 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 transition hover:-translate-y-1 hover:border-emerald-200/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-sm text-emerald-200">
                  {index + 1}
                </span>
                <span className="font-mono text-[10px] text-zinc-700">0{index + 1}</span>
              </div>
              <h3 className="mt-8 text-lg font-medium tracking-tight text-zinc-100">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <WorkflowSection />
      <GovernanceSection />

      <section className="relative px-5 pb-28 pt-8 text-center sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex justify-center">
            <BrandMark large />
          </div>
          <h2 className="mt-7 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
            Give your AI team a real place to work.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-500">
            Open the guided workspace and take ForgeRoom from first setup to a governed result.
          </p>
          <Link
            to={workspacePath}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-zinc-950 transition hover:-translate-y-0.5 hover:bg-emerald-100"
          >
            Explore the workspace <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="relative border-t border-white/[0.07]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark compact />
            <span className="text-zinc-400">ForgeRoom</span>
          </div>
          <p>People set direction. AI coworkers move the work forward.</p>
        </div>
      </footer>
    </main>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-6xl sm:mt-20">
      <div className="absolute -inset-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(110,231,183,.12),transparent_66%)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[#151616] shadow-[0_40px_120px_rgba(0,0,0,.55)]">
        <div className="flex h-11 items-center gap-2 border-b border-white/[0.08] bg-[#121313] px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b63]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5c451]/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="mx-auto -translate-x-6 rounded-md border border-white/[0.06] bg-white/[0.03] px-10 py-1 text-[8px] text-zinc-700 sm:px-16">
            ForgeRoom workspace
          </span>
        </div>
        <div className="grid min-h-[390px] grid-cols-[48px_128px_1fr] sm:grid-cols-[60px_220px_1fr] lg:min-h-[560px] lg:grid-cols-[64px_300px_1fr]">
          <div className="flex flex-col items-center gap-4 border-r border-white/[0.07] bg-[#111212] py-4">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-300 text-[9px] font-black text-emerald-950">
              FR
            </span>
            {["+", "⌕", "⌂", "#", "✓", "◎"].map((item, index) => (
              <span
                key={`${item}-${index}`}
                className={`grid h-8 w-8 place-items-center rounded-lg text-[10px] ${index === 2 ? "bg-white/10 text-white" : "text-zinc-700"}`}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="border-r border-white/[0.07] bg-[#181919] p-3 sm:p-4">
            <div className="text-xs font-medium text-zinc-200 sm:text-sm">Feed</div>
            <div className="mt-4 hidden gap-2 text-[8px] text-zinc-600 sm:flex">
              <span className="rounded-full bg-white/10 px-2 py-1 text-zinc-300">All</span>
              <span className="px-2 py-1">Tasks</span>
              <span className="px-2 py-1">@me</span>
            </div>
            <div className="mt-5 space-y-2">
              <PreviewFeedItem tone="violet" title="Launch plan" detail="Task ready for review" />
              <PreviewFeedItem
                tone="emerald"
                title="Research complete"
                detail="12 sources analyzed"
              />
              <PreviewFeedItem tone="sky" title="You" detail="@team Prepare the brief" />
              <PreviewFeedItem tone="emerald" title="Operator" detail="Approval requested" />
            </div>
          </div>
          <div className="relative flex min-w-0 flex-col items-center justify-center bg-[#1b1c1c] px-3 py-10 sm:px-8">
            <div className="absolute right-4 top-4 flex -space-x-1.5">
              <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#1b1c1c] bg-violet-300 text-[7px] font-bold text-violet-950">
                A
              </span>
              <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#1b1c1c] bg-sky-300 text-[7px] font-bold text-sky-950">
                O
              </span>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-300 text-xs font-black text-emerald-950">
              F
            </span>
            <div className="mt-5 text-center text-base font-medium tracking-tight text-zinc-100 sm:text-2xl lg:text-3xl">
              What should we work on?
            </div>
            <div className="mt-2 hidden text-center text-xs text-zinc-600 sm:block">
              Start with an outcome. We’ll coordinate the right coworkers.
            </div>
            <div className="mt-8 w-full max-w-xl rounded-xl border border-white/[0.12] bg-[#242525] p-3 shadow-2xl sm:p-4">
              <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3 text-[8px] text-zinc-600 sm:text-[9px]">
                <span>Work in</span>
                <span className="rounded-md bg-white/[0.05] px-2 py-1 text-zinc-400"># Launch</span>
              </div>
              <div className="min-h-16 pt-3 text-[9px] leading-5 text-zinc-400 sm:text-xs">
                @team Review the customer evidence and prepare our launch recommendation.
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-1.5">
                  <span className="rounded-md bg-white/[0.05] px-2 py-1 text-[8px] text-zinc-500">
                    Message
                  </span>
                  <span className="rounded-md px-2 py-1 text-[8px] text-zinc-600">Task</span>
                </div>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-300 text-xs text-emerald-950">
                  ↑
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewFeedItem(props: {
  tone: "violet" | "emerald" | "sky";
  title: string;
  detail: string;
}) {
  const toneClass = {
    violet: "bg-violet-400/10 text-violet-300",
    emerald: "bg-emerald-400/10 text-emerald-300",
    sky: "bg-sky-400/10 text-sky-300",
  }[props.tone];
  return (
    <div className="flex gap-2 rounded-lg p-2 hover:bg-white/[0.03] sm:p-2.5">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[8px] ${toneClass}`}
      >
        #
      </span>
      <div className="min-w-0">
        <div className="truncate text-[9px] font-medium text-zinc-300 sm:text-[10px]">
          {props.title}
        </div>
        <div className="mt-0.5 truncate text-[8px] text-zinc-700 sm:text-[9px]">{props.detail}</div>
      </div>
    </div>
  );
}

function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="relative scroll-mt-16 border-y border-white/[0.07] bg-white/[0.018]"
    >
      <div className="mx-auto grid max-w-7xl gap-16 px-5 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
        <SectionHeading
          eyebrow="From request to result"
          title="Start with the outcome. Keep the work visible."
          detail="A simple flow for serious work—without asking your team to learn a new language for every agent."
          align="left"
        />
        <ol className="space-y-3">
          <WorkflowStep
            number="01"
            title="Ask in plain language"
            detail="Choose a room, mention one coworker or the whole team, and describe the outcome."
          />
          <WorkflowStep
            number="02"
            title="Watch the team coordinate"
            detail="Follow sourced updates, live work, structured answers, and requests for your input."
          />
          <WorkflowStep
            number="03"
            title="Review and reuse the result"
            detail="Approve exact actions, open the TaskRecord, inspect its receipt, or save the workflow as a skill."
          />
        </ol>
      </div>
    </section>
  );
}

function WorkflowStep({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <li className="grid grid-cols-[48px_1fr] gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition hover:border-white/[0.13] hover:bg-white/[0.04] sm:grid-cols-[64px_1fr] sm:p-6">
      <span className="font-mono text-xs text-emerald-300/70">{number}</span>
      <div>
        <h3 className="text-base font-medium text-zinc-100 sm:text-lg">{title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-zinc-500">{detail}</p>
      </div>
    </li>
  );
}

function GovernanceSection() {
  return (
    <section id="governance" className="relative mx-auto max-w-7xl scroll-mt-16 px-5 py-28 sm:px-8">
      <div className="overflow-hidden rounded-[28px] border border-emerald-200/15 bg-gradient-to-br from-emerald-200/[0.08] via-white/[0.025] to-violet-400/[0.06] p-7 sm:p-10 lg:p-14">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Control without the bottleneck
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl font-medium leading-tight tracking-[-0.035em] sm:text-5xl">
              Move quickly. Stay in charge of consequential actions.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
              Agents can research, reason, and prepare work independently. When an external write
              matters, ForgeRoom shows the service, exact action, requesting coworker, and data
              boundary before you decide.
            </p>
          </div>
          <ApprovalPreview />
        </div>
      </div>
    </section>
  );
}

function ApprovalPreview() {
  return (
    <div className="rounded-2xl border border-white/[0.1] bg-[#171818]/90 p-5 shadow-2xl sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-300/10 text-amber-300">
            !
          </span>
          Approval required
        </div>
        <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[9px] text-amber-200">
          Medium risk
        </span>
      </div>
      <h3 className="mt-5 text-base font-medium">Publish updated support macro</h3>
      <dl className="mt-5 space-y-3 text-xs">
        <ApprovalRow label="Service" value="Support workspace" />
        <ApprovalRow label="Exact action" value="Update macro · Billing response" />
        <ApprovalRow label="Requested by" value="Operator" />
        <ApprovalRow label="Data leaving" value="Macro text only" />
      </dl>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <span className="rounded-lg border border-white/10 py-2.5 text-center text-[10px] text-zinc-400">
          Deny
        </span>
        <span className="rounded-lg bg-emerald-300 py-2.5 text-center text-[10px] font-semibold text-emerald-950">
          Approve action
        </span>
      </div>
    </div>
  );
}

function ApprovalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 border-b border-white/[0.06] pb-3 last:border-0 last:pb-0">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="text-right text-zinc-300">{value}</dd>
    </div>
  );
}

function SectionHeading(props: {
  eyebrow: string;
  title: string;
  detail: string;
  align?: "center" | "left";
}) {
  return (
    <div className={props.align === "left" ? "max-w-xl" : "mx-auto max-w-3xl text-center"}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
        {props.eyebrow}
      </p>
      <h2 className="mt-4 text-3xl font-medium leading-tight tracking-[-0.035em] text-white sm:text-5xl">
        {props.title}
      </h2>
      <p className="mt-5 text-sm leading-7 text-zinc-500 sm:text-base">{props.detail}</p>
    </div>
  );
}

function BrandMark(props: { compact?: boolean; large?: boolean }) {
  const size = props.large
    ? "h-14 w-14 rounded-2xl text-sm"
    : props.compact
      ? "h-7 w-7 rounded-lg text-[8px]"
      : "h-9 w-9 rounded-xl text-[10px]";
  return (
    <span
      className={`grid place-items-center bg-gradient-to-br from-emerald-200 to-emerald-400 font-black text-emerald-950 shadow-[0_8px_24px_rgba(110,231,183,.12)] ${size}`}
    >
      FR
    </span>
  );
}
