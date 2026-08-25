---
id: P1-213
title: Complete coworker versions, lifecycle, templates and governance views
status: blocked
owner: unassigned
depends_on: [P0-505, P1-103, P1-211, P1-301, P1-303, P1-304]
requirements: [CW-001, CW-002, CW-003, CW-004, CW-005, CW-006, CW-007, CW-008, CW-009, CW-010, CW-011]
specs: [../coworkers.md, ../ux.md, ../contracts/api.md]
release_gate: required
---

# P1-213 — Complete coworker lifecycle and governance

## Outcome

Coworkers are fully reviewable team members with immutable versions, templates, ownership, lifecycle controls and linked views across their actual work and authority.

## Acceptance criteria

- [ ] P0 conversational draft/confirm/idempotency/permission-intersection behavior remains conformant for every human role and private channel.
- [ ] Capability-affecting edits create immutable versions, show a diff and rotate affected sessions before new work.
- [ ] Disable/archive/restore/duplicate/ownership-transfer commands are revision-bound, authorized and auditable.
- [ ] Templates prefill job/instructions/policy requests but carry no account IDs, resource grants or hidden authority into another workspace.
- [ ] Coworker detail exposes current/versioned role, tools, accounts, skills, components, knowledge, memory, records, channels, workflows, work and audit—subject to viewer access.
- [ ] Disabled/removed coworkers cannot receive new channel work and queued work blocks safely; P2 extends the same invariant to triggers/handoffs.
- [ ] Empty/stale/revoked/provisioning/rotation/failure states pass browser and accessibility requirements.

## Verification

Run role/private-channel, edit/rotation, duplicate/template, transfer/last-owner, disable queued-work, cross-workspace and lifecycle browser tests.

## Evidence

- Contract/test report:
- Version/template fixtures:
- Screenshots:
