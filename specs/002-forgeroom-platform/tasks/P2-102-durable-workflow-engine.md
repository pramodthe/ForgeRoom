---
id: P2-102
title: Implement the durable workflow execution engine
status: blocked
owner: unassigned
depends_on: [P1-101, P2-101]
requirements: [PLAT-004, WF-006, WF-007, WF-008, WF-011, WF-012]
specs: [../workflows.md, ../architecture.md, ../data-model.md, ../contracts/api.md, ../contracts/events.md]
release_gate: required
---

# P2-102 — Implement durable workflow execution

## Outcome

Published workflows execute durably with idempotent steps, bounded retries, stoppability, visible failure and the same approval/action gateways as interactive Runs.

## Acceptance criteria

- [ ] WorkflowRun/StepRun state machines use compare-and-set claims, heartbeat/lease recovery and immutable attempt history.
- [ ] Idempotency/deduplication keys bind workflow version, trigger occurrence and step semantics.
- [ ] Retry/backoff/timeout budgets are bounded; permanent failure reaches visible dead-letter state.
- [ ] External effects use the canonical proposal, approval, dispatch and reconciliation path—never a workflow-specific bypass.
- [ ] Pause/resume/cancel and operator recovery are safe under worker death and duplicate delivery.
- [ ] Run history links triggers, inputs, outputs, context, artifacts, records, approvals, costs and destination events.
- [ ] Normalized execution links reconstruct canonical application Run/RunStep, proposals/approvals, record commands, handoffs, notifications and audit lineage; terminal output/cost/destination manifests are immutable and hash-verifiable.

## Verification

Run crash-at-every-transition, duplicate claim/delivery, timeout/retry, stop, required-action and unknown-provider-outcome tests.

## Evidence

- State-machine tests:
- Failure/recovery trace:
