---
id: P0-108
title: Implement bounded channel context and pins
status: in_review
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-107]
requirements: [ME-001, ME-002, ME-003]
specs: [../runtime.md#channel-context-envelope, ../ux.md#work-panel]
adrs: [ADR-002]
touches: [packages/orchestration, apps/api]
---

# P0-108 — Implement bounded channel context and pins

## Outcome

Each coworker turn receives bounded sourced channel context, and the owner can pin/unpin messages or artifacts.

## Acceptance criteria

- [x] Context contains mission, roster, assignment, sourced pins, safe artifacts, summary and recent deltas.
- [x] Per-session delivery cursor advances only after confirmed/reconciled turn creation.
- [x] Cross-channel state is absent by default.
- [x] Pin/unpin retains source link and creates channel events.
- [x] Credentials, reasoning and sandbox-forbidden sensitive data are excluded.

## Verification

Run envelope snapshot, size-bound, cursor, pin API and cross-channel isolation tests.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test` — 9 passed (envelope snapshot, size-bound, cursor, forbidden-key strip, cross-channel refuse)
  - `pnpm --filter @forgeroom/api test -- src/workspace/context-pins.test.ts` — 4 focused pin/context tests + existing API suites green (55 total in that vitest run)
  - `pnpm --filter @forgeroom/{contracts,orchestration,api} typecheck` and `pnpm lint` green
- Example redacted envelope:
  - `CHANNEL_CONTEXT_V1` with channel mission, human+coworker roster, assignment, sourced pin (`source_message_id`), safe artifact refs (`id/name/kind/mime/revision/sha256`), summary, recent deltas since cursor, human request, untrusted-content notice; no credential/reasoning keys
- Files:
  - `packages/contracts/src/context.ts`
  - `packages/orchestration/src/context-envelope.ts`
  - `apps/api/src/workspace/{store,postgres-store,service,routes,context-pins.test}.ts`
- Known limitations:
  - Idempotent pin create/remove replay returns `sequence: -1` (receipt does not yet persist event sequence)
  - Full turn dispatch still owned by later TrueForge/queue tasks; builder + cursor APIs are ready for that wiring
  - Postgres `insertArtifact` is a fixture helper (synthetic storage key); durable artifact pipeline remains P0-310

## Work log

- 2026-08-26 — Implemented bounded context envelope + pin/unpin API; fixed Qodo findings for byte ceiling, contiguous deltas, monotonic cursor, high-water validation, and pin idempotency key binding.
