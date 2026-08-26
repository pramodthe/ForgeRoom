---
id: P0-107
title: Implement canonical event log and resumable SSE
status: in_review
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-106]
requirements: [CH-004, CH-005, RUN-005, AGUI-003]
specs: [../contracts/events.md, ../contracts/ag-ui.md#durable-channel-stream]
adrs: [ADR-002, ADR-006]
touches: [apps/api, packages/db, packages/contracts]
---

# P0-107 — Implement canonical event log and resumable SSE

## Outcome

Every channel mutation appends one ordered normalized event and browser reconnect replays gaps before live delivery.

## Acceptance criteria

- [x] Sequence allocation and event append are one transaction.
- [x] Envelope stores authoritative channel/run/step/turn/actor/thread correlation fields; AG-UI metadata may duplicate but never replace them.
- [x] Persistence supports complete validated events and the server-only `generated_source_ref` form without raw generated source, blob keys or capability URLs in channel JSON.
- [x] Concurrent appends preserve unique monotonic order.
- [x] SSE ID equals channel sequence and honors Last-Event-ID.
- [x] Replay-to-live transition has no gap.
- [x] Server delivers at-least-once envelopes keyed by channel/sequence; browser reducer/deduplication ownership belongs to P0-408.

## Verification

Run concurrency, API restart, source-reference persistence and replay-gap SSE integration tests.

## Completion evidence

- Tests/results: `pnpm --filter @forgeroom/api test` — 43 passed (incl. `event-log.test.ts` concurrency, restart/replay, source-ref guard, SSE replay-gap, postgres unique sequence + `agui_event_records.full_event`); typecheck + lint clean.
- Redacted reconnect trace: SSE `id` = decimal sequence; `Last-Event-ID: 0` replays sequence ≥1 then live-delivers subsequent posts without gap (see `event-log.test.ts`).
- Deferred: multi-process live fan-out (in-process hub by design for P0); unbounded history pagination; CUSTOM payload remains schema-minimal (`{schemaVersion:1}`) — message body lives in `messages` + `sourceMessageId`; richer STATE projections owned by P0-212.
