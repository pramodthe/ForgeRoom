---
id: P0-307
title: Implement secure decision API and approval card contract
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
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

- [x] Card contract includes lineage, exact tool/account/target, redacted args, effect, descriptor, artifact, hash and expiry.
- [x] Auth, role, Origin, CSRF, proposal state and every bound field are revalidated.
- [x] Concurrent allow/deny has one winner.
- [x] Change or expiry makes proposal stale.
- [x] Denial records event and causes zero provider call for that proposal.
- [x] Request changes denies and creates a correction draft only.

## Verification

Run auth, CSRF, replay, concurrent decision, stale-field, expiry and denial/provider-count tests.

## Work log

- 2026-08-27 — Claimed after P0-306. Implemented approval card contract, secure decision command, atomic CAS persistence, GET card + POST decision routes (no TrueForge resume; P0-308).

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/contracts test -- pause` — pass (request_changes command validation)
  - `pnpm --filter @forgeroom/domain test -- approvals` — pass (card + gate unit)
  - `pnpm --filter @forgeroom/db test -- pause-crypto` — pass
  - `pnpm --filter @forgeroom/api test -- decisions` — pass (auth/CSRF/Origin, replay, concurrent CAS, stale/expiry, denial event + provider_calls=0, request_changes correction draft)
  - `pnpm --filter @forgeroom/{contracts,domain,db,api} typecheck` — pass
- Endpoints:
  - `GET /api/approvals/:proposalId` — trusted ApprovalCard projection
  - `POST /api/approvals/:proposalId/decision` — allow | deny | request_changes; never calls TrueForge
- Explicit non-goal: PauseResume creation / response-only TrueForge resume remains P0-308.
