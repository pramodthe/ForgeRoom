---
id: P1-101
title: Implement platform domain events, transactional outbox and projections
status: blocked
owner: unassigned
depends_on: [P1-000]
requirements: [PLAT-001, PLAT-002, PLAT-008, PSEC-010]
specs: [../contracts/events.md, ../data-model.md, ../architecture.md]
release_gate: required
---

# P1-101 — Implement domain events, outbox and projections

## Outcome

Every platform mutation emits one versioned, attributable event atomically and consumers can replay without duplicate effects.

## Acceptance criteria

- [ ] `DomainEventV1`, unique monotonic workspace sequence, aggregate revision, causation/correlation, visibility and source references use one shared contract.
- [ ] Every event type has a closed JSON Schema plus safe fixtures, uses the canonical hash profile, and every mutating route/internal command maps to exactly one primary event in a machine-readable registry checked by CI.
- [ ] Mutation and outbox insert commit in one database transaction; dispatcher claims safely across multiple workers.
- [ ] Projectors and notifications are idempotent, cursor-based and rebuildable from retained events.
- [ ] Unknown versions fail visibly without poisoning unrelated aggregates.
- [ ] Trigger-eligible events use explicit allowlists and loop metadata.
- [ ] Sensitive payload classes are rejected before persistence and delivery.

## Verification

Run rollback, concurrent workspace-sequence allocation, duplicate delivery, concurrent dispatcher, projector rebuild, schema-version and redaction tests against PostgreSQL.

## Evidence

- Migrations/contracts:
- Test report:
- Replay trace:
