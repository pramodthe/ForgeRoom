---
id: P0-405
title: Build Work, Artifacts and Context tabs
status: ready
owner: unassigned
depends_on: [P0-108, P0-109, P0-312, P0-403]
requirements: [ME-001, ME-003, TR-001, TR-002, SB-004, SB-005]
specs: [../ux.md#work-panel]
adrs: [ADR-002, ADR-005]
touches: [apps/web, packages/ui]
---

# P0-405 — Build Work, Artifacts and Context tabs

## Outcome

The right panel exposes canonical Tasks, active work, durable artifacts and sourced channel context without hidden memory controls.

## Acceptance criteria

- [ ] Work groups queued/active steps by persistent coworker and exposes stop.
- [ ] Tasks view shows canonical status, assignee, revision, source Run/Message and permitted transitions.
- [ ] Artifacts show safe preview, revision, creator/source and authenticated download.
- [ ] Context shows bounded summary and sourced pins.
- [ ] Pin/unpin works from message/artifact and preserves source link.
- [ ] Unsupported/unsafe preview and no-content states are clear.

## Verification

Run tab/component tests, artifact authorization browser test and visual checks.

## Completion evidence

- Tests/results:
- Screenshots:
