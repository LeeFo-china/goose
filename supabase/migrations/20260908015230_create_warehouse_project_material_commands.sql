-- Stage C material facts. Forward rollback: disable warehouse_materials_enabled,
-- retain immutable facts and receipts, then apply a reviewed corrective migration.
-- No payable, cash or historical procurement facts are changed by this migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';

ALTER TABLE public.tenant_supplier_settings
  ADD COLUMN warehouse_materials_enabled boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenant_supplier_settings_materials_parent_check CHECK(NOT warehouse_materials_enabled OR module_enabled);

CREATE SEQUENCE public.warehouse_material_order_number_seq;
CREATE TABLE public.warehouse_issue_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  project_id uuid NOT NULL,
  order_no text NOT NULL DEFAULT ('WI-'||lpad(nextval('public.warehouse_material_order_number_seq')::text,10,'0')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  reason text NULL CHECK(reason IS NULL OR char_length(reason)<=500),
  created_by_employee_id uuid NOT NULL,
  updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE(tenant_id,order_no), UNIQUE(id,tenant_id), UNIQUE(id,tenant_id,warehouse_id,project_id),
  FOREIGN KEY(warehouse_id,tenant_id) REFERENCES public.warehouses(id,tenant_id),
  FOREIGN KEY(project_id,tenant_id) REFERENCES public.projects(id,tenant_id),
  FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  FOREIGN KEY(updated_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL))
);
CREATE TABLE public.warehouse_issue_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  issue_order_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  project_id uuid NOT NULL,
  line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
  supplier_sku_id uuid NOT NULL REFERENCES public.supplier_skus(id),
  quantity numeric(18,4) NOT NULL CHECK(quantity>0 AND quantity<'Infinity'::numeric),
  cost_category_id uuid,
  cost_category_name text,
  unit_cost numeric(18,4) CHECK(unit_cost>=0 AND unit_cost<'Infinity'::numeric),
  amount numeric(18,2) CHECK(amount>=0 AND amount<'Infinity'::numeric),
  UNIQUE(issue_order_id,line_no), UNIQUE(issue_order_id,supplier_sku_id),
  UNIQUE(id,tenant_id,issue_order_id),
  UNIQUE(id,tenant_id,warehouse_id,project_id,cost_category_id),
  FOREIGN KEY(issue_order_id,tenant_id,warehouse_id,project_id)
    REFERENCES public.warehouse_issue_orders(id,tenant_id,warehouse_id,project_id),
  FOREIGN KEY(cost_category_id,tenant_id) REFERENCES public.finance_cost_categories(id,tenant_id)
);
CREATE TABLE public.warehouse_return_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  project_id uuid NOT NULL,
  original_issue_order_id uuid NOT NULL,
  order_no text NOT NULL DEFAULT ('WR-'||lpad(nextval('public.warehouse_material_order_number_seq')::text,10,'0')),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed','cancelled')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  reason text NULL CHECK(reason IS NULL OR char_length(reason)<=500),
  created_by_employee_id uuid NOT NULL,
  updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE(tenant_id,order_no), UNIQUE(id,tenant_id),
  UNIQUE(id,tenant_id,original_issue_order_id,warehouse_id,project_id),
  FOREIGN KEY(original_issue_order_id,tenant_id,warehouse_id,project_id)
    REFERENCES public.warehouse_issue_orders(id,tenant_id,warehouse_id,project_id),
  FOREIGN KEY(created_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  FOREIGN KEY(updated_by_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  CHECK((status='completed')=(completed_at IS NOT NULL)),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL))
);
CREATE TABLE public.warehouse_return_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  return_order_id uuid NOT NULL,
  original_issue_order_id uuid NOT NULL,
  original_issue_item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  project_id uuid NOT NULL,
  line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 100),
  quantity numeric(18,4) NOT NULL CHECK(quantity>0 AND quantity<'Infinity'::numeric),
  unit_cost numeric(18,4) CHECK(unit_cost>=0 AND unit_cost<'Infinity'::numeric),
  amount numeric(18,2) CHECK(amount>=0 AND amount<'Infinity'::numeric),
  UNIQUE(return_order_id,line_no), UNIQUE(return_order_id,original_issue_item_id),
  UNIQUE(id,tenant_id,warehouse_id,project_id),
  FOREIGN KEY(return_order_id,tenant_id,original_issue_order_id,warehouse_id,project_id)
    REFERENCES public.warehouse_return_orders(id,tenant_id,original_issue_order_id,warehouse_id,project_id),
  FOREIGN KEY(original_issue_item_id,tenant_id,original_issue_order_id)
    REFERENCES public.warehouse_issue_order_items(id,tenant_id,issue_order_id)
);
CREATE INDEX warehouse_issue_orders_tenant_page_idx ON public.warehouse_issue_orders(tenant_id,created_at DESC,id DESC);
CREATE INDEX warehouse_issue_orders_warehouse_page_idx ON public.warehouse_issue_orders(tenant_id,warehouse_id,status,created_at DESC,id DESC);
CREATE INDEX warehouse_issue_orders_project_page_idx ON public.warehouse_issue_orders(tenant_id,project_id,created_at DESC,id DESC);
CREATE INDEX warehouse_return_orders_tenant_page_idx ON public.warehouse_return_orders(tenant_id,created_at DESC,id DESC);
CREATE INDEX warehouse_return_orders_warehouse_page_idx ON public.warehouse_return_orders(tenant_id,warehouse_id,status,created_at DESC,id DESC);
CREATE INDEX warehouse_return_orders_project_page_idx ON public.warehouse_return_orders(tenant_id,project_id,created_at DESC,id DESC);
CREATE INDEX warehouse_return_items_original_idx ON public.warehouse_return_order_items(tenant_id,original_issue_item_id,return_order_id);

CREATE TABLE public.warehouse_material_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid NOT NULL,
  document_type text NOT NULL CHECK(document_type IN ('issue','return')),
  command text NOT NULL CHECK(command IN ('save_draft','submit','complete','cancel')),
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK(char_length(btrim(idempotency_key)) BETWEEN 1 AND 120),
  request_fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(actor_employee_id,tenant_id) REFERENCES public.employees(id,tenant_id),
  UNIQUE(actor_user_id,idempotency_key)
);
CREATE INDEX warehouse_material_events_order_idx ON public.warehouse_material_command_events(tenant_id,document_type,order_id,created_at DESC);
CREATE TRIGGER warehouse_material_events_immutable BEFORE UPDATE OR DELETE
  ON public.warehouse_material_command_events FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_fact_mutation();

ALTER TABLE public.project_cost_events
  ALTER COLUMN tenant_supplier_id DROP NOT NULL,
  ALTER COLUMN supplier_id DROP NOT NULL,
  ALTER COLUMN supplier_purchase_order_id DROP NOT NULL,
  ALTER COLUMN supplier_purchase_order_item_id DROP NOT NULL,
  ALTER COLUMN supplier_purchase_order_receipt_id DROP NOT NULL,
  ALTER COLUMN supplier_purchase_order_receipt_item_id DROP NOT NULL,
  ADD COLUMN event_direction text NOT NULL DEFAULT 'increase' CHECK(event_direction IN ('increase','decrease')),
  ADD COLUMN warehouse_id uuid,
  ADD COLUMN warehouse_issue_item_id uuid,
  ADD COLUMN warehouse_return_item_id uuid,
  DROP CONSTRAINT project_cost_events_source_type_check,
  DROP CONSTRAINT project_cost_events_source_identity_check,
  ADD CONSTRAINT project_cost_events_material_issue_fkey FOREIGN KEY(warehouse_issue_item_id,tenant_id,warehouse_id,project_id,cost_category_id)
    REFERENCES public.warehouse_issue_order_items(id,tenant_id,warehouse_id,project_id,cost_category_id),
  ADD CONSTRAINT project_cost_events_material_return_fkey FOREIGN KEY(warehouse_return_item_id,tenant_id,warehouse_id,project_id)
    REFERENCES public.warehouse_return_order_items(id,tenant_id,warehouse_id,project_id),
  ADD CONSTRAINT project_cost_events_source_identity_check CHECK(
    (source_type='supplier_purchase_receipt_item' AND event_direction='increase'
      AND tenant_supplier_id IS NOT NULL AND supplier_id IS NOT NULL
      AND supplier_purchase_order_id IS NOT NULL AND supplier_purchase_order_item_id IS NOT NULL
      AND supplier_purchase_order_receipt_id IS NOT NULL AND supplier_purchase_order_receipt_item_id IS NOT NULL
      AND source_id=supplier_purchase_order_receipt_item_id
      AND warehouse_id IS NULL AND warehouse_issue_item_id IS NULL AND warehouse_return_item_id IS NULL)
    OR
    (source_type IN ('warehouse_issue_item','warehouse_return_item')
      AND tenant_supplier_id IS NULL AND supplier_id IS NULL AND supplier_purchase_order_id IS NULL
      AND supplier_purchase_order_item_id IS NULL AND supplier_purchase_order_receipt_id IS NULL
      AND supplier_purchase_order_receipt_item_id IS NULL AND purchase_requisition_id IS NULL
      AND warehouse_id IS NOT NULL AND
      ((source_type='warehouse_issue_item' AND event_direction='increase' AND warehouse_issue_item_id IS NOT NULL
        AND source_id=warehouse_issue_item_id AND warehouse_return_item_id IS NULL)
      OR(source_type='warehouse_return_item' AND event_direction='decrease' AND warehouse_return_item_id IS NOT NULL
        AND source_id=warehouse_return_item_id AND warehouse_issue_item_id IS NULL)))
  );
ALTER TABLE public.inventory_transactions
  ADD COLUMN warehouse_issue_item_id uuid,
  ADD COLUMN warehouse_return_item_id uuid,
  DROP CONSTRAINT inventory_transactions_stage_b_source_check,
  ADD CONSTRAINT inventory_transactions_material_issue_fkey FOREIGN KEY(warehouse_issue_item_id,tenant_id,warehouse_id,project_id,cost_category_id)
    REFERENCES public.warehouse_issue_order_items(id,tenant_id,warehouse_id,project_id,cost_category_id),
  ADD CONSTRAINT inventory_transactions_material_return_fkey FOREIGN KEY(warehouse_return_item_id,tenant_id,warehouse_id,project_id)
    REFERENCES public.warehouse_return_order_items(id,tenant_id,warehouse_id,project_id),
  ADD CONSTRAINT inventory_transactions_material_source_check CHECK(
    (source_type='supplier_purchase_receipt_item' AND warehouse_issue_item_id IS NULL AND warehouse_return_item_id IS NULL)
    OR(source_type='warehouse_issue_item' AND transaction_type='project_issue'
      AND warehouse_issue_item_id IS NOT NULL AND source_id=warehouse_issue_item_id AND warehouse_return_item_id IS NULL
      AND project_id IS NOT NULL AND cost_category_id IS NOT NULL AND quantity_delta<0 AND value_delta<=0)
    OR(source_type='warehouse_return_item' AND transaction_type='project_return'
      AND warehouse_return_item_id IS NOT NULL AND source_id=warehouse_return_item_id AND warehouse_issue_item_id IS NULL
      AND project_id IS NOT NULL AND cost_category_id IS NOT NULL AND quantity_delta>0 AND value_delta>=0)
  );

-- Completed documents/items cannot be edited even by a future application path.
CREATE FUNCTION public.__gooes_material_guard_document() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_status text;
BEGIN
  IF TG_TABLE_NAME IN ('warehouse_issue_orders','warehouse_return_orders') THEN
    IF OLD.status IN ('completed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_IMMUTABLE';
    END IF;
  ELSE
    IF TG_TABLE_NAME='warehouse_issue_order_items' THEN
      SELECT status INTO v_status FROM public.warehouse_issue_orders WHERE id=OLD.issue_order_id;
    ELSE
      SELECT status INTO v_status FROM public.warehouse_return_orders WHERE id=OLD.return_order_id;
    END IF;
    IF v_status IN ('completed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_IMMUTABLE';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.__gooes_material_assert_actor(p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_MATERIAL_FORBIDDEN';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employees e JOIN public.tenants t ON t.id=e.tenant_id
    WHERE e.tenant_id=p_tenant_id AND e.id=p_actor_employee_id AND e.user_id=p_actor_user_id
      AND e.status='active' AND t.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_MATERIAL_ACTOR_INVALID';
  END IF;
END;
$$;
CREATE FUNCTION public.__gooes_material_assert_project(p_tenant_id uuid,p_actor_employee_id uuid,p_project_id uuid,p_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,p_permission)
    OR NOT public.__gooes_employee_has_project_permission_scope(p_tenant_id,p_actor_employee_id,p_project_id,'project.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_MATERIAL_FORBIDDEN';
  END IF;
END;
$$;

CREATE FUNCTION public.command_warehouse_material_order(
  p_order_id uuid,p_tenant_id uuid,p_document_type text,p_command text,p_expected_version integer,
  p_payload jsonb,p_actor_user_id uuid,p_actor_employee_id uuid,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_table text; v_order jsonb; v_result jsonb; v_event public.warehouse_material_command_events%ROWTYPE;
  v_fingerprint text; v_warehouse_id uuid; v_project_id uuid; v_original_id uuid;
  v_permission text; v_status text; v_reason text; v_items jsonb; v_item jsonb; v_line integer:=0;
  v_issue public.warehouse_issue_order_items%ROWTYPE; v_return record;
  v_balance public.inventory_balances%ROWTYPE; v_skus uuid[]; v_amount numeric(18,2); v_unit_cost numeric(18,4);
  v_returned_quantity numeric; v_returned_amount numeric; v_count integer;
BEGIN
  PERFORM public.__gooes_material_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF p_order_id IS NULL OR p_document_type IS NULL OR p_document_type NOT IN ('issue','return')
    OR p_command IS NULL OR p_command NOT IN ('save_draft','submit','complete','cancel')
    OR p_expected_version IS NULL OR p_expected_version<0
    OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
    OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 1 AND 120
    OR char_length(p_idempotency_key)>120
    OR (p_document_type='return' AND p_command='submit') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID';
  END IF;
  v_table:=CASE p_document_type WHEN 'issue' THEN 'warehouse_issue_orders' ELSE 'warehouse_return_orders' END;
  v_permission:=CASE p_command WHEN 'complete' THEN 'inventory.issue.approve' ELSE 'inventory.issue.manage' END;
  IF p_command='save_draft' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k<>ALL(
      CASE p_document_type WHEN 'issue' THEN ARRAY['warehouse_id','project_id','reason','items']
        ELSE ARRAY['original_issue_order_id','reason','items'] END))
      OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array'
      OR (p_payload ? 'reason' AND jsonb_typeof(p_payload->'reason') NOT IN ('string','null'))
      OR char_length(p_payload->>'reason')>500 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID';
    END IF;
    v_items:=p_payload->'items'; v_reason:=NULLIF(btrim(p_payload->>'reason'),'');
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_ITEMS_INVALID';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      IF jsonb_typeof(v_item)<>'object' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_ITEMS_INVALID';
      END IF;
      IF EXISTS(SELECT 1 FROM jsonb_object_keys(v_item) k WHERE k<>ALL(
          CASE p_document_type WHEN 'issue' THEN ARRAY['supplier_sku_id','quantity'] ELSE ARRAY['original_issue_item_id','quantity'] END))
        OR COALESCE(v_item->>'quantity','') !~ '^[0-9]{1,14}(\.[0-9]{1,4})?$'
        OR COALESCE(v_item->>CASE p_document_type WHEN 'issue' THEN 'supplier_sku_id' ELSE 'original_issue_item_id' END,'')
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_ITEMS_INVALID';
      END IF;
      IF (v_item->>'quantity')::numeric<=0 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_ITEMS_INVALID';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT (value->>CASE p_document_type WHEN 'issue' THEN 'supplier_sku_id' ELSE 'original_issue_item_id' END)::uuid)
        FROM jsonb_array_elements(v_items))<>jsonb_array_length(v_items) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_ITEMS_INVALID';
    END IF;
  ELSIF p_payload<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID';
  END IF;

  v_fingerprint:=encode(sha256(jsonb_build_object('tenant_id',p_tenant_id,'order_id',p_order_id,
    'document_type',p_document_type,'command',p_command,'expected_version',p_expected_version,
    'payload',p_payload,'actor_employee_id',p_actor_employee_id)::text::bytea),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-material-key:'||p_actor_user_id||':'||p_idempotency_key,0));
  SELECT * INTO v_event FROM public.warehouse_material_command_events
    WHERE actor_user_id=p_actor_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_event.request_fingerprint<>v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_IDEMPOTENCY_CONFLICT';
    END IF;
    -- Authenticate before replay; use frozen project identity and current ACLs,
    -- but do not revisit operational flags, warehouse status or current document state.
    PERFORM public.__gooes_material_assert_project(p_tenant_id,p_actor_employee_id,
      (v_event.result->'order'->>'project_id')::uuid,v_permission);
    RETURN v_event.result;
  END IF;

  EXECUTE format('SELECT to_jsonb(o) FROM public.%I o WHERE id=$1 AND tenant_id=$2',v_table)
    INTO v_order USING p_order_id,p_tenant_id;
  IF p_command='save_draft' THEN
    IF p_document_type='issue' THEN
      IF COALESCE(p_payload->>'warehouse_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR COALESCE(p_payload->>'project_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID';
      END IF;
      v_warehouse_id:=(p_payload->>'warehouse_id')::uuid; v_project_id:=(p_payload->>'project_id')::uuid;
    ELSE
      IF COALESCE(p_payload->>'original_issue_order_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID';
      END IF;
      v_original_id:=(p_payload->>'original_issue_order_id')::uuid;
      SELECT warehouse_id,project_id INTO v_warehouse_id,v_project_id FROM public.warehouse_issue_orders
        WHERE id=v_original_id AND tenant_id=p_tenant_id AND status='completed';
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_SOURCE_CONFLICT'; END IF;
    END IF;
  ELSE
    IF v_order IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_NOT_FOUND'; END IF;
    v_warehouse_id:=(v_order->>'warehouse_id')::uuid; v_project_id:=(v_order->>'project_id')::uuid;
    v_original_id:=(v_order->>'original_issue_order_id')::uuid;
  END IF;
  PERFORM public.__gooes_material_assert_project(p_tenant_id,p_actor_employee_id,v_project_id,v_permission);

  -- Same global order as warehouse receipts: settings -> warehouse -> document.
  -- A warehouse lock serializes all receipts/issues/returns before balance locks.
  PERFORM 1 FROM public.tenant_supplier_settings WHERE tenant_id=p_tenant_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_supplier_settings
    WHERE tenant_id=p_tenant_id AND module_enabled AND warehouse_materials_enabled) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_NOT_ENABLED';
  END IF;
  PERFORM 1 FROM public.warehouses WHERE id=v_warehouse_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_WAREHOUSE_INVALID'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=v_warehouse_id AND status='active') THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_WAREHOUSE_INACTIVE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('warehouse-material-order:'||p_document_type||':'||p_order_id,0));
  EXECUTE format('SELECT to_jsonb(o) FROM public.%I o WHERE id=$1 AND tenant_id=$2 FOR UPDATE',v_table)
    INTO v_order USING p_order_id,p_tenant_id;
  IF v_order IS NULL THEN
    IF p_command<>'save_draft' OR p_expected_version<>0 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_VERSION_CONFLICT';
    END IF;
  ELSE
    IF (v_order->>'version')::integer<>p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_VERSION_CONFLICT';
    END IF;
    IF (v_order->>'warehouse_id')::uuid<>v_warehouse_id OR (v_order->>'project_id')::uuid<>v_project_id
      OR (p_document_type='return' AND (v_order->>'original_issue_order_id')::uuid<>v_original_id) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_SOURCE_CONFLICT';
    END IF;
    IF NOT ((p_command IN ('save_draft','submit') AND v_order->>'status'='draft')
      OR(p_command='cancel' AND v_order->>'status' IN ('draft','submitted'))
      OR(p_command='complete' AND v_order->>'status'=CASE p_document_type WHEN 'issue' THEN 'submitted' ELSE 'draft' END)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_STATE_CONFLICT';
    END IF;
  END IF;

  IF p_command='save_draft' THEN
    IF p_document_type='issue' THEN
      SELECT array_agg((value->>'supplier_sku_id')::uuid) INTO v_skus FROM jsonb_array_elements(v_items);
      SELECT count(*) INTO v_count FROM public.supplier_skus sku JOIN public.supplier_products product
        ON product.id=sku.supplier_product_id AND product.supplier_id=sku.supplier_id
        WHERE sku.id=ANY(v_skus) AND sku.status='active' AND product.status='active'
          AND sku.ownership_scope=product.ownership_scope AND sku.owner_tenant_id IS NOT DISTINCT FROM product.owner_tenant_id
          AND ((sku.ownership_scope='platform' AND sku.owner_tenant_id IS NULL)
            OR(sku.ownership_scope='tenant' AND sku.owner_tenant_id=p_tenant_id));
      IF v_count<>cardinality(v_skus) THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_SKU_INVALID'; END IF;
      IF v_order IS NULL THEN
        INSERT INTO public.warehouse_issue_orders(id,tenant_id,warehouse_id,project_id,reason,created_by_employee_id,updated_by_employee_id)
          VALUES(p_order_id,p_tenant_id,v_warehouse_id,v_project_id,v_reason,p_actor_employee_id,p_actor_employee_id);
      END IF;
      DELETE FROM public.warehouse_issue_order_items WHERE issue_order_id=p_order_id AND tenant_id=p_tenant_id;
      INSERT INTO public.warehouse_issue_order_items(tenant_id,issue_order_id,warehouse_id,project_id,line_no,supplier_sku_id,quantity)
        SELECT p_tenant_id,p_order_id,v_warehouse_id,v_project_id,ordinality,(value->>'supplier_sku_id')::uuid,(value->>'quantity')::numeric
        FROM jsonb_array_elements(v_items) WITH ORDINALITY;
    ELSE
      PERFORM id FROM public.warehouse_issue_orders WHERE id=v_original_id AND tenant_id=p_tenant_id AND status='completed' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_SOURCE_CONFLICT'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_items) requested
        LEFT JOIN public.warehouse_issue_order_items original ON original.id=(requested->>'original_issue_item_id')::uuid
          AND original.issue_order_id=v_original_id AND original.tenant_id=p_tenant_id
        WHERE original.id IS NULL OR (requested->>'quantity')::numeric>original.quantity) THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_RETURN_QUANTITY_EXCEEDED';
      END IF;
      IF v_order IS NULL THEN
        INSERT INTO public.warehouse_return_orders(id,tenant_id,warehouse_id,project_id,original_issue_order_id,reason,created_by_employee_id,updated_by_employee_id)
          VALUES(p_order_id,p_tenant_id,v_warehouse_id,v_project_id,v_original_id,v_reason,p_actor_employee_id,p_actor_employee_id);
      END IF;
      DELETE FROM public.warehouse_return_order_items WHERE return_order_id=p_order_id AND tenant_id=p_tenant_id;
      INSERT INTO public.warehouse_return_order_items(tenant_id,return_order_id,original_issue_order_id,original_issue_item_id,warehouse_id,project_id,line_no,quantity)
        SELECT p_tenant_id,p_order_id,v_original_id,(value->>'original_issue_item_id')::uuid,v_warehouse_id,v_project_id,ordinality,(value->>'quantity')::numeric
        FROM jsonb_array_elements(v_items) WITH ORDINALITY;
    END IF;
    IF v_order IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET reason=$1,version=version+1,updated_at=now(),updated_by_employee_id=$2 WHERE id=$3',v_table)
        USING v_reason,p_actor_employee_id,p_order_id;
    END IF;
    v_status:='saved';
  ELSIF p_command='submit' THEN
    SELECT array_agg(supplier_sku_id ORDER BY supplier_sku_id) INTO v_skus
      FROM public.warehouse_issue_order_items WHERE issue_order_id=p_order_id AND tenant_id=p_tenant_id;
    IF COALESCE(cardinality(v_skus),0) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_ITEMS_INVALID';
    END IF;
    UPDATE public.warehouse_issue_order_items item SET cost_category_id=resolved.cost_category_id,cost_category_name=resolved.cost_category_name
      FROM public.resolve_tenant_supplier_sku_cost_categories(p_tenant_id,v_skus) resolved
      WHERE item.issue_order_id=p_order_id AND item.tenant_id=p_tenant_id AND item.supplier_sku_id=resolved.supplier_sku_id;
    IF EXISTS(SELECT 1 FROM public.warehouse_issue_order_items item
      LEFT JOIN public.finance_cost_categories category ON category.id=item.cost_category_id AND category.tenant_id=item.tenant_id AND category.status='active'
      WHERE item.issue_order_id=p_order_id AND (category.id IS NULL OR item.cost_category_name IS NULL)) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_COST_CATEGORY_REQUIRED';
    END IF;
    UPDATE public.warehouse_issue_orders SET status='submitted',submitted_at=now(),version=version+1,
      updated_at=now(),updated_by_employee_id=p_actor_employee_id WHERE id=p_order_id;
    v_status:='submitted';
  ELSIF p_command='cancel' THEN
    EXECUTE format('UPDATE public.%I SET status=''cancelled'',cancelled_at=now(),version=version+1,updated_at=now(),updated_by_employee_id=$1 WHERE id=$2',v_table)
      USING p_actor_employee_id,p_order_id;
    v_status:='cancelled';
  ELSE
    IF p_document_type='issue' THEN
      FOR v_issue IN SELECT * FROM public.warehouse_issue_order_items
        WHERE issue_order_id=p_order_id AND tenant_id=p_tenant_id ORDER BY supplier_sku_id,id FOR UPDATE LOOP
        SELECT * INTO v_balance FROM public.inventory_balances WHERE tenant_id=p_tenant_id AND warehouse_id=v_warehouse_id
          AND supplier_sku_id=v_issue.supplier_sku_id FOR UPDATE;
        IF NOT FOUND OR v_balance.quantity_on_hand<v_issue.quantity THEN
          RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_INSUFFICIENT_STOCK';
        END IF;
        v_unit_cost:=round(v_balance.inventory_value/v_balance.quantity_on_hand,4);
        v_amount:=CASE WHEN v_issue.quantity=v_balance.quantity_on_hand THEN v_balance.inventory_value
          ELSE round(v_issue.quantity*v_balance.inventory_value/v_balance.quantity_on_hand,2) END;
        UPDATE public.warehouse_issue_order_items SET unit_cost=v_unit_cost,amount=v_amount WHERE id=v_issue.id;
        INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
          quantity_delta,unit_cost,value_delta,source_type,source_id,project_id,cost_category_id,
          occurred_at,created_by_employee_id,warehouse_issue_item_id)
          VALUES(p_tenant_id,v_warehouse_id,v_issue.supplier_sku_id,'project_issue',-v_issue.quantity,v_unit_cost,-v_amount,
            'warehouse_issue_item',v_issue.id,v_project_id,v_issue.cost_category_id,now(),p_actor_employee_id,v_issue.id);
        UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand-v_issue.quantity,inventory_value=inventory_value-v_amount,
          average_unit_cost=CASE WHEN quantity_on_hand=v_issue.quantity THEN 0
            ELSE round((inventory_value-v_amount)/(quantity_on_hand-v_issue.quantity),4) END,
          version=version+1,updated_at=now() WHERE id=v_balance.id;
        INSERT INTO public.project_cost_events(tenant_id,project_id,cost_category_id,source_type,source_id,
          accepted_quantity,amount,event_direction,warehouse_id,warehouse_issue_item_id,occurred_at,created_by_employee_id)
          VALUES(p_tenant_id,v_project_id,v_issue.cost_category_id,'warehouse_issue_item',v_issue.id,
            v_issue.quantity,v_amount,'increase',v_warehouse_id,v_issue.id,now(),p_actor_employee_id);
      END LOOP;
    ELSE
      PERFORM id FROM public.warehouse_issue_orders WHERE id=v_original_id AND tenant_id=p_tenant_id AND status='completed' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_SOURCE_CONFLICT'; END IF;
      FOR v_return IN SELECT item.*,original.supplier_sku_id FROM public.warehouse_return_order_items item
        JOIN public.warehouse_issue_order_items original ON original.id=item.original_issue_item_id AND original.tenant_id=item.tenant_id
        WHERE item.return_order_id=p_order_id AND item.tenant_id=p_tenant_id ORDER BY original.supplier_sku_id,original.id FOR UPDATE OF item LOOP
        SELECT * INTO STRICT v_issue FROM public.warehouse_issue_order_items WHERE id=v_return.original_issue_item_id
          AND tenant_id=p_tenant_id FOR UPDATE;
        SELECT COALESCE(sum(item.quantity),0),COALESCE(sum(item.amount),0) INTO v_returned_quantity,v_returned_amount
          FROM public.warehouse_return_order_items item JOIN public.warehouse_return_orders parent
            ON parent.id=item.return_order_id AND parent.tenant_id=item.tenant_id
          WHERE item.tenant_id=p_tenant_id AND item.original_issue_item_id=v_issue.id AND parent.status='completed';
        IF v_return.quantity+v_returned_quantity>v_issue.quantity THEN
          RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_RETURN_QUANTITY_EXCEEDED';
        END IF;
        v_amount:=round(v_issue.amount*(v_return.quantity+v_returned_quantity)/v_issue.quantity,2)-v_returned_amount;
        v_unit_cost:=v_issue.unit_cost;
        UPDATE public.warehouse_return_order_items SET unit_cost=v_unit_cost,amount=v_amount WHERE id=v_return.id;
        INSERT INTO public.inventory_balances(tenant_id,warehouse_id,supplier_sku_id) VALUES(p_tenant_id,v_warehouse_id,v_issue.supplier_sku_id)
          ON CONFLICT(tenant_id,warehouse_id,supplier_sku_id) DO NOTHING;
        SELECT * INTO STRICT v_balance FROM public.inventory_balances WHERE tenant_id=p_tenant_id AND warehouse_id=v_warehouse_id
          AND supplier_sku_id=v_issue.supplier_sku_id FOR UPDATE;
        INSERT INTO public.inventory_transactions(tenant_id,warehouse_id,supplier_sku_id,transaction_type,
          quantity_delta,unit_cost,value_delta,source_type,source_id,project_id,cost_category_id,
          occurred_at,created_by_employee_id,warehouse_return_item_id)
          VALUES(p_tenant_id,v_warehouse_id,v_issue.supplier_sku_id,'project_return',v_return.quantity,v_unit_cost,v_amount,
            'warehouse_return_item',v_return.id,v_project_id,v_issue.cost_category_id,now(),p_actor_employee_id,v_return.id);
        UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand+v_return.quantity,inventory_value=inventory_value+v_amount,
          average_unit_cost=round((inventory_value+v_amount)/(quantity_on_hand+v_return.quantity),4),
          version=version+1,updated_at=now() WHERE id=v_balance.id;
        INSERT INTO public.project_cost_events(tenant_id,project_id,cost_category_id,source_type,source_id,
          accepted_quantity,amount,event_direction,warehouse_id,warehouse_return_item_id,occurred_at,created_by_employee_id)
          VALUES(p_tenant_id,v_project_id,v_issue.cost_category_id,'warehouse_return_item',v_return.id,
            v_return.quantity,v_amount,'decrease',v_warehouse_id,v_return.id,now(),p_actor_employee_id);
      END LOOP;
    END IF;
    EXECUTE format('UPDATE public.%I SET status=''completed'',completed_at=now(),version=version+1,updated_at=now(),updated_by_employee_id=$1 WHERE id=$2',v_table)
      USING p_actor_employee_id,p_order_id;
    v_status:='completed';
  END IF;
  EXECUTE format('SELECT to_jsonb(o) FROM public.%I o WHERE id=$1 AND tenant_id=$2',v_table)
    INTO v_order USING p_order_id,p_tenant_id;
  v_result:=jsonb_build_object('status',v_status,'order',v_order);
  INSERT INTO public.warehouse_material_command_events(tenant_id,order_id,document_type,command,
    actor_user_id,actor_employee_id,idempotency_key,request_fingerprint,result)
    VALUES(p_tenant_id,p_order_id,p_document_type,p_command,p_actor_user_id,p_actor_employee_id,p_idempotency_key,v_fingerprint,v_result);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.__gooes_material_order_summary(p_tenant_id uuid,p_document_type text,p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order jsonb; v_amount numeric; v_count integer; v_original_no text;
BEGIN
  IF p_document_type='issue' THEN
    SELECT to_jsonb(o) INTO v_order FROM public.warehouse_issue_orders o WHERE id=p_order_id AND tenant_id=p_tenant_id;
    SELECT sum(amount),count(*) INTO v_amount,v_count FROM public.warehouse_issue_order_items WHERE issue_order_id=p_order_id AND tenant_id=p_tenant_id;
  ELSE
    SELECT to_jsonb(o),original.order_no INTO v_order,v_original_no FROM public.warehouse_return_orders o
      JOIN public.warehouse_issue_orders original ON original.id=o.original_issue_order_id AND original.tenant_id=o.tenant_id
      WHERE o.id=p_order_id AND o.tenant_id=p_tenant_id;
    SELECT sum(amount),count(*) INTO v_amount,v_count FROM public.warehouse_return_order_items WHERE return_order_id=p_order_id AND tenant_id=p_tenant_id;
    v_order:=v_order||jsonb_build_object('original_issue_order_no',v_original_no);
  END IF;
  IF v_order IS NULL THEN RETURN NULL; END IF;
  RETURN v_order||jsonb_build_object('document_type',p_document_type,'total_amount',v_amount::numeric(18,2)::text,'item_count',v_count,
    'warehouse_name',(SELECT name FROM public.warehouses WHERE id=(v_order->>'warehouse_id')::uuid AND tenant_id=p_tenant_id),
    'project_name',(SELECT name FROM public.projects WHERE id=(v_order->>'project_id')::uuid AND tenant_id=p_tenant_id));
END;
$$;

CREATE FUNCTION public.get_warehouse_material_order(p_tenant_id uuid,p_document_type text,p_order_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order jsonb;
BEGIN
  PERFORM public.__gooes_material_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF p_document_type IS NULL OR p_document_type NOT IN ('issue','return') OR p_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID';
  END IF;
  v_order:=public.__gooes_material_order_summary(p_tenant_id,p_document_type,p_order_id);
  IF v_order IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_NOT_FOUND'; END IF;
  PERFORM public.__gooes_material_assert_project(p_tenant_id,p_actor_employee_id,(v_order->>'project_id')::uuid,'inventory.stock.view');
  RETURN v_order;
END;
$$;

CREATE FUNCTION public.list_warehouse_material_orders(
  p_tenant_id uuid,p_document_type text,p_actor_user_id uuid,p_actor_employee_id uuid,
  p_warehouse_id uuid DEFAULT NULL,p_project_id uuid DEFAULT NULL,p_status text DEFAULT NULL,p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET plan_cache_mode=force_custom_plan AS $$
DECLARE v_page integer:=greatest(COALESCE(p_page,1),1); v_size integer:=least(greatest(COALESCE(p_page_size,20),1),100);
  v_table text; v_item_table text; v_order_column text; v_total bigint; v_items jsonb;
BEGIN
  PERFORM public.__gooes_material_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF p_document_type IS NULL OR p_document_type NOT IN ('issue','return')
    OR (p_status IS NOT NULL AND p_status<>ALL(CASE p_document_type WHEN 'issue'
      THEN ARRAY['draft','submitted','completed','cancelled'] ELSE ARRAY['draft','completed','cancelled'] END))
    OR char_length(p_keyword)>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID'; END IF;
  IF NOT public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.stock.view') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_MATERIAL_FORBIDDEN';
  END IF;
  IF p_project_id IS NOT NULL THEN
    PERFORM public.__gooes_material_assert_project(p_tenant_id,p_actor_employee_id,p_project_id,'inventory.stock.view');
  END IF;
  v_table:=CASE p_document_type WHEN 'issue' THEN 'warehouse_issue_orders' ELSE 'warehouse_return_orders' END;
  v_item_table:=CASE p_document_type WHEN 'issue' THEN 'warehouse_issue_order_items' ELSE 'warehouse_return_order_items' END;
  v_order_column:=CASE p_document_type WHEN 'issue' THEN 'issue_order_id' ELSE 'return_order_id' END;
  EXECUTE format($query$
    WITH visible_projects AS MATERIALIZED (
      SELECT id FROM public.projects WHERE tenant_id=$1 AND ($3 IS NULL OR id=$3)
        AND public.__gooes_employee_has_project_permission_scope($1,$5,id,'project.read')
    ), filtered AS NOT MATERIALIZED (
      SELECT o.id,o.created_at FROM public.%I o JOIN visible_projects p ON p.id=o.project_id
      WHERE o.tenant_id=$1 AND ($2 IS NULL OR o.warehouse_id=$2) AND ($3 IS NULL OR o.project_id=$3)
        AND ($4 IS NULL OR o.status=$4)
        AND ($6 IS NULL OR o.order_no ILIKE '%%'||$6||'%%' OR o.reason ILIKE '%%'||$6||'%%')
    ), counted AS MATERIALIZED (SELECT count(*) total FROM filtered), page_ids AS MATERIALIZED (
      SELECT id,created_at FROM filtered ORDER BY created_at DESC,id DESC LIMIT $7 OFFSET $8
    ), item_totals AS MATERIALIZED (
      SELECT item.%I order_id,count(*) item_count,sum(item.amount)::numeric(18,2)::text total_amount
      FROM public.%I item JOIN page_ids page ON page.id=item.%I WHERE item.tenant_id=$1 GROUP BY item.%I
    ), page AS MATERIALIZED (
      SELECT o.id,o.created_at,to_jsonb(o)||jsonb_build_object('document_type',$9,
        'warehouse_name',w.name,'project_name',p.name,'item_count',COALESCE(t.item_count,0),'total_amount',t.total_amount,
        'original_issue_order_no',original.order_no) document
      FROM page_ids page JOIN public.%I o ON o.id=page.id AND o.tenant_id=$1
      JOIN public.warehouses w ON w.id=o.warehouse_id AND w.tenant_id=o.tenant_id
      JOIN public.projects p ON p.id=o.project_id AND p.tenant_id=o.tenant_id
      LEFT JOIN item_totals t ON t.order_id=o.id
      LEFT JOIN public.warehouse_issue_orders original ON original.id=(to_jsonb(o)->>'original_issue_order_id')::uuid AND original.tenant_id=o.tenant_id
    ) SELECT counted.total,COALESCE(jsonb_agg(page.document ORDER BY page.created_at DESC,page.id DESC)
      FILTER(WHERE page.id IS NOT NULL),'[]'::jsonb) FROM counted LEFT JOIN page ON true GROUP BY counted.total
  $query$,v_table,v_order_column,v_item_table,v_order_column,v_order_column,v_table) INTO v_total,v_items
    USING p_tenant_id,p_warehouse_id,p_project_id,p_status,p_actor_employee_id,NULLIF(btrim(p_keyword),''),v_size,(v_page::bigint-1)*v_size,p_document_type;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'pageSize',v_size);
END;
$$;

CREATE FUNCTION public.list_warehouse_material_order_items(p_tenant_id uuid,p_document_type text,p_order_id uuid,
  p_actor_user_id uuid,p_actor_employee_id uuid,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_page integer:=greatest(COALESCE(p_page,1),1); v_size integer:=least(greatest(COALESCE(p_page_size,20),1),100);
  v_order jsonb; v_items jsonb; v_total bigint;
BEGIN
  v_order:=public.get_warehouse_material_order(p_tenant_id,p_document_type,p_order_id,p_actor_user_id,p_actor_employee_id);
  IF p_document_type='issue' THEN
    WITH filtered AS MATERIALIZED(SELECT id,tenant_id,issue_order_id,warehouse_id,project_id,line_no,supplier_sku_id,
      quantity,cost_category_id,cost_category_name,unit_cost,amount
      FROM public.warehouse_issue_order_items WHERE issue_order_id=p_order_id AND tenant_id=p_tenant_id),
    counted AS(SELECT count(*) total FROM filtered),
    page AS(SELECT * FROM filtered ORDER BY line_no,id LIMIT v_size OFFSET (v_page::bigint-1)*v_size)
    SELECT counted.total,COALESCE(jsonb_agg(to_jsonb(page)||jsonb_build_object(
      'quantity',page.quantity::text,'unit_cost',page.unit_cost::text,'amount',page.amount::text,
      'sku_name',sku.name,'sku_code',sku.sku_code,'original_issued_quantity',page.quantity::text,'original_issued_amount',page.amount::text,
      'returned_quantity',returned.quantity::text,'returned_amount',returned.amount::text,
      'returnable_quantity',(CASE WHEN v_order->>'status'='completed' THEN page.quantity-returned.quantity ELSE 0 END)::numeric(18,4)::text)
      ORDER BY page.line_no,page.id) FILTER(WHERE page.id IS NOT NULL),'[]'::jsonb)
      INTO v_total,v_items FROM counted LEFT JOIN page ON true
      LEFT JOIN public.supplier_skus sku ON sku.id=page.supplier_sku_id
      LEFT JOIN LATERAL(SELECT COALESCE(sum(item.quantity),0)::numeric(18,4) quantity,COALESCE(sum(item.amount),0)::numeric(18,2) amount
        FROM public.warehouse_return_order_items item JOIN public.warehouse_return_orders o ON o.id=item.return_order_id AND o.tenant_id=item.tenant_id
        WHERE item.tenant_id=p_tenant_id AND item.original_issue_item_id=page.id AND o.status='completed') returned ON true
      GROUP BY counted.total;
  ELSE
    WITH filtered AS MATERIALIZED(SELECT id,tenant_id,return_order_id,original_issue_order_id,original_issue_item_id,warehouse_id,project_id,line_no,quantity,unit_cost,amount
      FROM public.warehouse_return_order_items WHERE return_order_id=p_order_id AND tenant_id=p_tenant_id),
    counted AS(SELECT count(*) total FROM filtered),
    page AS(SELECT * FROM filtered ORDER BY line_no,id LIMIT v_size OFFSET (v_page::bigint-1)*v_size)
    SELECT counted.total,COALESCE(jsonb_agg(to_jsonb(page)||jsonb_build_object(
      'quantity',page.quantity::text,'unit_cost',page.unit_cost::text,'amount',page.amount::text,
      'supplier_sku_id',original.supplier_sku_id,'sku_name',sku.name,'sku_code',sku.sku_code,
      'cost_category_id',original.cost_category_id,'cost_category_name',original.cost_category_name,
      'original_issued_quantity',original.quantity::text,'original_issued_amount',original.amount::text,
      'returned_quantity',returned.quantity::text,'returned_amount',returned.amount::text,'returnable_quantity',(original.quantity-returned.quantity)::numeric(18,4)::text)
      ORDER BY page.line_no,page.id) FILTER(WHERE page.id IS NOT NULL),'[]'::jsonb)
      INTO v_total,v_items FROM counted LEFT JOIN page ON true
      LEFT JOIN public.warehouse_issue_order_items original ON original.id=page.original_issue_item_id AND original.tenant_id=p_tenant_id
      LEFT JOIN public.supplier_skus sku ON sku.id=original.supplier_sku_id
      LEFT JOIN LATERAL(SELECT COALESCE(sum(item.quantity),0)::numeric(18,4) quantity,COALESCE(sum(item.amount),0)::numeric(18,2) amount
        FROM public.warehouse_return_order_items item JOIN public.warehouse_return_orders o ON o.id=item.return_order_id AND o.tenant_id=item.tenant_id
        WHERE item.tenant_id=p_tenant_id AND item.original_issue_item_id=original.id AND o.status='completed') returned ON true
      GROUP BY counted.total;
  END IF;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'pageSize',v_size);
END;
$$;

CREATE FUNCTION public.list_warehouse_material_projects(p_tenant_id uuid,p_actor_user_id uuid,p_actor_employee_id uuid,
  p_keyword text DEFAULT NULL,p_page integer DEFAULT 1,p_page_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_page integer:=greatest(COALESCE(p_page,1),1); v_size integer:=least(greatest(COALESCE(p_page_size,20),1),100);
  v_total bigint; v_items jsonb;
BEGIN
  PERFORM public.__gooes_material_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id);
  IF char_length(p_keyword)>100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='WAREHOUSE_MATERIAL_INVALID'; END IF;
  IF NOT (public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.issue.manage')
    OR public.__gooes_has_tenant_procurement_permission(p_tenant_id,p_actor_employee_id,'inventory.issue.approve')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='WAREHOUSE_MATERIAL_FORBIDDEN';
  END IF;
  WITH filtered AS NOT MATERIALIZED (
    SELECT id,name FROM public.projects WHERE tenant_id=p_tenant_id
      AND (NULLIF(btrim(p_keyword),'') IS NULL OR name ILIKE '%'||btrim(p_keyword)||'%')
      AND public.__gooes_employee_has_project_permission_scope(p_tenant_id,p_actor_employee_id,id,'project.read')
  ), counted AS(SELECT count(*) total FROM filtered),
  page AS(SELECT id,name FROM filtered ORDER BY name,id LIMIT v_size OFFSET (v_page::bigint-1)*v_size)
  SELECT counted.total,COALESCE(jsonb_agg(jsonb_build_object('id',page.id,'name',page.name) ORDER BY page.name,page.id)
    FILTER(WHERE page.id IS NOT NULL),'[]'::jsonb) INTO v_total,v_items FROM counted LEFT JOIN page ON true GROUP BY counted.total;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'pageSize',v_size);
END;
$$;

DO $security$
DECLARE v_table text; v_function regprocedure;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['warehouse_issue_orders','warehouse_issue_order_items','warehouse_return_orders','warehouse_return_order_items','warehouse_material_command_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',v_table);
    IF v_table<>'warehouse_material_command_events' THEN
      EXECUTE format('CREATE TRIGGER material_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.__gooes_material_guard_document()',v_table);
    END IF;
  END LOOP;
  FOR v_function IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND (proname LIKE '__gooes_material_%' OR proname IN('command_warehouse_material_order','get_warehouse_material_order','list_warehouse_material_orders','list_warehouse_material_order_items','list_warehouse_material_projects')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_function);
    IF v_function::text NOT LIKE '__gooes_material_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',v_function);
    END IF;
  END LOOP;
END;
$security$;
REVOKE ALL ON SEQUENCE public.warehouse_material_order_number_seq FROM PUBLIC,anon,authenticated,service_role;

-- Add material document lookup only after pagination; original receipt lookup
-- and its tenant/SKU/warehouse chain checks remain intact.
DO $source_document$
DECLARE v_definition text:=pg_get_functiondef('public.list_inventory_transactions(uuid,uuid,uuid,text,integer,integer)'::regprocedure);
  v_old text:='      AND receipt_item.accepted_quantity>0';
  v_new text;
BEGIN
  IF (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_MATERIAL_SOURCE_READ_PATCH_MISMATCH';
  END IF;
  v_new:=v_old||$addition$
    UNION ALL
    SELECT jsonb_build_object('issue_order_id',o.id,'issue_order_no',o.order_no)
    FROM public.warehouse_issue_order_items item JOIN public.warehouse_issue_orders o ON o.id=item.issue_order_id AND o.tenant_id=item.tenant_id
    WHERE page_rows.source_type='warehouse_issue_item' AND page_rows.transaction_type='project_issue'
      AND item.id=page_rows.source_id AND item.tenant_id=page_rows.tenant_id
      AND item.supplier_sku_id=page_rows.supplier_sku_id AND item.warehouse_id=page_rows.warehouse_id
      AND item.project_id=page_rows.project_id AND o.status='completed'
    UNION ALL
    SELECT jsonb_build_object('return_order_id',o.id,'return_order_no',o.order_no,'issue_order_id',original.issue_order_id,'issue_order_no',original_order.order_no)
    FROM public.warehouse_return_order_items item JOIN public.warehouse_return_orders o ON o.id=item.return_order_id AND o.tenant_id=item.tenant_id
    JOIN public.warehouse_issue_order_items original ON original.id=item.original_issue_item_id AND original.tenant_id=item.tenant_id
    JOIN public.warehouse_issue_orders original_order ON original_order.id=original.issue_order_id AND original_order.tenant_id=original.tenant_id
    WHERE page_rows.source_type='warehouse_return_item' AND page_rows.transaction_type='project_return'
      AND item.id=page_rows.source_id AND item.tenant_id=page_rows.tenant_id
      AND original.supplier_sku_id=page_rows.supplier_sku_id AND item.warehouse_id=page_rows.warehouse_id
      AND item.project_id=page_rows.project_id AND o.status='completed'
$addition$;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$source_document$;
NOTIFY pgrst,'reload schema';
COMMIT;
