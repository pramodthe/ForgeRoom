---
id: P0-302
title: Implement connector and AgentSpec manifest verification
status: blocked
owner: unassigned
depends_on: [P0-201, P0-301]
requirements: [TL-006, TL-007, CN-002, CN-003]
specs: [../runtime.md#startup-verification]
adrs: [ADR-003]
touches: [packages/integrations/trueforge, packages/integrations/composio]
---

# P0-302 — Implement connector and AgentSpec manifest verification

## Outcome

Startup independently proves the connector surface and compiled coworker enable/approval policy, failing closed on drift.

## Acceptance criteria

- [ ] Exact connector tool names, schemas and annotations match checked-in descriptor hashes.
- [ ] No unexpected tool appears in a coworker's compiled allowlist.
- [ ] Literal enabled-tools and approval-required sets match policy hashes.
- [ ] Exact pinned account status is active.
- [ ] Missing, added, changed, expired or unapproved surfaces make health fail and block dispatch.

## Verification

Run passing live preflight and fixtures for missing tool, added tool, schema change, lost approval rule and expired account.

## Completion evidence

- Tests/results:
- Redacted preflight:
