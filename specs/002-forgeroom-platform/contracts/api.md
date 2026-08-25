# Platform API contract

## Conventions

- Prefix stable endpoints with `/api/v1`; public trigger endpoints use `/hooks/v1`.
- Authenticate with the application session/token; actor/workspace IDs in bodies are never trusted.
- JSON commands use closed schemas and `Idempotency-Key` when retryable.
- Mutations of versioned aggregates require `expectedRevision` or an immutable draft/version hash.
- Lists use opaque cursor pagination, deterministic sorting, bounded page size, and authorization before count/results.
- Dates are RFC 3339 UTC instants; schedules also carry IANA timezone/local recurrence fields.
- Responses include `resourceRevision`, safe `permissionRevision` when useful, and stable error codes.

Error shape:

```json
{
  "error": {
    "code": "stale_revision",
    "message": "This resource changed. Review the latest version.",
    "requestId": "req_...",
    "retryable": false,
    "details": {}
  }
}
```

Forbidden and nonexistent private resources use a non-disclosing response. Validation details never expose inaccessible IDs, schemas, accounts, source text, or secrets.

## Core collaboration routes carried from 0.1

The 0.2 canonical routes for the shipped collaboration core are explicit:

```text
POST   /api/v1/workspaces/:workspaceId/channels
GET    /api/v1/workspaces/:workspaceId/channels
GET    /api/v1/channels/:channelId
PATCH  /api/v1/channels/:channelId
POST   /api/v1/channels/:channelId/archive
POST   /api/v1/channels/:channelId/restore
DELETE /api/v1/channels/:channelId
POST   /api/v1/channels/:channelId/participants
DELETE /api/v1/channels/:channelId/participants/:participantId
POST   /api/v1/channels/:channelId/messages
POST   /api/v1/messages/:messageId/restore
DELETE /api/v1/messages/:messageId
POST   /api/v1/channels/:channelId/pins
DELETE /api/v1/channels/:channelId/pins/:pinId
GET    /api/v1/channels/:channelId/events
GET    /api/v1/channels/:channelId/stream

GET    /api/v1/runs/:runId
POST   /api/v1/runs/:runId/cancel
POST   /api/v1/runs/:runId/steer
POST   /api/v1/run-steps/:stepId/cancel
GET    /api/v1/runs/:runId/receipt

POST   /api/v1/channels/:channelId/tasks
GET    /api/v1/channels/:channelId/tasks
GET    /api/v1/tasks/:taskId
PATCH  /api/v1/tasks/:taskId
GET    /api/v1/tasks/:taskId/history

POST   /api/v1/approvals/:proposalId/decision
POST   /api/v1/questions/:questionId/answer
GET    /api/v1/artifacts/:artifactId
GET    /api/v1/artifacts/:artifactId/download
GET    /api/v1/artifacts/:artifactId/preview
GET    /api/v1/ui-instances/:instanceId
POST   /api/v1/ui-instances/:instanceId/interaction-tokens
POST   /api/v1/ui-instances/:instanceId/interactions
POST   /api/v1/ui-instances/:instanceId/data/:functionName
```

The protocol endpoint `/api/ag-ui/channels/:channelId/coworkers/:coworkerId/runs` and its capabilities query keep their 0.1 path/profile during the support window so standard AG-UI clients are not wrapped by a legacy JSON adapter. Authentication routes likewise keep the version-neutral `/api/auth/*` and `/api/session` paths until a separately published auth migration.

## Coworkers

```text
POST   /api/v1/workspaces/:workspaceId/coworker-drafts
GET    /api/v1/coworker-drafts/:draftId
POST   /api/v1/coworker-drafts/:draftId/revise
POST   /api/v1/coworker-drafts/:draftId/confirm
POST   /api/v1/coworker-drafts/:draftId/reject

GET    /api/v1/workspaces/:workspaceId/coworkers
GET    /api/v1/coworkers/:coworkerId
POST   /api/v1/coworkers/:coworkerId/revisions
POST   /api/v1/coworkers/:coworkerId/disable
POST   /api/v1/coworkers/:coworkerId/restore
POST   /api/v1/coworkers/:coworkerId/archive
DELETE /api/v1/coworkers/:coworkerId
POST   /api/v1/coworkers/:coworkerId/duplicate-draft
POST   /api/v1/coworkers/:coworkerId/transfer-ownership
GET    /api/v1/coworkers/:coworkerId/history

GET    /api/v1/workspaces/:workspaceId/coworker-templates
POST   /api/v1/workspaces/:workspaceId/coworker-templates
GET    /api/v1/coworker-templates/:templateId
POST   /api/v1/coworker-templates/:templateId/versions
POST   /api/v1/coworker-template-versions/:versionId/create-draft
POST   /api/v1/coworker-templates/:templateId/archive
```

Draft confirmation body binds `draftRevision`, `draftSha256`, `policyRevision`, `catalogRevision`, and idempotency. The server ignores client-computed effective grants and returns provisioning status. Template-to-draft creation copies inert prefill only and performs fresh destination-workspace resolution. Ownership transfer binds the coworker governance revision and an active destination member.

## Skills

```text
POST   /api/v1/runs/:runId/skill-drafts
GET    /api/v1/skill-drafts/:draftId
POST   /api/v1/skill-drafts/:draftId/revise
POST   /api/v1/skill-drafts/:draftId/reject
POST   /api/v1/skill-drafts/:draftId/publish
GET    /api/v1/workspaces/:workspaceId/skills
POST   /api/v1/workspaces/:workspaceId/skills
GET    /api/v1/skills/:skillId
GET    /api/v1/skills/:skillId/versions
POST   /api/v1/skills/:skillId/versions
POST   /api/v1/skill-versions/:versionId/validate
POST   /api/v1/skill-versions/:versionId/publish
POST   /api/v1/skill-versions/:versionId/test-runs
POST   /api/v1/skill-versions/:versionId/deprecate
POST   /api/v1/skill-versions/:versionId/revoke
POST   /api/v1/skills/:skillId/enable
POST   /api/v1/skills/:skillId/disable
POST   /api/v1/skills/:skillId/archive
POST   /api/v1/skills/:skillId/restore
DELETE /api/v1/skills/:skillId
GET    /api/v1/skills/:skillId/compare?from=:versionId&to=:versionId
POST   /api/v1/skills/:skillId/rollback-drafts
POST   /api/v1/coworkers/:coworkerId/skill-bindings
PATCH  /api/v1/skill-bindings/:bindingId
DELETE /api/v1/skill-bindings/:bindingId
GET    /api/v1/skills/:skillId/export
POST   /api/v1/workspaces/:workspaceId/skill-imports
```

Publish/attach/upgrade returns a capability diff and never grants missing tool/data authority. Rollback creates a new reviewed draft or repoints a binding to an existing immutable version; it never mutates history. Imports create disabled drafts. Lifecycle operations rotate only affected coworker/runtime revisions.

## Connections and tools

```text
GET    /api/v1/workspaces/:workspaceId/connections
POST   /api/v1/workspaces/:workspaceId/connection-intents
GET    /api/v1/connection-intents/:intentId
POST   /api/v1/connection-intents/:intentId/cancel
GET    /integrations/v1/:adapterKey/callback
GET    /api/v1/connections/:connectionId
POST   /api/v1/connections/:connectionId/test
POST   /api/v1/connections/:connectionId/reconnect-intents
POST   /api/v1/connections/:connectionId/disable
DELETE /api/v1/connections/:connectionId
GET    /api/v1/connection-accounts/:accountId/tool-descriptors
GET    /api/v1/connection-accounts/:accountId/grants
POST   /api/v1/connection-accounts/:accountId/grants
DELETE /api/v1/connection-grants/:grantId
```

The callback consumes server-bound state/nonce/PKCE and redirects to the recorded allowlisted application path; it accepts no workspace/account/grant choice from callback query data. Grant commands name exact descriptor-version IDs and expected connection/account revisions. Tool browse/test grants nothing and never runs a mutation.

## Knowledge

```text
POST   /api/v1/channels/:channelId/uploads
PUT    /api/v1/uploads/:uploadId/parts/:partNumber
GET    /api/v1/uploads/:uploadId/parts
POST   /api/v1/uploads/:uploadId/complete
POST   /api/v1/uploads/:uploadId/cancel
GET    /api/v1/uploads/:uploadId
GET    /api/v1/workspaces/:workspaceId/knowledge-sources
POST   /api/v1/channels/:channelId/knowledge/urls
POST   /api/v1/channels/:channelId/knowledge/repositories
GET    /api/v1/knowledge-sources/:sourceId
GET    /api/v1/knowledge-sources/:sourceId/versions
POST   /api/v1/knowledge-sources/:sourceId/share
POST   /api/v1/knowledge-sources/:sourceId/refresh
DELETE /api/v1/knowledge-sources/:sourceId
POST   /api/v1/knowledge-sources/:sourceId/restore
GET    /api/v1/knowledge-versions/:versionId/preview
GET    /api/v1/knowledge-versions/:versionId/download
POST   /api/v1/channels/:channelId/knowledge/search
GET    /api/v1/workspaces/:workspaceId/knowledge-collections
POST   /api/v1/workspaces/:workspaceId/knowledge-collections
GET    /api/v1/knowledge-collections/:collectionId
PATCH  /api/v1/knowledge-collections/:collectionId
POST   /api/v1/knowledge-collections/:collectionId/archive
POST   /api/v1/knowledge-collections/:collectionId/restore
DELETE /api/v1/knowledge-collections/:collectionId
POST   /api/v1/knowledge-collections/:collectionId/members
PATCH  /api/v1/knowledge-collections/:collectionId/members/:membershipId
DELETE /api/v1/knowledge-collections/:collectionId/members/:membershipId
POST   /api/v1/knowledge-collections/:collectionId/grants
DELETE /api/v1/knowledge-grants/:grantId
```

Upload/fetch returns a durable ingestion resource. Upload creation fixes actor/channel, expiry, maximum total/part bytes/count, declared metadata and optional expected final hash. Each bounded part write binds upload ID, part number, byte length/hash, expected upload state revision and idempotency; replay must match the existing hash. An optional direct-object-store capability is short-lived and bound to that actor/upload/part/size/hash and grants no read/list access. Complete binds the ordered part manifest, total size/final hash and state revision before atomic assembly; mismatch, expiry or abort cleans quarantine staging and creates no source. Preview/download use short-lived server-authorized responses; the URL/capability itself grants nothing after revocation.

Upload complete/cancel binds expected upload state revision and idempotency. Cancel revokes staging capabilities and queues byte cleanup; it never creates a KnowledgeSource.

Collection membership can pin a source version or follow the source's current version according to an explicit policy. A collection grants nothing by itself: queries intersect current collection/source, requester, coworker/workflow and channel grants.

## Memory

```text
GET    /api/v1/workspaces/:workspaceId/memories
POST   /api/v1/workspaces/:workspaceId/memory-proposals
GET    /api/v1/memory-proposals/:proposalId
POST   /api/v1/memory-proposals/:proposalId/decision
GET    /api/v1/memories/:memoryId
POST   /api/v1/memories/:memoryId/revisions
POST   /api/v1/memories/:memoryId/archive
POST   /api/v1/memories/:memoryId/restore
POST   /api/v1/memories/:memoryId/promote
DELETE /api/v1/memories/:memoryId
GET    /api/v1/memories/:memoryId/history
GET    /api/v1/memories/:memoryId/grants
POST   /api/v1/memories/:memoryId/grants
DELETE /api/v1/memory-grants/:grantId
POST   /api/v1/memory-conflicts/:conflictId/resolve
GET    /api/v1/agent-turns/:turnId/context-manifest
```

Decision/edit/promote binds exact proposal/current revision and source/grant status. Context manifests expose only currently authorized source labels/details to the requester.

## Workspace search and history

```text
POST   /api/v1/workspaces/:workspaceId/search
GET    /api/v1/workspaces/:workspaceId/search/status
GET    /api/v1/runs/:runId/history
GET    /api/v1/runs/:runId/receipt
```

Search bodies use the closed `WorkspaceSearchQueryV1`; workspace/scope/filter fields are selectors only. Authorization occurs before candidates, counts/facets, snippets and result delivery. Result cursors and links grant nothing. Run history/receipt return only safe normalized lineage currently visible to the requester.

## Controlled component catalogue and grants

```text
GET    /api/v1/workspaces/:workspaceId/components
GET    /api/v1/components/:componentId
GET    /api/v1/component-versions/:versionId/preview
GET    /api/v1/coworkers/:coworkerId/component-grants
POST   /api/v1/coworkers/:coworkerId/component-grants
DELETE /api/v1/component-grants/:grantId
GET    /api/v1/coworkers/:coworkerId/data-function-grants
POST   /api/v1/coworkers/:coworkerId/data-function-grants
DELETE /api/v1/data-function-grants/:grantId
```

Catalogue reads expose only published, authorized descriptors and checked-in preview props. Grant/revoke commands bind the coworker runtime revision, exact component/data-function version and descriptor hash, channel scope, policy/catalogue revision and idempotency; render and data grants remain separate. The server recomputes authority and rotates affected sessions before a changed offered-tool set can run. Preview executes no agent, provider call or mutation.

## Optional advanced orchestration

```text
GET   /api/v1/channels/:channelId/orchestration-config
PATCH /api/v1/channels/:channelId/orchestration-config
PATCH /api/v1/coworkers/:coworkerId/native-subagent-policy
GET   /api/v1/runs/:runId/subagent-lineage
```

Configuration changes bind the current channel/config revision, an active coordinator coworker that is already a channel member, closed assignment/budget limits and idempotency. The default is disabled. A run may request only direct routing or an enabled channel mode and cannot supply a coordinator identity or broaden limits. Native children are also default-off: only an authorized coworker editor may enable a passing conformance profile with exact parent agent/runtime revision, depth/child/budget ceiling and idempotency; change/disable creates a new coworker/runtime revision, rotates sessions and stops or terminalizes affected children. Subagent lineage returns server-normalized identity/events under ordinary channel/run authorization, never raw TrueForge identifiers.

## Records

```text
GET    /api/v1/workspaces/:workspaceId/record-types
POST   /api/v1/workspaces/:workspaceId/record-types
GET    /api/v1/record-types/:recordTypeId
POST   /api/v1/record-types/:recordTypeId/archive
POST   /api/v1/record-types/:recordTypeId/restore
DELETE /api/v1/record-types/:recordTypeId
POST   /api/v1/record-types/:recordTypeId/schema-versions
POST   /api/v1/record-schema-versions/:versionId/publish
POST   /api/v1/record-schema-versions/:versionId/deprecate

GET    /api/v1/record-types/:recordTypeId/records
POST   /api/v1/record-types/:recordTypeId/records
POST   /api/v1/record-types/:recordTypeId/query
GET    /api/v1/records/:recordId
PATCH  /api/v1/records/:recordId
POST   /api/v1/records/:recordId/archive
DELETE /api/v1/records/:recordId
POST   /api/v1/records/:recordId/restore
GET    /api/v1/records/:recordId/history
GET    /api/v1/record-types/:recordTypeId/views
POST   /api/v1/record-types/:recordTypeId/views
GET    /api/v1/record-views/:viewId
PATCH  /api/v1/record-views/:viewId
POST   /api/v1/record-views/:viewId/archive
POST   /api/v1/record-views/:viewId/restore
DELETE /api/v1/record-views/:viewId
GET    /api/v1/record-types/:recordTypeId/grants
POST   /api/v1/record-types/:recordTypeId/grants
DELETE /api/v1/record-grants/:grantId
POST   /api/v1/record-types/:recordTypeId/imports
GET    /api/v1/record-imports/:importId
GET    /api/v1/record-imports/:importId/preview
POST   /api/v1/record-imports/:importId/commit
POST   /api/v1/record-imports/:importId/cancel
POST   /api/v1/record-types/:recordTypeId/exports
GET    /api/v1/record-exports/:exportId
GET    /api/v1/record-exports/:exportId/download
```

P0 Task endpoints may be `/api/v1/channels/:channelId/tasks` and `/api/v1/tasks/:taskId`, but must preserve stable IDs/revisions/source refs for later record migration.

Archive, delete and restore are distinct revision-bound commands across channels, messages, skills, knowledge, records and memory. `DELETE` creates a retention tombstone rather than an immediate untracked hard delete; restore fails after purge or when source/policy constraints no longer permit it.

Record import stages and validates before `awaiting_commit`. Preview binds source/mapping/schema/permission revisions, explicit atomic-or-per-row mode and error/outcome manifest. Commit/cancel requires expected state/preview revision and idempotency; schema, mapping or permission drift makes the preview stale and no rows are written.

## Workflows and triggers

```text
GET    /api/v1/workspaces/:workspaceId/workflows
POST   /api/v1/workspaces/:workspaceId/workflows
GET    /api/v1/workflows/:workflowId
POST   /api/v1/workflows/:workflowId/versions
POST   /api/v1/workflow-versions/:versionId/validate
POST   /api/v1/workflow-versions/:versionId/test-runs
POST   /api/v1/workflow-versions/:versionId/publish
POST   /api/v1/workflows/:workflowId/enable
POST   /api/v1/workflows/:workflowId/pause
POST   /api/v1/workflows/:workflowId/resume
POST   /api/v1/workflows/:workflowId/disable
POST   /api/v1/workflows/:workflowId/archive
POST   /api/v1/workflows/:workflowId/run
POST   /api/v1/workflows/:workflowId/triggers
PATCH  /api/v1/workflow-triggers/:triggerId
GET    /api/v1/workflow-triggers/:triggerId/schedule-preview
POST   /api/v1/workflows/:workflowId/webhook-endpoints
POST   /api/v1/webhook-endpoints/:endpointId/disable
GET    /api/v1/workflow-runs/:runId
POST   /api/v1/workflow-runs/:runId/cancel
POST   /api/v1/workflow-runs/:runId/retry
GET    /api/v1/workflow-runs/:runId/waits
POST   /api/v1/workflow-waits/:waitId/resolve
GET    /api/v1/workspaces/:workspaceId/dead-letters
GET    /api/v1/dead-letters/:deadLetterId
POST   /api/v1/dead-letters/:deadLetterId/reconcile
POST   /api/v1/dead-letters/:deadLetterId/retry
POST   /api/v1/dead-letters/:deadLetterId/dismiss
POST   /api/v1/runs/:runId/workflow-drafts

POST   /hooks/v1/:publicEndpointId
POST   /api/v1/webhook-endpoints/:endpointId/rotate
POST   /api/v1/webhook-endpoints/:endpointId/test
POST   /api/v1/channels/:channelId/handoffs
POST   /api/v1/handoffs/:handoffId/decision
```

Test runs are real runs labeled `test` and use ordinary approvals. Trigger ingress acknowledges only after verification/dedupe persistence and never leaks whether a hidden workflow exists.

Wait/dead-letter commands bind expected state/revision and idempotency. Retry uses the retained immutable input/version snapshot and never retries an unknown non-reconcilable external effect blindly.

## Audit, retention, deletion and portability

```text
GET    /api/v1/workspaces/:workspaceId/audit
GET    /api/v1/workspaces/:workspaceId/audit/checkpoints
POST   /api/v1/workspaces/:workspaceId/audit-exports
GET    /api/v1/audit-exports/:exportId
GET    /api/v1/audit-exports/:exportId/download

GET    /api/v1/workspaces/:workspaceId/retention-policy
POST   /api/v1/workspaces/:workspaceId/retention-policy/versions
POST   /api/v1/retention-policy-versions/:versionId/activate
POST   /api/v1/workspaces/:workspaceId/legal-holds
POST   /api/v1/legal-holds/:holdId/release
POST   /api/v1/resources/:resourceType/:resourceId/reclassifications
GET    /api/v1/resources/:resourceType/:resourceId/deletion-status

POST   /api/v1/workspaces/:workspaceId/portable-exports
GET    /api/v1/portable-exports/:exportId
GET    /api/v1/portable-exports/:exportId/download
POST   /api/v1/workspaces/:workspaceId/portable-imports
GET    /api/v1/portable-imports/:importId
GET    /api/v1/portable-imports/:importId/preview
POST   /api/v1/portable-imports/:importId/commit
POST   /api/v1/portable-imports/:importId/cancel
```

