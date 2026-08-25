# ForgeRoom specification workspace

This directory is the implementation entry point for ForgeRoom. It turns the product concept into small, traceable specifications and executable tasks for humans and coding agents.

## Start here

1. Read [the startup product specification](./002-forgeroom-platform/spec.md) and [roadmap](./002-forgeroom-platform/roadmap.md).
2. For the current 0.1 release, read [the foundation specification](./001-forgeroom-foundation/spec.md) and [implementation plan](./001-forgeroom-foundation/plan.md).
3. Check [0.1 status](./001-forgeroom-foundation/STATUS.md) and [platform status](./002-forgeroom-platform/STATUS.md).
4. Select one unblocked item from the [0.1 task index](./001-forgeroom-foundation/tasks.md); later releases use the [platform task index](./002-forgeroom-platform/tasks.md).
5. Follow [the coding-agent workflow](./AGENT_WORKFLOW.md).

`002-forgeroom-platform/` owns the startup-wide product, domain and release contracts. `001-forgeroom-foundation/` owns the exact 0.1 implementation slice. If they conflict, stop and resolve the conflict through a coordinated spec change before coding.

## Directory map

~~~text
specs/
├── README.md
├── AGENT_WORKFLOW.md
├── templates/
│   ├── TASK_TEMPLATE.md
│   ├── ADR_TEMPLATE.md
│   └── SPEC_CHANGE_TEMPLATE.md
├── 001-forgeroom-foundation/
    ├── spec.md                 # product behavior and P0 scope
    ├── plan.md                 # architecture and delivery sequence
    ├── STATUS.md               # current execution state
    ├── tasks.md                # ordered task index
    ├── ux.md                   # channel workroom and visual behavior
    ├── generative-ui.md        # controlled components and open generated UI
    ├── runtime.md              # TrueForge and Composio contracts
    ├── data-model.md           # entities, states, and invariants
    ├── security.md             # trust boundaries and safety controls
    ├── test-plan.md            # required verification
    ├── demo.md                 # fixed hackathon demo contract
    ├── contracts/
    │   ├── api.md
    │   ├── events.md
    │   └── ag-ui.md
    ├── decisions/              # accepted architectural decisions
    ├── checklists/             # release gates
    └── tasks/                  # P0 executable work
└── 002-forgeroom-platform/
    ├── spec.md                 # durable startup/product contract
    ├── roadmap.md              # 0.1, 0.2, 0.3 and 1.0 release gates
    ├── parity.md               # dated comparator and evidence claim gate
    ├── architecture.md         # platform modules and ownership
    ├── coworkers.md            # conversational coworker lifecycle
    ├── skills.md               # skill lifecycle and packaging
    ├── connections.md          # external accounts, tools and grants
    ├── knowledge.md            # files, URLs, repositories and citations
    ├── memory.md               # sourced, scoped, editable memory
    ├── search.md               # permission-safe global search/history
    ├── experimental-ui.md      # separately gated iframe experiment
    ├── records.md              # typed application-owned business data
    ├── workflows.md            # schedules, triggers and handoffs
    ├── teams.md                # multi-human authorization
    ├── notifications.md        # inbox, preferences and presence
    ├── retention.md            # retention, deletion, export and classification
    ├── advanced-orchestration.md # optional coordinator/native-subagent contracts
    ├── open-source.md          # self-hosting, portability and governance
    ├── security.md             # platform-wide security/privacy
    ├── data-model.md           # cross-domain schema and invariants
    ├── ux.md                   # complete startup UX/IA
    ├── test-plan.md            # alpha, beta and GA verification
    ├── traceability.md         # requirements → tasks → release evidence
    ├── tasks.md                # P1/P2/P3 dependency graph
    ├── tasks/                  # executable release work
    ├── contracts/              # platform API and domain events
    ├── checklists/             # 0.2, 0.3 and 1.0 release gates
    └── decisions/              # open product/platform decisions
~~~

## Authority and conflict rules

1. `002-forgeroom-platform/spec.md` owns durable product behavior and release capability boundaries.
2. `001-forgeroom-foundation/spec.md` owns the exact P0 slice; platform domain files own P1+ behavior and P0 domain files own P0 runtime detail.
3. Domain files own their named contracts: UX, runtime, data, API, events, security, tests, operations and demo.
4. Accepted ADRs explain implementation choices but may not silently change product behavior.
5. Task files describe delivery work and may not weaken a specification.

When two canonical files conflict, do not choose whichever is easier. Create a spec-change proposal, update every affected file and traceability link, then resume implementation.

## Status vocabulary

Use exactly these task states:

- `blocked`: a named dependency or decision prevents work.
- `ready`: requirements and dependencies are complete.
- `in_progress`: one owner is actively implementing it.
- `in_review`: implementation is complete and evidence is attached.
- `done`: acceptance criteria and required verification passed.

Only one owner may hold an `in_progress` task. A checkbox is checked only when the task is `done`.

## Requirement and task IDs

- Product requirements retain IDs such as `CH-003`, `RUN-005`, and `AP-013`.
- Startup domains add IDs such as `KN-005`, `RET-004`, and `AOR-009`; `traceability.md` maps each to its first valid release.
- Architecture decisions use `ADR-001`, `ADR-002`, and so on.
- Implementation tasks use `P0-*` for 0.1, `P1-*` for 0.2, `P2-*` for 0.3 and `P3-*` for 1.0.
- Tests use the requirement or task ID they prove; do not invent an unrelated tracking system.
- Every task-front-matter `specs` entry is a path relative to that task file; its file and optional anchor must resolve.

Every code pull request or coding-agent handoff must name at least one task ID and its linked requirements.

## Definition of ready

A task is `ready` only when:

- Its behavior and boundaries are unambiguous.
- All spec and ADR references exist.
- Dependencies are `done` or explicitly unnecessary.
- Acceptance criteria are observable.
- Verification commands or manual checks are known.
- Required secrets, fixtures, and provider choices are available without exposing credentials.

## Definition of done

A task is `done` only when:

- Its acceptance criteria pass.
- Relevant automated tests pass.
- Required manual or provider-backed checks have evidence.
- No secret, reasoning field, or raw credential was added to source, logs, fixtures, or screenshots.
- Documentation and contracts reflect the implemented behavior.
- `STATUS.md` and `tasks.md` are updated.
- Follow-up work is represented by a new task, not hidden in prose.
