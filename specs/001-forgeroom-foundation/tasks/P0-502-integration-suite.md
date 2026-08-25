---
id: P0-502
title: Complete runtime and integration suite
status: blocked
owner: unassigned
depends_on: [P0-109, P0-204, P0-208, P0-212, P0-213, P0-305, P0-309, P0-312, P0-313, P0-315, P0-318]
requirements: [RUN-002, RUN-003, OR-001, AG-011, TR-002, SK-004, SK-005, AGUI-003, AGUI-005, GUI-011, AP-013, SB-003]
specs: [../test-plan.md#database-and-api-integration, ../test-plan.md#trueforge-integration, ../test-plan.md#composio-integration, ../test-plan.md#ag-ui-and-generative-ui]
adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-006, ADR-007]
touches: [integration-tests]
---

# P0-502 — Complete runtime and integration suite

## Outcome

Database, API, TrueForge, Composio and Daytona integration contracts pass together under concurrency and recovery scenarios.

## Acceptance criteria

- [ ] Queue, two-session concurrency, reconnect and stop tests pass.
- [ ] Required-action semantics, atomic resume and lost-response reconciliation pass.
- [ ] Session rotation and descriptor/account failure paths pass.
- [ ] Live read, deterministic write/reconciliation and artifact publication pass against fixture.
- [ ] Official-client endpoint, durable multiplexed replay, UIInstance persistence and interaction continuation pass together.
- [ ] Coworker confirmation/provisioning reconciliation, Task optimistic concurrency and skill publish/attach/session rotation pass together.
- [ ] No provider-backed result is represented by mock evidence.

## Verification

~~~bash
pnpm test:integration
~~~

## Completion evidence

- Report path:
- Redacted provider trace:
