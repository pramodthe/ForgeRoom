---
id: P0-317
title: Bound controlled data-function reads with a time limit
status: ready
owner: unassigned
depends_on: [P0-315]
requirements: [GUI-010]
specs: [../generative-ui.md#interaction-gateway, ../security.md]
adrs: [ADR-007]
touches: [packages/contracts, packages/db]
release_gate: required
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

- [ ] `DataGrant` carries an explicit time bound and rejects grants that omit it.
- [ ] Exceeding the bound fails with a typed limit error, not a hang or a partial read.
- [ ] The bound is re-checked from the retained grant on replay, not taken from caller input.
- [ ] Row, byte and time limits are enforced together, and a breach of any one is attributed.

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

- [ ] A grant whose bound is exceeded returns the typed limit error and persists no partial read.

## Evidence

- Files changed:
- Commands and results:
- Screenshots or artifacts:
- Redacted provider trace:

## Work log

- 2026-08-28 — Split out of P0-315 during acceptance-criteria audit. P0-315 enforces row and byte
  limits but has no time bound on `DataGrant` or anywhere in the data-function path.

## Handoff

- Outcome:
- Open risks:
- Follow-up tasks:
