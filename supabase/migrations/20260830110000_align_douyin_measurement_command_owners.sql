-- Align trusted Douyin lead commands with the legacy marketing_leads owner.
-- This preserves the trigger's direct-write guard across migration roles.
-- Rollback: stop Douyin lead writes and restore each function owner from the
-- pre-migration catalog evidence. Restoring mismatched owners reintroduces the
-- production failure and is intended only for emergency rollback.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $block$
DECLARE
  v_table_owner name;
  v_signature text;
  v_command regprocedure;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
  INTO v_table_owner
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'public'
    AND class.relname = 'marketing_leads'
    AND class.relkind IN ('r', 'p');

  IF v_table_owner IS NULL
    OR v_table_owner IN ('anon', 'authenticated', 'service_role')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_MARKETING_LEADS_OWNER_INVALID';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.submit_douyin_miniapp_lead(uuid,uuid,text,text,text,numeric,text,text,text,text,text,uuid,text,text,text,text,timestamp with time zone,jsonb)',
    'public.submit_douyin_measurement_appointment(uuid,uuid,text,text,text,date,text,uuid,text,text,uuid,text,text,text,text,timestamp with time zone,jsonb)',
    'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid)',
    'public.assign_douyin_lead(uuid,uuid,uuid,uuid,integer,uuid,uuid)',
    'public.append_douyin_lead_follow_up(uuid,uuid,uuid,uuid,text,text,text,timestamp with time zone,text,timestamp with time zone,integer,uuid)',
    'public.convert_douyin_lead_to_customer(uuid,uuid,uuid,integer,uuid)',
    'public.convert_douyin_lead_to_customer(uuid,uuid,uuid,integer,uuid,uuid,boolean)',
    'public.mark_douyin_lead_invalid(uuid,uuid,uuid,text,integer,uuid)'
  ]::text[]
  LOOP
    v_command := pg_catalog.to_regprocedure(v_signature);
    IF v_command IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_MEASUREMENT_COMMAND_NOT_FOUND',
        DETAIL = v_signature;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      WHERE procedure.oid = v_command
        AND procedure.prosecdef
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_MEASUREMENT_COMMAND_NOT_SECURITY_DEFINER',
        DETAIL = v_signature;
    END IF;

    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s OWNER TO %I',
      v_signature,
      v_table_owner
    );
  END LOOP;
END;
$block$;

COMMIT;
