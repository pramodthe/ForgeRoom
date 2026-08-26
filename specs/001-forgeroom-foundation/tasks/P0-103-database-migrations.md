---
id: P0-103
title: Implement database schema and migrations
status: done
owner: cursor-agent
started: 2026-08-25
depends_on: [P0-102]
requirements: [CH-004, AG-010, TR-001, SK-001, AGUI-002, GUI-004, GUI-011, AP-007, AP-013, AU-002]
specs: [../data-model.md]
adrs: [ADR-002, ADR-004]
touches: [packages/db]
---

# P0-103 — Implement database schema and migrations

## Outcome

An empty PostgreSQL database migrates to the complete P0 schema with concurrency-critical constraints enforced by the database.

## Acceptance criteria

- [x] Every required P0 entity and relation is migrated.
- [x] Channel sequence, CoworkerDraft, Task/TaskRevision/TaskGrant, Skill/SkillVersion/SkillBinding, stable logical session/thread, immutable session-generation history/current pointer, remote-active turn, UIComponentInterrupt, PauseGroup, RequiredAction, PauseResume and decision uniqueness constraints exist.
- [x] Component/version/grant, independent UI render/state revision, controlled renderer/validated-props/data/state hashes, interaction-token/idempotency and atomic grant-use constraints exist.
- [x] P0 migrations contain no iframe classification/source/body/bootstrap/CSP/verifier/delivery-capability fields or generated-origin tables; the separately gated P1 migration adds them if implemented.
- [x] UI interaction constraints distinguish render-node identity from component-version identity and enforce the P0 `prepared → token_issued → terminal` combinations; trusted-confirmation columns/states are absent.
- [x] Append-only audit writes have no update/delete application path.
- [x] Forward migration and clean rollback strategy are documented.
- [x] Constraint tests fail the intended duplicate/concurrent writes.

## Verification

Run migrations against an empty database and integration tests for every named invariant.

## Completion evidence

- Migration files:
  - `packages/db/migrations/0001_p0_foundation.sql`
  - `packages/db/migrations/0001_p0_foundation.down.sql`
  - `packages/db/migrations/0002_session_workspace_boundary.sql`
  - `packages/db/migrations/0002_session_workspace_boundary.down.sql`
  - `packages/db/MIGRATIONS.md`
- Other files: `packages/db/src/{schema,migrate,migrate-cli,client,index,test-harness}.ts`, constraint/exclusion tests, `.github/workflows/ci.yml` Postgres service, README migrate docs.
- Commands: exact Node 22.12.0 / pnpm 10.34.5 frozen install, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, import smoke, and `git diff --check` — all passed (2026-08-26).
- Constraint tests/results (`@forgeroom/db` 11 passed):
  - empty DB migrates, rolls back, and migrates forward again
  - concurrent forward/rollback callers serialize under one transaction-scoped advisory lock
  - concurrent current-generation assignment and retirement serialize on the generation row
  - existing stable sessions receive their channel workspace during the boundary migration
  - legacy cross-workspace sessions are identified before enforcement and a corrected retry succeeds
  - duplicate channel sequence, native-subagent flag, and duplicate `(channel, coworker)` session rejected
  - immutable CoworkerDraft body/hash-revision, TaskRevision uniqueness + append-only, SkillVersion uniqueness, active SkillBinding uniqueness, immutable generation history, and live current-generation pointer
  - claimed queue items require exact generation binding; AgentTurn session/generation/queue/run-step/type ownership is composite-bound; one remote-active AgentTurn
  - unique PauseGroup/RequiredAction/PauseResume; CAS allow/deny (one winner); immutable ActionProposal authority and single-assignment decision lifecycle
  - immutable UI render/state revisions; render vs state shape; immutable grant authority with monotonic use/revocation; `render_node_id` is not an FK to component versions; interaction token/idempotency/lifecycle; no `awaiting_confirmation`
  - grant `use_count <= max_uses`; audit update/delete rejected
  - static + `information_schema` scan finds no generated-document/trusted-confirmation columns
- Known limitations: HTTP handlers, owner seed, and demo fixtures remain later tasks. Generated-document tables stay out of this migration.
- Merged: PR #4 (`d7b6273`) after Qodo findings were marked implemented; local CI suite green. GitHub Actions did not create runs for the PR/merge (Actions delivery issue); merge proceeded with local verification.

## Work log

- 2026-08-25 — Claimed by cursor-agent.
  - Outcome: empty PostgreSQL migrates to the complete P0 schema with concurrency-critical constraints enforced by the database.
  - Expected changes: `packages/db` schema, SQL migrations, migrate/rollback runner, constraint tests, CI Postgres service.
  - Requirements: CH-004, AG-010, TR-001, SK-001, AGUI-002, GUI-004, GUI-011, AP-007, AP-013, AU-002.
  - Non-goals: HTTP handlers (P0-104+), demo fixtures (P0-105), AG-UI/CopilotKit packages (P0-210/P0-211), P1 iframe/open-UI tables, seeding owner auth.
  - Verification: migrate an empty database; `pnpm lint && pnpm typecheck && pnpm test && pnpm build`; constraint tests for duplicate/concurrent writes and P0 exclusions.
- 2026-08-25 — Implementation complete; moved to in_review. Qodo rules search returned no matching standards.
- 2026-08-26 — Addressed all seven Qodo findings: live generation pointers, exact queue/turn ownership, immutable replay/proposal/grant authority, and advisory-locked migration/rollback paths now have database integration coverage.
- 2026-08-26 — Closed the follow-up current-generation race by locking the candidate generation during pointer validation and covering the two-connection assignment/retirement interleaving.
- 2026-08-26 — Added a follow-up migration that composite-binds stable sessions, channels, and coworkers to the same workspace and rejects cross-tenant session creation.
- 2026-08-26 — Serialized session writes across migration 0002 validation, backfill, and constraint enforcement to prevent concurrent inserts from bypassing the preflight.
- 2026-08-26 — Independent review accepted after merge to `main` (`d7b6273`); Qodo findings marked implemented; moved to `done`.

## Handoff

- Outcome: An empty PostgreSQL database migrates to the P0 schema with uniqueness, CAS, append-only audit, and controlled-UI interaction constraints enforced in the database.
- Open risks: GitHub Actions failed to schedule runs for PR #4 / its merge commit; local suite was green. Investigate Actions delivery separately.
- Follow-up tasks: P0-104 unblocked; P0-000 remains independently ready and should start soon (blocks fixtures, TrueForge, Composio, AG-UI, Daytona, GenUI).
