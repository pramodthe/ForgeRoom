import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { applyRunLifecycleProjection } from "./multi-agent-run";

export type SqlClient = postgres.Sql;

export type PersistPauseGroupApprovalAction = {
  actionType: "approval";
  providerActionId: string;
  payloadRedacted: Record<string, unknown>;
  payloadHash: string;
  proposal: {
    toolCallId: string;
    toolName: string;
    observedDescriptorHash: string;
    riskClass: "low" | "medium" | "high";
    expectedEffect: string;
    normalizedArgumentsRedacted: Record<string, unknown>;
    argumentsHash: string;
    targetRedacted: Record<string, unknown>;
    targetHash: string;
    artifactRevisionHash: string | null;
    providerIdempotencyKey: string | null;
  };
};

export type PersistPauseGroupQuestionAction = {
  actionType: "question";
  providerActionId: string;
  payloadRedacted: Record<string, unknown>;
  payloadHash: string;
  promptRedacted: Record<string, unknown>;
  promptHash: string;
};

export type PersistPauseGroupConnectionAction = {
  actionType: "connection";
  providerActionId: string;
  payloadRedacted: Record<string, unknown>;
  payloadHash: string;
};

export type PersistPauseGroupAction =
  | PersistPauseGroupApprovalAction
  | PersistPauseGroupQuestionAction
  | PersistPauseGroupConnectionAction;

export type PersistPauseGroupCaptureInput = {
  agentTurnId: string;
  trueforgeTurnId: string;
  generation: number;
  actions: PersistPauseGroupAction[];
  runStepState: "awaiting_approval" | "awaiting_input" | "blocked_connection";
  connectorBindingId: string;
  actingIdentityJson: Record<string, unknown>;
  approvalPolicyHash: string;
  /** Proposal expiry window; defaults to 24h. */
  expiresAt?: string;
  now?: string;
};

export type PersistPauseGroupCaptureResult =
  | {
      ok: true;
      inserted: boolean;
      pauseGroupId: string;
      requiredActionIds: string[];
      actionProposalIds: string[];
      questionIds: string[];
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "generation_mismatch"
        | "empty_actions"
        | "trueforge_turn_mismatch"
        | "state_mismatch";
    };

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

const UNRESOLVED_PAUSE_STATES = ["collecting", "ready"] as const;

