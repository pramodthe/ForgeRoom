---
id: P0-202
title: Implement per-session serial turn queue
status: blocked
owner: unassigned
depends_on: [P0-103, P0-201]
requirements: [RUN-002, RUN-003]
specs: [../runtime.md#serial-turn-queue, ../data-model.md#sessions-runs-and-queue]
adrs: [ADR-001]
touches: [packages/orchestration, packages/db, apps/worker]
---

# P0-202 — Implement per-session serial turn queue

## Outcome

Normal turns serialize per channel-coworker session through short claims and leases without holding a database transaction during provider work.

## Acceptance criteria

- [ ] Normal messages preserve FIFO order.
- [ ] Required-action responses outrank later normal items.
- [ ] Exact-generation component_interaction_response items outrank later normal items but not PauseGroup responses and never rebind across rotation.
- [ ] Claim transaction records lease and commits before network calls.
- [ ] Heartbeat and expired-lease handling are deterministic and fail closed.
- [ ] Database prevents two remote-active AgentTurns in one session.
- [ ] A second normal message never starts a cancelling turn.

## Verification

Run database concurrency tests and a two-message TrueForge integration test.

## Completion evidence

- Tests/results:
- Queue trace:
