---
id: P0-304
title: Implement Connections API and health
status: blocked
owner: unassigned
depends_on: [P0-104, P0-302]
requirements: [TL-008, TL-011, CN-001, CN-005, CN-006]
specs: [../contracts/api.md#connections, ../ux.md#connections-screen]
adrs: [ADR-003]
touches: [apps/api, packages/integrations/composio]
---

# P0-304 — Implement Connections API and health

## Outcome

Authorized API exposes safe fixed-account status, Test and Reconnect while preventing account selection or capability expansion.

## Acceptance criteria

- [ ] Status returns service identity, scopes, toolkit health, exact tools/hashes and verification time.
- [ ] Test performs safe read-only checks.
- [ ] Reconnect creates short-lived Connect Link bound to authenticated workspace.
- [ ] Expiry becomes `blocked_connection` and no fallback account is selected.
- [ ] No P0 endpoint browses catalog, adds account or changes acting identity.

## Verification

Run auth/CSRF tests and live active, expired, reconnect and wrong-workspace state tests.

## Completion evidence

- Tests/results:
- Redacted status sample:
