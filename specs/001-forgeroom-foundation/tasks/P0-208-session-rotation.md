---
id: P0-208
title: Implement capability intersection and session rotation
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-202, P0-302, P0-314]
requirements: [AG-007, CW-007, CN-006, SK-004, SK-005, TL-004, TL-006, TL-007, AP-006, GUI-005]
specs: [../runtime.md#session-rotation, ../security.md#authorization-and-capability-calculation]
adrs: [ADR-001, ADR-003]
touches: [packages/orchestration, packages/integrations, packages/db]
---

# P0-208 — Implement capability intersection and session rotation

## Outcome

Effective tools are server-computed and every capability-affecting change safely replaces immutable TrueForge session generations.

## Acceptance criteria

- [x] Tool, controlled-component and pinned-skill set equals the complete policy/grant/account/AgentSpec intersection.
- [x] Restriction blocks claims, requests cancellation and stales old actions.
- [x] New SessionRevision and TrueForge session are created before atomic swap.
- [x] Rotation inserts an immutable generation-history row and atomically swaps the stable logical session's current_generation_id without overwriting old TrueForge IDs/hashes.
- [x] Valid normal queue items may rebind; response intents never migrate.
- [x] Old generation is retained for audit and cannot accept new work.
- [x] Already-running MCP outcome is recorded/reconciled rather than denied by claim.
- [x] Component publication/grant/descriptor changes rotate the offered-tool session revision; stale calls still fail the call-time recheck.
- [x] P0 skill attach/detach changes rotate only affected sessions; a skill cannot expand the underlying tool, account, data or approval authority. Upgrade/deprecate/revoke lifecycle begins in P1.

## Verification

Run grant-add, grant-remove, account-revoke, policy-tighten and active-MCP rotation tests.

## Work log

- 2026-08-27 — Claimed in parallel with P0-309/P0-304. Implemented capability intersection + session rotation in orchestration/db; API helper for owned-session rotation; coworker update returns affected session_rotations. Avoided composio write / connections surfaces.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test` — 106 passed (13 capability-intersection + rotation plan + rotator)
  - `pnpm --filter @forgeroom/orchestration typecheck`
  - `pnpm --filter @forgeroom/db test -- session-rotation` — 4 session-rotation integration tests passed (within 49 package tests)
  - `pnpm --filter @forgeroom/db typecheck`
  - `pnpm --filter @forgeroom/api typecheck`
- Redacted generations/spec hashes: `provider-fixtures/composio/session-rotation.verified.json`
