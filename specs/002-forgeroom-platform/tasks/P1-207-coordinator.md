---
id: P1-207
title: Implement optional coordinator planning and synthesis
status: blocked
owner: unassigned
depends_on: [P1-000, P1-101, P1-103]
requirements: [AOR-001, AOR-002, AOR-003, AOR-004, AOR-005, AOR-006]
specs: [../advanced-orchestration.md, ../data-model.md, ../contracts/api.md#optional-advanced-orchestration, ../contracts/events.md, ../../001-forgeroom-foundation/runtime.md#routing]
adrs: [ADR-001]
touches: [packages/contracts, packages/domain, packages/db, packages/orchestration, apps/api, apps/worker, apps/web, packages/ui]
release_gate: optional
---

# P1-207 — Implement optional coordinator planning and synthesis

## Outcome

A configured coordinator may create a validated one-hop plan and synthesize only when requested after every child is truly terminal.

This is non-gating for 0.2 and remains disabled until its task and security tests pass.

## Acceptance criteria

- [ ] Structured DispatchPlan has at most two bounded assignments.
- [ ] The persisted/versioned plan type uses closed typed objective, expected-output and per-assignment budget schemas and retains configuration/source-message/run lineage.
- [ ] Governed channel configuration is disabled by default, binds an active channel-member coordinator and revision/budgets, and exposes an accessible trusted enable/disable/synthesis control.
- [ ] Unknown, disabled, non-member, cross-channel, recursive, duplicate and over-budget assignments fail before child creation.
- [ ] One repair attempt is allowed, then visible planning error.
- [ ] Direct mentions work without coordinator planning.
- [ ] Synthesis is optional, source-links each child result and never starts for a child with unresolved required actions, questions or component interrupts.
- [ ] Without synthesis, child results remain independently visible; with synthesis, their immutable result/audit history is not rewritten.

## Verification

Run schema/adversarial plan tests, configuration authorization/CAS tests, browser enable/disable/replay checks and an integration test where one child awaits approval while another completes.

## Completion evidence

- Tests/results:
