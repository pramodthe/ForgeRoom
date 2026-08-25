---
id: P1-503
title: Complete install, upgrade, backup, restore and portability conformance
status: blocked
owner: unassigned
depends_on: [P1-401, P1-402, P1-501]
requirements: [OSS-002, OSS-003, OSS-004, OSS-005, OSS-006, OSS-007, OSS-010, RET-006]
specs: [../test-plan.md#open-source-and-operations-matrix, ../open-source.md]
release_gate: required
---

# P1-503 — Complete operations conformance

## Outcome

Release artifacts prove that an operator—not a developer’s laptop—can safely install and recover the alpha.

## Acceptance criteria

- [ ] Clean install reaches first trusted result using only documented steps and configuration.
- [ ] Backup/restore reproduces all domain counts, hashes, sampled citations, artifacts, memories, records and audit lineage.
- [ ] The 0.2 portable snapshot/import stages disabled into a new workspace, produces the documented identity/conflict/permission/automation impact preview, rejects a stale or broadening commit, activates only after exact authorized commit, and proves cancel leaves no active identities/grants.
- [ ] Previous release upgrades with no lost authorized state; failure path follows the documented rollback/forward-fix strategy.
- [ ] Telemetry remains off and no external dependency beyond configured providers is required.
- [ ] SBOM/dependency licenses, image provenance and vulnerability scan meet the alpha policy.
- [ ] Every OSS-006 document link/command is smoke-tested from the released artifact, and a tabletop security report→acknowledgement→signed-advisory verification exercises OSS-010 without publishing a real vulnerability.

## Verification

Run clean-VM CI matrix and a manually witnessed restore drill.

## Evidence

- CI artifacts:
- Restore witness:
- SBOM/scans:
