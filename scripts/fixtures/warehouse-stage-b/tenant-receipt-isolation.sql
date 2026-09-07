-- Disposable offline runner only. Requires receipt-cross-order-concurrency.sql
-- and receipt-weighted-cost.sql. Roll back all additions so performance seeds
-- retain their original cardinality. This tests SQL identity isolation, not HTTP ACLs.
BEGIN;
CREATE TEMP TABLE stage_b_tenant_receipt_cases (
  ordinal integer PRIMARY KEY, tenant_id uuid, warehouse_id uuid, sku_id uuid,
  order_id uuid, item_id uuid, actor_user_id uuid, actor_employee_id uuid,
  receipt_id uuid, received_at timestamptz, receipt_result jsonb
);

CREATE FUNCTION pg_temp.stage_b_receipt_facts(tenant_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE relation_name text; rows_json jsonb; result jsonb := '{}'::jsonb;
BEGIN
  -- Fixed fixture-only relation names; capture full rows, not just counts or sums.
  FOREACH relation_name IN ARRAY ARRAY[
    'supplier_purchase_batches','supplier_purchase_batch_items',
    'supplier_purchase_requisitions','supplier_purchase_requisition_items',
    'supplier_purchase_orders','supplier_purchase_order_items',
    'supplier_purchase_order_fulfillments','supplier_purchase_order_item_fulfillments',
    'supplier_purchase_order_receipts','supplier_purchase_order_receipt_items',
    'inventory_balances','inventory_transactions','supplier_payable_events',
    'supplier_command_events','project_cost_events','project_cost_commitments'
  ] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(fact) ORDER BY fact.id), ''[]''::jsonb)
      FROM public.%I AS fact WHERE fact.tenant_id = ANY($1)', relation_name)
      INTO rows_json USING tenant_ids;
    result := result || jsonb_build_object(relation_name, rows_json);
  END LOOP;
  RETURN result;
END;
$$;

DO $seed$
DECLARE seed record; result jsonb; batch_id uuid; order_id uuid; item_id uuid;
  reviewer_user uuid; reviewer_employee uuid; cost_id uuid; receipt_id uuid;
  received_at timestamptz := now(); case_number integer := 0;
BEGIN
  FOR seed IN
    SELECT * FROM public.stage_b_cross_order_fixture WHERE ordinal = 1
    UNION ALL SELECT * FROM public.stage_b_weighted_cost_fixture WHERE ordinal = 1
  LOOP
    case_number := case_number + 1;
    IF NOT EXISTS(SELECT 1 FROM public.tenant_supplier_settings settings
      JOIN public.warehouses warehouse ON warehouse.tenant_id = settings.tenant_id
      WHERE settings.tenant_id = seed.tenant_id AND settings.module_enabled
        AND settings.warehouse_procurement_enabled AND warehouse.id = seed.warehouse_id
        AND warehouse.status = 'active') THEN
      RAISE EXCEPTION 'Both tenants must have an active warehouse and open procurement gate';
    END IF;
    SELECT id,user_id INTO STRICT reviewer_employee,reviewer_user FROM public.employees
      WHERE tenant_id = seed.tenant_id AND id <> seed.actor_employee_id;
    SELECT cost_category_id INTO STRICT cost_id FROM public.supplier_purchase_order_items WHERE id = seed.item_id;
    batch_id := gen_random_uuid();
    result := public.save_supplier_purchase_batch_draft(batch_id,seed.tenant_id,NULL,0,
      'Tenant isolation receipt control',NULL,NULL,
      jsonb_build_array(jsonb_build_object('supplier_sku_id',seed.sku_id,'cost_category_id',cost_id,'quantity','5')),
      seed.actor_user_id,seed.actor_employee_id,'tenant-receipt-save','warehouse',seed.warehouse_id);
    IF result->>'status' IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'Control draft failed: %',result; END IF;
    result := public.__gooes_submit_supplier_purchase_batch_destinations_v2(batch_id,seed.tenant_id,1,
      seed.actor_user_id,seed.actor_employee_id,'tenant-receipt-submit',true);
    IF result->>'status' IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION 'Control submit failed: %',result; END IF;
    result := public.__gooes_review_supplier_purchase_batch_destinations_v2(batch_id,seed.tenant_id,2,
      'approve',NULL,false,reviewer_user,reviewer_employee,'tenant-receipt-review',true);
    IF result->>'status' IS DISTINCT FROM 'ordered' THEN RAISE EXCEPTION 'Control review failed: %',result; END IF;
    order_id := (result->'orders'->0->>'id')::uuid;
    result := public.confirm_supplier_purchase_order_fulfillment(order_id,seed.tenant_id,2,received_at,NULL,
      seed.actor_user_id,seed.actor_employee_id,'tenant-receipt-confirm');
    IF result->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Control confirmation failed: %',result; END IF;
    SELECT item.id INTO STRICT item_id FROM public.supplier_purchase_order_items item
      WHERE item.supplier_purchase_order_id = order_id AND item.tenant_id = seed.tenant_id;
    receipt_id := gen_random_uuid();
    result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,seed.tenant_id,1,
      'TENANT-CONTROL',received_at,NULL,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id',item_id,'accepted_quantity',1,'rejected_quantity',0)),
      seed.actor_user_id,seed.actor_employee_id,'tenant-receipt-control');
    IF result->>'status' IS DISTINCT FROM 'receipt_created'
      OR result->>'idempotent' IS DISTINCT FROM 'false'
      OR NOT EXISTS(SELECT 1 FROM public.supplier_purchase_order_fulfillments fulfillment
        WHERE fulfillment.supplier_purchase_order_id = order_id AND fulfillment.tenant_id = seed.tenant_id
          AND fulfillment.version = 2 AND fulfillment.status = 'partially_received') THEN
      RAISE EXCEPTION 'Positive receipt control failed: %',result;
    END IF;
    INSERT INTO stage_b_tenant_receipt_cases VALUES(case_number,seed.tenant_id,seed.warehouse_id,seed.sku_id,
      order_id,item_id,seed.actor_user_id,seed.actor_employee_id,receipt_id,received_at,result);
  END LOOP;
  IF (SELECT count(DISTINCT tenant_id) FROM stage_b_tenant_receipt_cases) <> 2 THEN
    RAISE EXCEPTION 'Isolation fixture requires two distinct valid tenants';
  END IF;
END;
$seed$;

DO $isolation$
DECLARE local_case stage_b_tenant_receipt_cases%ROWTYPE; foreign_case stage_b_tenant_receipt_cases%ROWTYPE;
  before_facts jsonb; result jsonb; attempt integer; receipt_id uuid; order_id uuid;
  items jsonb; expected_result jsonb; tenant_ids uuid[];
BEGIN
  SELECT array_agg(tenant_id ORDER BY ordinal) INTO tenant_ids FROM stage_b_tenant_receipt_cases;
  before_facts := pg_temp.stage_b_receipt_facts(tenant_ids);
  FOR local_case IN SELECT * FROM stage_b_tenant_receipt_cases ORDER BY ordinal LOOP
    SELECT * INTO STRICT foreign_case FROM stage_b_tenant_receipt_cases WHERE tenant_id <> local_case.tenant_id;
    FOR attempt IN 1..4 LOOP
      order_id := local_case.order_id;
      receipt_id := gen_random_uuid();
      items := jsonb_build_array(jsonb_build_object('purchase_order_item_id',local_case.item_id,
        'accepted_quantity',1,'rejected_quantity',0));
      IF attempt = 1 THEN
        order_id := foreign_case.order_id;
        items := jsonb_build_array(jsonb_build_object('purchase_order_item_id',foreign_case.item_id,
          'accepted_quantity',1,'rejected_quantity',0));
        expected_result := '{"status":"not_found","error_code":"SUPPLIER_PURCHASE_ORDER_NOT_FOUND"}';
      ELSIF attempt IN (2,3) THEN
        IF attempt = 2 THEN items := '[]'::jsonb; END IF;
        items := items || jsonb_build_array(jsonb_build_object('purchase_order_item_id',foreign_case.item_id,
          'accepted_quantity',1,'rejected_quantity',0));
        expected_result := '{"status":"not_found","error_code":"SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND"}';
      ELSE
        receipt_id := foreign_case.receipt_id;
        expected_result := '{"status":"state_conflict","error_code":"SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT"}';
      END IF;
      result := public.create_supplier_purchase_order_receipt(receipt_id,order_id,local_case.tenant_id,2,
        'TENANT-NEGATIVE-' || attempt,local_case.received_at,NULL,items,
        local_case.actor_user_id,local_case.actor_employee_id,'tenant-receipt-negative-' || attempt);
      -- Exact shape also prevents foreign frozen results or identifiers leaking.
      IF result IS DISTINCT FROM expected_result THEN
        RAISE EXCEPTION 'Tenant % attempt % wrong rejection: %',local_case.ordinal,attempt,result;
      END IF;
      IF pg_temp.stage_b_receipt_facts(tenant_ids) IS DISTINCT FROM before_facts THEN
        RAISE EXCEPTION 'Tenant % attempt % changed either tenant business/command facts',local_case.ordinal,attempt;
      END IF;
    END LOOP;
    -- The same key text was deliberately used by both tenants' distinct actors.
    -- Each must recover only its own frozen success, after all rejected attempts.
    result := public.create_supplier_purchase_order_receipt(local_case.receipt_id,local_case.order_id,local_case.tenant_id,1,
      'TENANT-CONTROL',local_case.received_at,NULL,
      jsonb_build_array(jsonb_build_object('purchase_order_item_id',local_case.item_id,'accepted_quantity',1,'rejected_quantity',0)),
      local_case.actor_user_id,local_case.actor_employee_id,'tenant-receipt-control');
    IF result->>'idempotent' IS DISTINCT FROM 'true'
      OR result - 'idempotent' IS DISTINCT FROM local_case.receipt_result - 'idempotent'
      OR pg_temp.stage_b_receipt_facts(tenant_ids) IS DISTINCT FROM before_facts THEN
      RAISE EXCEPTION 'Tenant % replay leaked another result or changed facts: %',local_case.ordinal,result;
    END IF;
  END LOOP;
END;
$isolation$;
ROLLBACK;
