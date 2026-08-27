---
id: P0-306
title: Persist RequiredActions and PauseGroups
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-103, P0-203, P0-303]
requirements: [AP-002, AP-005, AP-009, AP-013]
specs: [../runtime.md#atomic-pausegroup-resume, ../data-model.md#required-actions-and-approvals]
adrs: [ADR-004]
touches: [packages/orchestration, packages/db]
---

# P0-306 — Persist RequiredActions and PauseGroups

## Outcome

Every required action from one completed persistent-coworker turn is captured exactly once and keeps its RunStep awaiting.

## Acceptance criteria

- [x] One PauseGroup is keyed to paused turn and session generation.
- [x] Every approval/question/supported connection action is uniquely captured.
- [x] ActionProposal stores all immutable binding hashes and adapter-redacted preview data.
- [x] AgentTurn is closed `required_actions`, active slot clears, RunStep stays nonterminal.
- [x] Session accepts no normal turn while group is unresolved.

## Verification

Run duplicate-event, mixed approval/question actions, unexpected-child rejection, restart persistence and nonterminal RunStep integration tests.

## Work log

- 2026-08-27 — Claimed after P0-303. Implemented PauseGroup capture plan (orchestration) and durable persistence (db); claim gate blocks non-response turns while unresolved; unexpected child actions rejected; restart-idempotent capture.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test` — 72 passed (7 PauseGroup unit tests)
  - `pnpm --filter @forgeroom/orchestration typecheck`
  - `pnpm --filter @forgeroom/db test -- pause-group` — 3 PauseGroup integration tests passed (within 41 package tests)
  - `pnpm --filter @forgeroom/db typecheck`
- Redacted group sample: `provider-fixtures/composio/pause-group.verified.json`
