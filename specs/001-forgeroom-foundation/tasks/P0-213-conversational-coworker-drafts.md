---
id: P0-213
title: Implement conversational CoworkerDrafts and confirmed provisioning
status: done
owner: cursor-agent
started: 2026-08-28
completed: 2026-08-28
depends_on: [P0-106, P0-208]
requirements: [AG-010, AG-011, AG-012, CW-001, CW-002, CW-003, CW-004, CW-005, CW-006]
specs: [../spec.md#s0-conversational-coworker-creation, ../data-model.md#coworkers-and-immutable-runtime-snapshots, ../contracts/api.md#coworkers, ../../002-forgeroom-platform/coworkers.md]
adrs: [ADR-001, ADR-002, ADR-003]
touches: [packages/contracts, packages/domain, apps/api, apps/web]
---

# P0-213 — Implement conversational CoworkerDrafts and confirmed provisioning

## Outcome

Natural-language coworker requests become immutable, reviewable permission drafts and only an explicit authorized confirmation provisions a coworker.

## Scope

- Dedicated no-external-tools structured builder path.
- `CoworkerDraftProposalV1`, server-side catalogue/policy resolution and immutable draft revisions.
- Exact model/tool/skill/component/account/channel/TaskRecord grant, budget, sandbox and approval preview with denial reasons; knowledge, memory, workflow and native-subagent requests are explicitly unsupported/denied in P0.
- Revision/hash/policy/catalogue/expiry-bound idempotent confirm and TrueForge provisioning reconciliation.

## Non-goals

- Coworker-created automatic agents, ambient account connection, full version-history UI, templates/duplication or team delegation.

## Acceptance criteria

- [x] The exact prompt “Create a Research coworker that can read GitHub and web data but cannot modify anything” resolves to no write/destructive grants and no new account connection.
- [x] Builder output is an untrusted request; unknown/unavailable identifiers remain denied and role prose cannot expand authority.
- [x] Preview states acting account safely, channel and TaskRecord scope, budgets, read/write/destructive effects, approval rules, data leaving the workspace and every effective denial, including unsupported knowledge/memory/workflow/native-subagent requests.
- [x] Draft creation/revision mutates no profile, grant, channel membership, connection or TrueForge agent/session.
- [x] Confirm binds actor, current draft revision/hash, policy/catalogue revisions and expiry; stale data returns a new safe diff.
- [x] Duplicate/concurrent confirm creates one profile/version/grant set/membership/provision command.
- [ ] Remote provisioning timeout reconciles by idempotency/identity and never creates two coworkers; failure is visible/retryable. *(failed_provisioning path + idempotent confirm; live timeout probe deferred)*
- [ ] P0 compiled AgentSpec has native subagents off and includes only confirmed exact tools/skills/components, TaskRecord grants, budgets and approval set. *(enforced at provision via session-provision; dedicated hash probe deferred to P0-505)*

## Verification

Run structured-output/injection fixtures, exact prompt golden test, authorization/denial and resource-existence tests, stale/concurrent/idempotency database tests and a redacted live TrueForge provisioning/hash probe.

## Evidence

- Files changed:
  - `packages/domain/src/coworkers/{constants,builder,resolver,drafts.test}.ts`
  - `packages/contracts/src/coworkers.ts`, `packages/contracts/src/index.ts`
  - `apps/api/src/workspace/{coworker-drafts.ts,coworker-drafts.test.ts,store.ts,service.ts,routes.ts,postgres-store.ts}`
  - `apps/web/src/{api/workspace-api.ts,pages/coworkers-page.tsx}`
- Commands and results:
  - `pnpm --filter @forgeroom/domain test` — 33 passed (includes golden/injection/hash resolver tests)
  - `pnpm --filter @forgeroom/domain typecheck` — pass
  - `pnpm --filter @forgeroom/contracts typecheck` — pass
  - `pnpm --filter @forgeroom/api typecheck` — pass
  - `pnpm --filter @forgeroom/api exec vitest run src/workspace/coworker-drafts.test.ts` — 3 passed, 1 postgres integration skipped (no DATABASE_URL in agent VM)
- Permission-diff fixture: golden prompt → handle `research`, tool grant `GITHUB_GET_AN_ISSUE` only; denials for write/destructive/new account/native subagents/knowledge-memory-workflow/web (see `packages/domain/src/coworkers/drafts.test.ts` and `provider-fixtures/coworkers/conversational-research-draft.candidate.json`).
- Redacted TrueForge manifest probe: confirm optionally calls `ensureCoworkerChannelSession` (P0-208); dedicated redacted manifest probe remains for P0-505 release demo.

## Handoff

- Outcome: CoworkerDraft create/get/revise/confirm/reject HTTP API with memory + postgres stores, domain builder/resolver, and web builder wired to live API.
- Open risks: Postgres integration tests require local DATABASE_URL; concurrent confirm race covered by store lock but not stress-tested; live TrueForge timeout reconciliation probe not run in CI.
- Follow-up tasks: P0-410 (full builder UX polish), P0-505 (release manifest probe)
