# ForgeRoom 0.1 foundation status

| Field | Current value |
| --- | --- |
| Overall | P0-101 through P0-104 complete; P0-106 channel/coworker API in_review (P0-000 may proceed in parallel on its own branch) |
| Current phase | Phase 1 — Foundation |
| Active task | P0-106 (in_review, owner cursor-agent); P0-000 remains independently claimable/in progress on its branch |
| Next task | Independent review of P0-106; P0-105 waits on P0-000 + P0-103/P0-104; P0-107 waits on P0-106 done |
| P0 blockers | Exact Composio tools/account, deterministic write, fixture, pure AG-UI baseline, controlled-GenUI/Task/skill demo fixture, storage/deployment choices, and PD-002 before public release |
| Last updated | 2026-08-26 |

## Milestones

| Milestone | Status | Exit condition |
| --- | --- | --- |
| M0 Demo contract | ready | P0-000 done |
| M1 Foundation | in_progress | P0-101 through P0-108 done |
| M2 TrueForge + AG-UI runtime and Task integration | blocked | P0-109, P0-201–P0-206, P0-208, P0-210–P0-213 done |
| M3 Tools, approvals and UI capabilities | blocked | P0-301–P0-316 and P0-318 done |
| M4 Product UI | blocked | P0-401–P0-408 and P0-410 done |
| M5 Verification | blocked | P0-501 through P0-506 done |

## Current decisions needed

- One or two Composio applications.
- Exact read and deterministic write tool slugs.
- Pinned connected-account IDs and synthetic provider fixture.
- Model preset for each seeded coworker.
- Exact compatible stable pure AG-UI package versions; optional CopilotKit remains disabled unless separately proven.
- Deterministic controlled DataTable/bar-or-line chart, TaskCard, ArtifactCard and ChoiceForm/filter fixture.
- Conversational coworker prompt/permission preview and one instruction-only Save-as-skill fixture.
- Durable demo artifact storage adapter.
- Demo deployment topology.
- Run limits: wall time, token/cost ceiling, tool calls and sandbox time.

Record provider/demo candidates in `demo.md` through P0-000; P0-210 freezes exact package versions. P1-317/P1-506 own any future generated-origin/security profile. Update accepted ADRs when a choice changes architecture. Never put credentials in this file.

## Recently completed

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
