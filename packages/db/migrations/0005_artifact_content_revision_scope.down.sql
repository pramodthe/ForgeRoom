ALTER TABLE artifacts DROP CONSTRAINT artifacts_content_revision_uidx;
-- Down migration assumes no duplicate (sha256, revision) pairs exist across channels.
ALTER TABLE artifacts
  ADD CONSTRAINT artifacts_content_revision_uidx
  UNIQUE (sha256, revision);
