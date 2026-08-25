---
id: P2-502
title: Complete the team-beta workflow browser journey
status: blocked
owner: unassigned
depends_on: [P2-501]
requirements: [WF-001, WF-003, WF-007, WF-009, WF-011, TEAM-008]
specs: [../test-plan.md#03-team-beta, ../ux.md]
release_gate: required
---

# P2-502 — Complete beta browser E2E

## Outcome

One production-like journey proves that a team can publish, trigger, approve, inspect and recover a governed cross-channel workflow.

## Acceptance criteria

- [ ] Admin builds/tests/publishes a versioned workflow with schedule and verified event trigger.
- [ ] Trigger deduplicates and Run pauses in the workspace approval inbox for an eligible approver group.
- [ ] Approved effect executes once, updates a record and hands bounded context to a private destination channel.
- [ ] Simulated worker failure/retry remains visible and produces no duplicate provider effect.
- [ ] Run history and notifications expose trigger, version, attempts, approval, handoff, artifact/record and final receipt.
- [ ] Unauthorized humans cannot inspect or act at any stage; traces pass sensitive-data scans.

## Verification

Run three consecutive resettable browser journeys plus accessibility and failure-injection variants.

## Evidence

- Traces/screenshots:
- Three-run report:
