---
id: P0-304
title: Implement Connections API and health
status: done
owner: agent
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

- [x] Status returns service identity, scopes, toolkit health, exact tools/hashes and verification time.
- [x] Test performs safe read-only checks.
- [x] Reconnect creates short-lived Connect Link bound to authenticated workspace.
- [x] Expiry becomes `blocked_connection` and no fallback account is selected.
- [x] No P0 endpoint browses catalog, adds account or changes acting identity.

## Verification

Run auth/CSRF tests and live active, expired, reconnect and wrong-workspace state tests.

## Completion evidence

- Tests/results: `packages/integrations/composio/src/connections.test.ts` (unit); `apps/api/src/connections/connections.test.ts` (auth/CSRF/wrong-workspace/expired→blocked_connection); live probe `src/live-probe.test.ts` P0-304 suites (active status+read-only test; Connect Link without adopting provisional account) passed 2026-08-27.
- Redacted status sample: `provider-fixtures/composio/connections.verified.json` (account suffix `nizY`; secrets/tokens absent).

## Notes

- 2026-08-27 — Claimed in parallel with P0-309. Implemented composio connection gate/status/test/reconnect helpers, connector_bindings ensure/load, and authenticated Connections API (`list`/`status`/`test`/`reconnect`/`reconnect/status`) with catalog endpoints closed at 404. Avoided P0-309 deterministic-write paths; only additive client methods (`getConnectedAccountDetails`, `createConnectLink`) and shared index export merge.
