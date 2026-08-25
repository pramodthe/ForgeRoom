---
id: P2-105
title: Implement governed cross-channel handoffs
status: blocked
owner: unassigned
depends_on: [P2-102]
requirements: [WF-009, WF-010, WF-012]
specs: [../workflows.md, ../teams.md, ../contracts/events.md]
release_gate: required
---

# P2-105 — Implement cross-channel handoffs

## Outcome

A workflow can hand off a bounded context envelope to an authorized destination channel with visible lineage, no ambient history sharing and loop protection.

## Acceptance criteria

- [ ] Source workflow and destination channel each grant the handoff operation and exact data classes.
- [ ] Envelope contains selected source refs/summaries/records/artifacts, classification and hashes—not whole hidden history.
- [ ] Destination reauthorizes every referenced object and receives a new local Run/source event with causal lineage.
- [ ] Hop count, visited destinations and causal loop keys enforce configured hard limits.
- [ ] Revoked/deleted/inaccessible data is removed or fails the handoff before destination work begins.
- [ ] Source and destination users see status, origin, destination, included context and failure reason subject to access.

## Verification

Run cross-private-channel, partial grants, revoke during transfer, tamper, deleted source, hop/loop and replay tests.

## Evidence

- Envelope fixtures:
- Authorization/lineage trace:
