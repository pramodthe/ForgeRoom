import {
  taskCreateCommandSchema,
  taskStatusSchema,
  taskUpdateCommandSchema,
  type TaskStatus,
} from "@forgeroom/contracts";

export const TASK_RECORD_UPSERT_TOOL_DESCRIPTOR = {
  schemaVersion: 1 as const,
  name: "records.task.upsert.v1" as const,
  description:
    "Create or update an application-owned TaskRecord in an authorized channel. Never deletes tasks.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["channel_id", "idempotency_key"],
    properties: {
      channel_id: { type: "string" },
      task_id: { type: "string" },
      expected_revision: { type: "integer", minimum: 1 },
      idempotency_key: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      description: { type: ["string", "null"] },
      status: {
        type: "string",
        enum: ["todo", "in_progress", "blocked", "in_review", "done", "cancelled"],
      },
      assignee_type: { type: ["string", "null"], enum: ["human", "coworker", null] },
      assignee_id: { type: ["string", "null"] },
      source_message_id: { type: ["string", "null"] },
      source_run_id: { type: ["string", "null"] },
      due_at: { type: ["string", "null"], format: "date-time" },
    },
  },
};

export type TaskRecordUpsertToolArgs = {
  channel_id: string;
  task_id?: string;
  expected_revision?: number;
  idempotency_key: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assignee_type?: "human" | "coworker" | null;
  assignee_id?: string | null;
  source_message_id?: string | null;
  source_run_id?: string | null;
  due_at?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const TASK_TOOL_KEYS = new Set([
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
]);

function parseFailure(message: string) {
  return { success: false as const, error: { issues: [{ message }] } };
}

function optionalNullableString(
  raw: Record<string, unknown>,
  key: string,
): { present: false } | { present: true; value: string | null } | { error: string } {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return { present: false };
  const value = raw[key];
  if (value === null) return { present: true, value: null };
  const parsed = readString(value);
  return parsed
    ? { present: true, value: parsed }
    : { error: `${key} must be a non-empty string or null` };
}

export const taskRecordUpsertToolArgsSchema = {
  safeParse(raw: unknown) {
    if (!isRecord(raw)) {
      return { success: false as const, error: { issues: [{ message: "expected object" }] } };
    }
    const unknownKey = Object.keys(raw).find((key) => !TASK_TOOL_KEYS.has(key));
    if (unknownKey) return parseFailure(`unknown field: ${unknownKey}`);
    const channelId = readString(raw.channel_id);
    const idempotencyKey = readString(raw.idempotency_key);
    if (!channelId || !idempotencyKey) {
      return {
        success: false as const,
        error: { issues: [{ message: "channel_id and idempotency_key are required" }] },
      };
    }

    const taskIdPresent = Object.prototype.hasOwnProperty.call(raw, "task_id");
    const taskId = readString(raw.task_id);
    if (taskIdPresent && !taskId) return parseFailure("task_id must be a non-empty string");
    const expectedRevisionPresent = Object.prototype.hasOwnProperty.call(raw, "expected_revision");
    const expectedRevision =
      typeof raw.expected_revision === "number" &&
      Number.isInteger(raw.expected_revision) &&
      raw.expected_revision >= 1
        ? raw.expected_revision
        : undefined;
    if (expectedRevisionPresent && expectedRevision === undefined) {
      return parseFailure("expected_revision must be a positive integer");
    }
    const titlePresent = Object.prototype.hasOwnProperty.call(raw, "title");
    const title = readString(raw.title);
    if (titlePresent && !title) return parseFailure("title must be a non-empty string");
    const description = optionalNullableString(raw, "description");
    if ("error" in description) return parseFailure(description.error);
    const assigneeId = optionalNullableString(raw, "assignee_id");
    if ("error" in assigneeId) return parseFailure(assigneeId.error);
    const sourceMessageId = optionalNullableString(raw, "source_message_id");
    if ("error" in sourceMessageId) return parseFailure(sourceMessageId.error);
    const sourceRunId = optionalNullableString(raw, "source_run_id");
    if ("error" in sourceRunId) return parseFailure(sourceRunId.error);
    const dueAt = optionalNullableString(raw, "due_at");
    if ("error" in dueAt) return parseFailure(dueAt.error);
    const statusPresent = Object.prototype.hasOwnProperty.call(raw, "status");
    const parsedStatus = taskStatusSchema.safeParse(raw.status);
    if (statusPresent && !parsedStatus.success) return parseFailure("status is invalid");
    const assigneeTypePresent = Object.prototype.hasOwnProperty.call(raw, "assignee_type");
    if (
      assigneeTypePresent &&
      raw.assignee_type !== null &&
      raw.assignee_type !== "human" &&
      raw.assignee_type !== "coworker"
    ) {
      return parseFailure("assignee_type must be human, coworker, or null");
    }

    const value: TaskRecordUpsertToolArgs = {
      channel_id: channelId,
      idempotency_key: idempotencyKey,
      ...(taskId ? { task_id: taskId } : {}),
      ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
      ...(title ? { title } : {}),
      ...(description.present ? { description: description.value } : {}),
      ...(parsedStatus.success ? { status: parsedStatus.data } : {}),
      ...(assigneeTypePresent
        ? { assignee_type: raw.assignee_type as "human" | "coworker" | null }
        : {}),
      ...(assigneeId.present ? { assignee_id: assigneeId.value } : {}),
      ...(sourceMessageId.present ? { source_message_id: sourceMessageId.value } : {}),
      ...(sourceRunId.present ? { source_run_id: sourceRunId.value } : {}),
      ...(dueAt.present ? { due_at: dueAt.value } : {}),
    };

    if (!taskId) {
      const create = taskCreateCommandSchema.safeParse({
        schemaVersion: 1,
        title: value.title,
        description: value.description ?? null,
        status: value.status ?? "todo",
        assignee_type: value.assignee_type ?? null,
        assignee_id: value.assignee_id ?? null,
        source_message_id: value.source_message_id ?? null,
        source_run_id: value.source_run_id ?? null,
        due_at: value.due_at ?? null,
        idempotency_key: value.idempotency_key,
      });
      if (!create.success) {
        return create;
      }
      if (expectedRevision !== undefined) {
        return {
          success: false as const,
          error: { issues: [{ message: "create must not include expected_revision" }] },
        };
      }
      return { success: true as const, data: value };
    }

    if (sourceMessageId.present || sourceRunId.present) {
      return parseFailure("updates must not include source_message_id or source_run_id");
    }

    const updateFields: Record<string, unknown> = {
      schemaVersion: 1,
      expected_revision: expectedRevision,
      idempotency_key: value.idempotency_key,
    };
    if (value.title !== undefined) updateFields.title = value.title;
    if (value.description !== undefined) updateFields.description = value.description;
    if (value.status !== undefined) updateFields.status = value.status;
    if (value.assignee_type !== undefined) updateFields.assignee_type = value.assignee_type;
    if (value.assignee_id !== undefined) updateFields.assignee_id = value.assignee_id;
    if (value.due_at !== undefined) updateFields.due_at = value.due_at;

    const update = taskUpdateCommandSchema.safeParse(updateFields);
    if (!update.success) {
      return update;
    }
    return { success: true as const, data: value };
  },
  parse(raw: unknown) {
    const parsed = taskRecordUpsertToolArgsSchema.safeParse(raw);
    if (!parsed.success) {
      throw parsed.error;
    }
    return parsed.data;
  },
};

export const taskRecordUpsertToolDescriptorSchema = {
  parse(value: unknown) {
    if (!isRecord(value) || value.name !== "records.task.upsert.v1") {
      throw new Error("invalid task tool descriptor");
    }
    return value;
  },
};
