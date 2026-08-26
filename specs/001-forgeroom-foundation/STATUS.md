# ForgeRoom 0.1 foundation status

| Field | Current value |
| --- | --- |
| Overall | P0-101–P0-104, P0-106–P0-107 complete; P0-108 context/pins in review; P0-205 router in progress; P0-000 demo/tool contract in progress |
| Current phase | Phase 1 — Foundation |
| Active task | P0-108 (in_review); P0-205 (in_progress); P0-000 (in_progress) |
| Next task | Land P0-108 PR; complete P0-205; P0-105 waits on P0-000 live probes |
| P0 blockers | Live Composio tools/account/descriptor hashes, Daytona+storage probe, model presets, remaining OD-002–OD-012 verified rows, controlled-GenUI/Task/skill demo fixture, storage/deployment choices, and PD-002 before public release |
| Last updated | 2026-08-26 |

## Milestones

| Milestone | Status | Exit condition |
| --- | --- | --- |
| M0 Demo contract | in_progress | P0-000 done |
| M1 Foundation | in_progress | P0-101 through P0-108 done |
| M2 TrueForge + AG-UI runtime and Task integration | blocked | P0-109, P0-201–P0-206, P0-208, P0-210–P0-213 done |
| M3 Tools, approvals and UI capabilities | blocked | P0-301–P0-316 and P0-318 done |
| M4 Product UI | blocked | P0-401–P0-408 and P0-410 done |
| M5 Verification | blocked | P0-501 through P0-506 done |

## Current decisions needed

Still open until live probes / P0-210 (see `decisions/OPEN.md` and `provider-fixtures/`):

- Exact Composio application slug(s), tool slugs, pinned account suffixes and descriptor hashes (blocked-on-secrets).
- Model preset for Operator and Research coworkers (blocked-on-secrets).
- Exact pure AG-UI lockfile selection (candidates frozen; P0-210 selects).
- Demo durable artifact storage adapter and checked-in deployment diagram (candidates recorded).
- Verified synthetic provider record IDs and idempotent reset command.

Frozen without secrets:

- P0 feature profile disables native subagents, coordinator synthesis, component catalogue expansion and `iframe_v1`.
- Optional CopilotKit disabled-unless-parity policy for P0-210.
- Local artifact storage directory adapter for development.
- Controlled-UI / coworker / Task / skill / run-limit candidate fixtures under `provider-fixtures/`.

Never put credentials in this file.

## Recently completed

- P0-107 canonical event log and resumable SSE merged to `main` via PR #8 (merge commit `ffbca91`).
- P0-106 channel/coworker API accepted via PR #7 after archive-race remediation, full CI, and exact-head Qodo review.
- P0-104 owner authentication and authorization merged to `main` (`ea3db05` via PR #5) after Qodo-clean head and green CI.
- P0-103 database schema and session workspace boundary merged to `main` (`d7b6273`).
- P0-102 shared contracts merged to `main`.
- P0-101 scaffold accepted after clean-clone verification and green GitHub CI.
- Split canonical specifications created.
- Product, technical, UX, and security reviews incorporated.
- AG-UI northbound protocol, shared state, interrupt and durable replay contracts added.
- P0 narrowed to controlled GenUI; the mature declarative generated-document design is retained for P1.
- Conversational coworker creation, TaskRecord and Save-as-skill added to the P0 product loop.
- Startup-wide 0.2/0.3/1.0 domain and task specifications added under `../002-forgeroom-platform/`.

## Status update rule

Update this file whenever a task enters `in_progress`, becomes blocked, or reaches `done`. Do not use it as a substitute for evidence in the task file.
