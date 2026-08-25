# ForgeRoom 0.1 data model

| Field | Value |
| --- | --- |
| Status | Canonical logical schema and invariants |
| Storage | PostgreSQL through Drizzle ORM |
| Migration rule | Every schema change has forward migration and constraint tests |

Exact SQL types and indexes are implementation details, but the entities and invariants below are normative.

## Identity and workspace

~~~text
users
  id, email, display_name, avatar_url, password_hash, created_at

workspaces
  id, name, slug, policy_json, created_by, created_at

memberships
  workspace_id, user_id, role, status, created_at

auth_sessions
  id, user_id, secret_hash, expires_at, revoked_at,
  created_at, last_seen_at
~~~

P0 seeds one owner. Role checks still occur server-side for every command.

## Coworkers and immutable runtime snapshots

~~~text
agent_profiles
  id, workspace_id, handle, name, title, avatar_seed,
  visibility, status, editable_config_json,
  current_version_id nullable, config_revision,
  created_at, updated_at

agent_versions                     # P0 internal immutable version; history UI is P1
  id, agent_profile_id, version, config_json,
  spec_hash, created_by, created_at

coworker_drafts
  id, workspace_id, source_text_encrypted,
  proposal_json, effective_preview_json,
  draft_hash, revision, policy_revision, catalog_revision,
  state, created_by, expires_at, created_at, decided_at

session_revisions                  # required P0 internal snapshot
  id, agent_profile_id, source_config_revision,
  effective_config_redacted_json,
  effective_spec_hash, approval_policy_hash,
  created_by, created_at
~~~

CoworkerDraft is immutable per revision and has no authority. Confirmation binds its revision/hash/policy/catalogue/expiry and creates one AgentProfile/AgentVersion/grant set/provision command idempotently. SessionRevision is immutable. P0 does not require user-visible AgentVersion history.

## Private skills

~~~text
skills
  id, workspace_id, stable_name, display_name,
  owner_user_id, visibility, status,
  current_version_id nullable, created_at, updated_at

skill_versions
  id, skill_id, version, state,
  manifest_json, manifest_hash,
  skill_markdown_blob_key, content_hash,
  source_run_id, source_step_ids_json,
  created_by, created_at, published_at, revoked_at nullable

agent_skill_bindings
  id, agent_profile_id, agent_version_id,
  skill_version_id, state,
  attached_by, attached_at, detached_at nullable
~~~

P0 supports private instruction-only `SKILL.md` versions saved from completed Runs. Published content is immutable. Required tools/components/data/approvals are reviewed manifest declarations and grant nothing; attachment succeeds only inside existing effective authority and rotates affected sessions. P1 adds invocation lineage and skill test-run tables.

## Channels, messages and context

~~~text
channels
  id, workspace_id, name, mission_brief,
  summary, policy_json, next_sequence,
  status, created_by, created_at, updated_at

channel_participants
  channel_id, participant_type, participant_id,
  role, joined_at, removed_at

channel_events
  id, channel_id, sequence,
  type, actor_type, actor_id,
  run_id nullable, payload_json,
  agui_event_type nullable, agui_event_json nullable,
  logical_thread_id nullable, created_at

messages
  id, channel_id, event_id,
  author_type, author_id, body,
  parent_message_id nullable, created_at

channel_pins
  id, channel_id, source_event_id nullable,
  source_artifact_id nullable, label,
  pinned_by, created_at, removed_at
~~~

## Application-owned Tasks

~~~text
tasks
  id, workspace_id, channel_id,
  title, description nullable,
  status, assignee_type nullable, assignee_id nullable,
  source_message_id nullable, source_run_id nullable,
  due_at nullable, current_revision,
  created_by_type, created_by_id,
  created_at, updated_at

task_revisions
  id, task_id, revision,
  data_json, data_hash, changed_fields_json,
  source_manifest_json, source_manifest_hash,
  actor_type, actor_id, command_id,
  created_at

task_grants
  id, task_id nullable, channel_id,
  subject_type, subject_id,
  allowed_operations_json, allowed_fields_json,
  allowed_transitions_json,
  policy_revision, granted_by, created_at, revoked_at nullable
~~~

Task status is `todo`, `in_progress`, `blocked`, `in_review`, `done`, or `cancelled`. Create/update uses a workspace-scoped idempotency key and expected current revision; one winner advances `current_revision`, appends TaskRevision, audit and channel event atomically. P0 has no agent delete. TaskCard/DataTable are projections and cannot mutate these rows directly.

Allocate `channel_events.sequence`, validate the nested AG-UI event and append its durable envelope in one transaction. Unique `(channel_id, sequence)` is mandatory. Raw TrueForge events never occupy `agui_event_json`; P0 stores only complete validated standard/controlled events. P1-207 may add `channels.default_coordinator_agent_id`; P1-317 may add `channel_events.agui_source_ref_json` for private generated-document ingress. Neither field is present in the P0 migration, and raw HTML/CSS/behavior source never occupies payload_json or channel/AG-UI JSON.

## Sessions, Runs and queue

~~~text
channel_agent_sessions
  id, channel_id, agent_profile_id,
  logical_agui_thread_id,
  current_generation_id nullable,
  last_delivered_channel_sequence,
  state, created_at, updated_at

channel_agent_session_generations
  id, channel_agent_session_id,
  generation, agent_version_id nullable, session_revision_id,
  trueforge_session_id,
  effective_spec_hash, approval_policy_hash,
  active_turn_id nullable, state,
  created_at, retired_at nullable

runs
  id, channel_id, source_message_id,
  requested_by, routing_mode,
  goal, lifecycle, scheduling_paused,
  budget_json, started_at, completed_at

run_steps
  id, run_id,
  assigned_agent_id, objective,
  expected_output, context_refs_json,
  state, attempt,
  started_at, completed_at

turn_queue_items
  id, channel_agent_session_id, run_step_id,
  bound_session_generation_id nullable,
  input_type, input_payload_redacted_json,
  priority, fifo_sequence, state,
  lease_owner nullable, lease_expires_at nullable,
  created_at, claimed_at, completed_at

agent_turns
  id, run_step_id, channel_agent_session_id,
  session_generation_id, queue_item_id,
  application_run_token, trueforge_turn_id nullable,
  agui_run_id,
  previous_trueforge_turn_id nullable, input_type,
  last_trueforge_sequence, context_through_channel_sequence,
  state, error_json nullable,
  started_at, completed_at
~~~

Required constraints:

- Exactly one stable `channel_agent_sessions` row and logical AG-UI thread per `(channel_id, agent_profile_id)`.
- Immutable generation configuration lives in `channel_agent_session_generations`, unique by `(channel_agent_session_id, generation)` and `trueforge_session_id`. `current_generation_id` references at most one non-retired row. Rotation inserts a new row then atomically swaps the pointer; old remote IDs/hashes remain auditable and cannot accept new work.
- Queue items bind the exact generation when claimed. Only still-valid normal items may clear/rebind that field during an authorized rotation; response/component-interrupt/PauseGroup items never migrate. Every AgentTurn, component interrupt and ActionProposal references the exact generation row.
- Unique AG-UI `run_id` per logical thread and AgentTurn attempt.
- Partial unique index: one AgentTurn per stable ChannelAgentSession while state is acquiring, creating, streaming or resuming, regardless of generation.
- Unique `(channel_agent_session_id, fifo_sequence)`.
- Queue claims use short transactions and expiring leases.
- Queue `input_type` is closed to normal, pause_group_response, component_interaction_response and correction. Component/Pause response items bind an exact generation and cannot be rebound.
- P0 RunSteps are direct persistent-coworker assignments and have no parent/depth/coordinator/synthesis columns. P1-207/P1-209 add their own migration before enabling those paths.

P1-317 may add `iframe_context_eligible`, `context_classification_high_watermark`, and its provenance hash to the stable session only with the experimental migration/conformance gate. They are not P0 columns.

## Normalized TrueForge events

~~~text
run_event_frames                    # optional P1 diagnostic transport table
  id, agent_turn_id, stream_sequence,
  trueforge_event_id, event_type, thread_id,
  transport_metadata_redacted_json, payload_hash,
  received_at

run_events                          # required P0 canonical events
  id, agent_turn_id, trueforge_event_id,
  thread_id nullable,
  normalized_payload_redacted_json,
  normalized_type, first_seen_at, updated_at

agui_event_records                  # required P0 northbound events
  id, channel_event_id, agent_turn_id nullable,
  logical_thread_id nullable, agui_run_id nullable,
  event_type, message_or_activity_id nullable,
  storage_kind, event_json nullable,
  source_revision_id nullable, source_ref_json nullable,
  schema_profile, event_hash, source_ref_hash nullable,
  created_at
~~~

Unique `(agent_turn_id, trueforge_event_id)` for canonical TrueForge events and unique `channel_event_id` for each AG-UI record. If transport frames are retained, unique `(agent_turn_id, stream_sequence)`. `storage_kind` is `full_event` or `generated_source_ref`. Full event JSON validates against the pinned AG-UI/registered activity schema. A generated-source reference validates against the checked-in server-only reference schema; progress rows may have a null source_revision_id, while a ready row must point to one immutable UI render revision. It stores the exact closed source-free browser event wrapper plus its complete post-event setup/revision/progress/status/text/final-hash projection, but no blob key, capability URL or source. For this storage kind, `event_hash` is SHA-256 over RFC 8785 JCS UTF-8 of `browserEvent`; `source_ref_hash` separately hashes the full server reference. Typed, access-controlled TrueForge correlation columns such as trueforge_event_id/thread_id are permitted server-side; raw provider identifiers must not be copied into normalized JSON, browser envelopes, logs or audit exports. Never store reasoning, credentials, opaque auth headers, signatures or arbitrary raw tool bodies.

## Connectors and grants

~~~text
connector_bindings
  id, workspace_id, provider,
  credential_owner_type, credential_owner_id,
  composio_user_id, composio_session_id,
  trueforge_connector_name,
  config_version, config_hash,
  allowed_tools_json, acting_identity_json,
  status, verified_at, created_at, updated_at

tool_grants
  id, workspace_id, channel_id, agent_profile_id,
  connector_binding_id, tool_name,
  classification, approval_policy,
  observed_descriptor_hash, tool_policy_key,
  created_by, created_at, revoked_at
~~~

A connected account creates no effective capability without all intersecting grants and compiled AgentSpec allowlisting.

## Component registry and generative UI

### P0 physical controlled-registry schema

P0 uses only checked-in `registry_v1` controlled components. Its migration implements the tables/fields below; it does **not** create nullable placeholders for iframe classification, source/body/index, generated origin/capability, bootstrap/sanitizer/CSP/Permissions-Policy/header, verifier, delivery epoch, trusted-confirmation, `request_agent_turn`, or `open_existing_hitl` state.

~~~text
ui_components
  id, workspace_id, stable_name, kind,
  current_published_version_id, status, created_by, created_at, updated_at

ui_component_versions
  id, component_id, semantic_version, exposure, confirmation_policy,
  model_description, argument_schema_json, renderer_key, preview_props_json,
  declared_data_functions_json, declared_interaction_intents_json,
  descriptor_hash, published_by, published_at, revoked_at nullable

ui_component_grants
ui_data_function_grants
  exact component/version + workspace/channel/coworker scope,
  limits, grantor, created/expiry/revocation

ui_surface_grants
  id, ui_instance_id, grant_kind, policy_revision,
  bound_render_revision nullable, bound_manifest_hash nullable,
  data_ref/field_paths/limits/snapshot hashes nullable,
  action_ref/handler/action_mode/input schema/render-node IDs nullable,
  linked_data_grant/component_interrupt nullable,
  grant_body_redacted_json, grant_scope_hash,
  max_uses, use_count, issued_by, expires_at, revoked_at nullable, created_at

ui_instances
  id, workspace_id, channel_id, run_id, run_step_id, agent_turn_id,
  logical_thread_id, tool_call_id, component_version_id,
  activity_message_id, source_event_id, creator_agent_id, title,
  render_grant_id, replaces_ui_instance_id nullable,
  current_render_revision nullable, last_good_render_revision nullable,
  current_state_revision nullable, text_alternative,
  status, created_at, updated_at, ready_at nullable, quarantined_at nullable

ui_instance_revisions
  id, ui_instance_id, revision_kind, revision, base_revision nullable,
  component_version_id nullable, renderer_version/profile_hash nullable,
  validator_policy_version, argument/state/interaction/data-binding schemas+hashes,
  render_node_set/payload/manifest JSON+hashes nullable,
  validated_props/scoped_state/activity/data_snapshot JSON+hashes nullable,
  accessible_summary nullable, content_hash, validation_state,
  created_at, promoted_at nullable

ui_component_interrupts
  id, ui_instance_id, run_id, run_step_id, agent_turn_id,
  logical_thread_id, tool_call_id, session_generation_id,
  action_grant_id, input_schema_hash, state,
  result_redacted_json/hash nullable, continuation_queue_item_id nullable,
  created_at, resolved_by/at nullable, continued_at nullable, stale_at nullable

ui_interactions
  id, ui_instance_id, render_revision, expected_state_revision nullable,
  action_grant_id, render_node_id, handler_key, intent_name,
  payload_redacted_json/hash, interaction_token_hash,
  idempotency_key_hash, token_expires_at, actor_user_id, client_kind,
  state, result_redacted_json/result_ref nullable, created_at, consumed_at nullable
~~~

P0 ActionGrant modes are exactly `local_state`, `server_read`, and `complete_component_interrupt`. The only P0 client kind is `registry`. Controlled props/data/state are retained and hash-bound for deterministic replay.

### P1 experimental forward schema superset

The forward block and constraints below preserve the separately gated P1 iframe design. They are **not** P0 migration requirements. P1-317 must add them through explicit migrations and P1-506 evidence rather than relying on unused P0 columns.

~~~text
ui_components
  id, workspace_id, stable_name, kind,
  current_published_version_id nullable,
  status, created_by, created_at, updated_at

ui_component_versions
  id, component_id, semantic_version,
  exposure, confirmation_policy,
  model_description, argument_schema_json,
  renderer_key, preview_props_json,
  declared_data_functions_json,
  declared_interaction_intents_json,
  source_kind, source_blob_key nullable,
  descriptor_hash, source_hash nullable,
  published_by, published_at, revoked_at nullable

ui_component_grants
  id, component_version_id,
  workspace_id, channel_id nullable, agent_profile_id nullable,
  granted_by, granted_at, revoked_at nullable

ui_data_function_grants
  id, component_version_id, function_name,
  workspace_id, channel_id nullable, agent_profile_id nullable,
  limits_json, granted_by, granted_at, revoked_at nullable

ui_surface_grants
  id, ui_instance_id, grant_kind,
  policy_revision, bound_render_revision nullable,
  bound_manifest_hash nullable,
  rail nullable, data_ref nullable,
  classification nullable, classification_provenance nullable,
  allowed_field_paths_json nullable,
  max_rows nullable, max_bytes nullable,
  snapshot_schema_hash nullable, immutable_snapshot_hash nullable,
  retained_snapshot_blob_key nullable,
  action_ref nullable, handler_key nullable,
  action_mode nullable,
  input_schema_hash nullable, required_action_id nullable,
  allowed_render_node_ids_json nullable,
  allowed_selection_paths_json nullable,
  requires_recent_auth nullable,
  requires_trusted_confirmation nullable,
  linked_data_grant_id nullable, linked_data_ref nullable,
  component_interrupt_id nullable,
  target_coworker_id nullable, intent_template_hash nullable,
  grant_body_redacted_json, grant_scope_hash,
  max_uses nullable, use_count,
  issued_by, expires_at, revoked_at nullable, created_at

ui_instances
  id, workspace_id, channel_id,
  run_id, run_step_id, agent_turn_id,
  logical_thread_id, tool_call_id,
  component_version_id nullable,
  activity_message_id, source_event_id,
  creator_agent_id, title, source_kind,
  producer_context_classification,
  producer_context_provenance_hash,
  render_grant_id, replaces_ui_instance_id nullable,
  current_render_revision nullable,
  last_good_render_revision nullable,
  current_state_revision nullable,
  text_alternative,
  status, created_at, updated_at, ready_at nullable, quarantined_at nullable,
  delivery_security_epoch,
  historical_replay_blocked_at nullable,
  historical_replay_block_reason nullable

ui_instance_revisions
  id, ui_instance_id, revision_kind, revision,
  base_revision nullable,
  component_version_id nullable,
  renderer_version nullable, renderer_profile_hash nullable,
  validator_policy_version, sanitizer_policy_version nullable,
  sanitizer_policy_hash nullable,
  bootstrap_version nullable, bootstrap_hash nullable,
  csp_value nullable, csp_hash nullable,
  permissions_policy_profile_version nullable,
  delivery_headers_json nullable, delivery_headers_hash nullable,
  argument_schema_hash nullable,
  state_schema_json nullable, state_schema_hash nullable,
  behavior_manifest_json nullable, behavior_manifest_hash nullable,
  interaction_manifest_json nullable, interaction_manifest_hash nullable,
  data_binding_manifest_json nullable,
  data_binding_manifest_hash nullable,
  render_node_set_json nullable, render_node_set_hash nullable,
  render_payload_json nullable, render_payload_hash nullable,
  render_manifest_json nullable, manifest_hash nullable,
  validated_props_json nullable,
  scoped_state_json nullable,
  activity_snapshot_json nullable,
  delivery_body_blob_key nullable,
  delivery_body_index_json nullable, delivery_body_index_hash nullable,
  source_hash nullable, delivery_body_hash nullable,
  validated_args_snapshot_blob_key nullable,
  validated_args_hash nullable,
  data_snapshot_manifest_json nullable,
  data_snapshot_manifest_hash nullable,
  accessible_summary nullable, content_hash,
  verifier_profile_version nullable,
  accessibility_result_redacted_json nullable,
  smoke_result_redacted_json nullable,
  verification_evidence_hash nullable,
  validation_state, created_at, promoted_at nullable

ui_component_interrupts
  id, ui_instance_id, run_id, run_step_id, agent_turn_id,
  logical_thread_id, tool_call_id, session_generation_id,
  action_grant_id, input_schema_hash,
  state, result_redacted_json nullable, result_hash nullable,
  continuation_queue_item_id nullable,
  created_at, resolved_by nullable, resolved_at nullable,
  continued_at nullable, stale_at nullable

ui_interactions
  id, ui_instance_id,
  render_revision, expected_state_revision nullable,
  action_grant_id, render_node_id, handler_key, intent_name,
  payload_redacted_json, payload_hash,
  interaction_token_hash nullable, idempotency_key_hash,
  token_expires_at,
  actor_user_id, prepared_auth_session_id, client_kind,
  confirmation_challenge_hash nullable,
  confirmation_summary_redacted_json nullable,
  confirmed_by nullable, confirmed_at nullable,
  state, result_redacted_json nullable,
  canonical_result_ref nullable,
  created_at, consumed_at nullable
~~~

Normative constraints:

- Component stable names are globally unique inside a workspace and reserved prefixes prevent controlled/generated collisions.
- Database unique `(channel_id, agent_profile_id)` permits exactly one stable `channel_agent_sessions` row. Its `logical_agui_thread_id` is immutable and globally unique within the workspace; deletion/recreation cannot reset classification. TrueForge rotation inserts only a generation-history row and never replaces the stable classification record.
- `(component_id, semantic_version)` and each descriptor hash are immutable and unique.
- `exposure` is immutable `agent_tool` or `server_only` and is covered by the descriptor hash. `confirmation_policy` is immutable `none` or `trusted_host`. A server_only version cannot receive an agent component grant, appear in offered tool descriptors or be created by an agent-authored RegistryDocument.
- Component grants are positive, scoped and default deny; absence is never availability.
- Registry publication grants and data-function grants are separate rows. Neither implies a surface RenderGrant, DataGrant, ActionGrant, Composio/tool grant, or external authority.
- `ui_surface_grants` stores the immutable, surface-scoped RenderGrant/DataGrant/ActionGrant contracts from `generative-ui.md`. `grant_kind` is discriminated: render rows name the rail and complete allowlist/limits; data rows name an exact retained redacted snapshot, schema/hash, classification provenance and field paths; action rows name one registered handler/schema and optional existing RequiredAction. Columns for other kinds must be null.
- Action-grant mode columns are closed: server_read requires one same-surface `linked_data_grant_id` plus exact data_ref; complete_component_interrupt requires one same-surface waiting `component_interrupt_id`; request_agent_turn requires the server-selected target coworker/template hash; open_existing_hitl requires one current RequiredAction. Irrelevant mode columns are null. A server_read succeeds only if both independent grants remain valid.
- One render grant is referenced by each UIInstance. Every DataGrant and ActionGrant is bound to the exact promoted render revision and manifest hash before use. Ordinary expiry blocks new data resolution/interactions but may allow exact read-only historical snapshot redelivery under the rule below; a security quarantine or source deletion tombstones historical delivery.
- `context_classification_high_watermark` is the closed ordered enum `synthetic_only < public_safe < restricted_or_unknown`; join is `max`. A synthetic item maps to `synthetic_only`, an explicitly public item to `public_safe`, and `workspace_safe`, private, mixed-with-unclassified, or unknown input to `restricted_or_unknown`. `channel_agent_sessions.iframe_context_eligible` is derived as true only for the first two values and is monotonic for one logical coworker/channel session: it may transition true to false, never false to true. The mark and provenance hash cover retained/compacted history, system/context envelopes, user input, tool results and native-subagent inputs. TrueForge generation rotation copies a false value forward and cannot lower the high-water mark. `iframe_v1` may be created only while the value is true; a narrow current envelope or DataGrant cannot override earlier restricted/unknown context.
- One UIInstance maps to one immutable `tool_call_id` plus activity message ID.
- Each UIInstance persists its trusted host chrome fields (`title`, `source_event_id`, `creator_agent_id`) from server-owned lineage; generated source cannot override them.
- UIInstance `source_kind`/rail is `registry_v1` or `iframe_v1`. Its canonical status is `building`, `ready`, `degraded`, `failed`, `revoked`, or `closed`; streaming/validating/waiting/quarantined labels are projections defined in `contracts/ag-ui.md`, not additional stored states.
- Every UIInstance stores the policy-derived producer-context high-water value and provenance hash from the stable session. iframe_v1 creation requires `synthetic_only` or `public_safe` across the entire classified history and current envelope; a DataGrant cannot override `restricted_or_unknown` producer context.
- Unique `(ui_instance_id, revision_kind, revision)`. `current_render_revision` and `current_state_revision` are null before their first committed revision. A first revision requires `base_revision IS NULL` and its corresponding current pointer null; every later revision requires `base_revision = current pointer`. State updates use compare-and-swap on `current_state_revision`. Render promotion is browser-independent: immutable blobs and trusted hash-bound verifier evidence exist first, then one transaction advances `current_render_revision`/`last_good_render_revision`, stores the final generated-source reference/channel event and sets status. `BOOT/INIT/READY` changes only a browser's local mount.
- A render revision requires and pins the closed `RenderManifestV1` JSON plus its RFC 8785 hash, component/source, render payload/node set, closed state schema, canonical behavior/interaction/data-binding manifests and hashes, argument schema, renderer/bootstrap/sanitizer, validator policy, CSP/Permissions-Policy/delivery-header profiles, validated arguments/data snapshots, accessibility summary, verifier profile, bounded accessibility/smoke results and evidence hash. Every stored subhash must equal the corresponding `RenderManifestV1` field. For iframe_v1, `source_hash` covers the length-framed pre-binding CSS/HTML bytes, `delivery_body_hash` covers the final response after manifest binding and `delivery_body_index_hash` covers the exact extraction ranges, so no hash is circular. The evidence hash binds body/source/index hashes, manifest, renderer, sanitizer, bootstrap, CSP and delivery-header hashes. Data/ActionGrant `bound_manifest_hash` and interaction token checks compare this stored canonical hash directly; they never trust or reparse a grant/source at use time. A state revision requires all render-only manifest/source/component/bootstrap/verifier/header fields to be null and contains only scoped state/activity projection plus its content/policy hashes. Publish immutable blobs first, then commit the revision, current pointers and channel event in one transaction.
- `render_payload_json` is required for registry_v1 and null for iframe_v1 so it cannot duplicate generated CSS/HTML. Iframe replay reconstructs the canonical render-payload preimage only from revision metadata/accessibility summary plus the verified CSS/HTML byte ranges in the retained final body. `render_node_set_json` is required for both rails and contains identifiers/types/hierarchy only.
- `accessible_summary` is required for render revisions and null for state revisions. `delivery_security_epoch` increments on quarantine, integrity/canary failure or source/legal deletion; every member render capability binds the epoch and redemption rejects a stale epoch even if the capability has not expired.
- Complete controlled props validate before storage. Open-generated source validates and hashes before status becomes `ready`; replay verifies every pinned hash and falls back to inert text if an exact renderer/security profile is unavailable.
- Generated delivery-body blobs are untrusted data, never executable server code. Canonical event storage keeps only the server-side UI render-revision reference plus hashes; materialized browser AG-UI JSON contains neither that internal reference nor a blob key/capability and never duplicates raw generated HTML/CSS. P1 per-response generated source does not create a reusable registry version.
- For iframe_v1, `validated_args_snapshot_blob_key` excludes CSS, HTML, behavior/source fragments and stores only normalized non-source parameters/references plus hashes. The publisher hashes the sanitized pre-binding source in memory, injects the fixed manifest binding and durably stores only the final content-addressed HTTP body under `delivery_body_blob_key`; replay serves those exact bytes after validating `delivery_body_index_json/hash`, extracting the indexed canonical CSS/HTML ranges and verifying both `source_hash` and `delivery_body_hash`. Staging/pre-binding copies follow the short-TTL deletion rule and are destroyed after publication.
- Interaction tokens—not iframe mount nonces—are single-use and bound to user, channel, instance, render revision, render node, ActionGrant, payload hash and expiry. `render_node_id` has no foreign key to registry `ui_components.id`; it is the exact node ID covered by the render manifest and ActionGrant. Idempotency uniqueness is enforced per action scope.
- Token consume atomically checks `token_expires_at`, unconsumed state, current grant/policy and increments the ActionGrant use count; an expired token never dispatches a handler.
- Stored interaction state is the closed set `prepared`, `token_issued`, `awaiting_confirmation`, `confirmed`, `dispatching`, `succeeded`, `failed`, `denied`, `stale`. A trusted-confirmation interaction starts `awaiting_confirmation` with the preparing `auth_sessions.id`, challenge hash and immutable normalized summary; it has no browser-visible dispatch token. The explicit host confirm requires that same still-valid auth session, records `confirmed_by`/`confirmed_at`, internally mints/consumes a confirmation-bound token and enqueues once atomically. Only `token_issued` ordinary interactions may expose an interaction token; cancel/expiry cannot dispatch.
- `ui_component_interrupts` are application-owned and distinct from PauseGroups. One exists per interactive component tool call. CAS `waiting → resolved` persists one bounded result and one `component_interaction_response` queue item for the same RunStep/logical thread/session generation; processing moves it to `continued`. Stale generation/grant or duplicate results cannot enqueue. No generic UI endpoint writes PauseGroup/PauseResume rows.
- Historical instances pin their renderer/component/source version. Ordinary grant expiry/revocation blocks new resolution and calls but permits current channel members to redeliver the exact committed public/synthetic snapshot read-only with no interactions. `historical_replay_blocked_at` is mandatory for security quarantine, hash/integrity failure, source/legal deletion or credential-canary detection and prevents document/data redelivery entirely.

Controlled versions are checked-in React renderers. Reusable runtime-authored component drafts/publishing and the open-generated iframe rail are P1.

## Required actions and approvals

~~~text
pause_groups
  id, agent_turn_id, trueforge_turn_id,
  generation, state, required_action_count,
  resolved_action_count, resume_claim_token nullable,
  created_at, ready_at, resumed_at

required_actions
  id, pause_group_id, provider_action_id,
  action_type, state, payload_redacted_json,
  payload_hash, response_ciphertext nullable,
  response_redacted_json nullable,
  resolved_by nullable, resolved_at, created_at

pause_resumes
  id, pause_group_id, expected_generation,
  application_run_token, response_payload_hash,
  response_payload_ciphertext, state,
  trueforge_resume_turn_id nullable,
  claimed_by, created_at, completed_at

action_proposals
  id, required_action_id, run_id, run_step_id, agent_turn_id,
  thread_id nullable, tool_call_id,
  session_generation_id, approval_policy_hash,
  connector_binding_id, tool_name, observed_descriptor_hash,
  acting_identity_json, normalized_arguments_redacted_json,
  arguments_hash, target_redacted_json, target_hash,
  artifact_revision_hash nullable,
  risk_class, expected_effect, state, expires_at,
  provider_idempotency_key nullable,
  decided_by nullable, decision_reason nullable, decided_at,
  executed_at, provider_receipt_json nullable

