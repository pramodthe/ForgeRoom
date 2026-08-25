---
id: P0-102
title: Create shared domain and API contracts
status: blocked
owner: unassigned
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
- Test names/results:
