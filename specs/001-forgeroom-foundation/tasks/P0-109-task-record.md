---
id: P0-109
title: Implement the application-owned TaskRecord vertical slice
status: blocked
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

- [ ] Create/update validates authenticated workspace/channel access, exact human/coworker operation/field/transition grants and closed schema.
- [ ] Update requires `expectedRevision`; concurrent updates produce one winner and one safe stale-revision response.
- [ ] Idempotent command retry creates one Task/TaskRevision/channel event/audit result.
- [ ] Task is distinct from Run/RunStep and survives Run failure, refresh and API restart.
- [ ] Internal agent tool exposes no raw SQL/generic mutation and cannot alter ungranted fields, assignee or transition.
- [ ] Task history retains actor, command, source refs, changed fields and content/source hashes.
- [ ] Task state enters the durable channel/AG-UI projection without trusting component pixels or model prose.

## Verification

Run schema, transition, authorization, cross-channel, optimistic-concurrency, idempotency, tool-policy, event replay and audit tests with real PostgreSQL.

## Evidence

- Files changed:
- Commands and results:
- Task revision/event fixtures:

## Handoff

- Outcome:
- Open risks:
- Follow-up tasks: P1 generic record schemas/views
