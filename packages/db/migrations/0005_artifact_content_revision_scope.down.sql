ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_content_revision_uidx;
-- Do not recreate the pre-0005 global (sha256, revision) unique constraint on rollback.
-- After 0005, identical content in different workspace/channel scopes is valid; restoring
-- the global unique would fail when such rows exist.
