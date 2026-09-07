-- Stage B accounting core. Warehouse commands are private and reachable only
-- through the workflow entry points; legacy project RPC signatures stay stable.
-- Rollback: close the warehouse gate and use a reviewed forward migration.
-- Never delete purchase facts, orders, or accounting history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION pg_temp.stage_b_accounting_replace(p_source text, p_old text, p_new text, p_count integer DEFAULT 1)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old = '' OR (length(p_source) - length(replace(p_source,p_old,''))) / length(p_old) <> p_count THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='WAREHOUSE_ACCOUNTING_PATCH_SOURCE_MISMATCH', DETAIL=left(p_old,150);
  END IF;
  RETURN replace(p_source,p_old,p_new);
END;
$$;

-- Preserve every existing state/audit requirement, extending only the budget
-- enum. The separate destination constraint prevents projects using this value.
DO $constraints$
DECLARE v_table text; v_name text; v_definition text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['supplier_purchase_batches','supplier_purchase_requisitions'] LOOP
    v_name := v_table || '_budget_status_check';
    SELECT pg_get_constraintdef(oid) INTO STRICT v_definition FROM pg_constraint
      WHERE conrelid=('public.' || v_table)::regclass AND conname=v_name;
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,
      '''over_budget''::text]', '''over_budget''::text, ''not_applicable''::text]');
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',v_table,v_name,v_name,v_definition);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
      (destination_type = ''project'' AND budget_status IN (''unchecked'',''within_budget'',''over_budget''))
      OR (destination_type = ''warehouse'' AND budget_status IN (''unchecked'',''not_applicable'')))',
      v_table,v_table || '_destination_budget_check');
  END LOOP;
  v_name := 'supplier_purchase_requisitions_state_metadata_check';
  SELECT pg_get_constraintdef(oid) INTO STRICT v_definition FROM pg_constraint
    WHERE conrelid='public.supplier_purchase_requisitions'::regclass AND conname=v_name;
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,
    '''over_budget''::text]', '''over_budget''::text, ''not_applicable''::text]',5);
  EXECUTE format('ALTER TABLE public.supplier_purchase_requisitions DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',v_name,v_name,v_definition);
END;
$constraints$;

DO $cores$
DECLARE v_command text; v_definition text; v_signature text; v_marker text;
BEGIN
  FOREACH v_command IN ARRAY ARRAY['submit','review'] LOOP
    v_signature := CASE v_command WHEN 'submit' THEN '(uuid,uuid,integer,uuid,uuid,text)'
      ELSE '(uuid,uuid,integer,text,text,boolean,uuid,uuid,text)' END;
    v_definition := pg_get_functiondef(('public.' || v_command || '_supplier_purchase_batch' || v_signature)::regprocedure);
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,
      'FUNCTION public.' || v_command || '_supplier_purchase_batch(',
      'FUNCTION public.__gooes_' || v_command || '_supplier_purchase_batch_destinations_v2(');
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,
      'p_idempotency_key text)', 'p_idempotency_key text, p_allow_warehouse boolean DEFAULT false)');
    -- Check frozen replay as well as locked current identity. A legacy call
    -- must never adopt a warehouse workflow command through its shared key.
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,
      '    RETURN v_event.result || jsonb_build_object(''idempotent'', true);',
      $patch$    IF v_event.result->'batch'->>'destination_type' = 'warehouse' AND p_allow_warehouse IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
    END IF;
    RETURN v_event.result || jsonb_build_object('idempotent', true);$patch$);
    -- Shared with draft/workflow lock order. Settings serialize destination
    -- edits before reading the warehouse and locking the mutable draft row.
    v_marker := $patch$  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'supplier-purchase-batch-id:'$patch$;
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
      $patch$  IF p_allow_warehouse THEN
    PERFORM settings.tenant_id FROM public.tenant_supplier_settings AS settings
      WHERE settings.tenant_id=p_tenant_id FOR UPDATE;
    PERFORM warehouse.id FROM public.warehouses AS warehouse
      JOIN public.supplier_purchase_batches AS batch ON batch.warehouse_id=warehouse.id
        AND batch.tenant_id=warehouse.tenant_id
      WHERE batch.id=p_batch_id AND batch.tenant_id=p_tenant_id
        AND batch.destination_type='warehouse' FOR SHARE OF warehouse;
  END IF;
$patch$ || v_marker);
    v_marker := CASE v_command WHEN 'submit' THEN '  IF v_batch.status <> ''draft'' THEN'
      ELSE '  IF v_batch.version <> p_expected_version THEN' END;
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
      $patch$  IF v_batch.destination_type='warehouse' AND p_allow_warehouse IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='SUPPLIER_PURCHASE_BATCH_WORKFLOW_CONFLICT';
  END IF;
$patch$ || v_marker);
    v_marker := '  PERFORM project.id FROM public.projects AS project';
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
      $patch$  IF v_batch.destination_type='warehouse' THEN
    PERFORM public.assert_warehouse_procurement_destination(p_tenant_id,v_batch.destination_type,v_batch.project_id,v_batch.warehouse_id);
  ELSE
$patch$ || v_marker);
    v_marker := CASE v_command WHEN 'submit' THEN '  WITH selected AS MATERIALIZED ('
      ELSE E'  PERFORM relationship.id\n  FROM public.tenant_suppliers AS relationship' END;
    -- submit has only one top-level WITH selected; other selected queries are
    -- nested. Review closes its project guard before the relationship locks.
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,E'  END IF;\n\n' || v_marker);
    v_marker := '  PERFORM public.lock_project_cost_budget_scope(p_tenant_id, v_batch.project_id);';
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
      E'  IF v_batch.destination_type = ''project'' THEN\n' || v_marker || E'\n  END IF;');

    IF v_command='submit' THEN
      v_marker := '  PERFORM budget.id FROM public.project_cost_budgets AS budget';
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
        $patch$  IF v_batch.destination_type='warehouse' THEN
    v_budget_status := 'not_applicable'; v_budget_snapshot := '{}'::jsonb;
  ELSE
$patch$ || v_marker);
      v_marker := '  INTO v_budget_status, v_budget_snapshot FROM snapshots;';
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,v_marker || E'\n  END IF;');
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,
        '      tenant_id, project_id, tenant_supplier_id, supplier_id, status,',
        '      tenant_id, project_id, destination_type, warehouse_id, tenant_supplier_id, supplier_id, status,');
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,
        '    ) SELECT p_tenant_id, v_batch.project_id, supplier.tenant_supplier_id,',
        '    ) SELECT p_tenant_id, v_batch.project_id, v_batch.destination_type, v_batch.warehouse_id, supplier.tenant_supplier_id,');
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,
        '    p_actor_employee_id FROM child_by_category AS child;',
        '    p_actor_employee_id FROM child_by_category AS child WHERE v_batch.destination_type = ''project'';');
    ELSE
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,
        '      requisition.project_id = v_batch.project_id',
        $patch$      requisition.project_id IS NOT DISTINCT FROM v_batch.project_id
      AND requisition.destination_type = v_batch.destination_type
      AND requisition.warehouse_id IS NOT DISTINCT FROM v_batch.warehouse_id$patch$);
      v_marker := '  WITH expected_commitments AS MATERIALIZED (';
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
        $patch$  IF v_batch.destination_type='warehouse' THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.project_cost_commitments AS commitment
      JOIN public.supplier_purchase_requisitions AS requisition
        ON requisition.id=commitment.source_id AND requisition.tenant_id=commitment.tenant_id
      WHERE requisition.tenant_id=p_tenant_id AND requisition.purchase_batch_id=p_batch_id
        AND requisition.split_generation=v_batch.split_generation
    ) INTO v_commitments_match;
  ELSE
$patch$ || v_marker);
      v_marker := E'    AND v_expected_commitment_count = v_actual_commitment_count\n    AND v_commitments_match;';
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,v_marker || E'\n  END IF;');
      v_marker := E'  WITH requested_by_category AS MATERIALIZED (\n    SELECT item.cost_category_id,\n      sum(item.line_total_amount)::numeric(18,2) AS amount';
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
        $patch$  IF v_batch.destination_type='warehouse' THEN
    v_budget_status := 'not_applicable'; v_budget_snapshot := '{}'::jsonb;
  ELSE
$patch$ || v_marker);
      v_marker := '  INTO v_budget_status, v_budget_snapshot FROM current_budget;';
      v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,v_marker || E'\n  END IF;');
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$cores$;

REVOKE ALL ON FUNCTION public.__gooes_submit_supplier_purchase_batch_destinations_v2(uuid,uuid,integer,uuid,uuid,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.__gooes_review_supplier_purchase_batch_destinations_v2(uuid,uuid,integer,text,text,boolean,uuid,uuid,text,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.submit_supplier_purchase_batch(
  p_batch_id uuid,p_tenant_id uuid,p_expected_version integer,p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT public.__gooes_submit_supplier_purchase_batch_destinations_v2(
    p_batch_id,p_tenant_id,p_expected_version,p_actor_user_id,p_actor_employee_id,p_idempotency_key,false);
$$;
CREATE OR REPLACE FUNCTION public.review_supplier_purchase_batch(
  p_batch_id uuid,p_tenant_id uuid,p_expected_version integer,p_action text,p_remark text,p_can_override_budget boolean,
  p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT public.__gooes_review_supplier_purchase_batch_destinations_v2(
    p_batch_id,p_tenant_id,p_expected_version,p_action,p_remark,p_can_override_budget,p_actor_user_id,p_actor_employee_id,p_idempotency_key,false);
$$;

DO $orders$
DECLARE v_definition text; v_marker text;
BEGIN
  v_definition := pg_get_functiondef('public.convert_supplier_purchase_requisition_for_batch(uuid,uuid,integer,uuid,integer,uuid,timestamptz,uuid,uuid)'::regprocedure);
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,
    '    id, tenant_id, project_id, tenant_supplier_id, supplier_id, order_no,',
    '    id, tenant_id, project_id, destination_type, warehouse_id, tenant_supplier_id, supplier_id, order_no,');
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,
    '    p_order_id, p_tenant_id, v_requisition.project_id,',
    '    p_order_id, p_tenant_id, v_requisition.project_id, v_requisition.destination_type, v_requisition.warehouse_id,');
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.submit_supplier_purchase_order(uuid,uuid,integer,uuid,uuid,text)'::regprocedure);
  v_marker := '  PERFORM project.id FROM public.projects AS project';
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
    $patch$  IF v_identity.destination_type='warehouse' THEN
    PERFORM settings.tenant_id FROM public.tenant_supplier_settings AS settings
      WHERE settings.tenant_id=p_tenant_id FOR UPDATE;
    PERFORM warehouse.id FROM public.warehouses AS warehouse
      WHERE warehouse.id=v_identity.warehouse_id AND warehouse.tenant_id=p_tenant_id FOR SHARE;
    PERFORM public.assert_warehouse_procurement_destination(p_tenant_id,v_identity.destination_type,v_identity.project_id,v_identity.warehouse_id);
  ELSE
$patch$ || v_marker);
  v_marker := E'  PERFORM relationship.id\n  FROM public.tenant_suppliers AS relationship';
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,E'  END IF;\n' || v_marker);
  v_marker := '  IF v_order.project_id IS DISTINCT FROM v_identity.project_id';
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
    v_marker || E'\n    OR v_order.destination_type IS DISTINCT FROM v_identity.destination_type\n    OR v_order.warehouse_id IS DISTINCT FROM v_identity.warehouse_id');
  EXECUTE v_definition;
END;
$orders$;

-- Switch only the internal accounting call sites. Warehouse workflow context,
-- candidates and routing remain fail-closed until their own adaptation lands.
DO $workflow_calls$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.submit_supplier_purchase_batch_with_workflow(uuid,uuid,integer,uuid,uuid,text)'::regprocedure);
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,
    $patch$  v_submit_result := public.submit_supplier_purchase_batch(
    p_batch_id,
    p_tenant_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );$patch$,
    $patch$  v_submit_result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(
    p_batch_id,p_tenant_id,p_expected_version,p_actor_user_id,p_actor_employee_id,p_idempotency_key,true
  );$patch$);
  EXECUTE v_definition;
  v_definition := pg_get_functiondef('public.__gooes_complete_supplier_purchase_batch_workflow_task_v1(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,text)'::regprocedure);
  v_definition := pg_temp.stage_b_accounting_replace(v_definition,
    $patch$      v_review_result := public.review_supplier_purchase_batch(
        p_batch_id,
        p_tenant_id,
        v_batch.version,
        v_action,
        v_reason,
        v_action = 'approve' AND v_task.node_key = 'finance_review',
        p_actor_user_id,
        p_actor_employee_id,
        p_idempotency_key
      );$patch$,
    $patch$      v_review_result := public.__gooes_review_supplier_purchase_batch_destinations_v2(
        p_batch_id,p_tenant_id,v_batch.version,v_action,v_reason,
        v_action = 'approve' AND v_task.node_key = 'finance_review',
        p_actor_user_id,p_actor_employee_id,p_idempotency_key,true
      );$patch$);
  EXECUTE v_definition;
END;
$workflow_calls$;

-- Both review wrappers enter the batch advisory before delegation. Acquire
-- shared destination locks before that advisory, otherwise concurrent submit
-- (settings -> batch) and review (batch -> settings) deadlock even for projects.
DO $review_lock_order$
DECLARE v_name text; v_definition text; v_indent text; v_marker text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'complete_supplier_purchase_batch_workflow_task',
    '__gooes_complete_supplier_purchase_batch_workflow_task_v1'
  ] LOOP
    v_definition := pg_get_functiondef(('public.' || v_name || '(uuid,uuid,uuid,text,text,jsonb,uuid,uuid,text)')::regprocedure);
    v_indent := CASE WHEN v_name='complete_supplier_purchase_batch_workflow_task' THEN '    ' ELSE '  ' END;
    v_marker := v_indent || E'PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(\n'
      || v_indent || '  ''supplier-purchase-batch-id:''';
    v_definition := pg_temp.stage_b_accounting_replace(v_definition,v_marker,
      $patch$  PERFORM settings.tenant_id FROM public.tenant_supplier_settings AS settings
    WHERE settings.tenant_id=p_tenant_id FOR UPDATE;
  PERFORM warehouse.id FROM public.warehouses AS warehouse
    JOIN public.supplier_purchase_batches AS batch ON batch.warehouse_id=warehouse.id
      AND batch.tenant_id=warehouse.tenant_id
    WHERE batch.id=p_batch_id AND batch.tenant_id=p_tenant_id
      AND batch.destination_type='warehouse' FOR SHARE OF warehouse;
$patch$ || v_marker);
    EXECUTE v_definition;
  END LOOP;
END;
$review_lock_order$;

COMMIT;
