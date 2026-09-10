BEGIN;

CREATE FUNCTION public.get_warehouse_stocktake_settings(
  p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_permission text;
BEGIN
  v_permission:=CASE
    WHEN public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view') THEN 'inventory.stock.view'
    WHEN public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.stocktake.manage') THEN 'inventory.stocktake.manage'
    WHEN public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.stocktake.approve') THEN 'inventory.stocktake.approve'
    ELSE 'inventory.stock.view' END;
  PERFORM public.__gooes_stocktake_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,v_permission);
  RETURN jsonb_build_object('warehouse_stocktakes_enabled',EXISTS(
    SELECT 1 FROM public.tenant_supplier_settings
    WHERE tenant_id=p_tenant_id AND module_enabled AND warehouse_stocktakes_enabled));
END;
$$;

CREATE FUNCTION public.get_warehouse_stocktake_order(
  p_tenant_id uuid,p_order_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.__gooes_stocktake_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,'inventory.stock.view');
  SELECT to_jsonb(o)||jsonb_build_object('warehouse_name',w.name,
    'item_count',a.item_count,'counted_count',a.counted_count,'difference_count',a.difference_count,
    'gain_amount',CASE WHEN o.status='completed' THEN a.gain_amount::text END,
    'loss_amount',CASE WHEN o.status='completed' THEN a.loss_amount::text END)
    INTO v_result
    FROM public.warehouse_stocktake_orders o
    JOIN public.warehouses w ON w.id=o.warehouse_id AND w.tenant_id=o.tenant_id
    CROSS JOIN LATERAL(
      SELECT count(*) item_count,count(*) FILTER(WHERE i.counted_quantity IS NOT NULL) counted_count,
        count(*) FILTER(WHERE i.difference_quantity<>0) difference_count,
        coalesce(sum(i.amount::numeric(20,2)) FILTER(WHERE i.difference_quantity>0),0::numeric(20,2)) gain_amount,
        coalesce(sum(i.amount::numeric(20,2)) FILTER(WHERE i.difference_quantity<0),0::numeric(20,2)) loss_amount
      FROM public.warehouse_stocktake_order_items i WHERE i.stocktake_order_id=o.id
    ) a WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id;
  IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_NOT_FOUND'; END IF;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.list_warehouse_stocktake_orders(
  p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid,p_warehouse_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_keyword text DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_total bigint; v_items jsonb;
BEGIN
  PERFORM public.__gooes_stocktake_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,'inventory.stock.view');
  p_page:=coalesce(p_page,1); p_page_size:=coalesce(p_page_size,20);
  p_keyword:=nullif(public.__gooes_stocktake_trim(p_keyword),'');
  IF p_page<1 OR p_page_size NOT BETWEEN 1 AND 100 OR public.__gooes_stocktake_reason_length(p_keyword)>100
    OR (p_status IS NOT NULL AND p_status NOT IN ('draft','counting','submitted','completed','cancelled')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_INVALID';
  END IF;
  SELECT count(*) INTO v_total FROM public.warehouse_stocktake_orders o WHERE o.tenant_id=p_tenant_id
    AND (p_warehouse_id IS NULL OR o.warehouse_id=p_warehouse_id)
    AND (p_status IS NULL OR o.status=p_status)
    AND (p_keyword IS NULL OR strpos(lower(o.order_no),lower(p_keyword))>0 OR strpos(lower(o.reason),lower(p_keyword))>0);
  WITH page AS MATERIALIZED(
    SELECT o.* FROM public.warehouse_stocktake_orders o WHERE o.tenant_id=p_tenant_id
      AND (p_warehouse_id IS NULL OR o.warehouse_id=p_warehouse_id)
      AND (p_status IS NULL OR o.status=p_status)
      AND (p_keyword IS NULL OR strpos(lower(o.order_no),lower(p_keyword))>0 OR strpos(lower(o.reason),lower(p_keyword))>0)
      ORDER BY o.created_at DESC,o.id DESC LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
  ), aggregates AS(
    SELECT i.stocktake_order_id,count(*) item_count,count(*) FILTER(WHERE i.counted_quantity IS NOT NULL) counted_count,
      count(*) FILTER(WHERE i.difference_quantity<>0) difference_count,
      coalesce(sum(i.amount::numeric(20,2)) FILTER(WHERE i.difference_quantity>0),0::numeric(20,2)) gain_amount,
      coalesce(sum(i.amount::numeric(20,2)) FILTER(WHERE i.difference_quantity<0),0::numeric(20,2)) loss_amount
    FROM page p JOIN public.warehouse_stocktake_order_items i ON i.stocktake_order_id=p.id GROUP BY i.stocktake_order_id
  ) SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('warehouse_name',w.name,
      'item_count',coalesce(a.item_count,0),'counted_count',coalesce(a.counted_count,0),
      'difference_count',coalesce(a.difference_count,0),
      'gain_amount',CASE WHEN p.status='completed' THEN coalesce(a.gain_amount,0::numeric(20,2))::text END,
      'loss_amount',CASE WHEN p.status='completed' THEN coalesce(a.loss_amount,0::numeric(20,2))::text END)
      ORDER BY p.created_at DESC,p.id DESC),'[]'::jsonb) INTO v_items
    FROM page p JOIN public.warehouses w ON w.id=p.warehouse_id AND w.tenant_id=p.tenant_id
    LEFT JOIN aggregates a ON a.stocktake_order_id=p.id;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_page_size);
END;
$$;

CREATE FUNCTION public.list_warehouse_stocktake_order_items(
  p_tenant_id uuid,p_order_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_total bigint; v_items jsonb;
BEGIN
  PERFORM public.__gooes_stocktake_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,'inventory.stock.view');
  p_page:=coalesce(p_page,1); p_page_size:=coalesce(p_page_size,20);
  IF p_page<1 OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_INVALID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouse_stocktake_orders WHERE id=p_order_id AND tenant_id=p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_NOT_FOUND';
  END IF;
  SELECT count(*) INTO v_total FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id;
  SELECT coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object(
    'book_quantity',i.book_quantity::text,'book_value',i.book_value::text,'book_unit_cost',i.book_unit_cost::text,
    'counted_quantity',i.counted_quantity::text,'difference_quantity',i.difference_quantity::text,
    'unit_cost',i.unit_cost::text,'amount',i.amount::text,'sku_name',s.name,'sku_code',s.sku_code)
    ORDER BY i.line_no,i.id),'[]'::jsonb) INTO v_items
    FROM(SELECT * FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id
      ORDER BY line_no,id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size) i
    JOIN public.supplier_skus s ON s.id=i.supplier_sku_id;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_page_size);
END;
$$;

ALTER FUNCTION public.list_warehouse_stocktake_orders(uuid,uuid,uuid,uuid,text,text,integer,integer)
  SET plan_cache_mode='force_custom_plan';

DO $$
DECLARE v_function regprocedure;
BEGIN
  FOR v_function IN SELECT unnest(ARRAY[
    'public.get_warehouse_stocktake_settings(uuid,uuid,uuid)'::regprocedure,
    'public.get_warehouse_stocktake_order(uuid,uuid,uuid,uuid)'::regprocedure,
    'public.list_warehouse_stocktake_orders(uuid,uuid,uuid,uuid,text,text,integer,integer)'::regprocedure,
    'public.list_warehouse_stocktake_order_items(uuid,uuid,uuid,uuid,integer,integer)'::regprocedure
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',v_function);
  END LOOP;
END;
$$;

COMMIT;
