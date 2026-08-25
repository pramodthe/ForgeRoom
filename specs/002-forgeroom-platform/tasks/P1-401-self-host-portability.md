---
id: P1-401
title: Deliver supported single-node self-hosting and data portability
status: blocked
owner: unassigned
depends_on: [P1-000, P1-103, P1-104, P1-105, P1-106, P1-107, P1-203, P1-212, P1-301, P1-303, P1-304, P1-305]
requirements: [OSS-002, OSS-004, OSS-005, OSS-006, OSS-007, OSS-010, RET-006, PLAT-007, PLAT-008]
specs: [../open-source.md, ../architecture.md, ../data-model.md]
release_gate: required
---

# P1-401 — Deliver self-hosting and portability

## Outcome

A clean machine can install, configure, back up, restore, upgrade and export the complete open-source alpha without a proprietary ForgeRoom hosted dependency.

## Acceptance criteria

- [ ] Versioned Docker Compose profile documents CPU/RAM/storage/TLS/domain/email/auth prerequisites and health checks.
- [ ] Secrets use environment/secret-file indirection, never images, logs, exports or browser bundles.
- [ ] Backup captures database, object data, indexes/rebuild metadata and configuration manifest at a consistent boundary.
- [ ] Restore verifies hashes, migrations, counts, sampled reads/citations/artifacts and service health.
- [ ] The 0.2 portable snapshot/import covers every shipped alpha domain, stable IDs/revisions/grants/provenance and safe connection metadata; import stages inert data, shows a revision-bound permission/identity/conflict/automation impact preview, and requires a separate authorized idempotent commit while connections stay unbound and workflows/triggers stay disabled.
- [ ] Upgrade from the immediately previous release has a tested forward-fix/rollback procedure and no silent destructive migration.
- [ ] LICENSE, NOTICE, dependency license report and operator documentation are present.
- [ ] CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, architecture, setup, testing, migration, release, support and governance documents are linked, versioned and usable from a clean clone.
- [ ] Security documentation names a private reporting channel, acknowledgement target, supported-version/coordinated-disclosure policy and signed-advisory verification path.

## Verification

Run install, restart, backup, destroy-test-environment, restore, export/stage/preview/commit/cancel import (including stale preview and privilege-broadening rejection) and previous-release upgrade in clean CI VMs.

## Evidence

- Install/upgrade commands:
- Restore report:
- License report:
- Documentation/security-policy smoke report:
