---
id: P0-201
title: Implement TrueForge adapter and session provisioner
status: done
owner: cursor-agent
started: 2026-08-26
completed: 2026-08-26
depends_on: [P0-000, P0-103, P0-105]
requirements: [AG-005, AG-011, SK-002, TL-006]
specs: [../runtime.md#session-topology, ../runtime.md#sessionrevision-compilation]
adrs: [ADR-001]
touches: [packages/integrations/trueforge, packages/orchestration, apps/api]
---

# P0-201 — Implement TrueForge adapter and session provisioner

## Outcome

Adding a coworker to a channel creates a distinct TrueForge session from an immutable internal SessionRevision.

## Acceptance criteria

- [x] SessionRevision snapshots profile, model, sandbox, pinned skill versions, connector and tool settings; P0 compiles native subagents off.
- [x] Effective spec and approval-policy hashes are stored.
- [x] Two coworkers in one channel receive different TrueForge session IDs.
- [x] Stable logical-session row points to an immutable generation row containing the exact TrueForge session/config hashes; turns bind that generation.
- [x] Inline spec contains only confirmed connectors, literal enabled/approval tools and exact immutable skill packages.
- [x] `native_subagents`, coordinator planning and `iframe_v1` are absent or explicitly disabled in every P0 compiled agent/session definition.
- [x] Provider credentials remain server-side.

## Verification

Run adapter unit tests and a live session create/get probe using the seeded profiles.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/trueforge test`
  - `pnpm --filter @forgeroom/orchestration test`
  - `pnpm --filter @forgeroom/api exec vitest run src/workspace/session-provision.test.ts`
- Redacted session IDs/spec hashes:
  - Live create/get 2026-08-26: two sessions suffixes `bfkzn7` / `293bpm` (distinct); `dynamic_sub_agents.enabled=false`, `generative_ui.enabled=false`

## Work log

- 2026-08-26 — Claimed after P0-105 merge. Implemented TrueForge client + P0 AgentSpec compiler, SessionRevision/provisioner, API persist + provision on channel coworker add when `TRUEFORGE_BASE_URL` is set.
