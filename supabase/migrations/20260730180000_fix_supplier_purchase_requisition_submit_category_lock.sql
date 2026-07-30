-- Rollback: use a forward migration that CREATE OR REPLACEs the function
-- definition again. Do not restore the exclusive category row lock: submit
-- keeps atomic active-state validation with FOR NO KEY UPDATE.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.submit_supplier_purchase_requisition(uuid,uuid,integer,uuid,uuid,text)'::regprocedure;
  v_body text;
  v_exclusive text := $exclusive$FOR UPDATE OF finance_category
  )
  SELECT COUNT(*)$exclusive$;
  v_key_compatible text := $compatible$FOR NO KEY UPDATE OF finance_category
  )
  SELECT COUNT(*)$compatible$;
  v_exclusive_count integer;
BEGIN
  SELECT routine.prosrc
  INTO STRICT v_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function;

  v_exclusive_count := (
    char_length(v_body) -
    char_length(replace(v_body, v_exclusive, ''))
  ) / char_length(v_exclusive);
  IF v_exclusive_count <> 1
    OR position(v_key_compatible IN v_body) > 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_REQUISITION_SUBMIT_LOCK_SOURCE_MISMATCH';
  END IF;

  v_body := replace(v_body, v_exclusive, v_key_compatible);

  EXECUTE format(
    $function$
CREATE OR REPLACE FUNCTION public.submit_supplier_purchase_requisition(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS %L
    $function$,
    v_body
  );

  SELECT routine.prosrc
  INTO STRICT v_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function;
  IF position(v_exclusive IN v_body) > 0
    OR position(v_key_compatible IN v_body) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_REQUISITION_SUBMIT_LOCK_FIX_FAILED';
  END IF;
END;
$migration$;

COMMIT;
