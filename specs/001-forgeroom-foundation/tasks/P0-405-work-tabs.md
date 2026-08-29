---
id: P0-405
title: Build Work, Artifacts and Context tabs
status: in_review
owner: cursor-agent
depends_on: [P0-108, P0-109, P0-312, P0-403]
requirements: [ME-001, ME-003, TR-001, TR-002, SB-004, SB-005]
specs: [../ux.md#work-panel]
adrs: [ADR-002, ADR-005]
touches: [apps/web, packages/ui]
---

# P0-405 — Build Work, Artifacts and Context tabs

## Outcome

The right panel exposes canonical Tasks, active work, durable artifacts and sourced channel context without hidden memory controls.

## Acceptance criteria

- [x] Work groups queued/active steps by persistent coworker and exposes stop.
- [x] Tasks view shows canonical status, assignee, revision, source Run/Message and permitted transitions.
- [x] Artifacts show safe preview, revision, creator/source and authenticated download.
- [x] Context shows bounded summary and sourced pins.
- [x] Pin/unpin works from message/artifact and preserves source link.
- [x] Unsupported/unsafe preview and no-content states are clear.

## Verification

Run tab/component tests, artifact authorization browser test and visual checks.

## Completion evidence

- Merged: PR #48 (work tabs baseline), PR #53 (pin from message/artifact); closeout PR adds Work tab stop control.
- Tests/results:
  - `apps/web/src/shell/pin-source-label.test.ts`
  - `apps/api/src/workspace/context-pins.test.ts` (pin API authority)
  - `pnpm lint`, `pnpm typecheck`, targeted vitest green locally
- UI:
  - Work tab: active runs by coworker, receipt link, **Stop** via `POST /api/runs/:id/cancel`
  - Context tab: unpin + scroll-to-message for pinned sources
  - Timeline / artifacts tab / run drawer: **Pin** actions with `source_message_id` / `source_artifact_id`
