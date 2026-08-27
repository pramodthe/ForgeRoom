---
id: P0-203
title: Implement turn creation and normalized event ingestion
status: in_progress
owner: cursor-agent
started: 2026-08-26
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

- [x] Every turn has deterministic application token and explicit predecessor.
- [x] Uncertain create queries history before any new create.
- [x] Canonical events dedupe by AgentTurn/event ID and stream cursor is tracked separately.
- [x] Reasoning, signatures, headers, credentials and arbitrary tool bodies are not persisted.
- [x] `turn.done` with required actions closes AgentTurn but keeps RunStep nonterminal.
- [x] Only empty required actions permit terminal RunStep normalization.

## Verification

Run delta/replay fixtures, redaction tests, lost-create simulation and required-actions integration test.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/trueforge test`
  - `pnpm --filter @forgeroom/orchestration test`
  - `pnpm --filter @forgeroom/db test -- turn-lifecycle`
  - `pnpm --filter @forgeroom/worker test`
- Redacted normalized trace:
  - Lost-create reconcile binds existing TF turn without second create
  - `turn.done` + `required_actions` → AgentTurn `required_actions`, RunStep `awaiting_approval`, event deduped by `(agent_turn_id, trueforge_event_id)`
  - Forbidden keys stripped from persisted `normalized_payload_redacted_json`

## Work log

- 2026-08-26 — Claimed after P0-202 merge (#24). TrueForge createTurn/listTurns client; deterministic token+predecessor intent; history reconcile before create; event redaction/dedupe; worker `create_or_reconcile_turn` + `ingest_trueforge_event`.
