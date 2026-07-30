-- Rollback: use a forward migration that CREATE OR REPLACEs the function
-- definition again. Do not restore the prior definition during rollback
-- because that definition is runtime-invalid; production rollback should keep
-- this corrected version while application entry points are disabled.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.save_supplier_purchase_requisition_draft(uuid,uuid,uuid,uuid,integer,date,text,text,jsonb,uuid,uuid,text)'::regprocedure;
  v_body text;
  v_invalid text :=
    'FROM jsonb_to_recordset(p_items) ' ||
    'WITH ORDINALITY AS item(' || E'\n' ||
    '      supplier_sku_id uuid,' || E'\n' ||
    '      cost_category_id uuid,' || E'\n' ||
    '      quantity numeric,' || E'\n' ||
    '      ordinality bigint' || E'\n' ||
    '    )';
  v_valid text := $replacement$
FROM ROWS FROM (
      jsonb_to_recordset(p_items) AS (
        supplier_sku_id uuid,
        cost_category_id uuid,
        quantity numeric
      )
    ) WITH ORDINALITY AS item(
      supplier_sku_id,
      cost_category_id,
      quantity,
      ordinality
    )$replacement$;
  v_invalid_count integer;
BEGIN
  SELECT routine.prosrc
  INTO STRICT v_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function;

  v_invalid_count := (
    char_length(v_body) -
    char_length(replace(v_body, v_invalid, ''))
  ) / char_length(v_invalid);
  IF v_invalid_count <> 1 OR position(v_valid IN v_body) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_REQUISITION_ORDINALITY_SOURCE_MISMATCH';
  END IF;

  v_body := replace(v_body, v_invalid, v_valid);

  EXECUTE format(
    $function$
CREATE OR REPLACE FUNCTION public.save_supplier_purchase_requisition_draft(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
  p_expected_delivery_date date,
  p_reason text,
  p_remark text,
  p_items jsonb,
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
  IF position(v_invalid IN v_body) > 0 OR position(v_valid IN v_body) = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_REQUISITION_ORDINALITY_FIX_FAILED';
  END IF;
END;
$migration$;

COMMIT;
