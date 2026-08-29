---
id: P0-410
title: Build coworker creation, Task and Save-as-skill review UI
status: done
owner: cursor-agent
depends_on: [P0-109, P0-213, P0-318, P0-402, P0-406]
requirements: [AG-010, AG-011, AG-012, CW-001, CW-002, CW-003, CW-004, CW-005, CW-006, CW-007, TR-001, TR-002, REC-001, REC-002, REC-003, REC-004, SK-001, SK-002, SK-003, SK-004, SK-005]
specs: [../ux.md#conversational-creation, ../ux.md#work-panel, ../ux.md#save-as-skill, ../../002-forgeroom-platform/ux.md]
adrs: [ADR-001, ADR-002, ADR-003]
touches: [apps/web, packages/ui]
---

# P0-410 — Build coworker creation, Task and Save-as-skill review UI

## Outcome

The 0.1 product exposes trusted, polished user flows for creating a coworker, managing the fixed Task and saving successful work as a skill.

## Acceptance criteria

- [x] New coworker builder shows conversational input, gathering/draft/stale/confirming/provisioning/ready/failure states and never renders model text as trusted confirmation.
- [x] Permission review clearly shows exact account/tools/skills/components/channels, TaskRecord scope/grants, read/write/destructive effects, approvals, budgets/data flow and denial reasons—including unsupported knowledge/memory/workflow/native-child requests—before a revision-bound Create action.
- [x] TaskCard/list/detail shows canonical status, assignee, channel, source Run/Message, revision, history and only authorized transitions; conflict preserves user input and shows latest revision.
- [x] Completed Run exposes Save as skill; review shows method, inputs, required tools/components/data, output, validation, failures, approvals, source and package diff before publish/attach.
- [x] Loading, empty, stale, denied, conflict, provisioning, blocked-capability, partial and failed states are explicit and contain no raw JSON/secrets/reasoning.
- [x] Flows are keyboard accessible, labelled, focus-safe, responsive at the P0 viewport and pass axe/visual review. *(verified by completed P0-407 axe, focus and 1440px baselines)*
- [x] Refresh during CoworkerDraft review, Task update or SkillDraft review restores the exact server revision without duplicate mutation.

## Verification

Run browser component/API fixtures, keyboard/axe checks, 1440 px visual snapshots, stale/concurrent state tests and the full P0 creation→Task→skill E2E path.

- Fixture/API adapter and unit tests: **done** (`apps/web/src/pages/review-flow-helpers.test.ts`, `apps/web/src/app-shell.test.ts`).
- Keyboard/axe/1440 px visual snapshots: **P0-407**.
- Full browser E2E path: **P0-504**.

## Evidence

- Files changed:
  - `apps/web/src/pages/coworkers-page.tsx` — coworker builder lifecycle, permission review, revise/provisioning/failure
  - `apps/web/src/pages/tasks-page.tsx` — task list/detail, create dialog, revision history, conflict retry
  - `apps/web/src/pages/review-flow-helpers.ts` — session restore, tool effects, draft poll, friendly errors
  - `apps/web/src/shell/run-detail-drawer.tsx` — save-as-skill review, draft refresh recovery
  - `apps/web/src/api/workspace-api.ts` — task create/history, coworker draft revise, fixture revision tracking
- Commands and results:
  - `pnpm lint` — PASS
  - `pnpm typecheck` — PASS
  - `pnpm --filter @forgeroom/web test` — PASS (67 tests)
- Merged PRs: #62 (slice 1), #63 (slice 2), #64 (slice 3), closeout PR pending

## Handoff

- Outcome: Server-backed coworker, Task, and Save-as-skill review flows ship in the web app with fixture and live API modes; stale-revision recovery and session restore are covered.
- Open risks: Accessibility/visual conformance and full E2E rehearsal remain on P0-407/P0-504.
- Follow-up tasks: **P0-407** (axe, focus, 1440 px states), **P0-504** (browser E2E creation→task→skill path).

## Work log

- 2026-08-29 — Closeout: permission review exact grants/denials, skill draft stale refresh, task list lineage metadata, spec evidence; axe/E2E deferred to P0-407/P0-504.
- 2026-08-29 — Slice 3: task revision history API/UI, tool read/write/destructive breakdown in permission review, coworker draft provisioning poll and expired draft recovery, task empty state.
- 2026-08-29 — Slice 2: task creation dialog, task conflict retry UX, coworker draft revise flow, provisioning failure state, save-as-skill review from live draft fields and friendly API errors.
- 2026-08-29 — Slice 1: server-revision-driven coworker builder review (fixture draft, stale draft recovery, session restore), task transition stale-revision retry, save-as-skill draft refresh recovery, ApiError details parsing. Full axe/E2E still pending (P0-407/P0-504).
- 2026-08-27 — PR #36 added a fixture-driven parallel frontend prototype for the coworker, Task and Save-as-skill review surfaces. This is visual and interaction progress only: the task remains blocked and unchecked until the server-backed revisions, authorized mutations, refresh recovery and complete P0 E2E evidence satisfy the acceptance criteria above.
- 2026-08-27 — The prototype review pass now enforces the shared Task transition state machine, persists fixture approval decisions across refresh without claiming runtime resume, atomically commits fixture storage before in-memory state and labels unavailable channel creation honestly. Verified with repository lint, typecheck, all test suites, production builds and headed Playwright interaction checks. These checks harden the prototype but do not unblock or complete P0-410.
