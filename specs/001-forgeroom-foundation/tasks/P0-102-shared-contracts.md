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
touches: [packages/contracts, packages/domain, apps/web, apps/api, apps/worker]
---

# P0-102 — Create shared domain and API contracts

## Outcome

Browser, API and worker use one Zod-based contract set for all P0 commands, states and normalized events.

## Acceptance criteria

- [x] Protocol-neutral application contracts exist for identity, channels, coworkers, CoworkerDrafts, Tasks, private Skills, Runs, RunSteps, durable event envelopes, PauseGroups, approvals, questions, artifacts, controlled components, UIInstances, interactions and receipts.
- [x] Run lifecycle and concurrent activity counters are distinct.
- [x] CoworkerDraft proposal/revision/confirmation, Task/TaskRevision/TaskGrant and SkillDraft/SkillVersion/SkillBinding schemas are closed and versioned.
- [x] Persistent-coworker logical threads are distinct from future native-subagent invocation IDs; P0 rejects native child events as unsupported.
- [x] Controlled component manifest, props, activity, shared state and interaction schemas are closed and versioned.
- [x] `iframe_v1`, generated-document delivery and open-UI wire records are absent from the P0 runtime export and parse to a typed unsupported-capability result.
- [x] Durable envelope correlation fields and application activity/state revision rules are provider-neutral; channel system state and thread-local state are distinct types.
- [x] Exact upstream `@ag-ui/*` schema adapters and exports are deliberately owned by P0-211 after P0-210 freezes the package profile.
- [x] Safe payload contracts cannot carry known credential/reasoning fields.
- [x] Browser and worker packages import rather than duplicate schemas.

## Verification

Run typecheck, contract parse/reject unit tests and public-package boundary tests.

## Completion evidence

- Files changed:
  - `packages/contracts/src/{index,primitives,errors,identity,channels,coworkers,tasks,skills,runs,connections,pause,artifacts,components,state,events,unsupported,boundary}.ts`
  - `packages/contracts/src/{index,payload-safety,records,commands,pause,components,events,unsupported}.test.ts`
  - `packages/domain/src/{index,boundary,transitions}.ts` and `packages/domain/src/index.test.ts`
  - `apps/web/src/app-name.ts`, `apps/web/src/app-name.test.ts`, `apps/web/package.json`
  - `apps/api/src/server.test.ts`, `apps/api/package.json`, `pnpm-lock.yaml`
  - `apps/worker/src/{index,index.test}.ts`, `apps/worker/package.json`, `pnpm-lock.yaml`
- Commands: exact Node 22.12 / pnpm 10.34.5 frozen install, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, import smoke, and `git diff --check` — all passed (2026-08-25).
- Test names/results:
  - `@forgeroom/contracts` 59 passed across 8 files: closed P0 command surface; strict 11-variant worker commands; safe nested payloads/prototype keys/finite JSON; activity and state revision/value/authority rules; invariant-safe PauseGroup and controlled-UI deltas; PauseGroup atomic resume and immutable approval identity; controlled component grants, safe replay and interaction boundaries; records, exports and typed P0 unsupported capabilities.
  - `@forgeroom/worker` 2 passed: standalone process and shared-contract validation before production command dispatch.
  - `@forgeroom/domain` 2 passed: schema identity re-export; closed task/run/draft transitions.
  - `@forgeroom/web` imports `CONTRACT_RELEASE` from `@forgeroom/contracts` (not a local duplicate).
  - `@forgeroom/api` imports `errorEnvelopeSchema` and `canTransitionTask`.
- Known limitations: exact `@ag-ui/*` adapters remain `owned_by_P0-211`; no AG-UI/CopilotKit packages are installed; HTTP handlers, database persistence and concrete queue/provider execution remain owned by later implementation tasks.

## Work log

- 2026-08-25 — Claimed by cursor-agent.
  - Outcome: one Zod contract set for P0 commands, states and normalized events, imported by browser/API/worker rather than duplicated.
  - Expected changes: `packages/contracts`, `packages/domain`; web/api import the shared package.
  - Requirements: CH-004, RUN-006, AG-010, TR-001, SK-001, AGUI-003, AGUI-004, GUI-002, GUI-011, GUI-014.
  - Non-goals: `@ag-ui/*` / CopilotKit installs (P0-210/P0-211), Drizzle migrations (P0-103), HTTP handlers, iframe/open-UI runtime.
  - Verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` plus parse/reject and package-boundary tests.
- 2026-08-25 — Implementation complete; moved to in_review. Qodo rules search returned no matching standards.
- 2026-08-25 — Independent review requested changes: safe-payload filtering, JSON Patch revision/path enforcement, approval bindings, controlled-UI contracts, missing P0 commands and worker package consumption remain blocking.
- 2026-08-25 — Addressed all 11 Qodo findings: hardened payload and prototype-key safety; bound activity/state revisions and authority lanes; completed command, PauseGroup, approval, controlled-UI and replay contracts; and routed worker dispatch through the shared discriminated command union.
- 2026-08-25 — Two independent adversarial audits reported no remaining code blockers in the P0-102/Qodo scope; contracts and worker typechecks plus 59 targeted tests passed.
- 2026-08-25 — Addressed two follow-up Qodo correctness findings: invariant-coupled activity and channel-state deltas now prove their base fields with JSON Patch tests and validate the reconstructed final PauseGroup or controlled-UI state; contracts and worker now have 61 targeted tests.

## Handoff

- Outcome: Browser and API import one closed Zod contract set for P0 identity, channels, coworkers, Tasks, Skills, Runs, envelopes, pauses, artifacts, controlled UI, and channel vs thread state; iframe/open-UI and upstream AG-UI adapters fail closed.
- Open risks: no known local P0-102 contract blockers. A fresh Qodo review is pending after the follow-up remediation commit is pushed. P0-211 still owns exact `@ag-ui/*` schema adapters after P0-210 freezes versions.
- Follow-up tasks: P0-103 after this task is reviewed and merged; P0-000 remains independently ready.
