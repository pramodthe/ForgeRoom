import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";

export type SqlClient = postgres.Sql;

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export type SessionRotationReason =
  | "grant_add"
  | "grant_remove"
  | "account_revoke"
  | "policy_tighten"
  | "component_grant"
  | "component_revoke"
  | "descriptor_drift"
  | "skill_attach"
  | "skill_detach"
  | "configuration_changed"
  | "reconnect";

export type SessionRevisionInsert = {
  id: string;
  agentProfileId: string;
  sourceConfigRevision: number;
  effectiveConfigRedactedJson: Record<string, unknown>;
  effectiveSpecHash: string;
  approvalPolicyHash: string;
  createdBy: string;
  createdAt: string;
};

export type GenerationInsert = {
  id: string;
  channelAgentSessionId: string;
  generation: number;
  agentVersionId: string | null;
  sessionRevisionId: string;
  trueforgeSessionId: string;
  effectiveSpecHash: string;
  approvalPolicyHash: string;
  state: "ready";
  createdAt: string;
  retiredAt: null;
};

export type BeginSessionRotationInput = {
  channelAgentSessionId: string;
  agentProfileId: string;
  reason: SessionRotationReason;
  previousTools: readonly string[];
  nextTools: readonly string[];
  hasActiveTurn: boolean;
  mcpInFlightKnownTerminal: boolean | null;
  now?: string;
};

export type BeginSessionRotationResult = {
  isRestriction: boolean;
  requestActiveTurnCancellation: boolean;
  staleUnresolvedActions: boolean;
  previousGenerationId: string;
  previousGeneration: number;
  previousTrueforgeSessionId: string;
  previousEffectiveSpecHash: string;
  previousApprovalPolicyHash: string;
  sourceConfigRevision: number;
};

export type AtomicSwapSessionGenerationInput = {
  channelAgentSessionId: string;
  previousGenerationId: string;
  revision: SessionRevisionInsert;
  generation: GenerationInsert;
  staleUnresolvedActions: boolean;
  now?: string;
};

export type AtomicSwapSessionGenerationResult = {
  newGenerationId: string;
  newGeneration: number;
  retiredGenerationId: string;
  retainedOldTrueforgeSessionId: string;
  retainedOldEffectiveSpecHash: string;
  staleProposalIds: string[];
  stalePauseGroupIds: string[];
  staleInterruptIds: string[];
  reboundNormalQueueItemIds: string[];
  responseIntentsLeftBound: string[];
};

export type CompleteSessionRotationInput = {
  channelAgentSessionId: string;
  now?: string;
};

export type AbortSessionRotationInput = {
  channelAgentSessionId: string;
  /** Generation pointer to restore when aborting after a failed swap. */
  restoreGenerationId: string;
  /** Newly inserted generation to mark aborted when swap partially succeeded. */
  abortGenerationId?: string | null;
  now?: string;
};

export type RecordMcpRotationOutcomeInput = {
  channelAgentSessionId: string;
  agentTurnId: string | null;
  knownTerminal: boolean;
  now?: string;
};

type TurnQueueInputType =
  "normal" | "pause_group_response" | "component_interaction_response" | "correction";

/** Keep in sync with @forgeroom/orchestration/session-rotation decideQueueItemRebind. */
function mayRebindQueueItem(inputType: TurnQueueInputType): boolean {
  return inputType === "normal" || inputType === "correction";
}

function isRestrictionChange(
  reason: SessionRotationReason,
  previousTools: readonly string[],
  nextTools: readonly string[],
): boolean {
  const restrictionReasons: SessionRotationReason[] = [
    "grant_remove",
    "account_revoke",
    "policy_tighten",
    "component_revoke",
    "descriptor_drift",
  ];
  if (restrictionReasons.includes(reason)) {
    return true;
  }
  const next = new Set(nextTools);
  return previousTools.some((tool) => !next.has(tool));
}

/**
 * Next SessionRevision ordinal for an agent — must be unique under
 * (agent_profile_id, source_config_revision).
 */
export async function nextSessionRevisionOrdinal(
  sql: SqlClient,
  agentProfileId: string,
): Promise<number> {
  const rows = await sql<{ max: number | null }[]>`
    SELECT MAX(source_config_revision) AS max
    FROM session_revisions
    WHERE agent_profile_id = ${agentProfileId}
  `;
  return (rows[0]?.max ?? 0) + 1;
}

export async function beginSessionRotation(
  sql: SqlClient,
  input: BeginSessionRotationInput,
): Promise<BeginSessionRotationResult> {
  const now = input.now ?? new Date().toISOString();
  const isRestriction = isRestrictionChange(input.reason, input.previousTools, input.nextTools);
  const requestActiveTurnCancellation = isRestriction && input.hasActiveTurn;
  const staleUnresolvedActions = isRestriction;

  return sql.begin(async (tx) => {
    const sessions = await tx<
      {
        id: string;
        state: string;
        current_generation_id: string | null;
      }[]
    >`
      SELECT id, state, current_generation_id
      FROM channel_agent_sessions
      WHERE id = ${input.channelAgentSessionId}
      FOR UPDATE
    `;
    const session = sessions[0];
    if (!session) {
      throw new Error(`channel_agent_session not found: ${input.channelAgentSessionId}`);
    }
    if (session.state === "rotating") {
      throw new Error(`session rotation already in progress: ${session.id}`);
    }
    if (!session.current_generation_id) {
      throw new Error(`channel_agent_session has no current generation: ${session.id}`);
    }

    const generations = await tx<
      {
        id: string;
        generation: number;
        trueforge_session_id: string;
        effective_spec_hash: string;
        approval_policy_hash: string;
        state: string;
      }[]
    >`
      SELECT id, generation, trueforge_session_id, effective_spec_hash, approval_policy_hash, state
      FROM channel_agent_session_generations
      WHERE id = ${session.current_generation_id}
      FOR UPDATE
    `;
    const generation = generations[0];
    if (!generation) {
      throw new Error(`generation not found: ${session.current_generation_id}`);
    }

    await tx`
      UPDATE channel_agent_sessions
      SET state = 'rotating', updated_at = ${now}
      WHERE id = ${session.id}
    `;
    if (generation.state === "ready") {
      await tx`
        UPDATE channel_agent_session_generations
        SET state = 'rotating'
        WHERE id = ${generation.id}
      `;
    }

    await tx`
      SELECT id FROM agent_profiles
      WHERE id = ${input.agentProfileId}
      FOR UPDATE
    `;
    const revisionRows = await tx<{ max: number | null }[]>`
      SELECT MAX(source_config_revision) AS max
      FROM session_revisions
      WHERE agent_profile_id = ${input.agentProfileId}
    `;
    const sourceConfigRevision = (revisionRows[0]?.max ?? 0) + 1;

    return {
      isRestriction,
      requestActiveTurnCancellation,
      staleUnresolvedActions,
      previousGenerationId: generation.id,
      previousGeneration: generation.generation,
      previousTrueforgeSessionId: generation.trueforge_session_id,
      previousEffectiveSpecHash: generation.effective_spec_hash,
      previousApprovalPolicyHash: generation.approval_policy_hash,
      sourceConfigRevision,
    };
  });
}

async function staleUnresolvedForGeneration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  generationId: string,
  now: string,
): Promise<{
  staleProposalIds: string[];
  stalePauseGroupIds: string[];
  staleInterruptIds: string[];
}> {
  const proposals = await tx`
    UPDATE action_proposals
    SET state = 'stale'
    WHERE session_generation_id = ${generationId}
      AND state = 'proposed'
    RETURNING id
  `;

  const pauseGroups = await tx`
    UPDATE pause_groups
    SET state = 'stale'
    WHERE state IN ('collecting', 'ready')
      AND agent_turn_id IN (
        SELECT id FROM agent_turns WHERE session_generation_id = ${generationId}
      )
    RETURNING id
  `;

  for (const row of pauseGroups as { id: string }[]) {
    await tx`
      UPDATE required_actions
      SET state = 'stale'
      WHERE pause_group_id = ${row.id}
        AND state = 'pending'
    `;
    await tx`
      UPDATE questions
      SET state = 'stale'
      WHERE state = 'requested'
        AND required_action_id IN (
          SELECT id FROM required_actions WHERE pause_group_id = ${row.id}
        )
    `;
  }

  const interrupts = await tx`
    UPDATE ui_component_interrupts
    SET state = 'stale', stale_at = ${now}
    WHERE session_generation_id = ${generationId}
      AND state = 'waiting'
    RETURNING id
  `;

  return {
    staleProposalIds: (proposals as { id: string }[]).map((row) => row.id),
    stalePauseGroupIds: (pauseGroups as { id: string }[]).map((row) => row.id),
    staleInterruptIds: (interrupts as { id: string }[]).map((row) => row.id),
  };
}

/**
 * Insert immutable SessionRevision + generation history row, swap
 * current_generation_id, retire the old generation without mutating its
 * TrueForge IDs/hashes, rebind normals, leave response intents on the old gen.
 */
export async function atomicSwapSessionGeneration(
  sql: SqlClient,
  input: AtomicSwapSessionGenerationInput,
): Promise<AtomicSwapSessionGenerationResult> {
  const now = input.now ?? new Date().toISOString();

  return sql.begin(async (tx) => {
    const sessions = await tx<
      {
        id: string;
        state: string;
        current_generation_id: string | null;
      }[]
    >`
      SELECT id, state, current_generation_id
      FROM channel_agent_sessions
      WHERE id = ${input.channelAgentSessionId}
      FOR UPDATE
    `;
    const session = sessions[0];
    if (!session) {
      throw new Error(`channel_agent_session not found: ${input.channelAgentSessionId}`);
    }
    if (session.state !== "rotating") {
      throw new Error(`session must be rotating before swap: ${session.state}`);
    }
    if (session.current_generation_id !== input.previousGenerationId) {
      throw new Error("current generation changed concurrently during rotation");
    }

    const oldRows = await tx<
      {
        id: string;
        trueforge_session_id: string;
        effective_spec_hash: string;
        approval_policy_hash: string;
      }[]
    >`
      SELECT id, trueforge_session_id, effective_spec_hash, approval_policy_hash
      FROM channel_agent_session_generations
      WHERE id = ${input.previousGenerationId}
      FOR UPDATE
    `;
    const oldGen = oldRows[0];
    if (!oldGen) {
      throw new Error(`previous generation missing: ${input.previousGenerationId}`);
    }

    let stale = {
      staleProposalIds: [] as string[],
      stalePauseGroupIds: [] as string[],
      staleInterruptIds: [] as string[],
    };
    if (input.staleUnresolvedActions) {
      stale = await staleUnresolvedForGeneration(tx, input.previousGenerationId, now);
    }

    await tx`
      SELECT id FROM agent_profiles
      WHERE id = ${input.revision.agentProfileId}
      FOR UPDATE
    `;
    const revisionRows = await tx<{ max: number | null }[]>`
      SELECT MAX(source_config_revision) AS max
      FROM session_revisions
      WHERE agent_profile_id = ${input.revision.agentProfileId}
    `;
    const sourceConfigRevision = (revisionRows[0]?.max ?? 0) + 1;

    await tx`
      INSERT INTO session_revisions (
        id, agent_profile_id, source_config_revision, effective_config_redacted_json,
        effective_spec_hash, approval_policy_hash, created_by, created_at
      ) VALUES (
        ${input.revision.id}, ${input.revision.agentProfileId}, ${sourceConfigRevision},
        ${JSON.stringify(input.revision.effectiveConfigRedactedJson)}::jsonb,
        ${input.revision.effectiveSpecHash}, ${input.revision.approvalPolicyHash},
        ${input.revision.createdBy}, ${input.revision.createdAt}
      )
    `;

    await tx`
      INSERT INTO channel_agent_session_generations (
        id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
        trueforge_session_id, effective_spec_hash, approval_policy_hash, active_turn_id,
        state, created_at, retired_at
      ) VALUES (
        ${input.generation.id}, ${input.generation.channelAgentSessionId}, ${input.generation.generation},
        ${input.generation.agentVersionId}, ${input.generation.sessionRevisionId},
        ${input.generation.trueforgeSessionId}, ${input.generation.effectiveSpecHash},
        ${input.generation.approvalPolicyHash}, NULL,
        ${input.generation.state}, ${input.generation.createdAt}, ${input.generation.retiredAt}
      )
    `;

    // Swap pointer first so retiring the old row is allowed by triggers.
    await tx`
      UPDATE channel_agent_sessions
      SET current_generation_id = ${input.generation.id},
          updated_at = ${now}
      WHERE id = ${session.id}
    `;

    await tx`
      UPDATE channel_agent_session_generations
      SET state = 'retired', retired_at = ${now}
      WHERE id = ${input.previousGenerationId}
    `;

    // Confirm old TrueForge identity was not overwritten.
    const retained = await tx<{ trueforge_session_id: string; effective_spec_hash: string }[]>`
      SELECT trueforge_session_id, effective_spec_hash
      FROM channel_agent_session_generations
      WHERE id = ${input.previousGenerationId}
    `;
    if (
      retained[0]?.trueforge_session_id !== oldGen.trueforge_session_id ||
      retained[0]?.effective_spec_hash !== oldGen.effective_spec_hash
    ) {
      throw new Error("rotation must not overwrite old TrueForge IDs/hashes");
    }

    const queueItems = await tx<
      {
        id: string;
        input_type: TurnQueueInputType;
        bound_session_generation_id: string | null;
        state: string;
      }[]
    >`
      SELECT id, input_type, bound_session_generation_id, state
      FROM turn_queue_items
      WHERE channel_agent_session_id = ${session.id}
        AND state IN ('queued', 'retryable')
      FOR UPDATE
    `;

    const reboundNormalQueueItemIds: string[] = [];
    const responseIntentsLeftBound: string[] = [];

    for (const item of queueItems) {
      if (mayRebindQueueItem(item.input_type)) {
        await tx`
          UPDATE turn_queue_items
          SET bound_session_generation_id = ${input.generation.id}
          WHERE id = ${item.id}
        `;
        reboundNormalQueueItemIds.push(item.id);
      } else {
        responseIntentsLeftBound.push(item.id);
      }
    }

    return {
      newGenerationId: input.generation.id,
      newGeneration: input.generation.generation,
      retiredGenerationId: input.previousGenerationId,
      retainedOldTrueforgeSessionId: oldGen.trueforge_session_id,
      retainedOldEffectiveSpecHash: oldGen.effective_spec_hash,
      staleProposalIds: stale.staleProposalIds,
      stalePauseGroupIds: stale.stalePauseGroupIds,
      staleInterruptIds: stale.staleInterruptIds,
      reboundNormalQueueItemIds,
      responseIntentsLeftBound,
    };
  });
}

export async function completeSessionRotation(
  sql: SqlClient,
  input: CompleteSessionRotationInput,
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await sql`
    UPDATE channel_agent_sessions
    SET state = 'active', updated_at = ${now}
    WHERE id = ${input.channelAgentSessionId}
      AND state = 'rotating'
  `;
}

export async function abortSessionRotation(
  sql: SqlClient,
  input: AbortSessionRotationInput,
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await sql.begin(async (tx) => {
    const sessions = await tx<
      {
        id: string;
        state: string;
        current_generation_id: string | null;
      }[]
    >`
      SELECT id, state, current_generation_id
      FROM channel_agent_sessions
      WHERE id = ${input.channelAgentSessionId}
      FOR UPDATE
    `;
    const session = sessions[0];
    if (!session || session.state !== "rotating") {
      return;
    }

    if (input.abortGenerationId && session.current_generation_id === input.abortGenerationId) {
      await tx`
        UPDATE channel_agent_session_generations
        SET state = 'failed', retired_at = ${now}
        WHERE id = ${input.abortGenerationId}
          AND state IN ('ready', 'rotating')
      `;
      await tx`
        UPDATE channel_agent_session_generations
        SET state = 'ready', retired_at = NULL
        WHERE id = ${input.restoreGenerationId}
          AND state = 'retired'
      `;
      await tx`
        UPDATE channel_agent_sessions
        SET current_generation_id = ${input.restoreGenerationId},
            state = 'active',
            updated_at = ${now}
        WHERE id = ${session.id}
          AND state = 'rotating'
      `;
    } else if (session.current_generation_id === input.restoreGenerationId) {
      await tx`
        UPDATE channel_agent_session_generations
        SET state = 'ready'
        WHERE id = ${input.restoreGenerationId}
          AND state = 'rotating'
      `;
      await tx`
        UPDATE channel_agent_sessions
        SET state = 'active', updated_at = ${now}
        WHERE id = ${session.id}
          AND state = 'rotating'
      `;
    } else {
      await tx`
        UPDATE channel_agent_sessions
        SET state = 'active', updated_at = ${now}
        WHERE id = ${session.id}
          AND state = 'rotating'
      `;
    }
  });
}

/**
 * Record an honest MCP outcome during rotation. Never surfaces as claim denial.
 */
export async function recordMcpRotationOutcome(
  sql: SqlClient,
  input: RecordMcpRotationOutcomeInput,
): Promise<{
  outcome:
    { kind: "completed"; honest: true } | { kind: "unknown"; honest: true; needsAttention: true };
  denyByClaim: false;
}> {
  const outcome =
    input.knownTerminal === true
      ? ({ kind: "completed", honest: true } as const)
      : ({ kind: "unknown", honest: true, needsAttention: true } as const);
  const now = input.now ?? new Date().toISOString();
  if (input.agentTurnId && outcome.kind === "unknown") {
    await sql`
      UPDATE agent_turns
      SET state = 'uncertain'
      WHERE id = ${input.agentTurnId}
        AND state IN ('streaming', 'creating', 'acquiring', 'resuming')
    `;
  }
  await sql`
    INSERT INTO audit_events (
      id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
      redacted_payload_json, payload_hash, created_at
    )
    SELECT
      ${opaqueId("audit")},
      s.workspace_id,
      s.channel_id,
      'system',
      'session_rotation',
      'session.mcp_reconciled',
      'channel_agent_session',
      ${input.channelAgentSessionId},
      ${JSON.stringify({
        agent_turn_id: input.agentTurnId,
        outcome,
        deny_by_claim: false,
      })}::jsonb,
      ${`sha256:${randomBytes(32).toString("hex")}`},
      ${now}
    FROM channel_agent_sessions AS s
    WHERE s.id = ${input.channelAgentSessionId}
  `;
  return { outcome, denyByClaim: false };
}

/** Retired generations safe to tear down once no turn still holds the remote slot. */
export async function listDrainableRetiredSessionGenerationIds(
  sql: SqlClient,
  channelAgentSessionId: string,
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT g.id
    FROM channel_agent_session_generations AS g
    WHERE g.channel_agent_session_id = ${channelAgentSessionId}
      AND g.state = 'retired'
      AND NOT EXISTS (
        SELECT 1
        FROM audit_events AS cleanup
        WHERE cleanup.action = 'session.mcp_connector_deleted'
          AND cleanup.target_type = 'channel_agent_session_generation'
          AND cleanup.target_id = g.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM agent_turns AS t
        WHERE t.session_generation_id = g.id
          AND t.state IN (
            'acquiring',
            'creating',
            'streaming',
            'resuming',
            'required_actions',
            'uncertain'
          )
      )
  `;
  return rows.map((row) => row.id);
}

/** Record successful remote MCP connector deletion without mutating immutable generation history. */
export async function recordSessionGenerationMcpConnectorDeleted(
  sql: SqlClient,
  input: { generationId: string; now?: string },
): Promise<boolean> {
  const now = input.now ?? new Date().toISOString();
  const payload = { generation_id: input.generationId, outcome: "deleted" };
  const payloadJson = JSON.stringify(payload);
  const payloadHash = `sha256:${createHash("sha256").update(payloadJson).digest("hex")}`;
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`mcp-cleanup:${input.generationId}`}))`;
    const rows = await tx<{ id: string }[]>`
      INSERT INTO audit_events (
        id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
        redacted_payload_json, payload_hash, created_at
      )
      SELECT
        ${opaqueId("audit")},
        s.workspace_id,
        s.channel_id,
        'system',
        'mcp_cleanup',
        'session.mcp_connector_deleted',
        'channel_agent_session_generation',
        g.id,
        ${payloadJson}::jsonb,
        ${payloadHash},
        ${now}
      FROM channel_agent_session_generations AS g
      JOIN channel_agent_sessions AS s ON s.id = g.channel_agent_session_id
      WHERE g.id = ${input.generationId}
        AND g.state = 'retired'
        AND NOT EXISTS (
          SELECT 1
          FROM audit_events AS existing
          WHERE existing.action = 'session.mcp_connector_deleted'
            AND existing.target_type = 'channel_agent_session_generation'
            AND existing.target_id = g.id
        )
      RETURNING id
    `;
    return rows.length > 0;
  });
}

export async function listCoworkerChannelSessions(
  sql: SqlClient,
  input: { workspaceId: string; agentProfileId: string },
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM channel_agent_sessions
    WHERE workspace_id = ${input.workspaceId}
      AND agent_profile_id = ${input.agentProfileId}
      AND state <> 'disabled'
    ORDER BY id ASC
  `;
  return rows.map((row) => row.id);
}
