---
id: P0-202
title: Implement per-session serial turn queue
status: in_progress
owner: cursor-agent
started: 2026-08-26
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

- [x] Normal messages preserve FIFO order.
- [x] Required-action responses outrank later normal items.
- [x] Exact-generation component_interaction_response items outrank later normal items but not PauseGroup responses and never rebind across rotation.
- [x] Claim transaction records lease and commits before network calls.
- [x] Heartbeat and expired-lease handling are deterministic and fail closed.
- [x] Database prevents two remote-active AgentTurns in one session.
- [x] A second normal message never starts a cancelling turn.

## Verification

Run database concurrency tests and a two-message TrueForge integration test.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test` (priority/FIFO/eligibility unit tests)
  - `pnpm --filter @forgeroom/db test -- turn-queue` (enqueue/claim/lease/concurrency)
  - `pnpm --filter @forgeroom/worker test` (claim_queue_item dispatch)
- Queue trace:
  - Concurrent claim of two queued normals → exactly one `acquiring` AgentTurn; loser `session_busy` or `not_next`
  - Pause response claimed ahead of earlier normals; component response rejected after generation rotation (`stale_generation`)
  - Claim rejects non-head items with `not_next`; concurrent enqueues get distinct FIFO via session row lock
  - Expired lease reclaim cancels only `acquiring` turns; streaming reclaim fails closed
  - Worker runs `executeCommand` only after a successful claim

## Work log

- 2026-08-26 — Claimed after P0-201 merge (#23). Added orchestration priority helpers, db enqueue/claim/heartbeat/reclaim, worker `claim_queue_item` handler. Qodo pre-PR fixes: session lock on enqueue, head-of-queue claim check, claim-before-executor, retryable reclaim path. TrueForge two-message createTurn integration deferred to P0-203.
