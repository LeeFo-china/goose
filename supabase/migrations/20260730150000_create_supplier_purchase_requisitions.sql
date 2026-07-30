-- Rollback: use a forward migration to revoke execute from future requisition
-- commands before disabling entry points. Preserve audit history and financial facts.
-- Any destructive rollback requires an explicit reviewed migration.

BEGIN;

-- Run this migration only in a maintenance window. Existing-table DDL needs
-- strong locks, so bound both lock waits and each statement's execution time.
-- If an existing composite unique index build or validation exceeds 30 seconds,
-- the timeout aborts and rolls back the whole transaction. Do not retry by
-- raising limits: use an independent forward preflight migration with
-- CREATE UNIQUE INDEX CONCURRENTLY, then a short transaction with
-- ADD CONSTRAINT USING INDEX, and rerun after adapting this pending migration.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.supplier_command_events
DROP CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.supplier_command_events
ADD CONSTRAINT supplier_command_events_resource_type_check CHECK (
  resource_type IN (
    'supplier',
    'supplier_qualification_type',
    'supplier_qualification',
    'supplier_service_region',
    'supplier_address',
    'supplier_contact',
    'catalog_category',
    'catalog_brand',
    'catalog_unit',
    'tenant_supplier',
    'supplier_contract',
    'supplier_product',
    'supplier_sku',
    'supplier_price_list',
    'supplier_purchase_order',
    'supplier_purchase_requisition'
  )
) NOT VALID;

ALTER TABLE public.supplier_command_events
VALIDATE CONSTRAINT supplier_command_events_resource_type_check;

-- Global eight-digit sequence cap allows fewer than 100,000,000 requisitions
-- over the system lifetime. Expand it with a forward migration before exhaustion.
CREATE SEQUENCE public.supplier_purchase_requisition_number_seq
AS bigint
START WITH 1
INCREMENT BY 1
NO MINVALUE
MAXVALUE 99999999
NO CYCLE
CACHE 1;

ALTER TABLE public.projects
ADD CONSTRAINT projects_id_tenant_key UNIQUE (id, tenant_id);

ALTER TABLE public.finance_cost_categories
ADD CONSTRAINT finance_cost_categories_id_tenant_key
UNIQUE (id, tenant_id);

ALTER TABLE public.tenant_suppliers
ADD CONSTRAINT tenant_suppliers_id_tenant_supplier_key
UNIQUE (id, tenant_id, supplier_id);

CREATE TABLE public.supplier_purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  request_no text NOT NULL DEFAULT (
    'PR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
      lpad(
        nextval('public.supplier_purchase_requisition_number_seq')::text,
        8,
        '0'
      )
  ),
  project_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  budget_status text NOT NULL DEFAULT 'unchecked',
  currency text NOT NULL DEFAULT 'CNY',
  reason text NOT NULL,
  expected_delivery_date date NULL,
  remark text NULL,
  priced_at timestamptz NOT NULL,
  subtotal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  purchase_order_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  submitted_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  submitted_at timestamptz NULL,
  reviewed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  cancelled_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_requisitions_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_requisitions_relationship_tenant_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_requisitions_status_check
    CHECK (
      status IN (
        'draft',
        'pending_approval',
        'approved',
        'rejected',
        'cancelled',
        'converted'
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_budget_status_check
    CHECK (
      budget_status IN ('unchecked', 'within_budget', 'over_budget')
    ),
  CONSTRAINT supplier_purchase_requisitions_currency_check
    CHECK (currency = 'CNY'),
  CONSTRAINT supplier_purchase_requisitions_request_no_check
    CHECK (request_no ~ '^PR-[0-9]{8}-[0-9]{8}$'),
  CONSTRAINT supplier_purchase_requisitions_reason_check
    CHECK (
      reason = btrim(reason)
      AND char_length(reason) BETWEEN 1 AND 500
    ),
  CONSTRAINT supplier_purchase_requisitions_remark_check
    CHECK (
      remark IS NULL
      OR (
        remark = btrim(remark)
        AND char_length(remark) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_amount_check
    CHECK (
      subtotal_amount >= 0
      AND tax_amount >= 0
      AND total_amount >= 0
      AND total_amount = subtotal_amount + tax_amount
    ),
  CONSTRAINT supplier_purchase_requisitions_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_purchase_requisitions_review_remark_check
    CHECK (
      review_remark IS NULL
      OR (
        review_remark = btrim(review_remark)
        AND char_length(review_remark) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_cancel_reason_check
    CHECK (
      cancel_reason IS NULL
      OR (
        cancel_reason = btrim(cancel_reason)
        AND char_length(cancel_reason) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_submit_audit_check
    CHECK (
      (
        submitted_by_employee_id IS NULL
        AND submitted_at IS NULL
      )
      OR (
        submitted_by_employee_id IS NOT NULL
        AND submitted_at IS NOT NULL
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_review_audit_check
    CHECK (
      (
        reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
      )
      OR (
        reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND submitted_by_employee_id IS NOT NULL
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_cancel_audit_check
    CHECK (
      (
        cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL
        AND cancel_reason IS NULL
      )
      OR (
        cancelled_by_employee_id IS NOT NULL
        AND cancelled_at IS NOT NULL
        AND cancel_reason IS NOT NULL
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_state_metadata_check
    CHECK (
      (
        status = 'draft'
        AND budget_status = 'unchecked'
        AND submitted_by_employee_id IS NULL
        AND submitted_at IS NULL
        AND reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
        AND cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL
        AND cancel_reason IS NULL
        AND purchase_order_id IS NULL
      )
      OR (
        status = 'pending_approval'
        AND budget_status IN ('within_budget', 'over_budget')
        AND submitted_by_employee_id IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
        AND cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL
        AND cancel_reason IS NULL
        AND purchase_order_id IS NULL
      )
      OR (
        status IN ('approved', 'rejected')
        AND budget_status IN ('within_budget', 'over_budget')
        AND submitted_by_employee_id IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL
        AND cancel_reason IS NULL
        AND purchase_order_id IS NULL
      )
      OR (
        status = 'cancelled'
        AND budget_status = 'unchecked'
        AND submitted_by_employee_id IS NULL
        AND submitted_at IS NULL
        AND reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
        AND cancelled_by_employee_id IS NOT NULL
        AND cancelled_at IS NOT NULL
        AND cancel_reason IS NOT NULL
        AND purchase_order_id IS NULL
      )
      OR (
        status = 'cancelled'
        AND budget_status IN ('within_budget', 'over_budget')
        AND submitted_by_employee_id IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_by_employee_id IS NULL
        AND reviewed_at IS NULL
        AND review_remark IS NULL
        AND cancelled_by_employee_id IS NOT NULL
        AND cancelled_at IS NOT NULL
        AND cancel_reason IS NOT NULL
        AND purchase_order_id IS NULL
      )
      OR (
        status = 'cancelled'
        AND budget_status IN ('within_budget', 'over_budget')
        AND submitted_by_employee_id IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND cancelled_by_employee_id IS NOT NULL
        AND cancelled_at IS NOT NULL
        AND cancel_reason IS NOT NULL
        AND purchase_order_id IS NULL
      )
      OR (
        status = 'converted'
        AND budget_status IN ('within_budget', 'over_budget')
        AND submitted_by_employee_id IS NOT NULL
        AND submitted_at IS NOT NULL
        AND reviewed_by_employee_id IS NOT NULL
        AND reviewed_at IS NOT NULL
        AND cancelled_by_employee_id IS NULL
        AND cancelled_at IS NULL
        AND cancel_reason IS NULL
        AND purchase_order_id IS NOT NULL
      )
    ),
  CONSTRAINT supplier_purchase_requisitions_id_tenant_key
    UNIQUE (id, tenant_id),
  CONSTRAINT supplier_purchase_requisitions_tenant_request_no_key
    UNIQUE (tenant_id, request_no)
);

-- Item-chain consistency stays set-based: the Task 3 set-based SECURITY DEFINER
-- draft command validates supplier -> product -> sku -> price list -> price item.
-- Direct writes are revoked below; do not add a per-row constraint trigger.
CREATE TABLE public.supplier_purchase_requisition_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  purchase_requisition_id uuid NOT NULL,
  line_no integer NOT NULL,
  cost_category_id uuid NOT NULL,
  supplier_product_id uuid NOT NULL
    REFERENCES public.supplier_products(id) ON DELETE RESTRICT,
  supplier_sku_id uuid NOT NULL
    REFERENCES public.supplier_skus(id) ON DELETE RESTRICT,
  supplier_price_list_id uuid NOT NULL
    REFERENCES public.supplier_price_lists(id) ON DELETE RESTRICT,
  supplier_price_list_item_id uuid NOT NULL
    REFERENCES public.supplier_price_list_items(id) ON DELETE RESTRICT,
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
  price_list_code_snapshot text NOT NULL,
  price_list_version_snapshot integer NOT NULL,
  price_effective_from_snapshot timestamptz NOT NULL,
  price_effective_until_snapshot timestamptz NULL,
  quantity numeric(18, 4) NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  tax_rate numeric(7, 6) NOT NULL,
  tax_inclusive boolean NOT NULL,
  line_subtotal_amount numeric(18, 2) NOT NULL,
  line_tax_amount numeric(18, 2) NOT NULL,
  line_total_amount numeric(18, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_requisition_items_parent_tenant_fkey
    FOREIGN KEY (purchase_requisition_id, tenant_id)
    REFERENCES public.supplier_purchase_requisitions(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_requisition_items_category_tenant_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_requisition_items_line_no_check
    CHECK (line_no BETWEEN 1 AND 100),
  CONSTRAINT supplier_purchase_requisition_items_required_text_check
    CHECK (
      product_code_snapshot = btrim(product_code_snapshot)
      AND product_code_snapshot <> ''
      AND product_name_snapshot = btrim(product_name_snapshot)
      AND product_name_snapshot <> ''
      AND sku_code_snapshot = btrim(sku_code_snapshot)
      AND sku_code_snapshot <> ''
      AND sku_name_snapshot = btrim(sku_name_snapshot)
      AND sku_name_snapshot <> ''
      AND purchase_unit_code_snapshot = btrim(purchase_unit_code_snapshot)
      AND purchase_unit_code_snapshot <> ''
      AND purchase_unit_name_snapshot = btrim(purchase_unit_name_snapshot)
      AND purchase_unit_name_snapshot <> ''
      AND purchase_unit_symbol_snapshot =
        btrim(purchase_unit_symbol_snapshot)
      AND purchase_unit_symbol_snapshot <> ''
      AND base_unit_code_snapshot = btrim(base_unit_code_snapshot)
      AND base_unit_code_snapshot <> ''
      AND base_unit_name_snapshot = btrim(base_unit_name_snapshot)
      AND base_unit_name_snapshot <> ''
      AND base_unit_symbol_snapshot = btrim(base_unit_symbol_snapshot)
      AND base_unit_symbol_snapshot <> ''
      AND price_list_code_snapshot = btrim(price_list_code_snapshot)
      AND price_list_code_snapshot <> ''
    ),
  CONSTRAINT supplier_purchase_requisition_items_optional_text_check
    CHECK (
      (
        specification_snapshot IS NULL
        OR (
          specification_snapshot = btrim(specification_snapshot)
          AND specification_snapshot <> ''
        )
      )
      AND (
        model_snapshot IS NULL
        OR (
          model_snapshot = btrim(model_snapshot)
          AND model_snapshot <> ''
        )
      )
    ),
  CONSTRAINT supplier_purchase_requisition_items_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT supplier_purchase_requisition_items_unit_price_check
    CHECK (unit_price >= 0),
  CONSTRAINT supplier_purchase_requisition_items_tax_rate_check
    CHECK (tax_rate BETWEEN 0 AND 1),
  CONSTRAINT supplier_purchase_requisition_items_conversion_check
    CHECK (base_unit_conversion > 0),
  CONSTRAINT supplier_purchase_requisition_items_price_version_check
    CHECK (price_list_version_snapshot > 0),
  CONSTRAINT supplier_purchase_requisition_items_amount_check
    CHECK (
      line_subtotal_amount >= 0
      AND line_tax_amount >= 0
      AND line_total_amount >= 0
      AND line_total_amount = line_subtotal_amount + line_tax_amount
    ),
  CONSTRAINT supplier_purchase_requisition_items_parent_line_key
    UNIQUE (purchase_requisition_id, line_no),
  CONSTRAINT supplier_purchase_requisition_items_parent_sku_key
    UNIQUE (purchase_requisition_id, supplier_sku_id)
);

CREATE TABLE public.project_cost_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  cost_category_id uuid NOT NULL,
  source_type text NOT NULL DEFAULT 'supplier_purchase_requisition',
  source_id uuid NOT NULL,
  amount numeric(18, 2) NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  budget_amount_snapshot numeric(18, 2) NOT NULL,
  expense_amount_snapshot numeric(18, 2) NOT NULL,
  other_commitment_amount_snapshot numeric(18, 2) NOT NULL,
  available_amount_snapshot numeric(18, 2) NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  released_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  released_at timestamptz NULL,
  release_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_cost_commitments_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_commitments_category_tenant_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_commitments_source_tenant_fkey
    FOREIGN KEY (source_id, tenant_id)
    REFERENCES public.supplier_purchase_requisitions(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_commitments_source_type_check
    CHECK (source_type = 'supplier_purchase_requisition'),
  CONSTRAINT project_cost_commitments_amount_check
    CHECK (amount >= 0),
  CONSTRAINT project_cost_commitments_status_check
    CHECK (status IN ('reserved', 'converted', 'released')),
  CONSTRAINT project_cost_commitments_snapshot_amount_check
    CHECK (
      budget_amount_snapshot >= 0
      AND expense_amount_snapshot >= 0
      AND other_commitment_amount_snapshot >= 0
    ),
  CONSTRAINT project_cost_commitments_release_reason_check
    CHECK (
      release_reason IS NULL
      OR (
        release_reason = btrim(release_reason)
        AND char_length(release_reason) BETWEEN 1 AND 500
      )
    ),
  CONSTRAINT project_cost_commitments_release_audit_check
    CHECK (
      (
        status IN ('reserved', 'converted')
        AND released_by_employee_id IS NULL
        AND released_at IS NULL
        AND release_reason IS NULL
      )
      OR (
        status = 'released'
        AND released_by_employee_id IS NOT NULL
        AND released_at IS NOT NULL
        AND release_reason IS NOT NULL
      )
    ),
  CONSTRAINT project_cost_commitments_source_category_key
    UNIQUE (tenant_id, source_type, source_id, cost_category_id)
);

ALTER TABLE public.supplier_purchase_orders
ADD COLUMN purchase_requisition_id uuid NULL;

CREATE UNIQUE INDEX supplier_purchase_orders_purchase_requisition_unique_idx
ON public.supplier_purchase_orders(purchase_requisition_id)
WHERE purchase_requisition_id IS NOT NULL;

CREATE UNIQUE INDEX supplier_purchase_requisitions_purchase_order_unique_idx
ON public.supplier_purchase_requisitions(purchase_order_id)
WHERE purchase_order_id IS NOT NULL;

ALTER TABLE public.supplier_purchase_orders
ADD CONSTRAINT supplier_purchase_orders_id_tenant_requisition_key
UNIQUE (id, tenant_id, purchase_requisition_id);

ALTER TABLE public.supplier_purchase_requisitions
ADD CONSTRAINT supplier_purchase_requisitions_id_tenant_order_key
UNIQUE (id, tenant_id, purchase_order_id);

ALTER TABLE public.supplier_purchase_orders
ADD CONSTRAINT supplier_purchase_orders_requisition_tenant_fkey
FOREIGN KEY (purchase_requisition_id, tenant_id, id)
REFERENCES public.supplier_purchase_requisitions(
  id,
  tenant_id,
  purchase_order_id
)
ON DELETE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.supplier_purchase_requisitions
ADD CONSTRAINT supplier_purchase_requisitions_order_tenant_fkey
FOREIGN KEY (purchase_order_id, tenant_id, id)
REFERENCES public.supplier_purchase_orders(
  id,
  tenant_id,
  purchase_requisition_id
)
ON DELETE RESTRICT
DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX supplier_purchase_requisitions_tenant_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_requisitions_tenant_status_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_requisitions_tenant_budget_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  budget_status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_requisitions_tenant_project_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  project_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_requisitions_pending_approval_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  status,
  submitted_at,
  id
)
WHERE status = 'pending_approval';

CREATE INDEX supplier_purchase_requisitions_tenant_supplier_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  tenant_supplier_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_requisition_items_parent_line_idx
ON public.supplier_purchase_requisition_items(
  purchase_requisition_id,
  line_no,
  id
);

CREATE INDEX project_cost_commitments_active_lookup_idx
ON public.project_cost_commitments(
  tenant_id, project_id, cost_category_id, status
)
WHERE status IN ('reserved', 'converted');

ALTER TABLE public.supplier_purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_requisitions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_requisition_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_requisition_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_commitments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_purchase_requisitions,
  public.supplier_purchase_requisition_items,
  public.project_cost_commitments
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.supplier_purchase_requisitions,
  public.supplier_purchase_requisition_items,
  public.project_cost_commitments
TO service_role;

REVOKE ALL ON SEQUENCE public.supplier_purchase_requisition_number_seq
FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  (
    'supplier.purchase-requisition.view',
    '查看供应商采购申请',
    'supplier',
    'purchase_requisition',
    'view',
    '查看当前租户项目采购申请和预算承诺',
    'active'
  ),
  (
    'supplier.purchase-requisition.manage',
    '管理供应商采购申请',
    'supplier',
    'purchase_requisition',
    'manage',
    '保存、提交和取消当前租户项目采购申请',
    'active'
  ),
  (
    'supplier.purchase-requisition.approve',
    '审批供应商采购申请',
    'supplier',
    'purchase_requisition',
    'approve',
    '审批或驳回当前租户项目采购申请',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (
  role_id,
  permission_id,
  access_scope
)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'supplier.purchase-requisition.view',
    'supplier.purchase-requisition.manage',
    'supplier.purchase-requisition.approve'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

-- Forward rollback: after future command functions go live, revoke execute
-- before hiding API/UI entry points. Preserve requisition audit and financial facts.
-- A destructive rollback must be an explicit reviewed migration.

-- Task 3: atomic purchase requisition commands

CREATE FUNCTION public.supplier_purchase_requisition_to_jsonb(
  p_requisition public.supplier_purchase_requisitions
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pg_catalog.to_jsonb(p_requisition) ||
    pg_catalog.jsonb_build_object(
      'subtotal_amount', p_requisition.subtotal_amount::text,
      'tax_amount', p_requisition.tax_amount::text,
      'total_amount', p_requisition.total_amount::text
    );
$$;
REVOKE ALL ON FUNCTION
  public.supplier_purchase_requisition_to_jsonb(
    public.supplier_purchase_requisitions
  )
FROM PUBLIC, anon, authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.supplier_command_events
FROM service_role;
GRANT SELECT ON TABLE public.supplier_command_events TO service_role;

CREATE FUNCTION public.lock_project_cost_budget_scope(
  p_tenant_id uuid,
  p_project_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_tenant_id IS NOT NULL AND p_project_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'supplier-project-budget:' || p_tenant_id::text || ':' ||
          p_project_id::text,
        6720240730150000
      )
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_project_cost_budget_scope(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_project_cost_budgets(
  p_tenant_id uuid,
  p_project_id uuid,
  p_employee_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PROJECT_COST_BUDGET_VALIDATION_ERROR';
  END IF;
  PERFORM public.lock_project_cost_budget_scope(
    p_tenant_id, p_project_id
  );
  INSERT INTO public.project_cost_budgets (
    tenant_id, project_id, cost_category_id, budget_amount,
    warning_threshold_percent, status, remark, created_by, updated_by
  )
  SELECT p_tenant_id, p_project_id, item.cost_category_id,
    item.budget_amount, COALESCE(item.warning_threshold_percent, 100),
    'active', NULLIF(btrim(item.remark), ''), p_employee_id, p_employee_id
  FROM jsonb_to_recordset(p_items) AS item(
    cost_category_id uuid, budget_amount numeric,
    warning_threshold_percent numeric, remark text
  )
  ON CONFLICT (tenant_id, project_id, cost_category_id)
  WHERE status = 'active'
  DO UPDATE SET budget_amount = EXCLUDED.budget_amount,
    warning_threshold_percent = EXCLUDED.warning_threshold_percent,
    remark = EXCLUDED.remark, updated_by = EXCLUDED.updated_by,
    updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.project_cost_budgets
FROM service_role;
GRANT SELECT ON TABLE public.project_cost_budgets TO service_role;
REVOKE ALL ON FUNCTION public.save_project_cost_budgets(
  uuid, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_cost_budgets(
  uuid, uuid, uuid, jsonb
) TO service_role;

CREATE FUNCTION public.lock_finance_ledger_project_budget()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_key text;
  v_new_key text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.project_id IS NOT NULL THEN
      v_old_key := OLD.tenant_id::text || ':' || OLD.project_id::text;
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.project_id IS NOT NULL THEN
      v_new_key := NEW.tenant_id::text || ':' || NEW.project_id::text;
    END IF;
  END IF;
  -- Row triggers run inside the writer transaction. Transaction advisory
  -- locks are reentrant; project moves lock both scopes in lexical order.
  IF v_old_key IS NOT NULL
    AND (v_new_key IS NULL OR v_old_key <= v_new_key)
  THEN
    PERFORM public.lock_project_cost_budget_scope(
      OLD.tenant_id, OLD.project_id
    );
  END IF;
  IF v_new_key IS NOT NULL AND v_new_key IS DISTINCT FROM v_old_key THEN
    PERFORM public.lock_project_cost_budget_scope(
      NEW.tenant_id, NEW.project_id
    );
  END IF;
  IF v_old_key IS NOT NULL AND v_new_key IS NOT NULL
    AND v_old_key > v_new_key
  THEN
    PERFORM public.lock_project_cost_budget_scope(
      OLD.tenant_id, OLD.project_id
    );
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.lock_finance_ledger_project_budget()
FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER finance_ledger_entries_project_budget_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.finance_ledger_entries
FOR EACH ROW EXECUTE FUNCTION
  public.lock_finance_ledger_project_budget();

CREATE INDEX finance_ledger_entries_out_project_category_amount_idx
ON public.finance_ledger_entries(
  tenant_id, project_id, cost_category_id
)
INCLUDE (amount)
WHERE direction = 'out' AND project_id IS NOT NULL;

-- EXPLAIN smoke (Task 9/10): requisition draft catalog must use the requested
-- SKU set, supplier_price_items_sku_list_idx, and primary-key unit/category
-- lookups without a per-item nested application query.
-- EXPLAIN smoke (Task 9/10): requisition budget reservation must aggregate
-- items, outgoing ledger entries, and active commitments once per category.
-- The active commitment query is tenant/project/category/status bounded and
-- must use project_cost_commitments_active_lookup_idx through an Index Scan
-- or Bitmap Index Scan; no unbounded full table scan is acceptable.

CREATE FUNCTION public.save_supplier_purchase_requisition_draft(
  p_requisition_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
  p_expected_delivery_date date,
  p_reason text,
  p_remark text,
  p_items jsonb,
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
  v_event public.supplier_command_events%ROWTYPE;
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_before jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  v_request jsonb;
  v_eligible boolean;
  v_supplier_id uuid;
  v_priced_at timestamptz;
  v_resolved_items jsonb;
  v_requested_count integer;
  v_resolved_count integer;
  v_duplicate_count integer;
  v_invalid_count integer;
  v_subtotal_amount numeric(18, 2);
  v_tax_amount numeric(18, 2);
  v_total_amount numeric(18, 2);
  v_global_requisition_exists boolean;
  v_tenant_requisition_exists boolean;
BEGIN
  IF p_requisition_id IS NULL
    OR p_tenant_id IS NULL
    OR p_project_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 0
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR (p_remark IS NOT NULL AND (
      btrim(p_remark) = '' OR char_length(btrim(p_remark)) > 500
    ))
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
    );
  END IF;

  BEGIN
    WITH requested_items AS MATERIALIZED (
      SELECT
        item.supplier_sku_id,
        item.cost_category_id,
        item.quantity
      FROM jsonb_to_recordset(p_items) AS item(
        supplier_sku_id uuid,
        cost_category_id uuid,
        quantity numeric
      )
    )
    SELECT
      COUNT(*),
      CASE
        WHEN COUNT(*) <> COUNT(DISTINCT supplier_sku_id) THEN 1
        ELSE 0
      END,
      COUNT(*) FILTER (
        WHERE supplier_sku_id IS NULL
          OR cost_category_id IS NULL
          OR quantity IS NULL
          OR quantity <= 0
          OR quantity > 99999999999999.9999
          OR scale(quantity) > 4
      )
    INTO v_requested_count, v_duplicate_count, v_invalid_count
    FROM requested_items;
  EXCEPTION
    WHEN invalid_text_representation OR invalid_parameter_value
      OR numeric_value_out_of_range THEN
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
      );
  END;

  IF v_requested_count <> jsonb_array_length(p_items)
    OR v_duplicate_count > 0
    OR v_invalid_count > 0
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_DUPLICATE_SKU'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'project_id', p_project_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'expected_version', p_expected_version,
    'expected_delivery_date', p_expected_delivery_date,
    'reason', btrim(p_reason),
    'remark', CASE
      WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark)
    END,
    'items', p_items,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_requisition'
      OR v_event.resource_id <> p_requisition_id
      OR v_event.command <> 'save_supplier_purchase_requisition_draft'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'saved',
      'idempotent', true,
      'requisition', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-requisition-id:' || p_requisition_id::text,
      6720240730150000
    )
  );

  SELECT requisition.*
  INTO v_requisition
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id
  FOR UPDATE;
  v_tenant_requisition_exists := FOUND;

  IF NOT v_tenant_requisition_exists AND p_expected_version = 0 THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.supplier_purchase_requisitions AS requisition
      WHERE requisition.id = p_requisition_id
    )
    INTO v_global_requisition_exists;
    IF v_global_requisition_exists THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_REQUISITION_ID_CONFLICT'
      );
    END IF;
  END IF;

  IF p_expected_version = 0 AND v_tenant_requisition_exists THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT',
      'version', v_requisition.version
    );
  ELSIF p_expected_version > 0 AND NOT v_tenant_requisition_exists THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND'
    );
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_PROJECT_INVALID'
    );
  END IF;

  v_priced_at := clock_timestamp();

  SELECT relationship.supplier_id
  INTO v_supplier_id
  FROM public.tenant_suppliers AS relationship
  JOIN public.suppliers AS supplier
    ON supplier.id = relationship.supplier_id
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
    AND relationship.default_currency = 'CNY'
  FOR SHARE OF relationship, supplier;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || v_supplier_id::text,
      6720240729160000
    )
  );

  WITH requested_items AS MATERIALIZED (
    SELECT
      item.supplier_sku_id,
      item.cost_category_id,
      item.quantity::numeric(18, 4) AS quantity,
      item.ordinality
    FROM jsonb_to_recordset(p_items) WITH ORDINALITY AS item(
      supplier_sku_id uuid,
      cost_category_id uuid,
      quantity numeric,
      ordinality bigint
    )
  ),
  eligibility AS MATERIALIZED (
    SELECT eligible.*
    FROM public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id,
      v_priced_at,
      p_tenant_supplier_id
    ) AS eligible
    WHERE eligible.eligible
      AND eligible.supplier_id = v_supplier_id
  ),
  price_candidates AS MATERIALIZED (
    SELECT
      requested.*,
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      price_list.id AS supplier_price_list_id,
      price_list.price_list_code,
      price_list.version_number AS price_list_version,
      price_list.effective_from,
      price_list.effective_until,
      price_item.id AS supplier_price_list_item_id,
      price_item.purchase_unit_id,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      price_item.base_unit_id,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      price_item.base_unit_conversion,
      price_item.unit_price,
      price_item.tax_rate,
      price_item.tax_inclusive
    FROM public.supplier_price_list_items AS price_item
    JOIN requested_items AS requested
      ON requested.supplier_sku_id = price_item.supplier_sku_id
    JOIN eligibility
      ON eligibility.tenant_supplier_id = p_tenant_supplier_id
      AND eligibility.supplier_id = price_item.supplier_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = price_item.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = price_item.supplier_id
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = sku.supplier_id
    JOIN public.catalog_categories AS catalog_category
      ON catalog_category.id = product.category_id
      AND catalog_category.status = 'active'
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    JOIN public.finance_cost_categories AS finance_category
      ON finance_category.id = requested.cost_category_id
      AND finance_category.tenant_id = p_tenant_id
      AND finance_category.status = 'active'
    WHERE price_item.supplier_id = v_supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_priced_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_priced_at
      )
      AND product.status = 'active'
      AND sku.status = 'active'
    ORDER BY sku.id, price_item.id, finance_category.id
    FOR SHARE OF price_item, price_list, sku, product,
      catalog_category, purchase_unit, base_unit, finance_category
  ),
  resolved_items AS MATERIALIZED (
    SELECT
      candidate.*,
      row_number() OVER (
        ORDER BY candidate.ordinality
      )::integer AS line_no,
      CASE
        WHEN candidate.tax_inclusive THEN
          round(
            round(candidate.quantity * candidate.unit_price, 2) /
              (1 + candidate.tax_rate),
            2
          )
        ELSE round(candidate.quantity * candidate.unit_price, 2)
      END::numeric(18, 2) AS line_subtotal_amount,
      CASE
        WHEN candidate.tax_inclusive THEN
          round(candidate.quantity * candidate.unit_price, 2) -
            round(
              round(candidate.quantity * candidate.unit_price, 2) /
                (1 + candidate.tax_rate),
              2
            )
        ELSE round(
          round(candidate.quantity * candidate.unit_price, 2) *
            candidate.tax_rate,
          2
        )
      END::numeric(18, 2) AS line_tax_amount,
      CASE
        WHEN candidate.tax_inclusive THEN
          round(candidate.quantity * candidate.unit_price, 2)
        ELSE round(candidate.quantity * candidate.unit_price, 2) +
          round(
            round(candidate.quantity * candidate.unit_price, 2) *
              candidate.tax_rate,
            2
          )
      END::numeric(18, 2) AS line_total_amount
    FROM price_candidates AS candidate
  )
  SELECT
    EXISTS (SELECT 1 FROM eligibility),
    COUNT(*),
    COALESCE(jsonb_agg(to_jsonb(resolved) ORDER BY resolved.line_no), '[]'),
    COALESCE(SUM(resolved.line_subtotal_amount), 0),
    COALESCE(SUM(resolved.line_tax_amount), 0),
    COALESCE(SUM(resolved.line_total_amount), 0)
  INTO
    v_eligible,
    v_resolved_count,
    v_resolved_items,
    v_subtotal_amount,
    v_tax_amount,
    v_total_amount
  FROM resolved_items AS resolved;

  IF NOT v_eligible THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'
    );
  END IF;

  IF v_resolved_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'status', 'price_changed',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED'
    );
  END IF;

  IF p_expected_version = 0 THEN
    INSERT INTO public.supplier_purchase_requisitions (
      id, tenant_id, project_id, tenant_supplier_id, supplier_id,
      reason, expected_delivery_date, remark, priced_at,
      subtotal_amount, tax_amount, total_amount,
      created_by_employee_id, updated_by_employee_id
    )
    VALUES (
      p_requisition_id, p_tenant_id, p_project_id,
      p_tenant_supplier_id, v_supplier_id, btrim(p_reason),
      p_expected_delivery_date,
      CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
      v_priced_at, v_subtotal_amount, v_tax_amount, v_total_amount,
      p_actor_employee_id, p_actor_employee_id
    )
    RETURNING * INTO v_requisition;
  ELSE
    IF v_requisition.status <> 'draft'
      OR v_requisition.project_id <> p_project_id
      OR v_requisition.tenant_supplier_id <> p_tenant_supplier_id
      OR v_requisition.supplier_id <> v_supplier_id
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT'
      );
    END IF;
    IF v_requisition.version <> p_expected_version THEN
      RETURN jsonb_build_object(
        'status', 'version_conflict',
        'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT',
        'version', v_requisition.version
      );
    END IF;
    v_before := to_jsonb(v_requisition);
  END IF;

  DELETE FROM public.supplier_purchase_requisition_items AS item
  WHERE item.purchase_requisition_id = p_requisition_id;

  INSERT INTO public.supplier_purchase_requisition_items (
    tenant_id, purchase_requisition_id, line_no, cost_category_id,
    supplier_product_id, supplier_sku_id, supplier_price_list_id,
    supplier_price_list_item_id, product_code_snapshot,
    product_name_snapshot, sku_code_snapshot, sku_name_snapshot,
    specification_snapshot, model_snapshot, purchase_unit_id,
    purchase_unit_code_snapshot, purchase_unit_name_snapshot,
    purchase_unit_symbol_snapshot, base_unit_id,
    base_unit_code_snapshot, base_unit_name_snapshot,
    base_unit_symbol_snapshot, base_unit_conversion,
    price_list_code_snapshot, price_list_version_snapshot,
    price_effective_from_snapshot, price_effective_until_snapshot,
    quantity, unit_price, tax_rate, tax_inclusive,
    line_subtotal_amount, line_tax_amount, line_total_amount
  )
  SELECT
    p_tenant_id, p_requisition_id, item.line_no, item.cost_category_id,
    item.supplier_product_id, item.supplier_sku_id,
    item.supplier_price_list_id, item.supplier_price_list_item_id,
    item.product_code, item.product_name, item.sku_code, item.sku_name,
    item.specification, item.model, item.purchase_unit_id,
    item.purchase_unit_code, item.purchase_unit_name,
    item.purchase_unit_symbol, item.base_unit_id, item.base_unit_code,
    item.base_unit_name, item.base_unit_symbol,
    item.base_unit_conversion, item.price_list_code,
    item.price_list_version, item.effective_from, item.effective_until,
    item.quantity, item.unit_price, item.tax_rate, item.tax_inclusive,
    item.line_subtotal_amount, item.line_tax_amount, item.line_total_amount
  FROM jsonb_to_recordset(v_resolved_items) AS item(
    supplier_sku_id uuid, cost_category_id uuid, quantity numeric(18, 4),
    supplier_product_id uuid, product_code text, product_name text,
    sku_code text, sku_name text, specification text, model text,
    supplier_price_list_id uuid, price_list_code text,
    price_list_version integer, effective_from timestamptz,
    effective_until timestamptz, supplier_price_list_item_id uuid,
    purchase_unit_id uuid, purchase_unit_code text,
    purchase_unit_name text, purchase_unit_symbol text,
    base_unit_id uuid, base_unit_code text, base_unit_name text,
    base_unit_symbol text, base_unit_conversion numeric(18, 8),
    unit_price numeric(14, 2), tax_rate numeric(7, 6),
    tax_inclusive boolean, line_no integer,
    line_subtotal_amount numeric(18, 2),
    line_tax_amount numeric(18, 2), line_total_amount numeric(18, 2)
  );

  IF p_expected_version > 0 THEN
    UPDATE public.supplier_purchase_requisitions AS requisition
    SET reason = btrim(p_reason),
        expected_delivery_date = p_expected_delivery_date,
        remark = CASE
          WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark)
        END,
        priced_at = v_priced_at,
        subtotal_amount = v_subtotal_amount,
        tax_amount = v_tax_amount,
        total_amount = v_total_amount,
        version = requisition.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE requisition.id = p_requisition_id
    RETURNING * INTO v_requisition;
  END IF;
  v_snapshot :=
    public.supplier_purchase_requisition_to_jsonb(v_requisition);

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_purchase_requisition', p_requisition_id,
    'save_supplier_purchase_requisition_draft',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_requisition.version
  );

  RETURN jsonb_build_object(
    'status', 'saved',
    'idempotent', false,
    'requisition', v_snapshot,
    'version', v_requisition.version
  );
EXCEPTION
  WHEN numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_AMOUNT_LIMIT_EXCEEDED'
    );
END;
$$;

CREATE FUNCTION public.submit_supplier_purchase_requisition(
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
  v_event public.supplier_command_events%ROWTYPE;
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_before jsonb;
  v_snapshot jsonb;
  v_request jsonb;
  v_checked_at timestamptz := clock_timestamp();
  v_eligibility record;
  v_item_count integer;
  v_changed_count integer;
  v_category_count integer;
  v_locked_category_count integer;
  v_budget_status text;
BEGIN
  IF p_requisition_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'requisition_id', p_requisition_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key, 0
    )
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_requisition'
      OR v_event.resource_id <> p_requisition_id
      OR v_event.command <> 'submit_supplier_purchase_requisition'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'submitted', 'idempotent', true,
      'requisition', v_event.to_state, 'version', v_event.result_version
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-requisition-id:' || p_requisition_id::text,
      6720240730150000
    )
  );
  SELECT requisition.* INTO v_requisition
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND'
    );
  END IF;
  IF v_requisition.status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT'
    );
  END IF;
  IF v_requisition.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT',
      'version', v_requisition.version
    );
  END IF;

  SELECT eligibility.* INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id, v_checked_at, v_requisition.tenant_supplier_id
  ) AS eligibility;
  IF NOT FOUND OR NOT v_eligibility.eligible
    OR v_eligibility.supplier_id <> v_requisition.supplier_id
  THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_eligible',
      'error_code', 'SUPPLIER_ORDER_NOT_ELIGIBLE'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || v_requisition.supplier_id::text,
      6720240729160000
    )
  );

  WITH frozen AS MATERIALIZED (
    SELECT item.*
    FROM public.supplier_purchase_requisition_items AS item
    WHERE item.purchase_requisition_id = p_requisition_id
      AND item.tenant_id = p_tenant_id
  ),
  current_prices AS MATERIALIZED (
    SELECT
      frozen.id AS frozen_id,
      price_item.id AS supplier_price_list_item_id,
      price_item.unit_price,
      price_item.tax_rate,
      price_item.tax_inclusive,
      price_item.purchase_unit_id,
      price_item.base_unit_id,
      price_item.base_unit_conversion,
      price_list.id AS supplier_price_list_id,
      price_list.price_list_code,
      price_list.version_number,
      price_list.effective_from,
      price_list.effective_until,
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      CASE WHEN price_item.tax_inclusive THEN
        round(frozen.quantity * price_item.unit_price, 2)
      ELSE round(frozen.quantity * price_item.unit_price, 2) +
        round(
          round(frozen.quantity * price_item.unit_price, 2) *
            price_item.tax_rate,
          2
        )
      END::numeric(18, 2) AS line_total_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(
          round(frozen.quantity * price_item.unit_price, 2) /
            (1 + price_item.tax_rate),
          2
        )
      ELSE round(frozen.quantity * price_item.unit_price, 2)
      END::numeric(18, 2) AS line_subtotal_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(frozen.quantity * price_item.unit_price, 2) -
          round(
            round(frozen.quantity * price_item.unit_price, 2) /
              (1 + price_item.tax_rate),
            2
          )
      ELSE round(
        round(frozen.quantity * price_item.unit_price, 2) *
          price_item.tax_rate,
        2
      )
      END::numeric(18, 2) AS line_tax_amount
    FROM public.supplier_price_list_items AS price_item
    JOIN frozen ON frozen.supplier_sku_id = price_item.supplier_sku_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = v_requisition.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = v_requisition.supplier_id
      AND sku.status = 'active'
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = v_requisition.supplier_id
      AND product.status = 'active'
    JOIN public.catalog_categories AS catalog_category
      ON catalog_category.id = product.category_id
      AND catalog_category.status = 'active'
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    WHERE price_item.supplier_id = v_requisition.supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_checked_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_checked_at
      )
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
    ORDER BY sku.id, price_item.id
    FOR SHARE OF price_item, price_list, sku, product,
      catalog_category, purchase_unit, base_unit
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE current_prices.frozen_id IS NULL
        OR current_prices.supplier_price_list_item_id IS DISTINCT FROM
          frozen.supplier_price_list_item_id
        OR current_prices.supplier_price_list_id IS DISTINCT FROM
          frozen.supplier_price_list_id
        OR current_prices.unit_price IS DISTINCT FROM frozen.unit_price
        OR current_prices.tax_rate IS DISTINCT FROM frozen.tax_rate
        OR current_prices.tax_inclusive IS DISTINCT FROM frozen.tax_inclusive
        OR current_prices.purchase_unit_id IS DISTINCT FROM
          frozen.purchase_unit_id
        OR current_prices.base_unit_id IS DISTINCT FROM frozen.base_unit_id
        OR current_prices.base_unit_conversion IS DISTINCT FROM
          frozen.base_unit_conversion
        OR current_prices.price_list_code IS DISTINCT FROM
          frozen.price_list_code_snapshot
        OR current_prices.version_number IS DISTINCT FROM
          frozen.price_list_version_snapshot
        OR current_prices.effective_from IS DISTINCT FROM
          frozen.price_effective_from_snapshot
        OR current_prices.effective_until IS DISTINCT FROM
          frozen.price_effective_until_snapshot
        OR current_prices.supplier_product_id IS DISTINCT FROM
          frozen.supplier_product_id
        OR current_prices.product_code IS DISTINCT FROM
          frozen.product_code_snapshot
        OR current_prices.product_name IS DISTINCT FROM
          frozen.product_name_snapshot
        OR current_prices.sku_code IS DISTINCT FROM
          frozen.sku_code_snapshot
        OR current_prices.sku_name IS DISTINCT FROM frozen.sku_name_snapshot
        OR current_prices.specification IS DISTINCT FROM
          frozen.specification_snapshot
        OR current_prices.model IS DISTINCT FROM frozen.model_snapshot
        OR current_prices.purchase_unit_code IS DISTINCT FROM
          frozen.purchase_unit_code_snapshot
        OR current_prices.purchase_unit_name IS DISTINCT FROM
          frozen.purchase_unit_name_snapshot
        OR current_prices.purchase_unit_symbol IS DISTINCT FROM
          frozen.purchase_unit_symbol_snapshot
        OR current_prices.base_unit_code IS DISTINCT FROM
          frozen.base_unit_code_snapshot
        OR current_prices.base_unit_name IS DISTINCT FROM
          frozen.base_unit_name_snapshot
        OR current_prices.base_unit_symbol IS DISTINCT FROM
          frozen.base_unit_symbol_snapshot
        OR current_prices.line_subtotal_amount IS DISTINCT FROM
          frozen.line_subtotal_amount
        OR current_prices.line_tax_amount IS DISTINCT FROM
          frozen.line_tax_amount
        OR current_prices.line_total_amount IS DISTINCT FROM
          frozen.line_total_amount
    )
  INTO v_item_count, v_changed_count
  FROM frozen
  LEFT JOIN current_prices ON current_prices.frozen_id = frozen.id;

  IF v_item_count = 0 OR v_changed_count > 0 THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED'
    );
  END IF;

  PERFORM public.lock_project_cost_budget_scope(
    p_tenant_id,
    v_requisition.project_id
  );

  WITH requested_by_category AS MATERIALIZED (
    SELECT item.cost_category_id, SUM(item.line_total_amount) AS amount
    FROM public.supplier_purchase_requisition_items AS item
    WHERE item.purchase_requisition_id = p_requisition_id
      AND item.tenant_id = p_tenant_id
    GROUP BY item.cost_category_id
  )
  SELECT COUNT(*) INTO v_category_count FROM requested_by_category;

  WITH requested_by_category AS MATERIALIZED (
    SELECT DISTINCT item.cost_category_id
    FROM public.supplier_purchase_requisition_items AS item
    WHERE item.purchase_requisition_id = p_requisition_id
      AND item.tenant_id = p_tenant_id
  ),
  locked_categories AS MATERIALIZED (
    SELECT finance_category.id
    FROM public.finance_cost_categories AS finance_category
    JOIN requested_by_category AS requested
      ON requested.cost_category_id = finance_category.id
    WHERE finance_category.tenant_id = p_tenant_id
      AND finance_category.status = 'active'
    ORDER BY finance_category.id
    FOR UPDATE OF finance_category
  )
  SELECT COUNT(*) INTO v_locked_category_count FROM locked_categories;
  IF v_locked_category_count <> v_category_count THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED'
    );
  END IF;

  PERFORM budget.id
  FROM public.project_cost_budgets AS budget
  WHERE budget.tenant_id = p_tenant_id
    AND budget.project_id = v_requisition.project_id
    AND budget.status = 'active'
    AND budget.cost_category_id IN (
      SELECT item.cost_category_id
      FROM public.supplier_purchase_requisition_items AS item
      WHERE item.purchase_requisition_id = p_requisition_id
    )
  ORDER BY budget.cost_category_id, budget.id
  FOR UPDATE;

  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.project_id = v_requisition.project_id
    AND commitment.status IN ('reserved', 'converted')
    AND commitment.cost_category_id IN (
      SELECT item.cost_category_id
      FROM public.supplier_purchase_requisition_items AS item
      WHERE item.purchase_requisition_id = p_requisition_id
    )
  ORDER BY commitment.cost_category_id, commitment.id
  FOR UPDATE;

  WITH requested_by_category AS MATERIALIZED (
    SELECT item.cost_category_id, SUM(item.line_total_amount) AS amount
    FROM public.supplier_purchase_requisition_items AS item
    WHERE item.purchase_requisition_id = p_requisition_id
      AND item.tenant_id = p_tenant_id
    GROUP BY item.cost_category_id
  ),
  budget_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(MAX(budget.budget_amount), 0)::numeric(18, 2)
        AS budget_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_budgets AS budget
      ON budget.tenant_id = p_tenant_id
      AND budget.project_id = v_requisition.project_id
      AND budget.cost_category_id = requested.cost_category_id
      AND budget.status = 'active'
    GROUP BY requested.cost_category_id
  ),
  expense_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(SUM(ledger.amount), 0)::numeric(18, 2) AS expense_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.finance_ledger_entries AS ledger
      ON ledger.tenant_id = p_tenant_id
      AND ledger.project_id = v_requisition.project_id
      AND ledger.cost_category_id = requested.cost_category_id
      AND ledger.direction = 'out'
    GROUP BY requested.cost_category_id
  ),
  other_commitment_totals AS MATERIALIZED (
    SELECT requested.cost_category_id,
      COALESCE(SUM(commitment.amount), 0)::numeric(18, 2)
        AS other_commitment_amount
    FROM requested_by_category AS requested
    LEFT JOIN public.project_cost_commitments AS commitment
      ON commitment.tenant_id = p_tenant_id
      AND commitment.project_id = v_requisition.project_id
      AND commitment.cost_category_id = requested.cost_category_id
      AND commitment.status IN ('reserved', 'converted')
      AND commitment.source_id <> p_requisition_id
    GROUP BY requested.cost_category_id
  ),
  snapshots AS MATERIALIZED (
    SELECT requested.cost_category_id, requested.amount,
      budget.budget_amount, expense.expense_amount,
      other.other_commitment_amount,
      budget.budget_amount - expense.expense_amount -
        other.other_commitment_amount AS available_amount
    FROM requested_by_category AS requested
    JOIN budget_totals AS budget USING (cost_category_id)
    JOIN expense_totals AS expense USING (cost_category_id)
    JOIN other_commitment_totals AS other USING (cost_category_id)
  )
  INSERT INTO public.project_cost_commitments (
    tenant_id, project_id, cost_category_id, source_type, source_id,
    amount, status, budget_amount_snapshot, expense_amount_snapshot,
    other_commitment_amount_snapshot, available_amount_snapshot,
    created_by_employee_id
  )
  SELECT p_tenant_id, v_requisition.project_id, snapshot.cost_category_id,
    'supplier_purchase_requisition', p_requisition_id, snapshot.amount,
    'reserved', snapshot.budget_amount, snapshot.expense_amount,
    snapshot.other_commitment_amount, snapshot.available_amount,
    p_actor_employee_id
  FROM snapshots AS snapshot
  ON CONFLICT (tenant_id, source_type, source_id, cost_category_id)
  DO UPDATE SET
    amount = EXCLUDED.amount,
    status = 'reserved',
    budget_amount_snapshot = EXCLUDED.budget_amount_snapshot,
    expense_amount_snapshot = EXCLUDED.expense_amount_snapshot,
    other_commitment_amount_snapshot =
      EXCLUDED.other_commitment_amount_snapshot,
    available_amount_snapshot = EXCLUDED.available_amount_snapshot,
    released_by_employee_id = NULL,
    released_at = NULL,
    release_reason = NULL,
    updated_at = now();

  SELECT CASE
    WHEN bool_and(commitment.amount <= commitment.available_amount_snapshot)
      THEN 'within_budget'
    ELSE 'over_budget'
  END
  INTO v_budget_status
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = p_requisition_id
    AND commitment.status = 'reserved';

  v_before := to_jsonb(v_requisition);
  UPDATE public.supplier_purchase_requisitions AS requisition
  SET status = 'pending_approval',
      budget_status = v_budget_status,
      submitted_by_employee_id = p_actor_employee_id,
      submitted_at = v_checked_at,
      version = requisition.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE requisition.id = p_requisition_id
  RETURNING * INTO v_requisition;
  v_snapshot :=
    public.supplier_purchase_requisition_to_jsonb(v_requisition);

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_purchase_requisition', p_requisition_id,
    'submit_supplier_purchase_requisition',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_requisition.version
  );
  RETURN jsonb_build_object(
    'status', 'submitted', 'idempotent', false,
    'requisition', v_snapshot,
    'version', v_requisition.version
  );
END;
$$;

CREATE FUNCTION public.review_supplier_purchase_requisition(
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
  v_event public.supplier_command_events%ROWTYPE;
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_before jsonb;
  v_snapshot jsonb;
  v_request jsonb;
  v_reviewed_at timestamptz := clock_timestamp();
BEGIN
  IF p_requisition_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_action IS NULL OR p_action NOT IN ('approve', 'reject')
    OR (p_remark IS NOT NULL AND (
      btrim(p_remark) = '' OR char_length(btrim(p_remark)) > 500
    ))
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
    );
  END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'requisition_id', p_requisition_id,
    'expected_version', p_expected_version, 'action', p_action,
    'remark', CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key, 0
    )
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_requisition'
      OR v_event.resource_id <> p_requisition_id
      OR v_event.command <> 'review_supplier_purchase_requisition:' ||
        p_action
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', CASE WHEN p_action = 'approve' THEN 'approved'
        ELSE 'rejected' END,
      'idempotent', true, 'requisition', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-requisition-id:' || p_requisition_id::text,
      6720240730150000
    )
  );
  SELECT requisition.* INTO v_requisition
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND'
    );
  END IF;
  IF v_requisition.status <> 'pending_approval' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT'
    );
  END IF;
  IF v_requisition.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT',
      'version', v_requisition.version
    );
  END IF;
  IF v_requisition.created_by_employee_id = p_actor_employee_id THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW'
    );
  END IF;
  v_before := to_jsonb(v_requisition);
  IF p_action = 'approve' THEN
    UPDATE public.supplier_purchase_requisitions AS requisition
    SET status = 'approved',
        reviewed_by_employee_id = p_actor_employee_id,
        reviewed_at = v_reviewed_at,
        review_remark = CASE
          WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark)
        END,
        version = requisition.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE requisition.id = p_requisition_id
    RETURNING * INTO v_requisition;
  ELSE
    PERFORM commitment.id
    FROM public.project_cost_commitments AS commitment
    WHERE commitment.tenant_id = p_tenant_id
      AND commitment.source_id = p_requisition_id
      AND commitment.status = 'reserved'
    ORDER BY commitment.cost_category_id, commitment.id
    FOR UPDATE;
    UPDATE public.project_cost_commitments AS commitment
    SET status = 'released',
        released_by_employee_id = p_actor_employee_id,
        released_at = v_reviewed_at,
        release_reason = COALESCE(
          NULLIF(btrim(p_remark), ''),
          'requisition_rejected'
        ),
        updated_at = now()
    WHERE commitment.tenant_id = p_tenant_id
      AND commitment.source_id = p_requisition_id
      AND commitment.status = 'reserved';
    UPDATE public.supplier_purchase_requisitions AS requisition
    SET status = 'rejected',
        reviewed_by_employee_id = p_actor_employee_id,
        reviewed_at = v_reviewed_at,
        review_remark = CASE
          WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark)
        END,
        version = requisition.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE requisition.id = p_requisition_id
    RETURNING * INTO v_requisition;
  END IF;
  v_snapshot :=
    public.supplier_purchase_requisition_to_jsonb(v_requisition);
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    reason, actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_purchase_requisition', p_requisition_id,
    'review_supplier_purchase_requisition:' || p_action,
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot, p_remark, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, v_requisition.version
  );
  RETURN jsonb_build_object(
    'status', CASE WHEN p_action = 'approve' THEN 'approved'
      ELSE 'rejected' END,
    'idempotent', false, 'requisition', v_snapshot,
    'version', v_requisition.version
  );
END;
$$;

CREATE FUNCTION public.cancel_supplier_purchase_requisition(
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
  v_event public.supplier_command_events%ROWTYPE;
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_before jsonb;
  v_snapshot jsonb;
  v_request jsonb;
  v_cancelled_at timestamptz := clock_timestamp();
BEGIN
  IF p_requisition_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_reason IS NULL OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
    );
  END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'requisition_id', p_requisition_id,
    'expected_version', p_expected_version, 'reason', btrim(p_reason),
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key, 0
    )
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_requisition'
      OR v_event.resource_id <> p_requisition_id
      OR v_event.command <> 'cancel_supplier_purchase_requisition'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'cancelled', 'idempotent', true,
      'requisition', v_event.to_state, 'version', v_event.result_version
    );
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-requisition-id:' || p_requisition_id::text,
      6720240730150000
    )
  );
  SELECT requisition.* INTO v_requisition
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND'
    );
  END IF;
  IF v_requisition.status NOT IN (
      'draft', 'pending_approval', 'approved'
    )
    OR v_requisition.purchase_order_id IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT'
    );
  END IF;
  IF v_requisition.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT',
      'version', v_requisition.version
    );
  END IF;
  v_before := to_jsonb(v_requisition);
  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = p_requisition_id
    AND commitment.status = 'reserved'
  ORDER BY commitment.cost_category_id, commitment.id
  FOR UPDATE;
  UPDATE public.project_cost_commitments AS commitment
  SET status = 'released',
      released_by_employee_id = p_actor_employee_id,
      released_at = v_cancelled_at,
      release_reason = btrim(p_reason),
      updated_at = now()
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = p_requisition_id
    AND commitment.status = 'reserved';
  UPDATE public.supplier_purchase_requisitions AS requisition
  SET status = 'cancelled',
      cancelled_by_employee_id = p_actor_employee_id,
      cancelled_at = v_cancelled_at,
      cancel_reason = btrim(p_reason),
      version = requisition.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE requisition.id = p_requisition_id
  RETURNING * INTO v_requisition;
  v_snapshot :=
    public.supplier_purchase_requisition_to_jsonb(v_requisition);
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    reason, actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_purchase_requisition', p_requisition_id,
    'cancel_supplier_purchase_requisition',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot, btrim(p_reason), p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, v_requisition.version
  );
  RETURN jsonb_build_object(
    'status', 'cancelled', 'idempotent', false,
    'requisition', v_snapshot,
    'version', v_requisition.version
  );
END;
$$;

CREATE FUNCTION public.inject_supplier_purchase_requisition_order_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source text;
BEGIN
  v_source := NULLIF(
    pg_catalog.current_setting(
      'private.supplier_purchase_requisition_source',
      true
    ),
    ''
  );
  IF NEW.status = 'draft'
    AND NEW.purchase_requisition_id IS NULL
    AND v_source IS NOT NULL
  THEN
    NEW.purchase_requisition_id := v_source::uuid;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.inject_supplier_purchase_requisition_order_source()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_00_supplier_purchase_order_requisition_source
BEFORE INSERT ON public.supplier_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION
  public.inject_supplier_purchase_requisition_order_source();

DROP FUNCTION public.save_supplier_purchase_order_draft(
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  date,
  text,
  jsonb,
  uuid,
  uuid,
  text
);

CREATE FUNCTION public.save_supplier_purchase_order_draft(
  p_order_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
  p_expected_delivery_date date,
  p_remark text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_purchase_requisition_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_event public.supplier_command_events%ROWTYPE;
  v_purchase_requisition_id uuid := p_purchase_requisition_id;
  v_order_items jsonb := p_items;
  v_result jsonb;
  v_global_order_exists boolean;
BEGIN
  IF p_order_id IS NULL OR p_tenant_id IS NULL
    OR p_project_id IS NULL OR p_tenant_supplier_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_expected_version = 0
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
    OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
    OR (p_remark IS NOT NULL AND btrim(p_remark) = '')
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key, 0
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240729190000
    )
  );
  SELECT purchase_order.* INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.supplier_purchase_orders AS purchase_order
      WHERE purchase_order.id = p_order_id
    )
    INTO v_global_order_exists;
    IF v_global_order_exists AND p_expected_version = 0 THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_ID_CONFLICT'
      );
    ELSIF p_expected_version > 0 THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
      );
    END IF;
  END IF;

  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND AND (
      v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'save_supplier_purchase_order_draft'
      OR (
        p_purchase_requisition_id IS NOT NULL
        AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          v_event.from_state -> '_request' -> 'items'
        ) AS item(value)
        WHERE item.value ->> '_purchase_requisition_id'
          IS DISTINCT FROM p_purchase_requisition_id::text
      )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;

  IF p_expected_version > 0 THEN
    IF p_purchase_requisition_id IS NOT NULL
      AND v_order.purchase_requisition_id IS DISTINCT FROM
        p_purchase_requisition_id
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
      );
    END IF;
    v_purchase_requisition_id := v_order.purchase_requisition_id;
  END IF;

  IF v_purchase_requisition_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'supplier-purchase-requisition-id:' ||
          v_purchase_requisition_id::text,
        6720240730150000
      )
    );
    SELECT requisition.* INTO v_requisition
    FROM public.supplier_purchase_requisitions AS requisition
    WHERE requisition.id = v_purchase_requisition_id
      AND requisition.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status', 'not_found',
        'error_code', 'SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND'
      );
    END IF;
    IF p_expected_version = 0 AND (
        v_requisition.status <> 'approved'
        OR v_requisition.purchase_order_id IS NOT NULL
        OR v_requisition.project_id <> p_project_id
        OR v_requisition.tenant_supplier_id <> p_tenant_supplier_id
      )
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
      );
    END IF;
    IF p_expected_version > 0
      AND v_order.purchase_requisition_id IS DISTINCT FROM
        v_purchase_requisition_id
    THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
      );
    END IF;
    SELECT jsonb_agg(
      item.value || jsonb_build_object(
        '_purchase_requisition_id', v_purchase_requisition_id
      )
      ORDER BY item.ordinality
    )
    INTO v_order_items
    FROM jsonb_array_elements(p_items)
      WITH ORDINALITY AS item(value, ordinality);
  END IF;

  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_requisition_source',
    COALESCE(v_purchase_requisition_id::text, ''),
    true
  );
  BEGIN
    v_result := public.save_supplier_purchase_order_draft_v1(
      p_order_id, p_tenant_id, p_project_id, p_tenant_supplier_id,
      p_expected_version, p_expected_delivery_date, p_remark,
      v_order_items, p_actor_user_id, p_actor_employee_id,
      p_idempotency_key
    );
  EXCEPTION
    WHEN numeric_value_out_of_range THEN
      PERFORM pg_catalog.set_config(
        'private.supplier_purchase_requisition_source', '', true
      );
      RETURN jsonb_build_object(
        'status', 'validation_error',
        'error_code', 'SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED',
        'reason', '采购单行金额或汇总金额超过 numeric(18,2) 上限'
      );
    WHEN OTHERS THEN
      PERFORM pg_catalog.set_config(
        'private.supplier_purchase_requisition_source', '', true
      );
      RAISE;
  END;
  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_requisition_source', '', true
  );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.create_supplier_purchase_order_from_requisition(
  p_order_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_delivery_date date,
  p_remark text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_purchase_requisition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_result jsonb;
  v_global_order_exists boolean;
  v_reserved_key text :=
    'supplier-internal:' || gen_random_uuid()::text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240729190000
    )
  );
  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_purchase_orders AS purchase_order
    WHERE purchase_order.id = p_order_id
  )
  INTO v_global_order_exists;
  IF v_global_order_exists THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_ID_CONFLICT'
    );
  END IF;

  SELECT jsonb_agg(
    item.value || jsonb_build_object(
      '_purchase_requisition_id', p_purchase_requisition_id
    )
    ORDER BY item.ordinality
  )
  INTO v_items
  FROM jsonb_array_elements(p_items)
    WITH ORDINALITY AS item(value, ordinality);
  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_requisition_source',
    p_purchase_requisition_id::text,
    true
  );
  BEGIN
    v_result := public.save_supplier_purchase_order_draft_v1(
      p_order_id, p_tenant_id, p_project_id, p_tenant_supplier_id,
      0, p_expected_delivery_date, p_remark, v_items,
      p_actor_user_id, p_actor_employee_id, v_reserved_key
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_catalog.set_config(
      'private.supplier_purchase_requisition_source', '', true
    );
    RAISE;
  END;
  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_requisition_source', '', true
  );
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION
  public.create_supplier_purchase_order_from_requisition(
    uuid, uuid, uuid, uuid, date, text, jsonb, uuid, uuid, uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.convert_supplier_purchase_requisition(
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
  v_event public.supplier_command_events%ROWTYPE;
  v_requisition public.supplier_purchase_requisitions%ROWTYPE;
  v_before jsonb;
  v_snapshot jsonb;
  v_request jsonb;
  v_checked_at timestamptz := clock_timestamp();
  v_changed_count integer;
  v_items jsonb;
  v_order_result jsonb;
  v_current_subtotal_amount numeric(18, 2);
  v_current_tax_amount numeric(18, 2);
  v_current_total_amount numeric(18, 2);
BEGIN
  IF p_requisition_id IS NULL OR p_tenant_id IS NULL
    OR p_expected_version IS NULL OR p_expected_version <= 0
    OR p_purchase_order_id IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR'
    );
  END IF;
  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id, p_actor_user_id, p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'requisition_id', p_requisition_id,
    'expected_version', p_expected_version,
    'purchase_order_id', p_purchase_order_id,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key, 0
    )
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_requisition'
      OR v_event.resource_id <> p_requisition_id
      OR v_event.command <> 'convert_supplier_purchase_requisition'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'converted', 'idempotent', true,
      'requisition', v_event.to_state,
      'purchase_order_id', p_purchase_order_id,
      'version', v_event.result_version
    );
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-requisition-id:' || p_requisition_id::text,
      6720240730150000
    )
  );
  SELECT requisition.* INTO v_requisition
  FROM public.supplier_purchase_requisitions AS requisition
  WHERE requisition.id = p_requisition_id
    AND requisition.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND'
    );
  END IF;
  IF v_requisition.purchase_order_id IS NOT NULL
    OR v_requisition.status = 'converted'
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code',
        'SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED'
    );
  END IF;
  IF v_requisition.status <> 'approved' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT'
    );
  END IF;
  IF v_requisition.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT',
      'version', v_requisition.version
    );
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.supplier_purchase_orders AS purchase_order
    WHERE purchase_order.id = p_purchase_order_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_ID_CONFLICT'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-price-publish:' || v_requisition.supplier_id::text,
      6720240729160000
    )
  );
  WITH frozen AS MATERIALIZED (
    SELECT item.*
    FROM public.supplier_purchase_requisition_items AS item
    WHERE item.purchase_requisition_id = p_requisition_id
      AND item.tenant_id = p_tenant_id
  ),
  current_prices AS MATERIALIZED (
    SELECT frozen.id AS frozen_id,
      price_item.id AS supplier_price_list_item_id,
      price_item.unit_price, price_item.tax_rate,
      price_item.tax_inclusive, price_item.purchase_unit_id,
      price_item.base_unit_id, price_item.base_unit_conversion,
      price_list.id AS supplier_price_list_id,
      price_list.price_list_code, price_list.version_number,
      price_list.effective_from, price_list.effective_until,
      product.id AS supplier_product_id,
      product.product_code,
      product.name AS product_name,
      sku.sku_code,
      sku.name AS sku_name,
      sku.specification,
      sku.model,
      purchase_unit.code AS purchase_unit_code,
      purchase_unit.name AS purchase_unit_name,
      purchase_unit.symbol AS purchase_unit_symbol,
      base_unit.code AS base_unit_code,
      base_unit.name AS base_unit_name,
      base_unit.symbol AS base_unit_symbol,
      CASE WHEN price_item.tax_inclusive THEN
        round(frozen.quantity * price_item.unit_price, 2)
      ELSE round(frozen.quantity * price_item.unit_price, 2) +
        round(
          round(frozen.quantity * price_item.unit_price, 2) *
            price_item.tax_rate,
          2
        )
      END::numeric(18, 2) AS line_total_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(
          round(frozen.quantity * price_item.unit_price, 2) /
            (1 + price_item.tax_rate),
          2
        )
      ELSE round(frozen.quantity * price_item.unit_price, 2)
      END::numeric(18, 2) AS line_subtotal_amount,
      CASE WHEN price_item.tax_inclusive THEN
        round(frozen.quantity * price_item.unit_price, 2) -
          round(
            round(frozen.quantity * price_item.unit_price, 2) /
              (1 + price_item.tax_rate),
            2
          )
      ELSE round(
        round(frozen.quantity * price_item.unit_price, 2) *
          price_item.tax_rate,
        2
      )
      END::numeric(18, 2) AS line_tax_amount
    FROM public.supplier_price_list_items AS price_item
    JOIN frozen ON frozen.supplier_sku_id = price_item.supplier_sku_id
    JOIN public.supplier_price_lists AS price_list
      ON price_list.id = price_item.supplier_price_list_id
      AND price_list.supplier_id = v_requisition.supplier_id
    JOIN public.supplier_skus AS sku
      ON sku.id = price_item.supplier_sku_id
      AND sku.supplier_id = v_requisition.supplier_id
      AND sku.status = 'active'
    JOIN public.supplier_products AS product
      ON product.id = sku.supplier_product_id
      AND product.supplier_id = v_requisition.supplier_id
      AND product.status = 'active'
    JOIN public.catalog_categories AS catalog_category
      ON catalog_category.id = product.category_id
      AND catalog_category.status = 'active'
    JOIN public.catalog_units AS purchase_unit
      ON purchase_unit.id = price_item.purchase_unit_id
      AND purchase_unit.status = 'active'
    JOIN public.catalog_units AS base_unit
      ON base_unit.id = price_item.base_unit_id
      AND base_unit.status = 'active'
    WHERE price_item.supplier_id = v_requisition.supplier_id
      AND price_list.lifecycle_status = 'published'
      AND price_list.scope_type = 'default'
      AND price_list.currency = 'CNY'
      AND price_list.effective_from <= v_checked_at
      AND (
        price_list.effective_until IS NULL
        OR price_list.effective_until > v_checked_at
      )
      AND sku.purchase_unit_id = price_item.purchase_unit_id
      AND sku.base_unit_id = price_item.base_unit_id
      AND sku.base_unit_conversion = price_item.base_unit_conversion
    ORDER BY sku.id, price_item.id
    FOR SHARE OF price_item, price_list, sku, product,
      catalog_category, purchase_unit, base_unit
  )
  SELECT
    COUNT(*) FILTER (
    WHERE current_prices.frozen_id IS NULL
      OR current_prices.supplier_price_list_item_id IS DISTINCT FROM
        frozen.supplier_price_list_item_id
      OR current_prices.supplier_price_list_id IS DISTINCT FROM
        frozen.supplier_price_list_id
      OR current_prices.unit_price IS DISTINCT FROM frozen.unit_price
      OR current_prices.tax_rate IS DISTINCT FROM frozen.tax_rate
      OR current_prices.tax_inclusive IS DISTINCT FROM frozen.tax_inclusive
      OR current_prices.purchase_unit_id IS DISTINCT FROM
        frozen.purchase_unit_id
      OR current_prices.base_unit_id IS DISTINCT FROM frozen.base_unit_id
      OR current_prices.base_unit_conversion IS DISTINCT FROM
        frozen.base_unit_conversion
      OR current_prices.price_list_code IS DISTINCT FROM
        frozen.price_list_code_snapshot
      OR current_prices.version_number IS DISTINCT FROM
        frozen.price_list_version_snapshot
      OR current_prices.effective_from IS DISTINCT FROM
        frozen.price_effective_from_snapshot
      OR current_prices.effective_until IS DISTINCT FROM
        frozen.price_effective_until_snapshot
      OR current_prices.line_total_amount IS DISTINCT FROM
        frozen.line_total_amount
      OR current_prices.line_subtotal_amount IS DISTINCT FROM
        frozen.line_subtotal_amount
      OR current_prices.line_tax_amount IS DISTINCT FROM
        frozen.line_tax_amount
      OR current_prices.supplier_product_id IS DISTINCT FROM
        frozen.supplier_product_id
      OR current_prices.product_code IS DISTINCT FROM
        frozen.product_code_snapshot
      OR current_prices.product_name IS DISTINCT FROM
        frozen.product_name_snapshot
      OR current_prices.sku_code IS DISTINCT FROM frozen.sku_code_snapshot
      OR current_prices.sku_name IS DISTINCT FROM frozen.sku_name_snapshot
      OR current_prices.specification IS DISTINCT FROM
        frozen.specification_snapshot
      OR current_prices.model IS DISTINCT FROM frozen.model_snapshot
      OR current_prices.purchase_unit_code IS DISTINCT FROM
        frozen.purchase_unit_code_snapshot
      OR current_prices.purchase_unit_name IS DISTINCT FROM
        frozen.purchase_unit_name_snapshot
      OR current_prices.purchase_unit_symbol IS DISTINCT FROM
        frozen.purchase_unit_symbol_snapshot
      OR current_prices.base_unit_code IS DISTINCT FROM
        frozen.base_unit_code_snapshot
      OR current_prices.base_unit_name IS DISTINCT FROM
        frozen.base_unit_name_snapshot
      OR current_prices.base_unit_symbol IS DISTINCT FROM
        frozen.base_unit_symbol_snapshot
    ),
    COALESCE(SUM(current_prices.line_subtotal_amount), 0),
    COALESCE(SUM(current_prices.line_tax_amount), 0),
    COALESCE(SUM(current_prices.line_total_amount), 0)
  INTO v_changed_count, v_current_subtotal_amount,
    v_current_tax_amount, v_current_total_amount
  FROM frozen
  LEFT JOIN current_prices ON current_prices.frozen_id = frozen.id;
  IF v_changed_count > 0
    OR v_current_subtotal_amount IS DISTINCT FROM
      v_requisition.subtotal_amount
    OR v_current_tax_amount IS DISTINCT FROM v_requisition.tax_amount
    OR v_current_total_amount IS DISTINCT FROM v_requisition.total_amount
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED'
    );
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'supplier_sku_id', item.supplier_sku_id,
    'quantity', item.quantity
  ) ORDER BY item.line_no)
  INTO v_items
  FROM public.supplier_purchase_requisition_items AS item
  WHERE item.purchase_requisition_id = p_requisition_id
    AND item.tenant_id = p_tenant_id;
  IF v_items IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED'
    );
  END IF;

  v_before := to_jsonb(v_requisition);
  v_order_result := public.create_supplier_purchase_order_from_requisition(
    p_purchase_order_id,
    p_tenant_id,
    v_requisition.project_id,
    v_requisition.tenant_supplier_id,
    v_requisition.expected_delivery_date,
    v_requisition.remark,
    v_items,
    p_actor_user_id,
    p_actor_employee_id,
    p_requisition_id
  );
  IF v_order_result ->> 'status' <> 'saved' THEN
    RETURN v_order_result;
  END IF;

  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = p_requisition_id
    AND commitment.status = 'reserved'
  ORDER BY commitment.cost_category_id, commitment.id
  FOR UPDATE;
  UPDATE public.project_cost_commitments AS commitment
  SET status = 'converted', updated_at = now()
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = p_requisition_id
    AND commitment.status = 'reserved';

  UPDATE public.supplier_purchase_requisitions AS requisition
  SET status = 'converted',
      purchase_order_id = p_purchase_order_id,
      version = requisition.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE requisition.id = p_requisition_id
  RETURNING * INTO v_requisition;
  v_snapshot :=
    public.supplier_purchase_requisition_to_jsonb(v_requisition);

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_purchase_requisition', p_requisition_id,
    'convert_supplier_purchase_requisition',
    v_before || jsonb_build_object('_request', v_request),
    v_snapshot, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_requisition.version
  );
  RETURN jsonb_build_object(
    'status', 'converted', 'idempotent', false,
    'requisition', v_snapshot,
    'purchase_order_id', p_purchase_order_id,
    'version', v_requisition.version
  );
