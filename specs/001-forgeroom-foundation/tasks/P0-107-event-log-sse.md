---
id: P0-107
title: Implement canonical event log and resumable SSE
status: blocked
owner: unassigned
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

- [ ] Sequence allocation and event append are one transaction.
- [ ] Envelope stores authoritative channel/run/step/turn/actor/thread correlation fields; AG-UI metadata may duplicate but never replace them.
- [ ] Persistence supports complete validated events and the server-only `generated_source_ref` form without raw generated source, blob keys or capability URLs in channel JSON.
- [ ] Concurrent appends preserve unique monotonic order.
- [ ] SSE ID equals channel sequence and honors Last-Event-ID.
- [ ] Replay-to-live transition has no gap.
- [ ] Server delivers at-least-once envelopes keyed by channel/sequence; browser reducer/deduplication ownership belongs to P0-408.

## Verification

Run concurrency, API restart, source-reference persistence and replay-gap SSE integration tests.

## Completion evidence

- Tests/results:
- Redacted reconnect trace:
