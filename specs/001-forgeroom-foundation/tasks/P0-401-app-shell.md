---
id: P0-401
title: Build authenticated three-pane application shell
status: in_review
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

- [ ] Login redirect/session expiry/logout work.
- [ ] Routes and deep links match UX contract.
- [ ] Channel layout has left navigation, center timeline/composer and right Work panel.
- [ ] Shell includes stable host slots/error boundaries for AG-UI activities and controlled components; it has no generated-frame route or slot in P0.
- [ ] Loading, unauthenticated, forbidden and route-error states are polished.
- [ ] No provider credential or raw runtime payload enters browser state.

## Verification

Run component/router tests and 1440 px visual check with mocked canonical contracts.

## Completion evidence

- Tests/results:
- Screenshots:
