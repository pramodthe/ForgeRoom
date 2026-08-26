-- ForgeRoom P0 foundation schema.
-- Controlled registry rail only. Generated-document tables and columns are a later migration.

CREATE FUNCTION forgeroom_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE FUNCTION forgeroom_coworker_drafts_protect_body()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.proposal_json IS DISTINCT FROM OLD.proposal_json
    OR NEW.effective_preview_json IS DISTINCT FROM OLD.effective_preview_json
    OR NEW.draft_hash IS DISTINCT FROM OLD.draft_hash
    OR NEW.revision IS DISTINCT FROM OLD.revision
    OR NEW.source_text_encrypted IS DISTINCT FROM OLD.source_text_encrypted
    OR NEW.policy_revision IS DISTINCT FROM OLD.policy_revision
    OR NEW.catalog_revision IS DISTINCT FROM OLD.catalog_revision
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'coworker_drafts proposal body is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION forgeroom_session_generations_protect_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.channel_agent_session_id IS DISTINCT FROM OLD.channel_agent_session_id
    OR NEW.generation IS DISTINCT FROM OLD.generation
    OR NEW.agent_version_id IS DISTINCT FROM OLD.agent_version_id
    OR NEW.session_revision_id IS DISTINCT FROM OLD.session_revision_id
    OR NEW.trueforge_session_id IS DISTINCT FROM OLD.trueforge_session_id
    OR NEW.effective_spec_hash IS DISTINCT FROM OLD.effective_spec_hash
    OR NEW.approval_policy_hash IS DISTINCT FROM OLD.approval_policy_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'channel_agent_session_generations history is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.retired_at IS NOT NULL
    AND (
      NEW.state IS DISTINCT FROM OLD.state
      OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
    )
  THEN
    RAISE EXCEPTION 'retired channel_agent_session_generations cannot be reopened'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION forgeroom_current_generation_is_live()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  generation_session_id text;
  generation_state text;
  generation_retired_at timestamptz;
BEGIN
  IF NEW.current_generation_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT channel_agent_session_id, state, retired_at
    INTO generation_session_id, generation_state, generation_retired_at
    FROM channel_agent_session_generations
    WHERE id = NEW.current_generation_id
    FOR UPDATE;
  IF generation_session_id IS NULL THEN
    RAISE EXCEPTION 'current_generation_id must reference a generation row'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF generation_session_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'current_generation_id must belong to the same stable session'
      USING ERRCODE = 'check_violation';
  END IF;
  IF generation_state NOT IN ('ready', 'rotating') OR generation_retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'current_generation_id must point at a live generation'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION forgeroom_generation_cannot_invalidate_current()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.state NOT IN ('ready', 'rotating') OR NEW.retired_at IS NOT NULL)
    AND EXISTS (
      SELECT 1
      FROM channel_agent_sessions
      WHERE current_generation_id = OLD.id
    )
  THEN
    RAISE EXCEPTION 'current generation must be replaced before it is retired or failed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION forgeroom_action_proposals_protect()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    to_jsonb(NEW) - ARRAY[
      'state',
      'provider_idempotency_key',
      'decided_by',
      'decision_reason',
      'decided_at',
      'executed_at',
      'provider_receipt_json'
    ]
  ) IS DISTINCT FROM (
    to_jsonb(OLD) - ARRAY[
      'state',
      'provider_idempotency_key',
      'decided_by',
      'decision_reason',
      'decided_at',
      'executed_at',
      'provider_receipt_json'
    ]
  )
  THEN
    RAISE EXCEPTION 'action_proposals approval authority is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state
    AND NOT (
      (OLD.state = 'proposed' AND NEW.state IN ('allowed', 'denied', 'expired', 'stale'))
      OR (OLD.state = 'allowed' AND NEW.state = 'executing')
      OR (OLD.state = 'executing' AND NEW.state IN ('succeeded', 'failed', 'unknown'))
      OR (OLD.state = 'unknown' AND NEW.state IN ('reconciled_succeeded', 'reconciled_failed'))
    )
  THEN
    RAISE EXCEPTION 'action_proposals decision and execution state cannot be reassigned'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.state <> 'proposed'
    AND (
      NEW.decided_by IS DISTINCT FROM OLD.decided_by
      OR NEW.decision_reason IS DISTINCT FROM OLD.decision_reason
      OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
    )
  THEN
    RAISE EXCEPTION 'action_proposals decision is single-assignment'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.provider_idempotency_key IS NOT NULL
    AND NEW.provider_idempotency_key IS DISTINCT FROM OLD.provider_idempotency_key
  THEN
    RAISE EXCEPTION 'action_proposals provider idempotency binding is single-assignment'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION forgeroom_ui_surface_grants_protect()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['use_count', 'revoked_at'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['use_count', 'revoked_at'])
  THEN
    RAISE EXCEPTION 'ui_surface_grants authority is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.use_count < OLD.use_count THEN
    RAISE EXCEPTION 'ui_surface_grants use_count cannot decrease'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'ui_surface_grants revocation is single-assignment'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  workspace_id text NOT NULL REFERENCES workspaces (id),
  user_id text NOT NULL REFERENCES users (id),
  role text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'member')),
  CONSTRAINT memberships_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id),
  secret_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_profiles (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  handle text NOT NULL,
  name text NOT NULL,
  title text NOT NULL,
  avatar_seed text,
  visibility text NOT NULL,
  status text NOT NULL,
  editable_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_version_id text,
  config_revision integer NOT NULL DEFAULT 0,
  native_subagents_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_profiles_handle_unique UNIQUE (workspace_id, handle),
  CONSTRAINT agent_profiles_visibility_check CHECK (visibility IN ('workspace')),
  CONSTRAINT agent_profiles_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT agent_profiles_revision_check CHECK (config_revision >= 0),
  CONSTRAINT agent_profiles_native_subagents_off CHECK (native_subagents_enabled = false)
);

CREATE TABLE agent_versions (
  id text PRIMARY KEY,
  agent_profile_id text NOT NULL REFERENCES agent_profiles (id),
  version integer NOT NULL,
  config_json jsonb NOT NULL,
  spec_hash text NOT NULL,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_versions_unique UNIQUE (agent_profile_id, version),
  CONSTRAINT agent_versions_version_check CHECK (version >= 1)
);

ALTER TABLE agent_profiles
  ADD CONSTRAINT agent_profiles_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES agent_versions (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE coworker_drafts (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  source_text_encrypted text NOT NULL,
  proposal_json jsonb NOT NULL,
  effective_preview_json jsonb NOT NULL,
  draft_hash text NOT NULL,
  revision integer NOT NULL,
  policy_revision integer NOT NULL,
  catalog_revision integer NOT NULL,
  state text NOT NULL,
  created_by text NOT NULL REFERENCES users (id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT coworker_drafts_revision_check CHECK (revision >= 1),
  CONSTRAINT coworker_drafts_policy_check CHECK (policy_revision >= 0 AND catalog_revision >= 0),
  CONSTRAINT coworker_drafts_state_check CHECK (
    state IN (
      'draft',
      'awaiting_review',
      'confirmed',
      'provisioning',
      'ready',
      'superseded',
      'expired',
      'rejected',
      'failed_provisioning'
    )
  )
);

CREATE UNIQUE INDEX coworker_drafts_workspace_hash_revision_uidx
  ON coworker_drafts (workspace_id, draft_hash, revision);

CREATE TRIGGER coworker_drafts_protect_body
  BEFORE UPDATE ON coworker_drafts
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_coworker_drafts_protect_body();

CREATE TABLE session_revisions (
  id text PRIMARY KEY,
  agent_profile_id text NOT NULL REFERENCES agent_profiles (id),
  source_config_revision integer NOT NULL,
  effective_config_redacted_json jsonb NOT NULL,
  effective_spec_hash text NOT NULL,
  approval_policy_hash text NOT NULL,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_revisions_source_check CHECK (source_config_revision >= 0),
  CONSTRAINT session_revisions_unique UNIQUE (agent_profile_id, source_config_revision)
);

CREATE TABLE skills (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  stable_name text NOT NULL,
  display_name text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users (id),
  visibility text NOT NULL,
  status text NOT NULL,
  current_version_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_stable_name_unique UNIQUE (workspace_id, stable_name),
  CONSTRAINT skills_visibility_check CHECK (visibility IN ('private')),
  CONSTRAINT skills_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE skill_versions (
  id text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES skills (id),
  version integer NOT NULL,
  state text NOT NULL,
  manifest_json jsonb NOT NULL,
  manifest_hash text NOT NULL,
  skill_markdown_blob_key text NOT NULL,
  content_hash text NOT NULL,
  source_run_id text,
  source_step_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT skill_versions_unique UNIQUE (skill_id, version),
  CONSTRAINT skill_versions_version_check CHECK (version >= 1),
  CONSTRAINT skill_versions_state_check CHECK (state IN ('draft', 'published')),
  CONSTRAINT skill_versions_published_check CHECK (
    (state = 'draft' AND published_at IS NULL)
    OR (state = 'published' AND published_at IS NOT NULL)
  )
);

ALTER TABLE skills
  ADD CONSTRAINT skills_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES skill_versions (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE agent_skill_bindings (
  id text PRIMARY KEY,
  agent_profile_id text NOT NULL REFERENCES agent_profiles (id),
  agent_version_id text NOT NULL REFERENCES agent_versions (id),
  skill_version_id text NOT NULL REFERENCES skill_versions (id),
  state text NOT NULL,
  attached_by text NOT NULL REFERENCES users (id),
  attached_at timestamptz NOT NULL DEFAULT now(),
  detached_at timestamptz,
  CONSTRAINT agent_skill_bindings_state_check CHECK (state IN ('active', 'detached', 'blocked')),
  CONSTRAINT agent_skill_bindings_detached_check CHECK (
    (state = 'active' AND detached_at IS NULL)
    OR (state <> 'active')
  )
);

CREATE UNIQUE INDEX agent_skill_bindings_active_uidx
  ON agent_skill_bindings (agent_profile_id, skill_version_id)
  WHERE state = 'active';

CREATE TABLE channels (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  name text NOT NULL,
  mission_brief text NOT NULL DEFAULT '',
  summary text,
  policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_sequence integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channels_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT channels_next_sequence_check CHECK (next_sequence >= 0)
);

CREATE TABLE channel_participants (
  channel_id text NOT NULL REFERENCES channels (id),
  participant_type text NOT NULL,
  participant_id text NOT NULL,
  role text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (channel_id, participant_type, participant_id),
  CONSTRAINT channel_participants_type_check CHECK (participant_type IN ('human', 'coworker')),
  CONSTRAINT channel_participants_role_check CHECK (role IN ('owner', 'member', 'coworker'))
);

CREATE TABLE channel_events (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels (id),
  sequence integer NOT NULL,
  type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  run_id text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  agui_event_type text,
  agui_event_json jsonb,
  logical_thread_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_events_sequence_check CHECK (sequence >= 0),
  CONSTRAINT channel_events_actor_check CHECK (actor_type IN ('human', 'coworker', 'system')),
  CONSTRAINT channel_events_channel_sequence_uidx UNIQUE (channel_id, sequence)
);

CREATE TRIGGER channel_events_append_only
  BEFORE UPDATE OR DELETE ON channel_events
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();

CREATE TABLE messages (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels (id),
  event_id text NOT NULL UNIQUE REFERENCES channel_events (id),
  author_type text NOT NULL,
  author_id text NOT NULL,
  body text NOT NULL,
  parent_message_id text REFERENCES messages (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_author_check CHECK (author_type IN ('human', 'coworker', 'system'))
);

CREATE TABLE channel_pins (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels (id),
  source_event_id text REFERENCES channel_events (id),
  source_artifact_id text,
  label text NOT NULL,
  pinned_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);

CREATE TABLE tasks (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text NOT NULL REFERENCES channels (id),
  title text NOT NULL,
  description text,
  status text NOT NULL,
  assignee_type text,
  assignee_id text,
  source_message_id text REFERENCES messages (id),
  source_run_id text,
  due_at timestamptz,
  current_revision integer NOT NULL,
  created_by_type text NOT NULL,
  created_by_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_status_check CHECK (
    status IN ('todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled')
  ),
  CONSTRAINT tasks_revision_check CHECK (current_revision >= 1),
  CONSTRAINT tasks_created_by_check CHECK (created_by_type IN ('human', 'coworker')),
  CONSTRAINT tasks_assignee_check CHECK (
    (assignee_type IS NULL AND assignee_id IS NULL)
    OR (assignee_type IN ('human', 'coworker') AND assignee_id IS NOT NULL)
  )
);

CREATE TABLE task_revisions (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks (id),
  revision integer NOT NULL,
  data_json jsonb NOT NULL,
  data_hash text NOT NULL,
  changed_fields_json jsonb NOT NULL,
  source_manifest_json jsonb,
  source_manifest_hash text,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  command_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_revisions_unique UNIQUE (task_id, revision),
  CONSTRAINT task_revisions_revision_check CHECK (revision >= 1),
  CONSTRAINT task_revisions_actor_check CHECK (actor_type IN ('human', 'coworker'))
);

CREATE TRIGGER task_revisions_append_only
  BEFORE UPDATE OR DELETE ON task_revisions
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();

CREATE TABLE task_grants (
  id text PRIMARY KEY,
  task_id text REFERENCES tasks (id),
  channel_id text NOT NULL REFERENCES channels (id),
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  allowed_operations_json jsonb NOT NULL,
  allowed_fields_json jsonb NOT NULL,
  allowed_transitions_json jsonb NOT NULL,
  policy_revision integer NOT NULL,
  granted_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT task_grants_subject_check CHECK (subject_type IN ('human', 'coworker')),
  CONSTRAINT task_grants_policy_check CHECK (policy_revision >= 0)
);

CREATE TABLE workspace_command_receipts (
  workspace_id text NOT NULL REFERENCES workspaces (id),
  command_kind text NOT NULL,
  idempotency_key text NOT NULL,
  result_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, command_kind, idempotency_key)
);

CREATE TABLE channel_agent_sessions (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels (id),
  agent_profile_id text NOT NULL REFERENCES agent_profiles (id),
  logical_agui_thread_id text NOT NULL,
  current_generation_id text,
  last_delivered_channel_sequence integer NOT NULL DEFAULT 0,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_agent_sessions_pair_uidx UNIQUE (channel_id, agent_profile_id),
  CONSTRAINT channel_agent_sessions_thread_uidx UNIQUE (logical_agui_thread_id),
  CONSTRAINT channel_agent_sessions_state_check CHECK (state IN ('active', 'rotating', 'disabled')),
  CONSTRAINT channel_agent_sessions_sequence_check CHECK (last_delivered_channel_sequence >= 0)
);

CREATE TABLE channel_agent_session_generations (
  id text PRIMARY KEY,
  channel_agent_session_id text NOT NULL REFERENCES channel_agent_sessions (id),
  generation integer NOT NULL,
  agent_version_id text REFERENCES agent_versions (id),
  session_revision_id text NOT NULL REFERENCES session_revisions (id),
  trueforge_session_id text NOT NULL,
  effective_spec_hash text NOT NULL,
  approval_policy_hash text NOT NULL,
  active_turn_id text,
  state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CONSTRAINT channel_agent_session_generations_unique UNIQUE (channel_agent_session_id, generation),
  CONSTRAINT channel_agent_session_generations_id_session_uidx UNIQUE (id, channel_agent_session_id),
  CONSTRAINT channel_agent_session_generations_trueforge_uidx UNIQUE (trueforge_session_id),
  CONSTRAINT channel_agent_session_generations_generation_check CHECK (generation >= 1),
  CONSTRAINT channel_agent_session_generations_state_check CHECK (
    state IN ('provisioning', 'ready', 'rotating', 'retired', 'failed')
  ),
  CONSTRAINT channel_agent_session_generations_retirement_check CHECK (
    (state = 'retired') = (retired_at IS NOT NULL)
  )
);

ALTER TABLE channel_agent_sessions
  ADD CONSTRAINT channel_agent_sessions_current_generation_owner_fk
  FOREIGN KEY (current_generation_id, id)
  REFERENCES channel_agent_session_generations (id, channel_agent_session_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TRIGGER channel_agent_sessions_current_generation_live
  BEFORE INSERT OR UPDATE OF current_generation_id ON channel_agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_current_generation_is_live();

CREATE TRIGGER channel_agent_session_generations_protect_history
  BEFORE UPDATE ON channel_agent_session_generations
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_session_generations_protect_history();

CREATE TRIGGER channel_agent_session_generations_keep_current_live
  BEFORE UPDATE OF state, retired_at ON channel_agent_session_generations
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_generation_cannot_invalidate_current();

CREATE TRIGGER channel_agent_session_generations_no_delete
  BEFORE DELETE ON channel_agent_session_generations
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();

CREATE TABLE runs (
  id text PRIMARY KEY,
  channel_id text NOT NULL REFERENCES channels (id),
  source_message_id text NOT NULL REFERENCES messages (id),
  requested_by text NOT NULL REFERENCES users (id),
  routing_mode text NOT NULL,
  goal text NOT NULL,
  lifecycle text NOT NULL,
  scheduling_paused boolean NOT NULL DEFAULT false,
  budget_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT runs_routing_check CHECK (routing_mode IN ('direct', 'team')),
  CONSTRAINT runs_lifecycle_check CHECK (
    lifecycle IN ('queued', 'active', 'completed', 'partial', 'failed', 'cancelled')
  )
);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_source_run_fk
  FOREIGN KEY (source_run_id) REFERENCES runs (id);

ALTER TABLE skill_versions
  ADD CONSTRAINT skill_versions_source_run_fk
  FOREIGN KEY (source_run_id) REFERENCES runs (id);

ALTER TABLE channel_events
  ADD CONSTRAINT channel_events_run_fk
  FOREIGN KEY (run_id) REFERENCES runs (id);

CREATE TABLE run_steps (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES runs (id),
  assigned_agent_id text NOT NULL REFERENCES agent_profiles (id),
  objective text NOT NULL,
  expected_output text,
  context_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  state text NOT NULL,
  attempt integer NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT run_steps_attempt_check CHECK (attempt >= 1),
  CONSTRAINT run_steps_state_check CHECK (
    state IN (
      'queued',
      'acquiring_session',
      'running',
      'awaiting_input',
      'awaiting_approval',
      'blocked_connection',
      'cancelling',
      'cancelled',
      'completed',
      'failed',
      'unknown'
    )
  )
);

CREATE TABLE turn_queue_items (
  id text PRIMARY KEY,
  channel_agent_session_id text NOT NULL REFERENCES channel_agent_sessions (id),
  run_step_id text NOT NULL REFERENCES run_steps (id),
  bound_session_generation_id text REFERENCES channel_agent_session_generations (id),
  input_type text NOT NULL,
  input_payload_redacted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 0,
  fifo_sequence integer NOT NULL,
  state text NOT NULL,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT turn_queue_items_fifo_uidx UNIQUE (channel_agent_session_id, fifo_sequence),
  CONSTRAINT turn_queue_items_turn_binding_uidx UNIQUE (
    id,
    channel_agent_session_id,
    bound_session_generation_id,
    run_step_id,
    input_type
  ),
  CONSTRAINT turn_queue_items_fifo_check CHECK (fifo_sequence >= 0),
  CONSTRAINT turn_queue_items_input_type_check CHECK (
    input_type IN (
      'normal',
      'pause_group_response',
      'component_interaction_response',
      'correction'
    )
  ),
  CONSTRAINT turn_queue_items_state_check CHECK (
    state IN ('queued', 'claimed', 'completed', 'cancelled', 'failed')
  ),
  CONSTRAINT turn_queue_items_bound_generation_check CHECK (
    bound_session_generation_id IS NOT NULL OR (input_type = 'normal' AND state = 'queued')
  ),
  CONSTRAINT turn_queue_items_bound_generation_owner_fk FOREIGN KEY (
    bound_session_generation_id,
    channel_agent_session_id
  ) REFERENCES channel_agent_session_generations (id, channel_agent_session_id)
);

CREATE TABLE agent_turns (
  id text PRIMARY KEY,
  run_step_id text NOT NULL REFERENCES run_steps (id),
  channel_agent_session_id text NOT NULL REFERENCES channel_agent_sessions (id),
  session_generation_id text NOT NULL REFERENCES channel_agent_session_generations (id),
  queue_item_id text NOT NULL REFERENCES turn_queue_items (id),
  application_run_token text NOT NULL,
  trueforge_turn_id text,
  agui_run_id text NOT NULL,
  previous_trueforge_turn_id text,
  input_type text NOT NULL,
  last_trueforge_sequence integer NOT NULL DEFAULT 0,
  context_through_channel_sequence integer NOT NULL DEFAULT 0,
  state text NOT NULL,
  error_json jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT agent_turns_agui_run_uidx UNIQUE (channel_agent_session_id, agui_run_id),
  CONSTRAINT agent_turns_application_token_uidx UNIQUE (application_run_token),
  CONSTRAINT agent_turns_input_type_check CHECK (
    input_type IN (
      'normal',
      'pause_group_response',
      'component_interaction_response',
      'correction'
    )
  ),
  CONSTRAINT agent_turns_state_check CHECK (
    state IN (
      'intended',
      'acquiring',
      'creating',
      'streaming',
      'required_actions',
      'resuming',
      'completed',
      'failed',
      'cancelled',
      'uncertain'
    )
  ),
  CONSTRAINT agent_turns_sequence_check CHECK (
    last_trueforge_sequence >= 0 AND context_through_channel_sequence >= 0
  ),
  CONSTRAINT agent_turns_generation_session_fk FOREIGN KEY (
    session_generation_id,
    channel_agent_session_id
  ) REFERENCES channel_agent_session_generations (id, channel_agent_session_id),
  CONSTRAINT agent_turns_queue_binding_fk FOREIGN KEY (
    queue_item_id,
    channel_agent_session_id,
    session_generation_id,
    run_step_id,
    input_type
  ) REFERENCES turn_queue_items (
    id,
    channel_agent_session_id,
    bound_session_generation_id,
    run_step_id,
    input_type
  )
);

CREATE UNIQUE INDEX agent_turns_remote_active_uidx
  ON agent_turns (channel_agent_session_id)
  WHERE state IN ('acquiring', 'creating', 'streaming', 'resuming');

ALTER TABLE channel_agent_session_generations
  ADD CONSTRAINT channel_agent_session_generations_active_turn_fk
  FOREIGN KEY (active_turn_id) REFERENCES agent_turns (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE run_events (
  id text PRIMARY KEY,
  agent_turn_id text NOT NULL REFERENCES agent_turns (id),
  trueforge_event_id text NOT NULL,
  thread_id text,
  normalized_payload_redacted_json jsonb NOT NULL,
  normalized_type text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT run_events_trueforge_uidx UNIQUE (agent_turn_id, trueforge_event_id)
);

CREATE TABLE agui_event_records (
  id text PRIMARY KEY,
  channel_event_id text NOT NULL UNIQUE REFERENCES channel_events (id),
  agent_turn_id text REFERENCES agent_turns (id),
  logical_thread_id text,
  agui_run_id text,
  event_type text NOT NULL,
  message_or_activity_id text,
  storage_kind text NOT NULL,
  event_json jsonb,
  schema_profile text NOT NULL,
  event_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agui_event_records_storage_kind_check CHECK (storage_kind = 'full_event'),
  CONSTRAINT agui_event_records_full_event_check CHECK (event_json IS NOT NULL)
);

CREATE TABLE connector_bindings (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  provider text NOT NULL,
  credential_owner_type text NOT NULL,
  credential_owner_id text NOT NULL,
  composio_user_id text,
  composio_session_id text,
  trueforge_connector_name text NOT NULL,
  config_version integer NOT NULL,
  config_hash text NOT NULL,
  allowed_tools_json jsonb NOT NULL,
  acting_identity_json jsonb NOT NULL,
  status text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_bindings_owner_check CHECK (credential_owner_type IN ('workspace', 'user')),
  CONSTRAINT connector_bindings_version_check CHECK (config_version >= 1),
  CONSTRAINT connector_bindings_status_check CHECK (
    status IN ('unconfigured', 'connecting', 'active', 'expired', 'revoked', 'drifted')
  )
);

CREATE TABLE tool_grants (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text NOT NULL REFERENCES channels (id),
  agent_profile_id text NOT NULL REFERENCES agent_profiles (id),
  connector_binding_id text NOT NULL REFERENCES connector_bindings (id),
  tool_name text NOT NULL,
  classification text NOT NULL,
  approval_policy text NOT NULL,
  observed_descriptor_hash text NOT NULL,
  tool_policy_key text NOT NULL,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT tool_grants_classification_check CHECK (classification IN ('read', 'write')),
  CONSTRAINT tool_grants_approval_check CHECK (approval_policy IN ('none', 'required'))
);

CREATE UNIQUE INDEX tool_grants_active_uidx
  ON tool_grants (agent_profile_id, channel_id, tool_name)
  WHERE revoked_at IS NULL;

CREATE TABLE ui_components (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  stable_name text NOT NULL,
  kind text NOT NULL,
  current_published_version_id text,
  status text NOT NULL,
  created_by text NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_components_stable_name_uidx UNIQUE (workspace_id, stable_name),
  CONSTRAINT ui_components_kind_check CHECK (
    kind IN (
      'metric',
      'table',
      'chart',
      'graph',
      'timeline',
      'image',
      'report',
      'form',
      'hitl',
      'composite'
    )
  ),
  CONSTRAINT ui_components_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE ui_component_versions (
  id text PRIMARY KEY,
  component_id text NOT NULL REFERENCES ui_components (id),
  semantic_version text NOT NULL,
  exposure text NOT NULL,
  confirmation_policy text NOT NULL,
  model_description text NOT NULL,
  argument_schema_json jsonb NOT NULL,
  renderer_key text NOT NULL,
  preview_props_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  declared_data_functions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  declared_interaction_intents_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  descriptor_hash text NOT NULL,
  published_by text NOT NULL REFERENCES users (id),
  published_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT ui_component_versions_semver_uidx UNIQUE (component_id, semantic_version),
  CONSTRAINT ui_component_versions_descriptor_uidx UNIQUE (descriptor_hash),
  CONSTRAINT ui_component_versions_exposure_check CHECK (exposure IN ('agent_tool', 'server_only')),
  CONSTRAINT ui_component_versions_confirmation_check CHECK (confirmation_policy IN ('none', 'trusted_host')),
  CONSTRAINT ui_component_versions_exposure_policy_check CHECK (
    (exposure = 'agent_tool' AND confirmation_policy = 'none')
    OR (exposure = 'server_only' AND confirmation_policy = 'trusted_host')
  )
);

ALTER TABLE ui_components
  ADD CONSTRAINT ui_components_current_published_version_fk
  FOREIGN KEY (current_published_version_id) REFERENCES ui_component_versions (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE ui_component_grants (
  id text PRIMARY KEY,
  component_version_id text NOT NULL REFERENCES ui_component_versions (id),
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text REFERENCES channels (id),
  agent_profile_id text REFERENCES agent_profiles (id),
  granted_by text NOT NULL REFERENCES users (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX ui_component_grants_active_uidx
  ON ui_component_grants (
    component_version_id,
    workspace_id,
    COALESCE(channel_id, ''),
    COALESCE(agent_profile_id, '')
  )
  WHERE revoked_at IS NULL;

CREATE TABLE ui_data_function_grants (
  id text PRIMARY KEY,
  component_version_id text NOT NULL REFERENCES ui_component_versions (id),
  function_name text NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text REFERENCES channels (id),
  agent_profile_id text REFERENCES agent_profiles (id),
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_by text NOT NULL REFERENCES users (id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX ui_data_function_grants_active_uidx
  ON ui_data_function_grants (
    component_version_id,
    function_name,
    workspace_id,
    COALESCE(channel_id, ''),
    COALESCE(agent_profile_id, '')
  )
  WHERE revoked_at IS NULL;

CREATE TABLE ui_instances (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text NOT NULL REFERENCES channels (id),
  run_id text NOT NULL REFERENCES runs (id),
  run_step_id text NOT NULL REFERENCES run_steps (id),
  agent_turn_id text NOT NULL REFERENCES agent_turns (id),
  logical_thread_id text NOT NULL,
  tool_call_id text NOT NULL,
  component_version_id text NOT NULL REFERENCES ui_component_versions (id),
  activity_message_id text NOT NULL,
  source_event_id text NOT NULL REFERENCES channel_events (id),
  creator_agent_id text NOT NULL REFERENCES agent_profiles (id),
  title text NOT NULL,
  render_grant_id text,
  replaces_ui_instance_id text,
  current_render_revision integer,
  last_good_render_revision integer,
  current_state_revision integer,
  text_alternative text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  quarantined_at timestamptz,
  CONSTRAINT ui_instances_tool_call_uidx UNIQUE (tool_call_id),
  CONSTRAINT ui_instances_activity_uidx UNIQUE (activity_message_id),
  CONSTRAINT ui_instances_status_check CHECK (
    status IN ('building', 'ready', 'degraded', 'failed', 'revoked', 'closed')
  ),
  CONSTRAINT ui_instances_revision_null_check CHECK (
    (current_render_revision IS NULL OR current_render_revision >= 0)
    AND (last_good_render_revision IS NULL OR last_good_render_revision >= 0)
    AND (current_state_revision IS NULL OR current_state_revision >= 0)
  )
);

ALTER TABLE ui_instances
  ADD CONSTRAINT ui_instances_replaces_fk
  FOREIGN KEY (replaces_ui_instance_id) REFERENCES ui_instances (id);

CREATE TABLE ui_instance_revisions (
  id text PRIMARY KEY,
  ui_instance_id text NOT NULL REFERENCES ui_instances (id),
  revision_kind text NOT NULL,
  revision integer NOT NULL,
  base_revision integer,
  component_version_id text REFERENCES ui_component_versions (id),
  renderer_version text,
  renderer_profile_hash text,
  validator_policy_version text NOT NULL,
  argument_schema_json jsonb,
  argument_schema_hash text,
  state_schema_json jsonb,
  state_schema_hash text,
  interaction_manifest_json jsonb,
  interaction_manifest_hash text,
  data_binding_manifest_json jsonb,
  data_binding_manifest_hash text,
  render_node_set_json jsonb,
  render_node_set_hash text,
  render_payload_json jsonb,
  render_payload_hash text,
  render_manifest_json jsonb,
  manifest_hash text,
  validated_props_json jsonb,
  validated_props_hash text,
  scoped_state_json jsonb,
  scoped_state_hash text,
  activity_snapshot_json jsonb,
  data_snapshot_json jsonb,
  data_snapshot_hash text,
  accessible_summary text,
  content_hash text NOT NULL,
  validation_state text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  CONSTRAINT ui_instance_revisions_unique UNIQUE (ui_instance_id, revision_kind, revision),
  CONSTRAINT ui_instance_revisions_kind_check CHECK (revision_kind IN ('render', 'state')),
  CONSTRAINT ui_instance_revisions_revision_check CHECK (revision >= 0),
  CONSTRAINT ui_instance_revisions_validation_check CHECK (
    validation_state IN ('valid', 'invalid', 'quarantined')
  ),
  CONSTRAINT ui_instance_revisions_kind_shape_check CHECK (
    (
      revision_kind = 'render'
      AND component_version_id IS NOT NULL
      AND renderer_profile_hash IS NOT NULL
      AND render_payload_json IS NOT NULL
      AND render_payload_hash IS NOT NULL
      AND render_node_set_json IS NOT NULL
      AND render_node_set_hash IS NOT NULL
      AND render_manifest_json IS NOT NULL
      AND manifest_hash IS NOT NULL
      AND validated_props_json IS NOT NULL
      AND validated_props_hash IS NOT NULL
      AND accessible_summary IS NOT NULL
      AND scoped_state_json IS NULL
      AND scoped_state_hash IS NULL
    )
    OR (
      revision_kind = 'state'
      AND component_version_id IS NULL
      AND renderer_version IS NULL
      AND renderer_profile_hash IS NULL
      AND render_payload_json IS NULL
      AND render_payload_hash IS NULL
      AND render_manifest_json IS NULL
      AND manifest_hash IS NULL
      AND validated_props_json IS NULL
      AND validated_props_hash IS NULL
      AND accessible_summary IS NULL
      AND scoped_state_json IS NOT NULL
      AND scoped_state_hash IS NOT NULL
    )
  )
);

CREATE TRIGGER ui_instance_revisions_append_only
  BEFORE UPDATE OR DELETE ON ui_instance_revisions
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();

CREATE TABLE ui_surface_grants (
  id text PRIMARY KEY,
  ui_instance_id text NOT NULL REFERENCES ui_instances (id),
  grant_kind text NOT NULL,
  policy_revision integer NOT NULL,
  bound_render_revision integer,
  bound_manifest_hash text,
  rail text,
  allowed_component_types_json jsonb,
  limits_json jsonb,
  data_ref text,
  allowed_field_paths_json jsonb,
  max_rows integer,
  max_bytes integer,
  snapshot_schema_hash text,
  immutable_snapshot_hash text,
  action_ref text,
  handler_key text,
  action_mode text,
  input_schema_json jsonb,
  input_schema_hash text,
  allowed_render_node_ids_json jsonb,
  linked_data_grant_id text,
  component_interrupt_id text,
  grant_body_redacted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  grant_scope_hash text NOT NULL,
  max_uses integer,
  use_count integer NOT NULL DEFAULT 0,
  issued_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ui_surface_grants_kind_check CHECK (grant_kind IN ('render', 'data', 'action')),
  CONSTRAINT ui_surface_grants_policy_check CHECK (policy_revision >= 0),
  CONSTRAINT ui_surface_grants_use_check CHECK (
    use_count >= 0 AND (max_uses IS NULL OR use_count <= max_uses)
  ),
  CONSTRAINT ui_surface_grants_action_mode_check CHECK (
    action_mode IS NULL
    OR action_mode IN ('local_state', 'server_read', 'complete_component_interrupt')
  ),
  CONSTRAINT ui_surface_grants_rail_check CHECK (rail IS NULL OR rail = 'registry_v1'),
  CONSTRAINT ui_surface_grants_discriminator_check CHECK (
    (
      grant_kind = 'render'
      AND rail = 'registry_v1'
      AND allowed_component_types_json IS NOT NULL
      AND limits_json IS NOT NULL
      AND bound_render_revision IS NULL
      AND bound_manifest_hash IS NULL
      AND data_ref IS NULL
      AND action_ref IS NULL
      AND action_mode IS NULL
      AND linked_data_grant_id IS NULL
      AND component_interrupt_id IS NULL
    )
    OR (
      grant_kind = 'data'
      AND bound_render_revision IS NOT NULL
      AND bound_manifest_hash IS NOT NULL
      AND data_ref IS NOT NULL
      AND allowed_field_paths_json IS NOT NULL
      AND snapshot_schema_hash IS NOT NULL
      AND immutable_snapshot_hash IS NOT NULL
      AND action_ref IS NULL
      AND action_mode IS NULL
      AND linked_data_grant_id IS NULL
      AND component_interrupt_id IS NULL
      AND rail IS NULL
    )
    OR (
      grant_kind = 'action'
      AND bound_render_revision IS NOT NULL
      AND bound_manifest_hash IS NOT NULL
      AND action_ref IS NOT NULL
      AND handler_key IS NOT NULL
      AND action_mode IS NOT NULL
      AND input_schema_hash IS NOT NULL
      AND allowed_render_node_ids_json IS NOT NULL
      AND max_uses IS NOT NULL
      AND data_ref IS NULL
      AND rail IS NULL
      AND (
        (action_mode = 'local_state' AND linked_data_grant_id IS NULL AND component_interrupt_id IS NULL)
        OR (action_mode = 'server_read' AND linked_data_grant_id IS NOT NULL AND component_interrupt_id IS NULL)
        OR (
          action_mode = 'complete_component_interrupt'
          AND component_interrupt_id IS NOT NULL
          AND linked_data_grant_id IS NULL
        )
      )
    )
  )
);

CREATE TRIGGER ui_surface_grants_protect
  BEFORE UPDATE ON ui_surface_grants
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_ui_surface_grants_protect();

CREATE TRIGGER ui_surface_grants_no_delete
  BEFORE DELETE ON ui_surface_grants
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();

ALTER TABLE ui_instances
  ADD CONSTRAINT ui_instances_render_grant_fk
  FOREIGN KEY (render_grant_id) REFERENCES ui_surface_grants (id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE ui_surface_grants
  ADD CONSTRAINT ui_surface_grants_linked_data_fk
  FOREIGN KEY (linked_data_grant_id) REFERENCES ui_surface_grants (id);

CREATE TABLE ui_component_interrupts (
  id text PRIMARY KEY,
  ui_instance_id text NOT NULL REFERENCES ui_instances (id),
  run_id text NOT NULL REFERENCES runs (id),
  run_step_id text NOT NULL REFERENCES run_steps (id),
  agent_turn_id text NOT NULL REFERENCES agent_turns (id),
  logical_thread_id text NOT NULL,
  tool_call_id text NOT NULL,
  session_generation_id text NOT NULL REFERENCES channel_agent_session_generations (id),
  action_grant_id text NOT NULL REFERENCES ui_surface_grants (id),
  input_schema_hash text NOT NULL,
  state text NOT NULL,
  result_redacted_json jsonb,
  result_hash text,
  continuation_queue_item_id text REFERENCES turn_queue_items (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by text,
  resolved_at timestamptz,
  continued_at timestamptz,
  stale_at timestamptz,
  CONSTRAINT ui_component_interrupts_tool_call_uidx UNIQUE (tool_call_id),
  CONSTRAINT ui_component_interrupts_state_check CHECK (
    state IN ('waiting', 'resolved', 'continued', 'stale')
  )
);

ALTER TABLE ui_surface_grants
  ADD CONSTRAINT ui_surface_grants_component_interrupt_fk
  FOREIGN KEY (component_interrupt_id) REFERENCES ui_component_interrupts (id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE ui_interactions (
  id text PRIMARY KEY,
  ui_instance_id text NOT NULL REFERENCES ui_instances (id),
  render_revision integer NOT NULL,
  expected_state_revision integer,
  action_grant_id text NOT NULL REFERENCES ui_surface_grants (id),
  render_node_id text NOT NULL,
  handler_key text NOT NULL,
  intent_name text NOT NULL,
  payload_redacted_json jsonb NOT NULL,
  payload_hash text NOT NULL,
  interaction_token_hash text,
  idempotency_key_hash text NOT NULL,
  token_expires_at timestamptz,
  actor_user_id text NOT NULL REFERENCES users (id),
  client_kind text NOT NULL,
  state text NOT NULL,
  result_redacted_json jsonb,
  result_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  CONSTRAINT ui_interactions_client_kind_check CHECK (client_kind = 'registry'),
  CONSTRAINT ui_interactions_state_check CHECK (
    state IN ('prepared', 'token_issued', 'dispatching', 'succeeded', 'failed', 'denied', 'stale')
  ),
  CONSTRAINT ui_interactions_lifecycle_check CHECK (
    (state = 'prepared' AND interaction_token_hash IS NULL AND token_expires_at IS NULL AND consumed_at IS NULL)
    OR (
      state = 'token_issued'
      AND interaction_token_hash IS NOT NULL
      AND token_expires_at IS NOT NULL
      AND consumed_at IS NULL
    )
    OR (
      state IN ('dispatching', 'succeeded', 'failed', 'denied', 'stale')
      AND interaction_token_hash IS NOT NULL
    )
  ),
  CONSTRAINT ui_interactions_idempotency_uidx UNIQUE (action_grant_id, idempotency_key_hash)
);

CREATE UNIQUE INDEX ui_interactions_token_uidx
  ON ui_interactions (interaction_token_hash)
  WHERE interaction_token_hash IS NOT NULL;

CREATE TABLE pause_groups (
  id text PRIMARY KEY,
  agent_turn_id text NOT NULL REFERENCES agent_turns (id),
  trueforge_turn_id text NOT NULL,
  generation integer NOT NULL,
  state text NOT NULL,
  required_action_count integer NOT NULL,
  resolved_action_count integer NOT NULL DEFAULT 0,
  resume_claim_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  resumed_at timestamptz,
  CONSTRAINT pause_groups_turn_uidx UNIQUE (agent_turn_id),
  CONSTRAINT pause_groups_trueforge_uidx UNIQUE (trueforge_turn_id),
  CONSTRAINT pause_groups_generation_check CHECK (generation >= 1),
  CONSTRAINT pause_groups_counts_check CHECK (
    required_action_count >= 1 AND resolved_action_count >= 0
    AND resolved_action_count <= required_action_count
  ),
  CONSTRAINT pause_groups_state_check CHECK (
    state IN (
      'collecting',
      'ready',
      'resuming',
      'resumed',
      'stale',
      'expired',
      'cancelled',
      'uncertain'
    )
  )
);

CREATE TABLE required_actions (
  id text PRIMARY KEY,
  pause_group_id text NOT NULL REFERENCES pause_groups (id),
  provider_action_id text NOT NULL,
  action_type text NOT NULL,
  state text NOT NULL,
  payload_redacted_json jsonb NOT NULL,
  payload_hash text NOT NULL,
  response_ciphertext text,
  response_redacted_json jsonb,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT required_actions_provider_uidx UNIQUE (pause_group_id, provider_action_id),
  CONSTRAINT required_actions_type_check CHECK (action_type IN ('approval', 'question', 'connection')),
  CONSTRAINT required_actions_state_check CHECK (
    state IN ('pending', 'resolved', 'expired', 'stale', 'cancelled')
  )
);

CREATE TABLE pause_resumes (
  id text PRIMARY KEY,
  pause_group_id text NOT NULL UNIQUE REFERENCES pause_groups (id),
  expected_generation integer NOT NULL,
  application_run_token text NOT NULL,
  response_payload_hash text NOT NULL,
  response_payload_ciphertext text NOT NULL,
  state text NOT NULL,
  trueforge_resume_turn_id text,
  claimed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT pause_resumes_generation_check CHECK (expected_generation >= 1),
  CONSTRAINT pause_resumes_state_check CHECK (
    state IN ('intended', 'claimed', 'creating', 'uncertain', 'completed', 'reconciled', 'failed')
  )
);

CREATE TABLE action_proposals (
  id text PRIMARY KEY,
  required_action_id text NOT NULL UNIQUE REFERENCES required_actions (id),
  run_id text NOT NULL REFERENCES runs (id),
  run_step_id text NOT NULL REFERENCES run_steps (id),
  agent_turn_id text NOT NULL REFERENCES agent_turns (id),
  thread_id text,
  tool_call_id text NOT NULL,
  session_generation_id text NOT NULL REFERENCES channel_agent_session_generations (id),
  approval_policy_hash text NOT NULL,
  connector_binding_id text NOT NULL REFERENCES connector_bindings (id),
  tool_name text NOT NULL,
  observed_descriptor_hash text NOT NULL,
  acting_identity_json jsonb NOT NULL,
  normalized_arguments_redacted_json jsonb NOT NULL,
  arguments_hash text NOT NULL,
  target_redacted_json jsonb NOT NULL,
  target_hash text NOT NULL,
  artifact_revision_hash text,
  risk_class text NOT NULL,
  expected_effect text NOT NULL,
  state text NOT NULL,
  expires_at timestamptz NOT NULL,
  provider_idempotency_key text,
  decided_by text,
  decision_reason text,
  decided_at timestamptz,
  executed_at timestamptz,
  provider_receipt_json jsonb,
  CONSTRAINT action_proposals_risk_check CHECK (risk_class IN ('low', 'medium', 'high')),
  CONSTRAINT action_proposals_state_check CHECK (
    state IN (
      'proposed',
      'allowed',
      'denied',
      'expired',
      'stale',
      'executing',
      'succeeded',
      'failed',
      'unknown',
      'reconciled_succeeded',
      'reconciled_failed'
    )
  )
);

CREATE TRIGGER action_proposals_protect
  BEFORE UPDATE ON action_proposals
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_action_proposals_protect();

CREATE TRIGGER action_proposals_no_delete
  BEFORE DELETE ON action_proposals
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();

CREATE TABLE questions (
  id text PRIMARY KEY,
  required_action_id text NOT NULL UNIQUE REFERENCES required_actions (id),
  channel_id text NOT NULL REFERENCES channels (id),
  run_id text NOT NULL REFERENCES runs (id),
  prompt_redacted_json jsonb NOT NULL,
  prompt_hash text NOT NULL,
  state text NOT NULL,
  answered_by text,
  answer_ciphertext text,
  answer_redacted_json jsonb,
  answered_at timestamptz,
  expires_at timestamptz NOT NULL,
  CONSTRAINT questions_state_check CHECK (state IN ('requested', 'answered', 'expired', 'stale'))
);

CREATE TABLE artifacts (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text NOT NULL REFERENCES channels (id),
  run_id text NOT NULL REFERENCES runs (id),
  run_step_id text NOT NULL REFERENCES run_steps (id),
  creator_agent_id text NOT NULL REFERENCES agent_profiles (id),
  kind text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  storage_key text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  source_sandbox_id text,
  source_sandbox_path text,
  revision integer NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artifacts_kind_check CHECK (kind IN ('file', 'preview')),
  CONSTRAINT artifacts_revision_check CHECK (revision >= 1),
  CONSTRAINT artifacts_size_check CHECK (byte_size >= 0),
  CONSTRAINT artifacts_content_revision_uidx UNIQUE (sha256, revision),
  CONSTRAINT artifacts_storage_key_uidx UNIQUE (storage_key)
);

ALTER TABLE channel_pins
  ADD CONSTRAINT channel_pins_artifact_fk
  FOREIGN KEY (source_artifact_id) REFERENCES artifacts (id);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces (id),
  channel_id text REFERENCES channels (id),
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  redacted_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_actor_check CHECK (actor_type IN ('human', 'coworker', 'system'))
);

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_forbid_mutation();
