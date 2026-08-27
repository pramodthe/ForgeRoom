---
id: P0-310
title: Implement durable artifact storage adapter
status: ready
owner: unassigned
depends_on: [P0-000, P0-103]
requirements: [SB-003, SB-004]
specs: [../data-model.md#artifacts-and-audit, ../demo.md#phase-0-decisions]
adrs: []
touches: [packages/integrations/artifacts, packages/db]
---

# P0-310 — Implement durable artifact storage adapter

## Outcome

Selected storage durably retains content-addressed immutable artifact revisions in development and demo deployment.

## Acceptance criteria

- [ ] Authenticated put/get/download API exists behind adapter.
- [ ] Metadata includes hash, MIME, size, creator, source Run/Step and revision.
- [ ] Publishing identical content is idempotent.
- [ ] Storage key cannot escape workspace/channel namespace.
- [ ] Demo deployment restart does not lose published artifact.

## Verification

Run adapter contract suite, duplicate publish and intended deployment persistence probe.

## Completion evidence

- Tests/results:
- Persistence probe:
