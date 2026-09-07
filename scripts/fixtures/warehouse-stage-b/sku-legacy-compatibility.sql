-- Disposable offline runner only. Run receipt-cross-order-concurrency.sql first:
-- its real v1 product command creates the historical 16-digit SKU code.
DO $legacy$
DECLARE
  f public.stage_b_cross_order_fixture%ROWTYPE;
  sku public.supplier_skus%ROWTYPE;
  supplier_id uuid;
  relationship_id uuid;
  context jsonb;
  result jsonb;
  replay jsonb;
  price_before jsonb;
  events_before bigint;
  events_after bigint;
  parent_request jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_cross_order_fixture WHERE ordinal=1;
  SELECT * INTO STRICT sku FROM public.supplier_skus WHERE id=f.sku_id;
  SELECT purchase_order.supplier_id,purchase_order.tenant_supplier_id
    INTO STRICT supplier_id,relationship_id
    FROM public.supplier_purchase_orders purchase_order WHERE purchase_order.id=f.order_id;
  IF sku.sku_code IS DISTINCT FROM 'TS-'||left(replace(sku.id::text,'-',''),16) THEN
    RAISE EXCEPTION 'Fixture must contain the actual legacy short SKU code';
  END IF;
  context:=public.get_supplier_purchasable_sku_price_context_v1(
    f.tenant_id,relationship_id,supplier_id,sku.supplier_product_id,sku.id);
  SELECT jsonb_agg(to_jsonb(price_list) ORDER BY price_list.id) INTO price_before
    FROM public.supplier_price_lists price_list WHERE price_list.tenant_id=f.tenant_id;
  SELECT count(*) INTO events_before FROM public.supplier_command_events WHERE tenant_id=f.tenant_id;
  result:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,
    sku.supplier_product_id,sku.id,sku.version,'{}'::jsonb,
    '{"unit_price":"20.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
    (context->'current_price'->>'supplier_price_list_id')::uuid,
    (context->'current_price'->>'supplier_price_list_row_version')::integer,
    f.actor_user_id,f.actor_employee_id,'legacy-price-update');
  IF result->>'status' IS DISTINCT FROM 'saved' THEN
    IF price_before IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(price_list) ORDER BY price_list.id)
      FROM public.supplier_price_lists price_list WHERE price_list.tenant_id=f.tenant_id)
      OR events_before<>(SELECT count(*) FROM public.supplier_command_events WHERE tenant_id=f.tenant_id)
      OR to_jsonb(sku) IS DISTINCT FROM (SELECT to_jsonb(current_sku)
        FROM public.supplier_skus current_sku WHERE current_sku.id=sku.id) THEN
      RAISE EXCEPTION 'Failed legacy save left price/SKU/command mutations: %',result;
    END IF;
    RAISE EXCEPTION 'Legacy short SKU price update must succeed without recoding: %',result;
  END IF;
  IF result->'sku'->>'sku_code' IS DISTINCT FROM sku.sku_code
    OR result->'catalog_item'->>'supplier_sku_id' IS DISTINCT FROM sku.id::text
    OR result->'catalog_item'->>'sku_code' IS DISTINCT FROM sku.sku_code
    OR (result->'current_price'->>'unit_price')::numeric IS DISTINCT FROM 20::numeric
    OR result->>'price_version_created' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Legacy price update changed identity or returned a different SKU: %',result;
  END IF;
  SELECT count(*) INTO events_after FROM public.supplier_command_events WHERE tenant_id=f.tenant_id;
  parent_request:=jsonb_build_object(
    'action','update','tenant_id',f.tenant_id,'tenant_supplier_id',relationship_id,
    'supplier_id',supplier_id,'supplier_product_id',sku.supplier_product_id,'supplier_sku_id',sku.id,
    'expected_sku_version',sku.version,'sku',jsonb_build_object('sku_code','TS-'||upper(replace(sku.id::text,'-',''))),
    'price','{"unit_price":"20.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
    'expected_price_list_id',(context->'current_price'->>'supplier_price_list_id')::uuid,
    'expected_price_list_version',(context->'current_price'->>'supplier_price_list_row_version')::integer,
    'actor_user_id',f.actor_user_id,'actor_employee_id',f.actor_employee_id,'idempotency_key','legacy-price-update');
  IF NOT EXISTS(SELECT 1 FROM public.supplier_command_events event
    WHERE event.actor_user_id=f.actor_user_id
      AND event.idempotency_key='supplier-purchasable-sku:'||md5('legacy-price-update')
      AND event.from_state->'_request'=parent_request
      AND event.from_state->>'_fingerprint'=md5(parent_request::text)) THEN
    RAISE EXCEPTION 'Legacy save changed the canonical full-code request / fingerprint';
  END IF;
  replay:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,
    sku.supplier_product_id,sku.id,sku.version,'{}'::jsonb,
    '{"unit_price":"20.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
    (context->'current_price'->>'supplier_price_list_id')::uuid,
    (context->'current_price'->>'supplier_price_list_row_version')::integer,
    f.actor_user_id,f.actor_employee_id,'legacy-price-update');
  IF replay->>'idempotent' IS DISTINCT FROM 'true'
    OR replay-'idempotent' IS DISTINCT FROM result-'idempotent'
    OR events_after<>(SELECT count(*) FROM public.supplier_command_events WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Legacy same-key replay changed frozen response or command facts: %',replay;
  END IF;
END;
$legacy$;

-- Generate a new full-code SKU sharing the old UUID's first 16 hexadecimal
-- digits. Its product name also contains the old code; public keyword search
-- must keep both matches, while an exact no-price-change save must select A.
DO $collision$
DECLARE
  f public.stage_b_cross_order_fixture%ROWTYPE;
  sku public.supplier_skus%ROWTYPE;
  product public.supplier_products%ROWTYPE;
  supplier_id uuid;
  relationship_id uuid;
  new_product uuid:=gen_random_uuid();
  new_sku uuid;
  result jsonb;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_cross_order_fixture WHERE ordinal=1;
  SELECT * INTO STRICT sku FROM public.supplier_skus WHERE id=f.sku_id;
  SELECT * INTO STRICT product FROM public.supplier_products WHERE id=sku.supplier_product_id;
  SELECT purchase_order.supplier_id,purchase_order.tenant_supplier_id INTO STRICT supplier_id,relationship_id
    FROM public.supplier_purchase_orders purchase_order WHERE purchase_order.id=f.order_id;
  new_sku:=(left(sku.id::text,19)||substr(gen_random_uuid()::text,20))::uuid;
  result:=public.command_supplier_purchasable_product_v2(new_product,new_sku,f.tenant_id,relationship_id,supplier_id,
    jsonb_build_object('product_code','TP-'||left(replace(new_product::text,'-',''),16),
      'name','Keyword collision '||sku.sku_code,'category_id',product.category_id,'brand_id',product.brand_id),
    jsonb_build_object('sku_code','TS-'||upper(replace(new_sku::text,'-','')),'name','Full-code SKU',
      'purchase_unit_id',sku.purchase_unit_id,'spec_values','{}'::jsonb),
    '{"unit_price":"30.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
    f.actor_user_id,f.actor_employee_id,'legacy-collision-product');
  IF result->>'status' IS DISTINCT FROM 'created' THEN
    RAISE EXCEPTION 'Full-code collision fixture creation failed: %',result;
  END IF;
END;
$collision$;

DO $exact$
DECLARE
  f public.stage_b_cross_order_fixture%ROWTYPE;
  sku public.supplier_skus%ROWTYPE;
  supplier_id uuid;
  relationship_id uuid;
  context jsonb;
  catalog jsonb;
  result jsonb;
  price_count bigint;
BEGIN
  SELECT * INTO STRICT f FROM public.stage_b_cross_order_fixture WHERE ordinal=1;
  SELECT * INTO STRICT sku FROM public.supplier_skus WHERE id=f.sku_id;
  SELECT purchase_order.supplier_id,purchase_order.tenant_supplier_id INTO STRICT supplier_id,relationship_id
    FROM public.supplier_purchase_orders purchase_order WHERE purchase_order.id=f.order_id;
  catalog:=public.resolve_supplier_purchase_order_catalog(f.tenant_id,relationship_id,now(),sku.sku_code,1,1);
  IF (catalog->>'total')::integer IS DISTINCT FROM 2 OR jsonb_array_length(catalog->'items')<>1
    OR (catalog->>'page_size')::integer<>1 THEN
    RAISE EXCEPTION 'Public substring search/pagination changed or collision fixture invalid: %',catalog;
  END IF;
  catalog:=public.resolve_supplier_purchase_order_catalog(f.tenant_id,relationship_id,now(),sku.sku_code,3,1);
  IF (catalog->>'total')::integer<>2 OR catalog->'items'<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Public out-of-range page must retain matching total: %',catalog;
  END IF;
  context:=public.get_supplier_purchasable_sku_price_context_v1(
    f.tenant_id,relationship_id,supplier_id,sku.supplier_product_id,sku.id);
  SELECT count(*) INTO price_count FROM public.supplier_price_lists WHERE tenant_id=f.tenant_id;
  result:=public.command_supplier_purchasable_sku_v1('update',f.tenant_id,relationship_id,supplier_id,
    sku.supplier_product_id,sku.id,sku.version,'{"name":"Legacy renamed"}'::jsonb,
    '{"unit_price":"20.00","tax_rate":"0.130000","tax_inclusive":true}'::jsonb,
    (context->'current_price'->>'supplier_price_list_id')::uuid,
    (context->'current_price'->>'supplier_price_list_row_version')::integer,
    f.actor_user_id,f.actor_employee_id,'legacy-collision-save');
  IF result->>'status' IS DISTINCT FROM 'saved' OR result->>'price_version_created' IS DISTINCT FROM 'false'
    OR result->'sku'->>'sku_code' IS DISTINCT FROM sku.sku_code
    OR result->'sku'->>'name' IS DISTINCT FROM 'Legacy renamed'
    OR result->'catalog_item'->>'supplier_sku_id' IS DISTINCT FROM sku.id::text
    OR (result->'sku'->>'version')::integer IS DISTINCT FROM sku.version+1
    OR price_count<>(SELECT count(*) FROM public.supplier_price_lists WHERE tenant_id=f.tenant_id) THEN
    RAISE EXCEPTION 'Exact legacy edit/no-price-change save failed with substring collision: %',result;
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) AS role(name)
    WHERE has_function_privilege(role.name,
      'public.__gooes_resolve_supplier_purchase_order_catalog_v1(uuid,uuid,timestamptz,text,integer,integer,uuid)','EXECUTE'))
    OR NOT has_function_privilege('service_role',
      'public.resolve_supplier_purchase_order_catalog(uuid,uuid,timestamptz,text,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Private exact resolver must not expose a new business RPC';
  END IF;
END;
$exact$;
