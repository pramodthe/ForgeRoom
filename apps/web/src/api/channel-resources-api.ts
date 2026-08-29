import type {
  ApprovalCard,
  ApprovalDecisionCommand,
  ApprovalDecisionResult,
  AuditReceipt,
  ChannelPendingApprovalsResponse,
  ChannelPendingQuestionsResponse,
  QuestionAnswerCommand,
  QuestionAnswerResult,
  QuestionCard,
  RunCancelCommand,
  RunCancelResult,
  RunDetailResponse,
  UiDataFunctionCommand,
  UiInstanceReplayResponse,
} from "@forgeroom/contracts";
import {
  approvalCardSchema,
  approvalDecisionResultSchema,
  auditReceiptSchema,
  channelPendingApprovalsResponseSchema,
  channelPendingQuestionsResponseSchema,
  questionAnswerResultSchema,
  questionCardSchema,
  runCancelResultSchema,
  runDetailResponseSchema,
  uiInstanceReplayResponseSchema,
} from "@forgeroom/contracts";
import { apiFetch, ApiError, stripRequestId } from "./http-client";

export async function getApprovalCard(proposalId: string): Promise<ApprovalCard> {
  const body = await apiFetch<{ card: unknown; request_id: string }>(
    `/api/approvals/${encodeURIComponent(proposalId)}`,
  );
  return approvalCardSchema.parse(stripRequestId(body).card);
}

export async function postApprovalDecision(input: {
  proposalId: string;
  command: ApprovalDecisionCommand;
  csrfToken: string;
}): Promise<ApprovalDecisionResult> {
  const body = await apiFetch<unknown>(
    `/api/approvals/${encodeURIComponent(input.proposalId)}/decision`,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: JSON.stringify(input.command),
    },
  );
  return approvalDecisionResultSchema.parse(stripRequestId(body as { request_id: string }));
}

export async function listChannelPendingApprovals(
  channelId: string,
): Promise<ChannelPendingApprovalsResponse> {
  const body = await apiFetch<unknown>(
    `/api/channels/${encodeURIComponent(channelId)}/pending-approvals`,
  );
  return channelPendingApprovalsResponseSchema.parse(
    stripRequestId(body as { request_id: string }),
  );
}

export async function getQuestionCard(questionId: string): Promise<QuestionCard> {
  const body = await apiFetch<{ card: unknown; request_id: string }>(
    `/api/questions/${encodeURIComponent(questionId)}`,
  );
  return questionCardSchema.parse(stripRequestId(body).card);
}

export async function postQuestionAnswer(input: {
  questionId: string;
  command: QuestionAnswerCommand;
  csrfToken: string;
}): Promise<QuestionAnswerResult> {
  const body = await apiFetch<unknown>(
    `/api/questions/${encodeURIComponent(input.questionId)}/answer`,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: JSON.stringify(input.command),
    },
  );
  return questionAnswerResultSchema.parse(stripRequestId(body as { request_id: string }));
}

export async function listChannelPendingQuestions(
  channelId: string,
): Promise<ChannelPendingQuestionsResponse> {
  const body = await apiFetch<unknown>(
    `/api/channels/${encodeURIComponent(channelId)}/pending-questions`,
  );
  return channelPendingQuestionsResponseSchema.parse(
    stripRequestId(body as { request_id: string }),
  );
}

export async function getRun(runId: string): Promise<RunDetailResponse> {
  const body = await apiFetch<unknown>(`/api/runs/${encodeURIComponent(runId)}`);
  return runDetailResponseSchema.parse(stripRequestId(body as { request_id: string }));
}

export async function cancelRun(input: {
  runId: string;
  command: RunCancelCommand;
  csrfToken: string;
}): Promise<RunCancelResult> {
  const body = await apiFetch<unknown>(`/api/runs/${encodeURIComponent(input.runId)}/cancel`, {
    method: "POST",
    csrfToken: input.csrfToken,
    body: JSON.stringify(input.command),
  });
  return runCancelResultSchema.parse(stripRequestId(body as { request_id: string }));
}

export async function getRunReceipt(runId: string): Promise<{
  receipt: AuditReceipt;
  receipt_hash: string;
  disclaimer: string;
}> {
  const body = await apiFetch<{
    receipt: unknown;
    receipt_hash: string;
    disclaimer: string;
    request_id: string;
  }>(`/api/runs/${encodeURIComponent(runId)}/receipt`);
  const parsed = stripRequestId(body);
  return {
    receipt: auditReceiptSchema.parse(parsed.receipt),
    receipt_hash: parsed.receipt_hash,
    disclaimer: parsed.disclaimer,
  };
}

export async function getUiInstanceReplay(instanceId: string): Promise<UiInstanceReplayResponse> {
  const body = await apiFetch<unknown>(`/api/ui-instances/${encodeURIComponent(instanceId)}`);
  return uiInstanceReplayResponseSchema.parse(stripRequestId(body as { request_id: string }));
}

export async function postUiInstanceDataFunction(input: {
  instanceId: string;
  functionName: string;
  command: UiDataFunctionCommand;
  csrfToken: string;
}): Promise<unknown> {
  const body = await apiFetch<{ data: unknown; request_id: string }>(
    `/api/ui-instances/${encodeURIComponent(input.instanceId)}/data/${encodeURIComponent(input.functionName)}`,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: JSON.stringify(input.command),
    },
  );
  return stripRequestId(body).data;
}

export async function getArtifact(artifactId: string) {
  const body = await apiFetch<{ artifact: unknown; request_id: string }>(
    `/api/artifacts/${encodeURIComponent(artifactId)}`,
  );
  return stripRequestId(body).artifact;
}

export async function artifactDownloadUrl(artifactId: string): Promise<string> {
  return `/api/artifacts/${encodeURIComponent(artifactId)}/download`;
}

export { ApiError };
