---
id: P0-102
title: Create shared domain and API contracts
status: in_review
owner: cursor-agent
started: 2026-08-25
depends_on: [P0-101]
requirements: [CH-004, RUN-006, AG-010, TR-001, SK-001, AGUI-003, AGUI-004, GUI-002, GUI-011, GUI-014]
specs: [../contracts/api.md, ../contracts/events.md, ../contracts/ag-ui.md, ../data-model.md, ../generative-ui.md]
adrs: [ADR-002, ADR-006, ADR-007]
touches: [packages/contracts, packages/domain]
---

# P0-102 — Create shared domain and API contracts

## Outcome

Browser, API and worker use one Zod-based contract set for all P0 commands, states and normalized events.

## Acceptance criteria

- [ ] Protocol-neutral application contracts exist for identity, channels, coworkers, CoworkerDrafts, Tasks, private Skills, Runs, RunSteps, durable event envelopes, PauseGroups, approvals, questions, artifacts, controlled components, UIInstances, interactions and receipts.
- [ ] Run lifecycle and concurrent activity counters are distinct.
- [ ] CoworkerDraft proposal/revision/confirmation, Task/TaskRevision/TaskGrant and SkillDraft/SkillVersion/SkillBinding schemas are closed and versioned.
- [ ] Persistent-coworker logical threads are distinct from future native-subagent invocation IDs; P0 rejects native child events as unsupported.
- [ ] Controlled component manifest, props, activity, shared state and interaction schemas are closed and versioned.
- [ ] `iframe_v1`, generated-document delivery and open-UI wire records are absent from the P0 runtime export and parse to a typed unsupported-capability result.
- [ ] Durable envelope correlation fields and application activity/state revision rules are provider-neutral; channel system state and thread-local state are distinct types.
- [ ] Exact upstream `@ag-ui/*` schema adapters and exports are deliberately owned by P0-211 after P0-210 freezes the package profile.
- [ ] Safe payload contracts cannot carry known credential/reasoning fields.
- [ ] Browser package imports rather than duplicates schemas.

## Verification

Run typecheck, contract parse/reject unit tests and public-package boundary tests.

## Completion evidence

- Files changed:
  - `packages/contracts/src/{index,primitives,errors,identity,channels,coworkers,tasks,skills,runs,pause,artifacts,components,state,events,unsupported,boundary}.ts`
  - `packages/contracts/src/{index,payload-safety,records,events,unsupported}.test.ts`
  - `packages/domain/src/{index,boundary,transitions}.ts` and `packages/domain/src/index.test.ts`
  - `apps/web/src/app-name.ts`, `apps/web/src/app-name.test.ts`, `apps/web/package.json`
  - `apps/api/src/server.test.ts`, `apps/api/package.json`, `pnpm-lock.yaml`
- Commands: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all passed (2026-08-25).
- Test names/results:
  - `@forgeroom/contracts` 17 passed: package boundary; P0 export surface (no iframe/open-UI schemas; upstream AG-UI adapters owned by P0-211); safe payload reject credential/reasoning; login password allowed, persisted proposal password rejected; closed CoworkerDraft/confirm; TaskRecord/TaskRevision/TaskGrant; SkillDraft/SkillVersion/SkillBinding; agent-tool vs server-only components; run lifecycle vs activity counters; coworker envelope correlation and native-subagent reject; channel vs thread UI state; ACTIVITY_DELTA revision test/replace; iframe/open-UI/native-subagent/RAW/REASONING typed unsupported.
  - `@forgeroom/domain` 2 passed: schema identity re-export; closed task/run/draft transitions.
  - `@forgeroom/web` imports `CONTRACT_RELEASE` from `@forgeroom/contracts` (not a local duplicate).
  - `@forgeroom/api` imports `errorEnvelopeSchema` and `canTransitionTask`.
- Known limitations: exact `@ag-ui/*` adapters remain `owned_by_P0-211`; no AG-UI/CopilotKit packages installed; HTTP handlers and Drizzle wait for later tasks; `apps/worker` still wraps orchestration only and does not import schemas until event persistence exists.

## Work log

- 2026-08-25 — Claimed by cursor-agent.
  - Outcome: one Zod contract set for P0 commands, states and normalized events, imported by browser/API/worker rather than duplicated.
  - Expected changes: `packages/contracts`, `packages/domain`; web/api import the shared package.
  - Requirements: CH-004, RUN-006, AG-010, TR-001, SK-001, AGUI-003, AGUI-004, GUI-002, GUI-011, GUI-014.
  - Non-goals: `@ag-ui/*` / CopilotKit installs (P0-210/P0-211), Drizzle migrations (P0-103), HTTP handlers, iframe/open-UI runtime.
  - Verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` plus parse/reject and package-boundary tests.
- 2026-08-25 — Implementation complete; moved to in_review. Qodo rules search returned no matching standards.
- 2026-08-25 — Independent review requested changes: safe-payload filtering, JSON Patch revision/path enforcement, approval bindings, controlled-UI contracts, missing P0 commands and worker package consumption remain blocking.

## Handoff

- Outcome: Browser and API import one closed Zod contract set for P0 identity, channels, coworkers, Tasks, Skills, Runs, envelopes, pauses, artifacts, controlled UI, and channel vs thread state; iframe/open-UI and upstream AG-UI adapters fail closed.
- Open risks: review blockers remain in safe-payload filtering, event patch authorization/revisions, approval authority binding, controlled-UI contracts, complete P0 command coverage and worker package consumption. P0-211 still owns exact `@ag-ui/*` schema adapters after P0-210 freezes versions.
- Follow-up tasks: P0-103 after this task is reviewed and merged; P0-000 remains independently ready.
