import type { WorkspaceService } from "../workspace/service";
import { TASK_RECORD_UPSERT_TOOL_NAME } from "./constants";
import { taskRecordUpsertPolicy } from "./policy";
import {
  TASK_RECORD_UPSERT_TOOL_DESCRIPTOR,
  taskRecordUpsertToolArgsSchema,
  type TaskRecordUpsertToolArgs,
} from "./schema";

export {
  TASK_RECORD_UPSERT_TOOL_DESCRIPTOR,
  TASK_RECORD_UPSERT_TOOL_NAME,
  taskRecordUpsertPolicy,
  taskRecordUpsertToolArgsSchema,
};
export type { TaskRecordUpsertToolArgs };

export async function executeTaskRecordUpsertTool(
  workspace: WorkspaceService,
  coworkerId: string,
  rawArgs: unknown,
) {
  const parsed = taskRecordUpsertToolArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        code: "validation_failed" as const,
        message: "Invalid TaskRecord tool arguments.",
        details: { issues: parsed.error.issues },
      },
    };
  }
  return workspace.executeTaskRecordTool(coworkerId, parsed.data);
}
