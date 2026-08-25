---
id: P0-306
title: Persist RequiredActions and PauseGroups
status: blocked
owner: unassigned
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

- [ ] One PauseGroup is keyed to paused turn and session generation.
- [ ] Every approval/question/supported connection action is uniquely captured.
- [ ] ActionProposal stores all immutable binding hashes and adapter-redacted preview data.
- [ ] AgentTurn is closed `required_actions`, active slot clears, RunStep stays nonterminal.
- [ ] Session accepts no normal turn while group is unresolved.

## Verification

Run duplicate-event, mixed approval/question actions, unexpected-child rejection, restart persistence and nonterminal RunStep integration tests.

## Completion evidence

- Tests/results:
- Redacted group sample:
