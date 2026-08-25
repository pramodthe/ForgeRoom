---
id: P2-000
title: Freeze the 0.3 team-beta automation contract
status: blocked
owner: unassigned
depends_on: [P1-504]
requirements: [PLAT-005, PLAT-007, PLAT-009]
specs: [../roadmap.md, ../workflows.md, ../decisions/OPEN.md]
release_gate: required
---

# P2-000 — Freeze the team-beta contract

## Outcome

Scheduling, trigger, approval-group, connection and extension choices are concrete enough to implement and test without hidden unattended authority.

## Acceptance criteria

- [ ] PD-006, PD-008 through PD-010 and PD-014 are closed by ADRs with pinned libraries/provider fixtures.
- [ ] Supported recurrence subset, DST/misfire, retry/backoff, dead-letter and retention defaults are frozen.
- [ ] First signed webhook/event adapters and their signature/replay/rotation fixtures are recorded.
- [ ] Unattended approval rules, budgets and prohibited action classes have an approved threat model.
- [ ] Extension trust tiers and compatibility rules are explicit.
- [ ] Three design partners and production-like workflow fixtures are identified.

## Verification

Review ADRs, threat model, provider fixtures, dependency/license matrix and task graph.

## Evidence

- ADRs:
- Fixtures:
- Review approval:
