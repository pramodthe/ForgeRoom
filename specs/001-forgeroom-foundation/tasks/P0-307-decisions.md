---
id: P0-307
title: Implement secure decision API and approval card contract
status: blocked
owner: unassigned
depends_on: [P0-104, P0-306]
requirements: [AP-003, AP-004, AP-005, AP-006, AP-008]
specs: [../contracts/api.md#approvals-and-questions, ../ux.md#approval-card, ../security.md#approval-integrity]
adrs: [ADR-004]
touches: [apps/api, packages/domain, packages/contracts]
---

# P0-307 — Implement secure decision API and approval card contract

## Outcome

The owner can inspect and decide an exact immutable proposal; the HTTP command records one decision without directly resuming TrueForge.

## Acceptance criteria

- [ ] Card contract includes lineage, exact tool/account/target, redacted args, effect, descriptor, artifact, hash and expiry.
- [ ] Auth, role, Origin, CSRF, proposal state and every bound field are revalidated.
- [ ] Concurrent allow/deny has one winner.
- [ ] Change or expiry makes proposal stale.
- [ ] Denial records event and causes zero provider call for that proposal.
- [ ] Request changes denies and creates a correction draft only.

## Verification

Run auth, CSRF, replay, concurrent decision, stale-field, expiry and denial/provider-count tests.

## Completion evidence

- Tests/results:
