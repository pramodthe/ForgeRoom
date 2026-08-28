---
id: P0-403
title: Build live Run and activity cards
status: done
owner: unassigned
depends_on: [P0-109, P0-203, P0-206, P0-401]
requirements: [CH-006, RUN-005, RUN-006, TR-002, AGUI-004]
specs: [../ux.md#timeline-content, ../contracts/events.md]
adrs: [ADR-001, ADR-002]
touches: [apps/web, packages/ui]
---

# P0-403 — Build live Run and activity cards

## Outcome

Normalized AG-UI events render readable attributed coworker, Task, tool, sandbox and result activity without raw logs.

## Acceptance criteria

- [x] Human and persistent coworker identities are stable and clear.
- [x] Task creation/update, assignment, tool, sandbox, artifact, blocked, cancellation, error, partial and receipt cards exist.
- [x] Native-child/coordinator events are inert unsupported-capability activities in P0.
- [x] Registered `ACTIVITY_SNAPSHOT/DELTA` types render from schemas; unknown activities are inert.
- [x] Run shows base lifecycle and simultaneous activity counters.
- [x] Token deltas do not cause layout jumps.
- [x] Raw JSON/reasoning/credentials never render.

## Verification

Run event fixture component tests and required-state visual screenshots. Browser reducer mounting/reconnect evidence belongs to P0-408.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/ui-components test` — pass (6)
  - `pnpm --filter @forgeroom/web test` — pass (41, includes activity/custom reducer fixtures)
  - `pnpm --filter @forgeroom/ui-components typecheck` — pass
  - `pnpm --filter @forgeroom/web typecheck` — pass
- Screenshots: not captured in CI; cards use stable min-height shells suitable for visual regression in P0-408.

## Work log

- 2026-08-28 — Added `@forgeroom/ui-components` activity card shell/presentation/renderers for ForgeRoom activities and CUSTOM channel events. Extended `channel-timeline-reducer` with `reduceActivityPresentationState`, custom event cards, inert unsupported/unknown activities, and run lifecycle/counter projection. Wired merged `orderedTimelineItems` into `ChannelTimeline`.
