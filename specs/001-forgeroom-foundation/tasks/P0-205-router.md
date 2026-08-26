---
id: P0-205
title: Implement mention and team router
status: ready
owner: unassigned
depends_on: [P0-102, P0-106]
requirements: [CH-003, CH-011, OR-002, OR-004]
specs: [../runtime.md#routing, ../ux.md#composer-and-recipient-resolution]
adrs: [ADR-001]
touches: [packages/orchestration, packages/contracts]
---

# P0-205 — Implement mention and team router

## Outcome

One mention, multiple mentions, `@team` and no-mention messages resolve to deterministic authorized recipients.

## Acceptance criteria

- [ ] One and multiple explicit mentions produce direct routing.
- [ ] `@team` directly fans out only to one/two enabled coworkers.
- [ ] Multi-coworker no-mention requires an explicit recipient; coordinator planning is unavailable in P0.
- [ ] Unknown, disabled, non-member and ambiguous targets are rejected.
- [ ] Fan-out never exceeds two P0 coworkers.
- [ ] Server reparses recipients rather than trusting client array.

## Verification

Run table-driven router tests for every valid and invalid combination.

## Completion evidence

- Test matrix/results:
