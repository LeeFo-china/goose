-- Disposable offline runner only. Requires receipt-cross-order-concurrency.sql
-- and receipt-weighted-cost.sql. Both tenants already have real stock/AP facts.
-- Run before receipt-weighted-race.sql: these controls use the original single
-- warehouse/SKU seeds, before that race adds a second warehouse to one tenant.
BEGIN;
CREATE TEMP TABLE stage_b_inventory_tenants AS
  SELECT tenant_id,warehouse_id,sku_id FROM public.stage_b_cross_order_fixture WHERE ordinal = 1
  UNION ALL SELECT tenant_id,warehouse_id,sku_id FROM public.stage_b_weighted_cost_fixture WHERE ordinal = 1;

CREATE FUNCTION pg_temp.stage_b_assert_inventory_page(
  result jsonb, tenant_id uuid, expected_ids jsonb, expected_total integer,
  page_number integer, page_size integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_ids jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(item->'id' ORDER BY ordinal), '[]'::jsonb) INTO actual_ids
    FROM jsonb_array_elements(result->'items') WITH ORDINALITY AS rows(item, ordinal);
  IF result->'items' IS NULL OR jsonb_typeof(result->'items') IS DISTINCT FROM 'array'
    OR actual_ids IS DISTINCT FROM expected_ids
    OR (result->>'total')::integer IS DISTINCT FROM expected_total
    OR (result->>'page')::integer IS DISTINCT FROM page_number
    OR (result->>'page_size')::integer IS DISTINCT FROM page_size
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') item
      WHERE (item->>'tenant_id')::uuid IS DISTINCT FROM tenant_id) THEN
    RAISE EXCEPTION 'Inventory page leaked or omitted tenant facts: %; expected IDs %, total %',
      result,expected_ids,expected_total;
  END IF;
END;
$$;

DO $isolation$
DECLARE local_tenant stage_b_inventory_tenants%ROWTYPE; foreign_tenant stage_b_inventory_tenants%ROWTYPE;
  balance_ids jsonb; transaction_ids jsonb; expected_ids jsonb; result jsonb;
  balance_total integer; transaction_total integer; page_number integer; foreign_code text; own_code text;
BEGIN
  IF (SELECT count(DISTINCT tenant_id) FROM stage_b_inventory_tenants) <> 2 THEN
    RAISE EXCEPTION 'Inventory isolation requires two distinct seeded tenants';
  END IF;
  FOR local_tenant IN SELECT * FROM stage_b_inventory_tenants LOOP
    SELECT * INTO STRICT foreign_tenant FROM stage_b_inventory_tenants WHERE tenant_id <> local_tenant.tenant_id;
    SELECT sku_code INTO STRICT foreign_code FROM public.supplier_skus WHERE id = foreign_tenant.sku_id;
    SELECT sku_code INTO STRICT own_code FROM public.supplier_skus WHERE id = local_tenant.sku_id;
    SELECT count(*)::integer,jsonb_agg(id ORDER BY updated_at DESC,id DESC) INTO balance_total,balance_ids
      FROM public.inventory_balances WHERE tenant_id = local_tenant.tenant_id;
    SELECT count(*)::integer,jsonb_agg(id ORDER BY occurred_at DESC,id DESC) INTO transaction_total,transaction_ids
      FROM public.inventory_transactions WHERE tenant_id = local_tenant.tenant_id;
    -- Bounded synthetic seeds, not an exemption for unbounded application reads.
    IF balance_total NOT BETWEEN 1 AND 20 OR transaction_total NOT BETWEEN 2 AND 20
      OR local_tenant.sku_id = foreign_tenant.sku_id OR local_tenant.warehouse_id = foreign_tenant.warehouse_id
      OR own_code = foreign_code THEN RAISE EXCEPTION 'Invalid two-sided inventory controls'; END IF;

    result := public.list_inventory_balances(local_tenant.tenant_id,NULL,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,balance_ids,balance_total,1,20);
    result := public.list_inventory_balances(local_tenant.tenant_id,local_tenant.warehouse_id,own_code,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,balance_ids,balance_total,1,20);
    result := public.list_inventory_balances(local_tenant.tenant_id,foreign_tenant.warehouse_id,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);
    result := public.list_inventory_balances(local_tenant.tenant_id,NULL,foreign_code,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);
    result := public.list_inventory_balances(local_tenant.tenant_id,local_tenant.warehouse_id,foreign_code,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);

    result := public.list_inventory_transactions(local_tenant.tenant_id,NULL,NULL,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,transaction_ids,transaction_total,1,20);
    result := public.list_inventory_transactions(local_tenant.tenant_id,local_tenant.warehouse_id,local_tenant.sku_id,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,transaction_ids,transaction_total,1,20);
    result := public.list_inventory_transactions(local_tenant.tenant_id,foreign_tenant.warehouse_id,NULL,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);
    result := public.list_inventory_transactions(local_tenant.tenant_id,NULL,foreign_tenant.sku_id,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);
    result := public.list_inventory_transactions(local_tenant.tenant_id,local_tenant.warehouse_id,foreign_tenant.sku_id,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);
    result := public.list_inventory_transactions(local_tenant.tenant_id,foreign_tenant.warehouse_id,local_tenant.sku_id,NULL,1,20);
    PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,'[]',0,1,20);

    FOR page_number IN 1..balance_total + 1 LOOP
      expected_ids := CASE WHEN page_number <= balance_total THEN jsonb_build_array(balance_ids->(page_number-1)) ELSE '[]'::jsonb END;
      result := public.list_inventory_balances(local_tenant.tenant_id,NULL,NULL,page_number,1);
      PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,expected_ids,balance_total,page_number,1);
    END LOOP;
    FOR page_number IN 1..transaction_total + 1 LOOP
      expected_ids := CASE WHEN page_number <= transaction_total THEN jsonb_build_array(transaction_ids->(page_number-1)) ELSE '[]'::jsonb END;
      result := public.list_inventory_transactions(local_tenant.tenant_id,NULL,NULL,NULL,page_number,1);
      PERFORM pg_temp.stage_b_assert_inventory_page(result,local_tenant.tenant_id,expected_ids,transaction_total,page_number,1);
    END LOOP;
  END LOOP;
END;
$isolation$;

-- Balance ACL was not covered by the earlier transaction/source-document tests.
DO $acl$
DECLARE signature regprocedure := 'public.list_inventory_balances(uuid,uuid,text,integer,integer)'::regprocedure;
BEGIN
  IF has_function_privilege('anon',signature,'EXECUTE')
    OR has_function_privilege('authenticated',signature,'EXECUTE')
    OR NOT has_function_privilege('service_role',signature,'EXECUTE') THEN
    RAISE EXCEPTION 'Inventory balance RPC ACL permits clients or denies the service';
  END IF;
END;
$acl$;
ROLLBACK;
