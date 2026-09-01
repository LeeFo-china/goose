-- Validate the material-event shadow check without blocking concurrent writes.
-- Rollback: forward-only. If validation fails, correct the violating rows in a
-- reviewed migration and retry. Keep the original validated check in place.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.marketing_events IN SHARE UPDATE EXCLUSIVE MODE;

DO $migration$
DECLARE
  v_expected_definition CONSTANT text :=
    'CHECK (event_name = ANY (ARRAY[''page_view''::text, ''button_click''::text, ''phone_click''::text, ''form_submit''::text, ''app_launch''::text, ''case_view''::text, ''site_view''::text, ''lead_cta_click''::text, ''sms_send''::text, ''lead_submit''::text, ''lead_submit_success''::text, ''phone_call_click''::text, ''material_preview''::text, ''material_claim''::text, ''material_copy''::text, ''material_budget_click''::text, ''material_lead_click''::text]))';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.marketing_events'::regclass
      AND constraint_definition.conname =
        'marketing_events_event_name_check_material_notes'
      AND constraint_definition.contype = 'c'
      AND pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_definition.oid, true),
        ' NOT VALID$',
        ''
      ) = v_expected_definition
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
