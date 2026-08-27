import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { sealPauseResponsePayload } from "./pause-crypto";

export type SqlClient = postgres.Sql;

export type ApprovalDecisionCommandInput = {
  decision: "allow" | "deny" | "request_changes";
  expected_arguments_hash: string;
  expected_descriptor_hash: string;
  expected_session_generation: number;
  reason?: string | null;
};

export type ApprovalProposalCardSnapshot = {
  id: string;
  requiredActionId: string;
  pauseGroupId: string;
  channelId: string;
  workspaceId: string;
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
  actingIdentity: Record<string, unknown>;
  redactedArguments: unknown;
  argumentsHash: string;
  redactedTarget: unknown;
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

export type RecordApprovalDecisionInput = {
  proposalId: string;
  workspaceId: string;
  actorUserId: string;
  command: ApprovalDecisionCommandInput;
  encryptionKey: Buffer;
  now?: string;
};

export type RecordApprovalDecisionResult =
  | {
      ok: true;
      proposalId: string;
      decision: "allow" | "deny" | "request_changes";
      proposalState: "allowed" | "denied";
      pauseGroupId: string;
      pauseGroupState: string;
      pauseGroupReady: boolean;
      requiredActionCount: number;
      resolvedActionCount: number;
      correctionDraft: {
        queueItemId: string;
        runStepId: string;
        priorRunStepId: string;
        content: string;
      } | null;
      auditEventId: string;
      runEventId: string;
      providerCalls: 0;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "decision_already_recorded"
        | "expired_proposal"
        | "stale_proposal"
        | "forbidden_state"
        | "forbidden";
    };

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function sha256Payload(payload: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

type ProposalRow = {
  id: string;
  required_action_id: string;
  run_id: string;
  run_step_id: string;
  agent_turn_id: string;
  tool_call_id: string;
  session_generation_id: string;
  approval_policy_hash: string;
  connector_binding_id: string;
  tool_name: string;
  observed_descriptor_hash: string;
  acting_identity_json: Record<string, unknown>;
  normalized_arguments_redacted_json: unknown;
  arguments_hash: string;
  target_redacted_json: unknown;
  target_hash: string;
  artifact_revision_hash: string | null;
  risk_class: "low" | "medium" | "high";
  expected_effect: string;
  state: string;
  expires_at: string | Date;
  provider_idempotency_key: string | null;
  decided_by: string | null;
  pause_group_id: string;
  payload_hash: string;
  required_action_state: string;
  channel_id: string;
  workspace_id: string;
  coworker_id: string;
  coworker_handle: string;
  coworker_name: string;
  logical_thread_id: string;
  session_generation: number;
  live_approval_policy_hash: string;
  live_session_generation: number | null;
  channel_agent_session_id: string;
  pause_required_count: number;
  pause_resolved_count: number;
  pause_state: string;
  account_id: string;
};

function toIso(value: string | Date): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function rowToSnapshot(row: ProposalRow): ApprovalProposalCardSnapshot {
  return {
    id: row.id,
    requiredActionId: row.required_action_id,
    pauseGroupId: row.pause_group_id,
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    runStepId: row.run_step_id,
    agentTurnId: row.agent_turn_id,
    coworkerId: row.coworker_id,
    coworkerHandle: row.coworker_handle,
    coworkerName: row.coworker_name,
    logicalThreadId: row.logical_thread_id,
    toolCallId: row.tool_call_id,
    toolName: row.tool_name,
    observedDescriptorHash: row.observed_descriptor_hash,
    approvalPolicyHash: row.approval_policy_hash,
    connectorBindingId: row.connector_binding_id,
    accountId: row.account_id,
    actingIdentity: row.acting_identity_json,
    redactedArguments: row.normalized_arguments_redacted_json,
    argumentsHash: row.arguments_hash,
    redactedTarget: row.target_redacted_json,
    targetHash: row.target_hash,
    artifactRevisionHash: row.artifact_revision_hash,
    expectedEffect: row.expected_effect,
    riskClass: row.risk_class,
    payloadHash: row.payload_hash,
    sessionGeneration: row.session_generation,
    sessionGenerationId: row.session_generation_id,
    liveApprovalPolicyHash: row.live_approval_policy_hash,
    liveSessionGeneration: row.live_session_generation ?? row.session_generation,
    state: row.state,
    expiresAt: toIso(row.expires_at),
    providerIdempotencyKey: row.provider_idempotency_key,
  };
}

async function selectProposal(
  sql: SqlClient,
  proposalId: string,
  forUpdate: boolean,
): Promise<ProposalRow | null> {
  if (forUpdate) {
    const rows = await sql<ProposalRow[]>`
      SELECT
        ap.id,
        ap.required_action_id,
        ap.run_id,
        ap.run_step_id,
        ap.agent_turn_id,
        ap.tool_call_id,
        ap.session_generation_id,
        ap.approval_policy_hash,
        ap.connector_binding_id,
        ap.tool_name,
        ap.observed_descriptor_hash,
        ap.acting_identity_json,
        ap.normalized_arguments_redacted_json,
        ap.arguments_hash,
        ap.target_redacted_json,
        ap.target_hash,
        ap.artifact_revision_hash,
        ap.risk_class,
        ap.expected_effect,
        ap.state,
        ap.expires_at,
        ap.provider_idempotency_key,
        ap.decided_by,
        ra.pause_group_id,
        ra.payload_hash,
        ra.state AS required_action_state,
        r.channel_id,
        c.workspace_id,
        cas.agent_profile_id AS coworker_id,
        cw.handle AS coworker_handle,
        cw.name AS coworker_name,
        cas.logical_agui_thread_id AS logical_thread_id,
        gen.generation AS session_generation,
        gen.approval_policy_hash AS live_approval_policy_hash,
        live_gen.generation AS live_session_generation,
        cas.id AS channel_agent_session_id,
        pg.required_action_count AS pause_required_count,
        pg.resolved_action_count AS pause_resolved_count,
        pg.state AS pause_state,
        cb.credential_owner_id AS account_id
      FROM action_proposals AS ap
      JOIN required_actions AS ra ON ra.id = ap.required_action_id
      JOIN pause_groups AS pg ON pg.id = ra.pause_group_id
      JOIN runs AS r ON r.id = ap.run_id
      JOIN channels AS c ON c.id = r.channel_id
      JOIN agent_turns AS t ON t.id = ap.agent_turn_id
      JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
      JOIN agent_profiles AS cw ON cw.id = cas.agent_profile_id
      JOIN channel_agent_session_generations AS gen ON gen.id = ap.session_generation_id
      LEFT JOIN channel_agent_session_generations AS live_gen
        ON live_gen.id = cas.current_generation_id
      JOIN connector_bindings AS cb ON cb.id = ap.connector_binding_id
      WHERE ap.id = ${proposalId}
      FOR UPDATE OF ap, ra, pg
    `;
    return rows[0] ?? null;
  }
  const rows = await sql<ProposalRow[]>`
    SELECT
      ap.id,
      ap.required_action_id,
      ap.run_id,
      ap.run_step_id,
      ap.agent_turn_id,
      ap.tool_call_id,
      ap.session_generation_id,
      ap.approval_policy_hash,
      ap.connector_binding_id,
      ap.tool_name,
      ap.observed_descriptor_hash,
      ap.acting_identity_json,
      ap.normalized_arguments_redacted_json,
      ap.arguments_hash,
      ap.target_redacted_json,
      ap.target_hash,
      ap.artifact_revision_hash,
      ap.risk_class,
      ap.expected_effect,
      ap.state,
      ap.expires_at,
      ap.provider_idempotency_key,
      ap.decided_by,
      ra.pause_group_id,
      ra.payload_hash,
      ra.state AS required_action_state,
      r.channel_id,
      c.workspace_id,
      cas.agent_profile_id AS coworker_id,
      cw.handle AS coworker_handle,
      cw.name AS coworker_name,
      cas.logical_agui_thread_id AS logical_thread_id,
      gen.generation AS session_generation,
      gen.approval_policy_hash AS live_approval_policy_hash,
      live_gen.generation AS live_session_generation,
      cas.id AS channel_agent_session_id,
      pg.required_action_count AS pause_required_count,
      pg.resolved_action_count AS pause_resolved_count,
      pg.state AS pause_state,
      cb.credential_owner_id AS account_id
    FROM action_proposals AS ap
    JOIN required_actions AS ra ON ra.id = ap.required_action_id
    JOIN pause_groups AS pg ON pg.id = ra.pause_group_id
    JOIN runs AS r ON r.id = ap.run_id
    JOIN channels AS c ON c.id = r.channel_id
    JOIN agent_turns AS t ON t.id = ap.agent_turn_id
    JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
    JOIN agent_profiles AS cw ON cw.id = cas.agent_profile_id
    JOIN channel_agent_session_generations AS gen ON gen.id = ap.session_generation_id
    LEFT JOIN channel_agent_session_generations AS live_gen
      ON live_gen.id = cas.current_generation_id
    JOIN connector_bindings AS cb ON cb.id = ap.connector_binding_id
    WHERE ap.id = ${proposalId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function evaluateGate(input: {
  snapshot: ApprovalProposalCardSnapshot;
  command: ApprovalDecisionCommandInput;
  nowIso: string;
}):
  | { ok: true }
  | {
      ok: false;
      reason:
        | "decision_already_recorded"
        | "expired_proposal"
        | "stale_proposal"
        | "forbidden_state";
      markState?: "expired" | "stale";
    } {
  const { snapshot, command, nowIso } = input;
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
  if (Date.parse(snapshot.expiresAt) <= Date.parse(nowIso)) {
    return { ok: false, reason: "expired_proposal", markState: "expired" };
  }
  const bindingsMatch =
    snapshot.argumentsHash === command.expected_arguments_hash &&
    snapshot.observedDescriptorHash === command.expected_descriptor_hash &&
    snapshot.sessionGeneration === command.expected_session_generation &&
    snapshot.liveSessionGeneration === command.expected_session_generation &&
    snapshot.liveSessionGeneration === snapshot.sessionGeneration &&
    snapshot.liveApprovalPolicyHash === snapshot.approvalPolicyHash;
  if (!bindingsMatch) {
    return { ok: false, reason: "stale_proposal", markState: "stale" };
  }
  return { ok: true };
}

/**
 * Atomically record one approval decision. Never calls TrueForge/Composio.
 * Concurrent allow/deny: only one UPDATE ... WHERE state='proposed' wins.
 */
export async function recordApprovalDecision(
  sql: SqlClient,
  input: RecordApprovalDecisionInput,
): Promise<RecordApprovalDecisionResult> {
  const now = input.now ?? new Date().toISOString();

  return sql.begin(async (tx) => {
    const row = await selectProposal(tx as unknown as SqlClient, input.proposalId, true);
    if (!row) {
      return { ok: false, reason: "not_found" };
    }
    if (row.workspace_id !== input.workspaceId) {
      return { ok: false, reason: "forbidden" };
    }

    const snapshot = rowToSnapshot(row);
    const gate = evaluateGate({
      snapshot,
      command: input.command,
      nowIso: now,
    });

    if (!gate.ok) {
      if (gate.markState && row.state === "proposed") {
        await tx`
          UPDATE action_proposals
          SET state = ${gate.markState}
          WHERE id = ${row.id} AND state = 'proposed'
        `;
        if (row.required_action_state === "pending") {
          await tx`
            UPDATE required_actions
            SET state = ${gate.markState}
            WHERE id = ${row.required_action_id} AND state = 'pending'
          `;
        }
        const auditPayload = {
          proposal_id: row.id,
          reason: gate.reason,
          marked: gate.markState,
        };
        await tx`
          INSERT INTO audit_events (
            id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
            redacted_payload_json, payload_hash, created_at
          ) VALUES (
            ${opaqueId("audit")}, ${row.workspace_id}, ${row.channel_id}, 'human', ${input.actorUserId},
            ${gate.markState === "expired" ? "approval.expired" : "approval.stale"},
            'action_proposal', ${row.id},
            ${JSON.stringify(auditPayload)}::jsonb, ${sha256Payload(auditPayload)}, ${now}
          )
        `;
      }
      return { ok: false, reason: gate.reason };
    }

    const decisionKind = input.command.decision;
    const proposalState = decisionKind === "allow" ? "allowed" : "denied";
    const responseRedacted = {
      decision: decisionKind === "allow" ? "allow" : "deny",
      request_changes: decisionKind === "request_changes",
      reason: input.command.reason ?? null,
    };
    const sealed = sealPauseResponsePayload(responseRedacted, input.encryptionKey);

    const won = await tx<{ id: string }[]>`
      UPDATE action_proposals
      SET
        state = ${proposalState},
        decided_by = ${input.actorUserId},
        decision_reason = ${input.command.reason ?? null},
        decided_at = ${now}
      WHERE id = ${row.id} AND state = 'proposed'
      RETURNING id
    `;
    if (won.length === 0) {
      return { ok: false, reason: "decision_already_recorded" };
    }

    await tx`
      UPDATE required_actions
      SET
        state = 'resolved',
        response_ciphertext = ${sealed.ciphertext},
        response_redacted_json = ${JSON.stringify(responseRedacted)}::jsonb,
        resolved_by = ${input.actorUserId},
        resolved_at = ${now}
      WHERE id = ${row.required_action_id} AND state = 'pending'
    `;

    const updatedGroup = await tx<
      {
        id: string;
        state: string;
        required_action_count: number;
        resolved_action_count: number;
      }[]
    >`
      UPDATE pause_groups
      SET
        resolved_action_count = resolved_action_count + 1,
        state = CASE
          WHEN resolved_action_count + 1 >= required_action_count THEN 'ready'
          ELSE state
        END,
        ready_at = CASE
          WHEN resolved_action_count + 1 >= required_action_count THEN ${now}::timestamptz
          ELSE ready_at
        END
      WHERE id = ${row.pause_group_id}
      RETURNING id, state, required_action_count, resolved_action_count
    `;
    const group = updatedGroup[0]!;
    const pauseGroupReady = group.state === "ready";

    let correctionDraft: {
      queueItemId: string;
      runStepId: string;
      priorRunStepId: string;
      content: string;
    } | null = null;

    if (decisionKind === "request_changes") {
      const content = (input.command.reason ?? "").trim();
      const correctionStepId = opaqueId("step");
      await tx`
        INSERT INTO run_steps (
          id, run_id, assigned_agent_id, objective, context_refs_json, state, attempt
        )
        SELECT
          ${correctionStepId},
          rs.run_id,
          rs.assigned_agent_id,
          ${`Correction: ${content}`},
          ${JSON.stringify([{ prior_run_step_id: row.run_step_id }])}::jsonb,
          'queued',
          1
        FROM run_steps AS rs
        WHERE rs.id = ${row.run_step_id}
      `;
      await tx`
        SELECT id FROM channel_agent_sessions
        WHERE id = ${row.channel_agent_session_id}
        FOR UPDATE
      `;
      const locked = await tx<{ fifo_sequence: number }[]>`
        SELECT fifo_sequence
        FROM turn_queue_items
        WHERE channel_agent_session_id = ${row.channel_agent_session_id}
        ORDER BY fifo_sequence DESC
        LIMIT 1
        FOR UPDATE
      `;
      const fifoSequence = (locked[0]?.fifo_sequence ?? -1) + 1;
      const queueItemId = opaqueId("tqi");
      await tx`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, fifo_sequence, state, created_at
        ) VALUES (
          ${queueItemId}, ${row.channel_agent_session_id}, ${correctionStepId},
          ${row.session_generation_id}, 'correction',
          ${JSON.stringify({
            content,
            prior_run_step_id: row.run_step_id,
            priority: 10,
          })}::jsonb,
          ${fifoSequence}, 'queued', ${now}
        )
      `;
      correctionDraft = {
        queueItemId,
        runStepId: correctionStepId,
        priorRunStepId: row.run_step_id,
        content,
      };
    }

    const auditPayload = {
      proposal_id: row.id,
      decision: decisionKind,
      proposal_state: proposalState,
      pause_group_id: group.id,
      pause_group_state: group.state,
      pause_group_ready: pauseGroupReady,
      correction_queue_item_id: correctionDraft?.queueItemId ?? null,
      provider_calls: 0,
    };
    const auditEventId = opaqueId("audit");
    await tx`
      INSERT INTO audit_events (
        id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
        redacted_payload_json, payload_hash, created_at
      ) VALUES (
        ${auditEventId}, ${row.workspace_id}, ${row.channel_id}, 'human', ${input.actorUserId},
        'approval.decided', 'action_proposal', ${row.id},
        ${JSON.stringify(auditPayload)}::jsonb, ${sha256Payload(auditPayload)}, ${now}
      )
    `;

    const runEventId = opaqueId("re");
    const trueforgeEventId = `app:approval.decided:${row.id}:${auditEventId}`;
    await tx`
      INSERT INTO run_events (
        id, agent_turn_id, trueforge_event_id, thread_id,
        normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
      ) VALUES (
        ${runEventId}, ${row.agent_turn_id}, ${trueforgeEventId}, ${row.logical_thread_id},
        ${JSON.stringify({
          ...auditPayload,
          tool_name: row.tool_name,
          arguments_hash: row.arguments_hash,
          observed_descriptor_hash: row.observed_descriptor_hash,
        })}::jsonb,
        'approval.decided', ${now}, ${now}
      )
    `;

    if (pauseGroupReady) {
      const readyEventId = opaqueId("re");
      await tx`
        INSERT INTO run_events (
          id, agent_turn_id, trueforge_event_id, thread_id,
          normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
        ) VALUES (
          ${readyEventId}, ${row.agent_turn_id}, ${`app:pause_group.ready:${group.id}`},
          ${row.logical_thread_id},
          ${JSON.stringify({
            pause_group_id: group.id,
            required_action_count: group.required_action_count,
            resolved_action_count: group.resolved_action_count,
          })}::jsonb,
          'pause_group.ready', ${now}, ${now}
        )
      `;
    }

    return {
      ok: true,
      proposalId: row.id,
      decision: decisionKind,
      proposalState,
      pauseGroupId: group.id,
      pauseGroupState: group.state,
      pauseGroupReady,
      requiredActionCount: group.required_action_count,
      resolvedActionCount: group.resolved_action_count,
      correctionDraft,
      auditEventId,
      runEventId,
      providerCalls: 0,
    };
  });
}

export async function loadApprovalProposalForCard(
  sql: SqlClient,
  input: { proposalId: string; workspaceId: string },
): Promise<
  | { ok: true; snapshot: ApprovalProposalCardSnapshot }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const row = await selectProposal(sql, input.proposalId, false);
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.workspace_id !== input.workspaceId) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, snapshot: rowToSnapshot(row) };
}
