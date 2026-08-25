---
id: P1-302
title: Implement typed record schemas, records, revisions and views
status: blocked
owner: unassigned
depends_on: [P0-505, P1-000, P1-101, P1-102]
requirements: [REC-001, REC-002, REC-003, REC-004, REC-005, REC-006, REC-007, REC-008]
specs: [../records.md, ../data-model.md, ../contracts/api.md]
release_gate: required
---

# P1-302 — Implement typed records

## Outcome

Workspaces can define governed business record schemas and use validated, revisioned records as application-owned sources of truth.

## Acceptance criteria

- [ ] Closed field kinds, validation, required/default/index/display metadata and compatibility classes are versioned.
- [ ] Record create/update/transition/archive require schema version, expected revision and field/operation grants.
- [ ] Schema changes classify compatible, backfill-required and breaking cases; unsupported changes fail before mutation.
- [ ] RecordRevision retains actor, source references, changed fields, hashes and validation result.
- [ ] Views use authorized filter/sort/group/display definitions and realtime projection without becoming source of truth.
- [ ] Row/field permissions and cross-channel/workspace isolation hold for API, export, SSE and internal tools.

## Verification

Run schema compatibility, validation, optimistic concurrency, row/field authorization, view replay and migration tests on PostgreSQL.

## Evidence

- Schema fixtures:
- Migration/test report:
- View projection trace:
