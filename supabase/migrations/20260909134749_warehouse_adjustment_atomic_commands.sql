-- D2.2 independent signed quantity adjustments. No role grants or rollout changes.
-- Forward rollback: disable warehouse_adjustments_enabled; preserve immutable
-- stock facts and receipts, and correct via a new reviewed adjustment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

ALTER TABLE public.tenant_supplier_settings
  ADD COLUMN warehouse_adjustments_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenant_supplier_settings_adjustments_parent_check CHECK(NOT warehouse_adjustments_enabled OR module_enabled);
INSERT INTO public.permissions(code,name,module,resource,action,description,status) VALUES
  ('inventory.adjustment.manage','管理仓库手工调整','inventory','adjustment','manage','保存、提交及取消当前租户仓库手工调整','active'),
  ('inventory.adjustment.approve','确认仓库手工调整','inventory','adjustment','approve','按冻结账面快照原子确认当前租户仓库手工调整','active');
CREATE SEQUENCE public.warehouse_adjustment_order_number_seq;
CREATE TABLE public.warehouse_adjustment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), warehouse_id uuid NOT NULL,
  order_no text NOT NULL DEFAULT ('WA-'||lpad(nextval('public.warehouse_adjustment_order_number_seq')::text,10,'0')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  reason text NOT NULL CHECK(public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(reason)) BETWEEN 1 AND 500),
  created_by_employee_id uuid NOT NULL, updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  UNIQUE(tenant_id,order_no), UNIQUE(id,tenant_id), UNIQUE(id,tenant_id,warehouse_id),
  FOREIGN KEY(warehouse_id,tenant_id) REFERENCES public.warehouses(id,tenant_id),
  FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  FOREIGN KEY(updated_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL)),
  CHECK(status NOT IN ('submitted','completed') OR submitted_at IS NOT NULL),
  CHECK(status<>'draft' OR submitted_at IS NULL),
  CHECK(updated_at>=created_at AND (submitted_at IS NULL OR submitted_at>=created_at)
    AND (completed_at IS NULL OR completed_at>=submitted_at) AND (cancelled_at IS NULL OR cancelled_at>=created_at))
);
CREATE TABLE public.warehouse_adjustment_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  adjustment_order_id uuid NOT NULL, warehouse_id uuid NOT NULL,
  line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
  supplier_sku_id uuid NOT NULL REFERENCES public.supplier_skus(id),
  quantity_delta numeric(18,4) NOT NULL CHECK(quantity_delta<>0 AND abs(quantity_delta)<'Infinity'::numeric),
  adjustment_reason text NOT NULL CHECK(public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(adjustment_reason)) BETWEEN 1 AND 500),
  snapshot_at timestamptz, book_balance_id uuid, book_balance_version integer CHECK(book_balance_version>0),
  book_quantity numeric(18,4) CHECK(book_quantity>0 AND book_quantity<'Infinity'::numeric),
  book_value numeric(18,2) CHECK(book_value>=0 AND book_value<'Infinity'::numeric),
  book_unit_cost numeric(18,4) CHECK(book_unit_cost>=0 AND book_unit_cost<'Infinity'::numeric),
  unit_cost numeric(18,4) CHECK(unit_cost>=0 AND unit_cost<'Infinity'::numeric),
  amount numeric(18,2) CHECK(amount>=0 AND amount<'Infinity'::numeric),
  CHECK((unit_cost IS NULL)=(amount IS NULL)),
  CHECK((snapshot_at IS NULL AND book_balance_id IS NULL AND book_balance_version IS NULL
      AND book_quantity IS NULL AND book_value IS NULL AND book_unit_cost IS NULL AND amount IS NULL)
    OR (snapshot_at IS NOT NULL AND book_balance_id IS NOT NULL AND book_balance_version IS NOT NULL
      AND book_quantity IS NOT NULL AND book_value IS NOT NULL AND book_unit_cost IS NOT NULL)),
  UNIQUE(adjustment_order_id,line_no), UNIQUE(adjustment_order_id,supplier_sku_id),
  UNIQUE(id,tenant_id,warehouse_id,supplier_sku_id),
  FOREIGN KEY(adjustment_order_id,tenant_id,warehouse_id) REFERENCES public.warehouse_adjustment_orders(id,tenant_id,warehouse_id)
);
-- Historical balance identity is intentionally not a foreign key: deletion and
-- recreation must produce SNAPSHOT_CONFLICT at completion.
CREATE INDEX warehouse_adjustment_orders_tenant_page_idx ON public.warehouse_adjustment_orders(tenant_id,created_at DESC,id DESC);
CREATE INDEX warehouse_adjustment_orders_status_page_idx ON public.warehouse_adjustment_orders(tenant_id,status,created_at DESC,id DESC);
CREATE INDEX warehouse_adjustment_orders_warehouse_page_idx ON public.warehouse_adjustment_orders(tenant_id,warehouse_id,created_at DESC,id DESC);
CREATE INDEX warehouse_adjustment_orders_warehouse_status_page_idx ON public.warehouse_adjustment_orders(tenant_id,warehouse_id,status,created_at DESC,id DESC);
CREATE TABLE public.warehouse_adjustment_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, order_id uuid NOT NULL,
  command text NOT NULL CHECK(command IN ('save_draft','submit','complete','cancel')),
  actor_user_id uuid NOT NULL, actor_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK(char_length(public.__gooes_stocktake_trim(idempotency_key)) BETWEEN 1 AND 120 AND char_length(idempotency_key)<=120),
  request_fingerprint text NOT NULL, result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(order_id,tenant_id) REFERENCES public.warehouse_adjustment_orders(id,tenant_id),
  FOREIGN KEY(actor_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  UNIQUE(actor_user_id,idempotency_key)
);
CREATE INDEX warehouse_adjustment_events_order_idx ON public.warehouse_adjustment_command_events(tenant_id,order_id,created_at DESC);
CREATE TRIGGER warehouse_adjustment_events_immutable BEFORE UPDATE OR DELETE ON public.warehouse_adjustment_command_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_fact_mutation();
ALTER TABLE public.inventory_transactions
  ADD COLUMN warehouse_adjustment_item_id uuid,
  ADD CONSTRAINT inventory_transactions_adjustment_fkey FOREIGN KEY(warehouse_adjustment_item_id,tenant_id,warehouse_id,supplier_sku_id)
    REFERENCES public.warehouse_adjustment_order_items(id,tenant_id,warehouse_id,supplier_sku_id);
-- Wrap the original expression intact instead of rewriting its legacy branches.
DO $$
DECLARE original_expression text;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression FROM pg_constraint
    WHERE conrelid='public.inventory_transactions'::regclass AND conname='inventory_transactions_material_source_check';
  ALTER TABLE public.inventory_transactions DROP CONSTRAINT inventory_transactions_material_source_check;
  EXECUTE 'ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_material_source_check CHECK ('||
    '(warehouse_adjustment_item_id IS NULL AND ('||original_expression||')) OR ('||
    'source_type=''warehouse_adjustment_item'' AND warehouse_adjustment_item_id IS NOT NULL AND source_id=warehouse_adjustment_item_id '||
    'AND warehouse_issue_item_id IS NULL AND warehouse_return_item_id IS NULL '||
    'AND warehouse_transfer_out_item_id IS NULL AND warehouse_transfer_in_item_id IS NULL AND warehouse_stocktake_item_id IS NULL '||
    'AND project_id IS NULL AND cost_category_id IS NULL AND unit_cost>=0 AND unit_cost<''Infinity''::numeric '||
    'AND abs(quantity_delta)<''Infinity''::numeric AND abs(value_delta)<''Infinity''::numeric '||
    'AND ((transaction_type=''adjustment_in'' AND quantity_delta>0 AND value_delta>=0) '||
    'OR (transaction_type=''adjustment_out'' AND quantity_delta<0 AND value_delta<=0))))';
END;
$$;

CREATE FUNCTION public.__gooes_adjustment_assert_actor(p_tenant_id uuid,p_user_id uuid,p_employee_id uuid,p_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_ADJUSTMENT_FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employees e JOIN public.tenants t ON t.id=e.tenant_id
    WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id AND e.user_id=p_user_id AND e.status='active' AND t.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_ADJUSTMENT_ACTOR_INVALID';
  END IF;
  IF NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_employee_id,p_permission) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_ADJUSTMENT_FORBIDDEN';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_adjustment_assert_skus(p_tenant_id uuid,p_skus uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_skus IS NULL OR cardinality(p_skus) NOT BETWEEN 1 AND 100 OR
    (SELECT count(*) FROM public.supplier_skus s JOIN public.supplier_products p ON p.id=s.supplier_product_id AND p.supplier_id=s.supplier_id
      WHERE s.id=ANY(p_skus) AND s.status='active' AND p.status='active' AND s.ownership_scope=p.ownership_scope
        AND s.owner_tenant_id IS NOT DISTINCT FROM p.owner_tenant_id AND ((s.ownership_scope='platform' AND s.owner_tenant_id IS NULL)
          OR (s.ownership_scope='tenant' AND s.owner_tenant_id=p_tenant_id)))<>cardinality(p_skus) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SKU_INVALID';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_adjustment_guard_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_status text; new_status text;
BEGIN
  IF TG_TABLE_NAME='warehouse_adjustment_orders' THEN
    IF OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_IMMUTABLE'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.warehouse_id,NEW.created_at,NEW.created_by_employee_id,NEW.order_no)
      IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.warehouse_id,OLD.created_at,OLD.created_by_employee_id,OLD.order_no) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SOURCE_CONFLICT';
    END IF;
    IF OLD.status='submitted' AND (TG_OP='DELETE' OR NEW.status='draft'
      OR (NEW.reason,NEW.submitted_at) IS DISTINCT FROM (OLD.reason,OLD.submitted_at)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SNAPSHOT_IMMUTABLE';
    END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN SELECT status INTO old_status FROM public.warehouse_adjustment_orders WHERE id=OLD.adjustment_order_id; END IF;
    IF TG_OP<>'DELETE' THEN SELECT status INTO new_status FROM public.warehouse_adjustment_orders WHERE id=NEW.adjustment_order_id; END IF;
    IF old_status IN ('completed','cancelled') OR new_status IN ('completed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_IMMUTABLE';
    END IF;
    IF (TG_OP='INSERT' AND new_status<>'draft') OR (TG_OP='DELETE' AND old_status<>'draft') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SNAPSHOT_IMMUTABLE';
    END IF;
    IF TG_OP='UPDATE' AND (old_status<>'draft' OR new_status<>'draft') AND
      (NEW.id,NEW.tenant_id,NEW.adjustment_order_id,NEW.warehouse_id,NEW.line_no,NEW.supplier_sku_id,
        NEW.quantity_delta,NEW.adjustment_reason,NEW.snapshot_at,NEW.book_balance_id,NEW.book_balance_version,
        NEW.book_quantity,NEW.book_value,NEW.book_unit_cost)
      IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.adjustment_order_id,OLD.warehouse_id,OLD.line_no,OLD.supplier_sku_id,
        OLD.quantity_delta,OLD.adjustment_reason,OLD.snapshot_at,OLD.book_balance_id,OLD.book_balance_version,
        OLD.book_quantity,OLD.book_value,OLD.book_unit_cost) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SNAPSHOT_IMMUTABLE';
    END IF;
    IF TG_OP='UPDATE' AND OLD.amount IS NOT NULL AND (NEW.unit_cost,NEW.amount) IS DISTINCT FROM (OLD.unit_cost,OLD.amount) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_adjustment_orders_guard BEFORE UPDATE OR DELETE ON public.warehouse_adjustment_orders
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_adjustment_guard_document();
CREATE TRIGGER warehouse_adjustment_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.warehouse_adjustment_order_items
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_adjustment_guard_document();
CREATE FUNCTION public.__gooes_adjustment_bind_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.source_type='warehouse_adjustment_item' OR NEW.warehouse_adjustment_item_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.warehouse_adjustment_order_items i JOIN public.warehouse_adjustment_orders o ON o.id=i.adjustment_order_id
      WHERE i.id=NEW.warehouse_adjustment_item_id AND NEW.source_id=i.id AND NEW.tenant_id=i.tenant_id
        AND NEW.warehouse_id=i.warehouse_id AND NEW.supplier_sku_id=i.supplier_sku_id
        AND NEW.source_type='warehouse_adjustment_item' AND o.status IN ('submitted','completed')
        AND i.snapshot_at IS NOT NULL AND NEW.quantity_delta=i.quantity_delta
        AND NEW.unit_cost=i.unit_cost AND NEW.value_delta=sign(i.quantity_delta)*i.amount
        AND NEW.transaction_type=CASE WHEN i.quantity_delta>0 THEN 'adjustment_in' ELSE 'adjustment_out' END
        AND NEW.project_id IS NULL AND NEW.cost_category_id IS NULL AND NEW.warehouse_issue_item_id IS NULL
        AND NEW.warehouse_return_item_id IS NULL AND NEW.warehouse_transfer_out_item_id IS NULL
        AND NEW.warehouse_transfer_in_item_id IS NULL AND NEW.warehouse_stocktake_item_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SOURCE_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_adjustment_transaction_source BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_adjustment_bind_source();

CREATE FUNCTION public.command_warehouse_adjustment_order(
  p_order_id uuid,p_tenant_id uuid,p_command text,p_expected_version integer,p_payload jsonb,
  p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.warehouse_adjustment_orders%ROWTYPE; v_event public.warehouse_adjustment_command_events%ROWTYPE;
  v_item public.warehouse_adjustment_order_items%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
  v_warehouse_id uuid; v_skus uuid[]; v_items jsonb; v_json jsonb; v_reason text; v_row record;
  v_fingerprint text; v_status text; v_result jsonb; v_calculations jsonb:='[]';
  v_quantity numeric; v_unit_cost numeric; v_amount numeric; v_value numeric; v_average numeric;
BEGIN
  -- Revocation and disabled identities take precedence even over frozen replay.
  PERFORM public.__gooes_adjustment_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,
    CASE WHEN p_command='complete' THEN 'inventory.adjustment.approve' ELSE 'inventory.adjustment.manage' END);
  IF p_order_id IS NULL OR NOT public.__gooes_stocktake_uuid_valid(p_order_id::text)
    OR p_command IS NULL OR p_command NOT IN ('save_draft','submit','complete','cancel')
    OR p_expected_version IS NULL OR p_expected_version<0 OR (p_command<>'save_draft' AND p_expected_version=0)
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_idempotency_key IS NULL
    OR char_length(public.__gooes_stocktake_trim(p_idempotency_key)) NOT BETWEEN 1 AND 120 OR char_length(p_idempotency_key)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_INVALID';
  END IF;
  IF p_command='save_draft' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>ALL(ARRAY['warehouse_id','reason','items']))
      OR jsonb_typeof(p_payload->'warehouse_id') IS DISTINCT FROM 'string'
      OR NOT public.__gooes_stocktake_uuid_valid(coalesce(p_payload->>'warehouse_id',''))
      OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
      OR public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(p_payload->>'reason')) NOT BETWEEN 1 AND 500
      OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_INVALID';
    END IF;
    v_warehouse_id:=(p_payload->>'warehouse_id')::uuid;
    v_reason:=public.__gooes_stocktake_trim(p_payload->>'reason');
    v_items:=p_payload->'items';
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_ITEMS_INVALID'; END IF;
    FOR v_json IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      IF jsonb_typeof(v_json)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_ITEMS_INVALID'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_json) k WHERE k<>ALL(ARRAY['supplier_sku_id','quantity_delta','adjustment_reason']))
        OR jsonb_typeof(v_json->'supplier_sku_id') IS DISTINCT FROM 'string'
        OR NOT public.__gooes_stocktake_uuid_valid(coalesce(v_json->>'supplier_sku_id',''))
        OR jsonb_typeof(v_json->'quantity_delta') IS DISTINCT FROM 'string'
        OR coalesce(v_json->>'quantity_delta','') !~ '\A-?(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?\Z'
        OR jsonb_typeof(v_json->'adjustment_reason') IS DISTINCT FROM 'string'
        OR public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(v_json->>'adjustment_reason')) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_ITEMS_INVALID';
      END IF;
      -- Cast only after textual precision/range validation; never round input.
      IF (v_json->>'quantity_delta')::numeric=0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_ITEMS_INVALID'; END IF;
    END LOOP;
    SELECT array_agg(DISTINCT (value->>'supplier_sku_id')::uuid) INTO v_skus FROM jsonb_array_elements(v_items);
    IF cardinality(v_skus)<>jsonb_array_length(v_items) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_ITEMS_INVALID'; END IF;
  ELSIF p_payload<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_ADJUSTMENT_INVALID';
  END IF;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant_id',p_tenant_id,'order_id',p_order_id,'command',p_command,
    'expected_version',p_expected_version,'payload',p_payload,'actor_employee_id',p_actor_employee_id)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-adjustment-key:'||p_actor_user_id||':'||p_idempotency_key,0));
  SELECT * INTO v_event FROM public.warehouse_adjustment_command_events WHERE actor_user_id=p_actor_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_event.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN v_event.result;
  END IF;
  IF p_command<>'save_draft' THEN
    SELECT * INTO v_order FROM public.warehouse_adjustment_orders WHERE id=p_order_id AND tenant_id=p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_NOT_FOUND'; END IF;
    v_warehouse_id:=v_order.warehouse_id;
  END IF;
  PERFORM 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id AND module_enabled AND warehouse_adjustments_enabled) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_NOT_ENABLED';
  END IF;
  -- Same warehouse lock as material/transfer/stocktake/receipt, including absent
  -- balance creation. Re-read balances only after acquiring this lock.
  PERFORM id FROM public.warehouses WHERE id=v_warehouse_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_WAREHOUSE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.warehouses WHERE id=v_warehouse_id AND status<>'active') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_WAREHOUSE_INACTIVE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-adjustment-order:'||p_order_id,0));
  SELECT * INTO v_order FROM public.warehouse_adjustment_orders WHERE id=p_order_id FOR UPDATE;
  IF FOUND THEN
    IF v_order.tenant_id<>p_tenant_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_NOT_FOUND'; END IF;
    IF v_order.warehouse_id<>v_warehouse_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SOURCE_CONFLICT'; END IF;
    IF v_order.version<>p_expected_version OR v_order.version=2147483647 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_VERSION_CONFLICT';
    END IF;
    IF NOT ((p_command IN ('save_draft','submit') AND v_order.status='draft')
      OR (p_command='complete' AND v_order.status='submitted')
      OR (p_command='cancel' AND v_order.status IN ('draft','submitted'))) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_STATE_CONFLICT';
    END IF;
  ELSIF p_command<>'save_draft' OR p_expected_version<>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_VERSION_CONFLICT';
  END IF;
  IF p_command='save_draft' THEN
    PERFORM public.__gooes_adjustment_assert_skus(p_tenant_id,v_skus);
    IF v_order.id IS NULL THEN
      INSERT INTO public.warehouse_adjustment_orders(id,tenant_id,warehouse_id,reason,created_by_employee_id,updated_by_employee_id)
        VALUES(p_order_id,p_tenant_id,v_warehouse_id,v_reason,p_actor_employee_id,p_actor_employee_id);
    END IF;
    DELETE FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=p_order_id;
    INSERT INTO public.warehouse_adjustment_order_items(tenant_id,adjustment_order_id,warehouse_id,line_no,supplier_sku_id,quantity_delta,adjustment_reason)
      SELECT p_tenant_id,p_order_id,v_warehouse_id,ordinality,(value->>'supplier_sku_id')::uuid,
        (value->>'quantity_delta')::numeric,public.__gooes_stocktake_trim(value->>'adjustment_reason') FROM jsonb_array_elements(v_items) WITH ORDINALITY;
  END IF;
  IF p_command IN ('submit','complete') THEN
    SELECT array_agg(supplier_sku_id ORDER BY supplier_sku_id) INTO v_skus FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=p_order_id;
    PERFORM public.__gooes_adjustment_assert_skus(p_tenant_id,v_skus);
    PERFORM id FROM public.inventory_balances WHERE tenant_id=p_tenant_id AND warehouse_id=v_warehouse_id AND supplier_sku_id=ANY(v_skus)
      ORDER BY supplier_sku_id FOR UPDATE;
    -- At most 100 joined rows: validate the entire set before freezing any line.
    FOR v_row IN SELECT i AS item,b AS balance
      FROM public.warehouse_adjustment_order_items i LEFT JOIN public.inventory_balances b
        ON b.tenant_id=i.tenant_id AND b.warehouse_id=i.warehouse_id AND b.supplier_sku_id=i.supplier_sku_id
      WHERE i.adjustment_order_id=p_order_id ORDER BY i.supplier_sku_id LOOP
      v_item:=v_row.item;
      v_balance:=v_row.balance;
      IF p_command='complete' AND (v_item.book_balance_id,v_item.book_balance_version,v_item.book_quantity,v_item.book_value,v_item.book_unit_cost)
        IS DISTINCT FROM (v_balance.id,v_balance.version,v_balance.quantity_on_hand,v_balance.inventory_value,v_balance.average_unit_cost) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_SNAPSHOT_CONFLICT';
      END IF;
      IF v_balance.id IS NOT NULL AND (v_balance.quantity_on_hand<0 OR v_balance.quantity_on_hand>='Infinity'::numeric
        OR v_balance.inventory_value<0 OR v_balance.inventory_value>='Infinity'::numeric
        OR v_balance.average_unit_cost<0 OR v_balance.average_unit_cost>='Infinity'::numeric
        OR (v_balance.quantity_on_hand=0 AND (v_balance.inventory_value<>0 OR v_balance.average_unit_cost<>0))) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_BALANCE_INVALID';
      END IF;
      v_quantity:=coalesce(v_balance.quantity_on_hand,0)+v_item.quantity_delta;
      IF v_quantity<0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_INSUFFICIENT_STOCK'; END IF;
      IF coalesce(v_balance.quantity_on_hand,0)=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_COST_BASIS_REQUIRED'; END IF;
      v_unit_cost:=round(v_balance.inventory_value/v_balance.quantity_on_hand,4);
      v_amount:=CASE WHEN v_quantity=0 THEN v_balance.inventory_value
        ELSE round(abs(v_item.quantity_delta)*v_balance.inventory_value/v_balance.quantity_on_hand,2) END;
      v_value:=v_balance.inventory_value+sign(v_item.quantity_delta)*v_amount;
      v_average:=CASE WHEN v_quantity=0 THEN 0 ELSE round(v_value/v_quantity,4) END;
      IF v_balance.version=2147483647 OR v_quantity>=1e14 OR v_unit_cost<0 OR v_unit_cost>=1e14
        OR v_amount<0 OR v_amount>=1e16 OR v_value<0 OR v_value>=1e16 OR v_average<0 OR v_average>=1e14 THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_ADJUSTMENT_BALANCE_INVALID';
      END IF;
      v_calculations:=v_calculations||jsonb_build_array(jsonb_build_object('item_id',v_item.id,'balance',to_jsonb(v_balance),'unit_cost',v_unit_cost,'amount',v_amount));
    END LOOP;
    FOR v_json IN SELECT value FROM jsonb_array_elements(v_calculations) LOOP
      v_balance:=jsonb_populate_record(NULL::public.inventory_balances,v_json->'balance');
      IF p_command='submit' THEN
        UPDATE public.warehouse_adjustment_order_items SET snapshot_at=now(),book_balance_id=v_balance.id,book_balance_version=v_balance.version,
          book_quantity=v_balance.quantity_on_hand,book_value=v_balance.inventory_value,book_unit_cost=v_balance.average_unit_cost
          WHERE id=(v_json->>'item_id')::uuid;
      ELSE
        UPDATE public.warehouse_adjustment_order_items SET unit_cost=(v_json->>'unit_cost')::numeric,amount=(v_json->>'amount')::numeric
          WHERE id=(v_json->>'item_id')::uuid;
      END IF;
    END LOOP;
    IF p_command='complete' THEN
      FOR v_item IN SELECT * FROM public.warehouse_adjustment_order_items WHERE adjustment_order_id=p_order_id ORDER BY supplier_sku_id LOOP
        INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,
          source_type,source_id,warehouse_adjustment_item_id,occurred_at,created_by_employee_id)
          VALUES(p_tenant_id,v_warehouse_id,v_item.supplier_sku_id,CASE WHEN v_item.quantity_delta>0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
            v_item.quantity_delta,v_item.unit_cost,sign(v_item.quantity_delta)*v_item.amount,'warehouse_adjustment_item',v_item.id,v_item.id,now(),p_actor_employee_id);
        v_quantity:=v_item.book_quantity+v_item.quantity_delta; v_value:=v_item.book_value+sign(v_item.quantity_delta)*v_item.amount;
        UPDATE public.inventory_balances SET quantity_on_hand=v_quantity,inventory_value=v_value,
          average_unit_cost=CASE WHEN v_quantity=0 THEN 0 ELSE round(v_value/v_quantity,4) END,
          version=version+1,updated_at=now() WHERE id=v_item.book_balance_id;
      END LOOP;
    END IF;
  END IF;
  v_status:=CASE p_command WHEN 'save_draft' THEN 'draft' WHEN 'submit' THEN 'submitted' WHEN 'complete' THEN 'completed' ELSE 'cancelled' END;
  UPDATE public.warehouse_adjustment_orders SET status=v_status,version=p_expected_version+1,
    reason=CASE WHEN p_command='save_draft' THEN v_reason ELSE reason END,updated_at=now(),updated_by_employee_id=p_actor_employee_id,
    submitted_at=CASE WHEN p_command='submit' THEN now() ELSE submitted_at END,
    completed_at=CASE WHEN p_command='complete' THEN now() ELSE completed_at END,
    cancelled_at=CASE WHEN p_command='cancel' THEN now() ELSE cancelled_at END WHERE id=p_order_id RETURNING * INTO v_order;
  v_result:=jsonb_build_object('status',CASE WHEN p_command='save_draft' THEN 'saved' ELSE v_status END,'order',to_jsonb(v_order));
  INSERT INTO public.warehouse_adjustment_command_events(tenant_id,order_id,command,actor_user_id,actor_employee_id,idempotency_key,request_fingerprint,result)
    VALUES(p_tenant_id,p_order_id,p_command,p_actor_user_id,p_actor_employee_id,p_idempotency_key,v_fingerprint,v_result);
  RETURN v_result;
END;
$$;
DO $$
DECLARE t text; f regprocedure;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouse_adjustment_orders','warehouse_adjustment_order_items','warehouse_adjustment_command_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
  FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE '__gooes_adjustment_%' OR proname='command_warehouse_adjustment_order') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.command_warehouse_adjustment_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text) TO service_role;
REVOKE ALL ON SEQUENCE public.warehouse_adjustment_order_number_seq FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
