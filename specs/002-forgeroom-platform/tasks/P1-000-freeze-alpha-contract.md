---
id: P1-000
title: Freeze the 0.2 private-alpha product and dependency contract
status: blocked
owner: unassigned
depends_on: [P0-505]
requirements: [PLAT-001, PLAT-006, OSS-001, PSEC-001]
specs: [../roadmap.md, ../decisions/OPEN.md, ../architecture.md]
release_gate: required
---

# P1-000 — Freeze the 0.2 private-alpha contract

## Outcome

Every P1 implementation-changing decision has a recorded default, supported deployment profile, test fixture and accountable owner.

## Acceptance criteria

- [ ] PD-003 through PD-007 and PD-013 are closed by ADRs or explicitly deferred with a safe alpha default; PD-002 was already required before the public 0.1 release.
- [ ] Supported auth, object storage, search, file parser/scanner, notification and record-schema profiles are version-pinned.
- [ ] Five design-partner workspaces, synthetic test corpora and non-production provider accounts are identified without storing credentials in the repository.
- [ ] Alpha gating versus experimental/non-gating tasks are frozen; coordinator, native subagents and iframe cannot silently become release blockers.
- [ ] Upgrade, backup, restore, export/import and privacy retention targets have measurable fixtures.
- [ ] `roadmap.md`, `STATUS.md` and every affected task dependency agree.

## Verification

Review ADRs, dependency/license report, fixtures and release matrix; run the decision/link consistency check.

## Evidence

- ADRs and approvals:
- Pinned dependency profiles:
- Fixture inventory:
