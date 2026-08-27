import { describe, expect, it } from "vitest";
import {
  findArtifactByContentRevision,
  publishArtifactRecord,
  type PublishArtifactRecordInput,
} from "./artifact-storage";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

function baseInput(overrides?: Partial<PublishArtifactRecordInput>): PublishArtifactRecordInput {
  return {
    id: "artifact_1",
    workspaceId: "ws_1",
    channelId: "ch_1",
    runId: "run_1",
    runStepId: "step_1",
    creatorAgentId: "cw_1",
    kind: "file",
    name: "probe.md",
    mimeType: "text/markdown",
    storageKey: `ws/ws_1/ch/ch_1/sha/${"fe".repeat(32)}/r1`,
    byteSize: 12,
    sha256: HASH,
    revision: 1,
    metadataJson: { source: "test" },
    createdAt: NOW,
    ...overrides,
  };
}

describe("artifact storage records", () => {
  it("persists metadata with hash, mime, size, creator, run/step and revision", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const result = await publishArtifactRecord(sql, baseInput());
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.created).toBe(true);
      expect(result.artifact).toMatchObject({
        id: "artifact_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        runId: "run_1",
        runStepId: "step_1",
        creatorAgentId: "cw_1",
        kind: "file",
        mimeType: "text/markdown",
        byteSize: 12,
        sha256: HASH,
        revision: 1,
      });
    });
  });

  it("returns the existing row when identical content revision is published again", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const first = await publishArtifactRecord(sql, baseInput());
      const second = await publishArtifactRecord(
        sql,
        baseInput({ id: "artifact_duplicate", name: "ignored-on-idempotent-replay" }),
      );
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(second.created).toBe(false);
      expect(second.artifact.id).toBe(first.artifact.id);
      const loaded = await findArtifactByContentRevision(sql, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        sha256: HASH,
        revision: 1,
      });
      expect(loaded?.id).toBe("artifact_1");
    });
  });

  it("allows identical content revision in distinct channels", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channels (
          id, workspace_id, name, mission_brief, next_sequence, status, created_by, created_at, updated_at
        )
        VALUES ('ch_2', 'ws_1', 'Alt', 'Alt channel', 1, 'active', 'user_1', ${NOW}, ${NOW})
      `;
      await sql`
        INSERT INTO channel_events (
          id, channel_id, sequence, type, actor_type, actor_id, payload_json, created_at
        )
        VALUES ('evt_2', 'ch_2', 0, 'message.created', 'human', 'user_1', '{}'::jsonb, ${NOW})
      `;
      await sql`
        INSERT INTO messages (id, channel_id, event_id, author_type, author_id, body, created_at)
        VALUES ('msg_2', 'ch_2', 'evt_2', 'human', 'user_1', 'Alt channel inspect', ${NOW})
      `;
      await sql`
        INSERT INTO runs (
          id, channel_id, source_message_id, requested_by, routing_mode, goal, lifecycle,
          scheduling_paused, budget_json
        )
        VALUES ('run_2', 'ch_2', 'msg_2', 'user_1', 'direct', 'Inspect', 'active', false, '{}'::jsonb)
      `;
      await sql`
        INSERT INTO run_steps (
          id, run_id, assigned_agent_id, objective, context_refs_json, state, attempt
        )
        VALUES ('step_2', 'run_2', 'cw_1', 'Read', '[]'::jsonb, 'running', 1)
      `;
      const first = await publishArtifactRecord(
        sql,
        baseInput({ id: "artifact_ch1", workspaceId: "ws_1", channelId: "ch_1" }),
      );
      const second = await publishArtifactRecord(
        sql,
        baseInput({
          id: "artifact_ch2",
          workspaceId: "ws_1",
          channelId: "ch_2",
          runId: "run_2",
          runStepId: "step_2",
          storageKey: `ws/ws_1/ch/ch_2/sha/${"fe".repeat(32)}/r1`,
        }),
      );
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(second.created).toBe(true);
      expect(second.artifact.id).toBe("artifact_ch2");
    });
  });
});
