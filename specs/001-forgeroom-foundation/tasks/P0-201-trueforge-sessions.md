---
id: P0-201
title: Implement TrueForge adapter and session provisioner
status: blocked
owner: unassigned
depends_on: [P0-000, P0-103, P0-105]
requirements: [AG-005, AG-011, SK-002, TL-006]
specs: [../runtime.md#session-topology, ../runtime.md#sessionrevision-compilation]
adrs: [ADR-001]
touches: [packages/integrations/trueforge, packages/orchestration]
---

# P0-201 — Implement TrueForge adapter and session provisioner

## Outcome

Adding a coworker to a channel creates a distinct TrueForge session from an immutable internal SessionRevision.

## Acceptance criteria

- [ ] SessionRevision snapshots profile, model, sandbox, pinned skill versions, connector and tool settings; P0 compiles native subagents off.
- [ ] Effective spec and approval-policy hashes are stored.
- [ ] Two coworkers in one channel receive different TrueForge session IDs.
- [ ] Stable logical-session row points to an immutable generation row containing the exact TrueForge session/config hashes; turns bind that generation.
- [ ] Inline spec contains only confirmed connectors, literal enabled/approval tools and exact immutable skill packages.
- [ ] `native_subagents`, coordinator planning and `iframe_v1` are absent or explicitly disabled in every P0 compiled agent/session definition.
- [ ] Provider credentials remain server-side.

## Verification

Run adapter unit tests and a live session create/get probe using the seeded profiles.

## Completion evidence

- Tests/results:
- Redacted session IDs/spec hashes:
