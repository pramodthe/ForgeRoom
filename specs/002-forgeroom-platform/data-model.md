# Startup platform data model

## Scope

The P0 schema in [`../001-forgeroom-foundation/data-model.md`](../001-forgeroom-foundation/data-model.md) remains authoritative for channels, runs, TrueForge sessions, tools, approvals, artifacts, controlled UI instances, and audit. This document adds shared platform primitives and startup domains.

## Shared references

```ts
type ActorRefV1 = {
  kind: "human" | "coworker" | "workflow" | "system";
  id: string;
  revisionId?: string;
};

type ResourceRefV1 = {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  revisionId?: string;
};

type SourceRefV1 = ResourceRefV1 & {
  locator?: {
    page?: number;
    section?: string;
    row?: number;
    column?: string;
    lineStart?: number;
    lineEnd?: number;
    path?: string;
    commit?: string;
    start?: number;
    end?: number;
  };
  contentSha256: string;
  label: string;
};
```

A reference never grants access. The server resolves it and reauthorizes the referenced resource/revision at every content delivery or use.

## Canonical hash profile

`ForgeRoomHashV1` governs every semantic `*_sha256` unless a field explicitly says raw content/blob hash. Semantic JSON is RFC 8785 JCS UTF-8 and the SHA-256 preimage is `forgeroom-hash-v1\0<purpose>\0<schema-or-profile-version>\0<canonical-json>`. Ordered arrays retain order; fields declared as sets are sorted by their canonical encoded member before JCS; absent and explicit `null` remain distinct. Raw file/blob/content hashes are SHA-256 over exact bytes with no JSON/domain prefix. Text-only hashes state their Unicode normalization and encoding in the owning schema; the default is unmodified UTF-8, not locale normalization. Every event, manifest, export and verifier record carries or implies one closed purpose/profile version, and hash comparison across different purposes/profiles is invalid. Secrets use purpose-bound keyed hashes where correlation is required and are never made guessable by this profile.

## Shared platform tables

```text
workspace_event_sequences
  workspace_id, next_sequence, updated_at

domain_events
  id, workspace_id, workspace_sequence, event_type, schema_version,
  subject_type, subject_id, resource_revision,
  actor_kind, actor_id, actor_revision_id,
  correlation_id, causation_id,
  visibility_scope_json,
  payload_redacted_json, payload_sha256,
  occurred_at, created_at

domain_event_outbox
  event_id, destination, state, attempt,
  next_attempt_at, lease_owner, lease_expires_at,
  last_error_redacted_json, created_at, delivered_at

domain_event_consumptions
  consumer_name, event_id, outcome_sha256, consumed_at

service_principals
  id, workspace_id, name, purpose, owner_user_id,
  status, credential_ref, credential_version,
  created_by, created_at, revoked_at

resource_grants
  id, workspace_id, subject_kind, subject_id,
  resource_type, resource_id, permission,
  constraints_json, policy_revision,
  granted_by, created_at, expires_at, revoked_at

permission_revisions
  workspace_id, revision, reason_code, actor_user_id, created_at
```

Mutation, audit row, domain event, and outbox row commit atomically. Workspace sequence allocation locks/updates `workspace_event_sequences`; `(workspace_id, workspace_sequence)` is unique and gap-free only for committed events. Consumers deduplicate on `(consumer_name, event_id)`. A channel event is a channel-visible projection; it does not replace the workspace domain event.

Every committed DomainEvent has exactly one `platform_audit_entries` row with unique `(workspace_id, workspace_sequence)` and unique `domain_event_id`. Under the same workspace-sequence lock, `previous_entry_sha256` is the `entry_sha256` at the immediately preceding committed workspace sequence; the first row uses the versioned genesis hash. Checkpoints cover contiguous sequence ranges and link forward from the prior checkpoint but never replace per-event rows. Missing, duplicate, reordered or broken links fail integrity verification.

Optional coordinator configuration extends channels through a separate governed aggregate rather than a hidden prompt flag:

```text
channel_orchestration_configs
  id, workspace_id, channel_id,
  coordinator_mode, coordinator_coworker_id nullable,
  synthesis_enabled, max_assignments, budget_json,
  status, revision, created_by, created_at, updated_at
```

`coordinator_mode` is `disabled` by default. Enabling binds an active channel-member coworker and current channel/config revision; a per-run request may choose only a mode already allowed by this configuration.

```text
dispatch_plans
  id, workspace_id, channel_id, source_message_id, parent_run_id,
  orchestration_config_id, orchestration_config_revision,
  coordinator_coworker_id, plan_schema_version, plan_type,
  plan_sha256, state, state_revision, repair_count,
  created_at, terminal_at

dispatch_assignments
  id, dispatch_plan_id, ordinal, destination_coworker_id,
  objective_redacted_json, expected_output_schema_sha256,
  budget_json, state, state_revision, terminal_reason nullable,
  run_step_id nullable, result_manifest_sha256 nullable,
  created_at, terminal_at

native_subagent_runs
  id, workspace_id, channel_id, parent_coworker_id,
  parent_run_id, parent_run_step_id, parent_agent_turn_id,
  internal_child_ref_hash, objective_sha256,
  runtime_revision_id, authority_manifest_sha256, budget_json,
  state, state_revision, terminal_reason,
  created_at, started_at, terminal_at

native_subagent_policies
  id, workspace_id, agent_profile_id, agent_version_id,
  enabled, max_depth, max_children, budget_ceiling_json,
  conformance_profile, state, revision,
  enabled_by, created_at, updated_at
```

Plans and assignments are immutable except for CAS-controlled state pointers. Native-child raw provider IDs never enter public tables/events; terminal reasons include completed, failed, stopped, timed out, parent failed and parent/session rotated. Parent loss first revokes/blocks child claims, then commits one deterministic terminal projection.

## Audit, retention, classification and portability

```text
platform_audit_entries
  id, workspace_id, workspace_sequence,
  actor_kind, actor_id, auth_context_sha256,
  action, resource_type, resource_id, resource_revision,
  policy_revision, decision, domain_event_id,
  details_redacted_json, details_sha256,
  previous_entry_sha256, entry_sha256, occurred_at

workspace_audit_checkpoints
  id, workspace_id, first_sequence, last_sequence,
  checkpoint_profile, root_sha256, previous_checkpoint_sha256,
  signer_key_version, signature, created_at

audit_export_jobs
  id, workspace_id, requested_by,
  query_manifest_json, permission_revision,
  checkpoint_id, state, export_blob_key,
  export_sha256, expires_at, created_at, completed_at

retention_policy_versions
  id, workspace_id, version, profile_key,
  policy_json, policy_sha256, state,
  created_by, created_at, activated_at

workspace_retention_heads
  workspace_id, current_policy_version_id,
  revision, updated_by, updated_at

resource_classifications
  id, workspace_id, resource_type, resource_id, resource_revision,
  assignment_revision, supersedes_id nullable, state,
  classification, policy_revision, provenance_sha256,
  declassification_profile nullable, evidence_sha256 nullable,
  classified_by_ref_json, created_at

resource_classification_heads
  workspace_id, resource_type, resource_id, resource_revision,
  current_assignment_id, current_assignment_revision, updated_at

resource_lifecycle_heads
  workspace_id, resource_type, resource_id,
  state, revision, content_revision,
  deletion_job_id nullable, tombstoned_at nullable,
  purge_eligible_at nullable, purged_at nullable,
  updated_by_ref_json, updated_at

resource_security_heads
  workspace_id, resource_type, resource_id, resource_revision,
  security_epoch, classification_assignment_id,
  derivation_manifest_id, lifecycle_revision,
  permission_revision, updated_at

resource_security_dependencies
  derived_type, derived_id, derived_revision,
  source_type, source_id, source_revision,
  bound_source_security_epoch, created_at, invalidated_at

legal_holds
  id, workspace_id, resource_type, resource_id,
  scope_manifest_json, reason_code, policy_revision,
  state, revision, starts_at, expires_at,
  created_by, released_by, created_at, released_at

resource_derivation_edges
  id, workspace_id,
  source_type, source_id, source_revision,
  derived_type, derived_id, derived_revision,
  relation, source_classification, derived_classification,
  provenance_sha256, created_at, tombstoned_at

resource_derivation_manifests
  id, workspace_id, root_type, root_id, root_revision,
  graph_epoch, producer_profile, state,
  edge_count, edges_sha256, source_high_water,
  sealed_at, superseded_at, created_at

deletion_jobs
  id, workspace_id, root_resource_type, root_resource_id,
  requested_revision, retention_policy_version_id,
  requested_by, idempotency_key_hash, command_sha256,
  state, denial_committed_at, next_attempt_at,
  lease_owner, lease_expires_at, created_at, completed_at

deletion_attempts
  id, deletion_job_id, store_kind, target_ref_hash,
  attempt, state, error_redacted_json, started_at, completed_at

portable_export_jobs
  id, workspace_id, requested_by, export_profile,
  permission_revision, snapshot_high_water,
  manifest_blob_key, manifest_sha256, state,
  expires_at, created_at, completed_at

portable_import_jobs
  id, destination_workspace_id, requested_by,
  source_release, manifest_sha256, conflict_policy,
  staging_manifest_blob_key, staging_manifest_sha256,
  permission_impact_manifest_sha256,
  destination_permission_revision, preview_revision,
  state, state_revision, commit_idempotency_key_hash nullable,
  result_manifest_sha256, created_at, committed_at, cancelled_at, completed_at
```

`workspace_retention_heads` is the only active-policy selector and advances with expected revision. A deletion command is unique by workspace/root/revision/idempotency hash and retains its authenticated requester. Portable import first reaches `awaiting_commit` with inert staged objects and a revision-bound permission/automation impact manifest; only a separately authorized commit activates allowed objects. Cancelling or purging staging grants no destination authority.

Every content-bearing revision stores classification columns directly or has an append-only `resource_classifications` assignment plus a CAS-controlled head for that revision; “inherit” is never an unrecorded runtime guess. Reclassification appends/supersedes an assignment or creates a new content revision and synchronously increments the relevant graph/security epoch before later delivery.

`resource_lifecycle_heads` supplies revisioned aggregate lifecycle authority for roots whose P0 rows did not have it, including channels and messages. Archive/tombstone/restore/purge commands compare-and-set this head; `purged` is terminal and restore cannot recreate missing content. P1-107 backfills active revision 1 heads without changing IDs, timestamps or message bodies.

`resource_security_heads.security_epoch` is the authoritative delivery epoch. Classification, lifecycle, permission or sealed-derivation-eligibility changes increment it in the same transaction as the new head. Each derivative records the exact source security epochs it used. Download/render capabilities, UI/DataGrants, search/cache projections, workflow inputs, memory uses and export manifests bind a canonical security-dependency manifest; redemption/query/execution rechecks every current source epoch and denies on mismatch. `resource_derivation_manifests.graph_epoch` versions graph topology, while the security head makes that topology/classification/lifecycle state immediately enforceable. Asynchronous rebuild may restore eligibility only by producing new dependencies and a newly sealed head—it cannot reuse a stale lower-class capability.

Every derivative write commits its edge and manifest high-water update atomically with the derivative pointer. A sealed current manifest makes an intentional zero-edge result distinguishable from missing work. Retrieval/export/execution of a root or derivative requires a sealed current manifest/profile/epoch; building, stale, missing, count/hash mismatch or failed manifests deny and queue reconciliation. Derivation edges/manifests are dependency metadata, not permission grants. Audit hashes make tampering detectable relative to retained checkpoints; they do not claim an external transparency service.

## Connections and tool policy

```text
connection_intents
  id, workspace_id, actor_user_id, adapter_key,
  intended_owner_kind, intended_owner_id,
  state_sha256, pkce_ref, return_path,
  status, revision, expires_at, created_at, completed_at

connections
  id, workspace_id, adapter_key, owner_kind, owner_id,
  provider_connection_ref, status, revision,
  safe_display_json, scope_hash, current_account_id,
  created_by, created_at, updated_at, revoked_at

connection_accounts
  id, workspace_id, connection_id,
  provider_account_ref, external_tenant_hash,
  safe_identity_json, scopes_json, scopes_sha256,
  status, revision, verified_at, created_at, revoked_at

tool_descriptor_versions
  id, workspace_id, adapter_key, tool_slug, version,
  descriptor_json, descriptor_sha256, effect,
  policy_definition_version_id, state,
  observed_at, quarantined_at

connection_grants
  id, workspace_id, connection_account_id,
  subject_kind, subject_id, channel_id,
  allowed_effects_json,
  constraints_json, policy_revision, revision,
  granted_by, created_at, expires_at, revoked_at

connection_grant_tool_versions
  grant_id, workspace_id, tool_descriptor_version_id,
  effect, constraints_json, created_at, revoked_at

connection_health_checks
  id, connection_id, connection_account_id,
  descriptor_set_sha256, result, safe_details_json,
  checked_by_ref_json, checked_at
```

- Provider credential material is never stored in these rows; `provider_connection_ref`/`provider_account_ref` are server-only opaque references and safe exports omit them unless the adapter defines a non-secret portable identifier.
- Reconnect cannot mutate the identity behind an existing grant. A different account creates a new account/grant revision.
- Runtime manifests pin exact account and descriptor-version IDs/hashes. Revocation, expiry, scope loss or descriptor quarantine invalidates new claims and rotates affected sessions.
- Composite workspace foreign keys require each grant, account and descriptor-version mapping to belong to the same workspace; the normalized mapping—not JSON—is authorization truth.

## Coworkers and skills

P0 `coworker_drafts`, `agent_profiles`, `agent_versions`, `skills`, `skill_versions`, and `agent_skill_bindings` remain the physical authoritative tables and stable identities. P1 extends them; it does not create parallel coworker/skill aggregates.

```text
coworker_governance
  agent_profile_id, workspace_id, owner_user_id,
  visibility_policy_json, governance_revision,
  transferred_by, transferred_at, created_at, updated_at

coworker_templates
  id, workspace_id, stable_key, display_name,
  owner_user_id, visibility, status,
  current_version_id, revision, created_at, updated_at

coworker_template_versions
  id, coworker_template_id, version,
  draft_prefill_json, requested_capabilities_json,
  content_sha256, state, created_by, created_at

skill_version_extensions
  skill_version_id, semantic_version,
  package_manifest_json, package_sha256,
  compatibility_json, validation_state,
  created_at, updated_at

skill_governance
  skill_id, workspace_id, lifecycle_state,
  governance_revision, updated_by, updated_at

skill_test_runs
  id, workspace_id, skill_version_id, runtime_revision_id,
  fixture_manifest_json, expected_assertions_json,
  result, evidence_sha256, run_id, created_at, completed_at

skill_invocations
  id, workspace_id, skill_version_id,
  run_id, run_step_id, agent_turn_id,
  runtime_revision_id, outcome, lineage_sha256,
  created_at, completed_at
```

- Confirming a CoworkerDraft uses expected draft revision/hash/policy/catalogue and idempotency key.
- A template version is inert prefill content. Draft resolution removes/rejects account IDs, grants and inaccessible resource identifiers and computes authority fresh in the destination workspace.
- Every active coworker has exactly one governance row/owner; transfer binds expected governance revision and cannot target an inactive member.
- Published SkillVersion content is immutable; a binding pins one exact version.
- Skill required capabilities remain declarative requirements, never resource grants.

## Knowledge

```text
knowledge_collections
  id, workspace_id, display_name, description,
  owner_user_id, home_scope_type, home_scope_id,
  status, revision, created_at, updated_at, deleted_at

knowledge_collection_members
  id, workspace_id, collection_id, source_id,
  version_policy, pinned_source_version_id nullable,
  revision, added_by, added_at, removed_at

knowledge_grants
  id, workspace_id, source_id nullable, collection_id nullable,
  subject_kind, subject_id, permission,
  constraints_json, policy_revision,
  granted_by, created_at, expires_at, revoked_at

knowledge_sources
  id, workspace_id, source_type, display_name,
  home_scope_type, home_scope_id, owner_user_id,
  current_version_id, status, revision, created_at, deleted_at

knowledge_uploads
  id, workspace_id, channel_id, requested_by,
  intended_scope_json, safe_filename, declared_mime,
  expected_size, expected_sha256 nullable,
  staging_ref, state, state_revision, expires_at,
  assembled_source_version_id nullable,
  created_at, completed_at

knowledge_upload_parts
  upload_id, part_number, byte_size, part_sha256,
  state, received_at

knowledge_source_versions
  id, source_id, version, origin_ref_redacted_json,
  storage_key, safe_filename, declared_mime, detected_mime,
  byte_size, sha256, classification,
  classification_policy_revision, classification_provenance_sha256,
  scan_profile,
  state, failure_code, created_by, created_at, ready_at, tombstoned_at

knowledge_ingestion_jobs
  id, source_version_id, extraction_id nullable, stage, state, attempt,
  lease_owner, lease_expires_at, progress_json,
  error_redacted_json, created_at, completed_at

knowledge_extractions
  id, workspace_id, source_version_id, version,
  parser_profile, parser_version, ocr_profile nullable,
  output_manifest_json, output_manifest_sha256,
  warning_manifest_json, warning_manifest_sha256,
  classification, classification_provenance_sha256,
  state, created_by, created_at, ready_at, superseded_at

knowledge_extraction_heads
  source_version_id, current_extraction_id,
  revision, updated_by, updated_at

knowledge_segments
  id, source_version_id, extraction_id, ordinal, locator_json,
  content_blob_ref, content_sha256, token_count,
  language, classification, classification_provenance_sha256, created_at

knowledge_index_entries
  segment_id, extraction_id, index_profile, index_version,
  fulltext_projection,
  embedding_ref, state, indexed_at, deleted_at

knowledge_retrievals
  id, workspace_id, channel_id, actor_ref_json,
  agent_turn_id, query_sha256, scopes_json,
  index_profile, policy_revision,
  result_manifest_sha256, created_at

knowledge_retrieval_items
  retrieval_id, segment_id, extraction_id,
  rank, score_bucket, inclusion_reason,
  citation_json, citation_sha256, token_count
```

Source versions, extraction versions, citations, and prior run inputs never move to a newer version implicitly. Parser/OCR/index upgrades create a new immutable extraction and segments/index entries, then CAS-promote the extraction head after validation; they never mutate old segments or citation identity. Deletion blocks retrieval immediately even if asynchronous blob/index cleanup remains.

## Memory

```text
memory_items
  id, workspace_id, scope_type, scope_id,
  scope_principal_user_id nullable, scope_coworker_id nullable,
  subject_key_sha256, class, owner_user_id,
  state, revision, review_policy_revision, current_revision_id,
  created_at, updated_at, tombstoned_at

memory_revisions
  id, memory_item_id, revision,
  canonical_statement_encrypted, statement_sha256,
  sources_json, sources_sha256, confidence,
  classification, classification_policy_revision,
  classification_provenance_sha256,
  valid_from, valid_until, expires_at,
  created_by_ref_json, change_reason, created_at

memory_proposals
  id, workspace_id, proposed_by_ref_json,
  target_memory_item_id nullable, expected_current_revision nullable,
  scope_type, scope_id, scope_principal_user_id nullable,
  scope_coworker_id nullable, subject_key_sha256,
  proposed_revision_json, proposed_sha256,
  source_status_sha256, review_policy_revision,
  state, state_revision, expires_at, decided_by, decision_reason, decided_at

memory_grants
  id, workspace_id, memory_item_id nullable,
  scope_type, scope_id, subject_kind, subject_id,
  permissions_json, constraints_json, policy_revision,
  granted_by, created_at, expires_at, revoked_at

memory_conflicts
  id, workspace_id, left_revision_id, right_revision_id,
  state, state_revision, resolution_revision_id, detected_at, resolved_by, resolved_at

memory_uses
  id, workspace_id, memory_revision_id, run_id, agent_turn_id,
  context_request_id, query_sha256, scope_snapshot_sha256,
  source_status_snapshot_sha256, source_manifest_sha256,
  inclusion_reason, influence_summary_redacted_json,
  rank, token_count, context_fragment_sha256, used_at
```

Only active, authorized, unexpired, uncontested revisions are retrieval eligible. Edits append revisions. Same-key conflicts never resolve by last-write-wins.

Scope checks are closed: `user_coworker` requires both `scope_principal_user_id` and `scope_coworker_id`; single-resource scopes require only the matching `scope_id`; irrelevant scope columns must be null. `subject_key_sha256` is stable within its semantic scope/class and drives duplicate/conflict detection without exposing the statement.

## Search projections

```text
search_documents
  id, workspace_id, resource_type, resource_id, resource_revision,
  home_scope_type, home_scope_id, classification,
  projection_redacted_json, projection_sha256,
  source_revision_sha256, permission_revision,
  index_profile, state, indexed_at, tombstoned_at

search_projection_jobs
  id, workspace_id, resource_type, resource_id,
  target_revision, event_id, state, attempt,
  lease_owner, lease_expires_at, error_redacted_json,
  created_at, completed_at

search_rebuilds
  id, workspace_id, from_profile, to_profile,
  snapshot_high_water, catchup_high_water,
  expected_counts_json, verified_counts_json,
  state, started_at, promoted_at, completed_at
```

Search rows are derived candidate metadata, never ACL grants. Current authoritative resource state and `permission_revisions` are rechecked before counts, snippets and delivery. Tombstones deny immediately while physical index cleanup catches up.

## Records

```text
record_types
  id, workspace_id, stable_key, display_name,
  owner_user_id, visibility, current_schema_version_id,
  status, revision, created_by, created_at, updated_at

record_schema_versions
  id, record_type_id, version, schema_json, schema_sha256,
  field_policy_json, display_config_json,
  compatibility_class, state, published_by, published_at

records
  id, workspace_id, record_type_id, home_channel_id,
  visibility, status, aggregate_revision, current_revision_id,
  created_by_ref_json, created_at, updated_at, deleted_at

record_revisions
  id, record_id, revision, schema_version_id,
  data_json, data_sha256, changed_field_keys_json,
  classification, classification_policy_revision,
  classification_provenance_sha256,
  source_manifest_json, source_manifest_sha256,
  actor_ref_json, reason, created_at

record_relations
  id, workspace_id, source_record_id, relation_key,
  target_record_id, state, revision, created_by, created_at, removed_at

record_views
  id, workspace_id, record_type_id, name, visibility,
  filter_ast_json, sort_json, group_json, columns_json,
  owner_user_id, status, revision, created_at, updated_at

record_grants
  id, workspace_id, record_type_id,
  record_id nullable, channel_id nullable,
  subject_kind, subject_id,
  allowed_commands_json, allowed_fields_json,
  allowed_transitions_json, row_filter_ast_json nullable,
  policy_revision, granted_by, created_at, expires_at, revoked_at

record_import_jobs
  id, workspace_id, record_type_id, requested_by,
  source_version_id, mapping_json, mapping_sha256,
  schema_version_id, permission_revision,
  preview_manifest_json, preview_manifest_sha256,
  mode, state, state_revision,
  commit_idempotency_key_hash nullable,
  result_manifest_json, result_manifest_sha256,
  created_at, committed_at, cancelled_at, completed_at

record_export_jobs
  id, workspace_id, record_type_id, requested_by,
  query_ast_json, field_projection_json,
  permission_revision, snapshot_high_water,
  state, export_blob_key, export_sha256,
  expires_at, created_at, completed_at
```

P0 may implement `TaskRecord` as fixed tables (`tasks`, `task_revisions`, `task_grants`) matching the same revision/source/authorization invariants. Migration to the generic record system preserves stable Task IDs and history.

## Teams and notifications

```text
workspace_invitations
  id, workspace_id, email_normalized, role,
  intended_groups_json, token_sha256, expires_at,
  state, state_revision, created_by, created_at, accepted_by, accepted_at

workspace_memberships
  id, workspace_id, user_id, role, status, revision,
  invited_by, joined_at, suspended_at, removed_at

groups
  id, workspace_id, name, kind, status, revision, created_by, created_at

group_memberships
  group_id, user_id, scoped_role, added_by, added_at, removed_at

role_definitions
  id, workspace_id, stable_key, display_name,
  owner_managed, status, current_version_id,
  revision, created_by, created_at, updated_at

role_definition_versions
  id, role_definition_id, version,
  capability_set_json, constraints_json,
  definition_sha256, state, created_by, created_at

role_bindings
  id, workspace_id, role_definition_version_id,
  subject_kind, subject_id, resource_scope_json,
  state, granted_by, created_at, expires_at, revoked_at

notifications
  id, workspace_id, user_id, domain_event_id,
  category, resource_type, resource_id,
  thread_key, dedupe_key, title, body_redacted,
  state, state_revision, created_at, read_at, archived_at

notification_preferences
  id, workspace_id, user_id, category,
  resource_type, resource_id, in_app, email, web_push,
  digest_mode, quiet_hours_json, timezone, revision, updated_at

notification_deliveries
  id, notification_id nullable, digest_id nullable,
  endpoint_id, channel,
  attempt, state, provider_message_id,
  error_redacted_json, next_attempt_at, created_at, delivered_at

notification_digests
  id, workspace_id, user_id, endpoint_id, channel,
  window_start, window_end, timezone,
  preference_revision, source_event_high_water,
  safe_subject, safe_body_redacted, content_sha256,
  state, state_revision, created_at, sealed_at, delivered_at

notification_digest_items
  digest_id, notification_id, ordinal,
  item_projection_sha256, created_at

notification_endpoints
  id, workspace_id, user_id, kind,
  destination_ref_encrypted, destination_hash,
  verification_token_sha256, state, revision,
  verified_at, expires_at, revoked_at, created_at

approval_policy_versions
  id, workspace_id, resource_type, resource_id,
  version, rule_json, rule_sha256,
  eligible_effects_json, state, created_by, created_at

action_proposals (P1 in-place extension of the P0 table)
  add workspace_id, proposal_kind,
  subject_type, subject_id, subject_revision,
  command_name, normalized_payload_redacted_json,
  payload_sha256, policy_version_id,
  requested_by_ref_json, current_revision

authority_delegations
  id, workspace_id, delegator_user_id, delegate_user_id,
  resource_scope_json, permission_set_json,
  ceiling_policy_revision, state, revision,
  starts_at, expires_at, revoked_at, created_at

approval_votes
  id, workspace_id, action_proposal_id,
  approval_policy_version_id, group_id,
  actor_user_id, eligibility_snapshot_sha256,
  decision, decision_sha256, created_at

approval_inbox_items
  id, workspace_id, action_proposal_id,
  recipient_user_id, policy_version_id,
  state, dedupe_key, created_at, resolved_at
```

Invitation tokens are stored only as hashes and accepted once by a matching verified identity. Inactive workspace membership overrides every group/resource grant.

Groups with `kind=approver` provide membership only; immutable `approval_policy_versions` define one/all/threshold/separation/expiry semantics. Votes are unique per proposal/actor and the canonical proposal resolution remains compare-and-set. Delegations are bounded by the delegator's current ceiling and rechecked at decision time.

P1 backfills existing P0 ActionProposals as `proposal_kind=external_tool_action`. For that kind, `required_action_id` and every P0 account/tool/arguments/target/session hash remain mandatory and only TrueForge RequiredAction ingestion may create the row. Other closed kinds such as `record_command`, `memory_activation`, `workflow_publish` and `workflow_enable` bind one literal application command/subject revision/payload hash and are created only by that command gateway after authorization—not by a generic UI endpoint. Kind-specific checks require irrelevant external/provider fields to be null. All kinds use one decision/vote/policy state machine, but execution dispatches through their reviewed type-specific handler; a non-external proposal never calls `RunAgentInput.resume` or a provider.

The migration is ordered: add generalized columns as nullable; backfill every P0 row from its workspace/RequiredAction lineage as `external_tool_action`; verify hashes and uniqueness; install partial foreign keys/indexes and an exactly-one-kind check; only then make `workspace_id`, `proposal_kind`, `policy_version_id` and `current_revision` mandatory and permit internal kinds. The check requires external-tool rows to retain non-null `required_action_id`, tool-call, session-generation, connector/account/tool, descriptor, arguments and target bindings while internal command fields are null. It requires internal kinds to have non-null subject type/ID/revision, closed command name, normalized payload/hash and policy binding while every RequiredAction/provider/tool/session/arguments/target field is null. A partial unique index permits one external proposal per RequiredAction; internal idempotency is unique by kind/subject revision/command/payload hash.

Presence/typing/viewing is an ephemeral TTL projection keyed by `(workspace, channel, user, client session)` in the configured realtime store. It is never durable authority, never proves approval identity, and disappears on expiry/revocation.

A notification delivery targets exactly one notification or one sealed digest. Digest items are unique per digest/notification, the source-event high-water and preference revision make window retries deterministic, and authorization/preferences are rechecked before sealing and external delivery.

## Workflows

```text
workflow_definitions
  id, workspace_id, name, description,
  owner_user_id, current_version_id, status, revision,
  created_by, created_at, updated_at

workflow_versions
  id, workflow_definition_id, version,
  definition_json, definition_sha256,
  input_schema_json, output_schema_json,
  capability_manifest_json, capability_manifest_sha256,
  classification, classification_policy_revision,
  classification_provenance_sha256,
  service_principal_id, budgets_json,
  state, created_by, created_at, published_by, published_at

workflow_triggers
  id, workflow_definition_id, workflow_version_id,
  trigger_type, config_redacted_json, config_sha256,
  webhook_endpoint_id nullable,
  event_source_kind nullable, event_source_id nullable,
  event_type nullable, event_schema_version nullable,
  timezone, recurrence_spec, dst_policy,
  misfire_policy, overlap_policy,
  state, revision, created_by, created_at, enabled_at

webhook_endpoints
  id, workspace_id, adapter_key, public_endpoint_id,
  owner_user_id, workflow_definition_id nullable,
  allowed_event_types_json,
  secret_ref, secret_version, signature_profile,
  replay_window_seconds, payload_limit_bytes,
  state, revision, created_by, created_at, rotated_at, revoked_at

schedule_occurrences
  id, trigger_id, intended_at, occurrence_key,
  state, claimed_at, workflow_run_id, created_at

trigger_deliveries
  id, workspace_id,
  webhook_endpoint_id nullable, domain_event_id nullable,
  provider_delivery_id nullable,
  authenticated_source_kind, authenticated_source_id,
  auth_context_sha256, event_type, event_schema_version,
  correlation_id, causation_id,
  payload_sha256, received_at, verified_at,
  source_dedupe_key, state, rejection_reason nullable

trigger_delivery_matches
  id, trigger_delivery_id, trigger_id, workflow_version_id,
  match_result, match_reason, dedupe_key, occurrence_key,
  workflow_run_id nullable, state, created_at

workflow_runs
  id, workspace_id, workflow_definition_id, workflow_version_id,
  trigger_id, occurrence_key, service_principal_id,
  initiated_by_ref_json,
  application_run_id nullable,
  command_idempotency_key_hash,
  correlation_id, causation_id, input_manifest_json, input_sha256,
  input_classification, classification_provenance_sha256,
  final_output_manifest_json, final_output_sha256,
  cost_manifest_json, cost_manifest_sha256,
  destination_manifest_json, destination_manifest_sha256,
  audit_first_sequence, audit_last_sequence,
  state, state_revision, budgets_json, started_at, completed_at

workflow_step_runs
  id, workflow_run_id, step_key, attempt,
  application_run_step_id nullable, agent_turn_id nullable,
  state, lease_owner, lease_expires_at,
  input_sha256, output_manifest_json, output_sha256,
  error_redacted_json, started_at, completed_at

workflow_execution_links
  id, workspace_id, workflow_run_id, workflow_step_run_id nullable,
  relation_kind, resource_type, resource_id, resource_revision nullable,
  domain_event_id nullable, created_at

workflow_run_transitions
  id, workspace_id, workflow_run_id, step_run_id nullable,
  from_state nullable, to_state, reason_code,
  actor_ref_json, domain_event_id, created_at

workflow_waits
  id, workspace_id, workflow_run_id, step_run_id,
  wait_kind, required_action_id nullable, question_id nullable,
  resume_schema_sha256 nullable, state, state_revision,
  expires_at, resolved_by_ref_json nullable,
  resolution_sha256 nullable, created_at, resolved_at nullable

workflow_retry_commands
  id, workspace_id, workflow_run_id, step_run_id nullable,
  requested_by, mode, expected_state, idempotency_key_hash,
  state, created_at, applied_at nullable

workflow_dead_letters
  id, workspace_id, workflow_run_id, step_run_id nullable,
  source_delivery_id nullable, failure_class,
  safe_summary_json, input_manifest_sha256,
  reconciliation_state, state, revision, created_at, resolved_at nullable

workflow_handoffs
  id, workspace_id, source_channel_id, target_channel_id,
  destination_coworker_id,
  reply_channel_id, reply_thread_id nullable,
  reply_recipient_ref_json,
  source_run_id, workflow_run_id, route_id,
  correlation_id, causation_id,
  objective, resource_manifest_json, manifest_sha256,
  classification, hop_count, visited_set_sha256,
  expires_at, state, state_revision,
  created_by_ref_json, accepted_by, delivered_at
```

Unique `(trigger_id, occurrence_key)` on matches prevents duplicate logical scheduled/event runs; unique `(trigger_delivery_id, trigger_id, workflow_version_id)` makes evaluation replayable. An authenticated delivery exists before and independently of zero, one or many trigger matches, so pre-match rejection and internal `domain_event_id` ingress remain truthful. Published versions are immutable; active runs pin one. The immutable `WorkflowVersion.service_principal_id` is the sole unattended authority selector: a trigger cannot override it, every run copies it from the exact version, and current principal/grant/policy state is reauthorized before claim. A webhook trigger binds one exact endpoint, source, event type and schema version. Manual commands bind the caller and an idempotency key. A handoff fixes its destination coworker plus reply channel/thread/recipient; payload text cannot redirect either route. Step retries append attempts and never rewrite history.

Unique `(workflow_run_id, step_key, attempt)` and lease fencing prevent attempt overwrite. Webhook secret material is referenced through the secret manager and never stored in trigger config/event/audit JSON.

Wait resolution is compare-and-set and appends a transition before requeue. Cancel/retry commands bind expected current state and an idempotency key. A dead letter is terminal until an authorized operator chooses retry-from-snapshot, reconcile, dismiss or supersede; it never silently re-enters the queue.

`workflow_execution_links` is the normalized reconstruction layer. Closed relation kinds include application Run/RunStep, ActionProposal/approval, record command/revision, artifact, handoff, notification and audit event. Final output, cost and destination manifests are immutable terminal summaries whose members resolve through those links; history never depends on scanning arbitrary JSON or model text.

## 0.1-to-platform evolution

The platform extends the P0 schema in place; it does not create competing identities or silently reinterpret immutable history.

| P0 authority | Platform evolution |
| --- | --- |
| `users`, `memberships`, `auth_sessions` | Retain human/session identity. Backfill `workspace_memberships` from the same membership rows or evolve the table in place; no duplicate active membership or role broadening is allowed. |
| `channels`, participants, events/messages/pins | Retain IDs and channel sequence. Backfill active revision-1 lifecycle/security heads, workspace DomainEvents/audit sequence and immutable classification rows deterministically; private human membership extends participant authorization. Delete/restore CAS uses the new head and never rewrites old message/event bodies. |
| `agent_profiles` / `agent_versions` / channel sessions | Retain coworker, version and session IDs. Add `coworker_governance` to the same profiles and keep `agent_versions` as immutable version authority; a capability change still creates a new runtime/session generation. |
| P0 Skill/SkillVersion/bindings | Retain IDs/hashes, add content classification plus test/lifecycle/import-export/invocation references; no republish or ambient grant. |
| `connector_bindings`, `tool_grants`, descriptor/policy snapshots | Retain the exact provider/account opaque references and hashes while materializing platform Connection/Account/Descriptor/Grant revisions. No reconnect, alternate account, catalog expansion or permission widening occurs during migration. |
| `tasks` / revisions / grants | Preserve stable Task IDs/history while registering the fixed Task schema as a generic RecordType. Dual-read or migration must keep old message/UI/artifact/source links valid. |
| Runs, RunSteps, turns, approvals, artifacts and controlled UI | Remain canonical. Backfill immutable classification rows for content-bearing Run snapshots, artifacts and UI revisions; platform search/workflows/retention add references and derivation edges, never copies as new authority. |
| P0 audit rows | Remain append-only and are linked into platform audit/workspace sequence checkpoints without rewriting their captured payload/hash. |

P1-107 owns executable mapping/backfill, interrupted-resume and regression evidence. Live dispatch pauses at the migration boundary until workspace sequence, memberships, connection/tool authority, current pointers, permission revisions and integrity counts verify.

## Global constraints

- Every workspace-owned entity is scoped directly by immutable `workspace_id` or by a mandatory same-workspace parent with composite constraints. Hot authorization/query paths store `workspace_id` directly. Cross-workspace foreign keys are structurally prevented where practical.
- Connection/account/descriptor/grant foreign keys include the same workspace and cannot target a provider/account outside it.
- User-facing mutable aggregate roots have monotonic integer `revision` and expected-revision compare-and-swap; immutable child versions/attempts/events never require a fake mutable revision.
- Content-addressed blobs are committed before database pointers; orphan reconciliation deletes unreferenced blobs after a grace period.
- Soft delete/tombstone is used when history/audit/source references must survive. Default queries exclude deleted state.
- Timestamps are UTC instants; schedules additionally store IANA timezone and explicit DST policy.
- JSON schemas are closed/versioned and reject unknown/prototype keys. Large/sensitive content is stored in access-controlled blobs, not event/audit JSON.
- Database constraints enforce idempotency keys, unique sequence/revision/occurrence/decision semantics, and valid current pointers.
- Hosted mode uses separate migration/API/worker roles and row-level security as defense in depth; application authorization remains normative.

## Retention and deletion

The normative defaults, overrides and propagation rules are in [`retention.md`](./retention.md). A legal hold may retain bytes but never restores product visibility or execution eligibility.

## Migration acceptance

- Upgrade representative data from every supported version and validate hashes, revisions, permissions, pending approvals, schedules, outbox, and exports.
- Restore followed by migration produces the same logical state as migrate followed by backup/restore.
- Schema changes never reinterpret an immutable old revision without its pinned schema/parser/profile.
