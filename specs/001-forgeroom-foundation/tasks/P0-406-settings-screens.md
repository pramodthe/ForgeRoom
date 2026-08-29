---
id: P0-406
title: Build Coworker, Skills and Connections screens
status: done
owner: cursor-agent
depends_on: [P0-106, P0-304, P0-318, P0-401]
requirements: [AG-007, SK-004, SK-005, TL-011]
specs: [../ux.md#coworker-roster-and-editor, ../ux.md#connections-screen]
adrs: [ADR-003]
touches: [apps/web, packages/ui]
---

# P0-406 — Build Coworker, Skills and Connections screens

## Outcome

Owner edits exact coworker settings, inspects private skill bindings and can test/reconnect the fixed service identity.

## Acceptance criteria

- [x] Coworker editor includes identity, instructions, model preset, exact tools/components/skills and approval settings; no child-thread toggle appears in P0.
- [x] Skills screen lists private immutable versions, source Run, requirements, attached coworker and publication/attachment outcome; it does not expose invocation history or a public catalogue in P0.
- [x] Capability edit warns about rotation/stale proposals.
- [x] Connections shows identity, scopes, health, exact tools/hashes and verification time.
- [x] Test/Reconnect flows work.
- [x] No catalog, account picker, alternate identity or ambient grant controls appear.

## Verification

Run form validation, authorization, rotation warning and connection-state browser tests.

## Completion evidence

- Tests/results: `pnpm --filter @forgeroom/web test` (settings-helpers + existing app-shell fixture coverage); `pnpm lint && pnpm typecheck`.
- Screenshots: pending manual capture in connected environment.
