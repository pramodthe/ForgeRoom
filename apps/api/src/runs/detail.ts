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
      events: detail.events.map((event) => ({
        schemaVersion: 1 as const,
        id: event.id,
        normalized_type: event.normalizedType,
        title: event.title,
        detail: event.detail,
        occurred_at: event.occurredAt,
        waiting: event.waiting,
      })),
      tasks: detail.tasks.map((task) => ({
        schemaVersion: 1 as const,
        id: task.id,
        title: task.title,
        status: task.status as RunDetailResponse["tasks"][number]["status"],
        current_revision: task.currentRevision,
      })),
      artifacts: detail.artifacts.map((artifact) => ({
        schemaVersion: 1 as const,
        id: artifact.id,
        name: artifact.name,
        mime_type: artifact.mimeType,
        revision: artifact.revision,
        byte_size: artifact.byteSize,
      })),
      decisions: detail.decisions.map((decision) => ({
        schemaVersion: 1 as const,
        kind: decision.kind,
        id: decision.id,
        state: decision.state,
        label: decision.label,
        waiting: decision.waiting,
      })),
    },
  };
}
