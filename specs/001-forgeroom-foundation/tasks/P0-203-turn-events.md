---
id: P0-203
title: Implement turn creation and normalized event ingestion
status: blocked
owner: unassigned
depends_on: [P0-107, P0-202]
requirements: [RUN-005, RUN-006, AU-001, AU-004]
specs: [../runtime.md#turn-creation-and-crash-reconciliation, ../runtime.md#event-normalization, ../contracts/events.md]
adrs: [ADR-002]
touches: [packages/integrations/trueforge, packages/orchestration, apps/worker]
---

# P0-203 — Implement turn creation and normalized event ingestion

## Outcome

Turns are crash-reconcilable and TrueForge activity becomes safe, deduplicated application events.

## Acceptance criteria

- [ ] Every turn has deterministic application token and explicit predecessor.
- [ ] Uncertain create queries history before any new create.
- [ ] Canonical events dedupe by AgentTurn/event ID and stream cursor is tracked separately.
- [ ] Reasoning, signatures, headers, credentials and arbitrary tool bodies are not persisted.
- [ ] `turn.done` with required actions closes AgentTurn but keeps RunStep nonterminal.
- [ ] Only empty required actions permit terminal RunStep normalization.

## Verification

Run delta/replay fixtures, redaction tests, lost-create simulation and required-actions integration test.

## Completion evidence

- Tests/results:
- Redacted normalized trace:
