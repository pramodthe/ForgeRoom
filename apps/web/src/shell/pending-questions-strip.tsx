import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listChannelPendingQuestions } from "../api/channel-resources-api";
import { TrustedQuestionCard } from "./trusted-question-card";

export function PendingQuestionsStrip(props: { channelId: string; archived: boolean }) {
  const queryClient = useQueryClient();
  const pendingQuery = useQuery({
    queryKey: ["channel-pending-questions", props.channelId],
    queryFn: () => listChannelPendingQuestions(props.channelId),
    enabled: !props.archived,
    refetchInterval: props.archived ? false : 10_000,
  });

  const questionIds = pendingQuery.data?.question_ids ?? [];
  if (questionIds.length === 0) {
    return null;
  }

  return (
    <section
      className="trusted-hitl-strip border-b border-sky-200 bg-sky-50/80 px-4 py-3"
      aria-label="Pending questions"
    >
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
          Questions awaiting your answer
        </div>
        {questionIds.map((questionId) => (
          <TrustedQuestionCard
            key={questionId}
            questionId={questionId}
            onAnswered={() => {
              void queryClient.invalidateQueries({
                queryKey: ["channel-pending-questions", props.channelId],
              });
            }}
          />
        ))}
      </div>
    </section>
  );
}
