---
id: P0-404
title: Build approval/question UI and Run drawer
status: in_review
owner: cursor-agent
depends_on: [P0-307, P0-308, P0-403]
requirements: [AP-003, AP-004, AP-008, AP-011, RUN-004, RUN-007, GUI-010]
specs: [../ux.md#approval-card, ../ux.md#question-card, ../ux.md#run-detail-drawer]
adrs: [ADR-004, ADR-007]
touches: [apps/web, packages/ui]
---

# P0-404 — Build approval/question UI and Run drawer

## Outcome

Owner can safely decide exact proposals, answer questions, stop/correct work and inspect the complete normalized Run.

## Acceptance criteria

- [x] Approval card displays every required immutable field and fixed account.
- [x] Approval/question/connection controls are reserved trusted host components and never sourced from an agent-controlled component.
- [x] A controlled component may request the host open an existing current card but cannot overlay it or submit its decision.
- [x] Approve, deny and request changes call decision API with expected hashes.
- [x] UI distinguishes recorded decision, group ready, resume started and execution result.
- [x] Question warns against credentials and shows group waiting state.
- [x] Run drawer shows direct routing, persistent coworker steps, events, Tasks, artifacts, decisions and receipt; no child/coordinator lane appears in P0.
- [x] All actions are keyboard operable.

## Verification

Run component tests for stale/concurrent/expired states and browser decision/question/stop/correction flows.

## Completion evidence

- Merged stack: PR #50 (question card), #51 (run drawer enrichment), #52 (keyboard operability); closeout PR adds trusted HITL host open hook.
- Tests/results:
  - `apps/api/src/questions/answers.test.ts`, `apps/api/src/approvals/decisions.test.ts`
  - `apps/web/src/shell/pause-group-lifecycle.test.ts`, `packages/domain/src/runs/drawer.test.ts`
  - `apps/web/src/shell/trusted-hitl-host.test.ts`
  - `pnpm lint`, `pnpm typecheck`, targeted vitest green locally
- Notes:
  - P0 host-open uses `TrustedHitlHostProvider` + stable card anchors; `ControlledInstance` accepts `onRequestOpenHitlCard` but renderers do not invoke it without server-bound links (P1 `open_existing_hitl` remains unsupported at the grant boundary).
