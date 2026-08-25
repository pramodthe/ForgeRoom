---
id: P0-407
title: Complete required states and accessibility polish
status: blocked
owner: unassigned
depends_on: [P0-402, P0-403, P0-404, P0-405, P0-406, P0-316, P0-410]
requirements: [CH-006, RUN-006, AG-012, TR-002, SK-003, GUI-012, GUI-013]
specs: [../ux.md#required-states, ../ux.md#accessibility, ../ux.md#visual-system]
adrs: []
touches: [apps/web, packages/ui]
---

# P0-407 — Complete required states and accessibility polish

## Outcome

The 1440 px demo UI is visually coherent, accessible and complete across every required normal, blocked and failure state.

## Acceptance criteria

- [ ] Every state in `ux.md` has a deliberate rendering.
- [ ] WCAG AA contrast, visible focus and keyboard flows pass.
- [ ] Important changes use restrained live regions; token deltas do not spam announcements.
- [ ] Reduced motion works.
- [ ] At 1440 px both coworkers, current work and required human action remain visible.
- [ ] No clipping, raw JSON, rainbow identity confusion or continuous shimmer.
- [ ] Charts expose table summaries and bounded interactions have labels, errors and focus-safe completion.
- [ ] Coworker creation, Task conflict and skill review flows preserve focus and never allow generated content to cover trusted controls.

## Verification

Run accessibility automation, full keyboard pass, reduced-motion pass and visual regression screenshots.

## Completion evidence

- Automated results:
- Manual accessibility notes:
- Screenshots:
