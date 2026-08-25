---
id: P0-403
title: Build live Run and activity cards
status: blocked
owner: unassigned
depends_on: [P0-109, P0-203, P0-206, P0-401]
requirements: [CH-006, RUN-005, RUN-006, TR-002, AGUI-004]
specs: [../ux.md#timeline-content, ../contracts/events.md]
adrs: [ADR-001, ADR-002]
touches: [apps/web, packages/ui]
---

# P0-403 — Build live Run and activity cards

## Outcome

Normalized AG-UI events render readable attributed coworker, Task, tool, sandbox and result activity without raw logs.

## Acceptance criteria

- [ ] Human and persistent coworker identities are stable and clear.
- [ ] Task creation/update, assignment, tool, sandbox, artifact, blocked, cancellation, error, partial and receipt cards exist.
- [ ] Native-child/coordinator events are inert unsupported-capability activities in P0.
- [ ] Registered `ACTIVITY_SNAPSHOT/DELTA` types render from schemas; unknown activities are inert.
- [ ] Run shows base lifecycle and simultaneous activity counters.
- [ ] Token deltas do not cause layout jumps.
- [ ] Raw JSON/reasoning/credentials never render.

## Verification

Run event fixture component tests and required-state visual screenshots. Browser reducer mounting/reconnect evidence belongs to P0-408.

## Completion evidence

- Tests/results:
- Screenshots:
