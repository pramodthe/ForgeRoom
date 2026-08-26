-- Bind every stable agent session to one workspace and require both participants to match it.

LOCK TABLE channel_agent_sessions IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  mismatched_count bigint;
  mismatched_sessions text;
BEGIN
  SELECT count(*)
    INTO mismatched_count
    FROM channel_agent_sessions AS sessions
    JOIN channels ON channels.id = sessions.channel_id
    JOIN agent_profiles ON agent_profiles.id = sessions.agent_profile_id
    WHERE channels.workspace_id IS DISTINCT FROM agent_profiles.workspace_id;

  IF mismatched_count > 0 THEN
    SELECT string_agg(details, ', ' ORDER BY details)
      INTO mismatched_sessions
      FROM (
        SELECT format(
          '%s(channel=%s,agent=%s)',
          sessions.id,
          channels.workspace_id,
          agent_profiles.workspace_id
        ) AS details
        FROM channel_agent_sessions AS sessions
        JOIN channels ON channels.id = sessions.channel_id
        JOIN agent_profiles ON agent_profiles.id = sessions.agent_profile_id
        WHERE channels.workspace_id IS DISTINCT FROM agent_profiles.workspace_id
        ORDER BY sessions.id
        LIMIT 20
      ) AS mismatches;

    RAISE EXCEPTION
      'cannot apply 0002_session_workspace_boundary: % cross-workspace legacy session(s): %',
      mismatched_count,
      mismatched_sessions
      USING
        ERRCODE = 'check_violation',
        HINT = 'Reassign or remove each listed session so its channel and agent profile share a workspace, then rerun the migration.';
  END IF;
END;
$$;

ALTER TABLE agent_profiles
  ADD CONSTRAINT agent_profiles_id_workspace_uidx UNIQUE (id, workspace_id);

ALTER TABLE channels
  ADD CONSTRAINT channels_id_workspace_uidx UNIQUE (id, workspace_id);

ALTER TABLE channel_agent_sessions
  ADD COLUMN workspace_id text;

UPDATE channel_agent_sessions AS sessions
SET workspace_id = channels.workspace_id
FROM channels
WHERE channels.id = sessions.channel_id;

ALTER TABLE channel_agent_sessions
  ALTER COLUMN workspace_id SET NOT NULL,
  DROP CONSTRAINT channel_agent_sessions_channel_id_fkey,
  DROP CONSTRAINT channel_agent_sessions_agent_profile_id_fkey,
  ADD CONSTRAINT channel_agent_sessions_workspace_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
  ADD CONSTRAINT channel_agent_sessions_channel_workspace_fk
    FOREIGN KEY (channel_id, workspace_id) REFERENCES channels (id, workspace_id),
  ADD CONSTRAINT channel_agent_sessions_agent_workspace_fk
    FOREIGN KEY (agent_profile_id, workspace_id) REFERENCES agent_profiles (id, workspace_id);
