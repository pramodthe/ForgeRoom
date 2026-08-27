---
id: P0-212
title: Persist, multiplex and replay AG-UI messages, state and activities
status: in_progress
owner: cursor-agent
started: 2026-08-27
depends_on: [P0-103, P0-107, P0-211]
requirements: [AGUI-002, AGUI-003, AGUI-006, GUI-011]
specs: [../contracts/ag-ui.md#durable-channel-stream, ../contracts/events.md, ../data-model.md]
adrs: [ADR-002, ADR-006]
touches: [packages/db, packages/domain, packages/integrations/ag-ui, apps/api, apps/web]
---

# P0-212 — Persist, multiplex and replay AG-UI messages, state and activities

## Outcome

Concurrent coworker streams form one correctly attributed, refresh-safe channel timeline and shared presentation state.

## Acceptance criteria

- [x] Validated event and monotonic `AgentChannelEnvelope` persist transactionally before broadcast. *(lifecycle + assistant text slice)*
- [x] Channel stream multiplexes logical coworker threads and replays from `Last-Event-ID` without loss or duplicate projection. *(web reconnect uses afterSequence; reducer dedupes by channelSequence)*
- [ ] `generated_source_ref` rows deterministically materialize source-free schema-valid live/replay activities; authorized iframe source is delivered only through the separate render-capability path.
- [ ] Live and replay serialize the exact persisted closed `browserEvent` and are byte-identical RFC 8785 JCS UTF-8; event_hash covers that object, source_ref_hash covers the full server ref, and neither path exposes source/blob/capability data. *(event_hash now JCS for all persisted AG-UI events; browserEvent/source_ref still open)*
- [x] A fanned-out human sourceMessageId renders once across full/compacted replay; per-coworker inputs do not duplicate it. *(human via REST messages; coworker text via stream lanes)*
- [x] A pure reducer isolates concurrent message/activity IDs and actor ownership; browser mounting and any optional CopilotKit wrapper belong to P0-408. *(text/runs + ChannelUIState/ThreadUIState; activities deferred)*
- [x] Exactly one channel/system lane owns ChannelUIState; per-coworker streams may carry only their separately typed ThreadUIState and cannot race shared state. *(contracts + `reduceUiPresentationState`)*
- [ ] Every registered activity delta tests/increments activityRevision; resync snapshots preserve the current revision, and wrong-base, delayed pre-resync, gap, duplicate and forbidden-path cases request a replacement snapshot.
- [x] `STATE_SNAPSHOT` replaces state; delta applies RFC 6902 with revision test and safe-path allowlist. *(schema + pure reducer)*
- [x] Missing/invalid base requests a fresh snapshot rather than guessing.
- [ ] Full replay and compacted snapshot replay produce identical messages, activities, run state and hashes.
- [ ] Security-sensitive state paths cannot be emitted or patched. *(contracts reject; reducer resyncs — leave open until activity/source paths land)*

## Verification

Run concurrency, cursor-by-cursor reconnect, patch divergence and full-versus-compacted replay tests.

## Notes (2026-08-27 first slice)

- Persist allowlisted RUN_*/TEXT_MESSAGE_* projections into `channel_events` + `agui_event_records` before channel broadcast; populate `agui_run_id` and text `message_or_activity_id`.
- Web: pure timeline reducer, SSE reconnect with `afterSequence`, optimistic human send, composer→existing Run via `forgeroomV1`.
- First slice merged via PR #29 (`52fe71b`). Still open for full P0-212: JCS hashing, source refs, ChannelUIState/ThreadUIState runtime, activity revisioning, compaction equivalence.

## Notes (2026-08-27 second slice)

- `hashAguiEvent` uses domain RFC 8785 JCS (`canonicalizeJson`) for `agui_event_records.event_hash`.
- `toPersistedAgUiEvent` projects `STATE_SNAPSHOT` / `STATE_DELTA`.
- Pure `reduceUiPresentationState` owns channel vs thread lanes, snapshot replace, revisioned deltas, and `need_*_snapshot` on divergence.
- Still open: activities, `generated_source_ref`, compaction equivalence, browserEvent closed-form hashing.
