import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@forgeroom/contracts";
import { persistPauseGroupCapture } from "@forgeroom/db";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
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
  it("rejects a same-workspace PauseGroup resumed through another channel and coworker", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const now = new Date().toISOString();
      await sql`
        INSERT INTO agent_profiles (
          id, workspace_id, handle, name, title, visibility, status,
          editable_config_json, config_revision, native_subagents_enabled, created_at, updated_at
        ) VALUES (
          'cw_2', 'ws_1', 'operator', 'Operator', 'Operator', 'workspace', 'active',
          '{}'::jsonb, 1, false, ${now}, ${now}
        )
      `;
      await sql`
        INSERT INTO agent_versions (
          id, agent_profile_id, version, config_json, spec_hash, created_by, created_at
        ) VALUES ('av_2', 'cw_2', 1, '{}'::jsonb, ${`sha256:${"55".repeat(32)}`}, 'user_1', ${now})
      `;
      await sql`UPDATE agent_profiles SET current_version_id = 'av_2' WHERE id = 'cw_2'`;
      await sql`
        INSERT INTO session_revisions (
          id, agent_profile_id, source_config_revision, effective_config_redacted_json,
          effective_spec_hash, approval_policy_hash, created_by, created_at
        ) VALUES (
          'sr_2', 'cw_2', 1, '{}'::jsonb, ${`sha256:${"55".repeat(32)}`},
          ${`sha256:${"66".repeat(32)}`}, 'user_1', ${now}
        )
      `;
      await sql`
        INSERT INTO channels (
          id, workspace_id, name, mission_brief, next_sequence, status,
          created_by, created_at, updated_at
        ) VALUES ('ch_2', 'ws_1', 'Other', 'Other route', 1, 'active', 'user_1', ${now}, ${now})
      `;
      await sql`
        INSERT INTO channel_participants (
          channel_id, participant_type, participant_id, role, joined_at
        ) VALUES ('ch_2', 'coworker', 'cw_2', 'member', ${now})
      `;
      await sql`
        INSERT INTO channel_agent_sessions (
          id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
          last_delivered_channel_sequence, state, created_at, updated_at
        ) VALUES ('cas_2', 'ws_1', 'ch_2', 'cw_2', 'thread_2', 0, 'active', ${now}, ${now})
      `;
      await sql`
        INSERT INTO channel_agent_session_generations (
          id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
          trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
        ) VALUES (
          'gen_2', 'cas_2', 1, 'av_2', 'sr_2', 'tf_sess_2',
          ${`sha256:${"55".repeat(32)}`}, ${`sha256:${"66".repeat(32)}`}, 'ready', ${now}
        )
      `;
      await sql`UPDATE channel_agent_sessions SET current_generation_id = 'gen_2' WHERE id = 'cas_2'`;

      await sql`
        UPDATE agent_turns SET trueforge_turn_id = 'tf_turn_pause_a' WHERE id = 'turn_1'
      `;
      const captured = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_1",
        trueforgeTurnId: "tf_turn_pause_a",
        generation: 1,
        actions: [
          {
            actionType: "question",
            providerActionId: "provider_interrupt_a",
            payloadRedacted: {
              type: "question",
              prompt: { prompt: "Continue?" },
              toolCallId: "tool_call_a",
              threadId: "thread_1",
            },
            payloadHash: `sha256:${"77".repeat(32)}`,
            promptRedacted: { prompt: "Continue?" },
            promptHash: `sha256:${"88".repeat(32)}`,
          },
        ],
        runStepState: "awaiting_input",
        connectorBindingId: "cb_1",
        actingIdentityJson: {},
        approvalPolicyHash: `sha256:${"66".repeat(32)}`,
        now,
      });
      expect(captured.ok).toBe(true);
      if (!captured.ok) throw new Error("PauseGroup capture failed");
      await sql`
        UPDATE required_actions
        SET state = 'resolved', response_redacted_json = '{"answer":"Continue"}'::jsonb,
            resolved_by = 'user_1', resolved_at = ${now}
        WHERE pause_group_id = ${captured.pauseGroupId}
      `;
      await sql`
        UPDATE pause_groups
        SET state = 'ready', resolved_action_count = required_action_count, ready_at = ${now}
        WHERE id = ${captured.pauseGroupId}
      `;

      let providerCreates = 0;
      let providerLists = 0;
      const trueforgeClient = {
        async createTurn() {
          providerCreates += 1;
          throw new Error("provider create must not be called");
        },
        async listTurns() {
          providerLists += 1;
          throw new Error("provider list must not be called");
        },
      } as unknown as TrueForgeClient;
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const service = createAgUiRunService({ workspace, trueforgeClient, sql });
      const session: SessionResponse = {
        request_id: "request_cross_route",
        user: {
          id: "user_1",
          email: "owner@example.test",
          display_name: "Owner",
          role: "owner",
        },
        workspace_id: "ws_1",
        csrf_token: "csrf_cross_route",
        expires_at: "2030-01-01T00:00:00.000Z",
      };
      const before = await sql<
        Array<{ events: number; queue_items: number; pause_resumes: number }>
      >`
        SELECT
          (SELECT count(*)::int FROM run_events) AS events,
          (SELECT count(*)::int FROM turn_queue_items) AS queue_items,
          (SELECT count(*)::int FROM pause_resumes) AS pause_resumes
      `;

      const prepared = await service.prepareRun(session, "ch_2", "cw_2", {
        threadId: "thread_2",
        runId: "agui_cross_route",
        messages: [],
        tools: [],
        context: [],
        state: {},
        resume: [{ interruptId: "provider_interrupt_a", status: "resolved" }],
      });

      expect(prepared).toMatchObject({
        ok: false,
        error: {
          code: "validation_failed",
          details: { reason: "pause_group_route_binding_mismatch" },
        },
      });
      expect({ providerCreates, providerLists }).toEqual({ providerCreates: 0, providerLists: 0 });
      const after = await sql<
        Array<{ events: number; queue_items: number; pause_resumes: number }>
      >`
        SELECT
          (SELECT count(*)::int FROM run_events) AS events,
          (SELECT count(*)::int FROM turn_queue_items) AS queue_items,
          (SELECT count(*)::int FROM pause_resumes) AS pause_resumes
      `;
      expect(after[0]).toEqual(before[0]);
      const groups = await sql<{ state: string; resume_claim_token: string | null }[]>`
        SELECT state, resume_claim_token FROM pause_groups WHERE id = ${captured.pauseGroupId}
      `;
      expect(groups[0]).toEqual({ state: "ready", resume_claim_token: null });
    });
  }, 60_000);

  it("binds a composer-created RunStep without duplicating the message or Run", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channel_participants (
          channel_id, participant_type, participant_id, role, joined_at
        )
        VALUES ('ch_1', 'coworker', 'cw_1', 'member', ${new Date().toISOString()})
      `;
      await sql`
        UPDATE agent_turns SET trueforge_turn_id = 'tf_turn_1' WHERE id = 'turn_1'
      `;
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const service = createAgUiRunService({
        workspace,
        trueforgeClient: {} as TrueForgeClient,
        sql,
      });
      const session: SessionResponse = {
        request_id: "request_1",
        user: {
          id: "user_1",
          email: "owner@example.test",
          display_name: "Owner",
          role: "owner",
        },
        workspace_id: "ws_1",
        csrf_token: "csrf_1",
        expires_at: "2030-01-01T00:00:00.000Z",
      };

      const prepared = await service.prepareRun(session, "ch_1", "cw_1", {
        threadId: "thread_1",
        runId: "agui_run_1",
        messages: [{ id: "msg_1", role: "user", content: "Please inspect" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {
          forgeroomV1: {
            schemaVersion: 1,
            sourceMessageId: "msg_1",
            applicationRunId: "run_1",
            runStepId: "step_1",
          },
        },
      });

      expect(prepared).toMatchObject({
        ok: true,
        value: { messageId: "msg_1", applicationRunId: "run_1", runStepId: "step_1" },
      });
      const counts = await sql<{ messages: number; runs: number }[]>`
        SELECT
          (SELECT count(*)::int FROM messages) AS messages,
          (SELECT count(*)::int FROM runs) AS runs
      `;
      expect(counts[0]).toEqual({ messages: 1, runs: 1 });
    });
  }, 60_000);

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
        workspace: createWorkspaceService({ store: createPostgresWorkspaceStore(sql) }),
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

      const channelEvents = await sql<
        {
          type: string;
          actor_type: string;
          actor_id: string;
          agui_event_type: string | null;
        }[]
      >`
        SELECT type, actor_type, actor_id, agui_event_type
        FROM channel_events
        WHERE channel_id = 'ch_1'
          AND sequence > 0
        ORDER BY sequence ASC
      `;
      expect(channelEvents.length).toBeGreaterThan(0);
      expect(
        channelEvents.every((row) => row.actor_type === "coworker" && row.actor_id === "cw_1"),
      ).toBe(true);
      expect(channelEvents.map((row) => row.agui_event_type)).toEqual(
        expect.arrayContaining(["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "RUN_FINISHED"]),
      );

      const aguiRecords = await sql<
        {
          event_type: string;
          agui_run_id: string | null;
          message_or_activity_id: string | null;
        }[]
      >`
        SELECT aer.event_type, aer.agui_run_id, aer.message_or_activity_id
        FROM agui_event_records aer
        JOIN channel_events ce ON ce.id = aer.channel_event_id
        WHERE ce.channel_id = 'ch_1'
          AND ce.sequence > 0
        ORDER BY ce.sequence ASC
      `;
      expect(aguiRecords.length).toBe(channelEvents.length);
      expect(aguiRecords.every((row) => row.agui_run_id === "agui_run_1")).toBe(true);
      expect(
        aguiRecords
          .filter((row) => row.event_type.startsWith("RUN_"))
          .every((row) => row.message_or_activity_id === "msg_1"),
      ).toBe(true);
      expect(
        aguiRecords
          .filter((row) => row.event_type.startsWith("TEXT_MESSAGE_"))
          .every(
            (row) => row.message_or_activity_id !== "msg_1" && row.message_or_activity_id !== null,
          ),
      ).toBe(true);
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
        workspace: createWorkspaceService({ store: createPostgresWorkspaceStore(sql) }),
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
        workspace: createWorkspaceService({ store: createPostgresWorkspaceStore(sql) }),
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

  it("refuses to overwrite a bound turn's agui_run_id with a different client run id", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        UPDATE agent_turns
        SET trueforge_turn_id = 'tf_turn_bound', agui_run_id = 'agui_original', state = 'streaming'
        WHERE id = 'turn_1'
      `;
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
        content: "Retry under a new run id",
        clientAguiRunId: "agui_different",
        timeoutMs: 50,
        intervalMs: 1,
      });
      expect(result).toEqual({ ok: false, reason: "agui_run_conflict" });
      const turns = await sql<{ agui_run_id: string }[]>`
        SELECT agui_run_id FROM agent_turns WHERE id = 'turn_1'
      `;
      expect(turns[0]?.agui_run_id).toBe("agui_original");
    });
  }, 60_000);
});
