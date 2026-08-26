import { describe, expect, it } from "vitest";
import { errorEnvelopeSchema, sessionResponseSchema } from "@forgeroom/contracts";
import { canTransitionTask } from "@forgeroom/domain";
import { startWorker } from "@forgeroom/orchestration";
import { loadApiEnv } from "./env";
import { createApiApp } from "./server";
import { createAuthService } from "./auth/service";
import { createMemoryAuthStore } from "./auth/store";
import { hashPassword } from "./auth/passwords";

const PASSWORD = "correct-horse-battery";

async function createTestApp(overrides?: {
  recentAuthWindowSeconds?: number;
  loginRateLimitMax?: number;
  now?: () => Date;
}) {
  const store = createMemoryAuthStore();
  const env = loadApiEnv({
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: PASSWORD,
    OWNER_USER_ID: "user_owner",
    OWNER_DISPLAY_NAME: "Owner",
    WORKSPACE_ID: "workspace_1",
    LOGIN_RATE_LIMIT_MAX: String(overrides?.loginRateLimitMax ?? 5),
    LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
    RECENT_AUTH_WINDOW_SECONDS: String(overrides?.recentAuthWindowSeconds ?? 300),
    SESSION_TTL_SECONDS: "3600",
  });
  const auth = createAuthService({ env, store, now: overrides?.now });
  await auth.seedOwner();
  return { app: createApiApp({ env, auth }), env, auth, store };
}

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) {
    return undefined;
  }
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

describe("createApiApp", () => {
  it("serves health without provider credentials", async () => {
    const app = createApiApp();
    const response = await app.request("/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "forgeroom-api",
    });
  });
});

describe("API/worker separability", () => {
  it("loads the worker runtime from orchestration, not from apps/worker", () => {
    const worker = startWorker({ embedded: true });
    expect(worker.kind).toBe("worker");
    expect(worker.embedded).toBe(true);
  });

  it("defaults to 0.0.0.0 and PORT from the environment", () => {
    expect(loadApiEnv({ PORT: "4123", OWNER_PASSWORD: "x" })).toMatchObject({
      host: "0.0.0.0",
      port: 4123,
      embedWorker: true,
    });
    expect(loadApiEnv({ FORGEROOM_EMBED_WORKER: "false", OWNER_PASSWORD: "x" }).embedWorker).toBe(
      false,
    );
  });

  it("imports shared contracts and domain transitions", () => {
    expect(canTransitionTask("todo", "done")).toBe(false);
    expect(
      errorEnvelopeSchema.parse({
        error: {
          code: "stale_coworker_draft",
          message: "Review the updated permission preview.",
          request_id: "req_1",
          retryable: false,
          details: {},
        },
      }).error.code,
    ).toBe("stale_coworker_draft");
  });

  it("rejects production auth bypass and plaintext owner password", () => {
    expect(() =>
      loadApiEnv({ NODE_ENV: "production", AUTH_BYPASS: "true", OWNER_PASSWORD_HASH: "x" }),
    ).toThrow(/AUTH_BYPASS/);
    expect(() => loadApiEnv({ NODE_ENV: "production", OWNER_PASSWORD: "secret" })).toThrow(
      /OWNER_PASSWORD is forbidden/,
    );
  });
});

describe("owner authentication", () => {
  it("logs in, returns session, and logs out by revoking the server session", async () => {
    const { app, env } = await createTestApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);
    expect(cookie).toBeTruthy();
    expect(session.user.role).toBe("owner");
    expect(session.csrf_token).toBeTruthy();

    const me = await app.request("/api/session", {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(me.status).toBe(200);

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: env.appOrigin,
        "x-csrf-token": session.csrf_token,
      },
    });
    expect(logout.status).toBe(200);

    const after = await app.request("/api/session", {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(after.status).toBe(401);
  });

  it("rejects invalid login", async () => {
    const { app } = await createTestApp();
    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: "wrong" }),
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthenticated" },
    });
  });

  it("rate limits repeated login failures without trusting spoofable forwarded headers", async () => {
    const { app } = await createTestApp({ loginRateLimitMax: 2 });
    for (let i = 0; i < 2; i += 1) {
      const response = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `203.0.113.${i}`,
        },
        body: JSON.stringify({ email: "owner@example.test", password: "wrong" }),
      });
      expect(response.status).toBe(401);
    }
    const limited = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.1",
      },
      body: JSON.stringify({ email: "owner@example.test", password: "wrong" }),
    });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      error: { code: "forbidden", details: { reason: "rate_limited" } },
    });
  });

  it("accepts same-origin Referer when Origin is omitted on logout", async () => {
    const { app, env } = await createTestApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);

    const logout = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        referer: `${env.appOrigin}/`,
        "x-csrf-token": session.csrf_token,
      },
    });
    expect(logout.status).toBe(200);
  });

  it("rejects missing CSRF and forged Origin on mutations", async () => {
    const { app, env } = await createTestApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);

    const missingCsrf = await app.request("/api/auth/probe", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: env.appOrigin,
      },
    });
    expect(missingCsrf.status).toBe(403);
    await expect(missingCsrf.json()).resolves.toMatchObject({
      error: { code: "csrf_failed" },
    });

    const forgedOrigin = await app.request("/api/auth/probe", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: "https://evil.example",
        "x-csrf-token": session.csrf_token,
      },
    });
    expect(forgedOrigin.status).toBe(403);
    await expect(forgedOrigin.json()).resolves.toMatchObject({
      error: { code: "csrf_failed" },
    });
  });

  it("ignores forged user IDs and keeps server-derived identity", async () => {
    const { app, env } = await createTestApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);

    const forged = await app.request("/api/auth/probe", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: env.appOrigin,
        "x-csrf-token": session.csrf_token,
        "x-forgeroom-user-id": "user_attacker",
      },
    });
    expect(forged.status).toBe(403);
    await expect(forged.json()).resolves.toMatchObject({
      error: { code: "forbidden" },
    });
  });

  it("requires recent authentication for approval/connector-style commands", async () => {
    let current = new Date("2026-08-26T16:00:00.000Z");
    const { app, env } = await createTestApp({
      recentAuthWindowSeconds: 60,
      now: () => current,
    });
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);

    const recentOk = await app.request("/api/auth/recent-probe", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: env.appOrigin,
        "x-csrf-token": session.csrf_token,
      },
    });
    expect(recentOk.status).toBe(200);

    current = new Date("2026-08-26T16:02:00.000Z");
    const stale = await app.request("/api/auth/recent-probe", {
      method: "POST",
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: env.appOrigin,
        "x-csrf-token": session.csrf_token,
      },
    });
    expect(stale.status).toBe(403);
    await expect(stale.json()).resolves.toMatchObject({
      error: { details: { reason: "recent_auth_required" } },
    });
  });

  it("exposes no registration or password-reset path", async () => {
    const { app } = await createTestApp();
    for (const path of ["/api/auth/register", "/api/auth/password-reset"]) {
      const response = await app.request(path, { method: "POST" });
      expect(response.status).toBe(404);
    }
  });

  it("hashes passwords with scrypt", async () => {
    const encoded = await hashPassword("secret");
    expect(encoded.startsWith("scrypt$")).toBe(true);
  });
});
