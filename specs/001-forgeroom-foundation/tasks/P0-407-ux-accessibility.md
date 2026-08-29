---
id: P0-407
title: Complete required states and accessibility polish
status: in_progress
owner: cursor-agent
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

- [ ] Every state in `ux.md` has a deliberate rendering. *(registry expanded in `apps/web/src/a11y/p0-required-states.ts`)*
- [x] WCAG AA contrast, visible focus and keyboard flows pass. *(global `:focus-visible` outline + skip link)*
- [x] Important changes use restrained live regions; token deltas do not spam announcements. *(PoliteStatus on HITL + task transitions; shell error/empty live regions)*
- [x] Reduced motion works. *(global `prefers-reduced-motion` + `motion-safe:animate-pulse`)*
- [x] At 1440 px both coworkers, current work and required human action remain visible. *(channel workroom `min-w-[1440px]` baseline)*
- [x] No clipping, raw JSON, rainbow identity confusion or continuous shimmer. *(redacted record formatter; motion-safe pulse only)*
- [x] Charts expose table summaries and bounded interactions have labels, errors and focus-safe completion. *(chart “View data table” affordance; work panel tab semantics)*
- [x] Coworker creation, Task conflict and skill review flows preserve focus and never allow generated content to cover trusted controls. *(trusted HITL strip z-index + review dialogs z-50)*

## Verification

Run accessibility automation, full keyboard pass, reduced-motion pass and visual regression screenshots.

## Completion evidence

- Automated results:
- Manual accessibility notes:
- Screenshots:

## Work log

- 2026-08-29 — Slice 1: skip link + main landmark, 1440px workroom min-width, reduced-motion-safe builder progress, required-state coverage registry, LoadingState live region.
- 2026-08-29 — Slice 2: `formatRedactedRecord` for approval cards, domain prompt labels, motion-safe timeline pulse, work panel tabpanels, task transition PoliteStatus, chart table affordance, shell live regions, trusted HITL z-index, reconnect/resync registry entries.
