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

- [ ] Exact applications, direct-tool slugs, pinned account suffixes and descriptor hashes are recorded.
- [ ] Deterministic write and reconciliation read succeed on synthetic fixture data.
- [ ] Fixture reset runs twice without duplicates or production impact.
- [x] One seeded coworker and the exact conversational prompt/permission-draft fixture for creating the second coworker are frozen.
- [x] The fixed TaskRecord fixture and one successful Run suitable for Save-as-skill are deterministic.
- [ ] Daytona produces and artifact storage retains one sample file.
- [x] Run limits and deployment topology are recorded.
- [x] Pure AG-UI baseline candidates/fixtures and the optional-CopilotKit coherent-graph/no-canary/no-forced-override policy are frozen for P0-210 selection.
- [x] Controlled DataTable, bar/line chart, TaskCard, ArtifactCard and ChoiceForm/filter fixtures are deterministic, bounded and visually useful.
- [x] Native subagents, coordinator synthesis, component catalogue and `iframe_v1` are disabled in the P0 feature profile and rejected as unsupported.
- [x] `demo.md`, `decisions/OPEN.md` and `STATUS.md` are updated.

## Verification

Run redacted live probes for Composio read/write/read-back, fixture reset, a manual provisioner/AgentSpec fixture, Daytona file and storage download. Validate the conversational draft's expected structured output plus AG-UI/component, Task and Save-as-skill fixture inputs/outputs; P0-213 owns production conversational provisioning and P0-210 executes compatibility later. Attach commands and safe results; never attach credentials or generated source bodies.

## Completion evidence

- Files changed:
  - `specs/001-forgeroom-foundation/{demo.md,STATUS.md,tasks.md,decisions/OPEN.md,tasks/P0-000-freeze-demo-contract.md}`
  - `provider-fixtures/**` (feature profile, AG-UI candidates/policy, run limits, deployment/artifact candidates, Composio/coworker/task/UI/Daytona scaffolds, live-probe checklist)
  - `packages/contracts/src/unsupported.ts` (+ test)
  - `packages/test-fixtures` (fixture loaders + validation tests; depends on `@forgeroom/contracts`)
  - `packages/integrations/artifacts` (local-directory adapter freeze)
  - `.env.example`, `.gitignore`
- Redacted live probes: blocked-on-secrets (see work log)
- Descriptor exports/hashes: none yet
- Fixture reset evidence: blocked pending verified synthetic IDs + P0-105
- Open risks: P0-104 not yet on `main`; live Composio/Daytona/TrueForge credentials unavailable in this agent environment

## Work log

- 2026-08-26 — Claimed by cursor-agent on branch `codex/p0-000-freeze-demo-contract` from latest `origin/main` (`d7b6273`). Note: P0-104 is still open / in_review and not merged to `main`.
  - Outcome: Replace provider/demo TBDs with frozen safe choices or explicitly labeled candidates; never invent verified live-probe success.
  - Expected changes: `demo.md`, `OPEN.md`, `STATUS.md`, `provider-fixtures/`, feature-profile/unsupported capability wiring, artifact boundary, tests.
  - Requirements: AG-010, TR-001, SK-001, AGUI-009, GUI-003, TL-001, TL-003, TL-004, AP-004, SB-001.
  - Non-goals: inventing Composio slugs/hashes; enabling CopilotKit; implementing P0-105 seed/reset; selecting final AG-UI lockfile (P0-210); opening a PR before live probes if the slice stays partial; committing secrets.
  - Verification: unit tests for feature profile + controlled-UI props; inventory of remaining blocked-on-secrets criteria; human checklist in `provider-fixtures/LIVE_PROBE_CHECKLIST.md`.

- 2026-08-26 — Frozen without secrets:
  - P0 feature profile disables native subagents, coordinator synthesis, component catalogue expansion, `iframe_v1`; CopilotKit disabled-unless-parity.
  - AG-UI candidates `@ag-ui/core@0.0.57` + `@ag-ui/client@0.0.57` + reject known CopilotKit 1.69.0 split.
  - Seeded Operator + Research prompt/draft fixture; Task + Save-as-skill candidates; controlled-UI fixtures; run limits; local/dev artifact storage; deployment topology candidates.
  - Extended `P0_UNSUPPORTED_CAPABILITIES` with coordinator/catalogue names.

- 2026-08-26 — **blocked-on-secrets** acceptance criteria (human checklist):
  - [ ] Exact Composio apps/slugs (`OD-002`/`OD-003`)
  - [ ] Pinned account redacted suffixes (`OD-004`) — needs `COMPOSIO_API_KEY`, `COMPOSIO_CONNECTED_ACCOUNT_ID`
  - [ ] Descriptor hash exports
  - [ ] Deterministic write + reconciliation read on synthetic data
  - [ ] Fixture reset twice (`OD-009` provider IDs) — also needs `DATABASE_URL`
  - [ ] Model presets for Operator/Research (`OD-005`) — needs `TRUEFORGE_*`, `MODEL_PROVIDER_API_KEY`
  - [ ] Daytona sample file + durable storage retain — needs `DAYTONA_API_KEY`, artifact storage env
  - Env var list and steps: `provider-fixtures/LIVE_PROBE_CHECKLIST.md`

## Handoff (partial — do not mark done)

- Outcome: Safe/demo contract structure and P0 feature/AG-UI policies frozen; live provider verification still blocked on secrets.
- Next: human live probes → fill verified rows → then move task to `in_review`.
- Next unblocked when secrets land: continue P0-000 evidence; P0-105 remains blocked on P0-000 + P0-104.
