---
id: P0-106
title: Implement channel and coworker API
status: in_review
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-103, P0-104]
requirements: [CH-001, CH-002, CH-010, AG-007, AG-008]
specs: [../contracts/api.md#channels-and-events, ../contracts/api.md#coworkers]
adrs: [ADR-002]
touches: [apps/api, packages/domain, packages/db]
---

# P0-106 — Implement channel and coworker API

## Outcome

Authenticated owner can manage channels, existing coworkers and membership through authorized commands; new coworkers enter only through the reviewed CoworkerDraft flow.

## Work log

- Intended outcome: authenticated channel CRUD + participant add/remove + coworker list/get/edit/disable with P0-104 session/CSRF/Origin guards.
- Expected change surface: `apps/api` channel/coworker routes, service, memory + postgres stores; contract type exports; tests; task status files.
- Requirements: CH-001, CH-002, CH-010, AG-007, AG-008.
- Non-goals: CoworkerDraft create/confirm (P0-213), event SSE (P0-107), pins (P0-108), turn dispatch / session rotation (P0-208), coordinator fields, direct coworker-create endpoint.
- Verification: contract/auth/validation unit tests plus database integration coverage for endpoints and failure states.

## Acceptance criteria

- [x] Channel create/list/open/rename/archive work.
- [x] Existing coworker list/get/edit/disable work; the direct coworker-create endpoint is absent and P0-213 is the only creation path.
- [x] Add/remove coworker validates workspace/channel membership; no coordinator field is accepted by P0 commands.
- [x] Removing one coworker does not alter another's grants.
- [x] Archive blocks new messages and participant edits.

## Verification

Run contract, authorization, validation and database integration tests for every endpoint and failure state.

## Completion evidence

- Files changed: `apps/api/src/workspace/*`, `apps/api/src/http-guards.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`, `packages/contracts` type exports, `packages/db/package.json` test-harness export, task/STATUS index.
- Commands: `pnpm --filter @forgeroom/api typecheck` (pass); `pnpm --filter @forgeroom/api test` (38 pass, including 22 workspace tests and postgres integration); `pnpm --filter @forgeroom/contracts typecheck` (pass).
- Qodo pre-PR review: fixed atomic channel+owner create, row-locked message sequence allocation, and claim-first idempotency receipts.
- Endpoint tests: `src/workspace/workspace.test.ts` covers channel CRUD, coworker list/get/edit/disable, absent create (404), coordinator rejection, grant isolation, archive blocks, CSRF/unauth, cross-workspace forbid, and migrated-postgres persistence.
- Known limitations: capability-affecting coworker updates return empty `session_rotations` / `stale_proposal_ids` until P0-208; tool grants are stored on coworker editable config (connector-bound `tool_grants` rows remain later tasks); message POST persists channel event/message only (no turn dispatch).

## Handoff

```text
Task: P0-106
Outcome: Authenticated channel and coworker HTTP APIs with P0-104 guards, archive/membership rules, and no direct coworker create.
Requirements: CH-001, CH-002, CH-010, AG-007, AG-008
Changed: apps/api workspace routes/service/stores, contracts type exports, db test-harness export, task status
Verified: pnpm --filter @forgeroom/api typecheck && pnpm --filter @forgeroom/api test
Evidence: apps/api/src/workspace/workspace.test.ts (22 workspace API tests green; 38 total API package tests)
Open risks: session rotation / connector tool grant materialization deferred to later P0 tasks
Next unblocked tasks: P0-107 (event log/SSE), P0-205 (depends on P0-106), P0-213 still blocked on P0-208
```
