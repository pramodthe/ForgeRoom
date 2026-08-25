---
id: P0-208
title: Implement capability intersection and session rotation
status: blocked
owner: unassigned
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

- [ ] Tool, controlled-component and pinned-skill set equals the complete policy/grant/account/AgentSpec intersection.
- [ ] Restriction blocks claims, requests cancellation and stales old actions.
- [ ] New SessionRevision and TrueForge session are created before atomic swap.
- [ ] Rotation inserts an immutable generation-history row and atomically swaps the stable logical session's current_generation_id without overwriting old TrueForge IDs/hashes.
- [ ] Valid normal queue items may rebind; response intents never migrate.
- [ ] Old generation is retained for audit and cannot accept new work.
- [ ] Already-running MCP outcome is recorded/reconciled rather than denied by claim.
- [ ] Component publication/grant/descriptor changes rotate the offered-tool session revision; stale calls still fail the call-time recheck.
- [ ] P0 skill attach/detach changes rotate only affected sessions; a skill cannot expand the underlying tool, account, data or approval authority. Upgrade/deprecate/revoke lifecycle begins in P1.

## Verification

Run grant-add, grant-remove, account-revoke, policy-tighten and active-MCP rotation tests.

## Completion evidence

- Tests/results:
- Redacted generations/spec hashes:
