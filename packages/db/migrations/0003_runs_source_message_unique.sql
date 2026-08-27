-- One channel-owned human message creates exactly one application Run.
-- Refuse to guess which historical Run is canonical if legacy duplicates exist.

LOCK TABLE runs IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_count bigint;
  duplicate_sample text;
BEGIN
  SELECT count(*), min(source_message_id)
  INTO duplicate_count, duplicate_sample
  FROM (
    SELECT source_message_id
    FROM runs
    GROUP BY source_message_id
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'cannot apply 0003_runs_source_message_unique: % source messages own multiple runs (sample source_message_id=%); reconcile duplicate Runs before retrying',
      duplicate_count,
      duplicate_sample;
  END IF;
END
$$;

CREATE UNIQUE INDEX runs_source_message_uidx ON runs (source_message_id);
