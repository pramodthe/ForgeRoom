---
id: P0-104
title: Implement owner authentication and authorization
status: done
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-103]
requirements: [AP-003]
specs: [../security.md#human-authentication, ../contracts/api.md#authentication]
adrs: []
touches: [apps/api, apps/web, packages/domain]
---

# P0-104 — Implement owner authentication and authorization

## Outcome

The seeded owner authenticates through a secure server session and every protected command derives identity and role server-side.

## Acceptance criteria

- [x] Login, session query and logout work; logout revokes the session.
- [x] Secure cookie, hashed server session, expiry and login rate limiting exist.
- [x] Mutation endpoints enforce Origin and CSRF.
- [x] Approval/connector commands require recent authentication.
- [x] No production auth bypass, public registration or password-reset path exists.

## Verification

Run API tests for success, invalid login, rate limit, revoked session, forged user ID, missing CSRF and forged Origin.

## Completion evidence

- Files changed:
  - `apps/api/src/auth/{crypto,passwords,rate-limit,store,postgres-store,service,routes,client-key}.ts`
  - `apps/api/src/{env,http,server,server.test,index,main}.ts`
  - `apps/api/package.json` (adds `@forgeroom/db`, `drizzle-orm`)
  - `packages/domain/src/{auth,auth.test}.ts`, `packages/domain/src/index.ts`
  - `apps/web/src/{auth-api,login-page,main}.ts(x)`, `apps/web/vite.config.ts` (`/api` proxy)
  - `.env.example` owner/session vars
- Security tests/results (`@forgeroom/api` tests green on CI):
  - login → session → logout revocation
  - invalid login → 401
  - login rate limit → 429
  - missing CSRF / forged Origin → `csrf_failed`; same-origin Referer accepted when Origin omitted
  - forged `X-ForgeRoom-User-Id` → `forbidden` (server-derived identity only)
  - recent-auth probe succeeds then fails after window; future `authenticatedAt` rejected
  - `/api/auth/register` and `/api/auth/password-reset` → 404
  - production rejects `AUTH_BYPASS` and plaintext `OWNER_PASSWORD`
  - rate-limit prune/maxKeys and valid-length dummy scrypt hash for constant-time padding
- Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` — all passed locally; GitHub Actions CI green on merge head.
- Known limitations: approval/connector product routes land in later tasks; `/api/auth/recent-probe` is the shared recent-auth gate until those exist. Default store is Postgres `auth_sessions`; set `AUTH_STORE=memory` for ephemeral local runs.
- Merged: PR #5 (`ea3db05`) after Qodo review clean at head `a37d924` and CI success.

## Work log

- 2026-08-26 — Claimed by cursor-agent.
  - Outcome: seeded owner authenticates via secure server session; protected commands derive identity/role server-side.
  - Expected changes: `apps/api` auth routes/middleware/session store; `packages/domain` role/recent-auth helpers; minimal `apps/web` login/session surface; owner seed from deployment secrets.
  - Requirements: AP-003.
  - Non-goals: full channel/coworker APIs (P0-106), demo fixtures (P0-105), AG-UI bridge (P0-210+), password-reset/registration, production auth bypass.
  - Verification: API tests for success, invalid login, rate limit, revoked session, forged user ID, missing CSRF, forged Origin; `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- 2026-08-26 — Implementation complete; moved to in_review. Qodo rules search returned no matching standards.
- 2026-08-26 — Pre-PR Qodo review: fixed logout Origin/Referer acceptance, untrusted X-Forwarded-For rate-limit bypass, migrate+seed before listen, and env-driven auth store selection.
- 2026-08-26 — PR #5 Qodo hardening: rate-limit prune/maxKeys, pinned scrypt params, rightmost XFF when trustProxy, reject future authenticatedAt, injected DATABASE_URL, stop/startup cleanup, valid dummy hash, AggregateError on multi-close failure.
- 2026-08-26 — Merged to `main` (`ea3db05`); Qodo clean at head; CI green; moved to `done`.

## Handoff

- Outcome: Owner login/session/logout with HttpOnly session cookie, hashed server secret, CSRF+Origin mutation guards, login rate limiting, recent-auth gate, and no registration/reset/bypass in production.
- Open risks: GitHub Actions sometimes needs a PR reopen to schedule the first run on a branch; reopen works as a reliable retrigger.
- Follow-up tasks: start/finish **P0-000** (blocks fixtures, TrueForge, Composio, AG-UI, Daytona, GenUI); P0-105 waits on P0-000 + P0-104; P0-106 unblocked on auth.
