-- Governed component registry: immutable published versions, scoped descriptor uniqueness,
-- and server_only grant denial (with revoke still allowed).

-- Descriptor hashes are semantic (code-owned), so uniqueness is per component, not global.
ALTER TABLE ui_component_versions
  DROP CONSTRAINT IF EXISTS ui_component_versions_descriptor_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS ui_component_versions_component_descriptor_uidx
  ON ui_component_versions (component_id, descriptor_hash);

CREATE FUNCTION forgeroom_ui_component_versions_protect()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['revoked_at'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['revoked_at'])
  THEN
    RAISE EXCEPTION 'ui_component_versions published content is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'ui_component_versions revocation is single-assignment'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ui_component_versions_protect ON ui_component_versions;
CREATE TRIGGER ui_component_versions_protect
  BEFORE UPDATE ON ui_component_versions
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_ui_component_versions_protect();

CREATE FUNCTION forgeroom_ui_component_grants_reject_server_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_exposure text;
BEGIN
  -- Always allow revocation of an active grant, including legacy server_only rows.
  IF TG_OP = 'UPDATE'
    AND OLD.revoked_at IS NULL
    AND NEW.revoked_at IS NOT NULL
    AND (to_jsonb(NEW) - ARRAY['revoked_at']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['revoked_at'])
  THEN
    RETURN NEW;
  END IF;

  SELECT exposure
    INTO version_exposure
    FROM ui_component_versions
    WHERE id = NEW.component_version_id;

  IF version_exposure = 'server_only' THEN
    RAISE EXCEPTION 'ui_component_grants cannot grant server_only component versions'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ui_component_grants_reject_server_only ON ui_component_grants;
CREATE TRIGGER ui_component_grants_reject_server_only
  BEFORE INSERT OR UPDATE ON ui_component_grants
  FOR EACH ROW
  EXECUTE FUNCTION forgeroom_ui_component_grants_reject_server_only();

-- Revoke any legacy active grants that target server_only versions.
UPDATE ui_component_grants AS g
SET revoked_at = now()
FROM ui_component_versions AS v
WHERE g.component_version_id = v.id
  AND v.exposure = 'server_only'
  AND g.revoked_at IS NULL;
