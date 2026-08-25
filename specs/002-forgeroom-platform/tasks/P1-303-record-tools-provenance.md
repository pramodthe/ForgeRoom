---
id: P1-303
title: Implement governed record tools, provenance and import/export
status: blocked
owner: unassigned
depends_on: [P1-202, P1-302]
requirements: [PLAT-004, REC-006, REC-007, REC-008, REC-009, REC-010, REC-013]
specs: [../records.md, ../contracts/api.md, ../architecture.md]
release_gate: required
---

# P1-303 — Implement record tools and provenance

## Outcome

Humans and coworkers use narrow schema-derived record tools whose effects, evidence and external relationships are inspectable.

## Acceptance criteria

- [ ] Generated internal tools are schema-versioned, operation-specific and never expose generic SQL or unbounded mutation.
- [ ] Tool calls reauthorize workspace/channel/coworker/row/field/transition at execution and bind expected revision/idempotency.
- [ ] Record provenance links source messages, Runs, artifacts, knowledge citations, imports and external references.
- [ ] CSV import preview binds source/mapping hash, destination schema and permission revision; commit is revision/idempotency bound and atomic or reports immutable per-row outcomes; export respects current field permissions and a snapshot/hash manifest.
- [ ] Optional external sync is reference-only in alpha unless an adapter has an explicit conflict/source-of-truth policy.
- [ ] Controlled table/chart/filter UI reads canonical record revisions and writes only through authorized commands.
- [ ] A record command requiring approval creates one generalized `record_command` ActionProposal bound to exact record/schema/current revision/payload hash/policy; decision executes through the record command handler and never TrueForge/provider resume.

## Verification

Run descriptor drift, injection, bulk limits, stale revisions, imports, exports, provenance and GenUI interaction tests.

## Evidence

- Tool descriptors:
- Test report:
- Import/provenance fixtures:
