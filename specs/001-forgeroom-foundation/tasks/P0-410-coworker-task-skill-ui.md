---
id: P0-410
title: Build coworker creation, Task and Save-as-skill review UI
status: blocked
owner: unassigned
depends_on: [P0-109, P0-213, P0-318, P0-402, P0-406]
requirements: [AG-010, AG-011, AG-012, CW-001, CW-002, CW-003, CW-004, CW-005, CW-006, CW-007, TR-001, TR-002, REC-001, REC-002, REC-003, REC-004, SK-001, SK-002, SK-003, SK-004, SK-005]
specs: [../ux.md#conversational-creation, ../ux.md#work-panel, ../ux.md#save-as-skill, ../../002-forgeroom-platform/ux.md]
adrs: [ADR-001, ADR-002, ADR-003]
touches: [apps/web, packages/ui]
---

# P0-410 — Build coworker creation, Task and Save-as-skill review UI

## Outcome

The 0.1 product exposes trusted, polished user flows for creating a coworker, managing the fixed Task and saving successful work as a skill.

## Acceptance criteria

- [ ] New coworker builder shows conversational input, gathering/draft/stale/confirming/provisioning/ready/failure states and never renders model text as trusted confirmation.
- [ ] Permission review clearly shows exact account/tools/skills/components/channels, TaskRecord scope/grants, read/write/destructive effects, approvals, budgets/data flow and denial reasons—including unsupported knowledge/memory/workflow/native-child requests—before a revision-bound Create action.
- [ ] TaskCard/list/detail shows canonical status, assignee, channel, source Run/Message, revision, history and only authorized transitions; conflict preserves user input and shows latest revision.
- [ ] Completed Run exposes Save as skill; review shows method, inputs, required tools/components/data, output, validation, failures, approvals, source and package diff before publish/attach.
- [ ] Loading, empty, stale, denied, conflict, provisioning, blocked-capability, partial and failed states are explicit and contain no raw JSON/secrets/reasoning.
- [ ] Flows are keyboard accessible, labelled, focus-safe, responsive at the P0 viewport and pass axe/visual review.
- [ ] Refresh during CoworkerDraft review, Task update or SkillDraft review restores the exact server revision without duplicate mutation.

## Verification

Run browser component/API fixtures, keyboard/axe checks, 1440 px visual snapshots, stale/concurrent state tests and the full P0 creation→Task→skill E2E path.

## Evidence

- Files changed:
- Commands and results:
- Screenshots:
- Accessibility report:

## Handoff

- Outcome:
- Open risks:
- Follow-up tasks:

## Work log

- 2026-08-27 — PR #36 added a fixture-driven parallel frontend prototype for the coworker, Task and Save-as-skill review surfaces. This is visual and interaction progress only: the task remains blocked and unchecked until the server-backed revisions, authorized mutations, refresh recovery and complete P0 E2E evidence satisfy the acceptance criteria above.