END;
$$;

ALTER FUNCTION public.cancel_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) RENAME TO cancel_supplier_purchase_order_fulfillment_v1;

REVOKE ALL ON FUNCTION
  public.cancel_supplier_purchase_order_fulfillment_v1(
    uuid,
    uuid,
    integer,
    text,
    uuid,
    uuid,
    text
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.cancel_supplier_purchase_order(
  p_order_id uuid,
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
  v_result jsonb;
  v_purchase_requisition_id uuid;
BEGIN
  -- The renamed fulfillment implementation remains the single owner of all
  -- order, fulfillment, item-fulfillment and shipment locks. In particular it
  -- returns SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED before cancellation
  -- when supplier_purchase_order_shipments exist.
  v_result := public.cancel_supplier_purchase_order_fulfillment_v1(
    p_order_id,
    p_tenant_id,
    p_expected_version,
    p_reason,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );
  IF v_result ->> 'status' <> 'cancelled' THEN
    RETURN v_result;
  END IF;

  SELECT purchase_order.purchase_requisition_id
  INTO v_purchase_requisition_id
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id;

  IF v_purchase_requisition_id IS NOT NULL THEN
    PERFORM commitment.id
    FROM public.project_cost_commitments AS commitment
    WHERE commitment.tenant_id = p_tenant_id
      AND commitment.source_id = v_purchase_requisition_id
      AND commitment.status = 'converted'
    ORDER BY commitment.cost_category_id, commitment.id
    FOR UPDATE;
    UPDATE public.project_cost_commitments AS commitment
    SET status = 'released',
        released_by_employee_id = p_actor_employee_id,
        released_at = clock_timestamp(),
        release_reason = left(
          'order_cancel:' || btrim(p_reason),
          500
        ),
        updated_at = now()
    WHERE commitment.tenant_id = p_tenant_id
      AND commitment.source_id = v_purchase_requisition_id
      AND commitment.status = 'converted';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_requisition_draft(
  uuid, uuid, uuid, uuid, integer, date, text, text, jsonb,
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_requisition_draft(
  uuid, uuid, uuid, uuid, integer, date, text, text, jsonb,
  uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.submit_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.review_supplier_purchase_requisition(
  uuid, uuid, integer, text, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_supplier_purchase_requisition(
  uuid, uuid, integer, text, text, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_requisition(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_requisition(
  uuid, uuid, integer, text, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.convert_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_supplier_purchase_requisition(
  uuid, uuid, integer, uuid, uuid, uuid, text
) TO service_role;

REVOKE ALL ON FUNCTION public.save_supplier_purchase_order_draft(
  uuid, uuid, uuid, uuid, integer, date, text, jsonb,
  uuid, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_supplier_purchase_order_draft(
  uuid, uuid, uuid, uuid, integer, date, text, jsonb,
  uuid, uuid, text, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_order(
  uuid, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_order(
  uuid, uuid, integer, text, uuid, uuid, text
) TO service_role;

COMMIT;
