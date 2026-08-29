---
id: P0-501
title: Complete unit-test suite
status: done
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

- [x] Sequence, direct routing, CoworkerDraft, Task and skill capability tests pass.
- [x] Session/policy/argument hashing and transition guards pass. *(slices 1 and 3: AgentTurn/PauseGroup/ActionProposal tables + exhaustive ordinary transitions; SC-001 recovery-only AgentTurn guard)*
- [x] ToolPolicyDefinition golden/adversarial tests pass.
- [x] Event normalization/redaction and context exclusion tests pass. *(already covered by orchestration event-normalize + context-envelope units; checkbox close-out)*
- [x] Artifact path/MIME/hash tests pass.
- [x] AG-UI mapping/reducer/patch, controlled component manifest/grant/props/interaction and unsupported P1 capability tests pass. *(slice 2: prop schema adversarial limits + presentation clamps; slice 4: pure interaction-commit CAS helper covered by 12 unit cases, with database integration proof retained)*
- [x] No required P0 unit case is skipped or `.only`-filtered. *(provider-only live probes are classified under integration/E2E; the required local unit graph runs without conditional skips)*

## Verification

~~~bash
pnpm test
pnpm --filter @forgeroom/domain exec vitest run src/transitions.test.ts src/coworkers/drafts.test.ts
pnpm --filter @forgeroom/ui-components exec vitest run src/controlled/validate-props.test.ts src/controlled/presentation-limits.test.ts
pnpm --filter @forgeroom/db exec vitest run src/ui-interactions.unit.test.ts src/ui-interactions.integration.test.ts
~~~

## Completion evidence

- Report path: Vitest `@forgeroom/domain` transitions + drafts; `@forgeroom/ui-components` controlled limits
- Command/result (2026-08-29):
  - `pnpm --filter @forgeroom/domain test` → 17 files / 53 passed (incl. 7 transitions) after slice 1
  - `pnpm --filter @forgeroom/ui-components exec vitest run src/controlled/validate-props.test.ts src/controlled/presentation-limits.test.ts` → 2 files / 22 passed
  - `pnpm --filter @forgeroom/domain exec vitest run src/coworkers/drafts.test.ts` → 5 passed (incl. OD-012 fixture exactDiff)
  - `pnpm --filter @forgeroom/db exec vitest run src/ui-interactions.unit.test.ts src/ui-interactions.integration.test.ts` → 2 files / 21 passed (12 pure CAS cases plus 9 migrated-database interaction cases)
  - `pnpm test` under supported Node 22.20 → passed twice consecutively after applying the shared API database-test timeout; API portion 30 files / 132 tests each run.

## Work log

- 2026-08-29 — Claimed after deps done (was falsely `blocked`). Gap analysis vs test-plan unit list. Slice 1: add `AGENT_TURN_TRANSITIONS` / `PAUSE_GROUP_TRANSITIONS` / `ACTION_PROPOSAL_TRANSITIONS` from `data-model.md` and exhaustive closed-graph unit tests including `canTransitionRunStep`.
- 2026-08-29 — Slice 2: extract `clampToLimit` presentation clamps; adversarial prop-schema tests (chart series, ChoiceForm fields/options, string length, TaskCard/ArtifactCard/ChoiceForm minima); OD-012 Research draft exactDiff/mustIncludeDenials unit lock (in-process constant, no FS I/O); align ChoiceForm schema `maxItems` with `MAX_FORM_FIELDS` so validation rejects rather than silently truncating; resolve STATUS.md merge conflict from parallel P0-501/P0-504 merges. Next: interaction CAS helper extract or skill attach missing-component cases.
- 2026-08-29 — Slice 3: SC-001 separates ordinary AgentTurn transitions from the exact-history reconciliation edge; create and reconciliation bindings carry distinct typed sources and unverified uncertain recovery is rejected.
- 2026-08-29 — Slice 4: extracted the interaction-commit compare-and-swap decision into a production-used pure helper and unit-locked exact/null revision success plus state, token, grant, instance, render/state revision and channel drift failures; retained migrated-Postgres integration coverage for locking and persistence.
