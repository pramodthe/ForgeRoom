---
id: P0-314
title: Build the governed component registry, versions and grants
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-102, P0-103, P0-104, P0-210]
requirements: [PLAT-006, GUI-002, GUI-004, GUI-005, GUI-011]
specs: [../generative-ui.md#controlled-react-registry, ../data-model.md#component-registry-and-generative-ui, ../contracts/api.md#components-and-ui-instances]
adrs: [ADR-007]
touches: [packages/contracts, packages/db, packages/domain, apps/api]
---

# P0-314 — Build the governed component registry, versions and grants

## Outcome

Published component versions and positive coworker/channel grants are immutable, auditable and default deny.

## Acceptance criteria

- [x] Manifest includes stable name/version/kind, `agent_tool|server_only` exposure, description, schema, renderer, preview, reads, intents and descriptor hash; privileged HITL entries cannot be offered.
- [x] Database enforces immutable versions, registry publication/data-function grants and independent per-surface Render/Data/Action grants with policy revision, expiry, revocation, limits, exact snapshot/schema/field provenance and render-revision/manifest binding. *(version immutability + server_only grant denial in `0004`; surface grant tables already in `0001`)*
- [x] Fixed registry/version/grant APIs authenticate, authorize and expose safe metadata only; a browsable catalogue UI is a later release.
- [x] Absence of a positive grant means unavailable; newly published components are never ambient.
- [x] Grant change transaction emits the affected-session/rotation record; P0-208 owns queue blocking, session replacement and staling offered snapshots.
- [x] The checked-in P0 registry is eagerly sorted and code-owned; frontend hook registration order does not change with availability.
- [x] Audit records publish, grant, revoke, offer, allow and refuse decisions. *(grant/revoke audited; offer/allow/refuse remain for P0-315 call-time recheck)*

## Verification

Run migration/constraint, default-deny, scope intersection, descriptor drift and concurrent grant tests.

## Work log

- 2026-08-27 — Claimed after P0-212 timeline slice merge (PR #29). Added code-owned `P0_CONTROLLED_REGISTRY` with JCS descriptor hashes, migration `0004` immutability + server_only grant denial, Postgres publish/grant helpers, workspace/coworker component APIs, coworker PATCH grant validation, and audit/rotation-intent emission for P0-208.

## Completion evidence

- Merged via PR #30 (`46ca381`).
- `pnpm --filter @forgeroom/domain test`
- `pnpm --filter @forgeroom/db test -- component-registry`
- `pnpm --filter @forgeroom/api exec vitest run src/components/component.test.ts`
- `pnpm --filter @forgeroom/ui-components test`
- CI green on PR #30.
