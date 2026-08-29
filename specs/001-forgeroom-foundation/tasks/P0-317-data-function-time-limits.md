---
id: P0-317
title: Bound controlled data-function reads with a time limit
status: done
owner: unassigned
depends_on: [P0-315]
requirements: [GUI-010]
specs: [../generative-ui.md#interaction-gateway, ../security.md]
adrs: [ADR-007]
touches: [packages/contracts, packages/db]
---

# P0-317 — Bound controlled data-function reads with a time limit

## Outcome

A controlled component data function cannot consume unbounded execution time, completing the
row/byte/time bound that P0-315 requires of every reviewed read-only handler.

## Scope

- Add a time-bound field to the `DataGrant` contract alongside `max_rows` and `max_bytes`.
- Enforce that bound in the data-function execution path and return a typed limit error on breach.
- Persist and re-check the bound with the retained grant so replay honours the same limit.

## Non-goals

- Live/streaming data sources. P0 data functions read a retained immutable snapshot.
- Any change to row or byte limits, which already work.
- New data functions beyond the existing `rows` handler.

## Acceptance criteria

- [x] `DataGrant` carries an explicit time bound and rejects grants that omit it. *(legacy persisted grants default to 1_000 ms; broker-issued grants always persist `max_time_ms`)*
- [x] Exceeding the bound fails with a typed limit error, not a hang or a partial read.
- [x] The bound is re-checked from the retained grant on replay, not taken from caller input.
- [x] Row, byte and time limits are enforced together, and a breach of any one is attributed.

## Implementation notes

`packages/db/src/retained-data-grants.ts:101-119` (`applySnapshotLimits`) already enforces
`max_rows` and `max_bytes`; the time bound belongs beside it so all three are applied at one
place. The grant shape is `packages/contracts/src/components.ts:269-270`. The only registered
handler today is `rows` in `packages/db/src/ui-data-function-handlers.ts`.

Reads run against a retained in-memory snapshot rather than a live query, so this is a
defence-in-depth bound rather than a live-query timeout. Adding a field to `DataGrant` is a
contract change — check whether existing persisted grants need a migration default.

## Verification

~~~bash
pnpm --filter @forgeroom/contracts test
pnpm --filter @forgeroom/db exec vitest run src/ui-data-functions.integration.test.ts
pnpm --filter @forgeroom/db exec vitest run src/ui-data-function-handlers.test.ts
pnpm lint && pnpm typecheck && pnpm test && pnpm build
~~~

Manual or provider-backed checks:

- [x] A grant whose bound is exceeded returns the typed limit error and persists no partial read. *(`retained-data-grants.test.ts` time_ms breach; `ui-data-functions.integration.test.ts` invoke path)*

## Evidence

- Files changed: `packages/contracts/src/components.ts`, `packages/db/src/retained-data-grants.ts`, `packages/db/src/ui-data-functions.ts`, integration/unit tests.
- Commands and results: `pnpm --filter @forgeroom/db exec vitest run src/retained-data-grants.test.ts src/ui-data-functions.integration.test.ts` green; full `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green on main.
- Screenshots or artifacts: n/a (server-side bound).
- Redacted provider trace: n/a.

## Work log

- 2026-08-28 — Split out of P0-315 during acceptance-criteria audit. P0-315 enforces row and byte
  limits but has no time bound on `DataGrant` or anywhere in the data-function path.
- 2026-08-29 — Closeout: `max_time_ms` on `DataGrant`, `applySnapshotLimits` + `invokeUiDataFunction`
  enforcement, attributed `DataGrantLimitExceededError`, integration tests for bytes/time breach.
- 2026-08-29 — Task marked `done`; manual breach check covered by unit/integration tests above.

## Handoff

- Outcome: P0 data-function reads enforce row, byte, and time limits from the retained grant.
- Open risks: defence-in-depth only on in-memory snapshots; live-query timeouts out of scope.
- Follow-up tasks: none.