export async function sessionHasUnresolvedPauseGroup(
  sql: SqlClient,
  channelAgentSessionId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    SELECT pg.id
    FROM pause_groups AS pg
    JOIN agent_turns AS t ON t.id = pg.agent_turn_id
    WHERE t.channel_agent_session_id = ${channelAgentSessionId}
      AND pg.state IN ${sql(UNRESOLVED_PAUSE_STATES)}
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Persist one PauseGroup for a paused AgentTurn with every RequiredAction exactly once.
 * Idempotent on duplicate capture for the same agent_turn_id (restart-safe).
 * Closes the AgentTurn as required_actions, clears the remote-active queue slot,
 * and keeps the RunStep nonterminal in the provided awaiting state.
 */
export async function persistPauseGroupCapture(
  sql: SqlClient,
  input: PersistPauseGroupCaptureInput,
): Promise<PersistPauseGroupCaptureResult> {
  if (input.actions.length === 0) {
    return { ok: false, reason: "empty_actions" };
  }
  const now = input.now ?? new Date().toISOString();
  const expiresAt =
    input.expiresAt ?? new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();

  return sql.begin(async (tx) => {
    const turns = await tx<
      {
        id: string;
        state: string;
        run_step_id: string;
        channel_agent_session_id: string;
        session_generation_id: string;
        queue_item_id: string;
        trueforge_turn_id: string | null;
      }[]
    >`
      SELECT
        t.id, t.state, t.run_step_id, t.channel_agent_session_id, t.session_generation_id,
        t.queue_item_id, t.trueforge_turn_id
      FROM agent_turns AS t
      WHERE t.id = ${input.agentTurnId}
      FOR UPDATE
    `;
    const turn = turns[0];
    if (!turn) {
      return { ok: false, reason: "not_found" };
    }

    const generations = await tx<{ id: string; generation: number }[]>`
      SELECT id, generation
      FROM channel_agent_session_generations
      WHERE id = ${turn.session_generation_id}
      FOR UPDATE
    `;
    const generation = generations[0];
    if (!generation) {
      return { ok: false, reason: "not_found" };
    }
    if (generation.generation !== input.generation) {
      return { ok: false, reason: "generation_mismatch" };
    }

    if (
      turn.trueforge_turn_id &&
      turn.trueforge_turn_id !== input.trueforgeTurnId
    ) {
      return { ok: false, reason: "trueforge_turn_mismatch" };
    }

    const existingGroups = await tx<
      {
        id: string;
        trueforge_turn_id: string;
        generation: number;
        required_action_count: number;
      }[]
    >`
      SELECT id, trueforge_turn_id, generation, required_action_count
      FROM pause_groups
      WHERE agent_turn_id = ${input.agentTurnId}
      FOR UPDATE
    `;
    const existing = existingGroups[0];
    if (existing) {
      if (
        existing.trueforge_turn_id !== input.trueforgeTurnId ||
        existing.generation !== input.generation
      ) {
        return { ok: false, reason: "trueforge_turn_mismatch" };
      }
      const required = await tx<{ id: string; provider_action_id: string }[]>`
        SELECT id, provider_action_id
        FROM required_actions
        WHERE pause_group_id = ${existing.id}
        ORDER BY created_at ASC
      `;
      const proposals = await tx<{ id: string }[]>`
        SELECT ap.id
        FROM action_proposals AS ap
        JOIN required_actions AS ra ON ra.id = ap.required_action_id
        WHERE ra.pause_group_id = ${existing.id}
      `;
      const questions = await tx<{ id: string }[]>`
        SELECT q.id
        FROM questions AS q
        JOIN required_actions AS ra ON ra.id = q.required_action_id
        WHERE ra.pause_group_id = ${existing.id}
      `;

      // Restart path: ensure turn/step remain nonterminal awaiting.
      await tx`
        UPDATE agent_turns
        SET
          state = 'required_actions',
          trueforge_turn_id = COALESCE(trueforge_turn_id, ${input.trueforgeTurnId}),
          completed_at = COALESCE(completed_at, ${now})
        WHERE id = ${input.agentTurnId}
      `;
      await tx`
        UPDATE run_steps
        SET state = ${input.runStepState}, completed_at = NULL
        WHERE id = ${turn.run_step_id}
      `;
      await tx`
        UPDATE turn_queue_items
        SET state = 'completed', completed_at = COALESCE(completed_at, ${now}),
            lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ${turn.queue_item_id}
          AND state <> 'completed'
      `;
      const runRows = await tx<{ run_id: string }[]>`
        SELECT run_id FROM run_steps WHERE id = ${turn.run_step_id} LIMIT 1
      `;
      if (runRows[0]) {
        await applyRunLifecycleProjection(tx as unknown as SqlClient, {
          runId: runRows[0].run_id,
          now,
        });
      }

      return {
        ok: true,
        inserted: false,
        pauseGroupId: existing.id,
        requiredActionIds: required.map((row) => row.id),
        actionProposalIds: proposals.map((row) => row.id),
        questionIds: questions.map((row) => row.id),
      };
    }

    if (
      !["streaming", "creating", "required_actions", "acquiring"].includes(turn.state)
    ) {
      return { ok: false, reason: "state_mismatch" };
    }

    const pauseGroupId = opaqueId("pg");
    await tx`
      INSERT INTO pause_groups (
        id, agent_turn_id, trueforge_turn_id, generation, state,
        required_action_count, resolved_action_count, created_at
      ) VALUES (
        ${pauseGroupId}, ${input.agentTurnId}, ${input.trueforgeTurnId}, ${input.generation},
        'collecting', ${input.actions.length}, 0, ${now}
      )
    `;

    const requiredActionIds: string[] = [];
    const actionProposalIds: string[] = [];
    const questionIds: string[] = [];

    const runRows = await tx<{ run_id: string; channel_id: string }[]>`
      SELECT rs.run_id, r.channel_id
      FROM run_steps AS rs
      JOIN runs AS r ON r.id = rs.run_id
      WHERE rs.id = ${turn.run_step_id}
      LIMIT 1
    `;
    const run = runRows[0];
    if (!run) {
      return { ok: false, reason: "not_found" };
    }

    for (const action of input.actions) {
      const requiredActionId = opaqueId("ra");
      requiredActionIds.push(requiredActionId);
      await tx`
        INSERT INTO required_actions (
          id, pause_group_id, provider_action_id, action_type, state,
          payload_redacted_json, payload_hash, created_at
        ) VALUES (
          ${requiredActionId}, ${pauseGroupId}, ${action.providerActionId}, ${action.actionType},
          'pending', ${JSON.stringify(action.payloadRedacted)}::jsonb, ${action.payloadHash}, ${now}
        )
      `;

      if (action.actionType === "approval") {
        const proposalId = opaqueId("ap");
        actionProposalIds.push(proposalId);
        await tx`
          INSERT INTO action_proposals (
            id, required_action_id, run_id, run_step_id, agent_turn_id, thread_id,
            tool_call_id, session_generation_id, approval_policy_hash, connector_binding_id,
            tool_name, observed_descriptor_hash, acting_identity_json,
            normalized_arguments_redacted_json, arguments_hash, target_redacted_json, target_hash,
            artifact_revision_hash, risk_class, expected_effect, state, expires_at,
            provider_idempotency_key
          ) VALUES (
            ${proposalId}, ${requiredActionId}, ${run.run_id}, ${turn.run_step_id}, ${input.agentTurnId},
            NULL, ${action.proposal.toolCallId}, ${turn.session_generation_id},
            ${input.approvalPolicyHash}, ${input.connectorBindingId},
            ${action.proposal.toolName}, ${action.proposal.observedDescriptorHash},
            ${JSON.stringify(input.actingIdentityJson)}::jsonb,
            ${JSON.stringify(action.proposal.normalizedArgumentsRedacted)}::jsonb,
            ${action.proposal.argumentsHash},
            ${JSON.stringify(action.proposal.targetRedacted)}::jsonb,
            ${action.proposal.targetHash},
            ${action.proposal.artifactRevisionHash},
            ${action.proposal.riskClass}, ${action.proposal.expectedEffect}, 'proposed', ${expiresAt},
            ${action.proposal.providerIdempotencyKey}
          )
        `;
      } else if (action.actionType === "question") {
        const questionId = opaqueId("qst");
        questionIds.push(questionId);
        await tx`
          INSERT INTO questions (
            id, required_action_id, channel_id, run_id, prompt_redacted_json, prompt_hash,
            state, expires_at
          ) VALUES (
            ${questionId}, ${requiredActionId}, ${run.channel_id}, ${run.run_id},
            ${JSON.stringify(action.promptRedacted)}::jsonb, ${action.promptHash},
            'requested', ${expiresAt}
          )
        `;
      }
    }

    await tx`
      UPDATE agent_turns
      SET
        state = 'required_actions',
        trueforge_turn_id = COALESCE(trueforge_turn_id, ${input.trueforgeTurnId}),
        completed_at = ${now}
      WHERE id = ${input.agentTurnId}
    `;
    await tx`
      UPDATE run_steps
      SET state = ${input.runStepState}, completed_at = NULL
      WHERE id = ${turn.run_step_id}
    `;
    await tx`
      UPDATE turn_queue_items
      SET state = 'completed', completed_at = ${now}, lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ${turn.queue_item_id}
    `;
    await applyRunLifecycleProjection(tx as unknown as SqlClient, {
      runId: run.run_id,
      now,
    });

    return {
      ok: true,
      inserted: true,
      pauseGroupId,
      requiredActionIds,
      actionProposalIds,
      questionIds,
    };
  });
}
