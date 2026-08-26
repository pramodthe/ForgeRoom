ALTER TABLE channel_agent_sessions
  DROP CONSTRAINT channel_agent_sessions_agent_workspace_fk,
  DROP CONSTRAINT channel_agent_sessions_channel_workspace_fk,
  DROP CONSTRAINT channel_agent_sessions_workspace_fk,
  ADD CONSTRAINT channel_agent_sessions_channel_id_fkey
    FOREIGN KEY (channel_id) REFERENCES channels (id),
  ADD CONSTRAINT channel_agent_sessions_agent_profile_id_fkey
    FOREIGN KEY (agent_profile_id) REFERENCES agent_profiles (id),
  DROP COLUMN workspace_id;

ALTER TABLE channels
  DROP CONSTRAINT channels_id_workspace_uidx;

ALTER TABLE agent_profiles
  DROP CONSTRAINT agent_profiles_id_workspace_uidx;
