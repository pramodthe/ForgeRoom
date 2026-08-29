---
id: P0-204
title: Implement reconnect, stop and correction
status: in_review
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-203]
requirements: [RUN-004, RUN-007, RUN-009]
specs: [../runtime.md#turn-creation-and-crash-reconciliation, ../runtime.md#stop-and-correction]
adrs: [ADR-001]
touches: [packages/orchestration, apps/worker, apps/api]
---

# P0-204 — Implement reconnect, stop and correction

## Outcome

Browser stream reconnects safely, explicit Stop has truthful cancelling semantics, and corrections become new visible queued continuations.

## Acceptance criteria

- [x] Browser refresh resumes without duplicate normalized events.
- [x] Stop calls cancellation once and blocks new remote turn until settled.
- [x] In-flight MCP completion or unknown outcome is rendered honestly.
- [x] Normal message never implicitly stops work.
- [x] Correction links to prior step and queues separately.
- [x] Process restart marks uncertain active work needs-attention without automatic retry.
- [ ] OD-008 run, token, tool-call and sandbox watchdog values are accepted and covered by application-level tests without claiming unavailable hard provider enforcement.

## Verification

Run reconnect, cancellation race, correction ordering and fail-closed restart tests.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test` (stop-correction unit)
  - `pnpm --filter @forgeroom/db test -- run-control`
  - Existing SSE Last-Event-ID replay coverage in `apps/api` event-log tests + `dedupeReplayEnvelopes`
- UI/API trace:
  - `POST /api/runs/:runId/cancel` enters cancelling and calls TF cancel at most once
  - `POST /api/runs/:runId/steer` enqueues `correction` linked via `prior_run_step_id`
- Worker startup with `DATABASE_URL` marks active turns `needs_attention` without auto-retry
- Open review item: OD-008 remains candidate-only; watchdog enforcement/evidence is not complete.

## Work log

- 2026-08-26 — Claimed after P0-203 merge (#25). Stop/correction helpers, TF session cancel, DB run-control, claim blocked while cancelling, API cancel/steer, worker restart sweep.
