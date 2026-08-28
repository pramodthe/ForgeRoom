import { describe, expect, it } from "vitest";
import { coworkerDraftSchema, coworkerProfileSchema } from "@forgeroom/contracts";
import { GOLDEN_RESEARCH_PROMPT } from "@forgeroom/domain";
import { withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createMemoryWorkspaceStore } from "./store";
import { createPostgresWorkspaceStore } from "./postgres-store";
import { createWorkspaceService } from "./service";

const PASSWORD = "correct-horse-battery";

async function createTestApp(store = createMemoryWorkspaceStore()) {
  const authStore = createMemoryAuthStore();
  const env = loadApiEnv({
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: PASSWORD,
    OWNER_USER_ID: "user_owner",
    OWNER_DISPLAY_NAME: "Owner",
    WORKSPACE_ID: "workspace_1",
    LOGIN_RATE_LIMIT_MAX: "20",
    LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
    RECENT_AUTH_WINDOW_SECONDS: "300",
    SESSION_TTL_SECONDS: "3600",
  });
  const auth = createAuthService({ env, store: authStore });
  const workspace = createWorkspaceService({ store });
  await auth.seedOwner();
  return {
    app: createApiApp({ env, auth, workspace }),
    env,
    store,
    workspace,
  };
}

function mutationHeaders(
  env: ReturnType<typeof loadApiEnv>,
  cookie: string,
  csrf: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    cookie: `${env.sessionCookieName}=${cookie}`,
    origin: env.appOrigin,
    "x-csrf-token": csrf,
  };
}

async function login(app: ReturnType<typeof createApiApp>, env: ReturnType<typeof loadApiEnv>) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
  });
  const body = (await response.json()) as { csrf_token: string };
  const cookie = response.headers.get("set-cookie")?.match(new RegExp(`${env.sessionCookieName}=([^;]+)`))?.[1];
  if (!cookie) {
    throw new Error("missing session cookie");
  }
  return { cookie, csrf: body.csrf_token };
}

describe("coworker drafts API", () => {
  it("creates a read-only research draft for the golden prompt without mutating coworkers", async () => {
    const { app, env, store } = await createTestApp();
    const beforeCoworkers = (await store.listCoworkers(env.workspaceId)).length;
    const { cookie, csrf } = await login(app, env);

    const created = await app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, csrf),
      body: JSON.stringify({
        schemaVersion: 1,
        request: GOLDEN_RESEARCH_PROMPT,
        idempotency_key: "idem_research_draft",
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { draft: unknown };
    const draft = coworkerDraftSchema.parse(body.draft);
    expect(draft.proposal.handle).toBe("research");
    expect(draft.proposal.tool_grants).toEqual(["GITHUB_GET_AN_ISSUE"]);
    expect(draft.effective_preview.native_subagents_enabled).toBe(false);
    expect(draft.effective_preview.denials.some((entry) => entry.includes("write_tools"))).toBe(
      true,
    );
    expect((await store.listCoworkers(env.workspaceId)).length).toBe(beforeCoworkers);
  });

  it("rejects stale confirm without creating a coworker profile", async () => {
    const { app, env } = await createTestApp();
    const { cookie, csrf } = await login(app, env);
    const created = await app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, csrf),
      body: JSON.stringify({
        schemaVersion: 1,
        request: GOLDEN_RESEARCH_PROMPT,
        idempotency_key: "idem_stale_draft",
      }),
    });
    const { draft: draftRef } = (await created.json()) as { draft: { id: string } };
    const loaded = await app.request(`/api/coworker-drafts/${draftRef.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    const parsedDraft = coworkerDraftSchema.parse(((await loaded.json()) as { draft: unknown }).draft);

    const stale = await app.request(`/api/coworker-drafts/${parsedDraft.id}/confirm`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, csrf),
      body: JSON.stringify({
        schemaVersion: 1,
        draft_revision: parsedDraft.revision,
        draft_hash: `sha256:${"0".repeat(64)}`,
        policy_revision: parsedDraft.policy_revision,
        catalog_revision: parsedDraft.catalog_revision,
        idempotency_key: "idem_stale_confirm",
      }),
    });
    expect(stale.status).toBe(409);
    const coworkers = await (
      await app.request(`/api/workspaces/${env.workspaceId}/coworkers`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      })
    ).json();
    expect((coworkers as { coworkers: unknown[] }).coworkers).toHaveLength(0);
  });

  it("confirms idempotently and creates one coworker profile", async () => {
    const { app, env } = await createTestApp();
    const { cookie, csrf } = await login(app, env);
    const created = await app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, csrf),
      body: JSON.stringify({
        schemaVersion: 1,
        request: GOLDEN_RESEARCH_PROMPT,
        idempotency_key: "idem_confirm_draft",
      }),
    });
    const draft = coworkerDraftSchema.parse(((await created.json()) as { draft: unknown }).draft);
    const confirmBody = {
      schemaVersion: 1 as const,
      draft_revision: draft.revision,
      draft_hash: draft.draft_hash,
      policy_revision: draft.policy_revision,
      catalog_revision: draft.catalog_revision,
      idempotency_key: "idem_confirm_once",
    };

    const first = await app.request(`/api/coworker-drafts/${draft.id}/confirm`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, csrf),
      body: JSON.stringify(confirmBody),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { coworker: unknown };
    const coworker = coworkerProfileSchema.parse(firstBody.coworker);

    const second = await app.request(`/api/coworker-drafts/${draft.id}/confirm`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, csrf),
      body: JSON.stringify(confirmBody),
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { coworker: unknown };
    expect(coworkerProfileSchema.parse(secondBody.coworker).id).toBe(coworker.id);

    const listed = await app.request(`/api/workspaces/${env.workspaceId}/coworkers`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    const listBody = (await listed.json()) as { coworkers: unknown[] };
    expect(listBody.coworkers).toHaveLength(1);
  });

  it.skipIf(!process.env.DATABASE_URL)("persists idempotent confirm through postgres", async () => {
    await withMigratedDatabase(async (sql) => {
      const store = createPostgresWorkspaceStore(sql);
      const { app, env } = await createTestApp(store);
      const { cookie, csrf } = await login(app, env);
      const created = await app.request(`/api/workspaces/${env.workspaceId}/coworker-drafts`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, csrf),
        body: JSON.stringify({
          schemaVersion: 1,
          request: GOLDEN_RESEARCH_PROMPT,
          idempotency_key: "idem_pg_confirm_draft",
        }),
      });
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
        headers: mutationHeaders(env, cookie, csrf),
        body: JSON.stringify(confirmBody),
      });
      await app.request(`/api/coworker-drafts/${draft.id}/confirm`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, csrf),
        body: JSON.stringify(confirmBody),
      });
      const listed = await app.request(`/api/workspaces/${env.workspaceId}/coworkers`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(((await listed.json()) as { coworkers: unknown[] }).coworkers).toHaveLength(1);
    });
  }, 60_000);
});
