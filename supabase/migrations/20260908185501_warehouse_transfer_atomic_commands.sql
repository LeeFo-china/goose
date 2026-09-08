-- D1: same-tenant, single-confirmation atomic transfers. Do not enable before
-- the API recognizes transfer ledger sources. Forward rollback: disable the
-- independent flag, retain facts/receipts, correct through new reverse orders.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

ALTER TABLE public.tenant_supplier_settings
  ADD COLUMN warehouse_transfers_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenant_supplier_settings_transfers_parent_check CHECK(NOT warehouse_transfers_enabled OR module_enabled);
INSERT INTO public.permissions(code,name,module,resource,action,description,status) VALUES
  ('inventory.transfer.manage','管理仓库调拨','inventory','transfer','manage','保存、提交及取消当前租户仓库调拨单','active'),
  ('inventory.transfer.approve','确认仓库调拨','inventory','transfer','approve','原子确认当前租户双仓调拨','active');
-- Definitions only: no existing employee or role receives either permission.
CREATE SEQUENCE public.warehouse_transfer_order_number_seq;
CREATE TABLE public.warehouse_transfer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  order_no text NOT NULL DEFAULT ('WT-'||lpad(nextval('public.warehouse_transfer_order_number_seq')::text,10,'0')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  reason text NOT NULL CHECK(reason=btrim(reason) AND char_length(reason) BETWEEN 1 AND 500),
  created_by_employee_id uuid NOT NULL,
  updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE(tenant_id,order_no), UNIQUE(id,tenant_id),
  UNIQUE(id,tenant_id,source_warehouse_id,destination_warehouse_id),
  FOREIGN KEY(source_warehouse_id,tenant_id) REFERENCES public.warehouses(id,tenant_id),
  FOREIGN KEY(destination_warehouse_id,tenant_id) REFERENCES public.warehouses(id,tenant_id),
  FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  FOREIGN KEY(updated_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  CHECK(source_warehouse_id<>destination_warehouse_id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL)),
  CHECK(status NOT IN ('submitted','completed') OR submitted_at IS NOT NULL)
);
CREATE TABLE public.warehouse_transfer_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transfer_order_id uuid NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
  supplier_sku_id uuid NOT NULL REFERENCES public.supplier_skus(id),
  quantity numeric(18,4) NOT NULL CHECK(quantity>0 AND quantity<'Infinity'::numeric),
  unit_cost numeric(18,4) CHECK(unit_cost>=0 AND unit_cost<'Infinity'::numeric),
  amount numeric(18,2) CHECK(amount>=0 AND amount<'Infinity'::numeric),
  CHECK((unit_cost IS NULL)=(amount IS NULL)),
  UNIQUE(transfer_order_id,line_no), UNIQUE(transfer_order_id,supplier_sku_id),
  UNIQUE(id,tenant_id,source_warehouse_id,supplier_sku_id),
  UNIQUE(id,tenant_id,destination_warehouse_id,supplier_sku_id),
  FOREIGN KEY(transfer_order_id,tenant_id,source_warehouse_id,destination_warehouse_id)
    REFERENCES public.warehouse_transfer_orders(id,tenant_id,source_warehouse_id,destination_warehouse_id)
);
CREATE INDEX warehouse_transfer_orders_tenant_page_idx ON public.warehouse_transfer_orders(tenant_id,created_at DESC,id DESC);
CREATE INDEX warehouse_transfer_orders_source_status_page_idx ON public.warehouse_transfer_orders(tenant_id,source_warehouse_id,status,created_at DESC,id DESC);
CREATE INDEX warehouse_transfer_orders_destination_status_page_idx ON public.warehouse_transfer_orders(tenant_id,destination_warehouse_id,status,created_at DESC,id DESC);
-- Without these status-independent indexes, the measured source/destination
-- page scanned 9,020 tenant rows for 20 results when status was omitted.
CREATE INDEX warehouse_transfer_orders_source_page_idx ON public.warehouse_transfer_orders(tenant_id,source_warehouse_id,created_at DESC,id DESC);
CREATE INDEX warehouse_transfer_orders_destination_page_idx ON public.warehouse_transfer_orders(tenant_id,destination_warehouse_id,created_at DESC,id DESC);
CREATE TABLE public.warehouse_transfer_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  command text NOT NULL CHECK(command IN ('save_draft','submit','complete','cancel')),
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK(char_length(btrim(idempotency_key)) BETWEEN 1 AND 120 AND char_length(idempotency_key)<=120),
  request_fingerprint text NOT NULL,
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(order_id,tenant_id) REFERENCES public.warehouse_transfer_orders(id,tenant_id),
  FOREIGN KEY(actor_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  UNIQUE(actor_user_id,idempotency_key)
);
CREATE INDEX warehouse_transfer_events_order_idx ON public.warehouse_transfer_command_events(tenant_id,order_id,created_at DESC);
CREATE TRIGGER warehouse_transfer_events_immutable BEFORE UPDATE OR DELETE ON public.warehouse_transfer_command_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_fact_mutation();

ALTER TABLE public.inventory_transactions
  ADD COLUMN warehouse_transfer_out_item_id uuid,
  ADD COLUMN warehouse_transfer_in_item_id uuid,
  ADD CONSTRAINT inventory_transactions_transfer_out_fkey FOREIGN KEY(warehouse_transfer_out_item_id,tenant_id,warehouse_id,supplier_sku_id)
    REFERENCES public.warehouse_transfer_order_items(id,tenant_id,source_warehouse_id,supplier_sku_id),
  ADD CONSTRAINT inventory_transactions_transfer_in_fkey FOREIGN KEY(warehouse_transfer_in_item_id,tenant_id,warehouse_id,supplier_sku_id)
    REFERENCES public.warehouse_transfer_order_items(id,tenant_id,destination_warehouse_id,supplier_sku_id),
  DROP CONSTRAINT inventory_transactions_type_check,
  ADD CONSTRAINT inventory_transactions_type_check CHECK(transaction_type IN
    ('purchase_receipt','project_issue','project_return','supplier_return','adjustment_in','adjustment_out','transfer_out','transfer_in')),
  DROP CONSTRAINT inventory_transactions_material_source_check,
  ADD CONSTRAINT inventory_transactions_material_source_check CHECK(
    (warehouse_transfer_out_item_id IS NULL AND warehouse_transfer_in_item_id IS NULL
      AND transaction_type NOT IN ('transfer_out','transfer_in') AND (
      (source_type='supplier_purchase_receipt_item' AND warehouse_issue_item_id IS NULL AND warehouse_return_item_id IS NULL)
      OR(source_type='warehouse_issue_item' AND transaction_type='project_issue'
        AND warehouse_issue_item_id IS NOT NULL AND source_id=warehouse_issue_item_id AND warehouse_return_item_id IS NULL
        AND project_id IS NOT NULL AND cost_category_id IS NOT NULL AND quantity_delta<0 AND value_delta<=0)
      OR(source_type='warehouse_return_item' AND transaction_type='project_return'
        AND warehouse_return_item_id IS NOT NULL AND source_id=warehouse_return_item_id AND warehouse_issue_item_id IS NULL
        AND project_id IS NOT NULL AND cost_category_id IS NOT NULL AND quantity_delta>0 AND value_delta>=0)))
    OR(warehouse_issue_item_id IS NULL AND warehouse_return_item_id IS NULL
      AND project_id IS NULL AND cost_category_id IS NULL AND unit_cost<'Infinity'::numeric
      AND abs(quantity_delta)<'Infinity'::numeric AND abs(value_delta)<'Infinity'::numeric AND (
      (source_type='warehouse_transfer_out_item' AND transaction_type='transfer_out'
        AND warehouse_transfer_out_item_id IS NOT NULL AND source_id=warehouse_transfer_out_item_id
        AND warehouse_transfer_in_item_id IS NULL AND quantity_delta<0 AND value_delta<=0)
      OR(source_type='warehouse_transfer_in_item' AND transaction_type='transfer_in'
        AND warehouse_transfer_in_item_id IS NOT NULL AND source_id=warehouse_transfer_in_item_id
        AND warehouse_transfer_out_item_id IS NULL AND quantity_delta>0 AND value_delta>=0)))
  );

CREATE FUNCTION public.__gooes_transfer_guard_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_TABLE_NAME='warehouse_transfer_orders' THEN
    IF OLD.status IN ('completed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_IMMUTABLE';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.source_warehouse_id,NEW.destination_warehouse_id)
      IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.source_warehouse_id,OLD.destination_warehouse_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_SOURCE_CONFLICT';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.warehouse_transfer_orders WHERE status IN ('completed','cancelled')
      AND id IN (CASE WHEN TG_OP<>'INSERT' THEN OLD.transfer_order_id END,
        CASE WHEN TG_OP<>'DELETE' THEN NEW.transfer_order_id END)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_transfer_orders_guard BEFORE UPDATE OR DELETE ON public.warehouse_transfer_orders
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_transfer_guard_document();
CREATE TRIGGER warehouse_transfer_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.warehouse_transfer_order_items
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_transfer_guard_document();

CREATE FUNCTION public.__gooes_transfer_assert_actor(p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_TRANSFER_FORBIDDEN';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employees e JOIN public.tenants t ON t.id=e.tenant_id
    WHERE e.tenant_id=p_tenant_id AND e.id=p_actor_employee_id AND e.user_id=p_actor_user_id
      AND e.status='active' AND t.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_TRANSFER_ACTOR_INVALID';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_transfer_assert_permission(p_tenant_id uuid,p_actor_employee_id uuid,p_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,p_permission) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_TRANSFER_FORBIDDEN';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_transfer_assert_skus(p_tenant_id uuid,p_skus uuid[])
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF cardinality(p_skus) NOT BETWEEN 1 AND 100 OR p_skus IS NULL OR
    (SELECT count(*) FROM public.supplier_skus sku JOIN public.supplier_products product
      ON product.id=sku.supplier_product_id AND product.supplier_id=sku.supplier_id
      WHERE sku.id=ANY(p_skus) AND sku.status='active' AND product.status='active'
        AND sku.ownership_scope=product.ownership_scope AND sku.owner_tenant_id IS NOT DISTINCT FROM product.owner_tenant_id
        AND ((sku.ownership_scope='platform' AND sku.owner_tenant_id IS NULL)
          OR(sku.ownership_scope='tenant' AND sku.owner_tenant_id=p_tenant_id)))<>cardinality(p_skus) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_SKU_INVALID';
  END IF;
END;
$$;

CREATE FUNCTION public.command_warehouse_transfer_order(
  p_order_id uuid,p_tenant_id uuid,p_command text,p_expected_version integer,
  p_payload jsonb,p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.warehouse_transfer_orders%ROWTYPE; v_event public.warehouse_transfer_command_events%ROWTYPE;
  v_source_id uuid; v_destination_id uuid; v_fingerprint text; v_permission text; v_items jsonb; v_json jsonb;
  v_reason text; v_skus uuid[]; v_count integer; v_result jsonb; v_status text;
  v_item public.warehouse_transfer_order_items%ROWTYPE;
  v_source public.inventory_balances%ROWTYPE; v_destination public.inventory_balances%ROWTYPE;
  v_unit_cost numeric; v_amount numeric; v_quantity numeric; v_value numeric; v_average numeric;
BEGIN
  PERFORM public.__gooes_transfer_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF p_order_id IS NULL OR p_command IS NULL OR p_command NOT IN ('save_draft','submit','complete','cancel')
    OR p_expected_version IS NULL OR p_expected_version<0
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 120
    OR char_length(p_idempotency_key)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_INVALID';
  END IF;
  v_permission:=CASE p_command WHEN 'complete' THEN 'inventory.transfer.approve' ELSE 'inventory.transfer.manage' END;
  PERFORM public.__gooes_transfer_assert_permission(p_tenant_id,p_actor_employee_id,v_permission);
  IF p_command='save_draft' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>ALL(ARRAY['source_warehouse_id','destination_warehouse_id','reason','items']))
      OR COALESCE(p_payload->>'source_warehouse_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(p_payload->>'destination_warehouse_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
      OR char_length(btrim(p_payload->>'reason')) NOT BETWEEN 1 AND 500
      OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_INVALID';
    END IF;
    v_source_id:=(p_payload->>'source_warehouse_id')::uuid;
    v_destination_id:=(p_payload->>'destination_warehouse_id')::uuid;
    IF v_source_id=v_destination_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_WAREHOUSE_INVALID'; END IF;
    v_reason:=btrim(p_payload->>'reason'); v_items:=p_payload->'items';
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_ITEMS_INVALID';
    END IF;
    FOR v_json IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      IF jsonb_typeof(v_json)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_ITEMS_INVALID'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_json) k WHERE k<>ALL(ARRAY['supplier_sku_id','quantity']))
        OR COALESCE(v_json->>'supplier_sku_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR jsonb_typeof(v_json->'quantity') IS DISTINCT FROM 'string'
        OR COALESCE(v_json->>'quantity','') !~ '^(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_ITEMS_INVALID';
      END IF;
      IF (v_json->>'quantity')::numeric<=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_ITEMS_INVALID'; END IF;
    END LOOP;
    SELECT array_agg(DISTINCT (value->>'supplier_sku_id')::uuid) INTO v_skus FROM jsonb_array_elements(v_items);
    IF cardinality(v_skus)<>jsonb_array_length(v_items) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_ITEMS_INVALID';
    END IF;
  ELSIF p_payload<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_INVALID';
  END IF;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant_id',p_tenant_id,'order_id',p_order_id,'command',p_command,
    'expected_version',p_expected_version,'payload',p_payload,'actor_employee_id',p_actor_employee_id)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-transfer-key:'||p_actor_user_id||':'||p_idempotency_key,0));
  SELECT * INTO v_event FROM public.warehouse_transfer_command_events WHERE actor_user_id=p_actor_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_event.request_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.result; -- Current identity/permission checked; operational state intentionally not rechecked.
  END IF;
  IF p_command<>'save_draft' THEN
    SELECT * INTO v_order FROM public.warehouse_transfer_orders WHERE id=p_order_id AND tenant_id=p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_NOT_FOUND'; END IF;
    v_source_id:=v_order.source_warehouse_id; v_destination_id:=v_order.destination_warehouse_id;
  END IF;
  -- Global order compatible with receipts/material commands. BOTH warehouses
  -- sorted independently of transfer direction; balances use the same order.
  PERFORM 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id AND module_enabled AND warehouse_transfers_enabled) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_NOT_ENABLED';
  END IF;
  PERFORM id FROM public.warehouses WHERE tenant_id=p_tenant_id AND id IN (v_source_id,v_destination_id) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>2 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_WAREHOUSE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.warehouses WHERE id IN (v_source_id,v_destination_id) AND status<>'active') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_WAREHOUSE_INACTIVE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-transfer-order:'||p_order_id,0));
  SELECT * INTO v_order FROM public.warehouse_transfer_orders WHERE id=p_order_id FOR UPDATE;
  IF FOUND THEN
    IF v_order.tenant_id<>p_tenant_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_NOT_FOUND'; END IF;
    IF v_order.version<>p_expected_version OR v_order.version=2147483647 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_VERSION_CONFLICT';
    END IF;
    IF v_order.source_warehouse_id<>v_source_id OR v_order.destination_warehouse_id<>v_destination_id THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_SOURCE_CONFLICT';
    END IF;
    IF NOT ((p_command IN ('save_draft','submit') AND v_order.status='draft')
      OR(p_command='complete' AND v_order.status='submitted') OR(p_command='cancel' AND v_order.status IN ('draft','submitted'))) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_STATE_CONFLICT';
    END IF;
  ELSIF p_command<>'save_draft' OR p_expected_version<>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_VERSION_CONFLICT';
  END IF;
  IF p_command='save_draft' THEN
    PERFORM public.__gooes_transfer_assert_skus(p_tenant_id,v_skus);
    IF v_order.id IS NULL THEN
      INSERT INTO public.warehouse_transfer_orders(id,tenant_id,source_warehouse_id,destination_warehouse_id,reason,created_by_employee_id,updated_by_employee_id)
        VALUES(p_order_id,p_tenant_id,v_source_id,v_destination_id,v_reason,p_actor_employee_id,p_actor_employee_id);
    END IF;
    DELETE FROM public.warehouse_transfer_order_items WHERE transfer_order_id=p_order_id;
    INSERT INTO public.warehouse_transfer_order_items(tenant_id,transfer_order_id,source_warehouse_id,destination_warehouse_id,line_no,supplier_sku_id,quantity)
      SELECT p_tenant_id,p_order_id,v_source_id,v_destination_id,ordinality,(value->>'supplier_sku_id')::uuid,(value->>'quantity')::numeric
      FROM jsonb_array_elements(v_items) WITH ORDINALITY;
  ELSIF p_command IN ('submit','complete') THEN
    SELECT array_agg(supplier_sku_id) INTO v_skus FROM public.warehouse_transfer_order_items WHERE transfer_order_id=p_order_id;
    PERFORM public.__gooes_transfer_assert_skus(p_tenant_id,v_skus);
  END IF;
  IF p_command='complete' THEN
    INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id)
      SELECT p_tenant_id,v_destination_id,sku FROM unnest(v_skus) sku ORDER BY sku
      ON CONFLICT(tenant_id,warehouse_id,supplier_sku_id) DO NOTHING;
    PERFORM id FROM public.inventory_balances WHERE tenant_id=p_tenant_id
      AND warehouse_id IN (v_source_id,v_destination_id) AND supplier_sku_id=ANY(v_skus)
      ORDER BY warehouse_id,supplier_sku_id FOR UPDATE;
    FOR v_item IN SELECT * FROM public.warehouse_transfer_order_items WHERE transfer_order_id=p_order_id ORDER BY supplier_sku_id LOOP
      SELECT * INTO v_source FROM public.inventory_balances
        WHERE tenant_id=p_tenant_id AND warehouse_id=v_source_id AND supplier_sku_id=v_item.supplier_sku_id;
      IF NOT FOUND OR v_source.quantity_on_hand<v_item.quantity THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_INSUFFICIENT_STOCK';
      END IF;
      SELECT * INTO STRICT v_destination FROM public.inventory_balances
        WHERE tenant_id=p_tenant_id AND warehouse_id=v_destination_id AND supplier_sku_id=v_item.supplier_sku_id;
      IF v_source.quantity_on_hand>='Infinity'::numeric OR v_source.inventory_value>='Infinity'::numeric
        OR v_destination.quantity_on_hand>='Infinity'::numeric OR v_destination.inventory_value>='Infinity'::numeric
        OR (v_destination.quantity_on_hand=0 AND v_destination.inventory_value<>0)
        OR v_source.version=2147483647 OR v_destination.version=2147483647 THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_BALANCE_INVALID';
      END IF;
      v_unit_cost:=round(v_source.inventory_value/v_source.quantity_on_hand,4);
      v_amount:=CASE WHEN v_item.quantity=v_source.quantity_on_hand THEN v_source.inventory_value
        ELSE round(v_item.quantity*v_source.inventory_value/v_source.quantity_on_hand,2) END;
      v_quantity:=v_destination.quantity_on_hand+v_item.quantity; v_value:=v_destination.inventory_value+v_amount;
      v_average:=round(v_value/v_quantity,4);
      IF v_unit_cost>=1e14 OR v_quantity>=1e14 OR v_value>=1e16 OR v_average>=1e14
        OR (v_source.quantity_on_hand>v_item.quantity
          AND round((v_source.inventory_value-v_amount)/(v_source.quantity_on_hand-v_item.quantity),4)>=1e14) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_BALANCE_INVALID';
      END IF;
      UPDATE public.warehouse_transfer_order_items SET unit_cost=v_unit_cost,amount=v_amount WHERE id=v_item.id;
      INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,
        source_type,source_id,warehouse_transfer_out_item_id,occurred_at,created_by_employee_id)
        VALUES(p_tenant_id,v_source_id,v_item.supplier_sku_id,'transfer_out',-v_item.quantity,v_unit_cost,-v_amount,
          'warehouse_transfer_out_item',v_item.id,v_item.id,now(),p_actor_employee_id);
      INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,
        source_type,source_id,warehouse_transfer_in_item_id,occurred_at,created_by_employee_id)
        VALUES(p_tenant_id,v_destination_id,v_item.supplier_sku_id,'transfer_in',v_item.quantity,v_unit_cost,v_amount,
          'warehouse_transfer_in_item',v_item.id,v_item.id,now(),p_actor_employee_id);
      UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-v_item.quantity,inventory_value=inventory_value-v_amount,
        average_unit_cost=CASE WHEN quantity_on_hand=v_item.quantity THEN 0
          ELSE round((inventory_value-v_amount)/(quantity_on_hand-v_item.quantity),4) END,
        version=version+1,updated_at=now() WHERE id=v_source.id;
      UPDATE public.inventory_balances SET quantity_on_hand=v_quantity,inventory_value=v_value,average_unit_cost=v_average,
        version=version+1,updated_at=now() WHERE id=v_destination.id;
    END LOOP;
  END IF;
  v_status:=CASE p_command WHEN 'save_draft' THEN 'draft' WHEN 'submit' THEN 'submitted' WHEN 'complete' THEN 'completed' ELSE 'cancelled' END;
  UPDATE public.warehouse_transfer_orders SET status=v_status,version=p_expected_version+1,
    reason=CASE WHEN p_command='save_draft' THEN v_reason ELSE reason END,
    updated_by_employee_id=p_actor_employee_id,updated_at=now(),
    submitted_at=CASE WHEN p_command='submit' THEN now() ELSE submitted_at END,
    completed_at=CASE WHEN p_command='complete' THEN now() ELSE completed_at END,
    cancelled_at=CASE WHEN p_command='cancel' THEN now() ELSE cancelled_at END
    WHERE id=p_order_id RETURNING * INTO v_order;
  v_result:=jsonb_build_object('status',CASE WHEN p_command='save_draft' THEN 'saved' ELSE v_status END,'order',to_jsonb(v_order));
  INSERT INTO public.warehouse_transfer_command_events(tenant_id,order_id,command,actor_user_id,actor_employee_id,idempotency_key,request_fingerprint,result)
    VALUES(p_tenant_id,p_order_id,p_command,p_actor_user_id,p_actor_employee_id,p_idempotency_key,v_fingerprint,v_result);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.get_warehouse_transfer_order(p_tenant_id uuid,p_order_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.__gooes_transfer_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  PERFORM public.__gooes_transfer_assert_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view');
  SELECT to_jsonb(o)||jsonb_build_object('source_warehouse_name',s.name,'destination_warehouse_name',d.name,
    'item_count',items.item_count,'total_amount',items.total_amount) INTO v_result
    FROM public.warehouse_transfer_orders o JOIN public.warehouses s ON s.id=o.source_warehouse_id
    JOIN public.warehouses d ON d.id=o.destination_warehouse_id
    CROSS JOIN LATERAL(SELECT count(*) item_count,sum(amount)::text total_amount
      FROM public.warehouse_transfer_order_items WHERE transfer_order_id=o.id) items
    WHERE o.tenant_id=p_tenant_id AND o.id=p_order_id;
  IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_NOT_FOUND'; END IF;
  RETURN v_result;
END;
$$;
CREATE FUNCTION public.list_warehouse_transfer_orders(
  p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid,p_source_warehouse_id uuid DEFAULT NULL,
  p_destination_warehouse_id uuid DEFAULT NULL,p_status text DEFAULT NULL,p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_total bigint; v_items jsonb;
BEGIN
  PERFORM public.__gooes_transfer_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  PERFORM public.__gooes_transfer_assert_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view');
  p_page:=coalesce(p_page,1); p_page_size:=coalesce(p_page_size,20); p_keyword:=nullif(btrim(p_keyword),'');
  IF p_page<1 OR p_page_size NOT BETWEEN 1 AND 100 OR char_length(p_keyword)>100
    OR (p_status IS NOT NULL AND p_status NOT IN ('draft','submitted','completed','cancelled')) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_INVALID';
  END IF;
  SELECT count(*) INTO v_total FROM public.warehouse_transfer_orders o WHERE o.tenant_id=p_tenant_id
    AND (p_source_warehouse_id IS NULL OR o.source_warehouse_id=p_source_warehouse_id)
    AND (p_destination_warehouse_id IS NULL OR o.destination_warehouse_id=p_destination_warehouse_id)
    AND (p_status IS NULL OR o.status=p_status)
    AND (p_keyword IS NULL OR strpos(lower(o.order_no),lower(p_keyword))>0 OR strpos(lower(o.reason),lower(p_keyword))>0);
  -- Materialize the <=100 page first. Aggregate only its <=10,000 item rows,
  -- not every tenant item and not one RPC/subquery per returned document.
  WITH page AS MATERIALIZED(
    SELECT o.* FROM public.warehouse_transfer_orders o WHERE o.tenant_id=p_tenant_id
      AND (p_source_warehouse_id IS NULL OR o.source_warehouse_id=p_source_warehouse_id)
      AND (p_destination_warehouse_id IS NULL OR o.destination_warehouse_id=p_destination_warehouse_id)
      AND (p_status IS NULL OR o.status=p_status)
      AND (p_keyword IS NULL OR strpos(lower(o.order_no),lower(p_keyword))>0 OR strpos(lower(o.reason),lower(p_keyword))>0)
      ORDER BY o.created_at DESC,o.id DESC LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
  ), totals AS(
    SELECT i.transfer_order_id,count(*) item_count,sum(i.amount)::text total_amount
      FROM page p JOIN public.warehouse_transfer_order_items i ON i.transfer_order_id=p.id GROUP BY i.transfer_order_id
  ) SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('source_warehouse_name',s.name,'destination_warehouse_name',d.name,
      'item_count',coalesce(t.item_count,0),'total_amount',t.total_amount) ORDER BY p.created_at DESC,p.id DESC),'[]'::jsonb)
    INTO v_items FROM page p JOIN public.warehouses s ON s.id=p.source_warehouse_id
      JOIN public.warehouses d ON d.id=p.destination_warehouse_id LEFT JOIN totals t ON t.transfer_order_id=p.id;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_page_size);
END;
$$;
CREATE FUNCTION public.list_warehouse_transfer_order_items(
  p_tenant_id uuid,p_order_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_total bigint; v_items jsonb;
BEGIN
  PERFORM public.__gooes_transfer_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  PERFORM public.__gooes_transfer_assert_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view');
  p_page:=coalesce(p_page,1); p_page_size:=coalesce(p_page_size,20);
  IF p_page<1 OR p_page_size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_TRANSFER_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouse_transfer_orders WHERE id=p_order_id AND tenant_id=p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_TRANSFER_NOT_FOUND';
  END IF;
  SELECT count(*) INTO v_total FROM public.warehouse_transfer_order_items WHERE transfer_order_id=p_order_id;
  SELECT coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('quantity',i.quantity::text,'unit_cost',i.unit_cost::text,
    'amount',i.amount::text,'sku_name',s.name,'sku_code',s.sku_code) ORDER BY i.line_no,i.id),'[]'::jsonb) INTO v_items
    FROM(SELECT * FROM public.warehouse_transfer_order_items WHERE transfer_order_id=p_order_id
      ORDER BY line_no,id LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size) i
    JOIN public.supplier_skus s ON s.id=i.supplier_sku_id;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'pageSize',p_page_size);
END;
$$;
-- Optional filters vary strongly in selectivity. A reproduced generic plan
-- scanned all 20,005 items for one page. As with list_inventory_transactions,
-- replan only this RPC: small planning CPU cost, caller/session settings intact.
ALTER FUNCTION public.list_warehouse_transfer_orders(uuid,uuid,uuid,uuid,uuid,text,text,integer,integer)
  SET plan_cache_mode='force_custom_plan';
CREATE FUNCTION public.get_warehouse_transfer_settings(p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.__gooes_transfer_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF NOT (public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view')
    OR public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.transfer.manage')
    OR public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.transfer.approve')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_TRANSFER_FORBIDDEN';
  END IF;
  RETURN jsonb_build_object('warehouse_transfers_enabled',EXISTS(SELECT 1 FROM public.tenant_supplier_settings
    WHERE tenant_id=p_tenant_id AND module_enabled AND warehouse_transfers_enabled));
END;
$$;
DO $$
DECLARE v_table text; v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['warehouse_transfer_orders','warehouse_transfer_order_items','warehouse_transfer_command_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',v_table);
  END LOOP;
  FOR v_function IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE '__gooes_transfer_%' OR proname IN ('command_warehouse_transfer_order','get_warehouse_transfer_order',
      'list_warehouse_transfer_orders','list_warehouse_transfer_order_items','get_warehouse_transfer_settings')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_function);
    IF v_function::text NOT LIKE '__gooes_transfer_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',v_function);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON SEQUENCE public.warehouse_transfer_order_number_seq FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
