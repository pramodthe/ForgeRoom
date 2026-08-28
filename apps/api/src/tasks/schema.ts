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

export const taskRecordUpsertToolArgsSchema = {
  safeParse(raw: unknown) {
    if (!isRecord(raw)) {
      return { success: false as const, error: { issues: [{ message: "expected object" }] } };
    }
    const channelId = readString(raw.channel_id);
    const idempotencyKey = readString(raw.idempotency_key);
    if (!channelId || !idempotencyKey) {
      return {
        success: false as const,
        error: { issues: [{ message: "channel_id and idempotency_key are required" }] },
      };
    }

    const taskId = readString(raw.task_id);
    const expectedRevision =
      typeof raw.expected_revision === "number" && Number.isInteger(raw.expected_revision)
        ? raw.expected_revision
        : undefined;

    const value: TaskRecordUpsertToolArgs = {
      channel_id: channelId,
      idempotency_key: idempotencyKey,
      ...(taskId ? { task_id: taskId } : {}),
      ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
      ...(readString(raw.title) ? { title: readString(raw.title) } : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, "description")
        ? { description: raw.description === null ? null : (readString(raw.description) ?? null) }
        : {}),
      ...(taskStatusSchema.safeParse(raw.status).success
        ? { status: taskStatusSchema.parse(raw.status) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, "assignee_type")
        ? {
            assignee_type:
              raw.assignee_type === null
                ? null
                : raw.assignee_type === "human" || raw.assignee_type === "coworker"
                  ? raw.assignee_type
                  : undefined,
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, "assignee_id")
        ? {
            assignee_id: raw.assignee_id === null ? null : (readString(raw.assignee_id) ?? null),
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, "source_message_id")
        ? {
            source_message_id:
              raw.source_message_id === null ? null : (readString(raw.source_message_id) ?? null),
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, "source_run_id")
        ? {
            source_run_id:
              raw.source_run_id === null ? null : (readString(raw.source_run_id) ?? null),
          }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(raw, "due_at")
        ? { due_at: raw.due_at === null ? null : (readString(raw.due_at) ?? null) }
        : {}),
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
