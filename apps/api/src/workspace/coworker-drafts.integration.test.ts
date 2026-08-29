import { describe, expect, it } from "vitest";
import { coworkerDraftSchema } from "@forgeroom/contracts";
import { GOLDEN_RESEARCH_PROMPT } from "@forgeroom/domain";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { createPostgresWorkspaceStore } from "./postgres-store";
import {
  coworkerDraftMutationHeaders,
  createCoworkerDraftTestApp,
  loginCoworkerDraftTestApp,
} from "./coworker-drafts.test-helpers";

describe("coworker drafts PostgreSQL integration", () => {
  it("atomically reuses concurrent equivalent drafts without superseding the winner", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`UPDATE agent_profiles SET handle = 'seeded_research' WHERE id = 'cw_1'`;
      const store = createPostgresWorkspaceStore(sql);
      const { app, env } = await createCoworkerDraftTestApp(store, {
        workspaceId: "ws_1",
        ownerUserId: "user_1",
      });
      const { cookie, csrf } = await loginCoworkerDraftTestApp(app, env);
      const create = (idempotencyKey: string) =>
        app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
          method: "POST",
          headers: coworkerDraftMutationHeaders(env, cookie, csrf),
          body: JSON.stringify({
            schemaVersion: 1,
            request: GOLDEN_RESEARCH_PROMPT,
            idempotency_key: idempotencyKey,
          }),
        });

      const [first, second] = await Promise.all([
        create("idem_equivalent_pg_a"),
        create("idem_equivalent_pg_b"),
      ]);
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const firstDraft = coworkerDraftSchema.parse(
        ((await first.json()) as { draft: unknown }).draft,
      );
      const secondDraft = coworkerDraftSchema.parse(
        ((await second.json()) as { draft: unknown }).draft,
      );
      expect(secondDraft.id).toBe(firstDraft.id);
      const rows = await sql<Array<{ id: string; state: string }>>`
        SELECT id, state FROM coworker_drafts WHERE workspace_id = 'ws_1'
      `;
      expect(rows).toEqual([{ id: firstDraft.id, state: "awaiting_review" }]);
    });
  }, 60_000);

  it("increments an equivalent terminal draft instead of violating its natural key", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`UPDATE agent_profiles SET handle = 'seeded_research' WHERE id = 'cw_1'`;
      const store = createPostgresWorkspaceStore(sql);
      const { app, env } = await createCoworkerDraftTestApp(store, {
        workspaceId: "ws_1",
        ownerUserId: "user_1",
      });
      const { cookie, csrf } = await loginCoworkerDraftTestApp(app, env);
      const create = (idempotencyKey: string) =>
        app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
          method: "POST",
          headers: coworkerDraftMutationHeaders(env, cookie, csrf),
          body: JSON.stringify({
            schemaVersion: 1,
            request: GOLDEN_RESEARCH_PROMPT,
            idempotency_key: idempotencyKey,
          }),
        });

      const first = coworkerDraftSchema.parse(
        ((await (await create("idem_equivalent_terminal_pg_a")).json()) as { draft: unknown })
          .draft,
      );
      await sql`
        UPDATE coworker_drafts
        SET state = 'superseded', decided_at = now()
        WHERE id = ${first.id}
      `;
      const secondResponse = await create("idem_equivalent_terminal_pg_b");
      expect(secondResponse.status).toBe(201);
      const second = coworkerDraftSchema.parse(
        ((await secondResponse.json()) as { draft: unknown }).draft,
      );
      expect(second).toMatchObject({ state: "awaiting_review", revision: 2 });
      expect(second.id).not.toBe(first.id);
    });
  }, 60_000);

  it("persists idempotent confirm through postgres", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        UPDATE agent_profiles
        SET handle = 'seeded_research'
        WHERE id = 'cw_1'
      `;
      const store = createPostgresWorkspaceStore(sql);
      const { app, env } = await createCoworkerDraftTestApp(store, {
        workspaceId: "ws_1",
        ownerUserId: "user_1",
      });
      const { cookie, csrf } = await loginCoworkerDraftTestApp(app, env);
      const created = await app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
        method: "POST",
        headers: coworkerDraftMutationHeaders(env, cookie, csrf),
        body: JSON.stringify({
          schemaVersion: 1,
          request: GOLDEN_RESEARCH_PROMPT,
          idempotency_key: "idem_pg_confirm_draft",
        }),
      });
      expect(created.status).toBe(201);
      const draft = coworkerDraftSchema.parse(((await created.json()) as { draft: unknown }).draft);
      const confirmBody = {
        schemaVersion: 1 as const,
        draft_revision: draft.revision,
        draft_hash: draft.draft_hash,
        policy_revision: draft.policy_revision,
        catalog_revision: draft.catalog_revision,
        idempotency_key: "idem_pg_confirm_once",
      };
      await app.request(`/api/coworker-drafts/${draft.id}/confirm`, {
        method: "POST",
        headers: coworkerDraftMutationHeaders(env, cookie, csrf),
        body: JSON.stringify(confirmBody),
      });
      await app.request(`/api/coworker-drafts/${draft.id}/confirm`, {
        method: "POST",
        headers: coworkerDraftMutationHeaders(env, cookie, csrf),
        body: JSON.stringify(confirmBody),
      });
      const listed = await app.request(`/api/workspaces/${env.workspaceId}/coworkers`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(((await listed.json()) as { coworkers: unknown[] }).coworkers).toHaveLength(2);
    });
  }, 60_000);
});
