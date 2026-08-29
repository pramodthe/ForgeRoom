---
id: P0-401
title: Build authenticated three-pane application shell
status: done
owner: cursor-agent
depends_on: [P0-102, P0-104]
requirements: [CH-006]
specs: [../ux.md#p0-navigation, ../ux.md#channel-workroom]
adrs: [ADR-002]
touches: [apps/web, packages/ui]
---

# P0-401 — Build authenticated three-pane application shell

## Outcome

Authenticated owner can navigate Channels, Tasks, Coworkers, Skills and Connections in the channel-first desktop shell.

## Acceptance criteria

- [x] Login redirect/session expiry/logout work.
- [x] Routes and deep links match UX contract.
- [x] Channel layout has left navigation, center timeline/composer and right Work panel.
- [x] Shell includes stable host slots/error boundaries for AG-UI activities and controlled components; it has no generated-frame route or slot in P0.
- [x] Loading, unauthenticated, forbidden and route-error states are polished.
- [x] No provider credential or raw runtime payload enters browser state.

## Verification

Run component/router tests and 1440 px visual check with mocked canonical contracts.

## Completion evidence

- Tests/results: `apps/web/src/app-shell.test.ts`, route/session helpers, P0 exclusions, controlled host tests and the P0-407 axe/layout suite; included in the passing release unit/security runs.
- Screenshots: P0-407 1440px visual baselines and P0-504 Playwright artifacts.
