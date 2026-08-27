import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@forgeroom/contracts";
import { createLocalDirectoryArtifactStorage } from "@forgeroom/artifacts";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { createMemoryAuthStore } from "../auth/store";
import { createAuthService } from "../auth/service";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
import { createArtifactService } from "./service";

const PASSWORD = "correct-horse-battery";

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

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) {
    return undefined;
  }
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

describe("artifact routes", () => {
  it("requires authentication for artifact metadata and download", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifact-api-"));
    try {
      await withMigratedDatabase(async (sql) => {
        await seedRuntime(sql);
        const env = loadApiEnv({
          NODE_ENV: "test",
          APP_ORIGIN: "http://localhost:5173",
          OWNER_EMAIL: "owner@example.test",
          OWNER_PASSWORD: PASSWORD,
          OWNER_USER_ID: "user_1",
          WORKSPACE_ID: "ws_1",
          AUTH_STORE: "memory",
        });
        const auth = createAuthService({ env, store: createMemoryAuthStore() });
        await auth.seedOwner();
        const workspace = createWorkspaceService({
          store: createPostgresWorkspaceStore(sql),
          sql,
        });
        const artifacts = createArtifactService({
          env,
          workspace,
          sql,
          storage: createLocalDirectoryArtifactStorage({ rootDir }),
        });
        const app = createApiApp({ env, auth, workspace, artifacts, sql });
        const metadata = await app.request("/api/artifacts/artifact_x");
        expect(metadata.status).toBe(401);
        const download = await app.request("/api/artifacts/artifact_x/download");
        expect(download.status).toBe(401);
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("returns metadata and download for published artifacts in the same workspace", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifact-api-"));
    try {
      await withMigratedDatabase(async (sql) => {
        await seedRuntime(sql);
        const env = loadApiEnv({
          NODE_ENV: "test",
          APP_ORIGIN: "http://localhost:5173",
          OWNER_EMAIL: "owner@example.test",
          OWNER_PASSWORD: PASSWORD,
          OWNER_USER_ID: "user_1",
          WORKSPACE_ID: "ws_1",
          AUTH_STORE: "memory",
          SESSION_COOKIE_NAME: "fr_session",
        });
        const auth = createAuthService({ env, store: createMemoryAuthStore() });
        await auth.seedOwner();
        const workspace = createWorkspaceService({
          store: createPostgresWorkspaceStore(sql),
          sql,
        });
        const artifacts = createArtifactService({
          env,
          workspace,
          sql,
          storage: createLocalDirectoryArtifactStorage({ rootDir }),
        });
        const app = createApiApp({ env, auth, workspace, artifacts, sql });
        const content = Buffer.from("# retained\n", "utf8");
        const published = await artifacts.publishArtifact({
          id: "artifact_a",
          workspaceId: "ws_1",
          channelId: "ch_1",
          runId: "run_1",
          runStepId: "step_1",
          creatorAgentId: "cw_1",
          kind: "file",
          name: "retained.md",
          mimeType: "text/markdown",
          revision: 1,
          content,
        });
        expect(published.ok).toBe(true);
        if (!published.ok) {
          return;
        }

        const login = await app.request("/api/auth/login", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
        });
        const cookie = cookieFrom(login, env.sessionCookieName);
        expect(cookie).toBeTruthy();

        const metadata = await app.request("/api/artifacts/artifact_a", {
          headers: { cookie: `${env.sessionCookieName}=${cookie}` },
        });
        expect(metadata.status).toBe(200);
        const metadataBody = (await metadata.json()) as {
          artifact: {
            sha256: string;
            byte_size: number;
            creator_coworker_id: string;
            run_id: string;
            run_step_id: string;
            revision: number;
          };
        };
        expect(metadataBody.artifact).toMatchObject({
          sha256: published.value.artifact.sha256,
          byte_size: content.byteLength,
          creator_coworker_id: "cw_1",
          run_id: "run_1",
          run_step_id: "step_1",
          revision: 1,
        });

        const download = await app.request("/api/artifacts/artifact_a/download", {
          headers: { cookie: `${env.sessionCookieName}=${cookie}` },
        });
        expect(download.status).toBe(200);
        expect(download.headers.get("content-type")).toBe("text/markdown");
        expect(download.headers.get("content-disposition")).toContain('filename="retained.md"');
        expect(Buffer.from(await download.arrayBuffer()).equals(content)).toBe(true);

        const preview = await app.request("/api/artifacts/artifact_a/preview", {
          headers: { cookie: `${env.sessionCookieName}=${cookie}` },
        });
        expect(preview.status).toBe(200);
        expect(preview.headers.get("content-security-policy")).toContain("script-src 'none'");
        const previewBody = (await preview.json()) as {
          preview: { kind: string; content: string; mime_type: string };
        };
        expect(previewBody.preview).toMatchObject({
          kind: "text",
          mime_type: "text/markdown",
          content: "# retained\n",
        });

        const previewDenied = await app.request("/api/artifacts/artifact_a/preview");
        expect(previewDenied.status).toBe(401);
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects cross-workspace artifact access", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifact-api-"));
    try {
      await withMigratedDatabase(async (sql) => {
        await seedRuntime(sql);
        await sql`
          INSERT INTO workspaces (id, name, slug, created_by, created_at)
          VALUES ('ws_other', 'Other', 'other', 'user_1', ${new Date().toISOString()})
        `;
        const env = loadApiEnv({
          NODE_ENV: "test",
          APP_ORIGIN: "http://localhost:5173",
          OWNER_EMAIL: "owner@example.test",
          OWNER_PASSWORD: PASSWORD,
          OWNER_USER_ID: "user_1",
          WORKSPACE_ID: "ws_other",
          AUTH_STORE: "memory",
          SESSION_COOKIE_NAME: "fr_session",
        });
        const auth = createAuthService({ env, store: createMemoryAuthStore() });
        await auth.seedOwner();
        const workspace = createWorkspaceService({
          store: createPostgresWorkspaceStore(sql),
          sql,
        });
        const artifacts = createArtifactService({
          env,
          workspace,
          sql,
          storage: createLocalDirectoryArtifactStorage({ rootDir }),
        });
        await artifacts.publishArtifact({
          id: "artifact_foreign",
          workspaceId: "ws_1",
          channelId: "ch_1",
          runId: "run_1",
          runStepId: "step_1",
          creatorAgentId: "cw_1",
          kind: "file",
          name: "secret.md",
          mimeType: "text/markdown",
          revision: 1,
          content: Buffer.from("secret", "utf8"),
        });

        const foreignSession = { ...session, workspace_id: "ws_other" };
        const result = await artifacts.getArtifact(foreignSession, "artifact_foreign");
        expect(result.ok).toBe(false);
        if (result.ok) {
          return;
        }
        expect(result.error.code).toBe("forbidden");
      });
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
