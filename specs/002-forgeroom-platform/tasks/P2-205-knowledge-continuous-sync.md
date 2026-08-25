---
id: P2-205
title: Implement governed continuous knowledge synchronization
status: blocked
owner: unassigned
depends_on: [P1-201, P1-202, P2-000]
requirements: [KN-011]
specs: [../knowledge.md, ../connections.md, ../retention.md, ../contracts/events.md]
release_gate: required
---

# P2-205 — Implement continuous knowledge synchronization

## Outcome

Approved URL/repository/provider sources refresh into new immutable versions without silently changing pinned workflow inputs or broadening access.

## Acceptance criteria

- [ ] Each sync policy pins connection/account/source/ref/path, cadence/event, limits, owner, destination collection and failure notification.
- [ ] Refresh creates a new immutable version and provenance/freshness state; old citations and workflow snapshots keep their exact version.
- [ ] Permission/scope loss, branch/account change, deletion and classification increase block promotion and notify the owner.
- [ ] Duplicate events/schedules produce one logical refresh; partial/failure state never replaces the last good current version silently.
- [ ] Source and derived deletion/retention rules apply to every refreshed version and projection.

## Verification

Run duplicate event, ref drift, permission loss, deletion during sync, partial extraction and workflow-pin tests.

## Evidence

- Sync fixtures:
- Security/replay report:
