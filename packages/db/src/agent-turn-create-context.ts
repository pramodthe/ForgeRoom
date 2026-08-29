import type postgres from "postgres";
import { openPauseResponsePayload } from "./pause-crypto";

type SqlClient = postgres.Sql;

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export type AgentTurnCreateContext =
  | {
      kind: "normal";
      inputType: "normal" | "correction";
      applicationRunToken: string;
      content: string;
      previousTrueforgeTurnId: string | null;
      localTrueforgeTurnId: string | null;
      trueforgeSessionId: string;
    }
  | {
      kind: "component_continuation";
      inputType: "component_interaction_response";
      applicationRunToken: string;
      previousTrueforgeTurnId: string;
      localTrueforgeTurnId: string | null;
      trueforgeSessionId: string;
      interruptId: string;
      toolCallId: string;
      threadId: string;
      resultRedacted: unknown;
    };

export async function loadAgentTurnCreateContext(
  sql: SqlClient,
  agentTurnId: string,
  pausePayloadEncryptionKey?: Buffer,
): Promise<AgentTurnCreateContext | null> {
  const rows = await sql<
    {
      input_type: string;
      application_run_token: string;
      trueforge_turn_id: string | null;
      trueforge_session_id: string;
      input_payload_redacted_json: Record<string, unknown> | null;
      queue_item_id: string;
    }[]
  >`
    SELECT
      t.input_type,
      t.application_run_token,
      t.trueforge_turn_id,
      g.trueforge_session_id,
      q.input_payload_redacted_json,
      t.queue_item_id
    FROM agent_turns AS t
    JOIN channel_agent_session_generations AS g ON g.id = t.session_generation_id
    JOIN turn_queue_items AS q ON q.id = t.queue_item_id
    WHERE t.id = ${agentTurnId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.input_type === "component_interaction_response") {
    const payload = asRecord(row.input_payload_redacted_json);
    const interruptId =
      typeof payload.component_interrupt_id === "string" ? payload.component_interrupt_id : null;
    if (!interruptId) {
      return null;
    }
    const interrupts = await sql<
      {
        id: string;
        state: string;
        tool_call_id: string;
        logical_thread_id: string;
        result_redacted_json: unknown;
        source_trueforge_turn_id: string | null;
      }[]
    >`
      SELECT
        i.id,
        i.state,
        i.tool_call_id,
        i.logical_thread_id,
        i.result_redacted_json,
        source_turn.trueforge_turn_id AS source_trueforge_turn_id
      FROM ui_component_interrupts AS i
      JOIN agent_turns AS source_turn ON source_turn.id = i.agent_turn_id
      WHERE i.id = ${interruptId}
      LIMIT 1
    `;
    const interrupt = interrupts[0];
    if (
      !interrupt ||
      interrupt.state !== "resolved" ||
      !interrupt.source_trueforge_turn_id ||
      interrupt.result_redacted_json === null ||
      interrupt.result_redacted_json === undefined
    ) {
      return null;
    }

    return {
      kind: "component_continuation",
      inputType: "component_interaction_response",
      applicationRunToken: row.application_run_token,
      previousTrueforgeTurnId: interrupt.source_trueforge_turn_id,
      localTrueforgeTurnId: row.trueforge_turn_id,
      trueforgeSessionId: row.trueforge_session_id,
      interruptId: interrupt.id,
      toolCallId: interrupt.tool_call_id,
      threadId: interrupt.logical_thread_id,
      resultRedacted: parseJson(interrupt.result_redacted_json),
    };
  }

  if (row.input_type !== "normal" && row.input_type !== "correction") {
    return null;
  }

  const payload = asRecord(row.input_payload_redacted_json);
  let content = typeof payload.content === "string" ? payload.content : null;
  let correctionPreviousTurnId: string | null = null;
  if (
    row.input_type === "correction" &&
    payload.content_source === "encrypted_required_action_response"
  ) {
    const requiredActionId =
      typeof payload.required_action_id === "string" ? payload.required_action_id : null;
    const pauseGroupId = typeof payload.pause_group_id === "string" ? payload.pause_group_id : null;
    if (!requiredActionId || !pauseGroupId || !pausePayloadEncryptionKey) return null;

    const sources = await sql<
      Array<{ response_ciphertext: string | null; trueforge_turn_id: string | null }>
    >`
      SELECT ra.response_ciphertext, source_turn.trueforge_turn_id
      FROM required_actions AS ra
      JOIN pause_groups AS pg ON pg.id = ra.pause_group_id
      JOIN agent_turns AS source_turn ON source_turn.id = pg.agent_turn_id
      JOIN agent_turns AS correction_turn
        ON correction_turn.channel_agent_session_id = source_turn.channel_agent_session_id
      WHERE ra.id = ${requiredActionId}
        AND pg.id = ${pauseGroupId}
        AND correction_turn.id = ${agentTurnId}
        AND ra.state = 'resolved'
        AND ra.response_redacted_json->>'request_changes' = 'true'
      LIMIT 1
    `;
    const source = sources[0];
    if (!source?.response_ciphertext || !source.trueforge_turn_id) return null;
    try {
      const opened = asRecord(
        openPauseResponsePayload(source.response_ciphertext, pausePayloadEncryptionKey),
      );
      content =
        opened.request_changes === true && typeof opened.reason === "string"
          ? opened.reason.trim()
          : null;
      correctionPreviousTurnId = source.trueforge_turn_id;
    } catch {
      return null;
    }
  }
  if (!content) {
    return null;
  }

  const previousRows = await sql<{ trueforge_turn_id: string | null }[]>`
    SELECT trueforge_turn_id
    FROM agent_turns
    WHERE channel_agent_session_id = (
      SELECT channel_agent_session_id FROM agent_turns WHERE id = ${agentTurnId}
    )
      AND id <> ${agentTurnId}
      AND trueforge_turn_id IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 1
  `;

  return {
    kind: "normal",
    inputType: row.input_type,
    applicationRunToken: row.application_run_token,
    content,
    previousTrueforgeTurnId: correctionPreviousTurnId ?? previousRows[0]?.trueforge_turn_id ?? null,
    localTrueforgeTurnId: row.trueforge_turn_id,
    trueforgeSessionId: row.trueforge_session_id,
  };
}

export async function markComponentInterruptContinued(
  sql: SqlClient,
  input: { interruptId: string; agentTurnId: string; now?: string },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "invalid_state" }> {
  const now = input.now ?? new Date().toISOString();
  const rows = await sql<{ id: string }[]>`
    UPDATE ui_component_interrupts
    SET state = 'continued', continued_at = ${now}
    WHERE id = ${input.interruptId}
      AND state = 'resolved'
    RETURNING id
  `;
  if (!rows[0]) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}
