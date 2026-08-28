import { describe, expect, it } from "vitest";
import type { TaskCreateCommand, TaskUpdateCommand } from "@forgeroom/contracts";
import {
  authorizeCoworkerTaskCreate,
  authorizeCoworkerTaskUpdate,
  materializeTaskGrantFromOperations,
  type TaskGrantRow,
} from "./grants";

function grantRow(overrides: Partial<TaskGrantRow> = {}): TaskGrantRow {
  const material = materializeTaskGrantFromOperations(["create", "update_status", "update_fields"]);
  return {
    taskId: null,
    channelId: "ch_1",
    subjectType: "coworker",
    subjectId: "cw_1",
    allowedOperationsJson: material.allowedOperations,
    allowedFieldsJson: material.allowedFields,
    allowedTransitionsJson: material.allowedTransitions,
    revokedAt: null,
    ...overrides,
  };
}

const createCommand: TaskCreateCommand = {
  schemaVersion: 1,
  title: "Inspect issue",
  description: "Read-only pass",
  status: "todo",
  assignee_type: "coworker",
  assignee_id: "cw_1",
  source_message_id: null,
  source_run_id: "run_1",
  due_at: null,
  idempotency_key: "cmd_create",
};

describe("task grant materialization", () => {
  it("maps create/update operations to fields and transitions", () => {
    const material = materializeTaskGrantFromOperations(["create", "update_status"]);
    expect(material.allowedOperations).toEqual(["create", "update_status"]);
    expect(material.allowedFields).toContain("title");
    expect(material.allowedFields).toContain("status");
    expect(material.allowedFields).toContain("due_at");
    expect(material.allowedTransitions).toContainEqual({ from: "todo", to: "in_progress" });
  });
});

describe("coworker task grant authorization", () => {
  it("allows create when the channel grant includes create", () => {
    expect(
      authorizeCoworkerTaskCreate([grantRow()], {
        coworkerId: "cw_1",
        channelId: "ch_1",
        command: createCommand,
      }),
    ).toEqual({ ok: true });
  });

  it("denies create without a channel grant", () => {
    const denied = authorizeCoworkerTaskCreate([], {
      coworkerId: "cw_1",
      channelId: "ch_1",
      command: createCommand,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe("missing_grant");
    }
  });

  it("does not use a task-scoped grant to authorize creating another task", () => {
    const denied = authorizeCoworkerTaskCreate([grantRow({ taskId: "task_existing" })], {
      coworkerId: "cw_1",
      channelId: "ch_1",
      command: createCommand,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe("missing_grant");
    }
  });

  it("denies status updates when update_status is not granted", () => {
    const denied = authorizeCoworkerTaskUpdate(
      [
        grantRow({
          allowedOperationsJson: ["create"],
          allowedFieldsJson: ["title"],
          allowedTransitionsJson: [],
        }),
      ],
      {
        coworkerId: "cw_1",
        channelId: "ch_1",
        taskId: "task_1",
        currentStatus: "todo",
        command: {
          schemaVersion: 1,
          expected_revision: 1,
          status: "in_progress",
          idempotency_key: "cmd_update",
        } satisfies TaskUpdateCommand,
      },
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe("operation_not_granted");
    }
  });

  it("denies field updates that are not granted", () => {
    const denied = authorizeCoworkerTaskUpdate(
      [
        grantRow({
          allowedOperationsJson: ["update_status"],
          allowedFieldsJson: ["status"],
          allowedTransitionsJson: [{ from: "todo", to: "in_progress" }],
        }),
      ],
      {
        coworkerId: "cw_1",
        channelId: "ch_1",
        taskId: "task_1",
        currentStatus: "todo",
        command: {
          schemaVersion: 1,
          expected_revision: 1,
          title: "Renamed",
          idempotency_key: "cmd_rename",
        } satisfies TaskUpdateCommand,
      },
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe("operation_not_granted");
    }
  });
});
