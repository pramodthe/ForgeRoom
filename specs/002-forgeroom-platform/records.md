# Structured business records specification

## Purpose

Records give humans and coworkers an application-owned source of truth for work that should not live only in messages or external tools. GenUI visualizes records; it is never the record database.

## P0 Task record

Release 0.1 ships one fixed `TaskRecordV1`:

```ts
type TaskRecordV1 = {
  id: string;
  workspaceId: string;
  channelId: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "blocked" | "in_review" | "done" | "cancelled";
  assignee: { kind: "human" | "coworker"; id: string } | null;
  sourceMessageId?: string;
  sourceRunId?: string;
  sourceArtifactIds: string[];
  dueAt?: string;
  revision: number;
};
```

A channel request may create one Task record before execution. RunSteps update work projection, but a Run/RunStep is execution history and is not the Task itself. Task mutation occurs through an application command/tool with exact channel and coworker grants.

## General record system

Release 0.2 adds:

| Object | Purpose |
| --- | --- |
| `RecordType` | Stable identity, owner, visibility, current schema version |
| `RecordSchemaVersion` | Immutable JSON-compatible field/relation/validation/index/display definition |
| `Record` | Stable typed object and current revision pointer |
| `RecordRevision` | Immutable validated values, actor, source, command, and change set |
| `RecordRelation` | Typed, authorized link to another record/artifact/source/run |
| `RecordView` | Saved table/board/detail/chart query and column/filter configuration |
| `RecordGrant` | Human/coworker/channel/workflow create/read/update/transition permission |

Initial built-in types may include Task, Decision, Project, Customer, Lead, Campaign, Issue, and Experiment. They are packages over the same record system, not hardcoded orchestration classes.

## Lifecycle and failure behavior

```text
RecordType: draft → active → archived → active
                         ↘ deleted
SchemaVersion: draft → validating → published → deprecated
Record: active → archived → active
        active|archived → deleted → active (restore before purge)
RecordView: active → archived → active | deleted
Import/Export: queued → validating → running → completed | failed | cancelled
```

- Archive removes an object from default active views but preserves authorized direct/history access and is freely restorable under current policy.
- Delete commits a tombstone and immediate discovery/use denial, starts `RET-002` propagation, and is restorable only before physical purge and only when current policy/source constraints permit. Purged content cannot be restored.
- A published schema is immutable. Deprecation blocks new type/version use according to policy but never rewrites records already pinned to it.
- Type delete is blocked while live records/views/workflows still depend on it unless a reviewed migration/archive plan resolves them.
- Validation, permission, stale revision, migration, import-row, budget and storage failures are typed and retain safe evidence; partial bulk/import behavior must be selected explicitly and never presented as atomic success.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| REC-001 | `TaskRecord` is an application-owned typed source of truth distinct from Message, Run, RunStep, artifact, and external provider records. | 0.1 |
| REC-002 | Task create/update validates channel membership, exact coworker capability, optimistic revision, transition rules, idempotency, provenance, and audit. | 0.1 |
| REC-003 | A reviewed internal app tool lets a granted coworker create/update only the exact Task fields/transitions it is allowed to change. | 0.1 |
| REC-004 | Task history, source message/run/artifact, current assignee, status, and revision are visible and replay after refresh. | 0.1 |
| REC-005 | Record types have immutable versioned schemas with stable field IDs, validation, relations, display metadata, indexes, and migration policy. | 0.2 |
| REC-006 | Every record revision records actor, coworker/workflow/run lineage where applicable, command, timestamp, source links, and field-level diff. | 0.2 |
| REC-007 | Human UI and agent tools call the same command layer; direct model-generated database writes are impossible. | 0.2 |
| REC-008 | Views support authorized filter/sort/group/table/board/detail/chart projections without changing source data. | 0.2 |
| REC-009 | Field-, record-, type-, channel-, and workspace-level permissions fail closed and are rechecked at query and mutation time. | 0.2 |
| REC-010 | Schema change classifies additive, backfill, breaking, and destructive changes and requires a validated migration/rollback plan. | 0.2 |
| REC-011 | Workflows pin schema/version assumptions and stop with a typed incompatibility instead of guessing after schema drift. | 0.3 |
| REC-012 | Import/export preserves stable IDs, schema versions, relations, provenance, history, attachments, and integrity hashes. | 1.0 |
| REC-013 | Alpha CSV import provides a revision-bound mapping/error/permission preview and explicit atomic or per-row commit; CSV export is field-authorized and snapshot/hash bound. | 0.2 |

## Commands and generated tools

Each published record schema may expose literal application-owned commands such as:

- `records.task.create.v1`
- `records.task.update_status.v1`
- `records.customer.add_note.v2`

The server compiles tool schemas from a reviewed schema version and a narrower `RecordGrant`. The tool name, fields, allowed transitions, record query/ID scope, and effect are literal. There is no generic arbitrary-table SQL tool.

Updates require `expectedRevision`; conflicts return the current safe projection and never auto-merge consequential fields. Bulk commands state maximum rows, partial/atomic semantics, idempotency, and audit behavior.

## Provenance and external sync

- A record can cite messages, knowledge chunks, artifacts, external object IDs, approvals, and verified provider receipts.
- External system values are snapshots with connector/account/tool/fetched-at/freshness metadata, not silently treated as current.
- Bidirectional sync is a workflow/connector concern. Conflicts are explicit and do not overwrite application data solely because a model says the provider is newer.
- Deleting a source does not fabricate provenance; the link becomes unavailable/tombstoned according to retention policy.

## GenUI behavior

Controlled table, board, detail, timeline, and chart components query records through authorized data functions. An interaction emits a typed command proposal. A visual filter changes view state only. A record mutation remains subject to command authorization and approval policy even if a button is visible.

## Acceptance scenarios

- Sending a team task creates one Task, two RunSteps, and one shared source link; duplicate request delivery does not create a second Task.
- Two actors update the same revision; one succeeds and one receives an explicit conflict with no lost update.
- A coworker granted status transitions but not title changes cannot update the title through tool arguments or a GenUI interaction.
- A chart refresh queries the authoritative records and exposes view/query freshness; its cached UI state is not treated as the records.
- A breaking schema migration cannot publish until fixtures, workflow compatibility, export/import, and rollback/forward-fix tests pass.
- Archive, restore, delete-before-purge and delete-after-purge follow the closed state machine with distinct events and no stale search/result visibility.
