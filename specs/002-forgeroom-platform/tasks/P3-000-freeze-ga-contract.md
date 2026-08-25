---
id: P3-000
title: Freeze the 1.0 GA support and compatibility contract
status: blocked
owner: unassigned
depends_on: [P2-503]
requirements: [PLAT-006, PLAT-007, PLAT-009, PLAT-010]
specs: [../roadmap.md, ../decisions/OPEN.md, ../open-source.md]
release_gate: required
---

# P3-000 — Freeze the GA contract

## Outcome

Deployment, compatibility, recovery, hosted-tenancy, identity, extension-signing and support promises are approved and measurable before GA engineering begins.

## Acceptance criteria

- [ ] PD-001/PD-002 and PD-010 through PD-012 are closed for the public GA surface.
- [ ] Supported topologies, SLOs, RPO/RTO, retention, quotas and performance budgets are frozen.
- [ ] Public API/event/SDK compatibility, deprecation and LTS windows are documented.
- [ ] Hosted/core feature and licensing boundaries preserve self-host portability.
- [ ] Independent security-review scope, load corpus and disaster-recovery scenarios are contracted.
- [ ] GA task graph and release evidence owners are approved.

## Verification

Review ADRs, support policy, threat model, architecture/load plans and legal/license evidence.

## Evidence

- ADRs/policies:
- Review approvals:
