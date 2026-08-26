---
id: P0-108
title: Implement bounded channel context and pins
status: in_progress
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-107]
requirements: [ME-001, ME-002, ME-003]
specs: [../runtime.md#channel-context-envelope, ../ux.md#work-panel]
adrs: [ADR-002]
touches: [packages/orchestration, apps/api]
---

# P0-108 — Implement bounded channel context and pins

## Outcome

Each coworker turn receives bounded sourced channel context, and the owner can pin/unpin messages or artifacts.

## Acceptance criteria

- [ ] Context contains mission, roster, assignment, sourced pins, safe artifacts, summary and recent deltas.
- [ ] Per-session delivery cursor advances only after confirmed/reconciled turn creation.
- [ ] Cross-channel state is absent by default.
- [ ] Pin/unpin retains source link and creates channel events.
- [ ] Credentials, reasoning and sandbox-forbidden sensitive data are excluded.

## Verification

Run envelope snapshot, size-bound, cursor, pin API and cross-channel isolation tests.

## Completion evidence

- Tests/results:
- Example redacted envelope:
