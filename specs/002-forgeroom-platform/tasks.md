# ForgeRoom platform task index

This tracker begins after the 0.1 foundation in [`../001-forgeroom-foundation/tasks.md`](../001-forgeroom-foundation/tasks.md). Each task file is authoritative for its status, acceptance evidence and handoff. This index, `STATUS.md`, domain specs and release gates must change together.

## Status and gate legend

- `blocked`: a dependency or named product decision is incomplete.
- `ready`: may be claimed now.
- `in_progress`: exactly one accountable owner is implementing it.
- `in_review`: implementation is complete; independent acceptance remains.
- `done`: all acceptance, verification and evidence are complete.
- `required`: blocks that release.
- `optional`: planned in the release train but does not block its exit gate.
- `experimental_only`: cannot block release and cannot be enabled until its own conformance gate passes.

## P1 — 0.2 private alpha

| Done | ID | Task | Status | Gate | Depends on |
| --- | --- | --- | --- | --- | --- |
| [ ] | [P1-000](./tasks/P1-000-freeze-alpha-contract.md) | Freeze alpha contract | blocked | required | P0-505 |
| [ ] | [P1-101](./tasks/P1-101-domain-events-outbox.md) | Domain events, outbox and projections | blocked | required | P1-000 |
| [ ] | [P1-102](./tasks/P1-102-auth-service-principals.md) | Authorization and service principals | blocked | required | P1-000, P1-101 |
| [ ] | [P1-103](./tasks/P1-103-membership-private-channels.md) | Membership, roles and private channels | blocked | required | P1-102 |
| [ ] | [P1-104](./tasks/P1-104-notifications-presence.md) | Notifications and bounded presence | blocked | required | P1-101, P1-103 |
| [ ] | [P1-105](./tasks/P1-105-audit-integrity-export.md) | Integrity-verifiable audit and export | blocked | required | P1-101, P1-102 |
| [ ] | [P1-106](./tasks/P1-106-retention-deletion-propagation.md) | Retention and deletion propagation | blocked | required | P1-105, P1-203, P1-212, P1-301, P1-303, P1-304, P1-305 |
| [ ] | [P1-107](./tasks/P1-107-p0-platform-migration.md) | 0.1-to-platform schema evolution | blocked | required | P1-101, P1-102 |
| [ ] | [P1-108](./tasks/P1-108-spec-graph-validator.md) | Specification graph validator | blocked | required | P1-000 |
| [ ] | [P1-201](./tasks/P1-201-knowledge-ingestion.md) | Secure knowledge ingestion | blocked | required | P1-000, P1-101, P1-102 |
| [ ] | [P1-202](./tasks/P1-202-knowledge-retrieval-citations.md) | Scoped retrieval and citations | blocked | required | P1-103, P1-201 |
| [ ] | [P1-203](./tasks/P1-203-knowledge-ui-lifecycle.md) | Knowledge library and lifecycle UI | blocked | required | P1-103, P1-201, P1-202 |
| [ ] | [P1-207](./tasks/P1-207-coordinator.md) | Optional coordinator and synthesis | blocked | optional | P1-000, P1-101, P1-103 |
| [ ] | [P1-209](./tasks/P1-209-native-subagents.md) | Native-subagent mapping | blocked | optional | P1-000, P1-101, P1-103 |
| [ ] | [P1-211](./tasks/P1-211-memory-store-retrieval.md) | Scoped memory and retrieval | blocked | required | P1-101, P1-102, P1-202 |
| [ ] | [P1-212](./tasks/P1-212-memory-governance-ui.md) | Memory governance UI | blocked | required | P1-103, P1-211 |
| [ ] | [P1-213](./tasks/P1-213-coworker-lifecycle-ui.md) | Coworker lifecycle and governance | blocked | required | P0-505, P1-103, P1-211, P1-301, P1-303, P1-304 |
| [ ] | [P1-301](./tasks/P1-301-skill-lifecycle.md) | Full private skill lifecycle | blocked | required | P0-505, P1-101, P1-102 |
| [ ] | [P1-302](./tasks/P1-302-record-schemas-crud.md) | Typed record schemas and CRUD | blocked | required | P0-505, P1-000, P1-101, P1-102 |
| [ ] | [P1-303](./tasks/P1-303-record-tools-provenance.md) | Record tools, provenance and import/export | blocked | required | P1-202, P1-302 |
| [ ] | [P1-304](./tasks/P1-304-workspace-connections.md) | Workspace connections and exact tool grants | blocked | required | P1-000, P1-101, P1-102, P1-103 |
| [ ] | [P1-305](./tasks/P1-305-workspace-search-history.md) | Workspace search and Run history | blocked | required | P1-101, P1-102, P1-103, P1-202, P1-211, P1-301, P1-302 |
| [ ] | [P1-317](./tasks/P1-317-open-generated-ui-sandbox.md) | Experimental hardened iframe rail | blocked | experimental_only | P0-505, P1-101, P1-102, P1-103 |
| [ ] | [P1-401](./tasks/P1-401-self-host-portability.md) | Self-hosting and data portability | blocked | required | P1-000, P1-103, P1-104, P1-105, P1-106, P1-107, P1-203, P1-212, P1-301, P1-303, P1-304, P1-305 |
| [ ] | [P1-402](./tasks/P1-402-operations-telemetry.md) | Operator health and opt-in telemetry | blocked | required | P1-101, P1-401 |
| [ ] | [P1-409](./tasks/P1-409-component-catalogue-ui.md) | Controlled component catalogue UI | blocked | optional | P1-000, P1-101, P1-103 |
| [ ] | [P1-501](./tasks/P1-501-alpha-domain-security-suite.md) | Alpha domain/security suite | blocked | required | P1-103, P1-104, P1-105, P1-106, P1-107, P1-108, P1-203, P1-212, P1-213, P1-301, P1-303, P1-304, P1-305, P1-402 |
| [ ] | [P1-502](./tasks/P1-502-alpha-browser-e2e.md) | Multi-human alpha browser E2E | blocked | required | P1-501 |
| [ ] | [P1-503](./tasks/P1-503-install-upgrade-restore-suite.md) | Install/upgrade/restore conformance | blocked | required | P1-401, P1-402, P1-501 |
| [ ] | [P1-504](./tasks/P1-504-private-alpha-release.md) | Private-alpha release and trial | blocked | required | P1-502, P1-503 |
| [ ] | [P1-506](./tasks/P1-506-iframe-conformance.md) | Iframe security/conformance | blocked | experimental_only | P1-317, P1-501 |

