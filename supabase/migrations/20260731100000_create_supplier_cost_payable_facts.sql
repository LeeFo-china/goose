-- Rollback: use a forward migration to revoke accounting commands and hide
-- their application entry points. Preserve supplier cost/payable operating
-- facts and receipt audit. Once operating facts exist, rollback must not DROP
-- either event table or any source/accounting column.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.supplier_purchase_order_receipt_items
ADD CONSTRAINT supplier_purchase_order_receipt_items_id_tenant_receipt_order_item_key
UNIQUE (
  id,
  tenant_id,
  receipt_id,
  supplier_purchase_order_id,
  supplier_purchase_order_item_id
);

ALTER TABLE public.supplier_purchase_orders
ADD COLUMN settlement_term_days_snapshot integer NULL,
ADD COLUMN invoice_required_before_payment_snapshot boolean NULL,
ADD COLUMN commercial_snapshot_source text NULL;

ALTER TABLE public.supplier_purchase_orders
ADD CONSTRAINT supplier_purchase_orders_settlement_snapshot_check
CHECK (
  settlement_term_days_snapshot IS NULL
  OR settlement_term_days_snapshot BETWEEN 0 AND 3650
);

ALTER TABLE public.supplier_purchase_orders
ADD CONSTRAINT supplier_purchase_orders_commercial_snapshot_source_check
CHECK (
  commercial_snapshot_source IS NULL
  OR commercial_snapshot_source IN (
    'contract_snapshot',
    'relationship_default_snapshot',
    'legacy_default_snapshot'
  )
);

COMMENT ON COLUMN
  public.supplier_purchase_orders.settlement_term_days_snapshot
IS
  'New orders freeze conversion-time terms. Pre-20260731100000 orders use '
  'the relationship default available during migration and are not asserted '
  'as historical contract facts.';

COMMENT ON COLUMN
  public.supplier_purchase_orders.invoice_required_before_payment_snapshot
IS
  'New orders freeze conversion-time terms. Pre-20260731100000 orders use '
  'the relationship default available during migration and are not asserted '
  'as historical contract facts.';

COMMENT ON COLUMN
  public.supplier_purchase_orders.commercial_snapshot_source
IS
  'Records whether commercial terms came from the applicable contract, the '
  'relationship default, or a legacy migration-time default reconstruction.';

CREATE FUNCTION public.populate_supplier_purchase_order_commercial_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_contract_id uuid;
  v_contract_settlement_term_days integer;
  v_contract_invoice_required boolean;
  v_default_settlement_term_days integer;
  v_default_invoice_required boolean;
BEGIN
  -- Every existing v1 creation path already holds this relationship row
  -- FOR SHARE, and every contract/default command must lock it before commit.
  -- Re-enter that fence first. The following plain contract read then sees a
  -- consistent before-or-after state without taking a contract lock after the
  -- relationship lock (which would invert mutate_supplier_contract).
  SELECT
    relationship.settlement_term_days,
    relationship.invoice_required_before_payment
  INTO
    v_default_settlement_term_days,
    v_default_invoice_required
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = NEW.tenant_supplier_id
    AND relationship.tenant_id = NEW.tenant_id
    AND relationship.supplier_id = NEW.supplier_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'TENANT_SUPPLIER_STATE_CONFLICT';
  END IF;

  SELECT
    contract.id,
    contract.settlement_term_days,
    contract.invoice_required_before_payment
  INTO
    v_contract_id,
    v_contract_settlement_term_days,
    v_contract_invoice_required
  FROM public.supplier_contracts AS contract
  WHERE contract.tenant_id = NEW.tenant_id
    AND contract.tenant_supplier_id = NEW.tenant_supplier_id
    AND contract.lifecycle_status = 'active'
    AND contract.valid_from <= NEW.priced_at::date
    AND contract.valid_until >= NEW.priced_at::date
  ORDER BY contract.valid_until DESC, contract.id
  LIMIT 1;

  NEW.settlement_term_days_snapshot := COALESCE(
    v_contract_settlement_term_days,
    v_default_settlement_term_days
  );
  NEW.invoice_required_before_payment_snapshot := COALESCE(
    v_contract_invoice_required,
    v_default_invoice_required
  );
  NEW.commercial_snapshot_source := CASE
    WHEN v_contract_id IS NOT NULL THEN 'contract_snapshot'
    ELSE 'relationship_default_snapshot'
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.populate_supplier_purchase_order_commercial_snapshot()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_orders_commercial_snapshot
BEFORE INSERT ON public.supplier_purchase_orders
FOR EACH ROW
EXECUTE FUNCTION
  public.populate_supplier_purchase_order_commercial_snapshot();

CREATE OR REPLACE FUNCTION public.prevent_submitted_supplier_purchase_order_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft'
      OR NEW.version <> 1
      OR NEW.submitted_by_employee_id IS NOT NULL
      OR NEW.submitted_at IS NOT NULL
      OR NEW.cancelled_by_employee_id IS NOT NULL
      OR NEW.cancelled_at IS NOT NULL
      OR NEW.cancel_reason IS NOT NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF OLD.status = 'submitted' THEN
    IF NEW.status <> 'cancelled'
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
      OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
      OR NEW.order_no IS DISTINCT FROM OLD.order_no
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.expected_delivery_date IS DISTINCT FROM
        OLD.expected_delivery_date
      OR NEW.remark IS DISTINCT FROM OLD.remark
      OR NEW.priced_at IS DISTINCT FROM OLD.priced_at
      OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.settlement_term_days_snapshot IS DISTINCT FROM
        OLD.settlement_term_days_snapshot
      OR NEW.invoice_required_before_payment_snapshot IS DISTINCT FROM
        OLD.invoice_required_before_payment_snapshot
      OR NEW.commercial_snapshot_source IS DISTINCT FROM
        OLD.commercial_snapshot_source
      OR NEW.submitted_by_employee_id IS DISTINCT FROM
        OLD.submitted_by_employee_id
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.cancelled_by_employee_id IS NULL
      OR NEW.cancelled_at IS NULL
      OR NEW.cancel_reason IS NULL
      OR btrim(NEW.cancel_reason) = ''
      OR char_length(btrim(NEW.cancel_reason)) > 500
      OR NEW.version <> OLD.version + 1
      OR NEW.updated_by_employee_id IS DISTINCT FROM
        NEW.cancelled_by_employee_id
      OR NEW.updated_at < OLD.updated_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('draft', 'submitted', 'cancelled')
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.tenant_supplier_id IS DISTINCT FROM OLD.tenant_supplier_id
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.order_no IS DISTINCT FROM OLD.order_no
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.version <> OLD.version + 1
    OR NEW.updated_by_employee_id IS NULL
    OR NEW.updated_at < OLD.updated_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'draft' AND (
    NEW.submitted_by_employee_id IS NOT NULL
    OR NEW.submitted_at IS NOT NULL
    OR NEW.cancelled_by_employee_id IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
    OR NEW.cancel_reason IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status IN ('submitted', 'cancelled') AND (
    NEW.expected_delivery_date IS DISTINCT FROM OLD.expected_delivery_date
    OR NEW.remark IS DISTINCT FROM OLD.remark
    OR NEW.priced_at IS DISTINCT FROM OLD.priced_at
    OR NEW.subtotal_amount IS DISTINCT FROM OLD.subtotal_amount
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'submitted' AND (
    NEW.submitted_by_employee_id IS NULL
    OR NEW.submitted_at IS NULL
    OR NEW.cancelled_by_employee_id IS NOT NULL
    OR NEW.cancelled_at IS NOT NULL
    OR NEW.cancel_reason IS NOT NULL
    OR NEW.updated_by_employee_id IS DISTINCT FROM
      NEW.submitted_by_employee_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  IF NEW.status = 'cancelled' AND (
    NEW.submitted_by_employee_id IS DISTINCT FROM
      OLD.submitted_by_employee_id
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.cancelled_by_employee_id IS NULL
    OR NEW.cancelled_at IS NULL
    OR NEW.cancel_reason IS NULL
    OR btrim(NEW.cancel_reason) = ''
    OR char_length(btrim(NEW.cancel_reason)) > 500
    OR NEW.updated_by_employee_id IS DISTINCT FROM
      NEW.cancelled_by_employee_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.supplier_purchase_order_items
ADD COLUMN cost_category_id uuid NULL;

ALTER TABLE public.supplier_purchase_order_items
ADD CONSTRAINT supplier_purchase_order_items_cost_category_tenant_fkey
FOREIGN KEY (cost_category_id, tenant_id)
REFERENCES public.finance_cost_categories(id, tenant_id)
ON DELETE RESTRICT;

ALTER TABLE public.project_cost_commitments
ADD COLUMN recognized_amount numeric(18, 2) NOT NULL DEFAULT 0,
ADD COLUMN consumed_at timestamptz NULL;

ALTER TABLE public.project_cost_commitments
DROP CONSTRAINT project_cost_commitments_status_check;

ALTER TABLE public.project_cost_commitments
ADD CONSTRAINT project_cost_commitments_status_check
CHECK (status IN ('reserved', 'converted', 'consumed', 'released'));

ALTER TABLE public.project_cost_commitments
ADD CONSTRAINT project_cost_commitments_recognized_amount_check
CHECK (
  recognized_amount >= 0
  AND recognized_amount <= amount
);

ALTER TABLE public.project_cost_commitments
DROP CONSTRAINT project_cost_commitments_release_audit_check;

ALTER TABLE public.project_cost_commitments
ADD CONSTRAINT project_cost_commitments_lifecycle_audit_check
CHECK (
  (
    status IN ('reserved', 'converted')
    AND consumed_at IS NULL
    AND released_by_employee_id IS NULL
    AND released_at IS NULL
    AND release_reason IS NULL
  )
  OR (
    status = 'consumed'
    AND recognized_amount = amount
    AND consumed_at IS NOT NULL
    AND released_by_employee_id IS NULL
    AND released_at IS NULL
    AND release_reason IS NULL
  )
  OR (
    status = 'released'
    AND consumed_at IS NULL
    AND released_by_employee_id IS NOT NULL
    AND released_at IS NOT NULL
    AND release_reason IS NOT NULL
  )
);

-- Both ALTER TABLE statements take transaction-duration AccessExclusive
-- locks. Concurrent writers cannot observe the temporary suspension, and any
-- migration failure rolls these DDL changes back with the backfill.
ALTER TABLE public.supplier_purchase_order_items
DISABLE TRIGGER supplier_purchase_order_items_require_draft;

ALTER TABLE public.supplier_purchase_orders
DISABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation;

-- Backfill reliable historical line categories
WITH reliable_mapping AS MATERIALIZED (
  SELECT
    purchase_order.id AS supplier_purchase_order_id,
    requisition_item.supplier_sku_id,
    (array_agg(DISTINCT requisition_item.cost_category_id))[1]
      AS cost_category_id
  FROM public.supplier_purchase_orders AS purchase_order
  JOIN public.supplier_purchase_requisition_items AS requisition_item
    ON requisition_item.purchase_requisition_id =
      purchase_order.purchase_requisition_id
    AND requisition_item.tenant_id = purchase_order.tenant_id
  WHERE purchase_order.purchase_requisition_id IS NOT NULL
  GROUP BY purchase_order.id, requisition_item.supplier_sku_id
  HAVING COUNT(DISTINCT requisition_item.cost_category_id) = 1
)
UPDATE public.supplier_purchase_order_items AS purchase_item
SET cost_category_id = mapped.cost_category_id
FROM reliable_mapping AS mapped
WHERE purchase_item.supplier_purchase_order_id =
    mapped.supplier_purchase_order_id
  AND purchase_item.supplier_sku_id = mapped.supplier_sku_id
  AND purchase_item.cost_category_id IS NULL;
-- End reliable historical line categories

-- Backfill historical commercial defaults
-- Prior contract state cannot be reconstructed reliably. Preserve that
-- uncertainty by using only the current relationship defaults and recording
-- explicit provenance for the paginated operational diagnostic.
UPDATE public.supplier_purchase_orders AS purchase_order
SET settlement_term_days_snapshot = relationship.settlement_term_days,
    invoice_required_before_payment_snapshot =
      relationship.invoice_required_before_payment,
    commercial_snapshot_source = 'legacy_default_snapshot'
FROM public.tenant_suppliers AS relationship
WHERE relationship.id = purchase_order.tenant_supplier_id
  AND relationship.tenant_id = purchase_order.tenant_id
  AND relationship.supplier_id = purchase_order.supplier_id
  AND (
    purchase_order.settlement_term_days_snapshot IS NULL
    OR purchase_order.invoice_required_before_payment_snapshot IS NULL
    OR purchase_order.commercial_snapshot_source IS NULL
  );
-- End historical commercial defaults

ALTER TABLE public.supplier_purchase_order_items
ENABLE TRIGGER supplier_purchase_order_items_require_draft;

ALTER TABLE public.supplier_purchase_orders
ENABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS guard_trigger
    WHERE guard_trigger.tgrelid =
        'public.supplier_purchase_order_items'::regclass
      AND guard_trigger.tgname =
        'supplier_purchase_order_items_require_draft'
      AND guard_trigger.tgfoid =
        'public.prevent_supplier_purchase_order_item_mutation()'
          ::regprocedure
      AND guard_trigger.tgenabled = 'O'
  )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_trigger AS guard_trigger
      WHERE guard_trigger.tgrelid =
          'public.supplier_purchase_orders'::regclass
        AND guard_trigger.tgname =
          'supplier_purchase_orders_prevent_submitted_mutation'
        AND guard_trigger.tgfoid =
          'public.prevent_submitted_supplier_purchase_order_mutation()'
            ::regprocedure
        AND guard_trigger.tgenabled = 'O'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_GUARD_RESTORE_FAILED';
  END IF;
END;
$migration$;

ALTER TABLE public.supplier_purchase_orders
ALTER COLUMN settlement_term_days_snapshot SET NOT NULL,
ALTER COLUMN invoice_required_before_payment_snapshot SET NOT NULL,
ALTER COLUMN commercial_snapshot_source SET NOT NULL;

CREATE TABLE public.project_cost_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  cost_category_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_item_id uuid NOT NULL,
  supplier_purchase_order_receipt_id uuid NOT NULL,
  supplier_purchase_order_receipt_item_id uuid NOT NULL,
  purchase_requisition_id uuid NULL,
  source_type text NOT NULL DEFAULT
    'supplier_purchase_receipt_item',
  source_id uuid NOT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  accepted_quantity numeric(18, 4) NOT NULL,
  amount numeric(18, 2) NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_cost_events_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_category_tenant_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_created_employee_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_relationship_tenant_supplier_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_order_tenant_supplier_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id, supplier_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_item_tenant_order_fkey
    FOREIGN KEY (
      supplier_purchase_order_item_id,
      tenant_id,
      supplier_purchase_order_id
    )
    REFERENCES public.supplier_purchase_order_items(
      id,
      tenant_id,
      supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_receipt_tenant_order_fkey
    FOREIGN KEY (
      supplier_purchase_order_receipt_id,
      tenant_id,
      supplier_purchase_order_id
    )
    REFERENCES public.supplier_purchase_order_receipts(
      id,
      tenant_id,
      supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_receipt_item_tenant_chain_fkey
    FOREIGN KEY (
      supplier_purchase_order_receipt_item_id,
      tenant_id,
      supplier_purchase_order_receipt_id,
      supplier_purchase_order_id,
      supplier_purchase_order_item_id
    )
    REFERENCES public.supplier_purchase_order_receipt_items(
      id,
      tenant_id,
      receipt_id,
      supplier_purchase_order_id,
      supplier_purchase_order_item_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_requisition_tenant_fkey
    FOREIGN KEY (purchase_requisition_id, tenant_id)
    REFERENCES public.supplier_purchase_requisitions(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT project_cost_events_source_type_check
    CHECK (source_type = 'supplier_purchase_receipt_item'),
  CONSTRAINT project_cost_events_source_identity_check
    CHECK (source_id = supplier_purchase_order_receipt_item_id),
  CONSTRAINT project_cost_events_currency_check CHECK (currency = 'CNY'),
  CONSTRAINT project_cost_events_amount_check CHECK (amount >= 0),
  CONSTRAINT project_cost_events_quantity_check CHECK (accepted_quantity > 0),
  CONSTRAINT project_cost_events_source_unique_idx
    UNIQUE (tenant_id, source_type, source_id)
);

CREATE TABLE public.supplier_payable_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  cost_category_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_item_id uuid NOT NULL,
  supplier_purchase_order_receipt_id uuid NOT NULL,
  supplier_purchase_order_receipt_item_id uuid NOT NULL,
  purchase_requisition_id uuid NULL,
  source_type text NOT NULL DEFAULT
    'supplier_purchase_receipt_item',
  source_id uuid NOT NULL,
  currency char(3) NOT NULL DEFAULT 'CNY',
  accepted_quantity numeric(18, 4) NOT NULL,
  amount numeric(18, 2) NOT NULL,
  occurred_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  invoice_required_before_payment boolean NOT NULL,
  created_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payable_events_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_category_tenant_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_created_employee_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_relationship_tenant_supplier_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_order_tenant_supplier_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id, supplier_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_item_tenant_order_fkey
    FOREIGN KEY (
      supplier_purchase_order_item_id,
      tenant_id,
      supplier_purchase_order_id
    )
    REFERENCES public.supplier_purchase_order_items(
      id,
      tenant_id,
      supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_receipt_tenant_order_fkey
    FOREIGN KEY (
      supplier_purchase_order_receipt_id,
      tenant_id,
      supplier_purchase_order_id
    )
    REFERENCES public.supplier_purchase_order_receipts(
      id,
      tenant_id,
      supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_receipt_item_tenant_chain_fkey
    FOREIGN KEY (
      supplier_purchase_order_receipt_item_id,
      tenant_id,
      supplier_purchase_order_receipt_id,
      supplier_purchase_order_id,
      supplier_purchase_order_item_id
    )
    REFERENCES public.supplier_purchase_order_receipt_items(
      id,
      tenant_id,
      receipt_id,
      supplier_purchase_order_id,
      supplier_purchase_order_item_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_requisition_tenant_fkey
    FOREIGN KEY (purchase_requisition_id, tenant_id)
    REFERENCES public.supplier_purchase_requisitions(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payable_events_source_type_check
    CHECK (source_type = 'supplier_purchase_receipt_item'),
  CONSTRAINT supplier_payable_events_source_identity_check
    CHECK (source_id = supplier_purchase_order_receipt_item_id),
  CONSTRAINT supplier_payable_events_currency_check CHECK (currency = 'CNY'),
  CONSTRAINT supplier_payable_events_amount_check CHECK (amount >= 0),
  CONSTRAINT supplier_payable_events_quantity_check
    CHECK (accepted_quantity > 0),
  CONSTRAINT supplier_payable_events_due_check CHECK (due_at >= occurred_at),
  CONSTRAINT supplier_payable_events_source_unique_idx
    UNIQUE (tenant_id, source_type, source_id)
);

CREATE INDEX project_cost_events_tenant_project_category_occurred_idx
ON public.project_cost_events(
  tenant_id,
  project_id,
  cost_category_id,
  occurred_at DESC,
  id DESC
);

CREATE INDEX supplier_payable_events_tenant_project_due_idx
ON public.supplier_payable_events(
  tenant_id,
  project_id,
  due_at,
  id
);

CREATE INDEX supplier_payable_events_tenant_supplier_occurred_idx
ON public.supplier_payable_events(
  tenant_id,
  tenant_supplier_id,
  occurred_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_order_items_legacy_category_gap_idx
ON public.supplier_purchase_order_items(tenant_id, id)
WHERE cost_category_id IS NULL;

CREATE INDEX supplier_purchase_order_receipt_items_financialization_idx
ON public.supplier_purchase_order_receipt_items(
  tenant_id,
  receipt_id,
  supplier_purchase_order_item_id,
  id
)
INCLUDE (accepted_quantity)
WHERE accepted_quantity > 0;

CREATE INDEX project_cost_commitments_active_remaining_idx
ON public.project_cost_commitments(
  tenant_id,
  project_id,
  cost_category_id,
  status
)
INCLUDE (amount, recognized_amount)
WHERE status IN ('reserved', 'converted');

CREATE FUNCTION public.prevent_supplier_accounting_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_ACCOUNTING_EVENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  public.prevent_supplier_accounting_event_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER project_cost_events_immutable
BEFORE UPDATE OR DELETE
ON public.project_cost_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_supplier_accounting_event_mutation();

CREATE TRIGGER supplier_payable_events_immutable
BEFORE UPDATE OR DELETE
ON public.supplier_payable_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_supplier_accounting_event_mutation();

ALTER TABLE public.project_cost_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cost_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payable_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payable_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.project_cost_events,
  public.supplier_payable_events
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.project_cost_events,
  public.supplier_payable_events
TO service_role;

-- Patch active commitment aggregation
CREATE OR REPLACE FUNCTION public.list_project_cost_commitment_totals(
  p_tenant_id uuid,
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source_row_count bigint;
  v_categories jsonb;
BEGIN
  SELECT COUNT(*)
  INTO v_source_row_count
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.project_id = p_project_id
    AND commitment.source_type = 'supplier_purchase_requisition'
    AND commitment.status IN ('reserved', 'converted');

  IF v_source_row_count > 10000 THEN
    RETURN jsonb_build_object(
      'source_row_count', v_source_row_count,
      'categories', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'cost_category_id', total.cost_category_id,
        'category_code', category.code,
        'category_name', category.name,
        'commitment_amount', total.commitment_amount::text
      )
      ORDER BY category.sort_order NULLS LAST,
        category.code,
        total.cost_category_id
    ),
    '[]'::jsonb
  )
  INTO v_categories
  FROM (
    SELECT
      commitment.cost_category_id,
      SUM(
        greatest(
          commitment.amount - commitment.recognized_amount,
          0
        )
      ) AS commitment_amount
    FROM public.project_cost_commitments AS commitment
    WHERE commitment.tenant_id = p_tenant_id
      AND commitment.project_id = p_project_id
      AND commitment.source_type = 'supplier_purchase_requisition'
      AND commitment.status IN ('reserved', 'converted')
    GROUP BY commitment.cost_category_id
  ) AS total
  JOIN public.finance_cost_categories AS category
    ON category.id = total.cost_category_id
    AND category.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'source_row_count', v_source_row_count,
    'categories', v_categories
  );
END;
$$;

DO $migration$
DECLARE
  v_function regprocedure :=
    'public.submit_supplier_purchase_requisition(uuid,uuid,integer,uuid,uuid,text)'::regprocedure;
  v_body text;
  v_old text :=
    'COALESCE(SUM(commitment.amount), 0)::numeric(18, 2)';
  v_new text :=
    'COALESCE(SUM(greatest(' ||
    'commitment.amount - commitment.recognized_amount, 0)), 0)' ||
    '::numeric(18, 2)';
  v_old_count integer;
BEGIN
  SELECT routine.prosrc
  INTO STRICT v_body
  FROM pg_catalog.pg_proc AS routine
  WHERE routine.oid = v_function;

  v_old_count := (
    char_length(v_body) - char_length(replace(v_body, v_old, ''))
  ) / char_length(v_old);
  IF v_old_count <> 1 OR position(v_new IN v_body) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_COMMITMENT_AGGREGATION_SOURCE_MISMATCH';
  END IF;

  v_body := replace(v_body, v_old, v_new);
  EXECUTE format(
    $function$
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
AS %L
    $function$,
    v_body
  );
END;
$migration$;
-- End active commitment aggregation

REVOKE ALL ON FUNCTION
  public.list_project_cost_commitment_totals(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.list_project_cost_commitment_totals(uuid, uuid)
TO service_role;

ALTER FUNCTION public.convert_supplier_purchase_requisition(
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  text
) RENAME TO convert_supplier_purchase_requisition_commercial_v1;

REVOKE ALL ON FUNCTION
  public.convert_supplier_purchase_requisition_commercial_v1(
    uuid,
    uuid,
    integer,
    uuid,
    uuid,
    uuid,
    text
  )
FROM PUBLIC, anon, authenticated, service_role;

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
  v_result jsonb;
  v_expected_item_count integer;
  v_updated_item_count integer;
BEGIN
  -- The reviewed v1 command remains the authority for validation, actor
  -- checks, the command/order/requisition lock order, idempotency fingerprint,
  -- amount validation, status changes, command audit, and response envelope.
  v_result :=
    public.convert_supplier_purchase_requisition_commercial_v1(
      p_requisition_id,
      p_tenant_id,
      p_expected_version,
      p_purchase_order_id,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key
    );
  IF v_result ->> 'status' <> 'converted'
    OR COALESCE((v_result ->> 'idempotent')::boolean, false)
  THEN
    RETURN v_result;
  END IF;

  UPDATE public.supplier_purchase_order_items AS purchase_item
  SET cost_category_id = requisition_item.cost_category_id
  FROM public.supplier_purchase_requisition_items AS requisition_item
  WHERE requisition_item.purchase_requisition_id = p_requisition_id
    AND requisition_item.tenant_id = p_tenant_id
    AND purchase_item.supplier_purchase_order_id = p_purchase_order_id
    AND purchase_item.tenant_id = p_tenant_id
    AND purchase_item.supplier_sku_id =
      requisition_item.supplier_sku_id;
  GET DIAGNOSTICS v_updated_item_count = ROW_COUNT;

  SELECT COUNT(*)::integer
  INTO v_expected_item_count
  FROM public.supplier_purchase_requisition_items AS requisition_item
  WHERE requisition_item.purchase_requisition_id = p_requisition_id
    AND requisition_item.tenant_id = p_tenant_id;

  IF v_updated_item_count <> v_expected_item_count THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_supplier_purchase_requisition(
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.convert_supplier_purchase_requisition(
  uuid,
  uuid,
  integer,
  uuid,
  uuid,
  uuid,
  text
) TO service_role;

ALTER FUNCTION public.create_supplier_purchase_order_receipt(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  uuid,
  text
) RENAME TO create_supplier_purchase_order_receipt_fulfillment_v1;

REVOKE ALL ON FUNCTION
  public.create_supplier_purchase_order_receipt_fulfillment_v1(
    uuid,
    uuid,
    uuid,
    integer,
    text,
    timestamptz,
    text,
    jsonb,
    uuid,
    uuid,
    text
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_purchase_order_receipt(
  p_receipt_id uuid,
  p_order_id uuid,
  p_tenant_id uuid,
  p_expected_fulfillment_version integer,
  p_receipt_no text,
  p_received_at timestamptz,
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
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  -- A PL/pgSQL exception block is a subtransaction. If accounting validation
  -- or any fact write fails, the reviewed v1 receipt, receipt items,
  -- fulfillment accumulators, version, and command event all roll back before
  -- the state-conflict envelope is returned.
  BEGIN
    v_result :=
      public.create_supplier_purchase_order_receipt_fulfillment_v1(
        p_receipt_id,
        p_order_id,
        p_tenant_id,
        p_expected_fulfillment_version,
        p_receipt_no,
        p_received_at,
        p_remark,
        p_items,
        p_actor_user_id,
        p_actor_employee_id,
        p_idempotency_key
      );
    IF v_result ->> 'status' <> 'receipt_created'
      OR COALESCE((v_result ->> 'idempotent')::boolean, false)
    THEN
      RETURN v_result;
    END IF;

  SELECT purchase_order.*
  INTO STRICT v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_purchase_order_receipt_items AS receipt_item
    JOIN public.supplier_purchase_order_items AS purchase_item
      ON purchase_item.id = receipt_item.supplier_purchase_order_item_id
      AND purchase_item.tenant_id = receipt_item.tenant_id
      AND purchase_item.supplier_purchase_order_id =
        receipt_item.supplier_purchase_order_id
    WHERE receipt_item.receipt_id = p_receipt_id
      AND receipt_item.tenant_id = p_tenant_id
      AND receipt_item.accepted_quantity > 0
      AND purchase_item.cost_category_id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED';
  END IF;

  PERFORM commitment.id
  FROM public.project_cost_commitments AS commitment
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = v_order.purchase_requisition_id
    AND commitment.cost_category_id IN (
      SELECT DISTINCT purchase_item.cost_category_id
      FROM public.supplier_purchase_order_receipt_items AS receipt_item
      JOIN public.supplier_purchase_order_items AS purchase_item
        ON purchase_item.id =
          receipt_item.supplier_purchase_order_item_id
        AND purchase_item.tenant_id = receipt_item.tenant_id
        AND purchase_item.supplier_purchase_order_id =
          receipt_item.supplier_purchase_order_id
      WHERE receipt_item.receipt_id = p_receipt_id
        AND receipt_item.tenant_id = p_tenant_id
        AND receipt_item.accepted_quantity > 0
    )
  ORDER BY commitment.cost_category_id, commitment.id
  FOR UPDATE;

  WITH previous AS MATERIALIZED (
    SELECT
      cost_event.supplier_purchase_order_item_id,
      COALESCE(SUM(cost_event.amount), 0)::numeric(18, 2)
        AS previous_recognized_amount
    FROM public.project_cost_events AS cost_event
    WHERE cost_event.tenant_id = p_tenant_id
      AND cost_event.supplier_purchase_order_id = p_order_id
    GROUP BY cost_event.supplier_purchase_order_item_id
  ),
  financial_line AS MATERIALIZED (
    SELECT
      receipt_item.id AS receipt_item_id,
      receipt_item.accepted_quantity,
      purchase_item.quantity AS ordered_quantity,
      purchase_item.total_amount AS line_total_amount,
      COALESCE(previous.previous_recognized_amount, 0)
        AS previous_recognized_amount,
      item_fulfillment.accepted_quantity
        AS cumulative_accepted_quantity,
      purchase_item.cost_category_id
    FROM public.supplier_purchase_order_receipt_items AS receipt_item
    JOIN public.supplier_purchase_order_items AS purchase_item
      ON purchase_item.id = receipt_item.supplier_purchase_order_item_id
      AND purchase_item.tenant_id = receipt_item.tenant_id
      AND purchase_item.supplier_purchase_order_id =
        receipt_item.supplier_purchase_order_id
    JOIN public.supplier_purchase_order_item_fulfillments
      AS item_fulfillment
      ON item_fulfillment.supplier_purchase_order_item_id =
        purchase_item.id
      AND item_fulfillment.tenant_id = purchase_item.tenant_id
      AND item_fulfillment.supplier_purchase_order_id =
        purchase_item.supplier_purchase_order_id
    LEFT JOIN previous
      ON previous.supplier_purchase_order_item_id = purchase_item.id
    WHERE receipt_item.receipt_id = p_receipt_id
      AND receipt_item.tenant_id = p_tenant_id
  ),
  allocated AS MATERIALIZED (
    SELECT
      financial_line.*,
      greatest(
        least(
          financial_line.line_total_amount,
          CASE
            WHEN financial_line.cumulative_accepted_quantity >=
              financial_line.ordered_quantity
            THEN financial_line.line_total_amount
            ELSE round(
              financial_line.line_total_amount *
                financial_line.cumulative_accepted_quantity /
                financial_line.ordered_quantity,
              2
            )
          END
        ) - financial_line.previous_recognized_amount,
        0
      )::numeric(18, 2) AS recognized_amount
    FROM financial_line
    WHERE financial_line.accepted_quantity > 0
  )
  INSERT INTO public.project_cost_events (
    tenant_id,
    project_id,
    cost_category_id,
    tenant_supplier_id,
    supplier_id,
    supplier_purchase_order_id,
    supplier_purchase_order_item_id,
    supplier_purchase_order_receipt_id,
    supplier_purchase_order_receipt_item_id,
    purchase_requisition_id,
    source_type,
    source_id,
    currency,
    accepted_quantity,
    amount,
    occurred_at,
    created_by_employee_id
  )
  SELECT
    p_tenant_id,
    v_order.project_id,
    allocated.cost_category_id,
    v_order.tenant_supplier_id,
    v_order.supplier_id,
    p_order_id,
    receipt_item.supplier_purchase_order_item_id,
    p_receipt_id,
    allocated.receipt_item_id,
    v_order.purchase_requisition_id,
    'supplier_purchase_receipt_item',
    allocated.receipt_item_id,
    'CNY',
    allocated.accepted_quantity,
    allocated.recognized_amount,
    p_received_at,
    p_actor_employee_id
  FROM allocated
  JOIN public.supplier_purchase_order_receipt_items AS receipt_item
    ON receipt_item.id = allocated.receipt_item_id
  ON CONFLICT (tenant_id, source_type, source_id) DO NOTHING;

  INSERT INTO public.supplier_payable_events (
    tenant_id,
    project_id,
    cost_category_id,
    tenant_supplier_id,
    supplier_id,
    supplier_purchase_order_id,
    supplier_purchase_order_item_id,
    supplier_purchase_order_receipt_id,
    supplier_purchase_order_receipt_item_id,
    purchase_requisition_id,
    source_type,
    source_id,
    currency,
    accepted_quantity,
    amount,
    occurred_at,
    due_at,
    invoice_required_before_payment,
    created_by_employee_id
  )
  SELECT
    cost_event.tenant_id,
    cost_event.project_id,
    cost_event.cost_category_id,
    cost_event.tenant_supplier_id,
    cost_event.supplier_id,
    cost_event.supplier_purchase_order_id,
    cost_event.supplier_purchase_order_item_id,
    cost_event.supplier_purchase_order_receipt_id,
    cost_event.supplier_purchase_order_receipt_item_id,
    cost_event.purchase_requisition_id,
    cost_event.source_type,
    cost_event.source_id,
    cost_event.currency,
    cost_event.accepted_quantity,
    cost_event.amount,
    cost_event.occurred_at,
    p_received_at + make_interval(
      days => v_order.settlement_term_days_snapshot
    ),
    v_order.invoice_required_before_payment_snapshot,
    cost_event.created_by_employee_id
  FROM public.project_cost_events AS cost_event
  WHERE cost_event.tenant_id = p_tenant_id
    AND cost_event.supplier_purchase_order_receipt_id = p_receipt_id
  ON CONFLICT (tenant_id, source_type, source_id) DO NOTHING;

  WITH recognized AS MATERIALIZED (
    SELECT
      cost_event.cost_category_id,
      SUM(cost_event.amount)::numeric(18, 2) AS amount
    FROM public.project_cost_events AS cost_event
    WHERE cost_event.tenant_id = p_tenant_id
      AND cost_event.supplier_purchase_order_receipt_id = p_receipt_id
    GROUP BY cost_event.cost_category_id
  )
  UPDATE public.project_cost_commitments AS commitment
  SET recognized_amount =
        commitment.recognized_amount + recognized.amount,
      status = CASE
        WHEN commitment.recognized_amount + recognized.amount =
          commitment.amount
        THEN 'consumed'
        ELSE commitment.status
      END,
      consumed_at = CASE
        WHEN commitment.recognized_amount + recognized.amount =
          commitment.amount
        THEN p_received_at
        ELSE NULL
      END,
      updated_at = now()
  FROM recognized
  WHERE commitment.tenant_id = p_tenant_id
    AND commitment.source_id = v_order.purchase_requisition_id
    AND commitment.cost_category_id = recognized.cost_category_id
    AND commitment.status IN ('reserved', 'converted');

    RETURN v_result;
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED' THEN
        RETURN jsonb_build_object(
          'status', 'state_conflict',
          'error_code',
            'SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED'
        );
      END IF;
      RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_purchase_order_receipt(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_order_receipt(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  uuid,
  text
) TO service_role;

-- Backfill financializable accepted receipt items
WITH historical_line AS MATERIALIZED (
  SELECT
    receipt_item.id AS receipt_item_id,
    receipt_item.tenant_id,
    purchase_order.project_id,
    purchase_item.cost_category_id,
    purchase_order.tenant_supplier_id,
    purchase_order.supplier_id,
    purchase_order.id AS purchase_order_id,
    purchase_item.id AS purchase_order_item_id,
    receipt.id AS receipt_id,
    purchase_order.purchase_requisition_id,
    receipt_item.accepted_quantity,
    purchase_item.quantity AS ordered_quantity,
    purchase_item.total_amount AS line_total_amount,
    receipt.received_at,
    receipt.received_by_employee_id,
    SUM(receipt_item.accepted_quantity) OVER (
      PARTITION BY purchase_item.id
      ORDER BY receipt.received_at, receipt.id, receipt_item.id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_accepted_quantity
  FROM public.supplier_purchase_order_receipt_items AS receipt_item
  JOIN public.supplier_purchase_order_receipts AS receipt
    ON receipt.id = receipt_item.receipt_id
    AND receipt.tenant_id = receipt_item.tenant_id
    AND receipt.supplier_purchase_order_id =
      receipt_item.supplier_purchase_order_id
  JOIN public.supplier_purchase_order_items AS purchase_item
    ON purchase_item.id = receipt_item.supplier_purchase_order_item_id
    AND purchase_item.tenant_id = receipt_item.tenant_id
    AND purchase_item.supplier_purchase_order_id =
      receipt_item.supplier_purchase_order_id
  JOIN public.supplier_purchase_orders AS purchase_order
    ON purchase_order.id = purchase_item.supplier_purchase_order_id
    AND purchase_order.tenant_id = purchase_item.tenant_id
  WHERE receipt_item.accepted_quantity > 0
    AND purchase_item.cost_category_id IS NOT NULL
),
targeted AS MATERIALIZED (
  SELECT
    historical_line.*,
    least(
      historical_line.line_total_amount,
      CASE
        WHEN historical_line.cumulative_accepted_quantity >=
          historical_line.ordered_quantity
        THEN historical_line.line_total_amount
        ELSE round(
          historical_line.line_total_amount *
            historical_line.cumulative_accepted_quantity /
            historical_line.ordered_quantity,
          2
        )
      END
    )::numeric(18, 2) AS cumulative_target_amount
  FROM historical_line
),
allocated AS MATERIALIZED (
  SELECT
    targeted.*,
    greatest(
      targeted.cumulative_target_amount - COALESCE(
        lag(targeted.cumulative_target_amount) OVER (
          PARTITION BY targeted.purchase_order_item_id
          ORDER BY
            targeted.received_at,
            targeted.receipt_id,
            targeted.receipt_item_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ),
      0
    )::numeric(18, 2) AS recognized_amount
  FROM targeted
)
INSERT INTO public.project_cost_events (
  tenant_id,
  project_id,
  cost_category_id,
  tenant_supplier_id,
  supplier_id,
  supplier_purchase_order_id,
  supplier_purchase_order_item_id,
  supplier_purchase_order_receipt_id,
  supplier_purchase_order_receipt_item_id,
  purchase_requisition_id,
  source_type,
  source_id,
  currency,
  accepted_quantity,
  amount,
  occurred_at,
  created_by_employee_id
)
SELECT
  allocated.tenant_id,
  allocated.project_id,
  allocated.cost_category_id,
  allocated.tenant_supplier_id,
  allocated.supplier_id,
  allocated.purchase_order_id,
  allocated.purchase_order_item_id,
  allocated.receipt_id,
  allocated.receipt_item_id,
  allocated.purchase_requisition_id,
  'supplier_purchase_receipt_item',
  allocated.receipt_item_id,
  'CNY',
  allocated.accepted_quantity,
  allocated.recognized_amount,
  allocated.received_at,
  allocated.received_by_employee_id
FROM allocated
ON CONFLICT (tenant_id, source_type, source_id) DO NOTHING;

INSERT INTO public.supplier_payable_events (
  tenant_id,
  project_id,
  cost_category_id,
  tenant_supplier_id,
  supplier_id,
  supplier_purchase_order_id,
  supplier_purchase_order_item_id,
  supplier_purchase_order_receipt_id,
  supplier_purchase_order_receipt_item_id,
  purchase_requisition_id,
  source_type,
  source_id,
  currency,
  accepted_quantity,
  amount,
  occurred_at,
  due_at,
  invoice_required_before_payment,
  created_by_employee_id
)
SELECT
  cost_event.tenant_id,
  cost_event.project_id,
  cost_event.cost_category_id,
  cost_event.tenant_supplier_id,
  cost_event.supplier_id,
  cost_event.supplier_purchase_order_id,
  cost_event.supplier_purchase_order_item_id,
  cost_event.supplier_purchase_order_receipt_id,
  cost_event.supplier_purchase_order_receipt_item_id,
  cost_event.purchase_requisition_id,
  cost_event.source_type,
  cost_event.source_id,
  cost_event.currency,
  cost_event.accepted_quantity,
  cost_event.amount,
  cost_event.occurred_at,
  cost_event.occurred_at + make_interval(
    days => purchase_order.settlement_term_days_snapshot
  ),
  purchase_order.invoice_required_before_payment_snapshot,
  cost_event.created_by_employee_id
FROM public.project_cost_events AS cost_event
JOIN public.supplier_purchase_orders AS purchase_order
  ON purchase_order.id = cost_event.supplier_purchase_order_id
  AND purchase_order.tenant_id = cost_event.tenant_id
ON CONFLICT (tenant_id, source_type, source_id) DO NOTHING;

WITH recognized AS MATERIALIZED (
  SELECT
    cost_event.tenant_id,
    cost_event.purchase_requisition_id,
    cost_event.cost_category_id,
    SUM(cost_event.amount)::numeric(18, 2) AS amount,
    MAX(cost_event.occurred_at) AS consumed_at
  FROM public.project_cost_events AS cost_event
  WHERE cost_event.purchase_requisition_id IS NOT NULL
  GROUP BY
    cost_event.tenant_id,
    cost_event.purchase_requisition_id,
    cost_event.cost_category_id
)
UPDATE public.project_cost_commitments AS commitment
SET recognized_amount = least(commitment.amount, recognized.amount),
    status = CASE
      WHEN recognized.amount >= commitment.amount THEN 'consumed'
      ELSE commitment.status
    END,
    consumed_at = CASE
      WHEN recognized.amount >= commitment.amount
      THEN recognized.consumed_at
      ELSE NULL
    END,
    updated_at = now()
FROM recognized
WHERE commitment.tenant_id = recognized.tenant_id
  AND commitment.source_id = recognized.purchase_requisition_id
  AND commitment.cost_category_id = recognized.cost_category_id
  AND commitment.status IN ('reserved', 'converted');

CREATE OR REPLACE FUNCTION public.list_supplier_accounting_legacy_gaps(
  p_tenant_id uuid,
  p_page integer,
  p_page_size integer
)
RETURNS TABLE (
  gap_type text,
  supplier_purchase_order_id uuid,
  supplier_purchase_order_item_id uuid,
  supplier_purchase_order_receipt_item_id uuid,
  reason text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_tenant_id IS NULL
    OR p_page IS NULL
    OR p_page < 1
    OR p_page_size IS NULL
    OR p_page_size NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_ACCOUNTING_LEGACY_GAP_PAGINATION_INVALID';
  END IF;

  RETURN QUERY
  WITH gaps AS MATERIALIZED (
    SELECT
      'legacy_default_snapshot'::text AS gap_type,
      purchase_order.id AS supplier_purchase_order_id,
      NULL::uuid AS supplier_purchase_order_item_id,
      NULL::uuid AS supplier_purchase_order_receipt_item_id,
      'commercial_terms_use_migration_time_relationship_default'::text
        AS reason
    FROM public.supplier_purchase_orders AS purchase_order
    WHERE purchase_order.tenant_id = p_tenant_id
      AND purchase_order.commercial_snapshot_source =
        'legacy_default_snapshot'

    UNION ALL

    SELECT
      'unmapped_order_item'::text AS gap_type,
      purchase_item.supplier_purchase_order_id,
      purchase_item.id AS supplier_purchase_order_item_id,
      NULL::uuid AS supplier_purchase_order_receipt_item_id,
      'cost_category_not_reliably_mapped'::text AS reason
    FROM public.supplier_purchase_order_items AS purchase_item
    WHERE purchase_item.tenant_id = p_tenant_id
      AND purchase_item.cost_category_id IS NULL

    UNION ALL

    SELECT
      'unfinancialized_receipt_item'::text AS gap_type,
      receipt_item.supplier_purchase_order_id,
      receipt_item.supplier_purchase_order_item_id,
      receipt_item.id AS supplier_purchase_order_receipt_item_id,
      CASE
        WHEN purchase_item.cost_category_id IS NULL
          THEN 'cost_category_not_reliably_mapped'
        ELSE 'accounting_fact_missing'
      END::text AS reason
    FROM public.supplier_purchase_order_receipt_items AS receipt_item
    JOIN public.supplier_purchase_order_items AS purchase_item
      ON purchase_item.id = receipt_item.supplier_purchase_order_item_id
      AND purchase_item.tenant_id = receipt_item.tenant_id
      AND purchase_item.supplier_purchase_order_id =
        receipt_item.supplier_purchase_order_id
    LEFT JOIN public.project_cost_events AS cost_event
      ON cost_event.tenant_id = receipt_item.tenant_id
      AND cost_event.source_type = 'supplier_purchase_receipt_item'
      AND cost_event.source_id = receipt_item.id
    LEFT JOIN public.supplier_payable_events AS payable_event
      ON payable_event.tenant_id = receipt_item.tenant_id
      AND payable_event.source_type = 'supplier_purchase_receipt_item'
      AND payable_event.source_id = receipt_item.id
    WHERE receipt_item.tenant_id = p_tenant_id
      AND receipt_item.accepted_quantity > 0
      AND (
        purchase_item.cost_category_id IS NULL
        OR cost_event.id IS NULL
        OR payable_event.id IS NULL
      )
  )
  SELECT
    gaps.gap_type,
    gaps.supplier_purchase_order_id,
    gaps.supplier_purchase_order_item_id,
    gaps.supplier_purchase_order_receipt_item_id,
    gaps.reason,
    COUNT(*) OVER () AS total_count
  FROM gaps
  ORDER BY
    gaps.gap_type,
    gaps.supplier_purchase_order_id,
    gaps.supplier_purchase_order_item_id,
    gaps.supplier_purchase_order_receipt_item_id NULLS FIRST
  LIMIT p_page_size
  OFFSET (p_page - 1) * p_page_size;
END;
$$;

REVOKE ALL ON FUNCTION
  public.list_supplier_accounting_legacy_gaps(uuid, integer, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.list_supplier_accounting_legacy_gaps(uuid, integer, integer)
TO service_role;

COMMIT;
