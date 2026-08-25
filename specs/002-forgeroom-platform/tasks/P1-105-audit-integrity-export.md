---
id: P1-105
title: Implement integrity-verifiable audit and authorized export
status: blocked
owner: unassigned
depends_on: [P1-101, P1-102]
requirements: [PLAT-003, PSEC-012]
specs: [../security.md, ../contracts/api.md, ../contracts/events.md, ../data-model.md]
release_gate: required
---

# P1-105 — Implement audit integrity and export

## Outcome

Workspace mutations have content-minimized append-only audit evidence whose continuity can be verified and exported only by authorized users.

## Acceptance criteria

- [ ] Platform audit entries link the existing P0 audit stream to workspace sequence, actor, resource/revision, policy decision, event, outcome and previous/checkpoint hashes without storing forbidden bodies.
- [ ] Every DomainEvent has one audit row with unique event/sequence, and the same sequence lock links it to the immediate prior committed hash or versioned genesis hash.
- [ ] Periodic signed/hash-tree checkpoints make deletion, insertion and reordering detectable without claiming an external transparency log.
- [ ] Audit queries authorize workspace, role, resource visibility and field redaction before counts/rows/export.
- [ ] Export is an asynchronous, revision-bound job with expiry, recent-auth policy, immutable manifest/hash and short-lived download capability.
- [ ] Audit schema/checkpoints can record later retention/legal-hold events without embedding held content; P1-106 owns the actual hold/policy lifecycle.
- [ ] Restore/replay verifies continuity and reports the exact first gap or unsupported checkpoint profile.

## Verification

Run append/reorder/delete tamper tests, cross-role/private-resource queries, concurrent export, expiry/revocation, restore and sensitive-payload scans.

## Evidence

- Migrations/contracts:
- Integrity/export report:
