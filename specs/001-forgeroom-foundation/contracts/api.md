# Application API contract

| Field | Value |
| --- | --- |
| Status | Canonical P0 HTTP contract |
| Transport | JSON commands/queries, standard AG-UI run SSE and resumable multiplexed channel SSE |
| Authentication | Server session cookie plus CSRF and Origin checks for mutations |

Exact response fields are defined as shared Zod schemas in `packages/contracts`. Browser code imports those contracts instead of redefining them.

## Conventions

- IDs are opaque strings.
- Timestamps are ISO 8601 UTC.
- Commands accept `Idempotency-Key` where application-level deduplication is meaningful.
- Every response includes `request_id`.
- Workspace and channel authorization is derived server-side.
- Provider credentials and raw provider payloads never appear.

Error envelope:

~~~json
{
  "error": {
    "code": "stale_proposal",
    "message": "This action changed and must be reviewed again.",
    "request_id": "req_...",
    "retryable": false,
    "details": {}
  }
}
~~~

Stable P0 error codes:

~~~text
unauthenticated
forbidden
csrf_failed
not_found
validation_failed
conflict
recipient_required
recipient_unavailable
session_rotating
connector_blocked
descriptor_drift
stale_proposal
expired_proposal
decision_already_recorded
run_not_stoppable
unknown_external_outcome
provider_unavailable
agui_version_mismatch
invalid_state_patch
component_not_granted
component_version_mismatch
component_schema_invalid
ui_instance_stale
ui_interaction_not_allowed
unsupported_ui_rail
stale_coworker_draft
coworker_provisioning_failed
stale_task_revision
task_transition_not_allowed
skill_requirements_missing
~~~

## Authentication

~~~text
POST /api/auth/login
POST /api/auth/logout
GET  /api/session
~~~

Login request:

~~~json
{ "email": "owner@example.test", "password": "..." }
~~~

Session response exposes safe user identity, workspace membership, CSRF token and expiry. Logout revokes the server-side session.

## Channels and events

~~~text
POST   /api/workspaces/:workspaceId/channels
GET    /api/workspaces/:workspaceId/channels
GET    /api/channels/:channelId
GET    /api/channels/:channelId/roster
PATCH  /api/channels/:channelId
POST   /api/channels/:channelId/archive

POST   /api/channels/:channelId/participants
DELETE /api/channels/:channelId/participants/:participantId

POST   /api/channels/:channelId/messages
POST   /api/channels/:channelId/pins
DELETE /api/channels/:channelId/pins/:pinId

GET    /api/channels/:channelId/events?afterSequence=
GET    /api/channels/:channelId/stream
~~~

The events query and stream return `AgentChannelEnvelope` objects whose payload is a schema-valid AG-UI event. SSE `id` is the channel sequence.

Message command:

~~~json
{
  "body": "@analyst inspect the fixture and @builder produce the report",
  "recipient_handles": ["analyst", "builder"],
  "routing_mode": "direct",
  "parent_message_id": null
}
~~~

The server reparses and validates recipients. It does not trust the client-supplied handles or routing mode alone.

## AG-UI agent endpoints

~~~text
POST /api/copilotkit   # optional; disabled unless P0-210 proves a coherent CopilotKit graph
POST /api/ag-ui/channels/:channelId/coworkers/:coworkerId/runs
GET  /api/ag-ui/channels/:channelId/coworkers/:coworkerId/capabilities
~~~

The pure AG-UI endpoint is the required P0 browser path. `/api/copilotkit` is an optional authenticated compatibility gateway only when P0-210 proves a coherent single-line CopilotKit graph; otherwise the route is absent/404 and the app uses `@ag-ui/client` plus application-owned React renderers. If enabled, it registers application-owned `TrueForgeAGUIAdapter` agents only, sends credentials through the application session cookie plus CSRF header, and never exposes model/TrueForge/Composio keys.

The run route accepts standard `RunAgentInput` and returns unwrapped AG-UI SSE so an official client can consume it. `threadId` must equal the server-issued logical channel-coworker thread ID. `runId` identifies one AgentTurn attempt; the server maps it to application Run/RunStep IDs and the durable channel envelope remains attribution authority. Events may duplicate that mapping in the optional closed `metadata.forgeroom` extension.

For a direct single-coworker turn, the endpoint still persists the channel Message, Run and RunStep before dispatch. Multi-recipient messages use the channel message command, which creates one internal AG-UI run input per resolved coworker.

Server handling of `RunAgentInput`:

- rebuilds authoritative messages/context rather than trusting supplied history;
- treats `tools` as renderer capability advertisements only;
- ignores security-sensitive client state fields;
- intersects component tools with positive server grants;
- accepts `resume` only for complete authorized PauseGroups; and
- rejects mixed AG-UI package/profile versions.

Capabilities declare only proven stable behavior. P0 reports reasoning and approve-with-edits as unsupported. Native subagent protocol support remains false while using the stable activity fallback.

## Coworkers

~~~text
GET   /api/workspaces/:workspaceId/coworkers
GET   /api/coworkers/:coworkerId
PATCH /api/coworkers/:coworkerId
POST  /api/coworkers/:coworkerId/disable

POST /api/workspaces/:workspaceId/coworker-drafts
GET  /api/coworker-drafts/:draftId
POST /api/coworker-drafts/:draftId/revise
POST /api/coworker-drafts/:draftId/confirm
POST /api/coworker-drafts/:draftId/reject
~~~

The draft service uses a no-external-tools structured builder, then resolves every model/tool/skill/component/account/channel identifier, supported TaskRecord capability and budget server-side. Knowledge, memory, workflow and native-subagent requests are retained only as explicitly unsupported/denied P0 requests. Confirm binds exact `draft_revision`, `draft_hash`, `policy_revision`, `catalog_revision` and expiry plus an idempotency key. The request cannot submit effective grants. Stale resolution returns `stale_coworker_draft` with a new safe permission diff and creates nothing.

P0 update body:

~~~json
{
  "name": "Analyst",
  "handle": "analyst",
  "title": "Evidence analyst",
  "standing_instructions": "Verify sources and return bounded findings.",
  "model_preset": "default",
  "native_subagents_enabled": false,
  "channel_ids": ["channel_..."],
  "budget": { "max_turn_tokens": 12000, "max_tool_calls": 20 },
  "task_record_grants": [{ "channel_id": "channel_...", "operations": ["create", "update_status"] }],
  "tool_grants": ["PROVIDER_READ_TOOL"],
  "skill_version_ids": ["skillv_..."],
  "component_version_ids": ["componentv_table", "componentv_chart"]
}
~~~

A capability-affecting update returns the affected channel session rotations and stale proposal IDs.

## Runs

~~~text
GET  /api/runs/:runId
POST /api/runs/:runId/cancel
POST /api/runs/:runId/steer
POST /api/run-steps/:stepId/cancel
GET  /api/runs/:runId/receipt
~~~

P0 has no endpoint claiming to freeze and resume an active TrueForge model call. `steer` creates a visible continuation after stop or completion.

Run response includes base lifecycle and derived counters:

~~~json
{
  "id": "run_...",
  "lifecycle": "active",
  "activity": {
    "planning": 0,
    "running": 1,
    "awaiting_input": 0,
    "awaiting_approval": 1,
    "blocked_connection": 0,
    "cancelling": 0,
    "queued": 0
  },
  "steps": []
}
~~~

## Tasks

~~~text
POST  /api/channels/:channelId/tasks
GET   /api/channels/:channelId/tasks
GET   /api/tasks/:taskId
PATCH /api/tasks/:taskId
GET   /api/tasks/:taskId/history
~~~

Task create/update accepts closed `TaskRecordV1` fields, an idempotency key and `expected_revision` for updates. The server resolves actor/channel/coworker grants, validates allowed fields/status transition/assignee/source references, and atomically appends TaskRevision, audit and channel event. P0 exposes no agent or browser delete endpoint.

## Skills

~~~text
POST /api/runs/:runId/skill-drafts
GET  /api/skill-drafts/:draftId
POST /api/skill-drafts/:draftId/revise
POST /api/skill-drafts/:draftId/publish
GET  /api/workspaces/:workspaceId/skills
GET  /api/skills/:skillId
POST /api/coworkers/:coworkerId/skill-bindings
DELETE /api/coworkers/:coworkerId/skill-bindings/:bindingId
~~~

P0 accepts completed application Runs only and publishes private instruction-only version 1. Publish binds draft/source content hashes; attach compares every required tool/component/data/approval against existing effective authority and rotates affected sessions. The API never accepts credentials, executable package content, raw tool bodies or client-supplied grant expansion.

## Approvals and questions

~~~text
POST /api/approvals/:proposalId/decision
POST /api/questions/:questionId/answer
~~~

Approval request:

~~~json
{
  "decision": "allow",
  "expected_arguments_hash": "sha256:...",
  "expected_descriptor_hash": "sha256:...",
  "expected_session_generation": 3,
  "reason": "Reviewed target and deterministic update"
}
~~~

Decision processing:

1. Authenticate, verify Origin/CSRF and require current owner/approver role.
2. Revalidate channel access, proposal state, expiry, account, generation, policy, descriptor and argument hashes.
3. Atomically record one decision.
4. Return the updated PauseGroup readiness.
5. Do not call TrueForge from the request handler.

Question answers never accept or display credentials and are encrypted until consumed by the response-only resume.

## Connections

~~~text
GET  /api/workspaces/:workspaceId/connections
GET  /api/connections/:connectionId/status
POST /api/connections/:connectionId/test
POST /api/connections/:connectionId/reconnect
GET  /api/connections/:connectionId/reconnect/status
~~~

P0 returns one fixed service identity, scopes, toolkit state, exact tool names, descriptor hashes and last verification. It exposes no account picker or general catalog endpoint.

Reconnect returns a short-lived Composio Connect Link bound to the authenticated workspace session. Callback completion must revalidate that binding.

## Artifacts

~~~text
GET /api/artifacts/:artifactId
GET /api/artifacts/:artifactId/download
GET /api/artifacts/:artifactId/preview
~~~

All artifact queries verify channel membership. Downloads use safe filenames and correct content-disposition. Preview returns a constrained representation, never arbitrary active content.

## Components and UI instances

~~~text
GET   /api/ui-instances/:instanceId
POST  /api/ui-instances/:instanceId/interaction-tokens
POST  /api/ui-instances/:instanceId/interactions
POST  /api/ui-instances/:instanceId/data/:functionName
~~~

P0 has no component catalogue route. The fixed deployed component versions and exact positive grants appear inside trusted coworker draft/editor previews. P1 adds the browse/preview/grant catalogue.

Grant command:

~~~json
{
  "granted": true,
  "expected_component_version": "1.0.0",
  "expected_descriptor_hash": "sha256:..."
}
~~~

Changing a component descriptor/grant rotates affected TrueForge session revisions when their offered tool list changes. Every invocation is still rechecked at call time.

Trusted-host interaction token request:

~~~json
{
  "schemaVersion": 1,
  "surfaceId": "ui_123",
  "renderNodeId": "node_7",
  "renderRevision": 2,
  "expectedStateRevision": 14,
  "actionGrantId": "uag_123",
  "actionRef": "select_node",
  "input": { "nodeId": "node_7" },
  "clientKind": "registry"
}
~~~

The server authenticates and authorizes channel access, verifies the exact controlled instance/render/component/render-node/ActionGrant/input hash, and stores the redacted input. P0 returns a short-lived one-use `{ interactionId, state: "token_issued", interactionToken, expiresAt }`; trusted registry code posts only that ID/token pair to `/interactions`. Model-authored content never sees or chooses the token or idempotency scope. Commit atomically consumes the token and ActionGrant use count; retries return the first recorded result.

A P0 UI interaction may update bounded local/shared presentation state, re-read only the exact retained DataGrant named by a `server_read` grant, or resolve one exact durable component-input interrupt. It cannot open or decide a RequiredAction, create/decide an ActionProposal, answer a canonical Question, resume a PauseGroup, enqueue an unrelated agent turn, or directly invoke Composio/TrueForge. Component-input resolution enqueues its own structured application continuation and is not a PauseGroup resume. Free text uses the trusted composer or canonical RequiredQuestion flow.

Data-function requests are read-only, component-version-scoped and bounded by function-specific argument, row, byte and time limits. Component render grants do not imply data-function grants.

`GET /api/ui-instances/:instanceId` returns the safe deterministic controlled replay projection: exact component/version/descriptor/renderer identity, validated render/state revisions, text alternative, safe grant disclosures, source/data references and hashes. A building instance before its first commit has null `renderRevision`/`stateRevision`; first revision base is null, later bases equal the current pointer.

P0 has no interaction-confirmation, `/render-capabilities`, or generated-origin route. The `request_agent_turn`, `open_existing_hitl`, trusted-confirmation, and `iframe_v1` modes return typed unsupported results. Their retained P1 API/security contract is implemented only by P1-317/P1-506.

## Internal worker commands

Internal commands are not browser-accessible:

~~~text
claim queue item
provision or rotate session
create or reconcile turn
ingest TrueForge event
validate and persist AG-UI event envelope
offer and recheck component tool
finalize or quarantine UIInstance
apply scoped UI interaction
claim PauseGroup resume
publish sandbox artifact
reconcile deterministic provider update
~~~

Each command is idempotent at the application state-transition level and validates expected generation/state before mutation.
