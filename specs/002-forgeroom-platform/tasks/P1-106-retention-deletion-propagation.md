---
id: P1-106
title: Implement retention, classification and deletion propagation
status: blocked
owner: unassigned
depends_on: [P1-105, P1-203, P1-212, P1-301, P1-303, P1-304, P1-305]
requirements: [PLAT-007, RET-001, RET-002, RET-003, RET-004, RET-005, RET-006, RET-007, RET-008]
specs: [../retention.md, ../security.md, ../data-model.md, ../contracts/events.md]
release_gate: required
---

# P1-106 — Implement retention and deletion propagation

## Outcome

Every shipped content domain uses one policy engine and reverse dependency graph so revoke/delete/classification changes deny immediately and purge predictably.

## Acceptance criteria

- [ ] `standard-1` defaults, workspace overrides, legal holds, classifications, derivation edges and reconciliation jobs use versioned closed contracts.
- [ ] Retention activation and reclassification advance CAS-controlled heads; deletion commands bind authenticated requester, exact resource/policy revision and unique idempotency key.
- [ ] Classification/lifecycle/permission/derivation eligibility changes atomically advance resource security epochs; every download/UI/search/cache/workflow/memory/export capability binds and rechecks its full source-epoch dependency manifest.
- [ ] Tombstone plus permission revision, audit, domain event and propagation work commits atomically.
- [ ] A checked-in root matrix exercises archive/delete/restore-before-purge/restore-after-purge for channels, messages, skills, knowledge sources/collections, memories and records, with exact revision/policy/idempotency binding.
- [ ] Knowledge, search, memory, records, Runs/artifacts/UI, notifications and portable exports register and traverse derivation edges.
- [ ] A missing/lagging edge or failed purge keeps the resource denied and operator-visible; retries are idempotent.
- [ ] Backup/object/index/cache expiry and unavoidable external-provider retention are reported separately from primary deletion.
- [ ] The policy engine exposes authorized export eligibility, classification and derivation manifests consumed by P1-401; it does not own archive assembly/import orchestration.

## Verification

Run every cross-domain revoke/delete/reclassify/legal-hold scenario in `retention.md`, restore stale backups, inject propagation failures and scan exports.

## Evidence

- Policy/migration files:
- Deletion/export matrix:
