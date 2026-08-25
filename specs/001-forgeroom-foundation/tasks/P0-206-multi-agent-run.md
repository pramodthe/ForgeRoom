---
id: P0-206
title: Implement direct multi-agent Run engine
status: blocked
owner: unassigned
depends_on: [P0-202, P0-203, P0-205]
requirements: [OR-001, OR-005, OR-007, RUN-001, RUN-006]
specs: [../runtime.md#routing, ../data-model.md#state-machines]
adrs: [ADR-001, ADR-002]
touches: [packages/orchestration, apps/worker]
---

# P0-206 — Implement direct multi-agent Run engine

## Outcome

One human message atomically creates a Run whose distinct coworker steps can execute concurrently while same-session steps stay serialized.

## Acceptance criteria

- [ ] Message, Run, direct RunSteps and initial channel events persist atomically.
- [ ] One channel-owned human `sourceMessageId` persists/projects once; each coworker RunAgentInput references it without emitting a duplicate human transcript message.
- [ ] Different session steps start concurrently and remain attributed.
- [ ] Same-session work uses queue order.
- [ ] Run returns base lifecycle plus simultaneous activity counters.
- [ ] Partial, failed, cancelled and unknown coworker-step outcomes aggregate truthfully without a synthesis step.
- [ ] P0 never recursively dispatches persistent coworkers or native subagents.

## Verification

Run transaction rollback, two-session concurrency, same-session serialization and aggregate-state tests.

## Completion evidence

- Tests/results:
- Concurrent trace:
