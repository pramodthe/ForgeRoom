# ForgeRoom 0.1 foundation status

| Field | Current value |
| --- | --- |
| Overall | P0-101–P0-108 foundation API complete (incl. P0-205 router); P0-401/P0-210 in review; P0-000 demo/tool contract in progress (live probes partial 2026-08-26) |
| Current phase | Phase 1 — Foundation |
| Active task | P0-000 (in_progress); P0-401/P0-210 in review |
| Next task | Review/merge P0-401 PR #15 and P0-210 PR #16; finish P0-000 TrueForge probes (PR #12); P0-105 waits on P0-000 completion |
| P0 blockers | TrueForge model presets, Research permission preview, Save-as-skill Run binding, TrueForge→artifact path, DB fixture reset (migrations), demo durable storage — Composio/Daytona SDK/local adapter verified 2026-08-26 |
| Last updated | 2026-08-26 |

## Milestones

| Milestone | Status | Exit condition |
| --- | --- | --- |
| M0 Demo contract | in_progress | P0-000 done |
| M1 Foundation | done | P0-101 through P0-108 done |
| M2 TrueForge + AG-UI runtime and Task integration | blocked | P0-109, P0-201–P0-206, P0-208, P0-210–P0-213 done |
| M3 Tools, approvals and UI capabilities | blocked | P0-301–P0-316 and P0-318 done |
| M4 Product UI | blocked | P0-401–P0-408 and P0-410 done |
| M5 Verification | blocked | P0-501 through P0-506 done |

## Current decisions needed

Still open until TrueForge probes / P0-210 (see `decisions/OPEN.md` and `provider-fixtures/`):

- Model preset for Operator and Research coworkers (`TRUEFORGE_API_KEY`, `MODEL_PROVIDER_API_KEY`).
- Research draft exact permission preview/denials (TrueForge harness).
- Save-as-skill successful Run binding (TrueForge).
- Demo durable artifact storage adapter and checked-in deployment diagram.
- DB fixture reset (P0-105 after P0-103 migrations applied locally).

Verified 2026-08-26 live probes:

- Composio github toolkit, tool slugs, account suffix `nizY`, descriptor hashes.
- Synthetic provider fixture `pramodthe/Hi-Tuto#10` with idempotent label reset.
- Daytona sandbox SDK upload/download (partial — TrueForge→storage path blocked).
- Local `ARTIFACT_STORAGE_DIR` adapter retain (separate probe; not yet same bytes as Daytona download).
- Local deployment preflight (partial — TrueForge/model keys missing).

Frozen without secrets:

- P0 feature profile disables native subagents, coordinator synthesis, component catalogue expansion and `iframe_v1`.
- Optional CopilotKit disabled-unless-parity policy for P0-210.
- Local artifact storage directory adapter for development.
- Controlled-UI / coworker / Task / skill / run-limit candidate fixtures under `provider-fixtures/`.

Never put credentials in this file.

## Recently completed

- P0-108 bounded channel context and pins merged to `main` via PR #10 (`1c3589b`).
- P0-205 mention/team router merged to `main` via PR #11 (`fe36cd1`).
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
