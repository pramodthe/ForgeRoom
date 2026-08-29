# TrueForge, orchestration, and Composio runtime specification

| Field | Value |
| --- | --- |
| Status | Canonical P0 runtime contract |
| ADRs | ADR-001 through ADR-007 |
| Primary requirements | AG-005, AG-010–AG-012, RUN-001–RUN-007, RUN-009, OR-001–OR-007, AGUI-001–AGUI-009, GUI-001–GUI-014, TL-001–TL-008, AP-001–AP-013, SB-001–SB-005, TR-001–TR-003, SK-001–SK-003 |

## Runtime invariants

1. One persistent coworker has one separate TrueForge session per channel.
2. Only one remote-active turn exists in a session.
3. Normal messages to a busy session queue; they never create a cancelling turn.
4. Persistent coworkers coordinate through application-owned Runs and context, not by sharing a TrueForge session.
5. P0 disables TrueForge native subagents. P1 may enable temporary child threads only after lineage, inherited-policy, approval and UI mapping ship.
6. Application channel state and permissions never derive from model prose.
7. Composio exposes exact direct tools and exact pinned accounts only.
8. Every mutation tool is literally approval-gated in the compiled AgentSpec.
9. A `turn.done` with required actions completes the AgentTurn but not the RunStep.
10. Every required action from one turn resumes in one response-only turn through one durable PauseResume intent.
11. AG-UI is the browser-facing protocol; raw TrueForge events never become a browser API.
12. One persistent coworker owns one stable logical AG-UI thread per channel even when its TrueForge session rotates.
13. Component rendering, component data reads and external actions are separately granted and separately audited.
14. Controlled GenUI is untrusted presentation data with no direct application/provider authority.
15. P0 does not register `generate_open_ui`, accept `iframe_v1`, create generated-document revisions/capabilities or deploy a generated origin. The retained iframe contract below is P1-only.

## Session topology

~~~text
Channel
├── Coworker A → TrueForge session A
├── Coworker B → TrueForge session B
└── application-owned shared context, Runs, artifacts and audit
~~~

Do not put two named persistent coworkers in one TrueForge session. Separate sessions provide independent history, tools, permissions and concurrency.

## SessionRevision compilation

When a coworker joins a channel:

1. Snapshot editable profile, model, sandbox, exact skill bindings, external-tool and frontend-component settings into an immutable SessionRevision; compile `dynamic_sub_agents: false` in P0.
2. Compute effective external tools and UI component tools as separate intersections of workspace policy, channel grants, coworker grants, connected-account delegation, component publication and server policy.
3. Resolve exact TrueForge connector names.
4. Compile an inline AgentSpec with literal enabled tools and literal approval-required mutation tools.
5. Create the TrueForge session.
6. Insert an immutable ChannelAgentSessionGeneration containing session ID, ordinal, SessionRevision, effective-spec and approval-policy hashes, then point the stable channel/coworker logical-session row at it.
7. P0 stores no iframe capability state. P1-317 introduces the monotonic iframe-context classification fields defined later in this document before enabling that rail.

The inline AgentSpec is immutable for that session.

For P1 iframe implementations, the closed classification order is `synthetic_only < public_safe < restricted_or_unknown` and the join is `max`: synthetic maps to the first value, explicitly public to the second, and workspace_safe/private/mixed-unclassified/unknown to the restrictive value. `channel_agent_sessions.iframe_context_eligible` is true only for the first two values and may transition from true to false but never back to true for the same stable `(channel, coworker, logical_agui_thread_id)`. P0 must reject all iframe input instead of attempting this classification path.

## Session rotation

Any standing-instruction, model, external-tool/component grant, connector, acting-account or approval-policy change that changes the descriptors offered to TrueForge rotates affected sessions:

1. Set session state to `rotating`; block new queue claims.
2. For a restriction, revocation or policy tightening, request active-turn cancellation immediately. Already executing MCP calls may still finish.
3. Mark unresolved PauseGroups, questions and proposals from the old generation stale.
4. Compile a new SessionRevision and create a new TrueForge session.
5. Atomically make the new generation current and retire the old session.
6. Rebuild and rebind still-valid normal queued messages.
7. Never migrate an approval response, question answer or resume intent.
8. Retain old IDs and hashes for historical rendering.
9. Carry every applicable skill/capability revision. P1 additionally carries the monotonic iframe classification high-water mark and rejects downgrade/reset attempts.

## Channel context envelope

TrueForge does not share memory across separate sessions. Before each normal turn, build:

~~~text
CHANNEL_CONTEXT_V1
Channel ID, name and mission
Current human and coworker roster
Confirmed pinned items with source IDs
Active Run goal and this coworker's assignment
Current safe artifact references
Normalized events since this session's last delivered channel sequence
Current human request
Explicit untrusted-content notice
END_CHANNEL_CONTEXT
~~~

Rules:

- Use a compact summary plus bounded recent deltas, never the full channel transcript.
- Store `last_delivered_channel_sequence` per channel session.
- Advance the cursor only after remote turn creation is confirmed or reconciled.
- Never include another channel's content without an explicit sourced share.
- Never send credentials, raw provider results, private reasoning, or sensitive sandbox-forbidden data.

## Routing

- One mention: one direct RunStep.
- Multiple mentions: direct RunSteps, no planning or synthesis.
- `@team`: direct fan-out only when one or two coworkers are enabled.
- No mention in a one-coworker channel: route to that coworker.
- No mention in a multi-coworker channel: require recipient selection.
- Busy target: enqueue.

P0 has no coordinator DispatchPlan/synthesis or recursive persistent-coworker dispatch path. P1-207 owns that contract.

## Serial turn queue

- Normal items are FIFO per ChannelAgentSession.
- Required-action response items outrank everything else. An exact-generation `component_interaction_response` outranks later normal messages but never a PauseGroup response.
- Claim one item in a short database transaction with lease owner and expiry.
- Commit before calling TrueForge or opening a stream.
- Heartbeat while a remote turn is active.
- A partial unique database index allows one AgentTurn in acquiring, creating, streaming or resuming state per session.
- Never hold a database transaction or row lock for the lifetime of SSE.
- While a PauseGroup is unresolved, the remote-active slot is free but the session accepts only that group's response intent.
- A component interaction response is valid only for its waiting UIComponentInterrupt and exact current generation; unlike a normal item it never rebinds during rotation.

## Turn creation and crash reconciliation

Every input includes a deterministic application run token and explicit intended predecessor turn ID.

1. Persist queue claim and local AgentTurn intent.
2. Call `createTurn`, then subscribe.
3. Persist returned turn ID before releasing the claim.
4. If remote creation is uncertain, query turn history and match application run token, predecessor and input hash.
5. Never blindly create a second turn because a response was lost; a second turn can cancel the live first turn.

An exact history match may use the SC-001 reconciliation-only `uncertain → streaming` edge. A new
create response may bind only `creating → streaming`; it cannot recover an uncertain row. P0
browser refresh reconnects to application SSE and the current TrueForge stream. After a process
restart, uncertain work becomes `needs_attention` and fails closed until history reconciliation
succeeds or the owner abandons the step. Automatic active-worker failover is P1.

## TrueForge-to-AG-UI adapter

The adapter is the only northbound interpreter of TrueForge runtime state. For each ChannelAgentSession it maintains a stable logical AG-UI `threadId`; each AgentTurn receives a new AG-UI `runId`. TrueForge session rotation does not change the logical thread.

The normal application message command may create several RunSteps. Each step runs through its own coworker AG-UI stream, and the application persists a channel-sequenced envelope around every sanitized event before broadcast.

Required mapping:

| Runtime condition | AG-UI event |
| --- | --- |
| AgentTurn accepted | `RUN_STARTED` |
| safe assistant delta | `TEXT_MESSAGE_START/CONTENT/END` |
| frontend or backend tool lifecycle | `TOOL_CALL_START/ARGS/END/RESULT` after safe normalization |
| channel/shared UI projection | `STATE_SNAPSHOT/DELTA` |
| assignment, sandbox, artifact or controlled-component progress | typed `ACTIVITY_SNAPSHOT/DELTA` |
| required actions | snapshots plus interrupt-aware `RUN_FINISHED` |
| successful AgentTurn | `RUN_FINISHED` with success outcome |
| failed AgentTurn | `RUN_ERROR` |

Rules:

- Every AG-UI run has exactly one start and one terminal event.
- Explicit start/content/end events are preferred over shorthand chunks for concurrent streams.
- Stream correlation keys include logical thread, run, message/tool call and application activity IDs.
- Partial raw tool arguments stay server-side until the adapter can validate and safely project them.
- `RUN_FINISHED` is a wire-run terminal, never sufficient evidence that the application RunStep completed.
- Unexpected child-thread events become inert unsupported activity in P0; P1-209 owns any namespaced/native mapping.
- The adapter parses its own output using the pinned official AG-UI schemas before persistence.

Exact event, state, replay and version rules are normative in `contracts/ag-ui.md`.

The required Hono path is the pure AG-UI adapter endpoint consumed by `@ag-ui/client` and application-owned React renderers. A CopilotKit v2 runtime gateway may also mount only if P0-210 proves a coherent single-line graph; otherwise the route is absent and no P0 behavior depends on it. If enabled, it registers eligible adapters as server-owned `AbstractAgent`s, derives lookup from authenticated channel membership, accepts no browser-supplied remote endpoint and preserves the same validated pure AG-UI stream.

## Event normalization

Persist only allowlisted transport metadata and normalized application payloads. Strip reasoning content, provider signatures, credentials, opaque headers and arbitrary raw tool bodies.

Important mapping:

| TrueForge condition | Application and AG-UI behavior |
| --- | --- |
| turn created | Persist AgentTurn and emit `RUN_STARTED` |
| model message/delta | Emit safe AG-UI text stream |
| unexpected child thread event | Emit inert unsupported activity; do not grant/execute/persist child work in P0 |
| component tool call | Validate and stream controlled UI invocation |
| backend tool proposal | Emit safe tool lifecycle/card |
| backend tool response | Adapter-normalized `TOOL_CALL_RESULT` and safe receipt |
| sandbox created/command/file | Typed sandbox and artifact activities |
| approval required | RequiredAction, ActionProposal and AG-UI interrupt |
| tool response required | RequiredAction, Question and AG-UI interrupt |
| native MCP auth required | Connection action for native flow only |
| turn done with required actions | Close AgentTurn, create PauseGroup, keep RunStep awaiting |
| turn done without required actions | Terminalize or continue RunStep normally |

Never trigger synthesis from the event name alone. Inspect the complete `state.requiredActions` collection.

## Component tool bridge

Frontend components are application-owned tools, not Composio tools. The bridge must prove one supported TrueForge mechanism during P0-210; until then dependent component execution tasks remain blocked.

Preferred P0 mechanism: a private, service-authenticated application MCP connector named `ui_components_v1` exposes only exact literal controlled-component render tools. It does not expose `generate_open_ui`. A render call has no provider authority; it validates/persists a UIInstance and returns a small safe acknowledgement to TrueForge. The connector is inaccessible to browsers and not routed through Composio. If the spike selects another mechanism, ADR-006 must be amended with equivalent detached-run, grant, replay and security evidence.

1. Deployment registers installed renderer names/versions; a browser announcement is a compatibility hint and grants nothing.
2. Server intersects deployed renderers with published registry versions and positive workspace/channel/coworker grants.
3. The bridge offers only those exact component descriptors to the TrueForge agent.
4. A model component call is captured before any browser handler and rechecked against the current registry/grants.
5. Complete arguments validate server-side and create one immutable UIInstance revision.
6. The application broker emits tool and typed activity events and returns a safe tool result so noninteractive/detached work can continue; the browser later revalidates against its local renderer schema.
7. An explicitly interactive component creates an application-owned `UIComponentInterrupt` before the tool returns its safe `awaiting_component_input` acknowledgement. This is not a TrueForge RequiredAction/PauseGroup.
8. Authorized browser input CAS-resolves that exact interrupt and atomically enqueues one `component_interaction_response` item for the same RunStep/logical thread/session generation. The worker starts a structured continuation turn (and therefore a new AG-UI wire run) without calling `RunAgentInput.resume` or writing PauseGroup rows.

A forged `RunAgentInput.tools` entry, stale offered-tool snapshot or model-authored component name grants nothing. Keep React registration order stable and change component `available` state rather than conditionally mounting hooks. No P0 run may require an ephemeral browser-only tool handler to preserve or finish ordinary component output.

Controlled component data functions are fixed server functions with their own positive grants, row/byte/time limits and redaction. A renderer receives the function result only after channel authorization and UIInstance/version verification.

## P1 progressive open-generated UI

This section is a retained P1 contract. P0 returns a typed `unsupported_rail` fallback for `iframe_v1` and implements none of the producer, storage, origin, capability, verifier or bridge behavior below.

The fixed `generate_open_ui` capability privately assembles a declarative document and produces source-free ForgeRoom `open-generative-ui` activities. Its raw arguments are suppressed from generic `TOOL_CALL_ARGS`; browser carriage is limited to the exact closed setup/revision/progress/status/text/final-profile snapshot and revision-tested delta schemas in `contracts/events.md`. It never registers arbitrary npm/browser code or a new external tool.

Ordered lifecycle:

1. A source-free browser `ACTIVITY_SNAPSHOT` creates `{ schemaVersion: 1, surfaceId, candidateRenderRevision, baseRenderRevision, activityRevision: 0, initialHeight, placeholderMessages, phase, receivedBytes, generating: true, status: "building", textAlternative, textAlternativeHash }`; bounded/scanned text alternative fields are immutable for the candidate.
2. Private producer ingress completes CSS, then HTML.
3. Private producer ingress completes the closed declarative behavior/interaction manifest.
4. Final validation stores source, state/data/binding manifests, retained data/args, renderer/bootstrap/sanitizer/CSP/header versions and hashes.
5. Immutable not-yet-current blobs publish.
6. A service-authenticated trusted headless verifier loads the exact staged response and persists hash-bound accessibility/smoke evidence.
7. One transaction commits the complete revision, current/last-good pointers, final source-free reference and channel event.
8. A complete source-free snapshot precedes the exact allowlisted browser deltas; the final atomic profile addition and status update set `generating: false`, after which the associated wire run may finish without a browser READY.

Private producer fragments assemble in order and reject nonempty `jsFunctions`, `jsExpressions`, scripts, event handlers or external-resource fields. Source-free browser activity uses the exact snapshot and delta allowlist in `contracts/events.md`, including the prior revision test and final increment. If TrueForge/provider streaming cannot preserve source order, keep the trusted skeleton visible and emit one complete source-free replacement snapshot only after validation; partial source never renders or enters browser/channel JSON.

The complete revision is served from a dedicated cookieless origin, never srcdoc/application origin, and runs at an opaque origin with only a hash-pinned fixed bootstrap. Mount uses `BOOT -> INIT -> READY`, which gates local activation only. The bootstrap handles bounded declarative behavior, resize and typed intents; the trusted parent attaches a separate server-issued one-use interaction token or shows the token-free trusted-confirmation preparation. The document cannot call TrueForge, Composio or approval endpoints, and generic UI interactions cannot create an ActionProposal.

## Stop and correction

- Stop enters `cancelling`, blocks new turns and calls TrueForge cancellation once.
- An MCP request already executing may still complete; render its final or unknown outcome honestly.
- A correction is a new visible queued continuation linked to the stopped step.
- P0 has no arbitrary freeze-and-resume for an in-progress model call.

## Atomic PauseGroup resume

On `turn.done` with required actions:

1. Upsert one PauseGroup for the completed turn.
2. Capture every approval, question and supported connection action from the persistent-coworker turn exactly once; P1-209 must extend this invariant before enabling child threads.
3. Close the AgentTurn as `required_actions`; retain RunStep awaiting counters.
4. Collect decisions and encrypted pending answers independently.
5. When every item resolves, compare-and-swap PauseGroup `collecting → resuming` and insert one PauseResume intent in the same transaction.
6. Create one response-only turn containing the complete approval and tool-response set; include no normal message.
7. Record resume turn ID and mark group resumed.
8. If the create response is lost, mark intent uncertain and reconcile from TrueForge history using its run token and response hash. Never blindly retry.

Before interrupt terminal, emit the latest safe message/state/activity snapshots. The adapter represents each RequiredAction as one AG-UI interrupt and constructs one complete `resume` array only after the authenticated application PauseGroup is atomically ready. Partial browser resumes and edited tool arguments are rejected in P0.

Composio downstream OAuth errors through header-auth MCP are not assumed to emit TrueForge native auth events. Preflight Composio status and map downstream auth failures to application `blocked_connection`.

## P1 native subagents

P0 compiles native subagents off and rejects/masks unexpected child-thread activity safely. P1-209 enables the following behavior only after its mapping and security suite passes.

- Enabled or disabled per SessionRevision.
- Inherit root coworker MCP tools and sandbox/filesystem.
- Cannot ask the user directly or create nested native subagents.
- Every inherited mutation remains approval-gated.
- UI attribution uses TrueForge thread lineage, not model-authored identity text.
- Hard capability boundaries require separate persistent coworker sessions.
- Native-subagent count, token, cost and tool-call limits are best-effort watchdogs; do not claim hard enforcement unavailable in TrueForge.

## Composio session

P0 uses:

- One stable workspace service-user ID.
- One or two connected applications.
- Two to four exact direct tools.
- Direct-tools preset and hosted MCP.
- `connectedAccounts: { toolkitSlug: [connectedAccountId] }` for every toolkit.
- Multi-account mode off.
- Composio sandbox off.
- Meta-execute, remote workbench, remote bash and dynamic write search absent.

The hosted MCP URL and headers remain server-side and are registered as a header-auth TrueForge connector.

## Startup verification

1. Load checked-in manifest and ToolPolicyDefinitions.
2. Query TrueForge connector tools.
3. Compare exact tool names, input schemas and relevant annotations to observed descriptor hashes.
4. Independently verify compiled AgentSpec connector, literal enabled tools, literal approval tools and approval-policy hash.
5. Query Composio status for each exact pinned account.
6. Fail closed on missing, added, changed, expired or unapproved surfaces.

Connector tool-list verification does not prove approval configuration; both checks are mandatory.

## ToolPolicyDefinition

Every P0 tool has reviewed server code defining:

~~~ts
type ToolPolicyDefinition = {
  toolName: string;
  observedDescriptorHash: string;
  riskClass: "read" | "write" | "destructive" | "blocked";
  extractTarget(args: unknown): SafeTargetSummary;
  redactArguments(args: unknown): RedactedArguments;
  renderPreview(args: unknown): ApprovalPreview;
  idempotency: "verified" | "not-idempotent" | "unknown";
  reconcile?(proposal: ActionProposal): ReconciliationQuery;
  verifyReceipt?(result: unknown): VerifiedProviderReceipt | null;
};
~~~

Unknown writes are unavailable. An observed descriptor change makes the manifest fail closed. An unchanged schema is not proof that provider behavior did not drift.

The demo write is a deterministic field/state update with verified read reconciliation. Email or message creation cannot be used to claim exactly-once semantics.

## Sandbox and artifact handoff

- P0 sandbox receives only synthetic or explicitly public input unless network egress is externally restricted.
- Sandbox-enabled coworker has no sensitive external-read tools.
- Application and Composio credentials are never injected into Daytona.
- Validate artifact path, size and declared file before download.
- Download through the TrueForge sandbox-file endpoint.
- Hash, MIME-check and copy to application-controlled storage.
- Create immutable artifact revision linked to channel, Run, RunStep, turn, sandbox and creator.
- A generated chart raster or image must complete this publication path (or an equivalent reviewed image-tool adapter) before `ImageCard`/`ImageGallery` receives its artifact ID and revision; AG-UI never carries an arbitrary remote image URL or unbounded binary body.
- Other sessions receive only an authenticated read-only application artifact reference or bounded attachment.
- Never assume separate TrueForge sessions share sandbox files.
