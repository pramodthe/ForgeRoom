---
id: P0-106
title: Implement channel and coworker API
status: blocked
owner: unassigned
depends_on: [P0-103, P0-104]
requirements: [CH-001, CH-002, CH-010, AG-007, AG-008]
specs: [../contracts/api.md#channels-and-events, ../contracts/api.md#coworkers]
adrs: [ADR-002]
touches: [apps/api, packages/domain, packages/db]
---

# P0-106 — Implement channel and coworker API

## Outcome

Authenticated owner can manage channels, existing coworkers and membership through authorized commands; new coworkers enter only through the reviewed CoworkerDraft flow.

## Acceptance criteria

- [ ] Channel create/list/open/rename/archive work.
- [ ] Existing coworker list/get/edit/disable work; the direct coworker-create endpoint is absent and P0-213 is the only creation path.
- [ ] Add/remove coworker validates workspace/channel membership; no coordinator field is accepted by P0 commands.
- [ ] Removing one coworker does not alter another's grants.
- [ ] Archive blocks new messages and participant edits.

## Verification

Run contract, authorization, validation and database integration tests for every endpoint and failure state.

## Completion evidence

- Endpoint tests/results:
