import type { RunCancelCommand, RunCancelResult, SessionResponse } from "@forgeroom/contracts";
import type { createSql } from "@forgeroom/db";
import { loadRunDetail, markCancelCalled, requestRunStepStop } from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { WorkspaceServiceResult } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

const STOPPABLE_STEP_STATES = new Set([
  "queued",
  "acquiring_session",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "blocked_connection",
]);

export async function cancelRunForSession(
  deps: {
    sql: SqlClient;
    trueforgeClient?: TrueForgeClient;
  },
  session: SessionResponse,
  runId: string,
  command: RunCancelCommand,
): Promise<WorkspaceServiceResult<RunCancelResult>> {
  void session;
  const detail = await loadRunDetail(deps.sql, runId);
  if (!detail || detail.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Run not found." } };
  }
  if (detail.run.lifecycle !== command.expected_lifecycle) {
    return {
      ok: false,
      error: {
        code: "conflict",
        message: "Run lifecycle no longer matches the expected value.",
      },
    };
  }

  const cancelledStepIds: string[] = [];
  let cancelCalled = false;
  for (const step of detail.run.steps) {
    if (!STOPPABLE_STEP_STATES.has(step.state)) {
      continue;
    }
    const stop = await requestRunStepStop(deps.sql, { runStepId: step.id });
    if (!stop.ok) {
      continue;
    }
    cancelledStepIds.push(step.id);
    if (stop.decision.callCancel && stop.trueforgeSessionId && deps.trueforgeClient) {
      await deps.trueforgeClient.cancelSession(stop.trueforgeSessionId);
      cancelCalled = true;
      if (stop.agentTurnId) {
        await markCancelCalled(deps.sql, { agentTurnId: stop.agentTurnId });
      }
    }
  }

  if (cancelledStepIds.length === 0) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "No remaining work is stoppable on this run.",
      },
    };
  }

  const refreshed = await loadRunDetail(deps.sql, runId);
  return {
    ok: true,
    value: {
      run_id: runId,
      lifecycle: refreshed?.run.lifecycle ?? detail.run.lifecycle,
      cancelled_step_ids: cancelledStepIds,
      cancel_called: cancelCalled,
    },
  };
}
