---
id: P1-103
title: Implement invitations, human roles and private channels
status: blocked
owner: unassigned
depends_on: [P1-102]
requirements: [TEAM-001, TEAM-002, TEAM-003, TEAM-004, TEAM-005, TEAM-006]
specs: [../teams.md, ../contracts/api.md, ../data-model.md, ../ux.md]
release_gate: required
---

# P1-103 — Implement membership and private channels

## Outcome

Workspace owners can invite humans, assign base roles and control private-channel membership without leaking history or capabilities.

## Acceptance criteria

- [ ] Invitation issue/accept/revoke/expire flows are idempotent, rate-limited and bind the intended workspace/email or identity.
- [ ] Owner/admin/member permissions match the closed 0.2 role matrix; the last owner cannot be removed accidentally.
- [ ] Private channel history, search, artifacts, Tasks, UI state and live events are visible only to members.
- [ ] Membership removal revokes new streams/downloads/tool authority and safely handles in-flight runs.
- [ ] Coworker access is independently granted and never inferred from human membership prose.
- [ ] Every membership/role/channel-access change emits an event and audit entry.

## Verification

Run invitation abuse, role transition, last-owner, private-channel enumeration, SSE/replay, artifact and active-run tests.

## Evidence

- Role matrix:
- Test report:
- Browser screenshots:
