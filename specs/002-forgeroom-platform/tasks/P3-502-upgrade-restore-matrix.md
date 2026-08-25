---
id: P3-502
title: Complete GA upgrade, restore and export compatibility matrix
status: blocked
owner: unassigned
depends_on: [P3-101, P3-105, P3-501]
requirements: [CN-012, KN-012, MEM-011, REC-012, RET-010, PLAT-007, PLAT-008, OSS-004, OSS-005, OSS-006, OSS-007, OSS-008]
specs: [../open-source.md, ../test-plan.md]
release_gate: required
---

# P3-502 — Complete GA recovery compatibility

## Outcome

Supported releases/topologies can upgrade, restore and export/import within the published compatibility and recovery promises.

## Acceptance criteria

- [ ] Every supported source release upgrades through documented paths with validated domain invariants.
- [ ] Backup/PITR/restore works for single-node and HA profiles and verifies indexes, objects and external-outcome reconciliation.
- [ ] Export/import works without hosted contact and preserves/redacts data exactly as documented.
- [ ] Failed migration follows tested rollback or forward-fix with no silent partial availability.
- [ ] Retention/deletion/legal-hold state survives upgrade/restore correctly.
- [ ] Matrix artifacts are reproducible from released images/packages and sanitized test datasets.

## Verification

Run automated version/topology matrix plus witnessed random restore and export drills.

## Evidence

- Matrix report:
- Witnessed drills:
