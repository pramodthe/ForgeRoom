import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApprovalCard } from "@forgeroom/contracts";
import { getApprovalCard, postApprovalDecision } from "../api/channel-resources-api";
import { ApiError } from "../api/http-client";
import { useSession } from "../auth/session-context";
import { formatPauseGroupLifecycleMessage } from "./pause-group-lifecycle";
import { PoliteStatus } from "./polite-status";

type TrustedApprovalCardProps = {
  proposalId: string;
  onDecided?: () => void;
};

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TrustedApprovalCard({ proposalId, onDecided }: TrustedApprovalCardProps) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const correctionFieldId = useId();
  const statusId = useId();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const cardQuery = useQuery({
    queryKey: ["approval-card", proposalId],
    queryFn: () => getApprovalCard(proposalId),
  });

  const decisionMutation = useMutation({
    mutationFn: async (input: {
      decision: ApprovalCard extends never ? never : "allow" | "deny" | "request_changes";
      reason?: string;
      card: ApprovalCard;
    }) => {
      if (!session) throw new Error("Session required.");
      return postApprovalDecision({
        proposalId,
        csrfToken: session.csrf_token,
        command: {
          decision: input.decision,
          expected_arguments_hash: input.card.arguments_hash,
          expected_descriptor_hash: input.card.observed_descriptor_hash,
          expected_session_generation: input.card.session_generation,
          reason: input.reason ?? null,
        },
      });
    },
    onSuccess: async () => {
      setCorrectionOpen(false);
      setCorrectionReason("");
      await queryClient.invalidateQueries({ queryKey: ["approval-card", proposalId] });
      onDecided?.();
    },
  });

  if (cardQuery.isLoading) {
    return (
      <section
        className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900"
        aria-busy="true"
        aria-label="Loading approval request"
      >
        Loading approval request…
      </section>
    );
  }

  if (cardQuery.error || !cardQuery.data) {
    const message =
      cardQuery.error instanceof ApiError
        ? cardQuery.error.message
        : "Unable to load approval card.";
    return (
      <section
        className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role="alert"
      >
        {message}
      </section>
    );
  }

  const card = cardQuery.data;
  const decided = card.state !== "proposed" && card.state !== "executing";
  const busy = decisionMutation.isPending;
  const lifecycleLines =
    decisionMutation.data != null
      ? formatPauseGroupLifecycleMessage({
          recordedVerb: "decision",
          pauseGroupReady: decisionMutation.data.pause_group_ready,
          pauseGroupState: decisionMutation.data.pause_group_state,
          requiredActionCount: decisionMutation.data.required_action_count,
          resolvedActionCount: decisionMutation.data.resolved_action_count,
        })
      : null;
  const statusMessage = busy
    ? "Submitting approval decision."
    : lifecycleLines
      ? lifecycleLines.join(" ")
      : null;

  return (
    <section
      className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm"
      aria-label="Trusted approval card"
      aria-busy={busy}
      aria-describedby={statusId}
      data-testid="trusted-approval-card"
    >
      <PoliteStatus id={statusId} message={statusMessage} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Trusted approval
          </div>
          <h3 className="mt-1 text-sm font-semibold text-zinc-950">{card.tool_name}</h3>
          <p className="mt-1 text-xs text-zinc-600">
            {card.coworker_name} · fixed account {card.account_id.slice(-4)}
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
          {card.state}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-xs text-zinc-700">
        <div>
          <dt className="font-medium text-zinc-500">Expected effect</dt>
          <dd className="mt-0.5">{card.expected_effect}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Target</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-mono text-[11px]">
            {formatJson(card.redacted_target)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Arguments</dt>
          <dd className="mt-0.5 whitespace-pre-wrap font-mono text-[11px]">
            {formatJson(card.redacted_arguments)}
          </dd>
        </div>
      </dl>

      {decisionMutation.error ? (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {decisionMutation.error instanceof Error
            ? decisionMutation.error.message
            : "Decision failed."}
        </p>
      ) : null}

      {!decided ? (
        correctionOpen ? (
          <form
            className="mt-4 space-y-2"
            aria-label="Request approval changes"
            onSubmit={(event) => {
              event.preventDefault();
              const reason = correctionReason.trim();
              if (!reason) return;
              decisionMutation.mutate({ decision: "request_changes", card, reason });
            }}
          >
            <label className="block text-xs font-medium text-zinc-600" htmlFor={correctionFieldId}>
              Describe the correction needed
            </label>
            <textarea
              id={correctionFieldId}
              name="correction"
              rows={3}
              required
              disabled={busy || !session}
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || !session || correctionReason.trim().length === 0}
                className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                Submit correction request
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-50"
                onClick={() => {
                  setCorrectionOpen(false);
                  setCorrectionReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Approval actions">
            <button
              type="button"
              disabled={busy || !session}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              onClick={() => decisionMutation.mutate({ decision: "allow", card })}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy || !session}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 disabled:opacity-50"
              onClick={() => decisionMutation.mutate({ decision: "deny", card })}
            >
              Deny
            </button>
            <button
              type="button"
              disabled={busy || !session}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
              onClick={() => setCorrectionOpen(true)}
            >
              Request changes
            </button>
          </div>
        )
      ) : (
        <div
          className="mt-4 space-y-1 text-xs text-zinc-600"
          data-testid="approval-lifecycle"
          aria-live="polite"
        >
          {(lifecycleLines ?? ["Decision recorded. Resume state updates on the timeline."]).map(
            (line) => (
              <p key={line}>{line}</p>
            ),
          )}
        </div>
      )}
    </section>
  );
}
