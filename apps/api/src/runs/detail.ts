import type { RunDetailResponse, SessionResponse } from "@forgeroom/contracts";
import { loadRunDetail, type createSql } from "@forgeroom/db";
import type { WorkspaceServiceResult } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

export async function getRunForSession(
  sql: SqlClient,
  session: SessionResponse,
  runId: string,
): Promise<WorkspaceServiceResult<RunDetailResponse>> {
  const detail = await loadRunDetail(sql, runId);
  if (!detail || detail.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Run not found." } };
  }
  return {
    ok: true,
    value: {
      run: detail.run,
      source_message_body: detail.sourceMessageBody,
    },
  };
}