Required critical path:

```text
P0-505 → P1-000 → P1-101 → P1-102 → domain implementations
       → P1-105/P1-107 → P1-106 → P1-401 → P1-402
       → P1-501 → P1-502/P1-503 → P1-504
```

Membership, skills, records and their UX run in parallel after P1-102. P1-207, P1-209, P1-317, P1-409 and P1-506 do not block P1-504.

## P2 — 0.3 team beta

| Done | ID | Task | Status | Gate | Depends on |
| --- | --- | --- | --- | --- | --- |
| [ ] | [P2-000](./tasks/P2-000-freeze-beta-contract.md) | Freeze beta automation contract | blocked | required | P1-504 |
| [ ] | [P2-101](./tasks/P2-101-workflow-definitions.md) | Workflow definitions and versions | blocked | required | P2-000 |
| [ ] | [P2-102](./tasks/P2-102-durable-workflow-engine.md) | Durable workflow engine | blocked | required | P1-101, P2-101 |
| [ ] | [P2-103](./tasks/P2-103-schedules.md) | Time-zone-aware schedules | blocked | required | P2-102 |
| [ ] | [P2-104](./tasks/P2-104-event-webhook-triggers.md) | Event and webhook triggers | blocked | required | P2-102 |
| [ ] | [P2-105](./tasks/P2-105-cross-channel-handoffs.md) | Governed cross-channel handoffs | blocked | required | P2-102 |
| [ ] | [P2-106](./tasks/P2-106-workflow-ui-history.md) | Workflow UI and run history | blocked | required | P2-101, P2-103, P2-104, P2-105 |
| [ ] | [P2-201](./tasks/P2-201-approver-groups-inbox.md) | Approver groups and inbox | blocked | required | P1-103, P2-000 |
| [ ] | [P2-202](./tasks/P2-202-human-connections.md) | Per-human connections | blocked | required | P1-103, P1-304, P2-000 |
| [ ] | [P2-203](./tasks/P2-203-extension-sdk.md) | Stable extension SDK | blocked | required | P1-301, P1-302, P2-000 |
| [ ] | [P2-204](./tasks/P2-204-external-notifications.md) | External notifications and escalation | blocked | required | P1-104, P2-106, P2-201 |
| [ ] | [P2-205](./tasks/P2-205-knowledge-continuous-sync.md) | Continuous knowledge synchronization | blocked | required | P1-201, P1-202, P2-000 |
| [ ] | [P2-501](./tasks/P2-501-beta-security-recovery-suite.md) | Beta security/recovery suite | blocked | required | P2-106, P2-201, P2-202, P2-203, P2-204, P2-205 |
| [ ] | [P2-502](./tasks/P2-502-beta-browser-e2e.md) | Team-beta browser E2E | blocked | required | P2-501 |
| [ ] | [P2-503](./tasks/P2-503-team-beta-release.md) | Team-beta release and trial | blocked | required | P2-502 |

Critical path:

```text
P1-504 → P2-000 → P2-101 → P2-102 → P2-103/P2-104/P2-105
       → P2-106 → P2-501 → P2-502 → P2-503
```

## P3 — 1.0 general availability

| Done | ID | Task | Status | Gate | Depends on |
| --- | --- | --- | --- | --- | --- |
| [ ] | [P3-000](./tasks/P3-000-freeze-ga-contract.md) | Freeze GA contract | blocked | required | P2-503 |
| [ ] | [P3-101](./tasks/P3-101-ha-disaster-recovery.md) | HA, DR and retention | blocked | required | P3-000 |
| [ ] | [P3-102](./tasks/P3-102-hosted-multitenancy.md) | Hosted multi-tenancy and quotas | blocked | required | P3-000, P3-101 |
| [ ] | [P3-103](./tasks/P3-103-enterprise-identity.md) | Optional enterprise identity | blocked | optional | P3-000, P3-102 |
| [ ] | [P3-104](./tasks/P3-104-signed-extension-distribution.md) | Signed extension distribution | blocked | required | P2-203, P3-000 |
| [ ] | [P3-105](./tasks/P3-105-public-api-lts.md) | Public API/event/SDK/LTS compatibility | blocked | required | P3-000, P3-104 |
| [ ] | [P3-501](./tasks/P3-501-ga-security-performance-review.md) | Independent security/performance review | blocked | required | P3-101, P3-102, P3-104, P3-105 |
| [ ] | [P3-502](./tasks/P3-502-upgrade-restore-matrix.md) | Upgrade/restore/export matrix | blocked | required | P3-101, P3-105, P3-501 |
| [ ] | [P3-503](./tasks/P3-503-ga-release.md) | 1.0 GA release | blocked | required | P3-502 |

Critical path:

```text
P2-503 → P3-000 → P3-101 → P3-102
       → P3-104 → P3-105 → P3-501 → P3-502 → P3-503
```

## Execution rules

1. Claim only a `ready` task and set one owner before editing implementation.
2. Do not start a dependent task from partial undocumented behavior.
3. A task reaches `done` only when its acceptance criteria, commands, reports and review evidence are recorded in the task file.
4. New authority, data type, trigger, extension or execution path requires a spec/security/test/task change before implementation.
5. Experimental work is compiled/routed off by default and may not weaken required-release tests.
6. Release tasks require a clean-artifact run; local success alone is not evidence.
