---
id: P1-107
title: Evolve the 0.1 schema into the platform without identity loss
status: blocked
owner: unassigned
depends_on: [P1-101, P1-102]
requirements: [PLAT-002, PLAT-003, PLAT-008]
specs: [../data-model.md, ../architecture.md, ../contracts/api.md#01-route-evolution, ../../001-forgeroom-foundation/data-model.md, ../../001-forgeroom-foundation/contracts/api.md]
release_gate: required
---

# P1-107 — Implement 0.1-to-platform schema evolution

## Outcome

A populated 0.1 workspace upgrades in place: stable channels, coworkers, sessions, Runs, Tasks, skills, approvals, artifacts, UI and audit keep identity, revision and authorization semantics.

## Acceptance criteria

- [ ] The mapping in `data-model.md#01-to-platform-evolution` is executable, idempotent and never redefines an old immutable revision.
- [ ] P0 Task IDs/history migrate or dual-read into generic Records without broken message/UI/artifact/source links.
- [ ] P0 `agent_profiles`/`agent_versions` and skill versions/bindings remain the stable authority while platform governance/lifecycle extensions add no authority or session drift.
- [ ] P0 messages/pins, SkillVersions, content-bearing Run snapshots, artifacts and controlled UI revisions receive deterministic classification/provenance rows before retrieval/export is enabled.
- [ ] Existing channels/messages receive active revision-1 lifecycle and security heads without ID/body/history changes; concurrent archive/delete/restore uses those heads and purged content cannot be resurrected.
- [ ] P0 users/memberships/sessions and connector/account/tool grants retain identity/status/account/descriptor/policy hashes with no duplicate membership, reconnect, fallback account or widened capability.
- [ ] Workspace sequence/audit/outbox backfill is deterministic and blocks live dispatch until integrity checks pass.
- [ ] Roll-forward, interrupted migration resume and documented forward-fix are tested on representative P0 states including pending approval and component interrupt.
- [ ] The shipped 0.1 browser/API fixtures pass against 0.2 compatibility adapters, including full CoworkerDraft and SkillDraft GET/revise/publish flows; adapters call the same v1 policy/command services.
- [ ] A checked-in method/template compatibility manifest maps every 0.1 route to an exact v1/retained-protocol target plus request/response/event/auth fixture; CI rejects missing, duplicate or authority-divergent mappings.
- [ ] Downgrade is never promised after an irreversible migration; backup restore boundaries are explicit.

## Verification

Upgrade redacted fixture databases at every P0 state boundary, compare stable IDs/hashes/permissions and run the full P0 replay/action regression suite.

## Evidence

- Migration map/scripts:
- Before/after report:
