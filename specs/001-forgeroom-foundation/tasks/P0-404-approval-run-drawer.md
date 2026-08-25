---
id: P0-404
title: Build approval/question UI and Run drawer
status: blocked
owner: unassigned
depends_on: [P0-307, P0-308, P0-403]
requirements: [AP-003, AP-004, AP-008, AP-011, RUN-004, RUN-007, GUI-010]
specs: [../ux.md#approval-card, ../ux.md#question-card, ../ux.md#run-detail-drawer]
adrs: [ADR-004, ADR-007]
touches: [apps/web, packages/ui]
---

# P0-404 — Build approval/question UI and Run drawer

## Outcome

Owner can safely decide exact proposals, answer questions, stop/correct work and inspect the complete normalized Run.

## Acceptance criteria

- [ ] Approval card displays every required immutable field and fixed account.
- [ ] Approval/question/connection controls are reserved trusted host components and never sourced from an agent-controlled component.
- [ ] A controlled component may request the host open an existing current card but cannot overlay it or submit its decision.
- [ ] Approve, deny and request changes call decision API with expected hashes.
- [ ] UI distinguishes recorded decision, group ready, resume started and execution result.
- [ ] Question warns against credentials and shows group waiting state.
- [ ] Run drawer shows direct routing, persistent coworker steps, events, Tasks, artifacts, decisions and receipt; no child/coordinator lane appears in P0.
- [ ] All actions are keyboard operable.

## Verification

Run component tests for stale/concurrent/expired states and browser decision/question/stop/correction flows.

## Completion evidence

- Tests/results:
- Screenshots:
