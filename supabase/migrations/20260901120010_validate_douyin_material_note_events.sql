-- Validate the material-event shadow check without blocking concurrent writes.
-- Rollback: forward-only. If validation fails, correct the violating rows in a
-- reviewed migration and retry. Keep the original validated check in place.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.marketing_events'::regclass
      AND constraint_definition.conname =
        'marketing_events_event_name_check_material_notes'
      AND constraint_definition.contype = 'c'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MATERIAL_NOTE_EVENT_CHECK_PRECONDITION_FAILED';
  END IF;
END;
$migration$;

ALTER TABLE public.marketing_events
VALIDATE CONSTRAINT marketing_events_event_name_check_material_notes;

RESET statement_timeout;
RESET lock_timeout;

COMMIT;
