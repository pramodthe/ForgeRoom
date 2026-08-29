---
id: P0-501
title: Complete unit-test suite
status: in_progress
owner: cursor-agent
started: 2026-08-29
depends_on: [P0-108, P0-109, P0-212, P0-213, P0-303, P0-306, P0-312, P0-314, P0-315, P0-316, P0-318]
requirements: [CH-004, AG-010, TR-001, SK-001, AGUI-004, AGUI-006, GUI-002, GUI-004, TL-006, AP-005, ME-001, AU-001]
specs: [../test-plan.md#unit]
adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]
touches: [all-test-packages]
---

# P0-501 — Complete unit-test suite

## Outcome

All unit behaviors required by the canonical test plan are present, deterministic and passing.

## Acceptance criteria

- [ ] Sequence, direct routing, CoworkerDraft, Task and skill capability tests pass. *(largely present; CoworkerDraft permission-diff + Task history still partial)*
- [x] Session/policy/argument hashing and transition guards pass. *(slice 1: AgentTurn/PauseGroup/ActionProposal tables + exhaustive transition unit suite)*
- [ ] ToolPolicyDefinition golden/adversarial tests pass. *(present in composio tool-policies)*
- [ ] Event normalization/redaction and context exclusion tests pass.
- [ ] Artifact path/MIME/hash tests pass. *(present)*
- [ ] AG-UI mapping/reducer/patch, controlled component manifest/grant/props/interaction and unsupported P1 capability tests pass. *(controlled limits + interaction CAS still partial)*
- [x] No P0 unit suite is skipped or `.only`-filtered. *(verified 2026-08-29; one `skipIf(!DATABASE_URL)` on coworker-drafts Postgres path)*

## Verification

~~~bash
pnpm test
pnpm --filter @forgeroom/domain exec vitest run src/transitions.test.ts
~~~

## Completion evidence

- Report path: Vitest `@forgeroom/domain` transitions suite
- Command/result: `pnpm --filter @forgeroom/domain test` → 17 files / 53 passed (incl. 7 transitions)

## Work log

- 2026-08-29 — Claimed after deps done (was falsely `blocked`). Gap analysis vs test-plan unit list. Slice 1: add `AGENT_TURN_TRANSITIONS` / `PAUSE_GROUP_TRANSITIONS` / `ACTION_PROPOSAL_TRANSITIONS` from `data-model.md` and exhaustive closed-graph unit tests including `canTransitionRunStep`.
- Intended non-goals this slice: interaction CAS extraction, controlled-component adversarial limits, skill binding unit layer (follow-up slices).
