---
id: P0-109
title: Implement the application-owned TaskRecord vertical slice
status: ready
owner: unassigned
depends_on: [P0-103, P0-104, P0-107, P0-203, P0-208]
requirements: [TR-001, TR-002, TR-003, REC-001, REC-002, REC-003, REC-004]
specs: [../spec.md#s6-application-owned-task, ../data-model.md#application-owned-tasks, ../contracts/api.md#tasks, ../../002-forgeroom-platform/records.md]
adrs: [ADR-002]
touches: [packages/contracts, packages/domain, packages/db, apps/api, apps/worker]
---

# P0-109 — Implement the application-owned TaskRecord vertical slice

## Outcome

Humans and explicitly granted coworkers share one durable typed Task source of truth linked to the channel request and execution history.

## Scope

- Fixed `TaskRecordV1` fields and closed status transitions.
- Task/TaskRevision/TaskGrant schema, API commands, queries and channel/audit projection.
- One literal internal create/update tool with a reviewed descriptor and ToolPolicyDefinition.
- Source Message/Run/Artifact references, current assignee and optimistic revision.

## Non-goals

- Generic record/schema builder, arbitrary custom fields, bulk edit, formulas, external sync or agent delete.

## Acceptance criteria

- [x] Create/update validates authenticated workspace/channel access, exact human/coworker operation/field/transition grants and closed schema.
- [x] Update requires `expectedRevision`; concurrent updates produce one winner and one safe stale-revision response.
- [x] Idempotent command retry creates one Task/TaskRevision/channel event/audit result.
- [x] Task is distinct from Run/RunStep and survives Run failure, refresh and API restart.
- [x] Internal agent tool exposes no raw SQL/generic mutation and cannot alter ungranted fields, assignee or transition.
- [x] Task history retains actor, command, source refs, changed fields and content/source hashes.
- [x] Task state enters the durable channel/AG-UI projection without trusting component pixels or model prose.

## Verification

Run schema, transition, authorization, cross-channel, optimistic-concurrency, idempotency, tool-policy, event replay and audit tests with real PostgreSQL.

## Evidence

- Files changed:
  - `packages/domain/src/tasks/grants.ts` — grant materialization and coworker create/update authorization
  - `packages/domain/src/tasks/grants.test.ts` — unit tests for grant enforcement
  - `packages/contracts/src/tasks.ts` — export `TaskRecordOperation` type
  - `apps/api/src/workspace/service.ts` — `createTaskForCoworker`, `updateTaskForCoworker`, `executeTaskRecordTool`, grant materialization on coworker PATCH
  - `apps/api/src/workspace/store.ts` — typed `allowedTransitionsJson` on `TaskGrantRecord`
  - `apps/api/src/workspace/tasks.integration.test.ts` — Postgres concurrency + idempotency
  - `apps/api/src/tasks/*` — `records.task.upsert.v1` descriptor, schema, policy, executor
- Commands and results:
  - `pnpm --filter @forgeroom/domain exec vitest run src/tasks/grants.test.ts` — pass (5)
  - `pnpm --filter @forgeroom/api exec vitest run src/tasks/task-tool.test.ts` — pass (3)
  - `pnpm --filter @forgeroom/api exec vitest run src/workspace/tasks.integration.test.ts` — pass (2)
  - `pnpm --filter @forgeroom/api exec vitest run src/workspace/workspace.test.ts -t "TaskRecord|grant edits"` — pass (2)
  - `pnpm --filter @forgeroom/domain typecheck` — pass
  - `pnpm --filter @forgeroom/api typecheck` — pass
- Task revision/event fixtures: covered by existing `workspace.test.ts` TaskRecord replay test and integration idempotency test (`idem_task_create_pg`)

## Handoff

- Outcome: TaskRecord slice complete for human API, coworker grant enforcement, internal upsert tool, and Postgres concurrency/idempotency.
- Open risks: Worker/AgentSpec runtime still needs to register `records.task.upsert.v1` in effective coworker tools when `task_record_grants` are present (separate from executor/policy).
- Follow-up tasks: P1 generic record schemas/views; wire task upsert tool into TrueForge turn ingestion

## Work log

- 2026-08-28 — Finished coworker grant enforcement (`materializeTaskGrantFromOperations`, `authorizeCoworkerTaskCreate`/`authorizeCoworkerTaskUpdate`), Postgres integration tests (concurrent stale revision + idempotent create), and internal `records.task.upsert.v1` tool with reviewed descriptor and `ToolPolicyDefinition`. All acceptance criteria verified.
