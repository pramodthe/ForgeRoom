import type { ApiEnv } from "../env";
import type { AuthStore } from "./store";
import { createMemoryAuthStore } from "./store";
import { hashPassword, verifyPassword } from "./passwords";
import {
  deriveCsrfToken,
  formatSessionCookie,
  hashSecret,
  parseSessionCookie,
  randomOpaqueId,
  randomSecret,
  secretsEqual,
} from "./crypto";
import { createSlidingWindowRateLimiter } from "./rate-limit";
import { isOwnerRole, isRecentAuthentication } from "@forgeroom/domain";
import type { SessionResponse } from "@forgeroom/contracts";

export function originAllowed(
  appOrigin: string,
  origin: string | undefined,
  referer: string | undefined,
): boolean {
  if (origin === appOrigin) {
    return true;
  }
  // Same-origin browser POSTs sometimes omit Origin; accept a matching Referer.
  if (!origin && typeof referer === "string" && referer.startsWith(`${appOrigin}/`)) {
    return true;
  }
  return false;
}

export type AuthService = {
  seedOwner(): Promise<void>;
  login(input: {
    email: string;
    password: string;
    clientKey: string;
  }): Promise<
    | { ok: true; session: SessionResponse; cookieValue: string }
    | { ok: false; reason: "invalid_credentials" | "rate_limited"; retryAfterMs?: number }
  >;
  readSession(cookieValue: string | undefined): Promise<SessionResponse | null>;
  logout(cookieValue: string | undefined): Promise<void>;
  assertMutationGuards(input: {
    cookieValue: string | undefined;
    origin: string | undefined;
    referer: string | undefined;
    csrfHeader: string | undefined;
    forgedUserId?: string | null;
  }): Promise<
    | { ok: true; session: SessionResponse }
    | { ok: false; reason: "unauthenticated" | "csrf_failed" | "forbidden" }
  >;
  assertRecentAuth(
    cookieValue: string | undefined,
  ): Promise<
    { ok: true; session: SessionResponse } | { ok: false; reason: "unauthenticated" | "forbidden" }
  >;
};

export function createAuthService(options: {
  env: ApiEnv;
  store?: AuthStore;
  now?: () => Date;
}): AuthService {
  const store = options.store ?? createMemoryAuthStore();
  const now = options.now ?? (() => new Date());
  const limiter = createSlidingWindowRateLimiter({
    limit: options.env.loginRateLimitMax,
    windowMs: options.env.loginRateLimitWindowMs,
  });

  async function resolveLiveSession(cookieValue: string | undefined) {
    const parsed = parseSessionCookie(cookieValue);
    if (!parsed) {
      return null;
    }
    const session = await store.getSession(parsed.sessionId);
    if (!session || session.revokedAt) {
      return null;
    }
    if (new Date(session.expiresAt).getTime() <= now().getTime()) {
      return null;
    }
    if (!secretsEqual(session.secretHash, hashSecret(parsed.secret))) {
      return null;
    }
    const user = await store.getUserById(session.userId);
    const membership = user ? await store.getActiveOwnerMembership(user.id) : null;
    if (!user || !membership || !isOwnerRole(membership.role)) {
      return null;
    }
    await store.touchSession(session.id, now().toISOString());
    const response: SessionResponse = {
      request_id: randomOpaqueId("req"),
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        role: "owner",
      },
      workspace_id: membership.workspaceId,
      csrf_token: deriveCsrfToken(parsed.secret),
      expires_at: session.expiresAt,
    };
    return { response, session, secret: parsed.secret };
  }

  return {
    async seedOwner() {
      const passwordHash =
        options.env.ownerPasswordHash ??
        (options.env.ownerPassword ? await hashPassword(options.env.ownerPassword) : null);
      if (!passwordHash) {
        throw new Error("OWNER_PASSWORD_HASH is required (or OWNER_PASSWORD in non-production)");
      }
      await store.upsertOwner({
        user: {
          id: options.env.ownerUserId,
          email: options.env.ownerEmail,
          displayName: options.env.ownerDisplayName,
          passwordHash,
        },
        workspaceId: options.env.workspaceId,
        workspaceName: options.env.workspaceName,
        workspaceSlug: options.env.workspaceSlug,
      });
    },

    async login(input) {
      const key = `${input.clientKey}:${input.email.toLowerCase()}`;
      const limited = limiter.take(key);
      if (!limited.allowed) {
        return { ok: false, reason: "rate_limited", retryAfterMs: limited.retryAfterMs };
      }
      const user = await store.getUserByEmail(input.email);
      const dummyHash =
        "scrypt$16384$8$1$dGltbmdfcGFkX3NhbHQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
      const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? dummyHash);
      if (!user || !passwordOk) {
        return { ok: false, reason: "invalid_credentials" };
      }
      const membership = await store.getActiveOwnerMembership(user.id);
      if (!membership || !isOwnerRole(membership.role)) {
        return { ok: false, reason: "invalid_credentials" };
      }
      const secret = randomSecret();
      const createdAt = now().toISOString();
      const expiresAt = new Date(
        now().getTime() + options.env.sessionTtlSeconds * 1000,
      ).toISOString();
      const sessionId = randomOpaqueId("sess");
      await store.createSession({
        id: sessionId,
        userId: user.id,
        secretHash: hashSecret(secret),
        expiresAt,
        revokedAt: null,
        createdAt,
        lastSeenAt: createdAt,
      });
      const cookieValue = formatSessionCookie(sessionId, secret);
      return {
        ok: true,
        cookieValue,
        session: {
          request_id: randomOpaqueId("req"),
          user: {
            id: user.id,
            email: user.email,
            display_name: user.displayName,
            role: "owner",
          },
          workspace_id: membership.workspaceId,
          csrf_token: deriveCsrfToken(secret),
          expires_at: expiresAt,
        },
      };
    },

    async readSession(cookieValue) {
      const live = await resolveLiveSession(cookieValue);
      return live?.response ?? null;
    },

    async logout(cookieValue) {
      const parsed = parseSessionCookie(cookieValue);
      if (!parsed) {
        return;
      }
      await store.revokeSession(parsed.sessionId, now().toISOString());
    },

    async assertMutationGuards(input) {
      if (!originAllowed(options.env.appOrigin, input.origin, input.referer)) {
        return { ok: false, reason: "csrf_failed" };
      }
      const live = await resolveLiveSession(input.cookieValue);
      if (!live) {
        return { ok: false, reason: "unauthenticated" };
      }
      if (input.forgedUserId && input.forgedUserId !== live.response.user.id) {
        // Identity is server-derived; forged client IDs never expand authority.
        return { ok: false, reason: "forbidden" };
      }
      if (!input.csrfHeader || !secretsEqual(input.csrfHeader, live.response.csrf_token)) {
        return { ok: false, reason: "csrf_failed" };
      }
      return { ok: true, session: live.response };
    },

    async assertRecentAuth(cookieValue) {
      const live = await resolveLiveSession(cookieValue);
      if (!live) {
        return { ok: false, reason: "unauthenticated" };
      }
      if (
        !isRecentAuthentication(
          live.session.createdAt,
          now(),
          options.env.recentAuthWindowSeconds * 1000,
        )
      ) {
        return { ok: false, reason: "forbidden" };
      }
      return { ok: true, session: live.response };
    },
  };
}
