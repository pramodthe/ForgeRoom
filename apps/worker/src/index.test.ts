import { describe, expect, it } from "vitest";
import { startWorkerProcess } from "./index";

describe("standalone worker process", () => {
  it("does not embed inside the API", () => {
    const handle = startWorkerProcess();
    expect(handle.kind).toBe("worker");
    expect(handle.embedded).toBe(false);
  });

  it("validates every production dispatch through the shared contract package", async () => {
    const executed: string[] = [];
    const handle = startWorkerProcess((command) => {
      executed.push(command.command_id);
    });
    expect(
      (
        await handle.dispatchCommand({
          schemaVersion: 1,
          command_id: "cmd_1",
          name: "claim_queue_item",
          payload: {
            queue_item_id: "queue_1",
            expected_state: "queued",
            expected_attempt: 0,
            worker_id: "worker_1",
            lease_expires_at: "2026-08-26T00:00:00.000Z",
          },
        })
      ).name,
    ).toBe("claim_queue_item");
    expect(executed).toEqual(["cmd_1"]);

    await expect(
      handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "cmd_2",
        name: "claim_pause_group_resume",
        payload: {},
      }),
    ).rejects.toThrow();

    await expect(
      handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "cmd_3",
        name: "ingest_trueforge_event",
        payload: {
          run_id: "run_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          expected_turn_state: "streaming",
          session_generation_id: "generation_1",
          expected_session_generation: 1,
          upstream_event_id: "event_1",
          upstream_event_type: "tool.result",
          event_payload: { refresh_token: "must-not-cross-worker-boundary" },
        },
      }),
    ).rejects.toThrow();
    expect(executed).toEqual(["cmd_1"]);
  });
});
