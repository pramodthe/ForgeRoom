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
