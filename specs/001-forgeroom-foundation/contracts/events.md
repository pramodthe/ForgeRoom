# AG-UI channel and runtime event contract

| Field | Value |
| --- | --- |
| Status | Canonical P0 browser event contract |
| Standard transport | Per-coworker AG-UI run SSE |
| Channel transport | Resumable SSE multiplexing AG-UI events |
| Ordering | Monotonic sequence per channel |

## Channel event envelope

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

The nested event must validate against the exact pinned `@ag-ui/core` schema or a separately registered ForgeRoom activity schema. Correlation and actor fields are authoritative on the durable envelope and may be duplicated in `aguiEvent.metadata.forgeroom` for standard-client convenience; untyped metadata is never the sole authority. Coworker-authored envelopes require coworkerId, logicalThreadId, applicationRunId, runStepId and agentTurnId. Native-child fields are reserved for P1 because P0 disables native subagents. The envelope never contains provider credentials, opaque auth headers, raw reasoning, signatures, raw TrueForge identifiers or arbitrary raw tool bodies.

A human composer message is persisted and rendered once as a channel-owned message with `sourceMessageId`; per-coworker fan-out inputs reference that ID but do not emit duplicate human `TEXT_MESSAGE_*` projections. Browser deduplication therefore does not depend on logical-thread coincidence.

## SSE behavior

- SSE `id` is the decimal channel sequence.
- Browser reconnects using `Last-Event-ID`.
- Server replays every persisted event after that sequence, then switches to live delivery.
- Duplicate delivery is expected; browser deduplicates by `(channelId, channelSequence)`.
- Heartbeats carry no product state.
- A gap causes replay, not client-side guessing.

## Required AG-UI event families

~~~text
RUN_STARTED
RUN_FINISHED
RUN_ERROR
STEP_STARTED
STEP_FINISHED
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT
TEXT_MESSAGE_END
TOOL_CALL_START
TOOL_CALL_ARGS
TOOL_CALL_END
TOOL_CALL_RESULT
MESSAGES_SNAPSHOT
STATE_SNAPSHOT
STATE_DELTA
ACTIVITY_SNAPSHOT
ACTIVITY_DELTA
CUSTOM                           # registered namespaced schemas only
~~~

`RAW`, readable `REASONING_*`, deprecated `THINKING_*` and unknown event families are not emitted to the browser.

Explicit text/tool start-content-end sequences are preferred over chunk shorthand. Concurrent reducers key state by logical thread plus message/tool/activity ID; they never rely on arrival adjacency.

## Normalized application source names

The names below remain stable internal/source names for persistence, audit and typed activity content. They are projected into standard AG-UI message, tool, state or activity events; the browser does not branch on an arbitrary top-level `type` string.

### Messaging and membership

~~~text
channel.created
channel.renamed
channel.archived
participant.added
participant.removed
message.created
pin.created
pin.removed
coworker.draft_created
coworker.draft_stale
coworker.created
coworker.provisioning_failed
task.created
task.updated
skill.draft_created
skill.version_published
skill.binding_changed
~~~

### Run and persistent-coworker work

~~~text
run.created
run.routing_resolved
run.state_changed
run.completed
run.partial
run.failed
run.cancel_requested
run.cancelled

step.queued
step.started
step.state_changed
step.correction_queued
step.completed
step.failed
~~~

State events carry base lifecycle plus counters when applicable. Do not emit a misleading single `awaiting_approval` Run state when another child is still running.

### P1 native subagent

The following names are reserved and rejected by P0. P1-209 registers them only after lineage/security conformance.

~~~text
subagent.started
subagent.completed
subagent.failed
~~~

Payload always includes the parent persistent coworker ID, parent AgentTurn ID and an application-issued native-subagent invocation ID. Raw TrueForge thread/session IDs remain server-only. The browser nests the activity beneath the parent lane.

### Tools and connections

~~~text
tool.proposed
tool.started
tool.succeeded
tool.failed
tool.outcome_unknown
connection.blocked
connection.restored
connector.drifted
~~~

Tool payload contains only policy-adapter-approved target, redacted arguments, risk, safe result summary and verified receipt fields.

### Required actions

~~~text
pause_group.created
approval.requested
approval.decided
approval.stale
question.requested
question.answered
pause_group.ready
pause_group.resume_started
pause_group.resumed
pause_group.resume_uncertain
~~~

`approval.decided` means a human decision was persisted; it does not mean an external call ran. `pause_group.resume_started` is emitted only after one CAS-created PauseResume intent exists.

### Sandbox and artifacts

~~~text
sandbox.created
sandbox.command_started
sandbox.command_completed
sandbox.failed
artifact.discovered
artifact.published
artifact.preview_failed
~~~

### Generative UI

~~~text
ui.surface.created
ui.render.snapshot
ui.render.patch
ui.state.snapshot
ui.state.patch
ui.surface.ready
ui.surface.degraded
ui.surface.failed
ui.surface.revoked
ui.interaction.accepted
ui.interaction.rejected
ui.interaction.result
ui.surface.closed
~~~

Component offer/call/refusal remain tool-audit facts projected through `TOOL_CALL_*`; they are not a second UI lifecycle taxonomy. `ui.render.*` and `ui.state.*` payloads carry the canonical controlled surface ID and independent render/state revisions. `ui.iframe.revision_published` is reserved for P1.

### Session lifecycle

~~~text
session.provisioning
session.ready
session.rotating
session.retired
turn.reconnecting
turn.needs_attention
~~~

## TrueForge ingestion rules

- Track provider stream sequence separately from TrueForge event ID.
- Deltas can share their canonical event ID.
- Merge deltas into one normalized application event.
- If a replay returns a merged event without original frame sequences, update the canonical event without inventing old frame IDs.
- Deduplicate canonical events by `(agent_turn_id, trueforge_event_id)`.
- Never terminalize a RunStep until `turn.done.state.requiredActions` is empty.
- Parse every emitted event through the pinned AG-UI schema before persistence and broadcast.
- Buffer raw tool-argument fragments server-side; emit only controlled-component arguments or policy-adapter-approved safe projections. P0 has no `generate_open_ui` descriptor or ingress.
- Represent a required-action turn as interrupt-aware `RUN_FINISHED`, never a successful application terminal.
- Unexpected child-thread or `SUBAGENT_*` events fail safely in P0; P1-209 owns the explicit version gate and mapping.

## Typed activity registry

| `activityType` | Purpose |
| --- | --- |
| `forgeroom.coworker_work.v1` | assignment/lane state |
| `forgeroom.task_record.v1` | authoritative Task creation/update projection |
| `forgeroom.sandbox.v1` | sandbox and command progress |
| `forgeroom.artifact.v1` | discovery, publication and preview |
| `forgeroom.pause_group.v1` | safe approval/question readiness projection |
| `forgeroom.controlled_ui.v1` | typed React component instance |
| `forgeroom.connection.v1` | fixed-account health/block state |
| `forgeroom.audit_receipt.v1` | safe completion receipt |

Every activity has a checked-in Zod schema, `schemaVersion`, immutable `messageId`, `activityRevision` beginning at `0`, a full snapshot and RFC 6902 delta rules. Each delta begins with `test /activityRevision` and ends by replacing it with the next integer. Unknown activity types render an inert fallback.

## P1 open-generated UI activity

This entire section is a retained P1 contract. P0 does not register `open-generative-ui`, persists no GeneratedSourceEventRef, and returns a typed unsupported fallback for such input.

There are two deliberately different forms:

- **Producer ingress:** the private `generate_open_ui` tool stream may carry CSS/HTML/behavior chunks to the server-side assembler. It is authenticated and bounded. The application suppresses it from `AgentChannelEnvelope`, channel JSON, AG-UI, application ingress/body tracing, logs and the host DOM; only a complete validated response reaches the isolated generated-origin iframe. Partial drafts are memory-only when possible; any spill uses per-assembly encrypted, non-backed-up staging with a 15-minute hard TTL. Failure, cancel or timeout destroys the body/key; successful promotion deletes pre-binding staging after publishing the retained immutable final delivery-body blob. Only source-free counts/hashes/reason remain. The raw fields necessarily transit the configured model/TrueForge/MCP path, whose independent retention must be disclosed and verified.
- **Canonical browser activity:** `open-generative-ui` carries only the closed setup/revision/progress/generating/status/text-alternative projection and, when ready, the closed final hash profile defined below. It never carries raw HTML/CSS/behavior source, a storage key, source capability or interaction token. The trusted host obtains an iframe URL separately through the authenticated UIInstance API; the generated origin serves the exact immutable document directly.

Initial snapshot:

~~~json
{
  "type": "ACTIVITY_SNAPSHOT",
  "messageId": "ui_123",
  "activityType": "open-generative-ui",
  "replace": true,
  "content": {
    "schemaVersion": 1,
    "surfaceId": "ui_123",
    "candidateRenderRevision": 1,
    "baseRenderRevision": null,
    "activityRevision": 0,
    "initialHeight": 320,
    "placeholderMessages": ["Building the interactive comparison…"],
    "phase": "assembling_css",
    "receivedBytes": { "css": 0, "html": 0, "behaviorManifest": 0 },
    "generating": true,
    "status": "building",
    "textAlternative": "Interactive comparison of the selected options",
    "textAlternativeHash": "sha256:..."
  }
}
~~~

The snapshot event is closed and always explicitly sets `replace: true`; its content is a closed object with exactly these keys: `schemaVersion`, `surfaceId`, `candidateRenderRevision`, `baseRenderRevision`, `activityRevision`, `initialHeight`, `placeholderMessages`, `phase`, `receivedBytes`, `generating`, `status`, `textAlternative`, `textAlternativeHash`, and optional `finalProfile` (required only when ready). A resync snapshot uses the same shape and current monotonic activityRevision.

The private ingress assembler must progress in this order:

1. `initialHeight`, bounded `placeholderMessages`, scanned `textAlternative` and its hash are fixed before the first snapshot and never patched for that candidate.
2. CSS, then cssComplete.
3. HTML chunks, then htmlComplete.
4. Closed behavior manifest, then behaviorManifestComplete.
5. Source/data/schema/sanitizer/bootstrap/CSP/manifest/renderer validation and hashes.
6. generating=false only after immutable-blob publication, trusted hash-bound headless verification and the one atomic revision/pointers/event commit.

Canonical browser `ACTIVITY_DELTA` uses one exact JSON-Patch allowlist: first `test /activityRevision`; zero or more monotonic replacements under `/phase`, `/receivedBytes/css`, `/receivedBytes/html`, `/receivedBytes/behaviorManifest`, `/generating`, or `/status`; at most one atomic `add /finalProfile` when entering ready; and final `replace /activityRevision` with prior+1. Setup/revision/text-alternative fields and children of finalProfile are immutable. The first snapshot starts at revision 0; every snapshot explicitly sets `replace: true`, and a resync carries the current monotonic revision without resetting it. Missing/wrong bases, delayed pre-resync deltas, forbidden paths, decreasing counts, out-of-order phases, duplicate conflicts, nonempty private `jsFunctions`/`jsExpressions` or schema violations quarantine the candidate and request a source-free replacement snapshot. Partial producer source remains inert and never reaches host DOM/browser activity JSON.

### Generated-source persistence and replay

Each source-free progress transition is persisted as a `GeneratedSourceEventRefV1` in the same transaction that assigns its channel sequence, before broadcast. During assembly, raw drafts may exist only in the access-controlled assembler/source store; a progress reference does not claim that a final immutable source revision exists. After validation, the server publishes the content-addressed final delivery-body/data blobs, the trusted headless verifier checks the exact staged response and records hash-bound evidence, then one transaction commits the final UIInstance render revision, current pointers and completed reference. Every reference stores both the complete safe post-event projection and the exact closed browser event wrapper, but no raw source, blob key, capability URL or interaction token:

~~~ts
type OpenGeneratedUiFinalProfileV1 = {
  sourceSha256: string;
  deliveryBodySha256: string;
  deliveryBodyIndexSha256: string;
  manifestSha256: string;
  renderPayloadSha256: string;
  renderNodeSetSha256: string;
  behaviorManifestSha256: string;
  interactionManifestSha256: string;
  dataBindingManifestSha256: string;
  stateSchemaSha256: string;
  dataSnapshotManifestSha256: string;
  validatedArgsSha256: string;
  argumentSchemaSha256: string;
  rendererVersion: string;
  rendererProfileSha256: string;
  bootstrapVersion: string;
  bootstrapSha256: string;
  sanitizerPolicyVersion: string;
  sanitizerPolicySha256: string;
  cspSha256: string;
  permissionsPolicyProfileVersion: "generated-ui-permissions-v1";
  deliveryHeadersSha256: string;
  verifierProfileVersion: string;
  verificationEvidenceSha256: string;
};

type OpenGeneratedUiActivityProjectionV1 = {
  schemaVersion: 1;
  surfaceId: string;
  candidateRenderRevision: number;
  baseRenderRevision: number | null;
  activityRevision: number;
  initialHeight: number;
  placeholderMessages: string[];
  phase: "assembling_css" | "assembling_html" | "assembling_manifest" |
    "validating" | "ready" | "failed";
  receivedBytes: { css: number; html: number; behaviorManifest: number };
  generating: boolean;
  status: "building" | "validating" | "ready" | "failed" | "degraded";
  textAlternative: string;
  textAlternativeHash: string;
  finalProfile?: OpenGeneratedUiFinalProfileV1;
};

type OpenGeneratedUiPatchV1 =
  | { op: "test"; path: "/activityRevision"; value: number }
  | { op: "replace"; path: "/activityRevision"; value: number }
  | { op: "replace"; path: "/phase"; value:
      "assembling_css" | "assembling_html" | "assembling_manifest" |
      "validating" | "ready" | "failed" }
  | { op: "replace"; path:
      "/receivedBytes/css" | "/receivedBytes/html" |
      "/receivedBytes/behaviorManifest"; value: number }
  | { op: "replace"; path: "/generating"; value: boolean }
  | { op: "replace"; path: "/status"; value:
      "building" | "validating" | "ready" | "failed" | "degraded" }
  | { op: "add"; path: "/finalProfile"; value: OpenGeneratedUiFinalProfileV1 };

type GeneratedSourceBrowserEventV1 =
  | {
      type: "ACTIVITY_SNAPSHOT";
      messageId: string;
      activityType: "open-generative-ui";
      content: OpenGeneratedUiActivityProjectionV1;
      replace: true;
    }
  | {
      type: "ACTIVITY_DELTA";
      messageId: string;
      activityType: "open-generative-ui";
      patch: OpenGeneratedUiPatchV1[];
    };

type GeneratedSourceEventRefV1 = {
  schemaVersion: 1;
  projection: OpenGeneratedUiActivityProjectionV1;
  browserEvent: GeneratedSourceBrowserEventV1;
  sourceRevisionId?: string; // server-only relation; absent from browserEvent
};
~~~

`projection.finalProfile` and `sourceRevisionId` are absent while building and required when `projection.phase/status` is ready; the final profile binds the exact immutable render revision. For a snapshot, `browserEvent.content` equals `projection`. For a delta, applying its exact allowlisted `patch` to the prior persisted projection must produce `projection`; otherwise persistence fails. The wrapper has no optional timestamp/raw-event fields, `messageId` is the immutable activity/surface ID, and every snapshot explicitly includes `replace: true`. Live delivery and replay serialize `browserEvent` directly after validating it against the registered closed schema. An authorized host uses the surface/revision to request a short-lived source-only iframe URL; the generated origin verifies the capability and serves the exact hash-pinned immutable response. Unauthorized clients receive neither URL nor source. This two-form rule preserves deterministic replay without duplicating generated source in channel/AG-UI JSON.

Canonical hashing/serialization uses RFC 8785 JSON Canonicalization Scheme (JCS) encoded as UTF-8. For `generated_source_ref`, `event_hash = sha256(JCS(browserEvent))`; live SSE and replay serialize that exact object. A separate `source_ref_hash = sha256(JCS(full GeneratedSourceEventRefV1))` protects the access-controlled relation. Server-only fields therefore never change browser event identity, and byte-identity claims use one defined codec.

## Event versioning

Every ForgeRoom metadata/activity payload has an integer `schemaVersion`, beginning at `1`. Additive optional fields may remain within a version. Renaming, removing or changing meaning requires a new version and a browser compatibility path. AG-UI fields follow the exact pinned upstream package schema.

## UI contract

The browser renders reduced AG-UI events and registered component/activity schemas only. It must not:

- Branch on raw TrueForge provider event names.
- Infer authorization from event prose.
- Display model-authored identity as actor identity.
- Treat approval decision as execution success.
- Treat cancellation request as proof an in-flight provider call stopped.
- Treat a component name or client-provided tool schema as a grant.
- Render arbitrary HTML in the host DOM.
- Treat any P1 generated iframe as trusted or allow it to submit approvals/call backend/provider tools directly.
