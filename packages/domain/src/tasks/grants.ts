import type {
  TaskCreateCommand,
  TaskRecordOperation,
  TaskStatus,
  TaskUpdateCommand,
} from "@forgeroom/contracts";
import { canTransitionTask, TASK_TRANSITIONS } from "../transitions";

export const TASK_CREATE_FIELDS = [
  "title",
  "description",
  "status",
  "assignee_type",
  "assignee_id",
  "source_message_id",
  "source_run_id",
  "due_at",
] as const;

export const TASK_UPDATE_FIELD_NAMES = [
  "title",
  "description",
  "due_at",
  "assignee_type",
  "assignee_id",
] as const;

export type TaskGrantMaterial = {
  allowedOperations: TaskRecordOperation[];
  allowedFields: string[];
  allowedTransitions: Array<{ from: TaskStatus; to: TaskStatus }>;
};

export type TaskGrantRow = {
  taskId: string | null;
  channelId: string;
  subjectType: "coworker";
  subjectId: string;
  allowedOperationsJson: string[];
  allowedFieldsJson: string[];
  allowedTransitionsJson: Array<{ from: TaskStatus; to: TaskStatus }>;
  revokedAt: string | null;
};

export type TaskGrantDenial =
  | { code: "missing_grant"; message: string }
  | { code: "operation_not_granted"; message: string; operation: TaskRecordOperation }
  | { code: "field_not_granted"; message: string; field: string }
  | { code: "transition_not_granted"; message: string; from: TaskStatus; to: TaskStatus };

export function allTaskTransitionPairs(): Array<{ from: TaskStatus; to: TaskStatus }> {
  return Object.entries(TASK_TRANSITIONS).flatMap(([from, targets]) =>
    targets.map((to) => ({ from: from as TaskStatus, to })),
  );
}

export function materializeTaskGrantFromOperations(
  operations: readonly TaskRecordOperation[],
): TaskGrantMaterial {
  const allowedOperations = [...new Set(operations)];
  const allowedFields = new Set<string>();
  const allowedTransitions: Array<{ from: TaskStatus; to: TaskStatus }> = [];

  if (allowedOperations.includes("create")) {
    for (const field of TASK_CREATE_FIELDS) {
      allowedFields.add(field);
    }
  }
  if (allowedOperations.includes("update_fields")) {
    for (const field of TASK_UPDATE_FIELD_NAMES) {
      allowedFields.add(field);
    }
  }
  if (allowedOperations.includes("update_status")) {
    allowedFields.add("status");
    allowedTransitions.push(...allTaskTransitionPairs());
  }

  return {
    allowedOperations,
    allowedFields: [...allowedFields].sort((a, b) => a.localeCompare(b)),
    allowedTransitions,
  };
}

function activeGrantsForChannel(
  grants: readonly TaskGrantRow[],
  input: { coworkerId: string; channelId: string; taskId?: string },
): TaskGrantRow[] {
  return grants.filter((grant) => {
    if (grant.revokedAt !== null) return false;
    if (grant.subjectType !== "coworker" || grant.subjectId !== input.coworkerId) return false;
    if (grant.channelId !== input.channelId) return false;
    if (input.taskId === undefined) return grant.taskId === null;
    if (grant.taskId !== null && grant.taskId !== input.taskId) return false;
    return true;
  });
}

function hasOperation(grants: readonly TaskGrantRow[], operation: TaskRecordOperation): boolean {
  return grants.some((grant) => grant.allowedOperationsJson.includes(operation));
}

function hasField(grants: readonly TaskGrantRow[], field: string): boolean {
  return grants.some((grant) => grant.allowedFieldsJson.includes(field));
}

function hasTransition(grants: readonly TaskGrantRow[], from: TaskStatus, to: TaskStatus): boolean {
  return grants.some((grant) =>
    grant.allowedTransitionsJson.some(
      (transition) => transition.from === from && transition.to === to,
    ),
  );
}

export function authorizeCoworkerTaskCreate(
  grants: readonly TaskGrantRow[],
  input: { coworkerId: string; channelId: string; command: TaskCreateCommand },
): { ok: true } | { ok: false; error: TaskGrantDenial } {
  const active = activeGrantsForChannel(grants, {
    coworkerId: input.coworkerId,
    channelId: input.channelId,
  });
  if (active.length === 0) {
    return {
      ok: false,
      error: {
        code: "missing_grant",
        message: "Coworker has no TaskRecord grant for this channel.",
      },
    };
  }
  if (!hasOperation(active, "create")) {
    return {
      ok: false,
      error: {
        code: "operation_not_granted",
        message: "Coworker is not granted TaskRecord create for this channel.",
        operation: "create",
      },
    };
  }

  const fields: Array<keyof TaskCreateCommand> = [
    "title",
    "description",
    "status",
    "assignee_type",
    "assignee_id",
    "source_message_id",
    "source_run_id",
    "due_at",
  ];
  for (const field of fields) {
    if (!hasField(active, field)) {
      return {
        ok: false,
        error: {
          code: "field_not_granted",
          message: `Coworker is not granted TaskRecord field ${field}.`,
          field,
        },
      };
    }
  }

  return { ok: true };
}

export function changedTaskUpdateFields(command: TaskUpdateCommand): string[] {
  return (Object.keys(command) as Array<keyof TaskUpdateCommand>).filter(
    (key) =>
      key !== "schemaVersion" &&
      key !== "expected_revision" &&
      key !== "idempotency_key" &&
      Object.prototype.hasOwnProperty.call(command, key),
  );
}

export function authorizeCoworkerTaskUpdate(
  grants: readonly TaskGrantRow[],
  input: {
    coworkerId: string;
    channelId: string;
    taskId: string;
    currentStatus: TaskStatus;
    command: TaskUpdateCommand;
  },
): { ok: true } | { ok: false; error: TaskGrantDenial } {
  const active = activeGrantsForChannel(grants, {
    coworkerId: input.coworkerId,
    channelId: input.channelId,
    taskId: input.taskId,
  });
  if (active.length === 0) {
    return {
      ok: false,
      error: {
        code: "missing_grant",
        message: "Coworker has no TaskRecord grant for this channel.",
      },
    };
  }

  const changed = changedTaskUpdateFields(input.command);
  const statusChange = input.command.status;
  const fieldChanges = changed.filter((field) => field !== "status");

  if (statusChange !== undefined) {
    if (!hasOperation(active, "update_status")) {
      return {
        ok: false,
        error: {
          code: "operation_not_granted",
          message: "Coworker is not granted TaskRecord status updates for this channel.",
          operation: "update_status",
        },
      };
    }
    if (!hasField(active, "status")) {
      return {
        ok: false,
        error: {
          code: "field_not_granted",
          message: "Coworker is not granted TaskRecord field status.",
          field: "status",
        },
      };
    }
    if (!canTransitionTask(input.currentStatus, statusChange)) {
      return {
        ok: false,
        error: {
          code: "transition_not_granted",
          message: `Task cannot transition from ${input.currentStatus} to ${statusChange}.`,
          from: input.currentStatus,
          to: statusChange,
        },
      };
    }
    if (!hasTransition(active, input.currentStatus, statusChange)) {
      return {
        ok: false,
        error: {
          code: "transition_not_granted",
          message: `Coworker is not granted transition ${input.currentStatus} -> ${statusChange}.`,
          from: input.currentStatus,
          to: statusChange,
        },
      };
    }
  }

  if (fieldChanges.length > 0) {
    if (!hasOperation(active, "update_fields")) {
      return {
        ok: false,
        error: {
          code: "operation_not_granted",
          message: "Coworker is not granted TaskRecord field updates for this channel.",
          operation: "update_fields",
        },
      };
    }
    for (const field of fieldChanges) {
      if (!hasField(active, field)) {
        return {
          ok: false,
          error: {
            code: "field_not_granted",
            message: `Coworker is not granted TaskRecord field ${field}.`,
            field,
          },
        };
      }
    }
  }

  return { ok: true };
}
