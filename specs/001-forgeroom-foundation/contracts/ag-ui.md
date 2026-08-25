# AG-UI interoperability contract

| Field | Value |
| --- | --- |
| Status | Canonical P0 agent-to-frontend contract |
| Protocol role | Northbound runtime protocol between ForgeRoom and the browser |
| Agent harness | TrueForge remains the execution harness behind an application adapter |
| Stable baseline | Exact pure `@ag-ui/*` versions are frozen by P0-000/P0-210; CopilotKit is optional and separately gated |

## Protocol boundary

AG-UI is the bidirectional run, message, tool, state, activity and interrupt transport. It is not itself a generative-UI schema. P0 carries registered controlled-component calls only; the retained open-generated activity schema is P1 and is not advertised or accepted by P0.

The browser never connects to TrueForge directly. A `TrueForgeAGUIAdapter`:

1. accepts authenticated AG-UI `RunAgentInput`;
2. validates channel, recipients and client capabilities;
3. persists the human message and application Run before remote execution;
4. dispatches one or more TrueForge-backed RunSteps;
5. translates allowlisted TrueForge events into AG-UI events;
6. mirrors emitted events into the durable channel log; and
7. translates trusted component results into application-owned continuation commands and canonical RequiredAction resumes into the separate PauseGroup service before TrueForge receives either.

TrueForge owns model execution, sessions, turns, MCP and Daytona. P0 compiles native child threads off. AG-UI owns the browser-facing interaction contract. The application database remains authoritative for channels, Tasks, skills, permissions, Run state, component grants, UI instances, approvals and replay.

The required P0 browser path uses the official `@ag-ui/client` against the authenticated pure AG-UI endpoint and application-owned reducers/renderers. It does not require `@copilotkit/runtime`. A CopilotKit v2 gateway at `/api/copilotkit` is an optional feature flag only if P0-210 finds a genuinely compatible single-line transitive graph and proves CSRF, stream and component parity. If enabled, `CopilotKitProvider` uses a relative URL with `credentials: "include"` plus a trusted fetch/header adapter carrying the current session-bound `X-CSRF-Token`; no public/provider key reaches the browser. CopilotKit remains optional frontend/runtime plumbing, never the execution harness.

## Version profile

P0 must pin one tested, single-resolution graph for every package on the selected runtime path; no caret ranges are allowed for `@ag-ui/core`, `@ag-ui/client`, or any enabled CopilotKit runtime/React package. Forced overrides that make code execute against an untested AG-UI version are prohibited.

Registry inspection provides one viable required baseline and optional gateway probes as of the specification date:

| Candidate | Packages | Gate |
| --- | --- | --- |
| Required pure AG-UI baseline | Exact `@ag-ui/core@0.0.57` + `@ag-ui/client@0.0.57`, application Hono/SSE endpoint and application-owned React reducers/renderers; no `@copilotkit/runtime` in the server graph | Selectable after official-client interrupt/activity/state/tool fixtures, CSRF and lockfile checks pass; this is the guaranteed P0 fallback |
| Known split negative control | `@copilotkit/runtime@1.69.0` directly requests AG-UI `0.0.57`, while its `@ag-ui/mcp-middleware@0.0.1` dependency requests `@ag-ui/client@0.0.54` | Reproduce and reject this transitive split for the gateway path; do not block the pure AG-UI baseline |
| Optional single-line CopilotKit target | A future/published CopilotKit runtime graph whose full transitive closure resolves exactly the selected stable AG-UI line | Enable `/api/copilotkit` only after lockfile closure plus official-client, provider, interrupt, activity, state and component parity fixtures pass without overrides or unreachable-branch assumptions |

P0-210 records the selected pure baseline and any separately enabled optional gateway graph. Duplicate AG-UI copies are prohibited within an executable boundary; the known split CopilotKit runtime is absent/disabled, not rationalized as unreachable. It must reject schema identity mismatches, canary packages, forced overrides, dependency exclusions that leave an untested path, and a package set that lacks interrupt-aware `RUN_FINISHED`, activities, shared state, and tool events. Direct package presence is not a substitute for the interoperability fixture. Native `SUBAGENT_*` events and `subagentRunId` attribution are not assumed; the spike verifies the exact selected stable line. Therefore:

- P0 uses standard AG-UI interrupts for application PauseGroups and rejects/safely diagnoses unexpected child-thread events because native subagents are disabled.
- P1-209 may enable namespaced/native subagent events only after the exact pinned package set and lineage/security fixtures pass.
- The adapter accepts unknown future events only through an explicit compatibility layer; it never forwards them blindly.
- `RAW`, reasoning and deprecated thinking events are dropped before application persistence and browser delivery.

This gate avoids both an unpinned canary and a superficially newer but split dependency graph while preserving a direct migration path.

## Endpoint and transport

### Run endpoint

~~~text
POST /api/ag-ui/channels/:channelId/coworkers/:coworkerId/runs
Content-Type: application/json
Accept: text/event-stream
Origin: <exact application origin>
X-CSRF-Token: <current session-bound token>
Body: RunAgentInput
Response: AG-UI SSE event stream
~~~

### Optional CopilotKit runtime gateway

~~~text
POST /api/copilotkit
Cookie: authenticated application session
Origin: <exact application origin>
X-CSRF-Token: <current session-bound token>
~~~

The required pure POST—and the optional gateway when enabled—reject a missing/unexpected Origin or missing/stale/forged CSRF token before persisting a human message, Run or remote turn. Official AG-UI clients using the browser's application session receive the token from the trusted app bootstrap (or authenticated CSRF endpoint) and attach the same header; cookie-only mutation is invalid. An enabled gateway resolves server-registered logical coworker agents, attaches the stable frontend component registry and delegates execution to `TrueForgeAGUIAdapter`. Runtime agent IDs are server-derived from channel/coworker membership; the browser cannot register an endpoint or redirect a coworker to another agent. The same authorization, grant, event validation and persistence rules apply to either enabled route.

Required input mapping:

| AG-UI field | ForgeRoom meaning |
| --- | --- |
| `threadId` | Stable logical `(channel, coworker)` thread ID; independent of TrueForge session rotation |
| `runId` | One AG-UI/AgentTurn attempt; the application Run and RunStep remain explicit metadata |
| `messages` | New user message plus bounded visible history; server rebuilds authoritative context |
| `tools` | Browser component capabilities only; never authorization |
| `state` | Optimistic UI state only; never grants, approvals or account state |
| `context` | Hints only; server builds the canonical channel context envelope |
| `forwardedProps` | Versioned recipient/routing intent and client state revision |
| `resume` | Accepted only for recognized application-owned interrupt/PauseGroup IDs after authorization |

The normal multi-recipient entry point remains `POST /api/channels/:channelId/messages`. It atomically persists the human message and application Run, then creates one AG-UI run input for each eligible coworker thread. The pure per-coworker endpoint exists for standard AG-UI interoperability, optional CopilotKit parity, and direct single-coworker turns; it cannot bypass application routing or persistence.

`forwardedProps.forgeroomV1` contains the application Run/RunStep IDs, `clientStateRevision` and supported UI renderer versions. Recipient selection is resolved before the per-coworker request. The server still recomputes all effective capabilities.

### Durable channel stream

~~~text
GET /api/channels/:channelId/stream
Last-Event-ID: <channel sequence>
~~~

This application extension multiplexes the normalized AG-UI streams outside the lifetime of one run request:

~~~ts
type AgentChannelEnvelope = {
  schemaVersion: 1;
  channelId: string;
  channelSequence: number;
  applicationRunId?: string;
  runStepId?: string;
  agentTurnId?: string;
  actorKind: "human" | "coworker" | "native_subagent" | "system"; // native_subagent reserved P1
  coworkerId?: string;
  logicalThreadId?: string;
  nativeSubagentId?: string;
  sourceMessageId?: string;
  aguiEvent: AGUIEvent;
};
~~~

SSE `id` is the channel sequence. Correlation fields on this envelope, not free-form event metadata, are authoritative; coworker events require coworker/thread/run/step/turn IDs. Native-child fields are reserved for P1. Reconnect replays persisted envelopes, may include `MESSAGES_SNAPSHOT` and `STATE_SNAPSHOT`, then switches to live delivery. Delivery is at least once; clients deduplicate using `(channelId, channelSequence)` and reduce each agent stream by `logicalThreadId`.

One channel-owned human message carries `sourceMessageId` and renders once. Fan-out RunAgentInputs reference it without replaying duplicate human message events in every coworker lane.

The standard per-coworker run endpoint proves AG-UI interoperability. The durable multiplexed stream supplies the merged channel timeline, concurrent background work and refresh recovery that outlive one HTTP request.

## Required event profile

P0 produces and consumes the following stable AG-UI event families:

| Family | Required use |
| --- | --- |
| `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` | AG-UI transport-run lifecycle |
| `STEP_STARTED`, `STEP_FINISHED` | bounded adapter/model steps when available |
| `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` | streamed human-safe coworker output |
| `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT` | controlled-component/backend tools and trusted frontend-tool results; `generate_open_ui` is absent in P0 |
| `MESSAGES_SNAPSHOT` | canonical visible history after initial load or divergence |
| `STATE_SNAPSHOT`, `STATE_DELTA` | single system-lane `ChannelUIStateV1` or schema-discriminated per-coworker `ThreadUIStateV1`; delta is RFC 6902 JSON Patch |
| `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA` | coworker work, Tasks, sandbox, artifacts, pause/connection/audit and controlled UI |
| `CUSTOM` | rare namespaced control signal with a registered schema only |

P0 does not send `RAW`, `REASONING_*`, `THINKING_*` or provider-private content to the browser. Unknown event types fail closed in the adapter and produce a safe diagnostic.

## Optional ForgeRoom metadata extension

The durable `AgentChannelEnvelope` is the sole required attribution and correlation authority. A nested AG-UI event MAY duplicate that information for diagnostics or clients that preserve passthrough fields using this closed extension:

~~~ts
type ForgeRoomMetadataV1 = {
  schemaVersion: 1;
  channelId: string;
  channelSequence: number;
  applicationRunId?: string;
  runStepId?: string;
  agentTurnId?: string;
  coworkerId?: string;
  actorKind: "human" | "coworker" | "native_subagent" | "system"; // native_subagent reserved P1
  nativeSubagentId?: string;
  parentCoworkerId?: string;
  logicalThreadId?: string;
  aguiRunId?: string;
};
~~~

When present, it is stored at `event.metadata.forgeroom`, must equal the enclosing envelope and is included in that event's canonical hash. It is not required on every upstream AG-UI event, and consumers never derive authorization or ownership from it. Raw TrueForge/provider IDs are server-only.

Persistent coworkers are application-owned top-level AG-UI threads. They are never mislabeled as AG-UI native subagents. P0 disables TrueForge temporary child threads; P1-209 owns their namespaced/native mapping.

## Run versus logical-turn semantics

An AG-UI transport run maps to one AgentTurn attempt but is not the same object as an application Run or RunStep. A frontend component call, human interaction or required-action resume may end one AG-UI run and begin another while the same application RunStep continues.

Consequently:

- `RUN_FINISHED` never terminalizes an application RunStep by itself.
- TrueForge `turn.done` with non-empty required actions creates a PauseGroup and remains nonterminal at RunStep level.
- Application lifecycle is projected through `ChannelUIStateV1` and namespaced activities.
- All correlation uses explicit metadata IDs, never event ordering or model prose.

## Shared state

~~~ts
type ChannelUIStateV1 = {
  schemaVersion: 1;
  stateKind: "channel";
  revision: number;
  channel: { id: string; name: string; archived: boolean };
  coworkers: Record<string, {
    availability: string;
    currentAssignment?: string;
    activeRunStepIds: string[];
  }>;
  runs: Record<string, {
    lifecycle: string;
    counters: Record<string, number>;
  }>;
  artifacts: Record<string, { revision: number; mimeType: string; title: string }>;
  tasks: Record<string, { revision: number; status: string; title: string; assigneeId?: string }>;
  uiInstances: Record<string,
    ({
      rail: "registry_v1";
      componentName: string;
      componentVersion: string;
    }) & {
      status: "building" | "ready" | "degraded" | "failed" | "revoked" | "closed";
      renderRevision: number | null;
      stateRevision: number | null;
    }
  >;
  pendingHumanActions: Array<{ id: string; kind: "approval" | "question" | "ui_input" | "component_input" }>;
};

type ThreadUIStateV1 = {
  schemaVersion: 1;
  stateKind: "thread";
  revision: number;
  coworkerId: string;
  logicalThreadId: string;
  phase: "idle" | "queued" | "running" | "interrupted" | "failed" | "finished";
  activeAguiRunId?: string;
  activeRunStepIds: string[];
  surfaceIds: string[];
};
~~~

Rules:

- Server is authoritative.
- `ChannelUIStateV1` has exactly one channel/system authority lane on the durable channel stream: its envelope has `actorKind: "system"` and omits coworkerId/logicalThreadId. Channel-state commits serialize through the canonical channel sequence. A per-coworker reducer MUST NOT emit or overwrite this object.
- A `STATE_SNAPSHOT` replaces the full state.
- A `STATE_DELTA` is an RFC 6902 patch against the immediately preceding revision.
- Each accepted patch increments `revision`; an invalid path or base revision triggers a fresh snapshot.
- Browser proposals become authenticated commands. The browser cannot patch grants, approval decisions, connector state, acting accounts or audit records through shared state.
- Controlled UI receives only a scoped, redacted projection, never the whole state object.

`stateKind` is the required discriminator; a stream cannot change it. Direct per-coworker run streams may carry only the closed `ThreadUIStateV1` above. Its deltas may replace phase/activeAguiRunId and add/remove/replace array entries under activeRunStepIds/surfaceIds, always with an exact revision test/increment. Identity/discriminator paths, channel membership, grants, approvals, connector state and cross-coworker counters are forbidden. Wrong-thread, wrong-base or unsafe paths request a full thread snapshot.

The persistence status is the six-value UIInstance status above. Streaming/validating project to `building`; pre-first-revision building instances have null render/state pointers. A waiting interaction remains `ready` with a pendingHumanActions entry; quarantined projects to `degraded`. Activity-specific progress labels are views, not additional lifecycle states.

## Activity types

All custom activity names are stable, versioned and namespaced:

~~~text
forgeroom.coworker_work.v1
forgeroom.task_record.v1
forgeroom.sandbox.v1
forgeroom.artifact.v1
forgeroom.pause_group.v1
forgeroom.controlled_ui.v1
forgeroom.connection.v1
forgeroom.audit_receipt.v1
~~~

`ACTIVITY_SNAPSHOT.content` is a complete valid object. `ACTIVITY_DELTA.patch` is RFC 6902 and must preserve the registered schema. Invalid patches do not reach a renderer; the client displays a text fallback and requests a snapshot.

## Component tool bridge

The adapter exposes only server-approved UI tool descriptors to TrueForge. The application-owned tool broker, not a browser callback, persists and acknowledges ordinary render calls so detached work can finish. The exact bridge is proven by P0-210 and P0-314:

1. Deployment registers the renderer name/version/schema shipped by the web build; a connected browser may confirm compatibility but cannot create capability.
2. Server intersects deployed renderers with published components, channel grants and coworker grants.
3. The adapter presents stable component tools to the TrueForge session through an application-owned tool bridge.
4. TrueForge tool-call argument deltas become AG-UI `TOOL_CALL_*` and/or typed UI activity deltas.
5. The server validates the complete arguments and creates an immutable UIInstance revision.
6. Browser renders only a locally registered controlled component; absence of a browser does not lose the instance or block noninteractive completion.
7. An interactive call first persists an application-owned `UIComponentInterrupt`; its tool acknowledgement may end the wire run while the application RunStep remains awaiting input.
8. The authenticated interaction endpoint CAS-resolves only that exact interrupt and enqueues one structured same-RunStep continuation on the exact session generation. The continuation starts a new AG-UI wire run; it does not use `RunAgentInput.resume` or the canonical PauseGroup service.

Client-provided `tools` are compatibility advertisements, not grants or the source of the component catalogue. A forged descriptor cannot register a component or make it visible to an agent; absence of a browser does not erase a server-persisted UIInstance.

## Replay and failure behavior

- Persist complete messages, activity snapshots, state snapshots/deltas and UIInstance revisions needed to reproduce the visible channel.
- Token deltas may be compacted after the complete message is stored.
- A partially streamed component remains stored as `building` and may project a streaming activity label during reconnect; the server either resumes ordered deltas or sends its latest valid snapshot.
- If source, schema or renderer version is unavailable, show the stored text alternative and an unsupported-version card.
- Revoking a component blocks new calls. Existing historical instances remain inert and replayable unless the source is quarantined for security.
- A renderer exception is contained by an error boundary and cannot break the timeline or approval UI.

## Conformance acceptance

- Official AG-UI client parses the run stream without a custom fork.
- Golden fixtures cover every required event family and reject illegal orderings, invalid JSON Patch and unknown schemas.
- Refresh restores messages, shared state, component instances and pending human actions without duplicate rendering.
- Two coworker lanes interleave safely through explicit metadata attribution.
- No reasoning, raw TrueForge event, credential or arbitrary tool body appears in an AG-UI fixture.
- Version mismatch produces a clear compatibility failure, never silent UI loss.
- `iframe_v1`, `open-generative-ui`, coordinator-plan and native-subagent activity input are unsupported in P0 and cannot enter persistence/rendering.

## Normative references

- [AG-UI introduction](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/introduction.mdx)
- [Canonical TypeScript event schemas](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/core/src/events.ts)
- [Canonical run input, message and interrupt schemas](https://github.com/ag-ui-protocol/ag-ui/blob/main/sdks/typescript/packages/core/src/types.ts)
- [AG-UI events](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/sdk/js/core/events.mdx)
- [AG-UI shared state](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/state.mdx)
- [AG-UI generative-UI boundary](https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/generative-ui-specs.mdx)
- [Published `@ag-ui/core` package](https://www.npmjs.com/package/@ag-ui/core)
- [`@copilotkit/runtime@1.69.0` package metadata](https://www.npmjs.com/package/@copilotkit/runtime/v/1.69.0)
- [`@ag-ui/mcp-middleware@0.0.1` package metadata](https://www.npmjs.com/package/@ag-ui/mcp-middleware/v/0.0.1)
