import {
  channelPendingQuestionsResponseSchema,
  questionAnswerCommandSchema,
  questionAnswerResultSchema,
  questionCardSchema,
  type ChannelPendingQuestionsResponse,
  type ErrorCode,
  type QuestionAnswerCommand,
  type QuestionAnswerResult,
  type QuestionCard,
  type SessionResponse,
} from "@forgeroom/contracts";
import { buildQuestionCard, isOwnerRole } from "@forgeroom/domain";
import {
  derivePausePayloadKey,
  listPendingQuestionIds,
  loadQuestionForCard,
  recordQuestionAnswer,
  type createSql,
} from "@forgeroom/db";
import type { ApiEnv } from "../env";

type SqlClient = ReturnType<typeof createSql>;

export type QuestionServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string } };

export function parseQuestionAnswerCommand(
  input: unknown,
): { ok: true; value: QuestionAnswerCommand } | { ok: false } {
  const parsed = questionAnswerCommandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export type QuestionService = {
  getQuestionCard(
    session: SessionResponse,
    questionId: string,
  ): Promise<QuestionServiceResult<QuestionCard>>;
  listPendingQuestions(
    session: SessionResponse,
    channelId: string,
  ): Promise<QuestionServiceResult<ChannelPendingQuestionsResponse>>;
  answerQuestion(
    session: SessionResponse,
    questionId: string,
    command: QuestionAnswerCommand,
  ): Promise<QuestionServiceResult<QuestionAnswerResult>>;
};

export function createQuestionService(options: { env: ApiEnv; sql: SqlClient }): QuestionService {
  const encryptionKey = derivePausePayloadKey(options.env.pausePayloadEncryptionSecret);

  return {
    async getQuestionCard(session, questionId) {
      const loaded = await loadQuestionForCard(options.sql, {
        questionId,
        workspaceId: session.workspace_id,
      });
      if (!loaded.ok) {
        return {
          ok: false,
          error: {
            code: loaded.reason === "forbidden" ? "forbidden" : "not_found",
            message:
              loaded.reason === "forbidden"
                ? "Question is outside this workspace."
                : "Question not found.",
          },
        };
      }
      const card = questionCardSchema.parse(
        buildQuestionCard({
          ...loaded.snapshot,
          promptRedacted: loaded.snapshot.promptRedacted as QuestionCard["prompt_redacted"],
        }),
      );
      return { ok: true, value: card };
    },

    async listPendingQuestions(session, channelId) {
      const channel = await options.sql<{ workspace_id: string }[]>`
        SELECT workspace_id FROM channels WHERE id = ${channelId} LIMIT 1
      `;
      const row = channel[0];
      if (!row) {
        return { ok: false, error: { code: "not_found", message: "Channel not found." } };
      }
      if (row.workspace_id !== session.workspace_id) {
        return {
          ok: false,
          error: { code: "forbidden", message: "Channel is outside this workspace." },
        };
      }
      const questionIds = await listPendingQuestionIds(options.sql, {
        channelId,
        workspaceId: session.workspace_id,
      });
      const value = channelPendingQuestionsResponseSchema.parse({
        schemaVersion: 1,
        channel_id: channelId,
        question_ids: questionIds,
      });
      return { ok: true, value };
    },

    async answerQuestion(session, questionId, command) {
      if (!isOwnerRole(session.user.role)) {
        return {
          ok: false,
          error: { code: "forbidden", message: "Only the workspace owner may answer questions." },
        };
      }
      const recorded = await recordQuestionAnswer(options.sql, {
        questionId,
        workspaceId: session.workspace_id,
        actorUserId: session.user.id,
        expectedPromptHash: command.expected_prompt_hash,
        answer: command.answer,
        encryptionKey,
      });
      if (!recorded.ok) {
        const code: ErrorCode =
          recorded.reason === "not_found"
            ? "not_found"
            : recorded.reason === "forbidden"
              ? "forbidden"
              : recorded.reason === "already_answered"
                ? "decision_already_recorded"
                : recorded.reason === "expired"
                  ? "expired_proposal"
                  : recorded.reason === "stale_prompt"
                    ? "stale_proposal"
                    : "validation_failed";
        return {
          ok: false,
          error: {
            code,
            message:
              recorded.reason === "already_answered"
                ? "This question was already answered."
                : recorded.reason === "expired"
                  ? "Question has expired."
                  : recorded.reason === "stale_prompt"
                    ? "Question prompt is stale."
                    : recorded.reason === "forbidden"
                      ? "Question is outside this workspace."
                      : recorded.reason === "not_found"
                        ? "Question not found."
                        : "Question cannot accept an answer.",
          },
        };
      }

      const groupState = await options.sql<{ state: string }[]>`
        SELECT state FROM pause_groups WHERE id = ${recorded.pauseGroupId} LIMIT 1
      `;
      const result = questionAnswerResultSchema.parse({
        schemaVersion: 1,
        question_id: recorded.questionId,
        question_state: "answered",
        pause_group_id: recorded.pauseGroupId,
        pause_group_state: groupState[0]?.state ?? "collecting",
        pause_group_ready: recorded.pauseGroupReady,
        required_action_count: recorded.requiredActionCount,
        resolved_action_count: recorded.resolvedActionCount,
      });
      return { ok: true, value: result };
    },
  };
}
