---
id: P3-102
title: Implement hosted multi-tenancy, quotas and billing boundaries
status: blocked
owner: unassigned
depends_on: [P3-000, P3-101]
requirements: [PLAT-003, PLAT-006, PLAT-009, PSEC-001, PSEC-002, PSEC-003, PSEC-005]
specs: [../architecture.md, ../security.md, ../data-model.md]
release_gate: required
---

# P3-102 — Implement hosted multi-tenancy

## Outcome

The hosted service isolates tenants, meters bounded resources and enforces quotas/billing without changing open-core data ownership or authority semantics.

## Acceptance criteria

- [ ] Tenant routing, encryption/key hierarchy, database/object/search/cache/log isolation match the approved topology.
- [ ] Quotas cover storage, ingestion, concurrency, provider use, schedules, notifications and extension execution with visible denial/recovery.
- [ ] Metering is idempotent, auditable and excludes content; billing failures cannot silently expand or corrupt authority.
- [ ] Region/residency and deletion/export behavior are documented and testable.
- [ ] Hosted operators cannot impersonate user approval; break-glass access is minimal, time-bound and audited.
- [ ] Self-host export remains complete and does not require hosted entitlement checks.

## Verification

Run cross-tenant attacks, quota races, metering replay, key/region, operator-access, deletion and export tests under load.

## Evidence

- Isolation report:
- Quota/metering tests:
