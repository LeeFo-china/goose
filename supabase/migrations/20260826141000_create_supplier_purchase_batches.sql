-- Rollback: forward-only. Revoke future batch command entry points and hide
-- batch API/UI access first. Preserve batch, item, child-document and command
-- event audit facts. Remove additive columns or tables only in a separately
-- reviewed migration after proving that no batch-owned records exist.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE SEQUENCE public.supplier_purchase_batch_number_seq
AS bigint
START WITH 1
INCREMENT BY 1
NO MINVALUE
MAXVALUE 99999999
NO CYCLE
CACHE 1;

CREATE TABLE public.supplier_purchase_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  batch_no text NOT NULL DEFAULT (
    'PB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
      lpad(
        nextval('public.supplier_purchase_batch_number_seq')::text,
        8,
        '0'
      )
  ),
  status text NOT NULL DEFAULT 'draft',
  reason text NOT NULL,
  expected_delivery_date date NULL,
  remark text NULL,
  priced_at timestamptz NOT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  subtotal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  budget_checked_at timestamptz NULL,
  budget_status text NOT NULL DEFAULT 'unchecked',
  budget_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  split_generation integer NOT NULL DEFAULT 0,
  supplier_count integer NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL,
  updated_by_employee_id uuid NOT NULL,
  submitted_by_employee_id uuid NULL,
  submitted_at timestamptz NULL,
  reviewed_by_employee_id uuid NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  cancelled_by_employee_id uuid NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_batches_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batches_creator_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batches_updater_tenant_fkey
    FOREIGN KEY (updated_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batches_submitter_tenant_fkey
    FOREIGN KEY (submitted_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batches_reviewer_tenant_fkey
    FOREIGN KEY (reviewed_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batches_canceller_tenant_fkey
    FOREIGN KEY (cancelled_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batches_status_check
    CHECK (
      status IN (
        'draft',
        'pending_approval',
        'rejected',
        'cancelled',
        'ordered'
      )
    ),
  CONSTRAINT supplier_purchase_batches_batch_no_check
    CHECK (batch_no ~ '^PB-[0-9]{8}-[0-9]{8}$'),
  CONSTRAINT supplier_purchase_batches_reason_check
    CHECK (
      reason = btrim(reason)
      AND char_length(reason) BETWEEN 1 AND 500
    ),
  CONSTRAINT supplier_purchase_batches_remark_check
    CHECK (
      remark IS NULL
      OR (
        remark = btrim(remark)
        AND char_length(remark) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT supplier_purchase_batches_currency_check
    CHECK (currency::text = 'CNY'),
  CONSTRAINT supplier_purchase_batches_amount_check
    CHECK (
      subtotal_amount >= 0
      AND tax_amount >= 0
      AND total_amount >= 0
      AND total_amount = subtotal_amount + tax_amount
    ),
  CONSTRAINT supplier_purchase_batches_budget_status_check
    CHECK (budget_status IN ('unchecked', 'within_budget', 'over_budget')),
  CONSTRAINT supplier_purchase_batches_budget_snapshot_check
    CHECK (jsonb_typeof(budget_snapshot) = 'object'),
  CONSTRAINT supplier_purchase_batches_split_generation_check
    CHECK (split_generation >= 0),
  CONSTRAINT supplier_purchase_batches_supplier_count_check
    CHECK (supplier_count BETWEEN 0 AND 20),
  CONSTRAINT supplier_purchase_batches_item_count_check
    CHECK (item_count BETWEEN 0 AND 100),
  CONSTRAINT supplier_purchase_batches_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_purchase_batches_submit_audit_check
    CHECK (
      (submitted_by_employee_id IS NULL AND submitted_at IS NULL)
      OR
      (submitted_by_employee_id IS NOT NULL AND submitted_at IS NOT NULL)
    ),
  CONSTRAINT supplier_purchase_batches_review_audit_check
    CHECK (
      (
        reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
      )
      OR
      (
        reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND submitted_by_employee_id IS NOT NULL
      )
    ),
  CONSTRAINT supplier_purchase_batches_review_remark_check
    CHECK (
      review_remark IS NULL
      OR (
        review_remark = btrim(review_remark)
        AND char_length(review_remark) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT supplier_purchase_batches_cancel_audit_check
    CHECK (
      (
        cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL
        AND cancel_reason IS NULL
      )
      OR
      (
        cancelled_by_employee_id IS NOT NULL
        AND cancelled_at IS NOT NULL
        AND cancel_reason IS NOT NULL
      )
    ),
  CONSTRAINT supplier_purchase_batches_cancel_reason_check
    CHECK (
      cancel_reason IS NULL
      OR (
        cancel_reason = btrim(cancel_reason)
        AND char_length(cancel_reason) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT supplier_purchase_batches_state_audit_check
    CHECK (
      (status = 'draft' AND reviewed_by_employee_id IS NULL
        AND cancelled_by_employee_id IS NULL)
      OR (status = 'pending_approval' AND submitted_by_employee_id IS NOT NULL
        AND reviewed_by_employee_id IS NULL
        AND cancelled_by_employee_id IS NULL)
      OR (status = 'rejected' AND submitted_by_employee_id IS NOT NULL
        AND reviewed_by_employee_id IS NOT NULL
        AND review_remark IS NOT NULL
        AND cancelled_by_employee_id IS NULL)
      OR (status = 'cancelled' AND reviewed_by_employee_id IS NULL
        AND cancelled_by_employee_id IS NOT NULL)
      OR (status = 'ordered' AND submitted_by_employee_id IS NOT NULL
        AND reviewed_by_employee_id IS NOT NULL
        AND cancelled_by_employee_id IS NULL)
    ),
  CONSTRAINT supplier_purchase_batches_id_tenant_key
    UNIQUE (id, tenant_id),
  CONSTRAINT supplier_purchase_batches_tenant_batch_no_key
    UNIQUE (tenant_id, batch_no)
);

CREATE TABLE public.supplier_purchase_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  purchase_batch_id uuid NOT NULL,
  line_no integer NOT NULL,
  supplier_sku_id uuid NOT NULL,
  quantity numeric(18, 4) NOT NULL,
  cost_category_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  tenant_supplier_id uuid NOT NULL,
  supplier_product_id uuid NOT NULL,
  supplier_price_list_id uuid NOT NULL,
  supplier_price_list_item_id uuid NOT NULL
    REFERENCES public.supplier_price_list_items(id) ON DELETE RESTRICT,
  catalog_category_id uuid NOT NULL
    REFERENCES public.catalog_categories(id) ON DELETE RESTRICT,
  category_name_snapshot text NOT NULL,
  brand_id uuid NOT NULL
    REFERENCES public.catalog_brands(id) ON DELETE RESTRICT,
  brand_name_snapshot text NOT NULL,
  product_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  sku_code_snapshot text NOT NULL,
  sku_name_snapshot text NOT NULL,
  specification_snapshot text NULL,
  model_snapshot text NULL,
  purchase_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  purchase_unit_code_snapshot text NOT NULL,
  purchase_unit_name_snapshot text NOT NULL,
  purchase_unit_symbol_snapshot text NOT NULL,
  base_unit_id uuid NOT NULL
    REFERENCES public.catalog_units(id) ON DELETE RESTRICT,
  base_unit_code_snapshot text NOT NULL,
  base_unit_name_snapshot text NOT NULL,
  base_unit_symbol_snapshot text NOT NULL,
  base_unit_conversion numeric(18, 8) NOT NULL,
  supplier_name_snapshot text NOT NULL,
  price_list_code_snapshot text NOT NULL,
  price_list_version_snapshot integer NOT NULL,
  price_effective_from_snapshot timestamptz NOT NULL,
  price_effective_until_snapshot timestamptz NULL,
  priced_at timestamptz NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  tax_rate numeric(7, 6) NOT NULL,
  tax_inclusive boolean NOT NULL,
  line_subtotal_amount numeric(18, 2) NOT NULL,
  line_tax_amount numeric(18, 2) NOT NULL,
  line_total_amount numeric(18, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_batch_items_parent_tenant_fkey
    FOREIGN KEY (purchase_batch_id, tenant_id)
    REFERENCES public.supplier_purchase_batches(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_items_relationship_tenant_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_items_category_tenant_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_items_product_supplier_fkey
    FOREIGN KEY (supplier_product_id, supplier_id)
    REFERENCES public.supplier_products(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_items_sku_supplier_fkey
    FOREIGN KEY (supplier_sku_id, supplier_id)
    REFERENCES public.supplier_skus(id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_items_price_list_tenant_fkey
    FOREIGN KEY (supplier_price_list_id, tenant_id, supplier_id)
    REFERENCES public.supplier_price_lists(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_items_line_no_check
    CHECK (line_no BETWEEN 1 AND 100),
  CONSTRAINT supplier_purchase_batch_items_quantity_check
    CHECK (quantity > 0 AND scale(quantity) <= 4),
  CONSTRAINT supplier_purchase_batch_items_base_conversion_check
    CHECK (base_unit_conversion > 0),
  CONSTRAINT supplier_purchase_batch_items_price_check
    CHECK (unit_price >= 0 AND tax_rate BETWEEN 0 AND 1),
  CONSTRAINT supplier_purchase_batch_items_amount_check
    CHECK (
      line_subtotal_amount >= 0
      AND line_tax_amount >= 0
      AND line_total_amount >= 0
      AND line_total_amount = line_subtotal_amount + line_tax_amount
    ),
  CONSTRAINT supplier_purchase_batch_items_price_period_check
    CHECK (
      price_effective_until_snapshot IS NULL
      OR price_effective_until_snapshot > price_effective_from_snapshot
    ),
  CONSTRAINT supplier_purchase_batch_items_text_snapshot_check
    CHECK (
      product_code_snapshot = btrim(product_code_snapshot)
      AND product_code_snapshot <> ''
      AND product_name_snapshot = btrim(product_name_snapshot)
      AND product_name_snapshot <> ''
      AND sku_code_snapshot = btrim(sku_code_snapshot)
      AND sku_code_snapshot <> ''
      AND sku_name_snapshot = btrim(sku_name_snapshot)
      AND sku_name_snapshot <> ''
      AND category_name_snapshot = btrim(category_name_snapshot)
      AND category_name_snapshot <> ''
      AND brand_name_snapshot = btrim(brand_name_snapshot)
      AND brand_name_snapshot <> ''
      AND supplier_name_snapshot = btrim(supplier_name_snapshot)
      AND supplier_name_snapshot <> ''
      AND price_list_code_snapshot = btrim(price_list_code_snapshot)
      AND price_list_code_snapshot <> ''
    ),
  CONSTRAINT supplier_purchase_batch_items_list_version_check
    CHECK (price_list_version_snapshot > 0),
  CONSTRAINT supplier_purchase_batch_items_parent_sku_key
    UNIQUE (purchase_batch_id, supplier_sku_id),
  CONSTRAINT supplier_purchase_batch_items_parent_line_key
    UNIQUE (purchase_batch_id, line_no)
);

ALTER TABLE public.supplier_purchase_requisitions
ADD COLUMN purchase_batch_id uuid NULL,
ADD COLUMN split_generation integer NULL;

ALTER TABLE public.supplier_purchase_requisitions
ADD CONSTRAINT supplier_purchase_requisitions_batch_tenant_fkey
FOREIGN KEY (purchase_batch_id, tenant_id)
REFERENCES public.supplier_purchase_batches(id, tenant_id)
ON DELETE RESTRICT;

ALTER TABLE public.supplier_purchase_requisitions
ADD CONSTRAINT supplier_purchase_requisitions_batch_generation_check
CHECK (
  (purchase_batch_id IS NULL AND split_generation IS NULL)
  OR (purchase_batch_id IS NOT NULL
    AND split_generation IS NOT NULL
    AND split_generation > 0)
);

CREATE OR REPLACE FUNCTION public.prevent_supplier_purchase_requisition_batch_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.purchase_batch_id IS DISTINCT FROM OLD.purchase_batch_id
    OR NEW.split_generation IS DISTINCT FROM OLD.split_generation
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_OWNERSHIP_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.prevent_supplier_purchase_requisition_batch_reassignment()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_requisitions_prevent_batch_reassignment
BEFORE UPDATE OF purchase_batch_id, split_generation
ON public.supplier_purchase_requisitions
FOR EACH ROW
EXECUTE FUNCTION
  public.prevent_supplier_purchase_requisition_batch_reassignment();

ALTER TABLE public.supplier_purchase_orders
ADD COLUMN purchase_batch_id uuid NULL;

ALTER TABLE public.supplier_purchase_orders
ADD CONSTRAINT supplier_purchase_orders_batch_tenant_fkey
FOREIGN KEY (purchase_batch_id, tenant_id)
REFERENCES public.supplier_purchase_batches(id, tenant_id)
ON DELETE RESTRICT;

CREATE INDEX supplier_purchase_batches_tenant_status_updated_idx
ON public.supplier_purchase_batches(
  tenant_id,
  status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_batches_tenant_project_updated_idx
ON public.supplier_purchase_batches(
  tenant_id,
  project_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_batch_items_parent_line_idx
ON public.supplier_purchase_batch_items(
  tenant_id,
  purchase_batch_id,
  line_no,
  id
);

CREATE UNIQUE INDEX supplier_purchase_requisitions_batch_supplier_generation_uidx
ON public.supplier_purchase_requisitions(
  tenant_id,
  purchase_batch_id,
  split_generation,
  tenant_supplier_id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE UNIQUE INDEX supplier_purchase_orders_batch_supplier_uidx
ON public.supplier_purchase_orders(
  tenant_id,
  purchase_batch_id,
  tenant_supplier_id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE INDEX supplier_purchase_requisitions_batch_generation_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  purchase_batch_id,
  split_generation,
  id
)
WHERE purchase_batch_id IS NOT NULL;

CREATE INDEX supplier_purchase_orders_batch_idx
ON public.supplier_purchase_orders(tenant_id, purchase_batch_id, id)
WHERE purchase_batch_id IS NOT NULL;

CREATE TABLE public.supplier_purchase_batch_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  purchase_batch_id uuid NOT NULL,
  command_type text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL,
  result jsonb NOT NULL,
  result_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_batch_events_parent_tenant_fkey
    FOREIGN KEY (purchase_batch_id, tenant_id)
    REFERENCES public.supplier_purchase_batches(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_events_actor_tenant_fkey
    FOREIGN KEY (actor_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_batch_events_command_check
    CHECK (command_type IN ('save_draft', 'submit', 'review', 'cancel')),
  CONSTRAINT supplier_purchase_batch_events_idempotency_key_check
    CHECK (
      idempotency_key = btrim(idempotency_key)
      AND char_length(idempotency_key) > 0
      AND char_length(idempotency_key) <= 120
    ),
  CONSTRAINT supplier_purchase_batch_events_fingerprint_check
    CHECK (
      request_fingerprint = btrim(request_fingerprint)
      AND request_fingerprint <> ''
      AND char_length(request_fingerprint) <= 128
    ),
  CONSTRAINT supplier_purchase_batch_events_request_check
    CHECK (jsonb_typeof(request) = 'object'),
  CONSTRAINT supplier_purchase_batch_events_result_check
    CHECK (jsonb_typeof(result) = 'object'),
  CONSTRAINT supplier_purchase_batch_events_result_version_check
    CHECK (result_version > 0),
  CONSTRAINT supplier_purchase_batch_events_idempotency_key
    UNIQUE (tenant_id, purchase_batch_id, command_type, idempotency_key)
);

CREATE INDEX supplier_purchase_batch_events_parent_created_idx
ON public.supplier_purchase_batch_command_events(
  tenant_id,
  purchase_batch_id,
  created_at DESC,
  id DESC
);

ALTER FUNCTION public.submit_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, text
) RENAME TO submit_supplier_purchase_requisition_unmanaged_v1;

ALTER FUNCTION public.review_supplier_purchase_requisition(
  uuid, uuid, integer, text, text, uuid, uuid, text
) RENAME TO review_supplier_purchase_requisition_unmanaged_v1;

ALTER FUNCTION public.cancel_supplier_purchase_requisition(
  uuid, uuid, integer, text, uuid, uuid, text
) RENAME TO cancel_supplier_purchase_requisition_unmanaged_v1;

ALTER FUNCTION public.convert_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, uuid, text
) RENAME TO convert_supplier_purchase_requisition_unmanaged_v1;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_requisition_unmanaged_v1(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.review_supplier_purchase_requisition_unmanaged_v1(
  uuid, uuid, integer, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_requisition_unmanaged_v1(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.convert_supplier_purchase_requisition_unmanaged_v1(
  uuid, uuid, integer, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_supplier_purchase_requisition(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_purchase_batch_id uuid;
  v_version integer;
BEGIN
  SELECT requisition.purchase_batch_id, requisition.version
  INTO v_purchase_batch_id, v_version
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id;
  IF FOUND AND v_purchase_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION',
      'version', v_version
    );
  END IF;
  RETURN public.submit_supplier_purchase_requisition_unmanaged_v1(
    p_requisition_id,
    p_tenant_id,
    p_expected_version,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_supplier_purchase_requisition(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_action text,
  p_remark text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_purchase_batch_id uuid;
  v_version integer;
BEGIN
  SELECT requisition.purchase_batch_id, requisition.version
  INTO v_purchase_batch_id, v_version
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id;
  IF FOUND AND v_purchase_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION',
      'version', v_version
    );
  END IF;
  RETURN public.review_supplier_purchase_requisition_unmanaged_v1(
    p_requisition_id,
    p_tenant_id,
    p_expected_version,
    p_action,
    p_remark,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_supplier_purchase_requisition(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_purchase_batch_id uuid;
  v_version integer;
BEGIN
  SELECT requisition.purchase_batch_id, requisition.version
  INTO v_purchase_batch_id, v_version
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id;
  IF FOUND AND v_purchase_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION',
      'version', v_version
    );
  END IF;
  RETURN public.cancel_supplier_purchase_requisition_unmanaged_v1(
    p_requisition_id,
    p_tenant_id,
    p_expected_version,
    p_reason,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_supplier_purchase_requisition(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_purchase_order_id uuid,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_purchase_batch_id uuid;
  v_version integer;
BEGIN
  SELECT requisition.purchase_batch_id, requisition.version
  INTO v_purchase_batch_id, v_version
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id;
  IF FOUND AND v_purchase_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_BATCH_MANAGED_REQUISITION',
      'version', v_version
    );
  END IF;
  RETURN public.convert_supplier_purchase_requisition_unmanaged_v1(
    p_requisition_id,
    p_tenant_id,
    p_expected_version,
    p_purchase_order_id,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.review_supplier_purchase_requisition(
  uuid, uuid, integer, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_supplier_purchase_requisition(
  uuid, uuid, integer, text, text, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_requisition(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_requisition(
  uuid, uuid, integer, text, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.convert_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, uuid, text
) TO service_role;

ALTER TABLE public.supplier_purchase_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_batch_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_batch_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_batch_command_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_purchase_batches,
  public.supplier_purchase_batch_items,
  public.supplier_purchase_batch_command_events
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.supplier_purchase_batches,
  public.supplier_purchase_batch_items,
  public.supplier_purchase_batch_command_events
TO service_role;

REVOKE ALL ON SEQUENCE public.supplier_purchase_batch_number_seq
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
