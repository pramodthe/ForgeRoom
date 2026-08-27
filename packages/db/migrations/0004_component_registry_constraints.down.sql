DROP TRIGGER IF EXISTS ui_component_grants_reject_server_only ON ui_component_grants;
DROP FUNCTION IF EXISTS forgeroom_ui_component_grants_reject_server_only();
DROP TRIGGER IF EXISTS ui_component_versions_protect ON ui_component_versions;
DROP FUNCTION IF EXISTS forgeroom_ui_component_versions_protect();

DROP INDEX IF EXISTS ui_component_versions_component_descriptor_uidx;

ALTER TABLE ui_component_versions
  DROP CONSTRAINT IF EXISTS ui_component_versions_descriptor_uidx;

CREATE UNIQUE INDEX ui_component_versions_descriptor_uidx
  ON ui_component_versions (descriptor_hash);
