---
id: P0-309
title: Implement approval-gated deterministic write
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-305, P0-308]
requirements: [AP-001, AP-006, AP-008, CN-006]
specs: [../runtime.md#toolpolicydefinition, ../security.md#external-write-semantics, ../demo.md]
adrs: [ADR-003, ADR-004]
touches: [packages/orchestration, packages/integrations/composio]
---

# P0-309 — Implement approval-gated deterministic write

## Outcome

The selected real update cannot start before exact approval and its final state is established by tool-specific read reconciliation without blind retry.

## Acceptance criteria

- [x] Literal write tool is in TrueForge approval-required set.
- [x] Denial leaves provider fixture unchanged.
- [x] Changed target/arguments/descriptor/account/generation require a new proposal.
- [x] Approval creates one application resume intent.
- [x] Timeout becomes unknown; no automatic retry occurs.
- [x] Reconciliation read produces succeeded or failed final state.
- [x] Result is called verified receipt only if adapter verifies it.

## Verification

Run live deny, approve, changed-payload, timeout simulation and read-back tests against resettable synthetic fixture.

## Work log

- 2026-08-27 — Claimed after P0-308. Implemented approval-gated deterministic write path: literal `GITHUB_ADD_LABELS_TO_AN_ISSUE` approval-required assert + preflight, binding freshness (AP-006), deny gate with `providerCalls=0`, one PauseResume intent on allow, timeout→`unknown` without auto-retry, `GITHUB_GET_AN_ISSUE` reconcile to final state, verified receipt only when policy adapter verifies. Live deny/approve/reconcile on `#35` passed.

## Completion evidence

- Redacted provider before/after: `provider-fixtures/composio/deterministic-write.verified.json`
- Tests/results:
  - `pnpm --filter @forgeroom/composio test` — pass (54 incl. 12 unit + live P0-309 deny/approve/reconcile)
  - `pnpm --filter @forgeroom/orchestration test -- deterministic-write` — pass (5)
  - `pnpm --filter @forgeroom/composio typecheck` — pass
  - `pnpm --filter @forgeroom/orchestration typecheck` — pass
  - `pnpm --filter @forgeroom/test-fixtures test` — covers verified fixture
