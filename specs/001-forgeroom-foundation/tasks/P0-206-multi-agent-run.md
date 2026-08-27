---
id: P0-206
title: Implement direct multi-agent Run engine
status: done
owner: cursor-agent
started: 2026-08-26
completed: 2026-08-26
depends_on: [P0-202, P0-203, P0-205]
requirements: [OR-001, OR-005, OR-007, RUN-001, RUN-006]
specs: [../runtime.md#routing, ../data-model.md#state-machines]
adrs: [ADR-001, ADR-002]
touches: [packages/orchestration, packages/db, apps/worker, apps/api]
---

# P0-206 — Implement direct multi-agent Run engine

## Outcome

One human message atomically creates a Run whose distinct coworker steps can execute concurrently while same-session steps stay serialized.

## Acceptance criteria

- [x] Message, Run, direct RunSteps and initial channel events persist atomically.
- [x] One channel-owned human `sourceMessageId` persists/projects once; each coworker RunAgentInput references it without emitting a duplicate human transcript message.
- [x] Different session steps start concurrently and remain attributed.
- [x] Same-session work uses queue order.
- [x] Run returns base lifecycle plus simultaneous activity counters.
- [x] Partial, failed, cancelled and unknown coworker-step outcomes aggregate truthfully without a synthesis step.
- [x] P0 never recursively dispatches persistent coworkers or native subagents.

## Verification

Run transaction rollback, two-session concurrency, same-session serialization and aggregate-state tests.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test` (plan/aggregate/sourceMessageId)
  - `pnpm --filter @forgeroom/db test -- multi-agent-run` (atomic create, rollback, concurrency, aggregate refresh)
  - worker ingest refreshes Run lifecycle after terminal step outcomes
- Concurrent trace:
  - Two-session fan-out claims succeed in parallel; same-session follow-up stays FIFO and `session_busy` while first is active
  - Mixed completed+failed → lifecycle `partial` with zero active counters

## Work log

- 2026-08-26 — Claimed after P0-204 merge (#26). Added orchestration plan/aggregate helpers, db `createDirectMultiAgentRun` + lifecycle refresh, API postMessage wiring when SQL is available, worker ingest refresh.
