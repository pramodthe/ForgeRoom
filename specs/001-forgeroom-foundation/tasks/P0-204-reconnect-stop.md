---
id: P0-204
title: Implement reconnect, stop and correction
status: blocked
owner: unassigned
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

- [ ] Browser refresh resumes without duplicate normalized events.
- [ ] Stop calls cancellation once and blocks new remote turn until settled.
- [ ] In-flight MCP completion or unknown outcome is rendered honestly.
- [ ] Normal message never implicitly stops work.
- [ ] Correction links to prior step and queues separately.
- [ ] Process restart marks uncertain active work needs-attention without automatic retry.

## Verification

Run reconnect, cancellation race, correction ordering and fail-closed restart tests.

## Completion evidence

- Tests/results:
- UI/API trace:
