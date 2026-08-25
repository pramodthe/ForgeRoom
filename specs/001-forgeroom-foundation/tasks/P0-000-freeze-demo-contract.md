---
id: P0-000
title: Freeze demo and live tool contract
status: ready
owner: unassigned
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
- [ ] One seeded coworker and the exact conversational prompt/permission-draft fixture for creating the second coworker are frozen.
- [ ] The fixed TaskRecord fixture and one successful Run suitable for Save-as-skill are deterministic.
- [ ] Daytona produces and artifact storage retains one sample file.
- [ ] Run limits and deployment topology are recorded.
- [ ] Pure AG-UI baseline candidates/fixtures and the optional-CopilotKit coherent-graph/no-canary/no-forced-override policy are frozen for P0-210 selection.
- [ ] Controlled DataTable, bar/line chart, TaskCard, ArtifactCard and ChoiceForm/filter fixtures are deterministic, bounded and visually useful.
- [ ] Native subagents, coordinator synthesis, component catalogue and `iframe_v1` are disabled in the P0 feature profile and rejected as unsupported.
- [ ] `demo.md`, `decisions/OPEN.md` and `STATUS.md` are updated.

## Verification

Run redacted live probes for Composio read/write/read-back, fixture reset, a manual provisioner/AgentSpec fixture, Daytona file and storage download. Validate the conversational draft's expected structured output plus AG-UI/component, Task and Save-as-skill fixture inputs/outputs; P0-213 owns production conversational provisioning and P0-210 executes compatibility later. Attach commands and safe results; never attach credentials or generated source bodies.

## Completion evidence

- Files changed:
- Redacted live probes:
- Descriptor exports/hashes:
- Fixture reset evidence:
- Open risks:
