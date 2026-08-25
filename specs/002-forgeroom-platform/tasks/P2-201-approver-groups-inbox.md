---
id: P2-201
title: Implement approver groups, delegation and workspace approval inbox
status: blocked
owner: unassigned
depends_on: [P1-103, P2-000]
requirements: [TEAM-009, TEAM-010, MEM-010, RET-009, PSEC-001, PSEC-002]
specs: [../teams.md, ../security.md, ../ux.md]
release_gate: required
---

# P2-201 — Implement approver groups and inbox

## Outcome

Organizations can route exact proposals to eligible humans, enforce separation rules and resolve them once from a trusted workspace inbox.

## Acceptance criteria

- [ ] Group membership, policy and delegation are versioned, time-bound and auditable.
- [ ] Approver/viewer/operator and custom scoped RoleVersions/RoleBindings compile allowlisted capabilities, preserve the protected owner bundle and cannot exceed the grantor ceiling.
- [ ] Proposal eligibility snapshots exact group/policy but rechecks current actor membership and separation rules at decision time.
- [ ] Quorum/any/all semantics use one atomic decision state and handle concurrent/conflicting responses.
- [ ] Delegation cannot exceed delegator authority, cross prohibited scope or outlive its expiry/revocation.
- [ ] Inbox hides inaccessible proposal data and shows account/target/effect/arguments/expiry/staleness exactly.
- [ ] Notification links never decide; the authenticated recent-session host action remains required.
- [ ] Protected memory classes/scopes use the same versioned group/delegation/separation policy and cannot be self-approved by a proposing coworker.
- [ ] The legacy P0 approval-decision route delegates to the same current vote/quorum service and cannot finalize a proposal that still needs another eligible vote or separation check.

## Verification

Run group change, delegation escalation, separation, quorum races, stale proposal and cross-workspace inbox tests.

## Evidence

- Policy fixtures:
- Security/browser report:
