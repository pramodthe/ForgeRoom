---
id: P0-402
title: Build channel composer and coworker roster
status: blocked
owner: unassigned
depends_on: [P0-106, P0-107, P0-205, P0-401]
requirements: [CH-001, CH-003, CH-009, CH-010, CH-011, AG-006]
specs: [../ux.md#channel-header, ../ux.md#composer-and-recipient-resolution]
adrs: [ADR-001]
touches: [apps/web, packages/ui]
---

# P0-402 — Build channel composer and coworker roster

## Outcome

Owner can manage channel membership and send only after seeing exact recipients and effective tool summaries.

## Acceptance criteria

- [ ] Roster shows name, role, availability and assignment.
- [ ] Add/remove coworker and the New coworker entry point work; coordinator selection is absent in P0.
- [ ] One mention, multiple mentions and `@team` have correct previews.
- [ ] Ambiguous/disabled/rotating recipients block send with clear resolution.
- [ ] No synthesis toggle or recursive-dispatch control appears in P0.
- [ ] Human file attachment is absent from P0.

## Verification

Run component and browser tests for all routing combinations and keyboard composer use.

## Completion evidence

- Tests/results:
- Screenshots:
