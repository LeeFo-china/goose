-- Rollback: use a forward migration that CREATE OR REPLACEs the function
-- definition again. Do not restore the draft category row lock: submit still
-- revalidates and locks categories, budgets, and commitments atomically.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.save_supplier_purchase_requisition_draft(uuid,uuid,uuid,uuid,integer,date,text,text,jsonb,uuid,uuid,text)'::regprocedure;
  v_body text;
  v_locked text := $locked$FOR SHARE OF price_item, price_list, sku, product,
      catalog_category, purchase_unit, base_unit, finance_category
  ),$locked$;
  v_unlocked text := $unlocked$FOR SHARE OF price_item, price_list, sku, product,
      catalog_category, purchase_unit, base_unit
  ),$unlocked$;
  v_locked_count integer;
BEGIN
  SELECT routine.prosrc
  INTO STRICT v_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function;

  v_locked_count := (
    char_length(v_body) -
    char_length(replace(v_body, v_locked, ''))
  ) / char_length(v_locked);
  IF v_locked_count <> 1 OR position(v_unlocked IN v_body) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_REQUISITION_DRAFT_LOCK_SOURCE_MISMATCH';
  END IF;

  v_body := replace(v_body, v_locked, v_unlocked);

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
  IF position(v_locked IN v_body) > 0
    OR position(v_unlocked IN v_body) = 0
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_REQUISITION_DRAFT_LOCK_FIX_FAILED';
  END IF;
END;
$migration$;

COMMIT;
