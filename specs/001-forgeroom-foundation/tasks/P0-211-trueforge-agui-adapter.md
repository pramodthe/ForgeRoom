---
id: P0-211
title: Implement the TrueForge-to-AG-UI adapter and standard run endpoint
status: in_progress
owner: cursor-agent
started: 2026-08-26
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
- [ ] Lifecycle, text, tool, activity and interrupt mappings match `contracts/ag-ui.md`; each run has exactly one terminal. *(text + interrupt bootstrap done; full tool/state/activity deferred)*
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
- Qodo autofix: no synthetic side-turn; failed bind marks run step failed; stream failures emit terminal `RUN_ERROR`.
- Remaining: durable channel mirror (P0-212), full tool/state/interrupt mapping (P0-314/P0-306).
