---
id: P0-213
title: Implement conversational CoworkerDrafts and confirmed provisioning
status: ready
owner: unassigned
depends_on: [P0-106, P0-208]
requirements: [AG-010, AG-011, AG-012, CW-001, CW-002, CW-003, CW-004, CW-005, CW-006]
specs: [../spec.md#s0-conversational-coworker-creation, ../data-model.md#coworkers-and-immutable-runtime-snapshots, ../contracts/api.md#coworkers, ../../002-forgeroom-platform/coworkers.md]
adrs: [ADR-001, ADR-002, ADR-003]
touches: [packages/contracts, packages/domain, packages/db, packages/integrations/trueforge, apps/api, apps/worker]
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

- [ ] The exact prompt “Create a Research coworker that can read GitHub and web data but cannot modify anything” resolves to no write/destructive grants and no new account connection.
- [ ] Builder output is an untrusted request; unknown/unavailable identifiers remain denied and role prose cannot expand authority.
- [ ] Preview states acting account safely, channel and TaskRecord scope, budgets, read/write/destructive effects, approval rules, data leaving the workspace and every effective denial, including unsupported knowledge/memory/workflow/native-subagent requests.
- [ ] Draft creation/revision mutates no profile, grant, channel membership, connection or TrueForge agent/session.
- [ ] Confirm binds actor, current draft revision/hash, policy/catalogue revisions and expiry; stale data returns a new safe diff.
- [ ] Duplicate/concurrent confirm creates one profile/version/grant set/membership/provision command.
- [ ] Remote provisioning timeout reconciles by idempotency/identity and never creates two coworkers; failure is visible/retryable.
- [ ] P0 compiled AgentSpec has native subagents off and includes only confirmed exact tools/skills/components, TaskRecord grants, budgets and approval set.

## Verification

Run structured-output/injection fixtures, exact prompt golden test, authorization/denial and resource-existence tests, stale/concurrent/idempotency database tests and a redacted live TrueForge provisioning/hash probe.

## Evidence

- Files changed:
- Commands and results:
- Permission-diff fixture:
- Redacted TrueForge manifest probe:

## Handoff

- Outcome:
- Open risks:
- Follow-up tasks: P0-410
