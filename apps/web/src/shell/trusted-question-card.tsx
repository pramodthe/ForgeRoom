import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuestionCard } from "@forgeroom/contracts";
import { getQuestionCard, postQuestionAnswer } from "../api/channel-resources-api";
import { ApiError } from "../api/http-client";
import { useSession } from "../auth/session-context";
import { formatPauseGroupLifecycleMessage } from "./pause-group-lifecycle";

type TrustedQuestionCardProps = {
  questionId: string;
  onAnswered?: () => void;
};

function formatPrompt(promptRedacted: QuestionCard["prompt_redacted"]): string {
  if (typeof promptRedacted === "string") {
    return promptRedacted;
  }
  if (promptRedacted && typeof promptRedacted === "object" && !Array.isArray(promptRedacted)) {
    const prompt = promptRedacted.prompt;
    if (typeof prompt === "string") {
      return prompt;
    }
    if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
      const nested = prompt.prompt;
      if (typeof nested === "string") {
        return nested;
      }
    }
  }
  try {
    return JSON.stringify(promptRedacted, null, 2);
  } catch {
    return String(promptRedacted);
  }
}

function groupWaitingMessage(card: QuestionCard): string | null {
  const remaining = card.pause_group_required_action_count - card.pause_group_resolved_action_count;
  if (remaining <= 0) {
    return null;
  }
  if (card.pause_group_has_pending_approvals) {
    return `This pause group has ${remaining} unresolved item(s), including pending approvals. All items must be resolved before work continues.`;
  }
  if (card.pause_group_required_action_count > 1) {
    return `${remaining} item(s) in this pause group still need your response before work continues.`;
  }
  return null;
}

export function TrustedQuestionCard({ questionId, onAnswered }: TrustedQuestionCardProps) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const cardQuery = useQuery({
    queryKey: ["question-card", questionId],
    queryFn: () => getQuestionCard(questionId),
  });

  const answerMutation = useMutation({
    mutationFn: async (input: { answer: string; card: QuestionCard }) => {
      if (!session) throw new Error("Session required.");
      return postQuestionAnswer({
        questionId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_prompt_hash: input.card.prompt_hash,
          answer: input.answer,
          idempotency_key: `web_${questionId}_${Date.now()}`,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["question-card", questionId] });
      onAnswered?.();
    },
  });

  if (cardQuery.isLoading) {
    return (
      <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-900">
        Loading question…
      </section>
    );
  }

  if (cardQuery.error || !cardQuery.data) {
    const message =
      cardQuery.error instanceof ApiError ? cardQuery.error.message : "Unable to load question.";
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
  const answered = card.state !== "requested";
  const busy = answerMutation.isPending;
  const waitingMessage = groupWaitingMessage(card);
  const lifecycleLines =
    answerMutation.data != null
      ? formatPauseGroupLifecycleMessage({
          recordedVerb: "answer",
          pauseGroupReady: answerMutation.data.pause_group_ready,
          pauseGroupState: answerMutation.data.pause_group_state,
          requiredActionCount: answerMutation.data.required_action_count,
          resolvedActionCount: answerMutation.data.resolved_action_count,
        })
      : null;

  return (
    <section
      className="rounded-2xl border border-sky-300 bg-sky-50/80 p-4 shadow-sm"
      aria-label="Trusted question card"
      data-testid="trusted-question-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
            Trusted question
          </div>
          <p className="mt-1 text-xs text-zinc-600">{card.coworker_name}</p>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-sky-800 ring-1 ring-sky-200">
          {card.state}
        </span>
      </div>

      <p className="mt-4 text-sm font-medium text-zinc-950">{formatPrompt(card.prompt_redacted)}</p>

      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Do not paste passwords, API keys, OAuth tokens, or other credentials in your answer.
      </p>

      {waitingMessage ? (
        <p className="mt-3 text-xs text-zinc-600" data-testid="question-group-waiting">
          {waitingMessage}
        </p>
      ) : null}

      {answerMutation.error ? (
        <p className="mt-3 text-xs text-red-700" role="alert">
          {answerMutation.error instanceof Error ? answerMutation.error.message : "Answer failed."}
        </p>
      ) : null}

      {!answered ? (
        <form
          className="mt-4 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const answer = new FormData(form).get("answer");
            if (typeof answer !== "string" || !answer.trim()) return;
            answerMutation.mutate({ answer: answer.trim(), card });
            form.reset();
          }}
        >
          <label
            className="block text-xs font-medium text-zinc-600"
            htmlFor={`answer-${questionId}`}
          >
            Your answer
          </label>
          <textarea
            id={`answer-${questionId}`}
            name="answer"
            rows={3}
            disabled={busy || !session}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-50"
            placeholder="Type your answer…"
          />
          <button
            type="submit"
            disabled={busy || !session}
            className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            Submit answer
          </button>
        </form>
      ) : (
        <div className="mt-4 space-y-1 text-xs text-zinc-600" data-testid="question-lifecycle">
          {(lifecycleLines ?? ["Answer recorded. Resume state updates on the timeline."]).map(
            (line) => (
              <p key={line}>{line}</p>
            ),
          )}
        </div>
      )}
    </section>
  );
}
