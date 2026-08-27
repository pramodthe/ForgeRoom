import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@forgeroom/contracts";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { createPostgresWorkspaceStore } from "./postgres-store";
import { createWorkspaceService } from "./service";

const session: SessionResponse = {
  request_id: "req_test",
  user: {
    id: "user_1",
    email: "owner@example.test",
    display_name: "Owner",
    role: "owner",
  },
  workspace_id: "ws_1",
  csrf_token: "csrf_test",
  expires_at: "2027-08-26T00:00:00+00:00",
};

async function seedParticipants(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`
    INSERT INTO channel_participants (
      channel_id, participant_type, participant_id, role, joined_at
    ) VALUES
      ('ch_1', 'human', 'user_1', 'owner', now()),
      ('ch_1', 'coworker', 'cw_1', 'member', now())
  `;
}

function command(body: string, idempotencyKey: string) {
  return {
    body,
    recipient_handles: [],
    routing_mode: "direct" as const,
    parent_message_id: null,
    idempotency_key: idempotencyKey,
  };
}

describe("channel message idempotency recovery", () => {
  it("rejects a run idempotency key reused for different message content", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedParticipants(sql);
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });

      const first = await workspace.postMessage(
        session,
        "ch_1",
        command("@research inspect the first issue", "agui:ch_1:cw_1:run_collision"),
      );
      expect(first.ok).toBe(true);

      const collision = await workspace.postMessage(
        session,
        "ch_1",
        command("@research inspect a different issue", "agui:ch_1:cw_1:run_collision"),
      );
      expect(collision).toMatchObject({
        ok: false,
        error: {
          code: "conflict",
          details: { reason: "idempotency_key_reuse" },
        },
      });
      const messages = await sql<{ body: string }[]>`
        SELECT body FROM messages
        WHERE channel_id = 'ch_1' AND body LIKE '@research inspect%'
      `;
      expect(messages.map((row) => row.body)).toEqual(["@research inspect the first issue"]);
    });
  }, 60_000);

  it("repairs the original persisted message instead of duplicating it after run creation fails", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedParticipants(sql);
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      await sql.unsafe(`
        CREATE FUNCTION fail_forgeroom_run_insert() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected run creation failure';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER fail_forgeroom_run_insert_trigger
        BEFORE INSERT ON runs
        FOR EACH ROW EXECUTE FUNCTION fail_forgeroom_run_insert();
      `);
      const body = "@research recover this exact message";
      const key = "agui:ch_1:cw_1:run_recovery";

      const failed = await workspace.postMessage(session, "ch_1", command(body, key));
      expect(failed.ok).toBe(false);
      await sql.unsafe(`DROP TRIGGER fail_forgeroom_run_insert_trigger ON runs`);

      const recovered = await workspace.postMessage(session, "ch_1", command(body, key));
      expect(recovered.ok).toBe(true);
      if (!recovered.ok) {
        throw new Error(recovered.error.message);
      }
      const messages = await sql<{ id: string }[]>`
        SELECT id FROM messages WHERE channel_id = 'ch_1' AND body = ${body}
      `;
      expect(messages).toHaveLength(1);
      expect(recovered.value.message_id).toBe(messages[0]?.id);
      const runs = await sql<{ source_message_id: string }[]>`
        SELECT source_message_id FROM runs WHERE source_message_id = ${messages[0]?.id ?? ""}
      `;
      expect(runs).toHaveLength(1);
    });
  }, 60_000);
});
