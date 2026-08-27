import {
  actingIdentitySchema,
  approvalCardSchema,
  approvalDecisionCommandSchema,
  approvalDecisionResultSchema,
  type ApprovalCard,
  type ApprovalDecisionCommand,
  type ApprovalDecisionResult,
  type ErrorCode,
  type SessionResponse,
} from "@forgeroom/contracts";
import {
  buildApprovalCard,
  isOwnerRole,
  type ProposalDecisionSnapshot,
} from "@forgeroom/domain";
import {
  derivePausePayloadKey,
  loadApprovalProposalForCard,
  recordApprovalDecision,
  type ApprovalProposalCardSnapshot,
  type createSql,
} from "@forgeroom/db";
import type { ApiEnv } from "../env";

type SqlClient = ReturnType<typeof createSql>;

export type ApprovalServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

function snapshotToDomain(snapshot: ApprovalProposalCardSnapshot): ProposalDecisionSnapshot {
  const acting = actingIdentitySchema.parse(snapshot.actingIdentity);
  return {
    id: snapshot.id,
    requiredActionId: snapshot.requiredActionId,
    pauseGroupId: snapshot.pauseGroupId,
    channelId: snapshot.channelId,
    runId: snapshot.runId,
    runStepId: snapshot.runStepId,
    agentTurnId: snapshot.agentTurnId,
    coworkerId: snapshot.coworkerId,
    coworkerHandle: snapshot.coworkerHandle,
    coworkerName: snapshot.coworkerName,
    logicalThreadId: snapshot.logicalThreadId,
    toolCallId: snapshot.toolCallId,
    toolName: snapshot.toolName,
    observedDescriptorHash: snapshot.observedDescriptorHash,
    approvalPolicyHash: snapshot.approvalPolicyHash,
    connectorBindingId: snapshot.connectorBindingId,
    accountId: snapshot.accountId,
    actingIdentity: acting,
    redactedArguments: snapshot.redactedArguments as ProposalDecisionSnapshot["redactedArguments"],
    argumentsHash: snapshot.argumentsHash,
    redactedTarget: snapshot.redactedTarget as ProposalDecisionSnapshot["redactedTarget"],
    targetHash: snapshot.targetHash,
    artifactRevisionHash: snapshot.artifactRevisionHash,
    expectedEffect: snapshot.expectedEffect,
    riskClass: snapshot.riskClass,
    payloadHash: snapshot.payloadHash,
    sessionGeneration: snapshot.sessionGeneration,
    sessionGenerationId: snapshot.sessionGenerationId,
    liveApprovalPolicyHash: snapshot.liveApprovalPolicyHash,
    liveSessionGeneration: snapshot.liveSessionGeneration,
    state: snapshot.state,
    expiresAt: snapshot.expiresAt,
    providerIdempotencyKey: snapshot.providerIdempotencyKey,
  };
}

export function parseApprovalDecisionCommand(
  input: unknown,
): { ok: true; value: ApprovalDecisionCommand } | { ok: false } {
  const parsed = approvalDecisionCommandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export type ApprovalService = {
  getApprovalCard(
    session: SessionResponse,
    proposalId: string,
  ): Promise<ApprovalServiceResult<ApprovalCard>>;
  decideApproval(
    session: SessionResponse,
    proposalId: string,
    command: ApprovalDecisionCommand,
  ): Promise<ApprovalServiceResult<ApprovalDecisionResult>>;
};

export function createApprovalService(options: {
  env: ApiEnv;
  sql: SqlClient;
}): ApprovalService {
  const encryptionKey = derivePausePayloadKey(options.env.pausePayloadEncryptionSecret);

  return {
    async getApprovalCard(session, proposalId) {
      const loaded = await loadApprovalProposalForCard(options.sql, {
        proposalId,
        workspaceId: session.workspace_id,
      });
      if (!loaded.ok) {
        return {
          ok: false,
          error: {
            code: loaded.reason === "forbidden" ? "forbidden" : "not_found",
            message:
              loaded.reason === "forbidden"
                ? "Proposal is outside this workspace."
                : "Approval proposal not found.",
          },
        };
      }
      const card = approvalCardSchema.parse(buildApprovalCard(snapshotToDomain(loaded.snapshot)));
      return { ok: true, value: card };
    },

    async decideApproval(session, proposalId, command) {
      // Defense in depth: AuthService already resolves owner-only sessions.
      if (!isOwnerRole(session.user.role)) {
        return {
          ok: false,
          error: { code: "forbidden", message: "Only the workspace owner may decide approvals." },
        };
      }
      const recorded = await recordApprovalDecision(options.sql, {
        proposalId,
        workspaceId: session.workspace_id,
        actorUserId: session.user.id,
        command,
        encryptionKey,
      });
      if (!recorded.ok) {
        const code: ErrorCode =
          recorded.reason === "not_found"
            ? "not_found"
            : recorded.reason === "forbidden"
              ? "forbidden"
              : recorded.reason === "decision_already_recorded"
                ? "decision_already_recorded"
                : recorded.reason === "expired_proposal"
                  ? "expired_proposal"
                  : recorded.reason === "stale_proposal"
                    ? "stale_proposal"
                    : "validation_failed";
        return {
          ok: false,
          error: {
            code,
            message:
              recorded.reason === "decision_already_recorded"
                ? "A decision was already recorded for this proposal."
                : recorded.reason === "expired_proposal"
                  ? "Proposal has expired."
                  : recorded.reason === "stale_proposal"
                    ? "Proposal bindings are stale."
                    : recorded.reason === "forbidden"
                      ? "Proposal is outside this workspace."
                      : recorded.reason === "not_found"
                        ? "Approval proposal not found."
                        : "Proposal cannot accept a decision.",
          },
        };
      }

      const result = approvalDecisionResultSchema.parse({
        schemaVersion: 1,
        proposal_id: recorded.proposalId,
        decision: recorded.decision,
        proposal_state: recorded.proposalState,
        pause_group_id: recorded.pauseGroupId,
        pause_group_state: recorded.pauseGroupState,
        pause_group_ready: recorded.pauseGroupReady,
        required_action_count: recorded.requiredActionCount,
        resolved_action_count: recorded.resolvedActionCount,
        correction_draft: recorded.correctionDraft
          ? {
              queue_item_id: recorded.correctionDraft.queueItemId,
              run_step_id: recorded.correctionDraft.runStepId,
              prior_run_step_id: recorded.correctionDraft.priorRunStepId,
              content: recorded.correctionDraft.content,
            }
          : null,
        provider_calls: 0,
      });
      return { ok: true, value: result };
    },
  };
}
