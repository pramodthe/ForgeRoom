import { describe, expect, it } from "vitest";
import {
  assertNoSandboxSecrets,
  projectSandboxActivitySnapshots,
  projectSandboxRunEvents,
} from "./sandbox";

describe("P0-311 orchestration sandbox projection", () => {
  const lifecycle = [
    {
      applicationType: "sandbox.created" as const,
      sandboxId: "sb_abc123",
      commandState: "creating" as const,
      trueforgeEventId: "e1",
      payloadRedacted: {
        type: "sandbox.created",
        sandbox_id: "sb_abc123",
        command_state: "creating",
      },
    },
    {
      applicationType: "sandbox.command_started" as const,
      sandboxId: "sb_abc123",
      commandState: "running" as const,
      trueforgeEventId: "e2",
      toolCallId: "tc1",
      toolName: "run_sandbox_command",
      payloadRedacted: {
        type: "sandbox.command_started",
        sandbox_id: "sb_abc123",
        command_state: "running",
        tool_call_id: "tc1",
        tool_name: "run_sandbox_command",
      },
    },
    {
      applicationType: "sandbox.command_completed" as const,
      sandboxId: "sb_abc123",
      commandState: "completed" as const,
      trueforgeEventId: "e3",
      toolCallId: "tc1",
      toolName: "run_sandbox_command",
      payloadRedacted: {
        type: "sandbox.command_completed",
        sandbox_id: "sb_abc123",
        command_state: "completed",
        tool_call_id: "tc1",
        tool_name: "run_sandbox_command",
        result_summary: "sandbox command completed",
      },
    },
  ];

  it("projects normalized run events and AG-UI sandbox activities", () => {
    const runEvents = projectSandboxRunEvents(lifecycle);
    expect(runEvents.map((event) => event.normalizedType)).toEqual([
      "sandbox.created",
      "sandbox.command_started",
      "sandbox.command_completed",
    ]);
    const activities = projectSandboxActivitySnapshots(lifecycle);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      activityType: "forgeroom.sandbox.v1",
      sandboxId: "sb_abc123",
      commandState: "completed",
    });
    for (const event of runEvents) {
      expect(() => assertNoSandboxSecrets(event.payloadRedacted)).not.toThrow();
    }
  });

  it("rejects payloads that resemble credentials", () => {
    expect(() =>
      assertNoSandboxSecrets({
        type: "sandbox.created",
        sandbox_id: "sb_1",
        note: "leaked api_key=bad",
      }),
    ).toThrow(/forbidden fragment/);
  });
});
