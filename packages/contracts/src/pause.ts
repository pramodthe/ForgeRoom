import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonValueSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";

const encryptedPayloadSchema = z.string().min(1);
const optionalTimestampSchema = isoDateTimeSchema.nullable();
const questionAnswerTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(4_000)
  .superRefine((answer, ctx) => {
    const knownCredentialPatterns = [
      /\b(?:password|passcode|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization)\b\s*[:=]/i,
      /\bbearer\s+[a-z0-9._~+/=-]+/i,
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    ];
    if (knownCredentialPatterns.some((pattern) => pattern.test(answer))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "question answers cannot contain credentials",
      });
    }
  });

function addRequiredIssue(ctx: z.RefinementCtx, path: string, message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
}

function addChronologyIssue(
  ctx: z.RefinementCtx,
  earlier: string,
  later: string,
  path: string,
): void {
  if (Date.parse(later) < Date.parse(earlier)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [path],
      message: `${path} cannot precede its prior lifecycle timestamp`,
    });
  }
}

export const pauseGroupStateSchema = z.enum([
  "collecting",
  "ready",
  "resuming",
  "resumed",
  "stale",
  "expired",
  "cancelled",
  "uncertain",
]);

export const actionProposalStateSchema = z.enum([
  "proposed",
  "allowed",
  "denied",
  "expired",
  "stale",
  "executing",
  "succeeded",
  "failed",
  "unknown",
  "reconciled_succeeded",
  "reconciled_failed",
]);

export const requiredActionTypeSchema = z.enum(["approval", "question", "connection"]);

export const requiredActionStateSchema = z.enum([
  "pending",
  "resolved",
  "expired",
  "stale",
  "cancelled",
]);

export const pauseResumeStateSchema = z.enum([
  "intended",
  "claimed",
  "creating",
  "uncertain",
  "completed",
  "reconciled",
  "failed",
]);

export const actingIdentitySchema = z
  .object({
    service: z.string().min(1),
    account_display: z.string().min(1),
    principal_type: z.enum(["user", "service_account", "application", "bot"]),
    principal_display: z.string().min(1),
    principal_id_hash: sha256Schema,
  })
  .strict();

export const pauseGroupSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    agent_turn_id: opaqueIdSchema,
    trueforge_turn_id: opaqueIdSchema,
    generation: z.number().int().positive(),
    state: pauseGroupStateSchema,
    required_action_count: z.number().int().positive(),
    resolved_action_count: nonNegativeIntSchema,
    resume_claim_token: opaqueIdSchema.nullable(),
    created_at: isoDateTimeSchema,
    ready_at: optionalTimestampSchema,
    resumed_at: optionalTimestampSchema,
  })
  .strict()
  .superRefine((group, ctx) => {
    if (group.resolved_action_count > group.required_action_count) {
      addRequiredIssue(
        ctx,
        "resolved_action_count",
        "resolved_action_count cannot exceed required_action_count",
      );
    }

    const isComplete = group.resolved_action_count === group.required_action_count;
    const isClaimed = ["resuming", "resumed", "uncertain"].includes(group.state);

    if (group.state === "collecting" && isComplete) {
      addRequiredIssue(ctx, "state", "a complete PauseGroup cannot remain collecting");
    }
    if (["ready", "resuming", "resumed", "uncertain"].includes(group.state) && !isComplete) {
      addRequiredIssue(ctx, "state", `${group.state} requires every required action to resolve`);
    }

    if (isComplete !== (group.ready_at !== null)) {
      addRequiredIssue(
        ctx,
        "ready_at",
        "ready_at must be present exactly when every required action has resolved",
      );
    }
    if (isClaimed !== (group.resume_claim_token !== null)) {
      addRequiredIssue(
        ctx,
        "resume_claim_token",
        "resume_claim_token must be present only while or after the response intent is claimed",
      );
    }
    if ((group.state === "resumed") !== (group.resumed_at !== null)) {
      addRequiredIssue(ctx, "resumed_at", "resumed_at must be present only for a resumed group");
    }

    if (group.ready_at !== null) {
      addChronologyIssue(ctx, group.created_at, group.ready_at, "ready_at");
    }
    if (group.ready_at !== null && group.resumed_at !== null) {
      addChronologyIssue(ctx, group.ready_at, group.resumed_at, "resumed_at");
    }
  });

export const requiredActionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    pause_group_id: opaqueIdSchema,
    provider_action_id: opaqueIdSchema,
    action_type: requiredActionTypeSchema,
    state: requiredActionStateSchema,
    payload_redacted: safeJsonValueSchema,
    payload_hash: sha256Schema,
    response_ciphertext: encryptedPayloadSchema.nullable(),
    response_redacted: safeJsonValueSchema.nullable(),
    resolved_by: opaqueIdSchema.nullable(),
    resolved_at: optionalTimestampSchema,
    created_at: isoDateTimeSchema,
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.state === "pending") {
      if (action.response_ciphertext !== null || action.response_redacted !== null) {
        addRequiredIssue(ctx, "state", "a pending RequiredAction cannot contain a response");
      }
      if (action.resolved_by !== null || action.resolved_at !== null) {
        addRequiredIssue(ctx, "state", "a pending RequiredAction cannot be resolved");
      }
      return;
    }

    if (action.resolved_at === null) {
      addRequiredIssue(ctx, "resolved_at", "a terminal RequiredAction requires resolved_at");
    } else {
      addChronologyIssue(ctx, action.created_at, action.resolved_at, "resolved_at");
    }

    if (action.state === "resolved") {
      if (action.response_ciphertext === null) {
        addRequiredIssue(
          ctx,
          "response_ciphertext",
          "a resolved RequiredAction requires an encrypted response",
        );
      }
      if (action.resolved_by === null) {
        addRequiredIssue(ctx, "resolved_by", "a resolved RequiredAction requires resolved_by");
      }
      return;
    }

    if (action.response_ciphertext !== null || action.response_redacted !== null) {
      addRequiredIssue(
        ctx,
        "state",
        `${action.state} RequiredActions cannot contain a response payload`,
      );
    }
  });

export const pauseResumeSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    pause_group_id: opaqueIdSchema,
    expected_generation: z.number().int().positive(),
    application_run_token: opaqueIdSchema,
    response_payload_hash: sha256Schema,
    response_payload_ciphertext: encryptedPayloadSchema,
    state: pauseResumeStateSchema,
    trueforge_resume_turn_id: opaqueIdSchema.nullable(),
    claimed_by: opaqueIdSchema.nullable(),
    created_at: isoDateTimeSchema,
    completed_at: optionalTimestampSchema,
  })
  .strict()
  .superRefine((resume, ctx) => {
    const requiresClaim = resume.state !== "intended";
    if (requiresClaim !== (resume.claimed_by !== null)) {
      addRequiredIssue(
        ctx,
        "claimed_by",
        "claimed_by must be present exactly after a worker wins the resume intent",
      );
    }

    const hasConfirmedTurn = ["completed", "reconciled"].includes(resume.state);
    if (hasConfirmedTurn !== (resume.trueforge_resume_turn_id !== null)) {
      addRequiredIssue(
        ctx,
        "trueforge_resume_turn_id",
        "a confirmed or reconciled resume requires exactly one TrueForge turn binding",
      );
    }

    const isTerminal = ["completed", "reconciled", "failed"].includes(resume.state);
    if (isTerminal !== (resume.completed_at !== null)) {
      addRequiredIssue(
        ctx,
        "completed_at",
        "completed_at must be present exactly for a terminal resume intent",
      );
    }
    if (resume.completed_at !== null) {
      addChronologyIssue(ctx, resume.created_at, resume.completed_at, "completed_at");
    }
  });

export const actionProposalSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    required_action_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    run_step_id: opaqueIdSchema,
    coworker_id: opaqueIdSchema,
    logical_thread_id: opaqueIdSchema,
    agent_turn_id: opaqueIdSchema,
    tool_call_id: opaqueIdSchema,
    session_generation_id: opaqueIdSchema,
    session_generation: z.number().int().positive(),
    approval_policy_hash: sha256Schema,
    connector_binding_id: opaqueIdSchema,
    account_id: opaqueIdSchema,
    tool_name: z.string().min(1),
    observed_descriptor_hash: sha256Schema,
    acting_identity: actingIdentitySchema,
    acting_identity_hash: sha256Schema,
    redacted_arguments: safeJsonValueSchema,
    arguments_hash: sha256Schema,
    redacted_target: safeJsonValueSchema,
    target_hash: sha256Schema,
    artifact_revision_hash: sha256Schema.nullable(),
    expected_effect: z.string().min(1),
    risk_class: z.enum(["low", "medium", "high"]),
    state: actionProposalStateSchema,
    expires_at: isoDateTimeSchema,
    provider_idempotency_key: z.string().min(1).max(512).nullable(),
    decided_by: opaqueIdSchema.nullable(),
    decision_reason: z.string().min(1).max(2_000).nullable(),
    decided_at: optionalTimestampSchema,
    executed_at: optionalTimestampSchema,
    provider_receipt: safeJsonValueSchema.nullable(),
  })
  .strict()
  .superRefine((proposal, ctx) => {
    const requiresHumanDecision = [
      "allowed",
      "denied",
      "executing",
      "succeeded",
      "failed",
      "unknown",
      "reconciled_succeeded",
      "reconciled_failed",
    ].includes(proposal.state);
    const mayPreserveHumanDecision = ["stale", "expired"].includes(proposal.state);
    const hasAnyDecisionMetadata =
      proposal.decided_by !== null ||
      proposal.decided_at !== null ||
      proposal.decision_reason !== null;
    const hasCompleteDecisionMetadata =
      proposal.decided_by !== null && proposal.decided_at !== null;

    if (requiresHumanDecision && !hasCompleteDecisionMetadata) {
      addRequiredIssue(
        ctx,
        "decided_at",
        "decision identity and timestamp are required after allow or deny",
      );
    }
    if (mayPreserveHumanDecision && hasAnyDecisionMetadata && !hasCompleteDecisionMetadata) {
      addRequiredIssue(
        ctx,
        "decided_at",
        "stale or expired proposals preserve either a complete decision tuple or none",
      );
    }
    if (!requiresHumanDecision && !mayPreserveHumanDecision && hasAnyDecisionMetadata) {
      addRequiredIssue(ctx, "decided_at", "proposed actions cannot carry decision metadata");
    }

    const hasExecution = [
      "succeeded",
      "failed",
      "unknown",
      "reconciled_succeeded",
      "reconciled_failed",
    ].includes(proposal.state);
    if (hasExecution !== (proposal.executed_at !== null)) {
      addRequiredIssue(
        ctx,
        "executed_at",
        "executed_at must be present exactly after an external execution attempt finishes",
      );
    }

    const requiresReceipt = [
      "succeeded",
      "failed",
      "reconciled_succeeded",
      "reconciled_failed",
    ].includes(proposal.state);
    if (requiresReceipt && proposal.provider_receipt === null) {
      addRequiredIssue(
        ctx,
        "provider_receipt",
        `${proposal.state} requires a safe provider receipt`,
      );
    }
    if (!hasExecution && proposal.provider_receipt !== null) {
      addRequiredIssue(
        ctx,
        "provider_receipt",
        "a provider receipt cannot exist before an execution attempt finishes",
      );
    }

    if (proposal.decided_at !== null && proposal.executed_at !== null) {
      addChronologyIssue(ctx, proposal.decided_at, proposal.executed_at, "executed_at");
    }
  });

export const approvalDecisionKindSchema = z.enum(["allow", "deny", "request_changes"]);

export const approvalDecisionCommandSchema = z
  .object({
    decision: approvalDecisionKindSchema,
    expected_arguments_hash: sha256Schema,
    expected_descriptor_hash: sha256Schema,
    expected_session_generation: z.number().int().positive(),
    reason: z.string().min(1).max(2_000).nullable().optional(),
  })
  .strict()
  .superRefine((command, ctx) => {
    if (command.decision === "request_changes") {
      const reason = command.reason?.trim() ?? "";
      if (reason.length < 1) {
        addRequiredIssue(ctx, "reason", "request_changes requires a non-empty correction reason");
      }
    }
  });

/** Trusted-host approval card projection (AP-004). Never sourced from model props. */
export const approvalCardSchema = z
  .object({
    schemaVersion: schemaVersion1,
    proposal_id: opaqueIdSchema,
    required_action_id: opaqueIdSchema,
    pause_group_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    run_step_id: opaqueIdSchema,
    agent_turn_id: opaqueIdSchema,
    coworker_id: opaqueIdSchema,
    coworker_handle: z.string().min(1),
    coworker_name: z.string().min(1),
    logical_thread_id: opaqueIdSchema,
    tool_call_id: opaqueIdSchema,
    tool_name: z.string().min(1),
    observed_descriptor_hash: sha256Schema,
    approval_policy_hash: sha256Schema,
    connector_binding_id: opaqueIdSchema,
    account_id: opaqueIdSchema,
    acting_identity: actingIdentitySchema,
    redacted_arguments: safeJsonValueSchema,
    arguments_hash: sha256Schema,
    redacted_target: safeJsonValueSchema,
    target_hash: sha256Schema,
    artifact_revision_hash: sha256Schema.nullable(),
    expected_effect: z.string().min(1),
    risk_class: z.enum(["low", "medium", "high"]),
    payload_hash: sha256Schema,
    session_generation: z.number().int().positive(),
    session_generation_id: opaqueIdSchema,
    state: actionProposalStateSchema,
    expires_at: isoDateTimeSchema,
    provider_idempotency_key: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const approvalDecisionResultSchema = z
  .object({
    schemaVersion: schemaVersion1,
    proposal_id: opaqueIdSchema,
    decision: approvalDecisionKindSchema,
    proposal_state: z.enum(["allowed", "denied"]),
    pause_group_id: opaqueIdSchema,
    pause_group_state: pauseGroupStateSchema,
    pause_group_ready: z.boolean(),
    required_action_count: z.number().int().positive(),
    resolved_action_count: nonNegativeIntSchema,
    correction_draft: z
      .object({
        queue_item_id: opaqueIdSchema,
        run_step_id: opaqueIdSchema,
        prior_run_step_id: opaqueIdSchema,
        content: z.string().min(1).max(2_000),
      })
      .strict()
      .nullable(),
    provider_calls: z.literal(0),
  })
  .strict();

export const channelPendingApprovalsResponseSchema = z
  .object({
    schemaVersion: schemaVersion1,
    channel_id: opaqueIdSchema,
    proposal_ids: z.array(opaqueIdSchema),
  })
  .strict();

export const questionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    required_action_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    prompt_hash: sha256Schema,
    prompt_redacted: safeJsonValueSchema,
    state: z.enum(["requested", "answered", "expired", "stale"]),
    answered_by: opaqueIdSchema.nullable(),
    answer_ciphertext: encryptedPayloadSchema.nullable(),
    answer_redacted: safeJsonValueSchema.nullable(),
    answered_at: optionalTimestampSchema,
    expires_at: isoDateTimeSchema,
  })
  .strict()
  .superRefine((question, ctx) => {
    const isAnswered = question.state === "answered";
    const hasAnyAnswerMetadata =
      question.answered_by !== null ||
      question.answer_ciphertext !== null ||
      question.answer_redacted !== null ||
      question.answered_at !== null;
    const hasRequiredAnswerMetadata =
      question.answered_by !== null &&
      question.answer_ciphertext !== null &&
      question.answered_at !== null;
    if ((isAnswered && !hasRequiredAnswerMetadata) || (!isAnswered && hasAnyAnswerMetadata)) {
      addRequiredIssue(
        ctx,
        "state",
        "answer identity, ciphertext and timestamp must be present exactly for an answered question",
      );
    }
    if (question.answered_at !== null) {
      addChronologyIssue(ctx, question.answered_at, question.expires_at, "expires_at");
    }
  });

export const questionAnswerCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_prompt_hash: sha256Schema,
    answer: questionAnswerTextSchema,
    idempotency_key: z.string().min(1).max(512),
  })
  .strict();

export type PauseGroup = z.infer<typeof pauseGroupSchema>;
export type PauseGroupState = z.infer<typeof pauseGroupStateSchema>;
export type RequiredAction = z.infer<typeof requiredActionSchema>;
export type RequiredActionType = z.infer<typeof requiredActionTypeSchema>;
export type RequiredActionState = z.infer<typeof requiredActionStateSchema>;
export type PauseResume = z.infer<typeof pauseResumeSchema>;
export type PauseResumeState = z.infer<typeof pauseResumeStateSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ActingIdentity = z.infer<typeof actingIdentitySchema>;
export type ActionProposalState = z.infer<typeof actionProposalStateSchema>;
export type ApprovalDecisionKind = z.infer<typeof approvalDecisionKindSchema>;
export type ApprovalDecisionCommand = z.infer<typeof approvalDecisionCommandSchema>;
export type ApprovalCard = z.infer<typeof approvalCardSchema>;
export type ApprovalDecisionResult = z.infer<typeof approvalDecisionResultSchema>;
export type ChannelPendingApprovalsResponse = z.infer<typeof channelPendingApprovalsResponseSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionAnswerCommand = z.infer<typeof questionAnswerCommandSchema>;
