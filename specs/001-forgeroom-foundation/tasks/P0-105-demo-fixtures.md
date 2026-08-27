---
id: P0-105
title: Build idempotent demo fixtures
status: done
owner: cursor-agent
started: 2026-08-26
completed: 2026-08-27
depends_on: [P0-000, P0-103, P0-104]
requirements: [AG-001, AG-010, TR-001, SK-001]
specs: [../demo.md#demo-fixture-requirements]
adrs: [ADR-005]
touches: [packages/test-fixtures, scripts, provider-fixtures]
---

# P0-105 — Build idempotent demo fixtures

## Outcome

One command creates the owner, workspace, channel, one seeded coworker, exact input/expected-output fixtures for the later CoworkerDraft/Task/Save-as-skill flows, and synthetic provider data without duplicates.

## Acceptance criteria

- [x] Fixture roles are configuration data, not hardcoded classes.
- [x] The second-coworker prompt and expected permission diff are fixture data; P0-213/P0-504 create the actual second coworker through the production path.
- [x] Task input and safe completed-Run evidence fixtures are deterministic; P0-109/P0-318 create canonical Task/Skill rows through production services.
- [x] No fixture requires native subagents, coordinator synthesis or open-generated UI.
- [x] Running seed/reset twice yields the same logical state.
- [x] No personal or production data is used.
- [x] Pinned connector metadata uses redacted identifiers; credentials stay in secrets.
- [x] Reset cannot target an unrecognized provider account or record.

## Verification

Run seed, inspect counts/IDs, run reset and seed twice, then execute fixture safety assertions.

## Completion evidence

- Commands/results:
  - `pnpm fixtures:seed` → stable `ch_demo_general` / `cw_demo_operator` / handle `operator`
  - `pnpm fixtures:reset -- --no-provider` twice → same logical IDs
  - `pnpm fixtures:reset -- --provider-only` → guarded Composio label remove (`ok`)
  - Vitest: `packages/test-fixtures/src/demo-seed.test.ts` (seed/reset twice + refuse bad provider targets)
- Safe fixture identifiers: `provider-fixtures/demo-seed.verified.json`

## Work log

- 2026-08-26 — Claimed by cursor-agent on branch `codex/p0-105-demo-fixtures`.
  - Outcome: Idempotent seed/reset from provider-fixtures; Operator only in DB; Research remains draft fixture data.
  - Non-goals: conversational Research create (P0-213); Task/Skill production rows (P0-109/P0-318); purging append-only `channel_events`.

## Handoff

~~~text
Task: P0-105
Outcome: Idempotent demo seed/reset with stable IDs and guarded provider label reset
Requirements: AG-001, AG-010, TR-001, SK-001
Changed: packages/test-fixtures/**, scripts/demo-fixtures.mjs, package.json, provider-fixtures/demo-seed.verified.json, task-record reset command, demo.md
Verified: pnpm --filter @forgeroom/test-fixtures test; pnpm fixtures:seed; fixtures:reset --no-provider; provider-only reset
Evidence: provider-fixtures/demo-seed.verified.json
Open risks: none for seed/reset; P0-000 Save-as-skill Run binding completed 2026-08-27
Next: none — task done (merged via PR #22); continue product tasks
~~~
