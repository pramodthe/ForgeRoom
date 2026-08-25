---
id: P1-102
title: Implement centralized authorization and background service principals
status: blocked
owner: unassigned
depends_on: [P1-000, P1-101]
requirements: [PLAT-003, PSEC-001, PSEC-002, PSEC-003, PSEC-004, PSEC-009]
specs: [../security.md, ../architecture.md, ../data-model.md]
release_gate: required
---

# P1-102 — Implement authorization and service principals

## Outcome

HTTP requests, workers, ingestion and background jobs use one deny-by-default authorization decision with explicit workspace and resource scope.

## Acceptance criteria

- [ ] Central evaluator accepts actor, workspace, resource, operation, context and policy revision and returns a typed allow/deny reason.
- [ ] Service principals have narrow job-specific grants, expiry/rotation and no ambient owner equivalence.
- [ ] PostgreSQL constraints/RLS or equivalent defense-in-depth prevent cross-workspace reads and writes.
- [ ] Session revocation, membership removal and role downgrade invalidate new work promptly and stale background claims safely.
- [ ] Authorization decisions and policy revisions are auditable without exposing secrets.
- [ ] Direct API, internal tool, event consumer and file download paths share the same decision semantics.

## Verification

Run cross-tenant, confused-deputy, stale membership, background-job, object-download and policy-revision security suites.

## Evidence

- Policy contract:
- Security report:
- Independent review:
