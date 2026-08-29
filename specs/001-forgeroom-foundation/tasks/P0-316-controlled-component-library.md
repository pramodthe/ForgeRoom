---
id: P0-316
title: Build the controlled in-chat component library
status: in_review
owner: unassigned
depends_on: [P0-312, P0-314, P0-401]
requirements: [GUI-001, GUI-003, GUI-006, GUI-012, GUI-013]
specs: [../generative-ui.md#controlled-react-registry, ../ux.md#controlled-component-behavior]
adrs: [ADR-007]
touches: [packages/ui/components, apps/web]
---

# P0-316 — Build the controlled in-chat component library

## Outcome

Coworkers can answer inline with a small, polished, accessible table/chart/task/artifact set and one bounded choice interaction.

## Acceptance criteria

- [x] Implement exactly the P0 agent-tool set: DataTable, BarOrLineChart, TaskCard, ArtifactCard and bounded ChoiceForm; privileged HITL renderers are server-only and never offered.
- [x] Use the pinned official AG-UI client with the application-owned registry/default fallback; optional CopilotKit render hooks are used only if P0-210 enables a coherent graph, without conditional hook ordering or approval bypass.
- [x] Render preparing, streaming, ready, waiting, refused, stale, incompatible and failed states without raw JSON.
- [x] Charts have data-table summaries, artifacts retain authenticated revisions/labels and forms have labels/errors.
- [x] Enforce row/series/point/byte limits and deterministic theme tokens.
- [x] Arbitrary URLs, HTML, scripts, prototype keys and unsafe SVG never reach a renderer.
- [x] Complete props validate client-side against the published component schema before render; invalid props fall back inert rather than rendering partially. *(deferred here from P0-315, which owns the server-side half)*
- [x] Error boundary contains each instance and preserves its text alternative/timeline.
- [x] Trusted approval/question/connection cards cannot be shadowed or authored by the model.

## Work log

- 2026-08-29: Slice 1 — ChoiceForm submit wired through interaction token + commit (`complete_component_interrupt`); ArtifactCard downloads use server artifact IDs only; degraded/stale lifecycle chrome; artifact URL safety tests.

## Verification

Run schema/limit/XSS/image tests, Storybook or fixture gallery review, axe checks and 1440 px visual snapshots.
