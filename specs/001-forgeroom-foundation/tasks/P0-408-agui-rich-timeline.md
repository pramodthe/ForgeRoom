---
id: P0-408
title: Integrate AG-UI reducers and generative renderers into the channel
status: in_progress
owner: cursor-agent
depends_on: [P0-212, P0-315, P0-316, P0-403]
requirements: [AGUI-002, AGUI-003, AGUI-006, GUI-001, GUI-011, GUI-012, GUI-014]
specs: [../ux.md#in-chat-generative-ui, ../contracts/ag-ui.md#replay-and-failure-behavior]
adrs: [ADR-006, ADR-007]
touches: [apps/web, packages/ui]
---

# P0-408 — Integrate AG-UI reducers and generative renderers into the channel

## Outcome

The merged channel timeline renders concurrent AG-UI coworker streams and rich UI without losing actor, run or interaction state.

## Acceptance criteria

- [ ] Mount one browser reducer per coworker thread, merge by channel sequence, and consume the single channel/system state lane without allowing a coworker reducer to overwrite it. *(slice 2: per-thread activity and tool-call reducers; channel lane via `__channel__` key)*
- [x] Render one channel-owned human sourceMessageId once even when its request fans out to several coworker RunAgentInputs. *(slice 2: `projectedSourceMessageIds` dedup on REST merge)*
- [ ] One credentialed official AG-UI client and stable application renderer registry serve all mounted coworker threads without browser provider keys; optional CopilotKitProvider parity applies only when P0-210 enables it.
- [ ] Correlate messages, tools, activities and results by logical thread plus immutable IDs. *(slice 2: TOOL_CALL_* correlation + per-thread activity/tool maps)*
- [ ] Logical-turn busy state survives frontend-tool/HITL wire-run gaps. *(slice 1: `RUN_FINISHED` success respects thread/channel lifecycle)*
- [ ] Controlled UI renders inline as a primary response with provenance and text fallback; `iframe_v1` and unknown open-UI activities stay inert.
- [ ] Reviewed backend tools use named renderers and every unknown tool/component has an inert default renderer.
- [ ] Snapshot/resync/reconnect restores UIInstances, shared state, pending actions and scroll position without duplicate rendering.
- [ ] Unknown activity/version and renderer crash stay inert and contained.
- [ ] Live regions announce meaningful state only, not token/patch noise.

## Verification

Run interleaved coworker/tool fixtures, reconnect at every cursor, multi-run component continuation, unsupported-capability fixtures and visual/accessibility tests.

## Work log

- 2026-08-29 — Slice 1: wire `reduceUiPresentationState` into `channelTimelineReducer`, expose `uiState` from `useChannelTimeline`, keep runs busy across wire-run gaps when thread phase or channel run lifecycle is still active.
- 2026-08-29 — Slice 2: per-thread `threadActivityStates` / `threadToolCallStates`, persisted `TOOL_CALL_*` schemas + projection, timeline tool items via `ToolCallActivityCard`, `projectedSourceMessageIds` dedup for fan-out human messages.
