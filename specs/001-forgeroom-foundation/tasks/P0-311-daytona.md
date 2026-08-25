---
id: P0-311
title: Implement Daytona sandbox event path
status: blocked
owner: unassigned
depends_on: [P0-201, P0-203]
requirements: [SB-001, SB-002]
specs: [../runtime.md#sandbox-and-artifact-handoff, ../security.md#sandbox-and-artifact-controls]
adrs: [ADR-005]
touches: [packages/integrations/trueforge, packages/orchestration]
---

# P0-311 — Implement Daytona sandbox event path

## Outcome

One fixture coworker creates a TrueForge Daytona sandbox, streams command state and produces a bounded file using synthetic/public data.

## Acceptance criteria

- [ ] Sandbox and command lifecycle map to normalized events.
- [ ] No application, provider or Composio credential is present in sandbox.
- [ ] Sandbox-enabled profile has no sensitive read tool.
- [ ] Fixture reliably produces expected file.
- [ ] Outbound reachability is measured and sensitive readiness fails when open.

## Verification

Run live sandbox fixture, credential canary absence and egress reachability tests.

## Completion evidence

- Redacted sandbox trace:
- Egress result:
