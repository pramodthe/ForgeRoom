-- Restore the pre-0007 generation history trigger (no rotating rollback exception).
CREATE OR REPLACE FUNCTION forgeroom_session_generations_protect_history()
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
