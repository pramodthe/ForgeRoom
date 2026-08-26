---
id: P0-000
title: Freeze demo and live tool contract
status: in_progress
owner: cursor-agent
started: 2026-08-26
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
- [x] Provider fixture reset runs twice without duplicates (label remove idempotent; label absent after both runs). DB fixture reset blocked until P0-103 migrations applied locally.
- [x] One seeded coworker and the exact conversational prompt/permission-draft fixture for creating the second coworker are frozen.
- [ ] The fixed TaskRecord fixture and one successful Run suitable for Save-as-skill are deterministic (TaskRecord candidate frozen; successful Run binding still requires TrueForge live probe — see save-as-skill.candidate.json).
- [x] Daytona produces sample file (SDK upload/download verified); local artifact storage retains sample file. TrueForge→storage path blocked on `TRUEFORGE_API_KEY`.
- [x] Run limits and deployment topology are recorded (local preflight verified; demo host candidate).
- [x] Pure AG-UI baseline candidates/fixtures and the optional-CopilotKit coherent-graph/no-canary/no-forced-override policy are frozen for P0-210 selection.
- [x] Controlled DataTable, bar/line chart, TaskCard, ArtifactCard and ChoiceForm/filter fixtures are deterministic, bounded and visually useful.
- [x] Native subagents, coordinator synthesis, component catalogue and `iframe_v1` are disabled in the P0 feature profile and rejected as unsupported.
- [x] `demo.md`, `decisions/OPEN.md` and `STATUS.md` are updated.

## Verification

Run redacted live probes for Composio read/write/read-back, fixture reset, a manual provisioner/AgentSpec fixture, Daytona file and storage download. Validate the conversational draft's expected structured output plus AG-UI/component, Task and Save-as-skill fixture inputs/outputs; P0-213 owns production conversational provisioning and P0-210 executes compatibility later. Attach commands and safe results; never attach credentials or generated source bodies.

## Completion evidence

- Files changed:
  - `specs/001-forgeroom-foundation/{demo.md,STATUS.md,tasks/P0-000-freeze-demo-contract.md}`
  - `provider-fixtures/**` (Composio verified rows, descriptor manifest, Daytona/artifact/deployment probe evidence, LIVE_PROBE_CHECKLIST)
  - `packages/test-fixtures/src/index.test.ts`
- Redacted live probes (2026-08-26, branch `codex/p0-000-live-probes`):
  - **Composio PASS**: 1 github account ACTIVE (suffix `nizY`); tools `GITHUB_GET_AN_ISSUE`, `GITHUB_ADD_LABELS_TO_AN_ISSUE`, `GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE`; synthetic `pramodthe/Hi-Tuto#10` label write + reconcile; descriptor hashes in `composio/descriptors/manifest.json`.
  - **Daytona PASS**: sandbox created (suffix `4c94`); SDK upload/download match (content sha256 `1026610d…9c369`).
  - **Artifact storage PASS (local)**: `forgeroom-p0-probe-sample.md` retained under `ARTIFACT_STORAGE_DIR` (sha256 `fe283ac9…9f53`).
  - **Deployment topology PARTIAL**: local preflight pass for DB/Composio/Daytona/storage; blocked on `TRUEFORGE_API_KEY`, `MODEL_PROVIDER_API_KEY`.
  - **BLOCKED**: Operator/Research model presets (OD-005), Research permission preview (OD-012), Save-as-skill Run binding, TrueForge sandbox→artifact path, DB fixture reset (workspaces table missing — run P0-103 migrations), demo durable storage, run-limit watchdog (P0-204).
- Descriptor exports/hashes: `provider-fixtures/composio/descriptors/manifest.json`
- Fixture reset evidence: provider label reset idempotent; DB reset pending P0-105 + migrations
- Open risks: `TRUEFORGE_API_KEY` and `MODEL_PROVIDER_API_KEY` required to finish remaining acceptance criteria

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
  - [x] Deterministic write + reconciliation read on synthetic data: `pramodthe/Hi-Tuto#10` label probe.
  - [x] Provider fixture reset twice (`OD-009`): label removal idempotent.
  - [ ] Model presets for Operator/Research (`OD-005`): blocked — `TRUEFORGE_API_KEY`, `MODEL_PROVIDER_API_KEY`.
  - [x] Daytona sample file + local storage retain; TrueForge download path blocked.

## Handoff (partial — do not mark done)

~~~text
Task: P0-000
Outcome: Composio/Daytona/local-artifact probes verified with redacted evidence; TrueForge model preset + DB fixture reset + demo deployment still blocked.
Requirements: AG-010, TR-001, SK-001, AGUI-009, GUI-003, TL-001, TL-003, TL-004, AP-004, SB-001
Changed: provider-fixtures/**, demo.md, STATUS.md, test-fixtures test
Verified: pnpm --filter @forgeroom/test-fixtures test
Evidence: provider-fixtures/composio/{accounts.verified.json,descriptors/manifest.json,tools.candidate.json}; daytona/sample-artifact.verified.json; LIVE_PROBE_CHECKLIST.md
Open risks: TRUEFORGE_API_KEY + MODEL_PROVIDER_API_KEY; P0-103 migrations for DB fixture reset; demo object storage
Next: set TrueForge/model keys and re-run blocked probes; P0-105 can seed DB once migrations applied
~~~
