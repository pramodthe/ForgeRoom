import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { openPauseResponsePayload, sealPauseResponsePayload } from "./pause-crypto";
import { TURN_QUEUE_PRIORITY } from "./turn-queue";

export type SqlClient = postgres.Sql;

/** Matches orchestration PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS (24h). */
export const PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ResolvedPauseActionRow = {
  requiredActionId: string;
  providerActionId: string;
  actionType: "approval" | "question" | "connection";
  responseRedacted: unknown;
  responseCiphertext: string | null;
  toolCallId: string | null;
  threadId: string | null;
  payloadRedacted: Record<string, unknown>;
};

export type PauseResumeResponsePlaintext = {
  schemaVersion: 1;
  application_run_token: string;
  previous_trueforge_turn_id: string;
  responses: Array<
    | {
        kind: "approval";
        requiredActionId: string;
        providerActionId: string;
        threadId: string;
        toolCallId: string;
        approval: { status: "allow" } | { status: "deny"; reason?: string };
      }
    | {
        kind: "question";
        requiredActionId: string;
        providerActionId: string;
        threadId: string;
        toolCallId: string;
        content: string;
      }
  >;
};

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function sha256Payload(payload: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Assemble plaintext response-only payload from resolved RequiredActions.
 * Connection actions are not TrueForge resume items; they must not remain pending.
 */
export function assemblePauseResumePlaintext(input: {
  applicationRunToken: string;
  previousTrueforgeTurnId: string;
  logicalThreadId: string;
  actions: ResolvedPauseActionRow[];
}):
  | { ok: true; plaintext: PauseResumeResponsePlaintext }
  | { ok: false; reason: "incomplete" | "unsupported_connection" | "missing_binding" } {
  if (input.actions.length === 0) {
    return { ok: false, reason: "incomplete" };
  }
  const responses: PauseResumeResponsePlaintext["responses"] = [];
  for (const action of input.actions) {
    if (action.actionType === "connection") {
      return { ok: false, reason: "unsupported_connection" };
    }
    const payloadRedacted = asRecord(action.payloadRedacted);
    const threadId =
      action.threadId ??
      readString(payloadRedacted.threadId) ??
      readString(payloadRedacted.thread_id) ??
      input.logicalThreadId;
    const toolCallId =
      action.toolCallId ??
      readString(payloadRedacted.toolCallId) ??
      readString(payloadRedacted.tool_call_id) ??
      action.providerActionId;
    if (!threadId || !toolCallId) {
      return { ok: false, reason: "missing_binding" };
    }

    if (action.actionType === "approval") {
      const redacted = asRecord(action.responseRedacted);
      const decision = redacted.decision === "allow" ? "allow" : "deny";
      const reason = readString(redacted.reason) ?? undefined;
      responses.push({
        kind: "approval",
        requiredActionId: action.requiredActionId,
        providerActionId: action.providerActionId,
        threadId,
        toolCallId,
        approval:
          decision === "allow"
            ? { status: "allow" }
            : reason
              ? { status: "deny", reason }
              : { status: "deny" },
      });
      continue;
    }

    const redacted = asRecord(action.responseRedacted);
    const content =
      readString(redacted.answer) ??
      readString(redacted.content) ??
      (typeof redacted.prompt === "string" ? redacted.prompt : null);
    if (!content) {
      return { ok: false, reason: "missing_binding" };
    }
    responses.push({
      kind: "question",
      requiredActionId: action.requiredActionId,
      providerActionId: action.providerActionId,
      threadId,
      toolCallId,
      content,
    });
  }

  return {
    ok: true,
    plaintext: {
      schemaVersion: 1,
      application_run_token: input.applicationRunToken,
      previous_trueforge_turn_id: input.previousTrueforgeTurnId,
      responses,
    },
  };
}

export type ClaimPauseGroupResumeInput = {
  pauseGroupId: string;
  workspaceId: string;
  workerId: string;
  encryptionKey: Buffer;
  /** Optional caller-supplied claim token; generated when omitted. */
  resumeClaimToken?: string;
  /** Route identity already authorized by the caller; checked under the claim transaction. */
  expectedBinding?: {
    channelId: string;
    channelAgentSessionId: string;
    coworkerId: string;
    logicalThreadId: string;
  };
  applicationRunToken?: string;
  /**
   * Pre-sealed durable payload. When omitted, claim assembles and seals from
   * resolved RequiredActions inside the CAS transaction.
   */
  sealed?: {
    ciphertext: string;
    payloadHash: string;
    plaintext: PauseResumeResponsePlaintext;
  };
  now?: string;
};

export type ClaimPauseGroupResumeResult =
  | {
      ok: true;
      inserted: boolean;
      pauseResumeId: string;
      pauseGroupId: string;
      applicationRunToken: string;
      responsePayloadHash: string;
      resumeClaimToken: string;
      queueItemId: string;
      agentTurnId: string;
      previousTrueforgeTurnId: string;
      trueforgeSessionId: string;
      channelId: string;
      channelAgentSessionId: string;
      coworkerId: string;
      logicalThreadId: string;
      requiredActionIds: string[];
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "binding_mismatch"
        | "incomplete"
        | "not_ready"
        | "unsupported_connection"
        | "missing_binding"
        | "missing_session"
        | "already_resuming"
        | "terminal";
      existingPauseResumeId?: string;
    };

/**
 * CAS PauseGroup ready → resuming and insert one PauseResume with encrypted payload
 * before any TrueForge network call. Competing workers observe the existing row.
 */
export async function claimPauseGroupResume(
  sql: SqlClient,
  input: ClaimPauseGroupResumeInput,
): Promise<ClaimPauseGroupResumeResult> {
  const now = input.now ?? new Date().toISOString();
  const resumeClaimToken = input.resumeClaimToken ?? opaqueId("claim");

  return sql.begin(async (tx) => {
    const groups = await tx<
      {
        id: string;
        state: string;
        generation: number;
        required_action_count: number;
        resolved_action_count: number;
        resume_claim_token: string | null;
        agent_turn_id: string;
        trueforge_turn_id: string;
        workspace_id: string;
        channel_id: string;
        channel_agent_session_id: string;
        agent_profile_id: string;
        session_generation_id: string;
        logical_thread_id: string;
        trueforge_session_id: string | null;
        run_step_id: string;
      }[]
    >`
      SELECT
        pg.id, pg.state, pg.generation, pg.required_action_count, pg.resolved_action_count,
        pg.resume_claim_token, pg.agent_turn_id, pg.trueforge_turn_id,
        c.workspace_id, c.id AS channel_id,
        t.channel_agent_session_id, t.session_generation_id, t.run_step_id,
        cas.agent_profile_id,
        cas.logical_agui_thread_id AS logical_thread_id,
        gen.trueforge_session_id
      FROM pause_groups AS pg
      JOIN agent_turns AS t ON t.id = pg.agent_turn_id
      JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
      JOIN channel_agent_session_generations AS gen ON gen.id = t.session_generation_id
      JOIN run_steps AS rs ON rs.id = t.run_step_id
      JOIN runs AS r ON r.id = rs.run_id
      JOIN channels AS c ON c.id = r.channel_id
      WHERE pg.id = ${input.pauseGroupId}
      FOR UPDATE OF pg
    `;
    const group = groups[0];
    if (!group) {
      return { ok: false, reason: "not_found" };
    }
    if (group.workspace_id !== input.workspaceId) {
      return { ok: false, reason: "forbidden" };
    }
    if (
      input.expectedBinding &&
      (group.channel_id !== input.expectedBinding.channelId ||
        group.channel_agent_session_id !== input.expectedBinding.channelAgentSessionId ||
        group.agent_profile_id !== input.expectedBinding.coworkerId ||
        group.logical_thread_id !== input.expectedBinding.logicalThreadId)
    ) {
      return { ok: false, reason: "binding_mismatch" };
    }

    const existingResumes = await tx<
      {
        id: string;
        state: string;
        application_run_token: string;
        response_payload_hash: string;
      }[]
    >`
      SELECT id, state, application_run_token, response_payload_hash
      FROM pause_resumes
      WHERE pause_group_id = ${group.id}
      FOR UPDATE
    `;
    const existing = existingResumes[0];
    if (existing) {
      return {
        ok: false,
        reason: "already_resuming",
        existingPauseResumeId: existing.id,
      };
    }

    if (["resumed", "cancelled", "expired", "stale"].includes(group.state)) {
      return { ok: false, reason: "terminal" };
    }
    if (group.state !== "ready") {
      return { ok: false, reason: group.state === "collecting" ? "incomplete" : "not_ready" };
    }
    if (group.resolved_action_count !== group.required_action_count) {
      return { ok: false, reason: "incomplete" };
    }
    if (!group.trueforge_session_id) {
      return { ok: false, reason: "missing_session" };
    }

    const actions = await tx<
      {
        id: string;
        provider_action_id: string;
        action_type: "approval" | "question" | "connection";
        state: string;
        response_redacted_json: unknown;
        response_ciphertext: string | null;
        payload_redacted_json: Record<string, unknown>;
        tool_call_id: string | null;
      }[]
    >`
      SELECT
        ra.id, ra.provider_action_id, ra.action_type, ra.state,
        ra.response_redacted_json, ra.response_ciphertext, ra.payload_redacted_json,
        ap.tool_call_id
      FROM required_actions AS ra
      LEFT JOIN action_proposals AS ap ON ap.required_action_id = ra.id
      WHERE ra.pause_group_id = ${group.id}
      ORDER BY ra.created_at ASC
      FOR UPDATE OF ra
    `;

    if (actions.length !== group.required_action_count) {
      return { ok: false, reason: "incomplete" };
    }
    if (actions.some((row) => row.state !== "resolved")) {
      return { ok: false, reason: "incomplete" };
    }

    let decryptedActions: Array<ResolvedPauseActionRow>;
    try {
      decryptedActions = actions.map((row) => {
        if (!row.response_ciphertext) {
          throw new Error("missing encrypted RequiredAction response");
        }
        return {
          requiredActionId: row.id,
          providerActionId: row.provider_action_id,
          actionType: row.action_type,
          responseRedacted: openPauseResponsePayload(row.response_ciphertext, input.encryptionKey),
          responseCiphertext: row.response_ciphertext,
          toolCallId: row.tool_call_id,
          threadId: null,
          payloadRedacted: row.payload_redacted_json ?? {},
        };
      });
    } catch {
      return { ok: false, reason: "missing_binding" };
    }

    const assembled = assemblePauseResumePlaintext({
      applicationRunToken:
        input.sealed?.plaintext.application_run_token ??
        input.applicationRunToken ??
        opaqueId("art_resume"),
      previousTrueforgeTurnId: group.trueforge_turn_id,
      logicalThreadId: group.logical_thread_id,
      actions: decryptedActions,
    });
    if (!assembled.ok) {
      return { ok: false, reason: assembled.reason };
    }

    const sealed =
      input.sealed ??
      (() => {
        const next = sealPauseResponsePayload(assembled.plaintext, input.encryptionKey);
        return {
          ciphertext: next.ciphertext,
          payloadHash: next.payloadHash,
          plaintext: assembled.plaintext,
        };
      })();
    if (input.sealed) {
      const assembledHash = sealPauseResponsePayload(
        assembled.plaintext,
        input.encryptionKey,
      ).payloadHash;
      if (input.sealed.payloadHash !== assembledHash) {
        return { ok: false, reason: "missing_binding" };
      }
    }
    const pauseResumeId = opaqueId("pr");
    const applicationRunToken = assembled.plaintext.application_run_token;

    const cas = await tx<{ id: string }[]>`
      UPDATE pause_groups
      SET
        state = 'resuming',
        resume_claim_token = ${resumeClaimToken}
      WHERE id = ${group.id}
        AND state = 'ready'
        AND resolved_action_count = required_action_count
        AND resume_claim_token IS NULL
      RETURNING id
    `;
    if (cas.length === 0) {
      const raced = await tx<{ id: string }[]>`
        SELECT id FROM pause_resumes WHERE pause_group_id = ${group.id} LIMIT 1
      `;
      return {
        ok: false,
        reason: "already_resuming",
        existingPauseResumeId: raced[0]?.id,
      };
    }

    await tx`
      INSERT INTO pause_resumes (
        id, pause_group_id, expected_generation, application_run_token,
        response_payload_hash, response_payload_ciphertext, state, claimed_by, created_at
      ) VALUES (
        ${pauseResumeId}, ${group.id}, ${group.generation}, ${applicationRunToken},
        ${sealed.payloadHash}, ${sealed.ciphertext}, 'claimed', ${input.workerId}, ${now}
      )
    `;

    await tx`
      SELECT id FROM channel_agent_sessions
      WHERE id = ${group.channel_agent_session_id}
      FOR UPDATE
    `;
    const lockedFifo = await tx<{ fifo_sequence: number }[]>`
      SELECT fifo_sequence
      FROM turn_queue_items
      WHERE channel_agent_session_id = ${group.channel_agent_session_id}
      ORDER BY fifo_sequence DESC
      LIMIT 1
      FOR UPDATE
    `;
    const fifoSequence = (lockedFifo[0]?.fifo_sequence ?? -1) + 1;
    const queueItemId = opaqueId("tqi");
    await tx`
      INSERT INTO turn_queue_items (
        id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
        input_payload_redacted_json, priority, fifo_sequence, state, created_at
      ) VALUES (
        ${queueItemId}, ${group.channel_agent_session_id}, ${group.run_step_id},
        ${group.session_generation_id}, 'pause_group_response',
        ${JSON.stringify({
          pause_group_id: group.id,
          pause_resume_id: pauseResumeId,
          response_payload_hash: sealed.payloadHash,
        })}::jsonb,
        ${TURN_QUEUE_PRIORITY.pause_group_response}, ${fifoSequence}, 'queued', ${now}
      )
    `;

    const eventPayload = {
      pause_group_id: group.id,
      pause_resume_id: pauseResumeId,
      response_payload_hash: sealed.payloadHash,
      required_action_count: group.required_action_count,
    };
    await tx`
      INSERT INTO run_events (
        id, agent_turn_id, trueforge_event_id, thread_id,
        normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
      ) VALUES (
        ${opaqueId("re")}, ${group.agent_turn_id},
        ${`app:pause_group.resume_started:${pauseResumeId}`},
        ${group.logical_thread_id},
        ${JSON.stringify(eventPayload)}::jsonb,
        'pause_group.resume_started', ${now}, ${now}
      )
    `;
    await tx`
      INSERT INTO audit_events (
        id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
        redacted_payload_json, payload_hash, created_at
      ) VALUES (
        ${opaqueId("audit")}, ${group.workspace_id}, ${group.channel_id},
        'system', ${input.workerId}, 'pause_group.resume_started', 'pause_resume', ${pauseResumeId},
        ${JSON.stringify(eventPayload)}::jsonb, ${sha256Payload(eventPayload)}, ${now}
      )
    `;

    return {
      ok: true,
      inserted: true,
      pauseResumeId,
      pauseGroupId: group.id,
      applicationRunToken,
      responsePayloadHash: sealed.payloadHash,
      resumeClaimToken,
      queueItemId,
      agentTurnId: group.agent_turn_id,
      previousTrueforgeTurnId: group.trueforge_turn_id,
      trueforgeSessionId: group.trueforge_session_id!,
      channelId: group.channel_id,
      channelAgentSessionId: group.channel_agent_session_id,
      coworkerId: group.agent_profile_id,
      logicalThreadId: group.logical_thread_id,
      requiredActionIds: actions.map((row) => row.id),
    };
  });
}

export type LoadPauseResumeForCreateResult =
  | {
      ok: true;
      pauseResumeId: string;
      pauseGroupId: string;
      state: string;
      applicationRunToken: string;
      responsePayloadHash: string;
      plaintext: PauseResumeResponsePlaintext;
      trueforgeResumeTurnId: string | null;
      previousTrueforgeTurnId: string;
      trueforgeSessionId: string;
      agentTurnId: string;
    }
  | { ok: false; reason: "not_found" | "decrypt_failed" };

export async function loadPauseResumeForCreate(
  sql: SqlClient,
  input: { pauseResumeId: string; encryptionKey: Buffer },
): Promise<LoadPauseResumeForCreateResult> {
  const rows = await sql<
    {
      id: string;
      pause_group_id: string;
      state: string;
      application_run_token: string;
      response_payload_hash: string;
      response_payload_ciphertext: string;
      trueforge_resume_turn_id: string | null;
      trueforge_turn_id: string;
      trueforge_session_id: string | null;
      agent_turn_id: string;
    }[]
  >`
    SELECT
      pr.id, pr.pause_group_id, pr.state, pr.application_run_token,
      pr.response_payload_hash, pr.response_payload_ciphertext, pr.trueforge_resume_turn_id,
      pg.trueforge_turn_id, pg.agent_turn_id,
      gen.trueforge_session_id
    FROM pause_resumes AS pr
    JOIN pause_groups AS pg ON pg.id = pr.pause_group_id
    JOIN agent_turns AS t ON t.id = pg.agent_turn_id
    JOIN channel_agent_session_generations AS gen ON gen.id = t.session_generation_id
    WHERE pr.id = ${input.pauseResumeId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || !row.trueforge_session_id) {
    return { ok: false, reason: "not_found" };
  }
  try {
    const opened = openPauseResponsePayload(row.response_payload_ciphertext, input.encryptionKey);
    const plaintext = opened as PauseResumeResponsePlaintext;
    if (!plaintext || plaintext.schemaVersion !== 1 || !Array.isArray(plaintext.responses)) {
      return { ok: false, reason: "decrypt_failed" };
    }
    return {
      ok: true,
      pauseResumeId: row.id,
      pauseGroupId: row.pause_group_id,
      state: row.state,
      applicationRunToken: row.application_run_token,
      responsePayloadHash: row.response_payload_hash,
      plaintext,
      trueforgeResumeTurnId: row.trueforge_resume_turn_id,
      previousTrueforgeTurnId: row.trueforge_turn_id,
      trueforgeSessionId: row.trueforge_session_id,
      agentTurnId: row.agent_turn_id,
    };
  } catch {
    return { ok: false, reason: "decrypt_failed" };
  }
}

export async function markPauseResumeCreating(
  sql: SqlClient,
  input: { pauseResumeId: string },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "state_mismatch" }> {
  const rows = await sql`
    UPDATE pause_resumes
    SET state = 'creating'
    WHERE id = ${input.pauseResumeId}
      AND state IN ('claimed', 'uncertain')
    RETURNING id
  `;
  if (rows.length === 0) {
    return { ok: false, reason: "state_mismatch" };
  }
  return { ok: true };
}

export async function markPauseResumeUncertain(
  sql: SqlClient,
  input: { pauseResumeId: string; error: Record<string, unknown>; now?: string },
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE pause_resumes
      SET state = 'uncertain'
      WHERE id = ${input.pauseResumeId}
        AND state IN ('claimed', 'creating', 'uncertain')
    `;
    const groups = await tx<{ pause_group_id: string; agent_turn_id: string; thread_id: string }[]>`
      SELECT pr.pause_group_id, pg.agent_turn_id, cas.logical_agui_thread_id AS thread_id
      FROM pause_resumes AS pr
      JOIN pause_groups AS pg ON pg.id = pr.pause_group_id
      JOIN agent_turns AS t ON t.id = pg.agent_turn_id
      JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
      WHERE pr.id = ${input.pauseResumeId}
      LIMIT 1
    `;
    const group = groups[0];
    if (!group) return;
    await tx`
      UPDATE pause_groups
      SET state = 'uncertain'
      WHERE id = ${group.pause_group_id}
        AND state IN ('resuming', 'uncertain')
    `;
    await tx`
      INSERT INTO run_events (
        id, agent_turn_id, trueforge_event_id, thread_id,
        normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
      ) VALUES (
        ${opaqueId("re")}, ${group.agent_turn_id},
        ${`app:pause_group.resume_uncertain:${input.pauseResumeId}:${now}`},
        ${group.thread_id},
        ${JSON.stringify({ pause_resume_id: input.pauseResumeId, error: input.error })}::jsonb,
        'pause_group.resume_uncertain', ${now}, ${now}
      )
    `;
  });
}

export async function completePauseResume(
  sql: SqlClient,
  input: {
    pauseResumeId: string;
    trueforgeResumeTurnId: string;
    reconciled?: boolean;
    now?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "state_mismatch" }> {
  const now = input.now ?? new Date().toISOString();
  const nextState = input.reconciled ? "reconciled" : "completed";
  return sql.begin(async (tx) => {
    const updated = await tx<{ pause_group_id: string }[]>`
      UPDATE pause_resumes
      SET
        state = ${nextState},
        trueforge_resume_turn_id = ${input.trueforgeResumeTurnId},
        completed_at = ${now}
      WHERE id = ${input.pauseResumeId}
        AND state IN ('claimed', 'creating', 'uncertain')
      RETURNING pause_group_id
    `;
    const row = updated[0];
    if (!row) {
      return { ok: false, reason: "state_mismatch" };
    }
    await tx`
      UPDATE pause_groups
      SET state = 'resumed', resumed_at = ${now}
      WHERE id = ${row.pause_group_id}
        AND state IN ('resuming', 'uncertain')
    `;
    const meta = await tx<{ agent_turn_id: string; thread_id: string }[]>`
      SELECT pg.agent_turn_id, cas.logical_agui_thread_id AS thread_id
      FROM pause_groups AS pg
      JOIN agent_turns AS t ON t.id = pg.agent_turn_id
      JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
      WHERE pg.id = ${row.pause_group_id}
      LIMIT 1
    `;
    const m = meta[0];
    if (m) {
      await tx`
        INSERT INTO run_events (
          id, agent_turn_id, trueforge_event_id, thread_id,
          normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
        ) VALUES (
          ${opaqueId("re")}, ${m.agent_turn_id},
          ${`app:pause_group.resumed:${input.pauseResumeId}`},
          ${m.thread_id},
          ${JSON.stringify({
            pause_resume_id: input.pauseResumeId,
            trueforge_resume_turn_id: input.trueforgeResumeTurnId,
            reconciled: Boolean(input.reconciled),
          })}::jsonb,
          'pause_group.resumed', ${now}, ${now}
        )
      `;
    }
    return { ok: true };
  });
}

/**
 * Wipe resume/required-action ciphertext after confirmed recovery window.
 * Retains redacted summaries and hashes.
 */
export async function expirePauseResumeCiphertexts(
  sql: SqlClient,
  input?: { now?: string; recoveryWindowMs?: number },
): Promise<{ expiredResumeCount: number; expiredActionCount: number }> {
  const now = input?.now ?? new Date().toISOString();
  const windowMs = input?.recoveryWindowMs ?? PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS;
  const cutoff = new Date(Date.parse(now) - windowMs).toISOString();

  return sql.begin(async (tx) => {
    const resumes = await tx<{ id: string; pause_group_id: string }[]>`
      UPDATE pause_resumes
      SET response_payload_ciphertext = 'enc:v1:expired'
      WHERE state IN ('completed', 'reconciled')
        AND completed_at IS NOT NULL
        AND completed_at <= ${cutoff}::timestamptz
        AND response_payload_ciphertext IS NOT NULL
        AND response_payload_ciphertext <> 'enc:v1:expired'
      RETURNING id, pause_group_id
    `;
    let expiredActionCount = 0;
    for (const resume of resumes) {
      const actions = await tx`
        UPDATE required_actions
        SET response_ciphertext = NULL
        WHERE pause_group_id = ${resume.pause_group_id}
          AND response_ciphertext IS NOT NULL
        RETURNING id
      `;
      expiredActionCount += actions.length;
    }
    return { expiredResumeCount: resumes.length, expiredActionCount };
  });
}

export type RecordQuestionAnswerInput = {
  questionId: string;
  workspaceId: string;
  actorUserId: string;
  expectedPromptHash: string;
  answer: string;
  encryptionKey: Buffer;
  now?: string;
};

export type RecordQuestionAnswerResult =
  | {
      ok: true;
      questionId: string;
      pauseGroupId: string;
      pauseGroupReady: boolean;
      requiredActionCount: number;
      resolvedActionCount: number;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "forbidden"
        | "already_answered"
        | "expired"
        | "stale_prompt"
        | "forbidden_state";
    };

/** Resolve a Question RequiredAction without calling TrueForge. */
export async function recordQuestionAnswer(
  sql: SqlClient,
  input: RecordQuestionAnswerInput,
): Promise<RecordQuestionAnswerResult> {
  const now = input.now ?? new Date().toISOString();
  return sql.begin(async (tx) => {
    const rows = await tx<
      {
        id: string;
        required_action_id: string;
        prompt_hash: string;
        state: string;
        expires_at: string | Date;
        pause_group_id: string;
        workspace_id: string;
        required_action_state: string;
      }[]
    >`
      SELECT
        q.id, q.required_action_id, q.prompt_hash, q.state, q.expires_at,
        ra.pause_group_id, c.workspace_id, ra.state AS required_action_state
      FROM questions AS q
      JOIN required_actions AS ra ON ra.id = q.required_action_id
      JOIN runs AS r ON r.id = q.run_id
      JOIN channels AS c ON c.id = r.channel_id
      WHERE q.id = ${input.questionId}
      FOR UPDATE OF q, ra
    `;
    const row = rows[0];
    if (!row) {
      return { ok: false, reason: "not_found" };
    }
    if (row.workspace_id !== input.workspaceId) {
      return { ok: false, reason: "forbidden" };
    }
    if (row.state === "answered") {
      return { ok: false, reason: "already_answered" };
    }
    if (row.state === "expired" || Date.parse(String(row.expires_at)) <= Date.parse(now)) {
      return { ok: false, reason: "expired" };
    }
    if (row.state !== "requested" || row.required_action_state !== "pending") {
      return { ok: false, reason: "forbidden_state" };
    }
    if (row.prompt_hash !== input.expectedPromptHash) {
      await tx`UPDATE questions SET state = 'stale' WHERE id = ${row.id} AND state = 'requested'`;
      await tx`
        UPDATE required_actions SET state = 'stale'
        WHERE id = ${row.required_action_id} AND state = 'pending'
      `;
      return { ok: false, reason: "stale_prompt" };
    }

    const responsePlaintext = { answer: input.answer };
    const responseRedacted = { answer_present: true, answer_length: input.answer.length };
    const sealed = sealPauseResponsePayload(responsePlaintext, input.encryptionKey);

    await tx`
      UPDATE questions
      SET
        state = 'answered',
        answered_by = ${input.actorUserId},
        answer_ciphertext = ${sealed.ciphertext},
        answer_redacted_json = ${JSON.stringify({ answer_length: input.answer.length })}::text::jsonb,
        answered_at = ${now}
      WHERE id = ${row.id} AND state = 'requested'
    `;
    await tx`
      UPDATE required_actions
      SET
        state = 'resolved',
        response_ciphertext = ${sealed.ciphertext},
        response_redacted_json = ${JSON.stringify(responseRedacted)}::text::jsonb,
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
    return {
      ok: true,
      questionId: row.id,
      pauseGroupId: group.id,
      pauseGroupReady: group.state === "ready",
      requiredActionCount: group.required_action_count,
      resolvedActionCount: group.resolved_action_count,
    };
  });
}

export async function loadPauseGroupRequiredActionIds(
  sql: SqlClient,
  pauseGroupId: string,
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM required_actions
    WHERE pause_group_id = ${pauseGroupId}
    ORDER BY created_at ASC
  `;
  return rows.map((row) => row.id);
}

export async function findPauseGroupByInterruptIds(
  sql: SqlClient,
  input: { workspaceId: string; interruptIds: string[] },
): Promise<
  { ok: true; pauseGroupId: string } | { ok: false; reason: "not_found" | "ambiguous" | "empty" }
> {
  if (input.interruptIds.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const rows = await sql<{ pause_group_id: string }[]>`
    SELECT DISTINCT ra.pause_group_id
    FROM required_actions AS ra
    JOIN pause_groups AS pg ON pg.id = ra.pause_group_id
    JOIN agent_turns AS t ON t.id = pg.agent_turn_id
    JOIN run_steps AS rs ON rs.id = t.run_step_id
    JOIN runs AS r ON r.id = rs.run_id
    JOIN channels AS c ON c.id = r.channel_id
    WHERE c.workspace_id = ${input.workspaceId}
      AND (
        ra.id IN ${sql(input.interruptIds)}
        OR ra.provider_action_id IN ${sql(input.interruptIds)}
      )
  `;
  if (rows.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  if (rows.length > 1) {
    return { ok: false, reason: "ambiguous" };
  }
  return { ok: true, pauseGroupId: rows[0]!.pause_group_id };
}

export async function loadPauseGroupResumeGate(
  sql: SqlClient,
  input: { pauseGroupId: string; workspaceId: string },
): Promise<
  | {
      ok: true;
      state: string;
      ready: boolean;
      expired: boolean;
      requiredActionIds: string[];
      providerActionIds: string[];
      actions: Array<{ requiredActionId: string; providerActionId: string }>;
      interruptIds: string[];
      requiredActionCount: number;
      resolvedActionCount: number;
      channelId: string;
      channelAgentSessionId: string;
      coworkerId: string;
      logicalThreadId: string;
    }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const rows = await sql<
    {
      id: string;
      state: string;
      required_action_count: number;
      resolved_action_count: number;
      workspace_id: string;
      channel_id: string;
      channel_agent_session_id: string;
      coworker_id: string;
      logical_thread_id: string;
    }[]
  >`
    SELECT
      pg.id, pg.state, pg.required_action_count, pg.resolved_action_count, c.workspace_id,
      c.id AS channel_id, cas.id AS channel_agent_session_id,
      cas.agent_profile_id AS coworker_id,
      cas.logical_agui_thread_id AS logical_thread_id
    FROM pause_groups AS pg
    JOIN agent_turns AS t ON t.id = pg.agent_turn_id
    JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
    JOIN run_steps AS rs ON rs.id = t.run_step_id
    JOIN runs AS r ON r.id = rs.run_id
    JOIN channels AS c ON c.id = r.channel_id
    WHERE pg.id = ${input.pauseGroupId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.workspace_id !== input.workspaceId) {
    return { ok: false, reason: "forbidden" };
  }
  const actions = await sql<{ id: string; provider_action_id: string }[]>`
    SELECT id, provider_action_id FROM required_actions
    WHERE pause_group_id = ${row.id}
    ORDER BY created_at ASC
  `;
  const requiredActionIds = actions.map((a) => a.id);
  const providerActionIds = actions.map((a) => a.provider_action_id);
  const actionAliases = actions.map((action) => ({
    requiredActionId: action.id,
    providerActionId: action.provider_action_id,
  }));
  // Clients may resume with either durable RequiredAction ids or provider interrupt ids.
  const interruptIds = [...new Set([...requiredActionIds, ...providerActionIds])];
  return {
    ok: true,
    state: row.state,
    ready:
      row.state === "ready" ||
      row.state === "resuming" ||
      row.state === "resumed" ||
      row.state === "uncertain",
    expired: row.state === "expired",
    requiredActionIds,
    providerActionIds,
    actions: actionAliases,
    interruptIds,
    requiredActionCount: row.required_action_count,
    resolvedActionCount: row.resolved_action_count,
    channelId: row.channel_id,
    channelAgentSessionId: row.channel_agent_session_id,
    coworkerId: row.coworker_id,
    logicalThreadId: row.logical_thread_id,
  };
}
