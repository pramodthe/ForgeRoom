---
id: P0-305
title: Implement real Composio read path
status: blocked
owner: unassigned
depends_on: [P0-201, P0-203, P0-303]
requirements: [TL-001, TL-004, RUN-005]
specs: [../runtime.md#composio-session, ../contracts/events.md#tools-and-connections]
adrs: [ADR-003]
touches: [packages/integrations, packages/orchestration]
---

# P0-305 — Implement real Composio read path

## Outcome

A persistent coworker invokes the selected real read through TrueForge and the channel receives a safe attributed result.

## Acceptance criteria

- [ ] Preflight verifies exact account and tool before dispatch.
- [ ] TrueForge invokes the direct tool, not a wrapper meta-tool.
- [ ] Normalized event shows coworker, tool, safe request and result summary.
- [ ] Raw result body and credentials are not persisted or sent to browser.
- [ ] Expired auth produces blocked connection.

## Verification

Run live read, expired-account and raw-payload redaction integration tests.

## Completion evidence

- Redacted trace:
- Tests/results:
