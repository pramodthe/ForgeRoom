import { createHash } from "node:crypto";
import type {
  ActingIdentity,
  ApprovalCard,
  ApprovalDecisionCommand,
  SafeJsonValue,
} from "@forgeroom/contracts";

export type ProposalDecisionSnapshot = {
  id: string;
  requiredActionId: string;
  pauseGroupId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  agentTurnId: string;
  coworkerId: string;
  coworkerHandle: string;
  coworkerName: string;
  logicalThreadId: string;
  toolCallId: string;
  toolName: string;
  observedDescriptorHash: string;
  approvalPolicyHash: string;
  connectorBindingId: string;
  accountId: string;
  actingIdentity: ActingIdentity;
  redactedArguments: SafeJsonValue;
  argumentsHash: string;
  redactedTarget: SafeJsonValue;
  targetHash: string;
  artifactRevisionHash: string | null;
  expectedEffect: string;
  riskClass: "low" | "medium" | "high";
  payloadHash: string;
  sessionGeneration: number;
  sessionGenerationId: string;
  liveApprovalPolicyHash: string;
  liveSessionGeneration: number;
  state: string;
  expiresAt: string;
  providerIdempotencyKey: string | null;
};

export type ProposalDecisionGateResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "not_found"
        | "decision_already_recorded"
        | "expired_proposal"
        | "stale_proposal"
        | "forbidden_state";
      markState?: "expired" | "stale";
    };

export function hashActingIdentity(identity: ActingIdentity): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        service: identity.service,
        account_display: identity.account_display,
        principal_type: identity.principal_type,
        principal_display: identity.principal_display,
        principal_id_hash: identity.principal_id_hash,
      }),
    )
    .digest("hex")}`;
}

/** Build the trusted-host ApprovalCard projection from a durable proposal snapshot. */
export function buildApprovalCard(snapshot: ProposalDecisionSnapshot): ApprovalCard {
  return {
    schemaVersion: 1,
    proposal_id: snapshot.id,
    required_action_id: snapshot.requiredActionId,
    pause_group_id: snapshot.pauseGroupId,
    channel_id: snapshot.channelId,
    run_id: snapshot.runId,
    run_step_id: snapshot.runStepId,
    agent_turn_id: snapshot.agentTurnId,
    coworker_id: snapshot.coworkerId,
    coworker_handle: snapshot.coworkerHandle,
    coworker_name: snapshot.coworkerName,
    logical_thread_id: snapshot.logicalThreadId,
    tool_call_id: snapshot.toolCallId,
    tool_name: snapshot.toolName,
    observed_descriptor_hash: snapshot.observedDescriptorHash,
    approval_policy_hash: snapshot.approvalPolicyHash,
    connector_binding_id: snapshot.connectorBindingId,
    account_id: snapshot.accountId,
    acting_identity: snapshot.actingIdentity,
    redacted_arguments: snapshot.redactedArguments,
    arguments_hash: snapshot.argumentsHash,
    redacted_target: snapshot.redactedTarget,
    target_hash: snapshot.targetHash,
    artifact_revision_hash: snapshot.artifactRevisionHash,
    expected_effect: snapshot.expectedEffect,
    risk_class: snapshot.riskClass,
    payload_hash: snapshot.payloadHash,
    session_generation: snapshot.sessionGeneration,
    session_generation_id: snapshot.sessionGenerationId,
    state: snapshot.state as ApprovalCard["state"],
    expires_at: snapshot.expiresAt,
    provider_idempotency_key: snapshot.providerIdempotencyKey,
  };
}

/**
 * Revalidate proposal state, expiry, and every bound authority field against the
 * decision command and live session generation / policy hashes.
 */
export function evaluateApprovalDecisionGate(input: {
  snapshot: ProposalDecisionSnapshot | null;
  command: ApprovalDecisionCommand;
  nowIso: string;
}): ProposalDecisionGateResult {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return { ok: false, reason: "not_found" };
  }

  if (snapshot.state === "allowed" || snapshot.state === "denied") {
    return { ok: false, reason: "decision_already_recorded" };
  }
  if (snapshot.state === "expired") {
    return { ok: false, reason: "expired_proposal" };
  }
  if (snapshot.state === "stale") {
    return { ok: false, reason: "stale_proposal" };
  }
  if (snapshot.state !== "proposed") {
    return { ok: false, reason: "forbidden_state" };
  }

  if (Date.parse(snapshot.expiresAt) <= Date.parse(input.nowIso)) {
    return { ok: false, reason: "expired_proposal", markState: "expired" };
  }

  const bindingsMatch =
    snapshot.argumentsHash === input.command.expected_arguments_hash &&
    snapshot.observedDescriptorHash === input.command.expected_descriptor_hash &&
    snapshot.sessionGeneration === input.command.expected_session_generation &&
    snapshot.liveSessionGeneration === input.command.expected_session_generation &&
    snapshot.liveSessionGeneration === snapshot.sessionGeneration &&
    snapshot.liveApprovalPolicyHash === snapshot.approvalPolicyHash;

  if (!bindingsMatch) {
    return { ok: false, reason: "stale_proposal", markState: "stale" };
  }

  return { ok: true };
}
