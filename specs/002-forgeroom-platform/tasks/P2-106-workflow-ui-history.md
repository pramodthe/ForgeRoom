---
id: P2-106
title: Build workflow builder, trigger controls and run history
status: blocked
owner: unassigned
depends_on: [P2-101, P2-103, P2-104, P2-105]
requirements: [SRCH-009, WF-001, WF-002, WF-006, WF-011]
specs: [../workflows.md, ../ux.md]
release_gate: required
---

# P2-106 — Build workflow UI and history

## Outcome

Humans can create, test, enable, monitor, pause and repair workflows while seeing exact authority, trigger, version and outcome.

## Acceptance criteria

- [ ] Builder supports the closed step set, validates references live and exposes a readable non-canvas alternative.
- [ ] Permission/budget/approval preview precedes publish and enable.
- [ ] Schedule preview handles zone/DST; webhook setup shows verification/rotation without exposing secrets.
- [ ] Run history filters by version/trigger/status and shows step attempts, retries, approvals, artifacts, records, handoffs and dead-letter reason.
- [ ] Global search and canonical historical navigation cover workflow, trigger, handoff, notification, approval-reference and dead-letter resources without leaking hidden existence or fields.
- [ ] Pause/disable/cancel/retry actions state exactly what they affect and are revision/idempotency bound.
- [ ] Required empty/error/stale/revoked/partial/failure states pass keyboard, screen-reader and responsive checks.

## Verification

Run component/browser/accessibility tests and production-like fixtures for each trigger/failure/handoff state.

## Evidence

- Screenshots:
- Accessibility/browser report:
