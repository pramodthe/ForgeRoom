import { describe, expect, it } from "vitest";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { WorkspaceService } from "../workspace/service";
import { bindDurableTrueForgeTurn } from "./bind-durable-turn";
import { createAgUiRunService, type AgUiRunBootstrap } from "./run-service";

function bootstrap(): AgUiRunBootstrap {
  return {
    threadId: "thread_1",
    aguiRunId: "agui_run_1",
    applicationRunId: "run_1",
    runStepId: "step_1",
    agentTurnId: "turn_1",
    messageId: "msg_1",
    channelId: "ch_1",
    coworkerId: "cw_1",
    trueforgeSessionId: "tf_sess_1",
    trueforgeTurnId: "tf_turn_1",
  };
}

function parseChunks(chunks: string[]): Array<Record<string, unknown>> {
  return chunks.map((chunk) => JSON.parse(chunk.slice("data: ".length).trim()));
}

describe("durable AG-UI streaming", () => {
  it("streams incrementally and settles the canonical durable lifecycle", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const chunks: string[] = [];
      let polls = 0;
      const trueforgeClient = {
        async listTurnEvents() {
          polls += 1;
          if (polls === 1) {
            return [
              {
                type: "model.message.delta",
                id: "evt_delta_1",
                sequence_number: 1,
                text: "Streaming now",
              },
            ];
          }
          expect(parseChunks(chunks).some((event) => event.type === "TEXT_MESSAGE_CONTENT")).toBe(
            true,
          );
          return [
            {
              type: "model.message.delta",
              id: "evt_delta_1",
              sequence_number: 1,
              text: "Streaming now",
            },
            {
              type: "turn.done",
              id: "evt_done_1",
              sequence_number: 2,
              state: { required_actions: [] },
            },
          ];
        },
      } as unknown as TrueForgeClient;
      const service = createAgUiRunService({
        workspace: {} as WorkspaceService,
        trueforgeClient,
        sql,
      });

      await service.streamPreparedRun(bootstrap(), async (chunk) => {
        chunks.push(chunk);
      });

      const events = parseChunks(chunks);
      expect(events[0]?.type).toBe("RUN_STARTED");
      expect(events.at(-1)?.type).toBe("RUN_FINISHED");
      expect(events.filter((event) => event.type === "RUN_FINISHED")).toHaveLength(1);
      const turns = await sql<{ state: string }[]>`
        SELECT state FROM agent_turns WHERE id = 'turn_1'
      `;
      const steps = await sql<{ state: string }[]>`
        SELECT state FROM run_steps WHERE id = 'step_1'
      `;
      const queue = await sql<{ state: string }[]>`
        SELECT state FROM turn_queue_items WHERE id = 'q_1'
      `;
      const runs = await sql<{ lifecycle: string }[]>`
        SELECT lifecycle FROM runs WHERE id = 'run_1'
      `;
      expect(turns[0]?.state).toBe("completed");
      expect(steps[0]?.state).toBe("completed");
      expect(queue[0]?.state).toBe("completed");
      expect(runs[0]?.lifecycle).toBe("completed");
    });
  }, 60_000);

  it("emits one redacted terminal error when provider polling fails", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const trueforgeClient = {
        async listTurnEvents() {
          throw new Error(
            "/api/v1/sessions/tf_private_session/turns/tf_private_turn/events failed",
          );
        },
      } as unknown as TrueForgeClient;
      const service = createAgUiRunService({
        workspace: {} as WorkspaceService,
        trueforgeClient,
        sql,
      });
      const chunks: string[] = [];

      await service.streamPreparedRun(bootstrap(), async (chunk) => {
        chunks.push(chunk);
      });

      const serialized = JSON.stringify(parseChunks(chunks));
      expect(parseChunks(chunks).map((event) => event.type)).toEqual(["RUN_STARTED", "RUN_ERROR"]);
      expect(serialized).not.toContain("tf_private");
      expect(serialized).toContain("AG-UI run failed while reading provider events.");
    });
  }, 60_000);

  it("stops browser disclosure after authorization is revoked while still settling state", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const trueforgeClient = {
        async listTurnEvents() {
          return [
            {
              type: "model.message.delta",
              id: "evt_delta_revoked",
              sequence_number: 1,
              text: "must not be disclosed",
            },
            {
              type: "turn.done",
              id: "evt_done_revoked",
              sequence_number: 2,
              state: { required_actions: [] },
            },
          ];
        },
      } as unknown as TrueForgeClient;
      const service = createAgUiRunService({
        workspace: {} as WorkspaceService,
        trueforgeClient,
        sql,
      });
      const chunks: string[] = [];
      let checks = 0;

      await service.streamPreparedRun(
        bootstrap(),
        async (chunk) => {
          chunks.push(chunk);
        },
        {
          isDeliveryAuthorized: async () => {
            checks += 1;
            return checks === 1;
          },
        },
      );

      expect(parseChunks(chunks).map((event) => event.type)).toEqual(["RUN_STARTED"]);
      expect(JSON.stringify(chunks)).not.toContain("must not be disclosed");
      const turns = await sql<{ state: string }[]>`
        SELECT state FROM agent_turns WHERE id = 'turn_1'
      `;
      expect(turns[0]?.state).toBe("completed");
    });
  }, 60_000);

  it("does not fail another worker's RunStep when waiting for its bind times out", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const result = await bindDurableTrueForgeTurn({
        sql,
        trueforgeClient: {
          async createTurn() {
            throw new Error("must not create");
          },
          async listTurns() {
            throw new Error("must not list");
          },
        },
        runStepId: "step_1",
        content: "Wait for the owner",
        clientAguiRunId: "agui_waiter",
        timeoutMs: 5,
        intervalMs: 1,
      });
      expect(result).toEqual({ ok: false, reason: "timeout" });
      const steps = await sql<{ state: string; completed_at: string | Date | null }[]>`
        SELECT state, completed_at FROM run_steps WHERE id = 'step_1'
      `;
      expect(steps[0]?.state).toBe("running");
      expect(steps[0]?.completed_at).toBeNull();
    });
  }, 60_000);
});
