# ForgeRoom 0.1 implementation plan

| Field | Value |
| --- | --- |
| Status | Ready after P0-000 for integration-dependent work |
| Scope | P0 defined in `spec.md` |
| Delivery model | Small vertical slices with tests and evidence in every task |

## Reference stack

| Layer | Choice |
| --- | --- |
| Workspace | pnpm workspaces |
| Runtime | TypeScript on Node.js 22+ |
| Web | React, Vite, TanStack Router, TanStack Query |
| UI | Tailwind CSS and accessible Radix primitives |
| Agentic UI | Official AG-UI client plus application-owned React reducers/component registry; CopilotKit hooks optional after parity gate |
| API | Hono |
| Contracts | Zod plus pinned `@ag-ui/core` shared between server and browser |
| Database | PostgreSQL and Drizzle ORM |
| Realtime | Standard per-coworker AG-UI SSE plus durable multiplexed channel SSE |
| Jobs | PostgreSQL-backed serial queues with short leases |
| Agent runtime | TrueForge SDK |
| External apps | Composio hosted MCP direct-tools session |
| Sandbox | TrueForge Daytona integration |
| Artifact storage | Adapter selected by P0-000; local development and durable demo target |
| Tests | Vitest and Playwright |

## System ownership

~~~mermaid
flowchart LR
    Browser[React channel workroom]
    Components[Controlled component registry]
    Records[Application Task records]
    Skills[Private skill versions]
    API[Hono application API]
    AGUI[TrueForge AG-UI adapter]
    UIBroker[Private UI component tool broker]
    Worker[Run worker]
    DB[(PostgreSQL)]
    Store[(Artifact storage)]
    TF[TrueForge]
    Model[Model provider]
    Daytona[Daytona]
    Composio[Composio direct-tools MCP]
    Apps[External apps]

    Browser -->|authenticated HTTP| API
    API -->|AG-UI run SSE + resumable channel stream| Browser
    Browser --> Components
    Browser --> Records
    Browser --> Skills
    API --> DB
    API --> Worker
    Worker --> AGUI
    Worker --> DB
    AGUI --> TF
    TF -->|literal render tools| UIBroker
    UIBroker --> DB
    Worker --> Store
    TF --> Model
    TF --> Daytona
    TF --> Composio
    Composio --> Apps
~~~

The database is authoritative for channels, messages, CoworkerDrafts, coworker/skill versions and bindings, TaskRecords, Runs, RunSteps, grants, session revisions, AG-UI event envelopes, controlled UI component versions/UIInstances, PauseGroups, artifacts, and audit history. TrueForge is authoritative for its sessions, turns, sandbox lifecycle, skills execution and replayable provider state. Composio is authoritative for connected-account credentials and external tool execution. P0 has no generated iframe rail.

## Recommended repository layout

~~~text
apps/
  web/
  api/
  worker/
packages/
  contracts/
  domain/
  db/
  integrations/
    trueforge/
    ag-ui/
    composio/
    artifacts/
  orchestration/
  ui/
    components/
  test-fixtures/
infra/
  compose.yaml
specs/
~~~

API and worker may run in one process for the hackathon, but module boundaries and persisted commands must remain separable.

## Main execution paths

### Normal message

~~~text
authenticated command
→ persist Message + Run + RunSteps
→ append channel event
→ enqueue each channel-coworker session
→ short lease claim
→ create TrueForge turn
→ normalize streamed events
→ append channel events
→ release active slot when turn completes
~~~

### Required-action pause

~~~text
turn.done(requiredActions != [])
→ close current AgentTurn, keep RunStep nonterminal
→ persist one PauseGroup and all RequiredActions
→ collect decisions/answers
→ CAS PauseGroup collecting → resuming
→ persist one PauseResume intent
→ create one response-only TrueForge turn
→ reconcile uncertain create from turn history
→ continue RunStep
~~~

### Controlled generative UI

~~~text
deployment registers renderer versions; browser compatibility is a hint
→ server intersects deployed renderer + published component + coworker/channel grants
→ application tool bridge exposes exact typed component tools to TrueForge
→ TrueForge tool call becomes AG-UI TOOL_CALL events
→ server validates complete props and call-time grant
→ persist immutable UIInstance revision
→ render registered React component inline
→ interaction passes through schema-validated application command
→ emit TOOL_CALL_RESULT/state update and continue logical turn when required
~~~

### P1 open-generated UI

The detailed flow remains a P1 design and is not built, registered, deployed or tested by P0.

~~~text
TrueForge calls the granted open UI generator
→ AG-UI ACTIVITY_SNAPSHOT creates a streaming instance
→ private assembler receives inert ordered CSS, HTML and declarative-manifest fragments
→ exact source-free AG-UI snapshot/delta schema tests and increments activity revision
→ parser rejects script, handlers, inputs, authored URLs, navigation, external resources and ineligible session context
→ immutable final delivery-body/data blobs publish to staged hash-bound storage
→ trusted headless gate loads the exact staged response and records hash-bound evidence
→ one atomic transaction commits revision, current/last-good pointers, final source reference and channel event
→ dedicated cookieless-origin member iframe loads the fixed hash-pinned bootstrap
→ BOOT → parent INIT → frame READY activates it only in that browser
→ allowlisted postMessage intent reaches trusted parent
→ parent obtains one-use server token, or host confirmation challenge with no token; gateway revalidates actor, instance, ActionGrant, input hash and command
~~~

### Tool or policy change

~~~text
block session queue
→ cancel active turn for a restriction
→ stale unresolved actions/proposals
→ compile new SessionRevision
→ create new TrueForge session
→ atomically swap current generation
→ rebind valid normal queue items
→ retire old session
~~~

## Delivery phases

### Phase 0 — Contract freeze

Complete `P0-000`, scaffold enough for `P0-210`, then freeze the exact pure AG-UI/TrueForge bridge and record optional CopilotKit as disabled unless parity-proven. Protocol-neutral P0-102 domain/database work may proceed from P0-101 in parallel; exact upstream AG-UI bindings and component execution wait for the P0-210 gate. No tool-specific approval or demo integration starts before its relevant gate is done.

### Phase 1 — Foundation

- Workspace scaffold, CI, shared contracts, database and migrations.
- Seeded authenticated owner.
- Channels, coworkers, canonical event log and SSE.
- CoworkerDraft and fixed TaskRecord contracts/schema/API.
- Mocked three-pane workroom can proceed in parallel with runtime adapters.

### Phase 2 — TrueForge runtime

- SessionRevision compiler and session provisioner.
- Per-session serial queue with leases.
- Turn creation, event normalization, browser reconnect and fail-closed restart.
- Stable AG-UI version gate, TrueForgeAGUIAdapter, per-coworker logical threads and durable stream multiplexing.
- Stop and correction.

### Phase 3 — Multi-agent channel

- Mention and `@team` routing.
- Concurrent distinct sessions.
- Bounded channel context and pinning.
- Direct two-coworker fan-out only; coordinator/native-subagent support is P1.

### Phase 4 — Composio and approvals

- Pinned direct-tools session and startup manifest verification.
- ToolPolicyDefinitions.
- Real read.
- PauseGroup persistence, secure decisions and atomic resume.
- Deterministic write, reconciliation and audit receipt.

### Phase 5 — Sandbox, artifacts and product polish

- Daytona event path, file extraction and durable storage.
- Controlled component registry and the DataTable, one bar/line chart, TaskCard, ArtifactCard and ChoiceForm renderers.
- Conversational coworker review UI, Task views and Save-as-skill review/publish/attach flow.
- Safe previews, deterministic UIInstance replay, Work/Artifacts/Context tabs.
- Accessibility, required states and run drawer.
- Integration, security and browser suites.

### Phase 6 — Release and demo

- Dependency preflight.
- Clean-clone documentation.
- Fixture reset and repeated rehearsal.
- Three-minute video and required review evidence.

## Critical path

~~~text
P0-000 demo contract + P0-101 scaffold
→ protocol-neutral contracts/database + TrueForge session/queue/event ingestion
↘ P0-210 protocol/tool-bridge spike in parallel before exact AG-UI bindings
→ AG-UI adapter + durable multiplexed replay
→ component registry/grants + controlled GenUI
→ Composio session + manifest + tool policies
→ PauseGroup + decision + resume
→ deterministic write + reconciliation
→ conversational coworker + Task + save-as-skill vertical slices
→ AG-UI/controlled-GenUI conformance + end-to-end browser test
→ preflight and demo rehearsal
~~~

Mocked UI, channel APIs, context/pinning, and artifact storage can proceed in parallel once their contract dependencies are complete.

## Build order guardrails

- Database constraints precede concurrent workers.
- Normalized event contracts precede activity UI.
- Pinned pure AG-UI compatibility and golden fixtures precede agentic UI; optional CopilotKit hooks require a separate coherent-graph parity pass.
- Component registry and call-time grants precede component tool exposure.
- Complete props validate on both server and client before controlled rendering.
- P0 rejects open/iframe UI; P1-317/P1-506 must pass the complete sandbox/origin/conformance contract before any later activation.
- Trusted approval UI is never rendered inside generated UI.
- Exact live descriptors precede ToolPolicyDefinitions.
- ToolPolicyDefinitions precede approvals UI and write execution.
- PauseGroup persistence precedes decision endpoints.
- Durable artifact storage precedes published previews.
- Security acceptance tests ship with the feature they protect.
- The final E2E task integrates already-tested slices; it is not where missing unit or security tests are postponed.

## Completion

Release requires every P0 task in `tasks.md` to be `done`, all three checklists to pass, AG-UI/generative-UI conformance evidence to exist, and `STATUS.md` to contain no unresolved P0 blocker.
