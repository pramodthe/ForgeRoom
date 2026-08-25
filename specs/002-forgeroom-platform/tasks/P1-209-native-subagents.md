---
id: P1-209
title: Map and expose TrueForge native subagents
status: blocked
owner: unassigned
depends_on: [P1-000, P1-101, P1-103]
requirements: [AOR-007, AOR-008, AOR-009, AOR-010, AOR-011, AOR-012, AGUI-007]
specs: [../advanced-orchestration.md, ../data-model.md, ../contracts/api.md#optional-advanced-orchestration, ../contracts/events.md, ../../001-forgeroom-foundation/runtime.md#p1-native-subagents, ../../001-forgeroom-foundation/contracts/events.md#p1-native-subagent, ../../001-forgeroom-foundation/contracts/ag-ui.md#optional-forgeroom-metadata-extension]
adrs: [ADR-001, ADR-006]
touches: [packages/integrations/trueforge, packages/contracts, packages/domain, packages/db, apps/api, apps/worker, apps/web, packages/ui]
release_gate: optional
---

# P1-209 — Map and expose TrueForge native subagents

## Outcome

Child threads retain parent lineage in normalized events and the demo fixture reliably creates at least one.

This is non-gating for 0.2 and remains disabled until its task and lineage/security tests pass.

## Acceptance criteria

- [ ] Child start/end/failure maps to normalized subagent events.
- [ ] Each child invocation/authority snapshot/lineage/state transition is persisted with CAS terminal state and replays independently of provider history.
- [ ] Stable package profile emits `forgeroom.native_subagent.v1`; future native AG-UI events reduce to the same projection.
- [ ] Persistent parent coworker, logical AG-UI thread, AgentTurn and internal TrueForge thread lineage are retained without exposing raw provider IDs.
- [ ] Child never appears in channel participant data.
- [ ] Child tool/approval events show lineage and inherit parent gates.
- [ ] Child context, tools, skills, budget, sandbox and approval authority are verified as a non-expanding subset of the current parent runtime before start and before each claim.
- [ ] UI identity never trusts model-authored names.
- [ ] The browser renders nested child activity with server-owned parent/child identity, tool/approval attribution and deterministic reconnect/replay, while never adding the child to participants.
- [ ] Fixture reliably exercises one child without claiming hard count/cost limits.
- [ ] Stop, timeout, parent failure and parent session rotation revoke future child claims and produce one deterministic terminal projection with no orphaned authority.
- [ ] Native children remain default-off; authorized enable/change/disable binds exact parent profile/runtime revision and conformance/budget ceiling, rotates sessions, and supports rollback/revocation.

## Verification

Run mapping fixtures, browser accessibility/reconnect E2E and one live child-thread demo probe.

## Completion evidence

- Tests/results:
- Redacted thread trace:
