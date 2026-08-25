---
id: P2-202
title: Implement per-human connections and explicit account selection
status: blocked
owner: unassigned
depends_on: [P1-103, P1-304, P2-000]
requirements: [CN-010, CN-011, TEAM-011, PLAT-003, PSEC-003, PSEC-004, PSEC-009]
specs: [../connections.md, ../architecture.md, ../security.md, ../teams.md]
release_gate: required
---

# P2-202 — Implement per-human connections

## Outcome

Where providers support it, humans connect and grant their own accounts while every coworker action remains pinned to one visible identity and scope.

## Acceptance criteria

- [ ] Connection ownership, sharing scope, account identity, provider scopes, health and revocation are explicit.
- [ ] Coworker/workflow grants reference one exact connection/account; no “any available account” fallback exists.
- [ ] Account selection and authorization preview precede a capability-affecting bind/rotation.
- [ ] Connection secrets remain provider/server-side and are absent from events, browser, exports and diagnostics.
- [ ] Revocation/expiry/identity mismatch blocks new claims and reconciles in-flight outcomes truthfully.
- [ ] Shared service identities and per-human identities remain visibly distinct in approvals/audit.

## Verification

Run account swapping, cross-human/cross-workspace, revoked OAuth, descriptor drift, in-flight revocation and UI identity tests.

## Evidence

- Provider fixtures:
- Security report:
