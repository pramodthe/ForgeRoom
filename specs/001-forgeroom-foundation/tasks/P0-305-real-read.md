---
id: P0-305
title: Implement real Composio read path
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-201, P0-203, P0-303]
requirements: [TL-001, TL-004, RUN-005]
specs: [../runtime.md#composio-session, ../contracts/events.md#tools-and-connections]
adrs: [ADR-003]
touches: [packages/integrations, packages/orchestration]
---

# P0-305 — Implement real Composio read path

## Outcome

A persistent coworker invokes the selected real read through TrueForge and the channel receives a safe attributed result.

## Acceptance criteria

- [x] Preflight verifies exact account and tool before dispatch.
- [x] TrueForge invokes the direct tool, not a wrapper meta-tool.
- [x] Normalized event shows coworker, tool, safe request and result summary.
- [x] Raw result body and credentials are not persisted or sent to browser.
- [x] Expired auth produces blocked connection.

## Verification

Run live read, expired-account and raw-payload redaction integration tests.

## Work log

- 2026-08-27 — Claimed after P0-308. Implemented exact account/tool preflight, TrueForge direct-tool observation (meta wrappers rejected), policy-safe `tool.started`/`tool.succeeded` projection, and expired-auth → `blocked_connection` with no account fallback. Live Composio read of `pramodthe/ForgeRoom#35` passed.

## Completion evidence

- Redacted trace: `provider-fixtures/composio/real-read.verified.json`
- Tests/results: `pnpm --filter @forgeroom/composio test` (41 passed incl. live P0-305 read); `pnpm --filter @forgeroom/orchestration test` (87 passed incl. 8 real-read); both packages typecheck clean; `pnpm --filter @forgeroom/test-fixtures test` covers verified fixture.
