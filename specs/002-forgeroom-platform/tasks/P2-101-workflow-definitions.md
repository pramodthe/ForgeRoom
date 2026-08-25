---
id: P2-101
title: Implement versioned workflow definitions and validation
status: blocked
owner: unassigned
depends_on: [P2-000]
requirements: [SK-009, REC-011, WF-001, WF-002]
specs: [../workflows.md, ../data-model.md, ../contracts/api.md]
release_gate: required
---

# P2-101 — Implement workflow definitions

## Outcome

Users can draft, validate, test, publish and version bounded workflow graphs with explicit owner, inputs, outputs, grants and failure policy.

## Acceptance criteria

- [ ] Closed step/edge schemas reject cycles except explicitly bounded constructs and validate all referenced coworkers/skills/records/channels.
- [ ] WorkflowVersion is immutable and pins policy, skill, schema and destination assumptions.
- [ ] Draft validation previews required connections, data scopes, approvals, budgets and denied capabilities.
- [ ] Publish/enable are revision-bound authorized commands; edit creates a new version.
- [ ] Test runs use selected fixtures and cannot become a schedule/trigger implicitly.
- [ ] Deprecation/disable blocks new Runs while history remains inspectable.

## Verification

Run graph/schema, missing capability, stale reference, concurrent publish, version pin and authorization tests.

## Evidence

- Definition fixtures:
- Test report:
