---
id: P0-408
title: Integrate AG-UI reducers and generative renderers into the channel
status: done
owner: cursor-agent
started: 2026-08-29
completed: 2026-08-29
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

- [x] Mount one browser reducer per coworker thread, merge by channel sequence, and consume the single channel/system state lane without allowing a coworker reducer to overwrite it. *(slice 2: per-thread activity and tool-call reducers; channel lane via `__channel__` key)*
- [x] Render one channel-owned human sourceMessageId once even when its request fans out to several coworker RunAgentInputs. *(slice 2: `projectedSourceMessageIds` dedup on REST merge)*
- [x] One credentialed official AG-UI client and stable application renderer registry serve all mounted coworker threads without browser provider keys; optional CopilotKitProvider parity applies only when P0-210 enables it. *(slice 3: `createCredentialedAgUiClient` + `resolveBackendToolRenderer`)*
- [x] Correlate messages, tools, activities and results by logical thread plus immutable IDs. *(slice 2: TOOL_CALL_* correlation + per-thread activity/tool maps)*
- [x] Logical-turn busy state survives frontend-tool/HITL wire-run gaps. *(slice 1: `RUN_FINISHED` success respects thread/channel lifecycle)*
- [x] Controlled UI renders inline as a primary response with provenance and text fallback; `iframe_v1` and unknown open-UI activities stay inert. *(slice 3: `ControlledUiPrimaryChrome`; open-UI tools inert via registry)*
- [x] Reviewed backend tools use named renderers and every unknown tool/component has an inert default renderer. *(slice 3: named P0 agent tools + inert default)*
- [x] Snapshot/resync/reconnect restores UIInstances, shared state, pending actions and scroll position without duplicate rendering. *(slice 1–2 sequence/UI state + slice 3 scroll stickiness; UIInstance replay via controlled activity path)*
- [x] Unknown activity/version and renderer crash stay inert and contained. *(activity inert cards + `ComponentHostBoundary`)*
- [x] Live regions announce meaningful state only, not token/patch noise. *(slice 3: `timelineLiveAnnouncement` + `PoliteStatus`)*

## Verification

Run interleaved coworker/tool fixtures, reconnect at every cursor, multi-run component continuation, unsupported-capability fixtures and visual/accessibility tests.

## Work log

- 2026-08-29 — Slice 1: wire `reduceUiPresentationState` into `channelTimelineReducer`, expose `uiState` from `useChannelTimeline`, keep runs busy across wire-run gaps when thread phase or channel run lifecycle is still active.
- 2026-08-29 — Slice 2: per-thread `threadActivityStates` / `threadToolCallStates`, persisted `TOOL_CALL_*` schemas + projection, timeline tool items via `ToolCallActivityCard`, `projectedSourceMessageIds` dedup for fan-out human messages.
- 2026-08-29 — Slice 3: credentialed AG-UI client factory, backend tool renderer registry (named + inert), controlled UI primary-response chrome, reconnect scroll stickiness, meaningful timeline live announcements. Task marked `done`.
