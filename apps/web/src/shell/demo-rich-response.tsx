import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { workspaceConnectionsPath } from "../routes/paths";

const SUPPORT_DATA = [
  { label: "Billing", value: 38, color: "bg-violet-500" },
  { label: "Onboarding", value: 29, color: "bg-sky-500" },
  { label: "Integrations", value: 21, color: "bg-emerald-500" },
  { label: "Other", value: 12, color: "bg-zinc-400" },
] as const;

const SUPPORT_ROWS = [
  { theme: "Billing confusion", conversations: 163, escalation: "12.8%", trend: "+2.1%" },
  { theme: "Onboarding setup", conversations: 124, escalation: "9.7%", trend: "+0.8%" },
  { theme: "Integration errors", conversations: 90, escalation: "6.1%", trend: "-1.4%" },
  { theme: "Other", conversations: 51, escalation: "3.2%", trend: "-0.4%" },
] as const;

export function SupportInsightsCard() {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            AI-generated analysis
          </div>
          <h3 className="mt-1.5 font-semibold text-zinc-950">Escalation drivers</h3>
          <p className="mt-0.5 text-xs text-zinc-500">428 conversations · Aug 19–26</p>
        </div>
        <div
          className="inline-flex rounded-lg bg-zinc-100 p-0.5"
          aria-label="Chart view"
          role="group"
        >
          {(["chart", "table"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize ${
                view === option ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"
              }`}
              aria-pressed={view === option}
              onClick={() => setView(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {view === "chart" ? (
          <div
            className="space-y-3"
            role="img"
            aria-label="Billing 38%, onboarding 29%, integrations 21%, other 12%"
          >
            {SUPPORT_DATA.map((row) => (
              <div key={row.label} className="grid grid-cols-[88px_1fr_36px] items-center gap-3">
                <span className="text-xs font-medium text-zinc-700">{row.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${row.value}%` }}
                  />
                </div>
                <span className="text-right text-xs tabular-nums text-zinc-500">{row.value}%</span>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {SUPPORT_DATA.map((row) => (
                <tr key={row.label}>
                  <td className="py-2 text-zinc-800">{row.label}</td>
                  <td className="py-2 text-right tabular-nums text-zinc-600">{row.value}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4">
          <Metric label="Median resolution" value="2h 18m" delta="↓ 17%" />
          <Metric label="Escalation rate" value="8.4%" delta="↑ 1.2%" warning />
          <Metric label="CSAT" value="4.7 / 5" delta="↑ 0.3" />
        </div>
      </div>
      <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
        <span>Source: Support export · revision 3</span>
        <button type="button" className="font-medium text-zinc-700 hover:text-zinc-950">
          View source
        </button>
      </div>
    </section>
  );
}

export function SupportEvidenceTable() {
  const [query, setQuery] = useState("");
  const [descending, setDescending] = useState(true);
  const rows = SUPPORT_ROWS.filter((row) =>
    row.theme.toLowerCase().includes(query.toLowerCase()),
  ).sort((left, right) =>
    descending
      ? right.conversations - left.conversations
      : left.conversations - right.conversations,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-end justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
            AI-generated data table · ready
          </div>
          <h3 className="mt-1 font-semibold text-zinc-950">Support evidence</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Showing 4 of 428 sourced conversations</p>
        </div>
        <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Filter themes
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. billing"
            className="mt-1 block w-36 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs normal-case tracking-normal text-zinc-700"
          />
        </label>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Theme
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                <button
                  type="button"
                  onClick={() => setDescending((value) => !value)}
                  className="font-medium"
                >
                  Conversations {descending ? "↓" : "↑"}
                </button>
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Escalation
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                7d trend
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <tr key={row.theme}>
                <th scope="row" className="px-4 py-2.5 font-medium text-zinc-800">
                  {row.theme}
                </th>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">
                  {row.conversations}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-600">
                  {row.escalation}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums ${row.trend.startsWith("+") ? "text-amber-700" : "text-emerald-700"}`}
                >
                  {row.trend}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-5 text-center text-xs text-zinc-500">No themes match this filter.</p>
        ) : null}
      </div>
      <footer className="flex items-center justify-between bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
        <span>Source artifact art_support_csv · revision 3</span>
        <button type="button" className="font-medium text-zinc-700">
          Download full CSV
        </button>
      </footer>
    </section>
  );
}

export function SupportBriefArtifactCard() {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid grid-cols-[150px_1fr]">
        <div
          className="flex min-h-36 flex-col justify-between bg-gradient-to-br from-violet-100 via-violet-50 to-sky-100 p-4"
          role="img"
          aria-label="Preview of the support operations brief showing a violet report cover and summary bars"
        >
          <span className="w-fit rounded-md bg-white/80 px-2 py-1 text-[10px] font-semibold text-violet-700">
            PDF · 6 pages
          </span>
          <div className="space-y-2" aria-hidden="true">
            <div className="h-2 w-20 rounded bg-violet-400" />
            <div className="h-1.5 w-full rounded bg-white/80" />
            <div className="h-1.5 w-4/5 rounded bg-white/80" />
            <div className="h-1.5 w-3/5 rounded bg-white/80" />
          </div>
        </div>
        <div className="flex flex-col p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
            Artifact ready · revision 2
          </div>
          <h3 className="mt-1.5 font-semibold text-zinc-950">Support operations brief</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            Sourced findings, chart data, and the recommended seven-day operating plan.
          </p>
          <dl className="mt-3 grid grid-cols-[58px_1fr] gap-y-1 text-[11px]">
            <dt className="text-zinc-400">Creator</dt>
            <dd className="text-zinc-700">Analyst · step 1</dd>
            <dt className="text-zinc-400">MIME</dt>
            <dd className="text-zinc-700">application/pdf · 842 KB</dd>
          </dl>
          <div className="mt-auto flex gap-2 pt-4">
            <button
              type="button"
              className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
            >
              Open authenticated preview
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700"
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric(props: { label: string; value: string; delta: string; warning?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500">{props.label}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{props.value}</div>
      <div className={`text-[11px] ${props.warning ? "text-amber-700" : "text-emerald-700"}`}>
        {props.delta}
      </div>
    </div>
  );
}

export function OperationsPlanCards() {
  const [decision, setDecision] = useState<"pending" | "approved" | "denied" | "changes_requested">(
    "pending",
  );
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
              Task record · revision 2
            </div>
            <h3 className="mt-1.5 font-semibold text-zinc-950">Reduce billing escalations</h3>
            <p className="mt-1 text-sm leading-5 text-zinc-600">
              Update the billing macro, assign an owner, and review results after 7 days.
            </p>
          </div>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
            In progress
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs">
          <span className="text-zinc-500">
            Assigned to <strong className="font-medium text-zinc-800">Operator</strong>
          </span>
          <button type="button" className="font-medium text-violet-700 hover:text-violet-900">
            Open task →
          </button>
        </div>
      </section>

      <section
        className={`rounded-2xl border p-4 shadow-sm ${decision === "pending" ? "border-amber-300 bg-amber-50/70" : "border-zinc-200 bg-white"}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-sm text-amber-800">
              !
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
                Trusted approval
              </div>
              <h3 className="font-semibold text-zinc-950">Publish updated support macro</h3>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-zinc-600">
            Medium risk
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 rounded-xl border border-amber-200/80 bg-white/70 p-3 text-xs">
          <dt className="text-zinc-500">Service</dt>
          <dd className="font-medium text-zinc-800">Intercom · Workspace account</dd>
          <dt className="text-zinc-500">Exact action</dt>
          <dd className="font-medium text-zinc-800">Update macro “Billing · first response”</dd>
          <dt className="text-zinc-500">Requested by</dt>
          <dd className="font-medium text-zinc-800">Operator</dd>
          <dt className="text-zinc-500">Data leaving</dt>
          <dd className="font-medium text-zinc-800">Macro text only · no customer data</dd>
        </dl>
        {decision === "pending" ? (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-white"
              onClick={() => setDecision("denied")}
            >
              Deny
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              onClick={() => setDecision("changes_requested")}
            >
              Request changes
            </button>
            <button
              type="button"
              className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
              onClick={() => setDecision("approved")}
            >
              Approve once
            </button>
          </div>
        ) : (
          <div
            className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${decision === "approved" ? "bg-emerald-50 text-emerald-800" : decision === "changes_requested" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}
            role="status"
          >
            Decision recorded: {decision}. The coworker will resume after the approval group is
            ready.
          </div>
        )}
      </section>
    </div>
  );
}

export function ConnectionRecoveryCards({ workspaceId }: { workspaceId: string }) {
  const [answer, setAnswer] = useState("reconnect");
  const [submitted, setSubmitted] = useState(false);
  const [questionAnswered, setQuestionAnswered] = useState(false);

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
              Blocked connection
            </div>
            <h3 className="mt-1.5 font-semibold text-zinc-950">Composio verification expired</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              Operator cannot call INTERCOM_UPDATE_MACRO until the fixed workspace service account
              is reconnected. No alternate account will be selected.
            </p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-red-700">
            Action needed
          </span>
        </div>
        <Link
          to={workspaceConnectionsPath(workspaceId)}
          className="mt-3 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
        >
          Open trusted reconnect flow
        </Link>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
          AI-generated choice · waiting for input
        </div>
        <h3 className="mt-1.5 font-semibold text-zinc-950">How should I continue?</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          This answer only guides Operator. It does not reconnect an account or approve an action.
        </p>
        {submitted ? (
          <p
            className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
            role="status"
          >
            Choice recorded: {answer === "reconnect" ? "wait for reconnect" : "finish read-only"}.
          </p>
        ) : (
          <form
            className="mt-3 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            <label className="flex cursor-pointer gap-2 rounded-xl border border-zinc-200 p-3 text-xs">
              <input
                type="radio"
                name="recovery"
                value="reconnect"
                checked={answer === "reconnect"}
                onChange={() => setAnswer("reconnect")}
              />
              <span>
                <strong className="block text-zinc-800">Wait for reconnect</strong>
                <span className="text-zinc-500">Preserve the pending external step.</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-2 rounded-xl border border-zinc-200 p-3 text-xs">
              <input
                type="radio"
                name="recovery"
                value="readonly"
                checked={answer === "readonly"}
                onChange={() => setAnswer("readonly")}
              />
              <span>
                <strong className="block text-zinc-800">Finish read-only</strong>
                <span className="text-zinc-500">
                  Return the current analysis without the external update.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAnswer("reconnect")}
                className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
              >
                Submit choice
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">
          Trusted question · requested by Operator
        </div>
        <h3 className="mt-1.5 font-semibold text-zinc-950">
          Which owner should review the connector tomorrow?
        </h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          Do not paste passwords, API keys, OAuth codes, or other credentials. One question is
          waiting; no approval shares this pause group.
        </p>
        {questionAnswered ? (
          <p
            className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
            role="status"
          >
            Answer encrypted and recorded. Resume will start after confirmation.
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Connector review owner"
              defaultValue="Pramod"
              className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={() => setQuestionAnswered(true)}
              className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white"
            >
              Send answer
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
