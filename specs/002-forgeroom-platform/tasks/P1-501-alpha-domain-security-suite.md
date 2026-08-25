---
id: P1-501
title: Complete 0.2 cross-domain and security acceptance suite
status: blocked
owner: unassigned
depends_on: [P1-103, P1-104, P1-105, P1-106, P1-107, P1-108, P1-203, P1-212, P1-213, P1-301, P1-303, P1-304, P1-305, P1-402]
requirements: [PLAT-003, PLAT-004, PLAT-008, PSEC-001, PSEC-006, PSEC-008, PSEC-010, PSEC-012]
specs: [../test-plan.md, ../security.md]
release_gate: required
---

# P1-501 — Complete alpha domain/security suite

## Outcome

Every required 0.2 domain works together under isolation, concurrency, revocation, deletion and recovery tests with independently reviewable evidence.

## Acceptance criteria

- [ ] Coworker/skill, connections, knowledge, memory, records, search/history, teams/notifications and operations matrices pass without skipped release cases.
- [ ] Cross-workspace/channel/role attacks fail across HTTP, SSE, downloads, search, internal tools, events and exports.
- [ ] Revocation/deletion during queued/running work prevents new effects and reconciles retained history truthfully.
- [ ] Prompt/file/record injection cannot become authority, code, memory or an approval decision.
- [ ] Outbox/projector duplicate/out-of-order/rebuild and service-principal expiry tests pass.
- [ ] Independent reviewer signs the threat-model and evidence mapping.

## Verification

Run the complete unit/integration/security matrix from `test-plan.md` in the supported self-host profile.

## Evidence

- Reports:
- Requirement matrix:
- Reviewer:
