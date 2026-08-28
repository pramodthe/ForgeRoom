# ForgeRoom 0.1 task index

Each task file is authoritative for its status and evidence. Keep this index and `STATUS.md` synchronized. Startup-wide P1/P2/P3 work is tracked in [`../002-forgeroom-platform/tasks.md`](../002-forgeroom-platform/tasks.md).

## Status legend

- `blocked`: dependency or named decision missing.
- `ready`: may be claimed now.
- `in_progress`: one active owner.
- `in_review`: implementation complete; independent review pending.
- `done`: acceptance and verification evidence complete.

## Backlog

| Done | ID | Task | Status | Depends on |
| --- | --- | --- | --- | --- |
| [x] | [P0-000](./tasks/P0-000-freeze-demo-contract.md) | Freeze demo/tool contract | done | — |
| [x] | [P0-101](./tasks/P0-101-scaffold-monorepo.md) | Scaffold monorepo and CI | done | — |
| [x] | [P0-102](./tasks/P0-102-shared-contracts.md) | Shared domain/API contracts | done | P0-101 |
| [x] | [P0-103](./tasks/P0-103-database-migrations.md) | Database schema and migrations | done | P0-102 |
| [x] | [P0-104](./tasks/P0-104-owner-auth.md) | Owner authentication/authorization | done | P0-103 |
| [x] | [P0-105](./tasks/P0-105-demo-fixtures.md) | Idempotent demo fixtures | done | P0-000, P0-103, P0-104 |
| [x] | [P0-106](./tasks/P0-106-channel-coworker-api.md) | Channel and coworker API | done | P0-103, P0-104 |
| [x] | [P0-107](./tasks/P0-107-event-log-sse.md) | Canonical event log and SSE | done | P0-106 |
| [x] | [P0-108](./tasks/P0-108-context-pins.md) | Channel context and pins | done | P0-107 |
| [ ] | [P0-109](./tasks/P0-109-task-record.md) | Application-owned TaskRecord | in_progress | P0-103, P0-104, P0-107, P0-203, P0-208 |
| [x] | [P0-201](./tasks/P0-201-trueforge-sessions.md) | TrueForge adapter and sessions | done | P0-000, P0-103, P0-105 |
| [x] | [P0-202](./tasks/P0-202-turn-queue.md) | Per-session serial turn queue | done | P0-103, P0-201 |
| [x] | [P0-203](./tasks/P0-203-turn-events.md) | Turn creation and event normalization | done | P0-107, P0-202 |
| [x] | [P0-204](./tasks/P0-204-reconnect-stop.md) | Reconnect, stop and correction | done | P0-203 |
| [x] | [P0-205](./tasks/P0-205-router.md) | Direct mention/team router | done | P0-102, P0-106 |
| [x] | [P0-206](./tasks/P0-206-multi-agent-run.md) | Direct multi-agent Run engine | done | P0-202, P0-203, P0-205 |
| [x] | [P0-208](./tasks/P0-208-session-rotation.md) | Capability/skill intersection and rotation | done | P0-202, P0-302, P0-314 |
| [x] | [P0-210](./tasks/P0-210-agui-compatibility-spike.md) | Freeze AG-UI and prove bridge | done | P0-000, P0-101 |
| [x] | [P0-211](./tasks/P0-211-trueforge-agui-adapter.md) | TrueForge-to-AG-UI adapter | done | P0-102, P0-203, P0-210 |
| [x] | [P0-212](./tasks/P0-212-agui-persistence-state-replay.md) | AG-UI persistence and replay | done | P0-103, P0-107, P0-211 |
| [x] | [P0-213](./tasks/P0-213-conversational-coworker-drafts.md) | Conversational CoworkerDraft provisioning | done | P0-106, P0-208 |
| [x] | [P0-301](./tasks/P0-301-composio-session.md) | Composio direct-tools session | done | P0-000, P0-101 |
| [x] | [P0-302](./tasks/P0-302-manifest-verification.md) | Connector/AgentSpec verification | done | P0-201, P0-301 |
| [x] | [P0-303](./tasks/P0-303-tool-policies.md) | Curated ToolPolicyDefinitions | done | P0-000, P0-302 |
| [x] | [P0-304](./tasks/P0-304-connections.md) | Connections API and health | done | P0-104, P0-302 |
| [x] | [P0-305](./tasks/P0-305-real-read.md) | Real Composio read path | done | P0-201, P0-203, P0-303 |
| [x] | [P0-306](./tasks/P0-306-pause-groups.md) | RequiredAction/PauseGroup persistence | done | P0-103, P0-203, P0-303 |
| [x] | [P0-307](./tasks/P0-307-decisions.md) | Secure decision API/card | done | P0-104, P0-306 |
| [x] | [P0-308](./tasks/P0-308-atomic-resume.md) | Atomic response-only resume | done | P0-202, P0-211, P0-306, P0-307 |
| [x] | [P0-309](./tasks/P0-309-deterministic-write.md) | Approval-gated deterministic write | done | P0-305, P0-308 |
| [x] | [P0-310](./tasks/P0-310-artifact-storage.md) | Durable artifact storage | done | P0-000, P0-103 |
| [x] | [P0-311](./tasks/P0-311-daytona.md) | Daytona sandbox event path | done | P0-201, P0-203 |
| [x] | [P0-312](./tasks/P0-312-artifact-extraction.md) | Artifact extraction and preview | done | P0-310, P0-311 |
| [ ] | [P0-313](./tasks/P0-313-audit-receipt.md) | Audit timeline and JSON receipt | ready | P0-203, P0-309, P0-312, P0-315 |
| [x] | [P0-314](./tasks/P0-314-component-registry-grants.md) | Fixed governed component registry | done | P0-102, P0-103, P0-104, P0-210 |
| [ ] | [P0-315](./tasks/P0-315-component-tool-interaction-gateway.md) | Component/interaction gateway | in_progress | P0-201, P0-208, P0-211, P0-212, P0-314 |
| [ ] | [P0-316](./tasks/P0-316-controlled-component-library.md) | Small controlled component library | blocked | P0-312, P0-314, P0-401 |
| [ ] | [P0-318](./tasks/P0-318-save-run-as-skill.md) | Save successful Run as skill | blocked | P0-104, P0-106, P0-206, P0-208, P0-403 |
| [x] | [P0-401](./tasks/P0-401-app-shell.md) | Authenticated three-pane shell | done | P0-102, P0-104 |
| [x] | [P0-402](./tasks/P0-402-composer-roster.md) | Channel composer and roster | done | P0-106, P0-107, P0-205, P0-401 |
| [ ] | [P0-403](./tasks/P0-403-activity-cards.md) | Run/Task activity cards | blocked | P0-109, P0-203, P0-206, P0-401 |
| [ ] | [P0-404](./tasks/P0-404-approval-run-drawer.md) | Approval/question UI and Run drawer | blocked | P0-307, P0-308, P0-403 |
| [ ] | [P0-405](./tasks/P0-405-work-tabs.md) | Tasks, Work, Artifacts and Context | blocked | P0-108, P0-109, P0-312, P0-403 |
| [ ] | [P0-406](./tasks/P0-406-settings-screens.md) | Coworker, Skills and Connections UI | blocked | P0-106, P0-304, P0-318, P0-401 |
| [ ] | [P0-407](./tasks/P0-407-ux-accessibility.md) | Required states and accessibility | blocked | P0-402–P0-406, P0-316, P0-410 |
| [ ] | [P0-408](./tasks/P0-408-agui-rich-timeline.md) | AG-UI reducers and controlled rich timeline | blocked | P0-212, P0-315, P0-316, P0-403 |
| [ ] | [P0-410](./tasks/P0-410-coworker-task-skill-ui.md) | Coworker/Task/skill review flows | blocked | P0-109, P0-213, P0-318, P0-402, P0-406 |
| [ ] | [P0-501](./tasks/P0-501-unit-suite.md) | Unit suite completion | blocked | P0-108, P0-109, P0-212, P0-213, P0-303, P0-306, P0-312, P0-314–P0-316, P0-318 |
| [ ] | [P0-502](./tasks/P0-502-integration-suite.md) | Runtime/integration suite | blocked | P0-109, P0-204, P0-208, P0-212, P0-213, P0-305, P0-309, P0-312, P0-313, P0-315, P0-318 |
| [ ] | [P0-503](./tasks/P0-503-security-suite.md) | Core security acceptance | blocked | P0-104, P0-109, P0-208, P0-213, P0-303, P0-306–P0-309, P0-311–P0-314, P0-318 |
| [ ] | [P0-504](./tasks/P0-504-browser-e2e.md) | Complete browser E2E | blocked | P0-109, P0-213, P0-305, P0-309, P0-312, P0-313, P0-318, P0-407, P0-408, P0-410 |
| [ ] | [P0-506](./tasks/P0-506-agui-genui-conformance.md) | AG-UI/controlled-GenUI conformance | blocked | P0-211, P0-212, P0-308, P0-313–P0-316, P0-408 |
| [ ] | [P0-505](./tasks/P0-505-release-demo.md) | Preflight, docs and demo rehearsal | blocked | P0-313, P0-501–P0-504, P0-506 |

## Critical path

```text
P0-101 → P0-102 → P0-103 → P0-104 → P0-105 → P0-201 → P0-202 → P0-203
P0-203 + P0-208 → P0-109 → P0-403 → P0-318 → P0-406 → P0-410
                    → P0-407 → P0-504 → P0-505

Parallel required gates:
P0-000 + P0-101 → P0-210 → P0-211/P0-314
P0-301 → P0-302 → P0-303 → P0-306 → P0-307 → P0-308 → P0-309
P0-314 → P0-208 → P0-315 → P0-313/P0-408/P0-506
P0-208 → P0-213 → P0-410/P0-501/P0-502/P0-503/P0-504
P0-310/P0-311 → P0-312 → P0-316/P0-313
P0-501/P0-502/P0-503/P0-504/P0-506 → P0-505
```

The path is a dependency summary, not permission to ignore other required tasks.

## Explicit P0 non-tasks

P0 must not add coordinator planning/synthesis, TrueForge native-subagent exposure, component catalogue UI, custom generated HTML/iframe, file uploads, editable long-term memory, multi-human invitations/private channels, schedules, triggers, cross-channel workflows, full generic record schemas, per-human accounts, browser/computer takeover or an extension marketplace. Their startup contracts and tasks live under `../002-forgeroom-platform/`.
