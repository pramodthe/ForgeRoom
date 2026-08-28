import type { ToolPolicyDefinition } from "@forgeroom/composio/tool-policies";
import { TASK_RECORD_TOOL_DESCRIPTOR_HASH, TASK_RECORD_UPSERT_TOOL_NAME } from "./constants";
import type { TaskRecordUpsertToolArgs } from "./schema";

function summarizeTarget(args: TaskRecordUpsertToolArgs) {
  if (args.task_id) {
    return {
      kind: "task_record" as const,
      taskId: args.task_id,
      channelId: args.channel_id,
      display: `Task ${args.task_id} in channel ${args.channel_id}`,
    };
  }
  return {
    kind: "task_record" as const,
    taskId: null,
    channelId: args.channel_id,
    display: `New task in channel ${args.channel_id}`,
  };
}

function redactTaskArgs(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object") {
    return {};
  }
  const input = args as Record<string, unknown>;
  const allowed = [
    "channel_id",
    "task_id",
    "expected_revision",
    "idempotency_key",
    "title",
    "description",
    "status",
    "assignee_type",
    "assignee_id",
    "source_message_id",
    "source_run_id",
    "due_at",
  ] as const;
  const redacted: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      redacted[key] = input[key];
    }
  }
  return redacted;
}

export const taskRecordUpsertPolicy: ToolPolicyDefinition = {
  toolName: TASK_RECORD_UPSERT_TOOL_NAME,
  observedDescriptorHash: TASK_RECORD_TOOL_DESCRIPTOR_HASH,
  riskClass: "write",
  idempotency: "verified",
  extractTarget(args) {
    const parsed = args as TaskRecordUpsertToolArgs;
    const target = summarizeTarget(parsed);
    return {
      kind: "github_issue",
      owner: "forgeroom",
      repo: target.channelId,
      issueNumber: target.taskId ? 1 : 0,
      display: target.display,
    };
  },
  redactArguments: redactTaskArgs,
  renderPreview(args) {
    const parsed = args as TaskRecordUpsertToolArgs;
    const target = summarizeTarget(parsed);
    const redactedArguments = redactTaskArgs(parsed);
    return {
      toolName: TASK_RECORD_UPSERT_TOOL_NAME,
      riskClass: "write",
      target: {
        kind: "github_issue",
        owner: "forgeroom",
        repo: target.channelId,
        issueNumber: target.taskId ? 1 : 0,
        display: target.display,
      },
      redactedArguments,
      expectedEffect: parsed.task_id
        ? `Update TaskRecord ${parsed.task_id} revision ${parsed.expected_revision ?? "?"}`
        : `Create TaskRecord "${parsed.title ?? ""}" in channel ${parsed.channel_id}`,
      dataLeavingWorkspace:
        "TaskRecord mutations stay in the application database; no external provider call is made.",
    };
  },
};
