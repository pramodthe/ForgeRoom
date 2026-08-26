---
id: P0-205
title: Implement mention and team router
status: in_review
owner: cursor-agent
completed: 2026-08-26
started: 2026-08-26
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

- [x] One and multiple explicit mentions produce direct routing.
- [x] `@team` directly fans out only to one/two enabled coworkers.
- [x] Multi-coworker no-mention requires an explicit recipient; coordinator planning is unavailable in P0.
- [x] Unknown, disabled, non-member and ambiguous targets are rejected.
- [x] Fan-out never exceeds two P0 coworkers.
- [x] Server reparses recipients rather than trusting client array.

## Verification

Run table-driven router tests for every valid and invalid combination.

## Completion evidence

- Merged to main via PR #11 (merge commit `fe36cd1`).
- Test matrix/results: orchestration router matrix + API tests green. `packages/orchestration` router table (22 cases) + contracts routing tests + API channel message routing integration; all green after typecheck/lint.
