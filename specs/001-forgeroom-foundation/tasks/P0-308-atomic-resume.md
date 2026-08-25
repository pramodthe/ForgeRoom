---
id: P0-308
title: Implement atomic response-only resume
status: blocked
owner: unassigned
depends_on: [P0-202, P0-211, P0-306, P0-307]
requirements: [AP-007, AP-009, AP-010, AP-011, AP-013]
specs: [../runtime.md#atomic-pausegroup-resume]
adrs: [ADR-004]
touches: [packages/orchestration, packages/integrations/ag-ui, apps/api, apps/worker, packages/db]
---

# P0-308 — Implement atomic response-only resume

## Outcome

One compare-and-swap-controlled durable intent resumes a complete PauseGroup with approvals and question responses only.

## Acceptance criteria

- [ ] Group cannot resume until all items resolve.
- [ ] CAS and unique constraint create one PauseResume.
- [ ] Encrypted response payload is persisted before network call.
- [ ] Turn contains complete responses and no normal message.
- [ ] Lost create response becomes uncertain and reconciles from history.
- [ ] Competing worker observes existing resume and never creates another.
- [ ] `RunAgentInput.resume` is enabled only by delegating to this same membership/binding/completeness/expiry/CAS/idempotency service; forged interrupt IDs or direct payloads cannot bypass RequiredAction decisions.
- [ ] Ciphertext expires after confirmed recovery window.

## Verification

Run mixed-action, concurrent-worker, forged direct-AG-UI-resume, crash-before/after-create and history-reconciliation integration tests.

## Completion evidence

- Tests/results:
- Redacted resume trace:
