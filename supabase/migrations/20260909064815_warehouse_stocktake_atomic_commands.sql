-- D2.1 atomic stocktake commands only; no read/HTTP/rollout surface or grants.
-- Forward rollback: disable warehouse_stocktakes_enabled, retain immutable
-- facts and receipts, correct through a new audited stocktake after review.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

ALTER TABLE public.tenant_supplier_settings
  ADD COLUMN warehouse_stocktakes_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenant_supplier_settings_stocktakes_parent_check CHECK(NOT warehouse_stocktakes_enabled OR module_enabled);
INSERT INTO public.permissions(code,name,module,resource,action,description,status) VALUES
  ('inventory.stocktake.manage','管理仓库盘点','inventory','stocktake','manage','保存、开始、录入、提交及取消当前租户仓库盘点','active'),
  ('inventory.stocktake.approve','确认仓库盘点','inventory','stocktake','approve','按冻结账面快照原子确认当前租户仓库盘点','active');
-- Definitions only. No role/employee permission grants.
-- JS/Zod string limits count UTF-16 code units, not PostgreSQL characters.
-- UTF8 lead bytes make this independent of the disposable runner's SQL_ASCII.
-- More than 2000 bytes cannot fit 500 code units; cap before scanning bytes.
CREATE FUNCTION public.__gooes_stocktake_reason_length(p_value text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE bytes bytea; size integer; units integer:=0; octet integer;
BEGIN
  IF octet_length(p_value)>2000 THEN RETURN 501; END IF;
  bytes:=convert_to(p_value,'UTF8'); size:=octet_length(bytes);
  IF size>2000 THEN RETURN 501; END IF;
  FOR offset_index IN 0..size-1 LOOP
    octet:=get_byte(bytes,offset_index);
    IF octet<128 OR octet>=192 THEN units:=units+CASE WHEN octet>=240 THEN 2 ELSE 1 END; END IF;
    IF units>500 THEN RETURN 501; END IF;
  END LOOP;
  RETURN units;
END;
$$;
CREATE SEQUENCE public.warehouse_stocktake_order_number_seq;
CREATE TABLE public.warehouse_stocktake_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  warehouse_id uuid NOT NULL,
  order_no text NOT NULL DEFAULT ('WS-'||lpad(nextval('public.warehouse_stocktake_order_number_seq')::text,10,'0')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','counting','submitted','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  reason text NOT NULL CHECK(public.__gooes_stocktake_reason_length(reason) BETWEEN 1 AND 500),
  created_by_employee_id uuid NOT NULL, updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, submitted_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  UNIQUE(tenant_id,order_no), UNIQUE(id,tenant_id), UNIQUE(id,tenant_id,warehouse_id),
  FOREIGN KEY(warehouse_id,tenant_id) REFERENCES public.warehouses(id,tenant_id),
  FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  FOREIGN KEY(updated_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL)),
  CHECK(status NOT IN ('counting','submitted','completed') OR started_at IS NOT NULL),
  CHECK(status NOT IN ('submitted','completed') OR submitted_at IS NOT NULL)
);
CREATE TABLE public.warehouse_stocktake_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  stocktake_order_id uuid NOT NULL, warehouse_id uuid NOT NULL,
  line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
  supplier_sku_id uuid NOT NULL REFERENCES public.supplier_skus(id),
  snapshot_at timestamptz, book_balance_id uuid, book_balance_version integer CHECK(book_balance_version>0),
  book_quantity numeric(18,4) CHECK(book_quantity>=0 AND book_quantity<'Infinity'::numeric),
  book_value numeric(18,2) CHECK(book_value>=0 AND book_value<'Infinity'::numeric),
  book_unit_cost numeric(18,4) CHECK(book_unit_cost>=0 AND book_unit_cost<'Infinity'::numeric),
  counted_quantity numeric(18,4) CHECK(counted_quantity>=0 AND counted_quantity<'Infinity'::numeric),
  difference_reason text CHECK(public.__gooes_stocktake_reason_length(difference_reason) BETWEEN 1 AND 500),
  difference_quantity numeric(18,4) GENERATED ALWAYS AS (counted_quantity-book_quantity) STORED,
  unit_cost numeric(18,4) CHECK(unit_cost>=0 AND unit_cost<'Infinity'::numeric),
  amount numeric(18,2) CHECK(amount>=0 AND amount<'Infinity'::numeric),
  CHECK((unit_cost IS NULL)=(amount IS NULL)),
  CHECK((book_balance_id IS NULL)=(book_balance_version IS NULL)),
  CHECK((snapshot_at IS NULL AND book_quantity IS NULL AND book_value IS NULL AND book_unit_cost IS NULL
      AND book_balance_id IS NULL AND counted_quantity IS NULL AND difference_reason IS NULL AND amount IS NULL)
    OR (snapshot_at IS NOT NULL AND book_quantity IS NOT NULL AND book_value IS NOT NULL AND book_unit_cost IS NOT NULL
      AND (book_balance_id IS NOT NULL OR (book_quantity=0 AND book_value=0 AND book_unit_cost=0)))),
  CHECK(book_quantity<>0 OR (book_value=0 AND book_unit_cost=0)),
  CHECK(counted_quantity IS NULL OR counted_quantity=book_quantity OR difference_reason IS NOT NULL),
  UNIQUE(stocktake_order_id,line_no), UNIQUE(stocktake_order_id,supplier_sku_id),
  UNIQUE(id,tenant_id,warehouse_id,supplier_sku_id),
  FOREIGN KEY(stocktake_order_id,tenant_id,warehouse_id) REFERENCES public.warehouse_stocktake_orders(id,tenant_id,warehouse_id)
);
-- Historical balance identity is deliberately not an FK: presence is part of
-- the frozen snapshot; deletion/recreation must be reported as a conflict.
CREATE INDEX warehouse_stocktake_orders_tenant_page_idx ON public.warehouse_stocktake_orders(tenant_id,created_at DESC,id DESC);
CREATE INDEX warehouse_stocktake_orders_warehouse_page_idx ON public.warehouse_stocktake_orders(tenant_id,warehouse_id,created_at DESC,id DESC);
CREATE INDEX warehouse_stocktake_orders_warehouse_status_page_idx ON public.warehouse_stocktake_orders(tenant_id,warehouse_id,status,created_at DESC,id DESC);
CREATE TABLE public.warehouse_stocktake_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, order_id uuid NOT NULL,
  command text NOT NULL CHECK(command IN ('save_draft','start','record_counts','submit','complete','cancel')),
  actor_user_id uuid NOT NULL, actor_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK(char_length(btrim(idempotency_key)) BETWEEN 1 AND 120 AND char_length(idempotency_key)<=120),
  request_fingerprint text NOT NULL, result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(order_id,tenant_id) REFERENCES public.warehouse_stocktake_orders(id,tenant_id),
  FOREIGN KEY(actor_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  UNIQUE(actor_user_id,idempotency_key)
);
CREATE INDEX warehouse_stocktake_events_order_idx ON public.warehouse_stocktake_command_events(tenant_id,order_id,created_at DESC);
CREATE TRIGGER warehouse_stocktake_events_immutable BEFORE UPDATE OR DELETE ON public.warehouse_stocktake_command_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_fact_mutation();

ALTER TABLE public.inventory_transactions
  ADD COLUMN warehouse_stocktake_item_id uuid,
  ADD CONSTRAINT inventory_transactions_stocktake_fkey FOREIGN KEY(warehouse_stocktake_item_id,tenant_id,warehouse_id,supplier_sku_id)
    REFERENCES public.warehouse_stocktake_order_items(id,tenant_id,warehouse_id,supplier_sku_id);
-- Wrap the original expression intact instead of rewriting its legacy branches.
DO $$
DECLARE original_expression text;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO STRICT original_expression FROM pg_constraint
    WHERE conrelid='public.inventory_transactions'::regclass AND conname='inventory_transactions_material_source_check';
  ALTER TABLE public.inventory_transactions DROP CONSTRAINT inventory_transactions_material_source_check;
  EXECUTE 'ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_material_source_check CHECK ('||
    '(warehouse_stocktake_item_id IS NULL AND ('||original_expression||')) OR ('||
    'source_type=''warehouse_stocktake_item'' AND warehouse_stocktake_item_id IS NOT NULL AND source_id=warehouse_stocktake_item_id '||
    'AND warehouse_issue_item_id IS NULL AND warehouse_return_item_id IS NULL '||
    'AND warehouse_transfer_out_item_id IS NULL AND warehouse_transfer_in_item_id IS NULL '||
    'AND project_id IS NULL AND cost_category_id IS NULL AND unit_cost>=0 AND unit_cost<''Infinity''::numeric '||
    'AND abs(quantity_delta)<''Infinity''::numeric AND abs(value_delta)<''Infinity''::numeric '||
    'AND ((transaction_type=''adjustment_in'' AND quantity_delta>0 AND value_delta>=0) '||
    'OR (transaction_type=''adjustment_out'' AND quantity_delta<0 AND value_delta<=0))))';
END;
$$;

-- Match JavaScript trim's whitespace set (including NBSP and BOM) explicitly.
CREATE FUNCTION public.__gooes_stocktake_trim(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT regexp_replace(p_value, '\A(?:[\x09-\x0D ]| | | | | | | | | | | | | | | | | |　|﻿)+|(?:[\x09-\x0D ]| | | | | | | | | | | | | | | | | |　|﻿)+\Z', '', 'g')
$$;
-- Exact installed Zod 4.4.2 uuid() semantics: RFC versions 1..8 and variant,
-- plus nil/lowercase-max exceptions. Do not use a global case-insensitive flag.
CREATE FUNCTION public.__gooes_stocktake_uuid_valid(p_value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT p_value ~ '\A([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\Z'
$$;
CREATE FUNCTION public.__gooes_stocktake_assert_actor(p_tenant_id uuid,p_user_id uuid,p_employee_id uuid,p_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_STOCKTAKE_FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employees e JOIN public.tenants t ON t.id=e.tenant_id
    WHERE e.id=p_employee_id AND e.tenant_id=p_tenant_id AND e.user_id=p_user_id AND e.status='active' AND t.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_STOCKTAKE_ACTOR_INVALID';
  END IF;
  IF NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_employee_id,p_permission) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_STOCKTAKE_FORBIDDEN';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_stocktake_assert_skus(p_tenant_id uuid,p_skus uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_skus IS NULL OR cardinality(p_skus) NOT BETWEEN 1 AND 100 OR
    (SELECT count(*) FROM public.supplier_skus s JOIN public.supplier_products p ON p.id=s.supplier_product_id AND p.supplier_id=s.supplier_id
      WHERE s.id=ANY(p_skus) AND s.status='active' AND p.status='active' AND s.ownership_scope=p.ownership_scope
        AND s.owner_tenant_id IS NOT DISTINCT FROM p.owner_tenant_id AND ((s.ownership_scope='platform' AND s.owner_tenant_id IS NULL)
          OR (s.ownership_scope='tenant' AND s.owner_tenant_id=p_tenant_id)))<>cardinality(p_skus) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SKU_INVALID';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_stocktake_guard_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE old_status text; new_status text;
BEGIN
  IF TG_TABLE_NAME='warehouse_stocktake_orders' THEN
    IF OLD.status IN ('completed','cancelled') THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_IMMUTABLE'; END IF;
    IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.warehouse_id,NEW.created_at,NEW.created_by_employee_id,NEW.order_no)
      IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.warehouse_id,OLD.created_at,OLD.created_by_employee_id,OLD.order_no) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SOURCE_CONFLICT';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status<>'draft' AND (NEW.reason,NEW.started_at) IS DISTINCT FROM (OLD.reason,OLD.started_at) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SNAPSHOT_IMMUTABLE';
    END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN SELECT status INTO old_status FROM public.warehouse_stocktake_orders WHERE id=OLD.stocktake_order_id; END IF;
    IF TG_OP<>'DELETE' THEN SELECT status INTO new_status FROM public.warehouse_stocktake_orders WHERE id=NEW.stocktake_order_id; END IF;
    IF old_status IN ('completed','cancelled') OR new_status IN ('completed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_IMMUTABLE';
    END IF;
    IF (TG_OP='INSERT' AND new_status<>'draft') OR (TG_OP='DELETE' AND old_status<>'draft') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SNAPSHOT_IMMUTABLE';
    END IF;
    IF TG_OP='UPDATE' AND (old_status<>'draft' OR new_status<>'draft') AND
      (NEW.id,NEW.tenant_id,NEW.stocktake_order_id,NEW.warehouse_id,NEW.line_no,NEW.supplier_sku_id,
        NEW.snapshot_at,NEW.book_balance_id,NEW.book_balance_version,NEW.book_quantity,NEW.book_value,NEW.book_unit_cost)
      IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.stocktake_order_id,OLD.warehouse_id,OLD.line_no,OLD.supplier_sku_id,
        OLD.snapshot_at,OLD.book_balance_id,OLD.book_balance_version,OLD.book_quantity,OLD.book_value,OLD.book_unit_cost) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SNAPSHOT_IMMUTABLE';
    END IF;
    IF TG_OP='UPDATE' AND old_status='submitted' AND (NEW.counted_quantity,NEW.difference_reason)
      IS DISTINCT FROM (OLD.counted_quantity,OLD.difference_reason) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SNAPSHOT_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_stocktake_orders_guard BEFORE UPDATE OR DELETE ON public.warehouse_stocktake_orders
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_stocktake_guard_document();
CREATE TRIGGER warehouse_stocktake_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.warehouse_stocktake_order_items
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_stocktake_guard_document();
CREATE FUNCTION public.__gooes_stocktake_bind_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.source_type='warehouse_stocktake_item' OR NEW.warehouse_stocktake_item_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items i JOIN public.warehouse_stocktake_orders o ON o.id=i.stocktake_order_id
      WHERE i.id=NEW.warehouse_stocktake_item_id AND NEW.source_id=i.id AND NEW.tenant_id=i.tenant_id
        AND NEW.warehouse_id=i.warehouse_id AND NEW.supplier_sku_id=i.supplier_sku_id
        AND NEW.source_type='warehouse_stocktake_item' AND o.status IN ('submitted','completed')
        AND i.snapshot_at IS NOT NULL AND i.difference_quantity<>0 AND NEW.quantity_delta=i.difference_quantity
        AND NEW.unit_cost=i.unit_cost AND NEW.value_delta=sign(i.difference_quantity)*i.amount
        AND NEW.transaction_type=CASE WHEN i.difference_quantity>0 THEN 'adjustment_in' ELSE 'adjustment_out' END
        AND NEW.project_id IS NULL AND NEW.cost_category_id IS NULL AND NEW.warehouse_issue_item_id IS NULL
        AND NEW.warehouse_return_item_id IS NULL AND NEW.warehouse_transfer_out_item_id IS NULL AND NEW.warehouse_transfer_in_item_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SOURCE_CONFLICT';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_stocktake_transaction_source BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.__gooes_stocktake_bind_source();

CREATE FUNCTION public.command_warehouse_stocktake_order(
  p_order_id uuid,p_tenant_id uuid,p_command text,p_expected_version integer,p_payload jsonb,
  p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_order public.warehouse_stocktake_orders%ROWTYPE; v_event public.warehouse_stocktake_command_events%ROWTYPE;
  v_item public.warehouse_stocktake_order_items%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
  v_warehouse_id uuid; v_skus uuid[]; v_items jsonb; v_json jsonb; v_reason text; v_difference_reason text;
  v_fingerprint text; v_status text; v_result jsonb; v_count integer;
  v_delta numeric; v_unit_cost numeric; v_amount numeric; v_value numeric; v_average numeric;
BEGIN
  -- This check is also mandatory before a successful frozen replay.
  PERFORM public.__gooes_stocktake_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id,
    CASE WHEN p_command='complete' THEN 'inventory.stocktake.approve' ELSE 'inventory.stocktake.manage' END);
  IF p_order_id IS NULL OR NOT public.__gooes_stocktake_uuid_valid(p_order_id::text)
    OR p_command IS NULL OR p_command NOT IN ('save_draft','start','record_counts','submit','complete','cancel')
    OR p_expected_version IS NULL OR p_expected_version<0 OR (p_command<>'save_draft' AND p_expected_version=0)
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_idempotency_key IS NULL
    OR char_length(public.__gooes_stocktake_trim(p_idempotency_key)) NOT BETWEEN 1 AND 120 OR char_length(p_idempotency_key)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_INVALID';
  END IF;
  IF p_command='save_draft' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>ALL(ARRAY['warehouse_id','reason','items']))
      OR jsonb_typeof(p_payload->'warehouse_id') IS DISTINCT FROM 'string'
      OR NOT public.__gooes_stocktake_uuid_valid(coalesce(p_payload->>'warehouse_id',''))
      OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
      OR public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(p_payload->>'reason')) NOT BETWEEN 1 AND 500
      OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_INVALID';
    END IF;
    v_warehouse_id:=(p_payload->>'warehouse_id')::uuid;
    v_reason:=public.__gooes_stocktake_trim(p_payload->>'reason');
  ELSIF p_command='record_counts' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>'items')
      OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_INVALID';
    END IF;
  ELSIF p_payload<>'{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_INVALID';
  END IF;
  IF p_command IN ('save_draft','record_counts') THEN
    v_items:=p_payload->'items';
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_ITEMS_INVALID'; END IF;
    FOR v_json IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      IF jsonb_typeof(v_json)<>'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_ITEMS_INVALID'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_json) k WHERE k<>ALL(CASE WHEN p_command='save_draft'
          THEN ARRAY['supplier_sku_id'] ELSE ARRAY['supplier_sku_id','counted_quantity','difference_reason'] END))
        OR jsonb_typeof(v_json->'supplier_sku_id') IS DISTINCT FROM 'string'
        OR NOT public.__gooes_stocktake_uuid_valid(coalesce(v_json->>'supplier_sku_id','')) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_ITEMS_INVALID';
      END IF;
      IF p_command='record_counts' AND (jsonb_typeof(v_json->'counted_quantity') IS DISTINCT FROM 'string'
        OR coalesce(v_json->>'counted_quantity','') !~ '\A(0|[1-9][0-9]{0,13})(\.[0-9]{1,4})?\Z'
        OR (v_json ? 'difference_reason' AND v_json->'difference_reason'<>'null'::jsonb AND
          (jsonb_typeof(v_json->'difference_reason') IS DISTINCT FROM 'string'
            OR public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(v_json->>'difference_reason')) NOT BETWEEN 1 AND 500))) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_ITEMS_INVALID';
      END IF;
    END LOOP;
    SELECT array_agg(DISTINCT (value->>'supplier_sku_id')::uuid) INTO v_skus FROM jsonb_array_elements(v_items);
    IF cardinality(v_skus)<>jsonb_array_length(v_items) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_ITEMS_INVALID'; END IF;
  END IF;
  v_fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant_id',p_tenant_id,'order_id',p_order_id,'command',p_command,
    'expected_version',p_expected_version,'payload',p_payload,'actor_employee_id',p_actor_employee_id)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-stocktake-key:'||p_actor_user_id||':'||p_idempotency_key,0));
  SELECT * INTO v_event FROM public.warehouse_stocktake_command_events WHERE actor_user_id=p_actor_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_event.request_fingerprint<>v_fingerprint THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_IDEMPOTENCY_CONFLICT'; END IF;
    RETURN v_event.result;
  END IF;
  IF p_command<>'save_draft' THEN
    SELECT * INTO v_order FROM public.warehouse_stocktake_orders WHERE id=p_order_id AND tenant_id=p_tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_NOT_FOUND'; END IF;
    v_warehouse_id:=v_order.warehouse_id;
  END IF;
  -- Shared global ordering with transfer/material/receipt. The warehouse lock
  -- serializes absent balances too; start must never create a placeholder row.
  PERFORM 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id AND module_enabled AND warehouse_stocktakes_enabled) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_NOT_ENABLED';
  END IF;
  PERFORM id FROM public.warehouses WHERE id=v_warehouse_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_WAREHOUSE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM public.warehouses WHERE id=v_warehouse_id AND status<>'active') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_WAREHOUSE_INACTIVE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-stocktake-order:'||p_order_id,0));
  SELECT * INTO v_order FROM public.warehouse_stocktake_orders WHERE id=p_order_id FOR UPDATE;
  IF FOUND THEN
    IF v_order.tenant_id<>p_tenant_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_NOT_FOUND'; END IF;
    IF v_order.warehouse_id<>v_warehouse_id THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SOURCE_CONFLICT'; END IF;
    IF v_order.version<>p_expected_version OR v_order.version=2147483647 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_VERSION_CONFLICT';
    END IF;
    IF NOT ((p_command IN ('save_draft','start') AND v_order.status='draft')
      OR (p_command IN ('record_counts','submit') AND v_order.status='counting') OR (p_command='complete' AND v_order.status='submitted')
      OR (p_command='cancel' AND v_order.status IN ('draft','counting','submitted'))) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_STATE_CONFLICT';
    END IF;
  ELSIF p_command<>'save_draft' OR p_expected_version<>0 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_VERSION_CONFLICT';
  END IF;
  IF p_command='save_draft' THEN
    PERFORM public.__gooes_stocktake_assert_skus(p_tenant_id,v_skus);
    IF v_order.id IS NULL THEN
      INSERT INTO public.warehouse_stocktake_orders(id,tenant_id,warehouse_id,reason,created_by_employee_id,updated_by_employee_id)
        VALUES(p_order_id,p_tenant_id,v_warehouse_id,v_reason,p_actor_employee_id,p_actor_employee_id);
    END IF;
    DELETE FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id;
    INSERT INTO public.warehouse_stocktake_order_items(tenant_id,stocktake_order_id,warehouse_id,line_no,supplier_sku_id)
      SELECT p_tenant_id,p_order_id,v_warehouse_id,ordinality,(value->>'supplier_sku_id')::uuid FROM jsonb_array_elements(v_items) WITH ORDINALITY;
  ELSIF p_command='record_counts' THEN
    IF (SELECT count(*) FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id AND supplier_sku_id=ANY(v_skus))<>cardinality(v_skus) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_STOCKTAKE_ITEMS_INVALID';
    END IF;
    FOR v_json IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      SELECT * INTO STRICT v_item FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id AND supplier_sku_id=(v_json->>'supplier_sku_id')::uuid;
      v_difference_reason:=public.__gooes_stocktake_trim(v_json->>'difference_reason');
      IF (v_json->>'counted_quantity')::numeric<>v_item.book_quantity AND v_difference_reason IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_DIFFERENCE_REASON_REQUIRED';
      END IF;
      UPDATE public.warehouse_stocktake_order_items SET counted_quantity=(v_json->>'counted_quantity')::numeric,
        difference_reason=v_difference_reason WHERE id=v_item.id;
    END LOOP;
  END IF;
  IF p_command IN ('start','submit','complete') THEN
    SELECT array_agg(supplier_sku_id ORDER BY supplier_sku_id) INTO v_skus FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id;
    PERFORM public.__gooes_stocktake_assert_skus(p_tenant_id,v_skus);
  END IF;
  IF p_command IN ('submit','complete') THEN
    IF EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id AND (counted_quantity IS NULL OR snapshot_at IS NULL)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_COUNTS_REQUIRED';
    END IF;
    IF EXISTS(SELECT 1 FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id AND difference_quantity<>0
      AND coalesce(public.__gooes_stocktake_reason_length(public.__gooes_stocktake_trim(difference_reason)),0) NOT BETWEEN 1 AND 500) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_DIFFERENCE_REASON_REQUIRED';
    END IF;
  END IF;
  IF p_command IN ('start','complete') THEN
    PERFORM id FROM public.inventory_balances WHERE tenant_id=p_tenant_id AND warehouse_id=v_warehouse_id AND supplier_sku_id=ANY(v_skus)
      ORDER BY supplier_sku_id FOR UPDATE;
    -- Validate every selected snapshot and every arithmetic result before any
    -- ledger posting. A later failure still rolls back this entire invocation.
    FOR v_item IN SELECT * FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id ORDER BY supplier_sku_id LOOP
      SELECT * INTO v_balance FROM public.inventory_balances WHERE tenant_id=p_tenant_id AND warehouse_id=v_warehouse_id AND supplier_sku_id=v_item.supplier_sku_id;
      IF v_balance.id IS NOT NULL AND (v_balance.quantity_on_hand<0 OR v_balance.quantity_on_hand>='Infinity'::numeric
        OR v_balance.inventory_value<0 OR v_balance.inventory_value>='Infinity'::numeric
        OR v_balance.average_unit_cost<0 OR v_balance.average_unit_cost>='Infinity'::numeric
        OR (v_balance.quantity_on_hand=0 AND (v_balance.inventory_value<>0 OR v_balance.average_unit_cost<>0))) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_BALANCE_INVALID';
      END IF;
      IF p_command='start' THEN
        UPDATE public.warehouse_stocktake_order_items SET snapshot_at=now(),book_balance_id=v_balance.id,book_balance_version=v_balance.version,
          book_quantity=coalesce(v_balance.quantity_on_hand,0),book_value=coalesce(v_balance.inventory_value,0),
          book_unit_cost=coalesce(v_balance.average_unit_cost,0) WHERE id=v_item.id;
        CONTINUE;
      END IF;
      IF (v_item.book_balance_id,v_item.book_balance_version,v_item.book_quantity,v_item.book_value,v_item.book_unit_cost)
        IS DISTINCT FROM (v_balance.id,v_balance.version,coalesce(v_balance.quantity_on_hand,0),coalesce(v_balance.inventory_value,0),coalesce(v_balance.average_unit_cost,0)) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT';
      END IF;
      v_delta:=v_item.difference_quantity;
      IF v_delta=0 THEN
        UPDATE public.warehouse_stocktake_order_items SET unit_cost=0,amount=0 WHERE id=v_item.id;
        CONTINUE;
      END IF;
      IF v_item.book_quantity=0 THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_COST_BASIS_REQUIRED'; END IF;
      v_unit_cost:=round(v_item.book_value/v_item.book_quantity,4);
      v_amount:=CASE WHEN v_item.counted_quantity=0 THEN v_item.book_value ELSE round(abs(v_delta)*v_item.book_value/v_item.book_quantity,2) END;
      v_value:=v_item.book_value+sign(v_delta)*v_amount;
      v_average:=CASE WHEN v_item.counted_quantity=0 THEN 0 ELSE round(v_value/v_item.counted_quantity,4) END;
      IF v_balance.version=2147483647 OR v_unit_cost>=1e14 OR v_amount>=1e16 OR v_value<0 OR v_value>=1e16 OR v_average<0 OR v_average>=1e14 THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_STOCKTAKE_BALANCE_INVALID';
      END IF;
      UPDATE public.warehouse_stocktake_order_items SET unit_cost=v_unit_cost,amount=v_amount WHERE id=v_item.id;
    END LOOP;
    IF p_command='complete' THEN
      FOR v_item IN SELECT * FROM public.warehouse_stocktake_order_items WHERE stocktake_order_id=p_order_id AND difference_quantity<>0 ORDER BY supplier_sku_id LOOP
        INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,quantity_delta,unit_cost,value_delta,
          source_type,source_id,warehouse_stocktake_item_id,occurred_at,created_by_employee_id)
          VALUES(p_tenant_id,v_warehouse_id,v_item.supplier_sku_id,CASE WHEN v_item.difference_quantity>0 THEN 'adjustment_in' ELSE 'adjustment_out' END,
            v_item.difference_quantity,v_item.unit_cost,sign(v_item.difference_quantity)*v_item.amount,
            'warehouse_stocktake_item',v_item.id,v_item.id,now(),p_actor_employee_id);
        v_value:=v_item.book_value+sign(v_item.difference_quantity)*v_item.amount;
        UPDATE public.inventory_balances SET quantity_on_hand=v_item.counted_quantity,inventory_value=v_value,
          average_unit_cost=CASE WHEN v_item.counted_quantity=0 THEN 0 ELSE round(v_value/v_item.counted_quantity,4) END,
          version=version+1,updated_at=now() WHERE id=v_item.book_balance_id;
      END LOOP;
    END IF;
  END IF;
  v_status:=CASE p_command WHEN 'save_draft' THEN 'draft' WHEN 'start' THEN 'counting' WHEN 'record_counts' THEN 'counting'
    WHEN 'submit' THEN 'submitted' WHEN 'complete' THEN 'completed' ELSE 'cancelled' END;
  UPDATE public.warehouse_stocktake_orders SET status=v_status,version=p_expected_version+1,
    reason=CASE WHEN p_command='save_draft' THEN v_reason ELSE reason END,updated_at=now(),updated_by_employee_id=p_actor_employee_id,
    started_at=CASE WHEN p_command='start' THEN now() ELSE started_at END,
    submitted_at=CASE WHEN p_command='submit' THEN now() ELSE submitted_at END,
    completed_at=CASE WHEN p_command='complete' THEN now() ELSE completed_at END,
    cancelled_at=CASE WHEN p_command='cancel' THEN now() ELSE cancelled_at END WHERE id=p_order_id RETURNING * INTO v_order;
  v_result:=jsonb_build_object('status',CASE WHEN p_command='save_draft' THEN 'saved' ELSE v_status END,'order',to_jsonb(v_order));
  INSERT INTO public.warehouse_stocktake_command_events(tenant_id,order_id,command,actor_user_id,actor_employee_id,idempotency_key,request_fingerprint,result)
    VALUES(p_tenant_id,p_order_id,p_command,p_actor_user_id,p_actor_employee_id,p_idempotency_key,v_fingerprint,v_result);
  RETURN v_result;
END;
$$;
DO $$
DECLARE t text; f regprocedure;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouse_stocktake_orders','warehouse_stocktake_order_items','warehouse_stocktake_command_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
  FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE '__gooes_stocktake_%' OR proname='command_warehouse_stocktake_order') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f);
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.command_warehouse_stocktake_order(uuid,uuid,text,integer,jsonb,uuid,uuid,text) TO service_role;
REVOKE ALL ON SEQUENCE public.warehouse_stocktake_order_number_seq FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