questions
  id, required_action_id, channel_id, run_id,
  prompt_redacted_json, prompt_hash,
  state, answered_by nullable,
  answer_ciphertext nullable, answer_redacted_json nullable,
  answered_at, expires_at
~~~

Required constraints:

- One PauseGroup per paused TrueForge turn.
- One RequiredAction per `(pause_group_id, provider_action_id)`.
- One PauseResume per PauseGroup.
- One ActionProposal or Question per RequiredAction as appropriate.
- PauseGroup compare-and-swap and PauseResume insertion occur in one transaction.
- Approval decision is single-assignment; concurrent allow/deny cannot both win.
- ActionProposal execution revalidates the exact session generation, approval policy hash, target hash, arguments hash, connector binding and descriptor hash persisted at proposal creation. A generic UI interaction cannot create this row; only ingestion of an existing TrueForge RequiredAction/tool call may do so.

Canonical tool arguments are hashed in memory. Store only policy-adapter-approved redacted fields. Pending answer and resume ciphertext is encrypted at rest, access-restricted and deleted after the short recovery retention window.

## Artifacts and audit

~~~text
artifacts
  id, workspace_id, channel_id, run_id, run_step_id,
  creator_agent_id, kind, name, mime_type,
  storage_key, byte_size, sha256,
  source_sandbox_id, source_sandbox_path,
  revision, metadata_json, created_at

audit_events
  id, workspace_id, channel_id,
  actor_type, actor_id, action,
  target_type, target_id,
  redacted_payload_json, payload_hash,
  created_at
~~~

Artifacts are immutable by revision and content-addressed where supported. AuditEvents are append-only application history, not a claim of cryptographic tamper evidence.

## State machines

### Run

~~~text
lifecycle: queued → active → completed | partial | failed | cancelled

derived active counters:
  planning
  running
  awaiting_input
  awaiting_approval
  blocked_connection
  cancelling
  queued
~~~

A Run may be running and awaiting approval simultaneously. Return lifecycle and all counters; do not force concurrent children into one linear status.

### RunStep

~~~text
queued → acquiring_session → running
running → awaiting_input | awaiting_approval | blocked_connection
running → cancelling → cancelled | completed | failed | unknown
running → completed | failed | cancelled
awaiting_* → running | cancelling | failed | cancelled
blocked_connection → queued | cancelling | failed | cancelled
~~~

### AgentTurn

~~~text
intended → acquiring → creating → streaming
streaming → required_actions | completed | failed | cancelled | uncertain
required-action resume: intended → resuming → streaming
~~~

`required_actions` is terminal for that AgentTurn but nonterminal for its RunStep.

### PauseGroup

~~~text
collecting → ready → resuming → resumed
collecting | ready → stale | expired | cancelled
resuming → uncertain | resumed
~~~

### ActionProposal

~~~text
proposed → allowed | denied | expired | stale
allowed → executing
executing → succeeded | failed | unknown
unknown → reconciled_succeeded | reconciled_failed
~~~

### Connector

~~~text
unconfigured → connecting → active
active → expired | revoked | drifted
expired → connecting
~~~

### UIInstance

~~~text
building → ready | degraded | failed | revoked | closed
ready → degraded | failed | revoked | closed
degraded → ready | failed | revoked | closed
failed → closed
revoked → closed
~~~

`building` includes offered/streaming/validating projections; incomplete source is never authoritative or renderable. Revocation/channel closure during building cancels promotion, invalidates any source capability/mount and retains only policy-required hashes. Waiting for an interaction remains stored `ready` and is represented in pendingHumanActions. Quarantine projects to `degraded`. `ready` requires complete ordered fields, schema/source/data/profile hash validation and a persisted replay revision.

### CoworkerDraft

~~~text
draft → awaiting_review → confirmed → provisioning → ready
draft | awaiting_review → superseded | expired | rejected
provisioning → ready | failed_provisioning → provisioning
~~~

Draft states confer no authority. Only one revision-bound confirmation may create/provision.

### Task

~~~text
todo → in_progress | blocked | cancelled
in_progress → blocked | in_review | done | cancelled
blocked → in_progress | cancelled
in_review → in_progress | done | cancelled
~~~

Transition grants and expected revision are checked atomically.

### SkillVersion and binding

~~~text
draft → published
binding: active → detached | blocked
~~~

Published versions are immutable. P0 supports publication plus attach/detach/block on lost authority. P1 adds upgrade, deprecate, revoke, archive and invocation lineage while retaining the exact historical version ID/hash.

## Data retention

- Normalized channel and audit history: retained for the 0.1 workspace lifetime.
- Validated AG-UI events, UIInstance revisions and hashes: retained with channel history.
- P1 open-generated source, incomplete-staging and iframe-capability retention follow the detailed rail contract; P0 creates none of those objects.
- Consumed controlled-UI interaction idempotency hashes and redacted payload hashes are retained for replay protection. Sensitive transient answers follow the same short encrypted retention as questions.
- Raw provider payloads: not stored by ForgeRoom.
- P1 raw generated-source body tracing is disabled in application-controlled ingress/logging/telemetry. P0 has no generated-source ingress.
- Pending encrypted question/resume payload: delete after confirmed terminal turn plus short recovery window.
- Retired session metadata and hashes: retained for audit history.
- Provider credentials and opaque MCP headers: secret store only, never database JSON or browser.
