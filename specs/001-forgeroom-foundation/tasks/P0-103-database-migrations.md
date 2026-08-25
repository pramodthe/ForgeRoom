---
id: P0-103
title: Implement database schema and migrations
status: blocked
owner: unassigned
depends_on: [P0-102]
requirements: [CH-004, AG-010, TR-001, SK-001, AGUI-002, GUI-004, GUI-011, AP-007, AP-013, AU-002]
specs: [../data-model.md]
adrs: [ADR-002, ADR-004]
touches: [packages/db]
---

# P0-103 — Implement database schema and migrations

## Outcome

An empty PostgreSQL database migrates to the complete P0 schema with concurrency-critical constraints enforced by the database.

## Acceptance criteria

- [ ] Every required P0 entity and relation is migrated.
- [ ] Channel sequence, CoworkerDraft, Task/TaskRevision/TaskGrant, Skill/SkillVersion/SkillBinding, stable logical session/thread, immutable session-generation history/current pointer, remote-active turn, UIComponentInterrupt, PauseGroup, RequiredAction, PauseResume and decision uniqueness constraints exist.
- [ ] Component/version/grant, independent UI render/state revision, controlled renderer/validated-props/data/state hashes, interaction-token/idempotency and atomic grant-use constraints exist.
- [ ] P0 migrations contain no iframe classification/source/body/bootstrap/CSP/verifier/delivery-capability fields or generated-origin tables; the separately gated P1 migration adds them if implemented.
- [ ] UI interaction constraints distinguish render-node identity from component-version identity and enforce the P0 `prepared → token_issued → terminal` combinations; trusted-confirmation columns/states are absent.
- [ ] Append-only audit writes have no update/delete application path.
- [ ] Forward migration and clean rollback strategy are documented.
- [ ] Constraint tests fail the intended duplicate/concurrent writes.

## Verification

Run migrations against an empty database and integration tests for every named invariant.

## Completion evidence

- Migration files:
- Constraint tests/results:
