---
id: P0-309
title: Implement approval-gated deterministic write
status: blocked
owner: unassigned
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

- [ ] Literal write tool is in TrueForge approval-required set.
- [ ] Denial leaves provider fixture unchanged.
- [ ] Changed target/arguments/descriptor/account/generation require a new proposal.
- [ ] Approval creates one application resume intent.
- [ ] Timeout becomes unknown; no automatic retry occurs.
- [ ] Reconciliation read produces succeeded or failed final state.
- [ ] Result is called verified receipt only if adapter verifies it.

## Verification

Run live deny, approve, changed-payload, timeout simulation and read-back tests against resettable synthetic fixture.

## Completion evidence

- Redacted provider before/after:
- Tests/results:
