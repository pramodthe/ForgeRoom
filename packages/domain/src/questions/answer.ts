import type { QuestionCard, SafeJsonValue } from "@forgeroom/contracts";

export type QuestionCardSnapshot = {
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
  promptHash: string;
  promptRedacted: SafeJsonValue;
  state: string;
  expiresAt: string;
  pauseGroupState: string;
  pauseGroupRequiredActionCount: number;
  pauseGroupResolvedActionCount: number;
  pauseGroupHasPendingApprovals: boolean;
};

/** Build the trusted-host QuestionCard projection from a durable question snapshot. */
export function buildQuestionCard(snapshot: QuestionCardSnapshot): QuestionCard {
  return {
    schemaVersion: 1,
    question_id: snapshot.id,
    required_action_id: snapshot.requiredActionId,
    pause_group_id: snapshot.pauseGroupId,
    channel_id: snapshot.channelId,
    run_id: snapshot.runId,
    run_step_id: snapshot.runStepId,
    agent_turn_id: snapshot.agentTurnId,
    coworker_id: snapshot.coworkerId,
    coworker_handle: snapshot.coworkerHandle,
    coworker_name: snapshot.coworkerName,
    prompt_hash: snapshot.promptHash,
    prompt_redacted: snapshot.promptRedacted,
    state: snapshot.state as QuestionCard["state"],
    expires_at: snapshot.expiresAt,
    pause_group_state: snapshot.pauseGroupState as QuestionCard["pause_group_state"],
    pause_group_required_action_count: snapshot.pauseGroupRequiredActionCount,
    pause_group_resolved_action_count: snapshot.pauseGroupResolvedActionCount,
    pause_group_has_pending_approvals: snapshot.pauseGroupHasPendingApprovals,
  };
}
