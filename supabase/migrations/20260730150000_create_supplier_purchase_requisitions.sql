-- Rollback: use a forward migration to revoke execute from future requisition
-- commands before disabling entry points. Preserve audit history and financial facts.
-- Any destructive rollback requires an explicit reviewed migration.

BEGIN;

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
);

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
    CHECK (line_no > 0),
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
ADD CONSTRAINT supplier_purchase_orders_requisition_tenant_fkey
FOREIGN KEY (purchase_requisition_id, tenant_id)
REFERENCES public.supplier_purchase_requisitions(id, tenant_id)
ON DELETE RESTRICT;

ALTER TABLE public.supplier_purchase_requisitions
ADD CONSTRAINT supplier_purchase_requisitions_order_tenant_fkey
FOREIGN KEY (purchase_order_id, tenant_id)
REFERENCES public.supplier_purchase_orders(id, tenant_id)
ON DELETE RESTRICT;

CREATE INDEX supplier_purchase_requisitions_tenant_status_updated_idx
ON public.supplier_purchase_requisitions(
  tenant_id,
  status,
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

CREATE INDEX project_cost_commitments_source_lookup_idx
ON public.project_cost_commitments(
  tenant_id,
  source_type,
  source_id,
  cost_category_id
);

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

GRANT USAGE ON SEQUENCE public.supplier_purchase_requisition_number_seq
TO service_role;

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

COMMIT;
