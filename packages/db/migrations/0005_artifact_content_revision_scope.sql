-- Scope artifact content-revision idempotency to workspace + channel.
ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_content_revision_uidx;
ALTER TABLE artifacts
  ADD CONSTRAINT artifacts_content_revision_uidx
  UNIQUE (workspace_id, channel_id, sha256, revision);
