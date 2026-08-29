import { describe, expect, it } from "vitest";
import {
  formatRunActivityCounters,
  presentCustomEvent,
  presentForgeRoomActivity,
  presentUnsupportedCapability,
} from "./activity-presentation";

describe("activity presentation", () => {
  it("renders task record activity summaries without raw payloads", () => {
    expect(
      presentForgeRoomActivity({
        schemaVersion: 1,
        activityRevision: 2,
        activityType: "forgeroom.task_record.v1",
        taskId: "task_1",
        revision: 2,
        status: "in_progress",
        title: "Reduce billing escalations",
      }),
    ).toMatchObject({
      eyebrow: "Task",
      title: "Reduce billing escalations",
      detail: "Revision 2",
      status: "In progress",
    });
  });

  it("maps pause group lifecycle events to readable cards", () => {
    expect(presentCustomEvent("pause_group.ready")).toMatchObject({
      title: "Pause group ready",
      status: "Ready",
      tone: "success",
    });
    expect(presentCustomEvent("pause_group.resume_started")).toMatchObject({
      title: "Resume started",
      status: "Resuming",
      tone: "violet",
    });
    expect(presentCustomEvent("tool.succeeded")).toMatchObject({
      title: "Tool completed",
      tone: "success",
    });
  });

  it("maps custom task and tool events to readable cards", () => {
    expect(presentCustomEvent("task.created")).toMatchObject({
      title: "Task created",
      tone: "info",
    });
    expect(presentCustomEvent("tool.failed")).toMatchObject({
      title: "Tool failed",
      tone: "danger",
    });
  });

  it("shows run lifecycle and simultaneous activity counters", () => {
    const presentation = presentCustomEvent("run.state_changed", {
      lifecycle: "active",
      activity: {
        planning: 0,
        running: 2,
        awaiting_input: 0,
        awaiting_approval: 1,
        blocked_connection: 0,
        cancelling: 0,
        queued: 0,
      },
    });
    expect(presentation.title).toBe("Run active");
    expect(presentation.detail).toBe("2 running · 1 awaiting approval");
    expect(
      formatRunActivityCounters({
        planning: 0,
        running: 1,
        awaiting_input: 0,
        awaiting_approval: 0,
        blocked_connection: 0,
        cancelling: 0,
        queued: 0,
      }),
    ).toBe("1 running");
  });

  it("marks unsupported capabilities as inert", () => {
    expect(presentUnsupportedCapability("Open generated UI")).toMatchObject({
      inert: true,
      status: "Inert",
    });
    expect(presentCustomEvent("subagent.started" as never)).toMatchObject({
      inert: true,
    });
  });
});
