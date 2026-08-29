---
id: P0-211
title: Implement the TrueForge-to-AG-UI adapter and standard run endpoint
status: done
owner: cursor-agent
started: 2026-08-26
completed: 2026-08-27
depends_on: [P0-102, P0-203, P0-210]
requirements: [PLAT-005, AGUI-001, AGUI-003, AGUI-004, AGUI-005, AGUI-007, AGUI-008]
specs: [../contracts/ag-ui.md, ../runtime.md#trueforge-to-ag-ui-adapter]
adrs: [ADR-006]
touches: [packages/integrations/ag-ui, packages/integrations/trueforge, apps/api, apps/worker]
---

# P0-211 — Implement the TrueForge-to-AG-UI adapter and standard run endpoint

## Outcome

Each persistent coworker is consumable as a sanitized standard AG-UI agent backed by its TrueForge session.

## Acceptance criteria

- [x] Stable logical thread ID maps one channel/coworker and survives TrueForge session rotation.
- [x] Authenticated per-coworker endpoint accepts `RunAgentInput` and emits official-schema AG-UI SSE (bootstrap slice: direct TrueForge turn + `listTurnEvents` poll).
- [x] `/api/copilotkit` is absent by default; if P0-210 enables it, the gateway exposes only server-registered adapters and preserves the same validated stream.
- [x] The pure POST route—and optional gateway when enabled—enforces expected Origin and the current session-bound CSRF header; clients attach it, and missing/forged values fail before a Run/message is persisted.
- [x] Lifecycle, text, tool, activity and interrupt mappings match `contracts/ag-ui.md`; each run has exactly one terminal. *(closed by the pinned full-event-profile and illegal-order conformance fixture in P0-506)*
- [x] Required actions produce interrupt outcome and cannot terminalize RunStep or trigger synthesis.
- [x] Direct `RunAgentInput.resume` is rejected and a disabled integration seam is exposed; P0-308 alone enables that seam by delegating to the canonical PauseGroup service.
- [x] Raw/reasoning/thinking events, secrets, signatures, arbitrary tool bodies and raw TrueForge IDs are absent from normalized JSON/browser/log/audit output; only access-controlled typed correlation columns retain required IDs for dedupe/lineage.
- [x] Unexpected native-subagent or open-generated UI provider events become inert typed unsupported-capability activity and never enter executable/render paths.
- [x] Every outbound event parses through the pinned schema before persistence or delivery.
- [x] Exact upstream `@ag-ui/*` event/RunAgentInput adapters and browser exports are generated against the single P0-210 package graph; protocol-neutral domain schemas remain independent.

## Verification

Run golden mapping, illegal-order, redaction, interrupt and official-client conformance fixtures.

## Notes (2026-08-26 bootstrap slice)

- `@forgeroom/ag-ui`: `TrueForgeAGUIAdapter`, upstream parsers, SSE formatter, capabilities builder.
- `POST /api/ag-ui/channels/:channelId/coworkers/:coworkerId/runs` persists via `postMessage`, claims the durable queue item, binds the worker-owned TrueForge turn, streams validated AG-UI SSE.
- `GET /api/ag-ui/channels/:channelId/coworkers/:coworkerId/capabilities` reports P0 profile and disabled resume seam.
- Review remediation: no synthetic side-turn; only the worker that owns a failed create may fail the RunStep, while a waiter timeout leaves the owner's step unchanged.
- Provider history is deduplicated and streamed incrementally with no fixed production timeout; each sanitized upstream event enters the canonical durable lifecycle before browser delivery.
- Provider/list failures emit one schema-validated redacted `RUN_ERROR`; provider terminal errors settle AgentTurn, queue item, RunStep and parent Run.
- Live delivery revalidates the authenticated session and channel/coworker access, and latches closed after revocation.
- AG-UI run idempotency rejects content collisions and repairs a persisted message's missing Run instead of creating a duplicate message.
- The official browser client may bind a composer-created `sourceMessageId`/Run/RunStep through a strict server-verified `forgeroomV1` reference; this launches the existing work item instead of creating a duplicate human message or Run.
- Safe lifecycle and assistant-text projections persist before channel broadcast and the channel shell renders their replay with coworker attribution. This is an incremental prerequisite slice only: P0-212 still owns full activity/state revisioning, source refs, compaction and replay equivalence, while P0-408 owns the complete rich renderer integration.
- Normalized persistence retains provider IDs only in typed correlation columns and drops arbitrary provider/tool bodies.
- Full tool/state/activity mapping, canonical approval resume, and replay/render acceptance are closed by P0-212/P0-306/P0-308/P0-408/P0-506; `event-conformance.test.ts` locks the complete P0 event profile.
