---
id: P1-104
title: Implement notification inbox, preferences and bounded presence
status: blocked
owner: unassigned
depends_on: [P1-101, P1-103]
requirements: [NT-001, NT-002, NT-003, NT-004, NT-005, NT-006, NT-007, TEAM-007, TEAM-008]
specs: [../notifications.md, ../teams.md, ../contracts/api.md, ../contracts/events.md, ../ux.md]
release_gate: required
---

# P1-104 — Implement notifications and presence

## Outcome

Members receive deduplicated, privacy-safe in-app notifications and can see useful ephemeral presence without turning it into authority.

## Acceptance criteria

- [ ] Inbox records mention, approval, assignment, workflow-ready and failure events with stable deduplication keys.
- [ ] Per-kind/channel preferences and mute state are honored before any external delivery.
- [ ] In-app notification previews contain only safe bounded metadata and link to an authorization-checked view; email/push delivery remains disabled until P2-204.
- [ ] Read/archive state is per human and converges across reconnects.
- [ ] Presence has TTL, coarse states and no role/approval implications; invisible users remain supported.
- [ ] Authenticated channel/client-session leases enforce TTL/rate limits, multi-tab identity, invisible mode and immediate removal on membership/session revoke, realtime close or explicit release; no durable DomainEvent is emitted.
- [ ] Membership removal prevents future delivery and invalidates inaccessible links.

## Verification

Run duplicate/out-of-order events, preference changes, privacy templates, removed-member and multi-tab presence tests.

## Evidence

- Event/templates:
- Test report:
- Inbox screenshots:
