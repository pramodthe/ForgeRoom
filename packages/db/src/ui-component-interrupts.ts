import type postgres from "postgres";
import { canTransitionUiComponentInterrupt, canTransitionUiInteraction } from "@forgeroom/domain";

export type SqlClient = postgres.Sql;

/**
 * Atomically closes every unresolved controlled-component interrupt owned by a
 * terminal/cancelling run step. Revoking its action grant prevents a token
 * issued before the terminal transition from being committed afterwards.
 */
export async function staleWaitingUiComponentInterruptsForRunStep(
  sql: SqlClient,
  input: { runStepId: string; now: string; reason: "run_cancelling" | "run_failed" },
): Promise<{ staleInterruptIds: string[] }> {
  if (
    !canTransitionUiComponentInterrupt("waiting", "stale") ||
    !canTransitionUiInteraction("token_issued", "stale")
  ) {
    throw new Error("Controlled UI stale transition is not allowed by the domain lifecycle");
  }
  const rows = await sql<{ id: string }[]>`
    WITH stale_interrupts AS (
      UPDATE ui_component_interrupts
      SET
        state = 'stale',
        stale_at = ${input.now}::timestamptz,
        result_redacted_json = jsonb_build_object('reason', ${input.reason}::text)
      WHERE run_step_id = ${input.runStepId}
        AND state = 'waiting'
      RETURNING id, action_grant_id
    ), revoked_grants AS (
      UPDATE ui_surface_grants
      SET revoked_at = COALESCE(revoked_at, ${input.now}::timestamptz)
      WHERE id IN (SELECT action_grant_id FROM stale_interrupts)
      RETURNING id
    ), stale_interactions AS (
      UPDATE ui_interactions
      SET
        state = 'stale',
        consumed_at = COALESCE(consumed_at, ${input.now}::timestamptz),
        result_redacted_json = jsonb_build_object('reason', ${input.reason}::text)
      WHERE action_grant_id IN (SELECT action_grant_id FROM stale_interrupts)
        AND state = 'token_issued'
      RETURNING id
    )
    SELECT id FROM stale_interrupts ORDER BY id
  `;
  return { staleInterruptIds: rows.map((row) => row.id) };
}
