ALTER TABLE artifacts DROP CONSTRAINT artifacts_content_revision_uidx;
ALTER TABLE artifacts
  ADD CONSTRAINT artifacts_content_revision_uidx
  UNIQUE (sha256, revision);
