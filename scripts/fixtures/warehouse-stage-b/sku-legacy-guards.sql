-- Disposable offline runner only. Requires receipt-cross-order-concurrency.sql
-- and sku-legacy-compatibility.sql. Every additional fact is rolled back.
BEGIN;
DO $guards$
DECLARE
  f public.stage_b_cross_order_fixture%ROWTYPE;
  sku public.supplier_skus%ROWTYPE;
  supplier_id uuid;
  relationship_id uuid;
  context jsonb;
  result jsonb;
  price jsonb:='{"unit_price":"20.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb;
  price_count bigint;
  events_before bigint;
  duplicate_list uuid:=gen_random_uuid();
  duplicate_item uuid:=gen_random_uuid();
  original_list uuid;
  original_item uuid;
  conflict boolean:=false;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_cross_order_fixture WHERE ordinal=1;
  SELECT * INTO STRICT sku FROM public.supplier_skus WHERE id=f.sku_id;
  SELECT purchase_order.supplier_id,purchase_order.tenant_supplier_id INTO STRICT supplier_id,relationship_id
    FROM public.supplier_purchase_orders purchase_order WHERE purchase_order.id=f.order_id;
  context:=public.get_supplier_purchasable_sku_price_context_v1(
    f.tenant_id,relationship_id,supplier_id,sku.supplier_product_id,sku.id);
  original_list:=(context->'current_price'->>'supplier_price_list_id')::uuid;
  original_item:=(context->'current_price'->>'supplier_price_list_item_id')::uuid;
  SELECT count(*) INTO price_count FROM public.supplier_price_lists WHERE tenant_id=f.tenant_id;
  result:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,
    sku.supplier_product_id,sku.id,sku.version,'{}'::jsonb,price,original_list,
    (context->'current_price'->>'supplier_price_list_row_version')::integer,
    f.actor_user_id,f.actor_employee_id,'legacy-pure-noop');
  IF result->>'status' IS DISTINCT FROM 'saved'
    OR result->>'price_version_created' IS DISTINCT FROM 'false'
    OR result->'sku' IS DISTINCT FROM to_jsonb(sku)
    OR price_count<>(SELECT count(*) FROM public.supplier_price_lists WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Pure legacy no-op changed SKU/version or created a price list: %',result;
  END IF;
  BEGIN
    PERFORM public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,
      sku.supplier_product_id,sku.id,sku.version,'{}'::jsonb,price||'{"unit_price":"21.00"}'::jsonb,original_list,
      (context->'current_price'->>'supplier_price_list_row_version')::integer,
      f.actor_user_id,f.actor_employee_id,'legacy-pure-noop');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM IS DISTINCT FROM 'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF;
    conflict:=true;
  END;
  IF NOT conflict THEN RAISE EXCEPTION 'Same legacy key with different price was not rejected'; END IF;

  -- Construct anomalous overlapping history using fixture-only DML. Keep all
  -- table constraints/triggers enabled: insert a draft, copy its one item, then
  -- publish its row. This is NOT a claim that the public publish command permits
  -- overlap. The test proves exact UUID lookup does not conceal legacy ambiguity.
  INSERT INTO public.supplier_price_lists(id,tenant_id,tenant_supplier_id,supplier_id,price_list_code,
    version_number,scope_type,name,currency,lifecycle_status,effective_from,effective_until,
    acting_tenant_id,acting_employee_id,operation_source,proxy_reason,created_by_employee_id,updated_by_employee_id)
  SELECT duplicate_list,source.tenant_id,source.tenant_supplier_id,source.supplier_id,source.price_list_code,
    source.version_number+1,source.scope_type,'Synthetic overlapping legacy list',source.currency,'draft',
    source.effective_from,source.effective_until,source.acting_tenant_id,source.acting_employee_id,
    source.operation_source,source.proxy_reason,source.created_by_employee_id,source.updated_by_employee_id
  FROM public.supplier_price_lists source WHERE source.id=original_list;
  INSERT INTO public.supplier_price_list_items(id,tenant_id,supplier_id,supplier_price_list_id,
    supplier_product_id,supplier_sku_id,minimum_quantity,maximum_quantity,purchase_unit_id,base_unit_id,
    base_unit_conversion,unit_price,tax_rate,tax_inclusive,acting_tenant_id,acting_employee_id,
    operation_source,proxy_reason,created_by_employee_id,updated_by_employee_id)
  SELECT duplicate_item,source.tenant_id,source.supplier_id,duplicate_list,source.supplier_product_id,source.supplier_sku_id,
    source.minimum_quantity,source.maximum_quantity,source.purchase_unit_id,source.base_unit_id,
    source.base_unit_conversion,source.unit_price,source.tax_rate,source.tax_inclusive,source.acting_tenant_id,
    source.acting_employee_id,source.operation_source,source.proxy_reason,source.created_by_employee_id,source.updated_by_employee_id
  FROM public.supplier_price_list_items source WHERE source.id=original_item;
  UPDATE public.supplier_price_lists SET lifecycle_status='published',published_at=now(),row_version=2
    WHERE id=duplicate_list;
  result:=public.__gooes_resolve_supplier_purchase_order_catalog_v1(
    f.tenant_id,relationship_id,now(),NULL,1,1,sku.id);
  IF (result->>'total')::integer IS DISTINCT FROM 2 OR jsonb_array_length(result->'items')<>1 THEN
    RAISE EXCEPTION 'Exact SKU catalog must preserve both eligible prices before its page limit: %',result;
  END IF;
  SELECT count(*) INTO events_before FROM public.supplier_command_events WHERE tenant_id=f.tenant_id;
  result:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,
    sku.supplier_product_id,sku.id,sku.version,'{"name":"Must roll back this edit"}'::jsonb,
    price,duplicate_list,2,f.actor_user_id,f.actor_employee_id,'legacy-ambiguous-price');
  IF result->>'status' IS DISTINCT FROM 'state_conflict'
    OR result->>'reason' IS DISTINCT FROM 'catalog_result_not_exact'
    OR result->>'error_code' IS DISTINCT FROM 'SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED'
    OR to_jsonb(sku) IS DISTINCT FROM (SELECT to_jsonb(current_sku)
      FROM public.supplier_skus current_sku WHERE current_sku.id=sku.id)
    OR events_before<>(SELECT count(*) FROM public.supplier_command_events WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Ambiguous exact SKU save did not reject and roll back its child edit: %',result;
  END IF;
END;
$guards$;
ROLLBACK;
