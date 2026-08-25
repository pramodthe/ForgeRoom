---
id: P1-304
title: Implement workspace connection lifecycle, catalogue and grants
status: blocked
owner: unassigned
depends_on: [P1-000, P1-101, P1-102, P1-103]
requirements: [CN-001, CN-002, CN-003, CN-004, CN-005, CN-006, CN-007, CN-008, CN-009]
specs: [../connections.md, ../contracts/api.md, ../data-model.md, ../security.md, ../ux.md]
release_gate: required
---

# P1-304 — Implement workspace connections

## Outcome

Admins can safely connect, inspect, test, grant, reconnect and revoke multiple workspace service accounts while every runtime stays pinned to literal account/tool versions.

## Acceptance criteria

- [ ] ConnectionIntent/callback validates actor/session/workspace, state/nonce, PKCE where supported, redirect allowlist, expiry and idempotency.
- [ ] Connection/account/descriptor/health/grant state is revisioned and stores no adapter credential or raw OAuth response.
- [ ] Catalogue lists safe application/account/tool metadata, normalized effects, policy support and descriptor hashes; it grants nothing by browsing.
- [ ] Exact account/tool/effect grant preview enforces workspace policy and grantor delegation ceiling before confirmation.
- [ ] Grant/revoke/reconnect/account-identity/descriptor changes rotate only affected sessions and stale affected proposals.
- [ ] Test is a bounded declared read/health operation and cannot become an unapproved external mutation.
- [ ] Connections UX covers pending, callback failure, missing scope, unhealthy, drifted, expired, revoked and provider-outage states accessibly.

## Verification

Run OAuth CSRF/link-confusion, duplicate callback, two-account isolation, descriptor drift, grant escalation, reconnect identity mismatch, revoke-in-flight, provider outage and browser accessibility tests.

## Evidence

- Adapter/descriptors:
- Security/integration report:
- Screenshots:
