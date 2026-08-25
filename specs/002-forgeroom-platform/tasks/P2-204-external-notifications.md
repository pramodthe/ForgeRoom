---
id: P2-204
title: Implement opt-in external notifications, escalation and workflow routing
status: blocked
owner: unassigned
depends_on: [P1-104, P2-106, P2-201]
requirements: [NT-008, NT-009, NT-010]
specs: [../notifications.md, ../teams.md, ../security.md]
release_gate: required
---

# P2-204 — Implement external notifications

## Outcome

Teams can opt into email/browser-push delivery and fixed escalation for workflow/security attention without exposing private content or letting models select arbitrary recipients.

## Acceptance criteria

- [ ] Email/push endpoints are verified, revocable and owned by one authenticated user; unsubscribe and preference changes take effect before new delivery.
- [ ] Delivery honors category/resource preferences, time zone, quiet hours, digest and retry/bounce policy.
- [ ] Workflow/approval destinations resolve registered users/groups from server-held policy; payload/model data cannot select an arbitrary address/endpoint.
- [ ] External messages contain minimized safe summaries and authorization-checked links, never approval authority or confidential bodies.
- [ ] Security-critical quiet-hour bypass is a fixed audited workspace policy with eligible classes/recipients, not an agent choice.
- [ ] Duplicate/out-of-order events and provider retries create one logical notification/delivery outcome.

## Verification

Run endpoint verification/revocation, preference/quiet-hour/DST, workflow recipient injection, privacy template, duplicate/retry/bounce and removed-member tests.

## Evidence

- Templates/provider fixtures:
- Security/delivery report:
