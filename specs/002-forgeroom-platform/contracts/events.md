# Platform domain-event contract

## Relationship to existing streams

- AG-UI carries one agent run's realtime user interaction.
- `channel_events` are the durable, ordered projection visible in one channel.
- `DomainEventV1` is the workspace-level integration/outbox contract for product mutations.

These are related projections, not interchangeable transports. Raw TrueForge/provider events never become public domain events.

## Envelope

```ts
type DomainEventV1 = {
  specVersion: "1.0";
  id: string;
  source: "forgeroom";
  type: string;
  schemaVersion: 1;
  workspaceId: string;
  workspaceSequence: number;
  subject: { type: string; id: string; revision?: number };
  actor: ActorRefV1;
  correlationId: string;
  causationId?: string;
  time: string;
  visibility: {
    scope: "workspace" | "channel" | "resource" | "user" | "security";
    resourceRefs: ResourceRefV1[];
  };
  data: Record<string, JsonValue>;
  dataSha256: string;
};
```

`data` is a minimal redacted schema per event type. Content/source bytes, credentials, raw tool/model payloads, reasoning, signatures, invitation tokens, webhook secrets, and private approval answers are forbidden.

`dataSha256` uses `ForgeRoomHashV1` from `data-model.md` with purpose `domain-event-data` and the exact event type/schema version. Event envelope, audit-entry, checkpoint and manifest hashes use their own closed purposes/profile versions; raw content hashes remain exact-byte hashes. Fixtures include canonical preimages so application, worker, export and restore implementations must reproduce identical digests.

Each event type has a checked-in closed JSON Schema and safe positive/negative example. `DomainEventV1.data` is open only at the TypeScript envelope boundary; persistence/emission requires successful dispatch by `(type, schemaVersion)` to that closed schema.

## Event families

### Coworkers and skills

```text
coworker.draft_created
coworker.draft_revised
coworker.draft_stale
coworker.draft_rejected
coworker.version_created
coworker.provisioning_started
coworker.created
coworker.version_activated
coworker.owner_transferred
coworker.disabled
coworker.archived
coworker.restored
coworker.deleted
coworker.template_created
coworker.template_version_published
coworker.template_archived
skill.draft_created
skill.draft_revised
skill.draft_rejected
skill.version_created
skill.version_validated
skill.version_published
skill.test_completed
skill.binding_changed
skill.enabled
skill.disabled
skill.rollback_draft_created
skill.import_staged
skill.archived
skill.restored
skill.deleted
skill.deprecated
skill.revoked
```

### Connections and tools

```text
connection.intent_started
connection.intent_cancelled
connection.created
connection.account_verified
connection.health_changed
connection.reconnect_required
connection.disabled
connection.revoked
connection.grant_added
connection.grant_revoked
tool_descriptor.observed
tool_descriptor.quarantined
```

Events carry only safe redacted account labels, state/effect and descriptor/grant hashes. They never contain OAuth codes/tokens, provider credentials, callback state, raw descriptors/bodies or secret account identifiers.

### Knowledge and memory

```text
knowledge.source_created
knowledge.upload_started
knowledge.upload_completed
knowledge.upload_cancelled
knowledge.version_uploaded
knowledge.ingestion_progress
knowledge.extraction_ready
knowledge.extraction_failed
knowledge.extraction_promoted
knowledge.version_ready
knowledge.version_failed
knowledge.version_quarantined
knowledge.source_shared
knowledge.source_revoked
knowledge.source_deleted
knowledge.source_restored
knowledge.collection_created
knowledge.collection_changed
knowledge.collection_archived
knowledge.collection_restored
knowledge.collection_deleted
knowledge.grant_changed
memory.proposed
memory.confirmed
memory.rejected
memory.revised
memory.archived
memory.restored
memory.promoted
memory.deleted
memory.conflict_detected
memory.conflict_resolved
memory.expired
memory.revoked
memory.used
memory.grant_changed
```

`memory.used` and retrieval evidence normally stay in audit/user-specific inspection rather than the channel timeline.

### Search projections

```text
search.projection_requested
search.projection_ready
search.projection_tombstoned
search.rebuild_started
search.rebuild_promoted
search.rebuild_failed
```

Projection requests name resource/revision/profile/hashes and conservative visibility only; they do not contain full private bodies. Search workers fetch the authorized authoritative projection through internal domain services.

### Core collaboration content

```text
channel.created
channel.updated
channel.archived
channel.restored
channel.deleted
channel.coworker_member_added
channel.coworker_member_removed
message.created
message.deleted
message.restored
channel.pin_added
channel.pin_removed
run.cancel_requested
run.steer_requested
run_step.cancel_requested
task.created
task.updated
```

Content deletion events carry only stable IDs, prior revision/hash, policy version and propagation job reference; they never carry deleted message text.

### Controlled components

```text
component.grant_added
component.grant_revoked
component.data_function_grant_added
component.data_function_grant_revoked
ui.interaction_consumed
ui.component_interrupt_resolved
```

Grant events contain exact component/data-function version and descriptor/grant hashes plus affected runtime revision IDs, never rendered private data or interaction tokens.

### Records

```text
record_type.created
record_type.archived
record_type.restored
record_type.deleted
record_type.schema_draft_created
record_type.schema_published
record_type.schema_deprecated
record.created
record.updated
record.archived
record.deleted
record.restored
record.relation_added
record.relation_removed
record.grant_changed
record_view.created
record_view.changed
record_view.archived
record_view.restored
record_view.deleted
record.import_started
record.import_committed
record.import_completed
record.import_failed
record.import_cancelled
record.export_requested
record.export_ready
record.export_failed
```

Record events contain changed field keys and revision/source hashes, not fields the consumer is not authorized to see.

### Workflows and handoffs

```text
workflow.created
workflow.version_created
workflow.version_published
workflow.enabled
workflow.paused
workflow.resumed
workflow.disabled
workflow.archived
workflow.run_queued
workflow.run_started
workflow.step_started
workflow.step_waiting
workflow.step_succeeded
workflow.step_failed
workflow.step_unknown
workflow.run_completed
workflow.run_failed
workflow.run_cancelled
workflow.schedule_misfire
workflow.trigger_created
workflow.trigger_changed
workflow.trigger_disabled
workflow.trigger_deduplicated
workflow.wait_created
workflow.wait_resolved
workflow.retry_requested
workflow.dead_lettered
workflow.dead_letter_resolved
webhook.accepted
webhook.rejected
webhook.endpoint_created
webhook.endpoint_rotated
webhook.endpoint_revoked
handoff.proposed
handoff.accepted
handoff.rejected
handoff.delivered
handoff.expired
orchestration.config_changed
orchestration.plan_created
orchestration.plan_failed
orchestration.plan_completed
subagent.started
subagent.terminal
```

### Teams, access, and notifications

```text
membership.invited
membership.invitation_revoked
membership.joined
membership.role_changed
membership.suspended
membership.removed
ownership.transferred
group.created
group.member_added
group.member_removed
role.created
role.version_published
role.binding_added
role.binding_revoked
channel.human_member_added
channel.human_member_removed
resource.grant_added
resource.grant_revoked
approval_policy.published
approval.proposal_created
approval.proposal_resolved
approval.execution_started
approval.execution_completed
approval.execution_failed
delegation.created
delegation.revoked
approval.vote_recorded
approval.group_resolved
question.answered
notification.created
notification.read
notification.archived
notification.preference_changed
notification.endpoint_verification_started
notification.endpoint_verified
notification.endpoint_revoked
notification.delivery_succeeded
notification.delivery_failed
notification.digest_sealed
notification.digest_cancelled
```

### Audit, retention and portability

```text
audit.checkpoint_created
audit.export_requested
audit.export_ready
audit.integrity_failed
retention.policy_version_created
retention.policy_activated
retention.legal_hold_created
retention.legal_hold_released
resource.deletion_requested
resource.deletion_progress
resource.deletion_completed
resource.classification_changed
portable_export.requested
portable_export.ready
portable_import.requested
portable_import.staged
portable_import.committed
portable_import.cancelled
portable_import.completed
portable_import.failed
```

Deletion/classification events name the root resource, exact revision, policy/classification revision, dependency counts and content-free outcome hashes. They never contain deleted bytes, private snippets, object keys or legal-hold free text.

Every stable mutating API/command must name exactly one primary event schema in this catalogue (and any explicit secondary security/deletion event) before implementation. There is no catch-all `resource.changed` escape hatch. A checked-in machine-readable registry maps method/route or internal command/version to primary/secondary event type/schema, aggregate revision behavior, audit action and idempotency contract. CI compares that registry with the route/command catalogue, closed event JSON Schemas and examples; an unmapped mutation, untyped event or orphan schema blocks the release.

## Transaction and delivery

1. Domain mutation, audit record, DomainEvent, and outbox destination rows commit in one database transaction.
2. Workers lease outbox rows and deliver at least once.
3. Consumers deduplicate `(consumer_name, event_id)` and store an outcome hash.
4. Retry uses bounded backoff; poison events reach an operator-visible dead-letter state.
5. Every committed event receives a unique monotonic `workspaceSequence`; aggregate revision and channel sequence remain the stronger domain ordering boundaries. Consumers persist their workspace-sequence cursor and still tolerate unrelated interleaving.
6. Rebuildable projections replay immutable events plus current authoritative state where deletion/permission revocation must win.

## Visibility and projection

- Producer assigns conservative visibility/resource references from server-held state.
- Every consumer rechecks current authorization before projecting content, sending a notification, starting a workflow, or delivering a webhook.
- Permission removal may cause an old event to become unreadable; the event ID/type may remain in restricted audit according to policy.
- A channel projection receives a new monotonic channel sequence and links the domain event ID.
- External outbound webhooks use a separately documented minimal signed schema and fixed registered destination; internal DomainEvent JSON is not blindly forwarded.

## Trigger safety

- Only allowlisted stable event types may start workflows.
- A trigger pins schema version and uses a closed filter AST over allowlisted fields.
- Event `correlationId`, `causationId`, workflow/channel visited set, and hop budget prevent loops.
- Replaying one domain event creates at most one logical WorkflowRun per trigger/version.
- Event data cannot select account, tool, service principal, arbitrary destination, or policy.

## Schema evolution

- `type + schemaVersion` identifies a schema; published examples and JSON Schemas are checked in.
- Additive optional fields require fixtures; semantic/required-field changes increment schema version.
- Consumers declare supported versions and dead-letter rather than misinterpret unknown required semantics.
- The release suite replays prior supported event fixtures through all in-tree consumers.

## Event acceptance

- A transaction rollback produces neither committed entity change nor deliverable event.
- Concurrent workspace mutations allocate distinct ordered workspace sequences with no committed-event gap or duplicate.
- Duplicate delivery produces one notification, trigger run, search projection change, and audit consumption result.
- Removing channel access before delivery prevents private content projection.
- A record update event cannot reveal a field denied to the consuming user/workflow.
- Causation-loop tests stop at configured limits with a visible reason.
