---
id: P0-105
title: Build idempotent demo fixtures
status: blocked
owner: unassigned
depends_on: [P0-000, P0-103, P0-104]
requirements: [AG-001, AG-010, TR-001, SK-001]
specs: [../demo.md#demo-fixture-requirements]
adrs: [ADR-005]
touches: [packages/test-fixtures, scripts]
---

# P0-105 — Build idempotent demo fixtures

## Outcome

One command creates the owner, workspace, channel, one seeded coworker, exact input/expected-output fixtures for the later CoworkerDraft/Task/Save-as-skill flows, and synthetic provider data without duplicates.

## Acceptance criteria

- [ ] Fixture roles are configuration data, not hardcoded classes.
- [ ] The second-coworker prompt and expected permission diff are fixture data; P0-213/P0-504 create the actual second coworker through the production path.
- [ ] Task input and safe completed-Run evidence fixtures are deterministic; P0-109/P0-318 create canonical Task/Skill rows through production services.
- [ ] No fixture requires native subagents, coordinator synthesis or open-generated UI.
- [ ] Running seed/reset twice yields the same logical state.
- [ ] No personal or production data is used.
- [ ] Pinned connector metadata uses redacted identifiers; credentials stay in secrets.
- [ ] Reset cannot target an unrecognized provider account or record.

## Verification

Run seed, inspect counts/IDs, run reset and seed twice, then execute fixture safety assertions.

## Completion evidence

- Commands/results:
- Safe fixture identifiers:
