# ForgeRoom 0.1 foundation specification

| Field | Value |
| --- | --- |
| Feature ID | 001-forgeroom-foundation |
| Status | Approved; provider-dependent work is blocked by P0-000 while independent scaffold work may begin |
| Product | Open-source AI-native collaboration workspace |
| Release collaboration | One authenticated human with at most two active persistent AI coworkers |
| Startup specification | `../002-forgeroom-platform/spec.md` |

## Product thesis

ForgeRoom is a channel-first workspace where a human invites persistent AI coworkers, addresses one or several of them, watches their work, receives interactive in-chat interfaces and artifacts, and approves consequential external actions.

The channel workspace is the product. The demo task is only proof that the same workspace can host arbitrary research, operations, content, tutorial, or software tasks without changing the core domain model.

## Core promise

> Invite one or more AI coworkers into a shared channel, give each a bounded role and tools, then watch, steer, and approve their work.

## Product boundaries

| Layer | Owns |
| --- | --- |
| ForgeRoom | Authenticated workspace, channels, persistent coworker profiles, shared event log, routing, grants, context, artifacts, approval UI, audit history |
| TrueForge | Agent sessions and turns, model execution, streaming, native subagents, Daytona sandbox, MCP calls, required-action pauses, compaction and stream replay |
| Composio | Connected application credentials, OAuth lifecycle, hosted MCP endpoint, and narrowly selected direct tools |

The browser never calls TrueForge or Composio directly. The application backend is the only service boundary exposed to the browser.

## Terminology

| Term | Meaning |
| --- | --- |
| Coworker | Persistent named AI participant owned by ForgeRoom |
| Native subagent | Temporary TrueForge child thread inside one coworker turn; never a channel member |
| Channel | Durable collaboration and security boundary |
| Run | One human-requested outcome |
| RunStep | One bounded assignment to a persistent coworker |
| Turn | One request or required-action response sent to a TrueForge session |
| PauseGroup | All approvals, questions, and supported auth actions returned by one paused TrueForge turn |
| ActionProposal | Immutable proposed external mutation awaiting an authorized human decision |
| Artifact | Durable application-controlled work product derived from a run or sandbox |
| Controlled component | Reviewed, typed React renderer exposed to an agent as a frontend tool |
| Open-generated UI | Post-0.1 experimental declarative HTML/CSS/behavior document rendered by a fixed bootstrap in an isolated iframe |
| UIInstance | Immutable, replayable lineage for one controlled component version; the P1 contract also supports an open-generated document rail |
| TaskRecord | Application-owned typed work item, distinct from a Message, Run, RunStep, Artifact, or external provider record |
| Skill | Versioned reviewed procedure executed by TrueForge; it never grants a tool, account, data source, or approval |

## Initial users

The 0.1 release has one seeded owner account. The owner can authenticate, conversationally draft and confirm a coworker, edit basic coworkers, manage channel membership, send work, create/update a TaskRecord, save a successful run as a private skill, stop or correct work, reconnect the fixed service account, and approve or deny actions.

Multi-human presence, invitations, and real-time collaboration are 0.2. Server-side authorization is still mandatory in P0; the browser cannot choose its own user ID or role.

## Primary scenarios

### S0 — Conversational coworker creation

1. The owner opens the trusted New coworker builder and describes a job in natural language.
2. A no-external-tools builder returns a schema-valid proposal; it has no creation or grant authority.
3. The server resolves literal models, skills, components, tools, accounts, channels and approval rules and creates an immutable CoworkerDraft.
4. The owner reviews effective read/write/destructive permissions, denials and acting account.
5. Explicit confirmation binds the displayed draft, policy and catalogue revisions and idempotently provisions the profile, grants and TrueForge definition.
6. Ordinary channel text may open a prefilled builder but never silently creates a coworker.

### S1 — Direct coworker task

1. The owner opens a channel and mentions one coworker.
2. The message and Run are persisted atomically.
3. The coworker's channel-specific TrueForge session receives a queued turn.
4. Normalized activity streams into the channel.
5. The coworker produces a visible result or artifact.

### S2 — Two-coworker task

1. The owner explicitly mentions both coworkers or uses `@team` in a two-coworker channel with no coordinator.
2. The application creates separate RunSteps.
3. The two TrueForge sessions work concurrently.
4. Results remain separately attributed.
5. Results remain separate; P0 has no coordinator or synthesis pass.

### S3 — Approval-gated external action

1. A coworker proposes an allowlisted Composio write.
2. TrueForge ends the current turn with required actions before the MCP mutation.
3. ForgeRoom creates an immutable proposal inside one PauseGroup.
4. The owner sees the exact account, tool, target, redacted arguments, effect, descriptor hash, and expiry.
5. Denial produces no provider call for that proposal.
6. Once all required actions are resolved, one compare-and-swap creates one response-only resume intent.
7. The deterministic demo update is read-reconciled and recorded in the application audit history.

### S4 — Sandbox artifact

1. A sandbox-enabled coworker uses TrueForge's Daytona integration with synthetic or public data.
2. Sandbox and command activity appears in the channel.
3. The application validates and downloads a produced file.
4. The file is hashed and copied to durable application-controlled storage.
5. A safe artifact preview remains after the sandbox ends.

### S5 — AG-UI generative response

1. A coworker analyzes the request through its TrueForge session.
2. The TrueForge-to-AG-UI adapter streams text, tool and activity events into the coworker's logical channel thread.
3. The coworker chooses a granted DataTable, bar/line chart, TaskCard, ArtifactCard or ChoiceForm controlled component.
4. ForgeRoom validates the component/version, complete props, declared data reads and call-time grant.
5. The component renders inline, progressively where supported, with an accessible text/table fallback.
6. An interaction becomes a schema-validated application command or trusted-host input flow; generated content never calls Composio, TrueForge or application APIs directly.
7. Refresh verifies the same UIInstance component/data/state hashes and replays it—or an inert fallback—without asking the model to regenerate it.

### S6 — Application-owned Task

1. A channel request creates one TaskRecord with source Message and Run links.
2. Explicitly granted humans/coworkers update only allowed fields and transitions through typed application commands.
3. Every change uses optimistic revision, idempotency, provenance, a channel event and audit history.
4. TaskCard/table/chart views render projections; the TaskRecord remains authoritative after refresh.

### S7 — Save successful work as a skill

1. The owner selects Save as skill on a completed Run.
2. A draft captures when to use it, inputs, ordered method, validation, output, failures, exact required tools/components and approvals, with source Run lineage.
3. Raw reasoning, credentials, transient answers and unredacted tool bodies are excluded.
4. The owner reviews and publishes immutable version 1, attaches it to one coworker within existing grants and rotates that coworker's session.
5. P0 ends after the immutable version is attached and the affected coworker session rotates; tested invocation lineage is owned by the 0.2 skill lifecycle.

## P0 requirements

### Channels and coworkers

| ID | Contract |
| --- | --- |
| CH-001 | Create, list, rename, archive, and open channels. |
| CH-002 | A channel contains one or more persistent coworkers. |
| CH-003 | Composer supports text, one mention, multiple mentions, and `@team`; human file upload is not P0. |
| CH-004 | Every channel event has a monotonic per-channel sequence. |
| CH-005 | Messages and normalized events survive reload and API restart. |
| CH-006 | Humans and persistent coworkers are visually distinct; unexpected native-subagent activity is inert/unsupported in P0. |
| CH-009 | Header shows coworker roster, availability, and current assignment. |
| CH-010 | Owner can add or remove a configured coworker. |
| CH-011 | Composer previews exact recipients before send. |
| AG-001 | Demo roles are configurable fixture data, never hardcoded orchestration classes. |
| AG-005 | Each persistent coworker has a separate TrueForge session per channel. |
| AG-006 | UI shows availability and active assignment. |
| AG-007 | Owner can edit name, standing instructions, model preset, and exact tool grants. |
| AG-008 | Add or remove one coworker without changing another coworker's grants. |
| AG-010 | A natural-language coworker request yields an immutable CoworkerDraft and causes no profile, connection, grant, membership or runtime mutation. |
| AG-011 | The draft shows exact model, tools, skills, components, account, channel, sandbox, data and approval policy plus effective denials; role prose never expands authority. |
| AG-012 | Explicit revision/hash/policy/catalogue-bound confirmation idempotently creates the coworker, membership, grants and provisioning command; stale drafts fail closed. |

### Runs and coordination

| ID | Contract |
| --- | --- |
| RUN-001 | One mention creates one queued RunStep for that coworker. |
| RUN-002 | Turns are serialized per channel-coworker session. |
| RUN-003 | A message to a busy coworker queues and never implicitly cancels current work. |
| RUN-004 | Owner can explicitly stop the current turn. |
| RUN-005 | Normalized TrueForge activity streams near real time. |
| RUN-006 | UI exposes queued, planning, running, awaiting input, awaiting approval, blocked connection, cancelling, completed, partial, failed, and cancelled states. |
| RUN-007 | Stop and correction create a visible new queued continuation. |
| RUN-009 | Stop blocks new turns but does not claim to retract an MCP call already executing. |
| OR-001 | Different persistent coworker sessions can run concurrently. |
| OR-002 | `@team` directly fans out to at most two enabled channel coworkers; no P0 coordinator planning or synthesis path exists. |
| OR-004 | Unknown, disabled, non-member, or cross-channel handles are rejected. |
| OR-005 | Eligible steps in different sessions execute concurrently. |
| OR-007 | Persistent coworkers cannot recursively dispatch persistent coworkers in P0. |

### AG-UI and generative UI

| ID | Contract |
| --- | --- |
| AGUI-001 | AG-UI is the northbound agent-to-frontend protocol; TrueForge remains the execution harness behind an authenticated application adapter. |
| AGUI-002 | Each persistent coworker has a stable logical AG-UI thread per channel, independent of TrueForge session rotation. |
| AGUI-003 | Per-coworker run endpoints accept standard `RunAgentInput` and emit schema-valid AG-UI SSE through the official client/application reducers; the durable channel stream multiplexes events with a monotonic channel sequence. A CopilotKit gateway is optional only after a coherent-graph parity gate. |
| AGUI-004 | Text, tool, lifecycle, message snapshot, state snapshot/delta and activity snapshot/delta events use the pinned stable AG-UI schemas. |
| AGUI-005 | `RUN_FINISHED` with interrupts ends only the wire run; the application RunStep remains awaiting input/approval until its complete PauseGroup resumes. |
| AGUI-006 | `STATE_DELTA` and `ACTIVITY_DELTA` use RFC 6902 against a valid prior snapshot; divergence requests a fresh snapshot. |
| AGUI-007 | Persistent coworkers are top-level application actors; P0 disables TrueForge native subagents until the P1 lineage, policy and UI mapping task ships. |
| AGUI-008 | `RAW`, readable reasoning/thinking events, secrets, signatures and arbitrary provider/tool bodies never cross the application boundary. |
| AGUI-009 | Package versions are exact; mixed, duplicate, forced-override and canary protocol graphs fail P0 startup. |
| GUI-001 | Rich in-chat components are a primary response medium, not artifact-only decoration or prose pasted into cards. |
| GUI-002 | A default-deny component registry owns stable name, version, kind, `agent_tool|server_only` exposure, model description, JSON Schema/Zod props, renderer, preview, declared reads, action intents and descriptor hash. |
| GUI-003 | P0 agent-tool components are DataTable, one bar/line chart family, TaskCard, ArtifactCard and ChoiceForm; approval, RequiredQuestion and connection cards are server-only trusted renderers, never agent tools. |
| GUI-004 | Component render permission, server data-function permission and real-world action permission are separate positive grants. |
| GUI-005 | Every invocation is rechecked server-side for publication, version, schema and effective coworker/channel grant at call time. |
| GUI-006 | Images use authenticated artifact revisions decoded and re-encoded to bounded PNG/WebP; tables/charts have schema, row/series/point and payload limits. |
| GUI-007 | P0 uses TrueForge's registered controlled GenUI path only. `generate_open_ui` is not registered, `iframe_v1` is rejected as unsupported, and no generated origin/capability/source assembly exists. |
| GUI-008 | Controlled components resolve all data through retained DataGrant snapshots and all state/action intent through exact schema-validated host commands; rendering grants no authority. |
| GUI-009 | Generated content never invokes MCP/Composio/TrueForge/application APIs directly or creates/decides ActionProposals. |
| GUI-010 | Approval cards remain trusted host React UI built from immutable ActionProposals; they are never generated inside an iframe. |
| GUI-011 | Controlled UIInstances persist independent render/state revisions, grants, lineage, component version/hash, data bindings/snapshots, validated args, accessible text and renderer hash for deterministic replay; revoked or incompatible instances fall back inertly. |
| GUI-012 | Unknown, revoked, failed or incompatible components render an inert error/text fallback without breaking the timeline. |
| GUI-013 | Rich output meets keyboard, focus, contrast, reduced-motion, screen-reader summary and data-table fallback requirements. |
| GUI-014 | One bounded ChoiceForm/filter interaction persists state, replays after refresh and may resolve only its exact UI component interrupt; it cannot approve, resume unrelated work or call external tools. |

### Tools, sandbox, and artifacts

| ID | Contract |
| --- | --- |
| TL-001 | At least one Composio hosted MCP session is connected through TrueForge. |
| TL-002 | Session uses direct tools and a literal allowlist. |
| TL-003 | Demo exposes two to four verified tools across no more than two applications. |
| TL-004 | Every toolkit is pinned to an exact connected-account ID. |
| TL-005 | Meta-execute, remote workbench, remote bash, dynamic write discovery, and account fallback are absent. |
| TL-006 | Effective TrueForge tools equal the server-computed grant intersection. |
| TL-007 | Startup fails closed on connector or descriptor drift. |
| TL-008 | Missing or expired auth produces `blocked_connection`; no account is substituted. |
| TL-011 | Connections is a fixed-account health, scopes, tools, Test, and Reconnect screen. |
| SB-001 | At least one coworker creates a TrueForge Daytona sandbox. |
| SB-002 | UI shows sandbox creation, command state, and produced files without secrets. |
| SB-003 | Published files are copied from ephemeral sandbox storage to durable application storage. |
| SB-004 | Artifacts retain content hash, MIME type, creator, source run and revision. |
| SB-005 | Artifact previews cannot execute arbitrary scripts. |

### Approvals, memory, and audit

| ID | Contract |
| --- | --- |
| AP-001 | Every external mutation is literally listed in TrueForge approval rules. |
| AP-002 | Approval events create immutable ActionProposals. |
| AP-003 | Only the authenticated authorized human may decide. |
| AP-004 | Card shows lineage, exact tool/account/target, safely redacted arguments, expected effect, and expiry. |
| AP-005 | Approval binds tool-call ID, argument hash, observed descriptor hash, account, artifact revision, policy revision, and expiry. |
| AP-006 | Any bound-field change makes the proposal stale. |
| AP-007 | One decision contributes to only one atomic PauseResume. |
| AP-008 | Denial produces no mutation for the denied proposal. |
| AP-009 | Every action in a PauseGroup is resolved before resume. |
| AP-010 | Required-action responses never share a turn with a normal message. |
| AP-011 | Questions render as answer cards and join the same response-only resume. |
| AP-013 | Exactly one compare-and-swap-controlled PauseResume may consume a PauseGroup. |
| ME-001 | Application provides bounded channel summary and sourced pins. |
| ME-002 | Cross-channel memory is disabled by default. |
| ME-003 | Owner can pin or unpin a message or artifact while retaining its source link. |
| AU-001 | Store allowlisted normalized event fields and hashes, not raw reasoning, credentials, signatures, or arbitrary tool bodies. |
| AU-002 | Append-only application audit history records declared source-to-action lineage. |
| AU-003 | Completed Run exports a safe JSON receipt with hashes, approvals, and verified receipts where supported. |
| AU-004 | ForgeRoom never requests, copies, or displays private model reasoning. |

### Tasks and skills

| ID | Contract |
| --- | --- |
| TR-001 | TaskRecord is an application-owned typed source of truth distinct from Message, Run, RunStep, Artifact, UIInstance and external provider objects. |
| TR-002 | Task create/update enforces channel authorization, exact coworker grant, allowed fields/transitions, optimistic revision, idempotency, immutable history, provenance and channel/audit events. |
| TR-003 | A reviewed internal application tool lets a granted coworker create/update only the exact Task fields and transitions it is allowed to change; P0 has no agent delete. |
| SK-001 | A completed successful Run can become a reviewable SkillDraft with source Run/RunStep IDs and content hashes. |
| SK-002 | A confirmed immutable SkillVersion records exact inputs, outputs, steps, validation, failures, required tools/components/data and approval boundaries. |
| SK-003 | Draft/publish excludes credentials, private reasoning, signatures, transient answers, unrelated history, unredacted tool bodies and unreviewed executable package content. |
| SK-004 | Attachment cannot expand coworker authority; missing requirements display a diff and block attachment/use. |
| SK-005 | Attaching or detaching a skill creates a coworker runtime revision and safe session rotation. |

## Hard P0 constraints

- One owner, one seeded workspace, at most two active coworkers in the demo channel, and at least one coworker created through the conversational review flow.
- One channel-specific TrueForge session per persistent coworker.
- One remote-active turn per session, enforced by queue claim and database constraint.
- One pinned Composio service identity.
- One real read, one deterministic approval-gated update and one Daytona artifact in the demo path.
- One controlled DataTable/bar-or-line chart, TaskCard, ArtifactCard and ChoiceForm/filter in the demo-capable component set.
- One application-owned TaskRecord and one saved immutable private skill version in the release path.
- Exact compatible AG-UI packages and a passing TrueForge adapter fixture before UI integration begins; optional CopilotKit packages do not gate P0.
- Synthetic or explicitly public sandbox input while Daytona outbound internet is unrestricted.
- Browser/stream reconnect is supported; uncertain process-restart work fails closed. Automatic active-worker recovery is P1.
- Provider exactly-once execution is not promised generically.

## Explicit P0 exclusions

- Multi-human presence or invitations.
- Human file uploads.
- Arbitrary Composio catalog browsing or per-human acting accounts.
- Application-level freeze-and-resume of a live model turn.
- Generic retries or generic unknown-write reconciliation UI.
- Active-worker crash failover.
- Full coworker version-history UI.
- Coordinator planning/synthesis and TrueForge native-subagent mapping/exposure.
- Recursive persistent-agent handoffs.
- Cross-channel memory, schedules, triggers, or browser takeover.
- Full component catalogue, reusable browser component authoring/publishing studio, custom open-generated iframe UI, arbitrary npm/CDN imports, generated UI network access, and A2UI/MCP-UI/Open-JSON-UI compatibility.
- Standalone run inspector or enterprise auth.

## 0.1 success

The 0.1 foundation is complete only when the requirements checklist, security checklist, test plan, and demo checklist all pass. The demo must show conversational coworker creation with permission preview, two concurrent persistent coworkers, one application-owned TaskRecord, an inline AG-UI visualization and bounded interaction, one Composio read, one Daytona artifact, one exact approval pause, browser refresh with deterministic controlled-UI/Task/approval replay, one deterministic reconciled write, one saved private skill, and one safe audit receipt.

## Open implementation gate

Tasks `P0-000` and `P0-210` jointly gate integration work: P0-000 freezes the provider/demo/component fixture, while P0-210 freezes/proves the exact pure AG-UI baseline and TrueForge frontend-tool bridge and separately records whether optional CopilotKit is disabled or parity-proven.
