---
id: P0-000
title: Freeze demo and live tool contract
status: done
owner: cursor-agent
started: 2026-08-26
completed: 2026-08-27
depends_on: []
requirements: [AG-010, TR-001, SK-001, AGUI-009, GUI-003, TL-001, TL-003, TL-004, AP-004, SB-001]
specs: [../demo.md, ../runtime.md#composio-session, ../generative-ui.md]
adrs: [ADR-003, ADR-005, ADR-006, ADR-007]
touches: [specs/001-forgeroom-foundation/demo.md, provider-fixtures]
---

# P0-000 — Freeze demo and live tool contract

## Outcome

Every provider- and demo-specific TBD is replaced by a verified, safe, reproducible choice.

## Acceptance criteria

- [x] Exact applications, direct-tool slugs, pinned account suffixes and descriptor hashes are recorded.
- [x] Deterministic write and reconciliation read succeed on synthetic fixture data.
- [x] Provider fixture reset runs twice without duplicates (label remove idempotent; label absent after both runs). DB schema ready for fixture reset — migrations applied locally 2026-08-26 (`workspaces` + full P0-103 schema present).
- [x] One seeded coworker and the exact conversational prompt/permission-draft fixture for creating the second coworker are frozen.
- [x] The fixed TaskRecord fixture and one successful Run suitable for Save-as-skill are deterministic (TaskRecord + Save-as-skill fixtures verified 2026-08-27; TrueForge instruction-only turn `done`, sha256 `550cc8bd…82530c9`).
- [x] Daytona produces sample file (SDK upload/download verified); local artifact adapter retain verified separately. TrueForge→storage path still blocked on adapter wiring (harness+OpenAI ready).
- [x] Run limits and deployment topology are recorded (local preflight **pass** — TrueForge v0.1.4 + OpenAI `openai/gpt-5-4-mini`; demo host candidate).
- [x] Pure AG-UI baseline candidates/fixtures and the optional-CopilotKit coherent-graph/no-canary/no-forced-override policy are frozen for P0-210 selection.
- [x] Controlled DataTable, bar/line chart, TaskCard, ArtifactCard and ChoiceForm/filter fixtures are deterministic, bounded and visually useful.
- [x] Native subagents, coordinator synthesis, component catalogue and `iframe_v1` are disabled in the P0 feature profile and rejected as unsupported.
- [x] `demo.md`, `decisions/OPEN.md` and `STATUS.md` are updated.

## Verification

Run redacted live probes for Composio read/write/read-back, fixture reset, a manual provisioner/AgentSpec fixture, Daytona file and storage download. Validate the conversational draft's expected structured output plus AG-UI/component, Task and Save-as-skill fixture inputs/outputs; P0-213 owns production conversational provisioning and P0-210 executes compatibility later. Attach commands and safe results; never attach credentials or generated source bodies.

## Completion evidence

- Files changed:
  - `specs/001-forgeroom-foundation/{demo.md,STATUS.md,tasks/P0-000-freeze-demo-contract.md,decisions/OPEN.md,tasks.md}`
  - `provider-fixtures/**` (Composio verified rows, descriptor manifest, Daytona/artifact/deployment probe evidence, LIVE_PROBE_CHECKLIST, Task/Save-as-skill verified fixtures)
  - `packages/test-fixtures/src/index.test.ts`
- Redacted live probes (2026-08-26 / 2026-08-27):
  - **Composio PASS**: 1 github account ACTIVE (suffix `nizY`); tools `GITHUB_GET_AN_ISSUE`, `GITHUB_ADD_LABELS_TO_AN_ISSUE`, `GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE`; synthetic target frozen to `pramodthe/ForgeRoom#35` (label `forgeroom-p0-probe`; temporary Hi-Tuto probe discarded); descriptor hashes in `composio/descriptors/manifest.json`. **2026-08-27:** GET `#35` verified; later same day label add/remove on `#35` verified for identity `pthebesfsu-a11y` (ForgeRoom **write** collaborator; invite accepted — earlier 403 was pre-acceptance).
  - **Daytona PARTIAL**: sandbox created (suffix `4c94`); SDK upload/download match (content sha256 `1026610d…9c369`). TrueForge→storage path blocked on adapter wiring.
  - **Artifact storage PARTIAL (local adapter)**: `forgeroom-p0-probe-sample.md` retained under `ARTIFACT_STORAGE_DIR` (sha256 `fe283ac9…9f53`) — separate probe; not same bytes as Daytona download.
  - **Deployment topology PASS**: local preflight includes TrueForge `http://127.0.0.1:8790` + OpenAI provider.
  - **OD-005 PASS**: Operator/Research model preset `openai/gpt-5-4-mini`; agents `forgeroom-operator` / `forgeroom-research-draft`; smoke turn `done` → `p0-openai-ok`. Local TrueForge needs no `TRUEFORGE_API_KEY`.
  - **OD-012 PASS**: Research permission preview exactDiff frozen; Save-as-skill TrueForge instruction-only turn `done` (session suffix `30yd5y`, turn suffix `194qgy`, output sha256 `550cc8bd…82530c9`); stable application Run/skill fixture IDs frozen.
  - **DB READY (2026-08-26)**: `pnpm --filter @forgeroom/db migrate` reports up to date; `workspaces` table present (seed count 1).
- Descriptor exports/hashes: `provider-fixtures/composio/descriptors/manifest.json`
- Fixture reset evidence: provider label reset idempotent; DB reset owned by P0-105
- Follow-ups (not P0-000 blockers): TrueForge→artifact adapter wiring (P0-201+/P0-310+); demo durable object storage (OD-006); run-limit hard enforcement (P0-204); full application write+artifact+receipt Run materialization (P0-309/312/313/318)

## Work log

- 2026-08-26 — Claimed by cursor-agent on branch `codex/p0-000-freeze-demo-contract`.
  - Outcome: Replace provider/demo TBDs with frozen safe choices or explicitly labeled candidates; never invent verified live-probe success.
  - Requirements: AG-010, TR-001, SK-001, AGUI-009, GUI-003, TL-001, TL-003, TL-004, AP-004, SB-001.
  - Non-goals: inventing verified Composio hashes; enabling CopilotKit; implementing P0-105; selecting final AG-UI lockfile (P0-210); committing secrets.

- 2026-08-26 — Frozen without secrets:
  - P0 feature profile disables native subagents, coordinator synthesis, component catalogue expansion, `iframe_v1`; CopilotKit disabled-unless-parity.
  - AG-UI candidates `@ag-ui/core@0.0.57` + `@ag-ui/client@0.0.57` + reject known CopilotKit 1.69.0 split.
  - Seeded Operator + Research prompt/draft fixture; Task + Save-as-skill candidates; controlled-UI fixtures; run limits; local/dev artifact storage; deployment topology candidates.
  - Extended `P0_UNSUPPORTED_CAPABILITIES` with coordinator/catalogue names.

- 2026-08-26 — Rebased onto `origin/main` after P0-104 merge (`aec014c`). Recorded preferred Composio candidates from public docs only: toolkit `github`, read/reconcile `GITHUB_GET_ISSUE`; write slug intentionally unset until live discovery. Unit tests green for contracts + test-fixtures.

- 2026-08-26 — Qodo remediation: assert `coordinator_planning` unsupported; allow repo-root checkout detection; uncheck premature successful-Run acceptance until live binding exists.

- 2026-08-26 — Live probes on `codex/p0-000-live-probes` from `origin/main`:
  - [x] Exact Composio apps/slugs confirmed on pinned account (`OD-002`/`OD-003`): github; read/reconcile `GITHUB_GET_AN_ISSUE`; write `GITHUB_ADD_LABELS_TO_AN_ISSUE`.
  - [x] Pinned account redacted suffixes (`OD-004`): `nizY`.
  - [x] Descriptor hash exports: `composio/descriptors/manifest.json`.
  - [x] Deterministic write + reconciliation read on synthetic data: frozen target `pramodthe/ForgeRoom#35` (prior temporary Hi-Tuto probe discarded; GET + live label write/reconcile verified 2026-08-27 as `pthebesfsu-a11y` write collaborator).
  - [x] Provider fixture reset twice (`OD-009`): label removal idempotent on `#35` (2nd remove returns expected provider 404 "Label does not exist"; label absent after both).
  - [x] Model presets for Operator/Research (`OD-005`): `openai/gpt-5-4-mini` on local TrueForge; Operator smoke turn verified.
  - [x] Research draft permission preview (`OD-012`): exactDiff from Composio verified catalogue; UI binding deferred to P0-213.
  - [x] Daytona sandbox SDK upload/download verified; local adapter retain verified separately (different sha256). TrueForge→storage path blocked on adapter wiring.

- 2026-08-27 — Completed remaining OD-012 Save-as-skill Run binding:
  - TrueForge `forgeroom-operator` non-stream turn `done` with instruction-only Markdown (sections when_to_use/inputs/method/validation/output/failures).
  - Redacted session suffix `30yd5y`, turn suffix `194qgy`, output sha256 `550cc8bd8a6e495cb647239ad241360156722c56f262c0c8825b2d8ab82530c9`.
  - Frozen stable application Run/step/skill fixture IDs and review manifest; TaskRecord fixture promoted to verified.
  - Marked P0-000 done.

- 2026-08-27 — OD-009 sandbox target migration: created ForgeRoom-owned non-production issue `pramodthe/ForgeRoom#35` for Composio label write/reconcile/reset; replaced temporary Hi-Tuto fixture wiring across provider-fixtures + demo/STATUS/OPEN. Live GET `#35` verified; initial label write 403 was pre-invite. Later same day: `pthebesfsu-a11y` confirmed as write collaborator (no pending invite); Composio add/remove/GET on `#35` succeeded (issue event actor `pthebesfsu-a11y`).

## Handoff

~~~text
Task: P0-000
Outcome: Demo/tool contract frozen; Composio/Daytona/OpenAI+TrueForge presets and Save-as-skill TrueForge Run binding verified with redacted evidence
Requirements: AG-010, TR-001, SK-001, AGUI-009, GUI-003, TL-001, TL-003, TL-004, AP-004, SB-001
Changed: provider-fixtures/tasks/{save-as-skill,task-record}.candidate.json, packages/test-fixtures/src/index.test.ts, demo.md, STATUS.md, decisions/OPEN.md, tasks.md, P0-000 task
Verified: TrueForge instruction-only Save-as-skill turn done; fixture unit test; prior Composio/Daytona/Operator probes
Evidence: provider-fixtures/tasks/save-as-skill.candidate.json; LIVE_PROBE_CHECKLIST.md
Open risks: TrueForge→artifact adapter wiring; demo durable object storage; P0-204 run-limit hard enforcement (tracked by their owner tasks)
Next: treat P0-105 as done (already merged); continue unblocked M2/M3 work (e.g. P0-301 when secrets ready)
~~~