Audit queries/exports authorize before counts, rows and fields. Destructive/hold/export operations bind recent authentication, exact policy/resource revision and idempotency. A deletion-status response contains safe store/state evidence, never deleted content or secret object keys. Export capabilities are short-lived, single-purpose and recheck requester membership/policy at download.

Policy activation and reclassification bind the current retention/classification head revision and commit the new head, epoch, audit and event atomically. Portable import creates inert staged data first. Preview binds the staging manifest, destination permission revision and automation/grant impact; commit requires recent authorization, exact preview/state revision and idempotency and leaves connections unbound and workflows/triggers disabled until separately reviewed. Cancel destroys staging subject to retention/legal hold and creates no active identity or grant.

## Teams, access, and notifications

```text
GET    /api/v1/workspaces/:workspaceId/members
POST   /api/v1/workspaces/:workspaceId/invitations
DELETE /api/v1/invitations/:invitationId
POST   /api/v1/invitations/accept
PATCH  /api/v1/workspace-memberships/:membershipId
DELETE /api/v1/workspace-memberships/:membershipId
POST   /api/v1/workspaces/:workspaceId/transfer-ownership
GET    /api/v1/workspaces/:workspaceId/groups
POST   /api/v1/workspaces/:workspaceId/groups
POST   /api/v1/groups/:groupId/members
DELETE /api/v1/groups/:groupId/members/:userId
GET    /api/v1/workspaces/:workspaceId/roles
POST   /api/v1/workspaces/:workspaceId/roles
GET    /api/v1/roles/:roleId
POST   /api/v1/roles/:roleId/versions
POST   /api/v1/workspaces/:workspaceId/role-bindings
DELETE /api/v1/role-bindings/:bindingId
GET    /api/v1/channels/:channelId/members
POST   /api/v1/channels/:channelId/members
DELETE /api/v1/channels/:channelId/members/:userId
POST   /api/v1/access/preview
GET    /api/v1/access/effective
GET    /api/v1/workspaces/:workspaceId/approval-policies
POST   /api/v1/workspaces/:workspaceId/approval-policies
POST   /api/v1/workspaces/:workspaceId/delegations
DELETE /api/v1/delegations/:delegationId
GET    /api/v1/users/me/approval-inbox
POST   /api/v1/approval-proposals/:proposalId/votes

GET    /api/v1/users/me/notifications
GET    /api/v1/users/me/notification-digests
GET    /api/v1/notification-digests/:digestId
POST   /api/v1/notifications/:notificationId/read
POST   /api/v1/notifications/:notificationId/archive
GET    /api/v1/users/me/notification-preferences
PATCH  /api/v1/users/me/notification-preferences
POST   /api/v1/users/me/notification-endpoints
POST   /api/v1/users/me/notification-endpoints/:endpointId/verify
POST   /api/v1/users/me/notification-endpoints/:endpointId/resend-verification
DELETE /api/v1/users/me/notification-endpoints/:endpointId
GET    /api/v1/users/me/events

POST   /api/v1/channels/:channelId/presence-leases
PUT    /api/v1/channels/:channelId/presence-leases/:leaseId
DELETE /api/v1/channels/:channelId/presence-leases/:leaseId
```

Access preview explains allowed/denied requested permissions without disclosing inaccessible resource existence or secret identifiers.

Custom roles are 0.3 endpoints and compile only versioned allowlisted capability sets plus resource constraints. They cannot alter the protected owner bundle, grant beyond the creator's delegation ceiling or smuggle account/tool authority through labels.

`approval-proposals` is the generalized P1+ proposal resource. External-tool proposals retain the exact P0 RequiredAction/account/tool/arguments/target/session binding; record, memory and workflow proposals bind a closed application command/subject revision/payload hash. Voting decides only the immutable proposal. A separate type-specific worker claims the resolved action and never routes non-external proposals through TrueForge/provider resume.

Compatibility rule: the P0 `POST /api/approvals/:proposalId/decision` route remains an adapter to this same current policy/vote service. Under a simple one-person policy it may resolve immediately; under quorum, separation or delegated policy it records at most the caller's eligible vote and returns the still-pending policy state. It can never bypass current group membership, quorum, stale checks or separation rules. There is one canonical proposal state and one execution claim regardless of route version.

Approval votes bind exact proposal/policy revision and expected proposal state; the server computes current group/delegation/separation eligibility. Inbox rows and notification links grant nothing.

Presence create binds the authenticated application/client session, current channel membership and an optional `visible`/`invisible` mode; renew/update accepts only closed coarse `online`, `viewing` or `typing` state with a server-capped 60-second TTL. `PresenceProjectionV1` contains channel ID, authorized safe user identity, coarse state and expiry only. It is delivered on the authorized channel realtime connection, rate-limited per user/session/channel and never written as DomainEvent/audit authority. Invisible mode emits no member projection. Membership/session revocation, stream close, explicit release or TTL expiry removes the lease; clients treat missed removal as expired at the server timestamp.

## Internal agent tools

Agent-facing tools are private versioned application commands, not the public browser API:

- `search_channel_knowledge.v1`
- `propose_memory.v1`
- `task_create.v1`, `task_update.v1`
- Reviewed record-type commands.
- Literal connection/account-pinned external tool descriptors compiled through reviewed ToolPolicyDefinitions.
- `propose_handoff.v1` where enabled.
- Controlled GenUI render/interaction tools from P0.

Every tool has a literal descriptor, closed schema, declared effect, ToolPolicyDefinition, caller/runtime binding, channel/workspace scope, budget, audit projection, and output redaction. There is no raw SQL, generic HTTP, arbitrary file lookup, dynamic provider tool execution, or “call any application command” tool.

## Compatibility

- Additive response fields are allowed within a stable version; clients ignore unknown fields only where schema explicitly permits.
- Removed/renamed semantics require a new API/event/tool version and deprecation period.
- Stored workflow/skill/record versions pin the contract version they validate against.
- Contract fixtures test one prior supported client/release and current server in both directions where promised.

### 0.1 route evolution

Release 0.2 keeps authenticated compatibility adapters for the shipped 0.1 UI/CLI while clients migrate to `/api/v1`. Adapters call the same command/query and policy services—not a legacy authority path.

| 0.1 route family | `/api/v1` authority | 0.2 rule |
| --- | --- | --- |
| `/api/channels`, messages, Runs, Tasks and replay | Exact routes in `Core collaboration routes carried from 0.1` | Preserve 0.1 response/event fixtures or return an explicit supported-version error; never silently reinterpret fields |
| `/api/coworker-drafts`, coworkers and memberships | Coworker v1 routes | Preserve draft hash/policy/catalogue/idempotency and stable IDs |
| `/api/runs/:id/skill-drafts`, `/api/skill-drafts/*`, skills/bindings | Skill draft/lifecycle v1 routes | GET/revise/publish/attach preserve immutable source hash and authority intersection |
| `/api/approvals/:id/decision`, questions | Generalized proposal/question v1 services | A legacy decision becomes one current-policy vote and cannot bypass quorum/separation |
| `/api/connections`, artifacts and controlled UI | Connection routes plus the exact artifact/UI routes above | Existing capabilities/grants/hashes remain valid only under current authorization and expiry |

The checked-in compatibility manifest enumerates every 0.1 method/template, its exact v1 or retained-protocol target, request/response/event fixture, auth/CSRF behavior and deprecation status; CI rejects an unmapped or duplicate route. Adapters are covered by old-client/new-server fixtures and gain deprecation headers/docs once a removal release is chosen. P1-107 evidence runs the shipped browser against the upgraded server. No adapter is removed before the compatibility policy and at least one supported migration window are published.
