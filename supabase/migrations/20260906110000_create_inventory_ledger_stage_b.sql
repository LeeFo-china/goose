-- Stage B: inventory ledger and warehouse purchase receipt posting.
-- Rollback is forward-only: keep warehouse_procurement_enabled=false to stop
-- new warehouse purchases, then correct inventory through new remediation
-- migrations and reverse inventory transactions instead of deleting facts.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  supplier_sku_id uuid NOT NULL
    REFERENCES public.supplier_skus(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL,
  quantity_delta numeric(18, 4) NOT NULL,
  unit_cost numeric(18, 4) NOT NULL,
  value_delta numeric(18, 2) NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  project_id uuid NULL,
  cost_category_id uuid NULL,
  occurred_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transactions_warehouse_tenant_fkey
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES public.warehouses(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transactions_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transactions_category_tenant_fkey
    FOREIGN KEY (cost_category_id, tenant_id)
    REFERENCES public.finance_cost_categories(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transactions_employee_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_transactions_type_check CHECK (
    transaction_type IN (
      'purchase_receipt',
      'project_issue',
      'project_return',
      'supplier_return',
      'adjustment_in',
      'adjustment_out'
    )
  ),
  CONSTRAINT inventory_transactions_stage_b_source_check CHECK (
    source_type = 'supplier_purchase_receipt_item'
  ),
  CONSTRAINT inventory_transactions_purchase_receipt_quantity_check CHECK (
    (
      transaction_type = 'purchase_receipt'
      AND quantity_delta > 0
      AND value_delta >= 0
      AND project_id IS NULL
    )
    OR transaction_type <> 'purchase_receipt'
  ),
  CONSTRAINT inventory_transactions_unit_cost_check CHECK (unit_cost >= 0),
  CONSTRAINT inventory_transactions_source_unique_idx
    UNIQUE (tenant_id, source_type, source_id)
);

CREATE TABLE public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  supplier_sku_id uuid NOT NULL
    REFERENCES public.supplier_skus(id) ON DELETE RESTRICT,
  quantity_on_hand numeric(18, 4) NOT NULL DEFAULT 0,
  inventory_value numeric(18, 2) NOT NULL DEFAULT 0,
  average_unit_cost numeric(18, 4) NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_balances_warehouse_tenant_fkey
    FOREIGN KEY (warehouse_id, tenant_id)
    REFERENCES public.warehouses(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_quantity_check
    CHECK (quantity_on_hand >= 0),
  CONSTRAINT inventory_balances_value_check
    CHECK (inventory_value >= 0),
  CONSTRAINT inventory_balances_average_cost_check
    CHECK (average_unit_cost >= 0),
  CONSTRAINT inventory_balances_version_check CHECK (version > 0),
  CONSTRAINT inventory_balances_scope_key
    UNIQUE (tenant_id, warehouse_id, supplier_sku_id)
);

CREATE INDEX inventory_transactions_tenant_warehouse_occurred_idx
ON public.inventory_transactions(
  tenant_id,
  warehouse_id,
  occurred_at DESC,
  id DESC
);

CREATE INDEX inventory_transactions_tenant_sku_occurred_idx
ON public.inventory_transactions(
  tenant_id,
  supplier_sku_id,
  occurred_at DESC,
  id DESC
);

CREATE INDEX inventory_balances_tenant_warehouse_updated_idx
ON public.inventory_balances(
  tenant_id,
  warehouse_id,
  updated_at DESC,
  id DESC
);

CREATE OR REPLACE FUNCTION public.prevent_inventory_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVENTORY_FACT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_transactions_immutable
BEFORE UPDATE OR DELETE
ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_inventory_fact_mutation();

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inventory_transactions, public.inventory_balances
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.inventory_transactions, public.inventory_balances
TO service_role;

ALTER TABLE public.supplier_payable_events
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

UPDATE public.supplier_payable_events
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_payable_events
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_payable_events_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_payable_events_destination_check CHECK (
  (
    destination_type = 'project'
    AND project_id IS NOT NULL
    AND warehouse_id IS NULL
  )
  OR
  (
    destination_type = 'warehouse'
    AND project_id IS NULL
    AND warehouse_id IS NOT NULL
  )
);

CREATE INDEX supplier_payable_events_tenant_warehouse_due_idx
ON public.supplier_payable_events(
  tenant_id,
  warehouse_id,
  tenant_supplier_id,
  due_at,
  id
)
WHERE destination_type = 'warehouse';

ALTER TABLE public.supplier_payment_requests
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

UPDATE public.supplier_payment_requests
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_payment_requests
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_payment_requests_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_payment_requests_destination_check CHECK (
  (
    destination_type = 'project'
    AND project_id IS NOT NULL
    AND warehouse_id IS NULL
  )
  OR
  (
    destination_type = 'warehouse'
    AND project_id IS NULL
    AND warehouse_id IS NOT NULL
  )
);

CREATE INDEX supplier_payment_requests_tenant_warehouse_updated_idx
ON public.supplier_payment_requests(
  tenant_id,
  warehouse_id,
  tenant_supplier_id,
  updated_at DESC,
  id DESC
)
WHERE destination_type = 'warehouse';

ALTER TABLE public.supplier_payments
ADD COLUMN destination_type text,
ADD COLUMN warehouse_id uuid NULL;

UPDATE public.supplier_payments
SET destination_type = 'project'
WHERE destination_type IS NULL;

ALTER TABLE public.supplier_payments
ALTER COLUMN destination_type SET DEFAULT 'project',
ALTER COLUMN destination_type SET NOT NULL,
ALTER COLUMN project_id DROP NOT NULL,
ADD CONSTRAINT supplier_payments_warehouse_tenant_fkey
  FOREIGN KEY (warehouse_id, tenant_id)
  REFERENCES public.warehouses(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT supplier_payments_destination_check CHECK (
  (
    destination_type = 'project'
    AND project_id IS NOT NULL
    AND warehouse_id IS NULL
  )
  OR
  (
    destination_type = 'warehouse'
    AND project_id IS NULL
    AND warehouse_id IS NOT NULL
  )
);

CREATE INDEX supplier_payments_tenant_warehouse_paid_idx
ON public.supplier_payments(
  tenant_id,
  warehouse_id,
  tenant_supplier_id,
  paid_at DESC,
  id DESC
)
WHERE destination_type = 'warehouse';

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
) RENAME TO create_supplier_purchase_order_receipt_fulfillment_v2;

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
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  v_result :=
    public.create_supplier_purchase_order_receipt_fulfillment_v2(
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

  IF v_order.destination_type = 'project' THEN
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
      destination_type,
      project_id,
      warehouse_id,
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
      'project',
      cost_event.project_id,
      NULL,
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

  ELSIF v_order.destination_type = 'warehouse' THEN
    IF v_order.warehouse_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WAREHOUSE_NOT_FOUND';
    END IF;

    PERFORM 1
    FROM public.warehouses AS warehouse
    WHERE warehouse.id = v_order.warehouse_id
      AND warehouse.tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WAREHOUSE_NOT_FOUND';
    END IF;

    PERFORM 1
    FROM public.warehouses AS warehouse
    WHERE warehouse.id = v_order.warehouse_id
      AND warehouse.tenant_id = p_tenant_id
      AND warehouse.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WAREHOUSE_INACTIVE';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inventory_transactions AS inventory_transaction
      JOIN public.supplier_purchase_order_receipt_items AS receipt_item
        ON receipt_item.id = inventory_transaction.source_id
      WHERE inventory_transaction.tenant_id = p_tenant_id
        AND inventory_transaction.source_type =
          'supplier_purchase_receipt_item'
        AND receipt_item.receipt_id = p_receipt_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'INVENTORY_SOURCE_CONFLICT';
    END IF;

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

    WITH previous AS MATERIALIZED (
      SELECT
        inventory_transaction.source_id AS receipt_item_id,
        COALESCE(SUM(inventory_transaction.value_delta), 0)::numeric(18, 2)
          AS previous_posted_amount
      FROM public.inventory_transactions AS inventory_transaction
      JOIN public.supplier_purchase_order_receipt_items AS receipt_item
        ON receipt_item.id = inventory_transaction.source_id
      WHERE inventory_transaction.tenant_id = p_tenant_id
        AND receipt_item.supplier_purchase_order_id = p_order_id
      GROUP BY inventory_transaction.source_id
    ),
    financial_line AS MATERIALIZED (
      SELECT
        receipt_item.id AS receipt_item_id,
        receipt_item.accepted_quantity,
        purchase_item.quantity AS ordered_quantity,
        purchase_item.total_amount AS line_total_amount,
        COALESCE(previous.previous_posted_amount, 0)
          AS previous_posted_amount,
        item_fulfillment.accepted_quantity
          AS cumulative_accepted_quantity,
        purchase_item.id AS purchase_order_item_id,
        purchase_item.supplier_sku_id,
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
        ON previous.receipt_item_id = receipt_item.id
      WHERE receipt_item.receipt_id = p_receipt_id
        AND receipt_item.tenant_id = p_tenant_id
        AND receipt_item.accepted_quantity > 0
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
          ) - financial_line.previous_posted_amount,
          0
        )::numeric(18, 2) AS recognized_amount
      FROM financial_line
    ),
    inserted_transactions AS MATERIALIZED (
      INSERT INTO public.inventory_transactions (
        tenant_id,
        warehouse_id,
        supplier_sku_id,
        transaction_type,
        quantity_delta,
        unit_cost,
        value_delta,
        source_type,
        source_id,
        project_id,
        cost_category_id,
        occurred_at,
        created_by_employee_id
      )
      SELECT
        p_tenant_id,
        v_order.warehouse_id,
        allocated.supplier_sku_id,
        'purchase_receipt',
        allocated.accepted_quantity,
        CASE
          WHEN allocated.accepted_quantity > 0
          THEN round(
            allocated.recognized_amount / allocated.accepted_quantity,
            4
          )
          ELSE 0
        END,
        allocated.recognized_amount,
        'supplier_purchase_receipt_item',
        allocated.receipt_item_id,
        NULL,
        allocated.cost_category_id,
        p_received_at,
        p_actor_employee_id
      FROM allocated
      RETURNING warehouse_id, supplier_sku_id, quantity_delta, value_delta
    ),
    balance_delta AS MATERIALIZED (
      SELECT
        warehouse_id,
        supplier_sku_id,
        SUM(quantity_delta)::numeric(18, 4) AS quantity_delta,
        SUM(value_delta)::numeric(18, 2) AS value_delta
      FROM inserted_transactions
      GROUP BY warehouse_id, supplier_sku_id
    )
    INSERT INTO public.inventory_balances (
      tenant_id,
      warehouse_id,
      supplier_sku_id,
      quantity_on_hand,
      inventory_value,
      average_unit_cost
    )
    SELECT
      p_tenant_id,
      balance_delta.warehouse_id,
      balance_delta.supplier_sku_id,
      balance_delta.quantity_delta,
      balance_delta.value_delta,
      CASE
        WHEN balance_delta.quantity_delta > 0
        THEN round(balance_delta.value_delta / balance_delta.quantity_delta, 4)
        ELSE 0
      END
    FROM balance_delta
    ON CONFLICT (tenant_id, warehouse_id, supplier_sku_id)
    DO UPDATE SET
      quantity_on_hand =
        inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand,
      inventory_value =
        inventory_balances.inventory_value + EXCLUDED.inventory_value,
      average_unit_cost = CASE
        WHEN inventory_balances.quantity_on_hand +
          EXCLUDED.quantity_on_hand > 0
        THEN round(
          (
            inventory_balances.inventory_value +
            EXCLUDED.inventory_value
          ) / (
            inventory_balances.quantity_on_hand +
            EXCLUDED.quantity_on_hand
          ),
          4
        )
        ELSE 0
      END,
      version = inventory_balances.version + 1,
      updated_at = now();

    INSERT INTO public.supplier_payable_events (
      tenant_id,
      destination_type,
      project_id,
      warehouse_id,
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
      p_tenant_id,
      'warehouse',
      NULL,
      v_order.warehouse_id,
      purchase_item.cost_category_id,
      v_order.tenant_supplier_id,
      v_order.supplier_id,
      p_order_id,
      purchase_item.id,
      p_receipt_id,
      receipt_item.id,
      v_order.purchase_requisition_id,
      'supplier_purchase_receipt_item',
      receipt_item.id,
      'CNY',
      receipt_item.accepted_quantity,
      inventory_transaction.value_delta,
      p_received_at,
      p_received_at + make_interval(
        days => v_order.settlement_term_days_snapshot
      ),
      v_order.invoice_required_before_payment_snapshot,
      p_actor_employee_id
    FROM public.inventory_transactions AS inventory_transaction
    JOIN public.supplier_purchase_order_receipt_items AS receipt_item
      ON receipt_item.id = inventory_transaction.source_id
      AND receipt_item.tenant_id = inventory_transaction.tenant_id
    JOIN public.supplier_purchase_order_items AS purchase_item
      ON purchase_item.id = receipt_item.supplier_purchase_order_item_id
      AND purchase_item.tenant_id = receipt_item.tenant_id
      AND purchase_item.supplier_purchase_order_id =
        receipt_item.supplier_purchase_order_id
    WHERE inventory_transaction.tenant_id = p_tenant_id
      AND inventory_transaction.source_type =
        'supplier_purchase_receipt_item'
      AND receipt_item.receipt_id = p_receipt_id
    ON CONFLICT (tenant_id, source_type, source_id) DO NOTHING;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PURCHASE_DESTINATION_INVALID';
  END IF;

  RETURN v_result;
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM IN (
      'SUPPLIER_PURCHASE_ORDER_COST_CATEGORY_REQUIRED',
      'WAREHOUSE_NOT_FOUND',
      'WAREHOUSE_INACTIVE',
      'PURCHASE_DESTINATION_INVALID',
      'INVENTORY_SOURCE_CONFLICT'
    ) THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', SQLERRM
      );
    END IF;
    RAISE;
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'INVENTORY_SOURCE_CONFLICT'
    );
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

CREATE OR REPLACE FUNCTION public.list_inventory_balances(
  p_tenant_id uuid,
  p_warehouse_id uuid,
  p_keyword text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := greatest(p_page, 1);
  v_page_size integer := least(greatest(p_page_size, 1), 100);
  v_offset integer := (v_page - 1) * v_page_size;
  v_keyword text := NULLIF(btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
BEGIN
  WITH filtered AS MATERIALIZED (
    SELECT
      balance.id,
      balance.tenant_id,
      balance.warehouse_id,
      warehouse.name AS warehouse_name,
      balance.supplier_sku_id,
      supplier_sku.sku_code,
      supplier_sku.name AS sku_name,
      supplier_sku.specification,
      supplier_sku.model,
      balance.quantity_on_hand,
      balance.inventory_value,
      balance.average_unit_cost,
      balance.version,
      balance.updated_at
    FROM public.inventory_balances AS balance
    JOIN public.warehouses AS warehouse
      ON warehouse.id = balance.warehouse_id
      AND warehouse.tenant_id = balance.tenant_id
    JOIN public.supplier_skus AS supplier_sku
      ON supplier_sku.id = balance.supplier_sku_id
    WHERE balance.tenant_id = p_tenant_id
      AND (p_warehouse_id IS NULL OR balance.warehouse_id = p_warehouse_id)
      AND (
        v_keyword IS NULL
        OR supplier_sku.name ILIKE '%' || v_keyword || '%'
        OR supplier_sku.sku_code ILIKE '%' || v_keyword || '%'
        OR warehouse.name ILIKE '%' || v_keyword || '%'
      )
  ),
  counted AS MATERIALIZED (
    SELECT COUNT(*)::integer AS total
    FROM filtered
  ),
  page_rows AS MATERIALIZED (
    SELECT *
    FROM filtered
    ORDER BY updated_at DESC, id DESC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    counted.total,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'tenant_id', page_rows.tenant_id,
          'warehouse_id', page_rows.warehouse_id,
          'warehouse_name', page_rows.warehouse_name,
          'supplier_sku_id', page_rows.supplier_sku_id,
          'sku_code', page_rows.sku_code,
          'sku_name', page_rows.sku_name,
          'specification', page_rows.specification,
          'model', page_rows.model,
          'quantity_on_hand', page_rows.quantity_on_hand::text,
          'inventory_value', page_rows.inventory_value::text,
          'average_unit_cost', page_rows.average_unit_cost::text,
          'version', page_rows.version,
          'updated_at', page_rows.updated_at
        )
        ORDER BY page_rows.updated_at DESC, page_rows.id DESC
      ) FILTER (WHERE page_rows.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM counted
  LEFT JOIN page_rows ON true
  GROUP BY counted.total;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_inventory_balances(
  uuid,
  uuid,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_balances(
  uuid,
  uuid,
  text,
  integer,
  integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.list_inventory_transactions(
  p_tenant_id uuid,
  p_warehouse_id uuid,
  p_supplier_sku_id uuid,
  p_transaction_type text,
  p_page integer,
  p_page_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := greatest(p_page, 1);
  v_page_size integer := least(greatest(p_page_size, 1), 100);
  v_offset integer := (v_page - 1) * v_page_size;
  v_total integer;
  v_items jsonb;
BEGIN
  WITH filtered AS MATERIALIZED (
    SELECT
      transaction.id,
      transaction.tenant_id,
      transaction.warehouse_id,
      warehouse.name AS warehouse_name,
      transaction.supplier_sku_id,
      supplier_sku.sku_code,
      supplier_sku.name AS sku_name,
      transaction.transaction_type,
      transaction.quantity_delta,
      transaction.unit_cost,
      transaction.value_delta,
      transaction.source_type,
      transaction.source_id,
      transaction.project_id,
      transaction.cost_category_id,
      transaction.occurred_at,
      transaction.created_by_employee_id,
      employee.name AS created_by_employee_name,
      transaction.created_at
    FROM public.inventory_transactions AS transaction
    JOIN public.warehouses AS warehouse
      ON warehouse.id = transaction.warehouse_id
      AND warehouse.tenant_id = transaction.tenant_id
    JOIN public.supplier_skus AS supplier_sku
      ON supplier_sku.id = transaction.supplier_sku_id
    JOIN public.employees AS employee
      ON employee.id = transaction.created_by_employee_id
      AND employee.tenant_id = transaction.tenant_id
    WHERE transaction.tenant_id = p_tenant_id
      AND (p_warehouse_id IS NULL OR transaction.warehouse_id = p_warehouse_id)
      AND (
        p_supplier_sku_id IS NULL
        OR transaction.supplier_sku_id = p_supplier_sku_id
      )
      AND (
        p_transaction_type IS NULL
        OR transaction.transaction_type = p_transaction_type
      )
  ),
  counted AS MATERIALIZED (
    SELECT COUNT(*)::integer AS total
    FROM filtered
  ),
  page_rows AS MATERIALIZED (
    SELECT *
    FROM filtered
    ORDER BY occurred_at DESC, id DESC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    counted.total,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'tenant_id', page_rows.tenant_id,
          'warehouse_id', page_rows.warehouse_id,
          'warehouse_name', page_rows.warehouse_name,
          'supplier_sku_id', page_rows.supplier_sku_id,
          'sku_code', page_rows.sku_code,
          'sku_name', page_rows.sku_name,
          'transaction_type', page_rows.transaction_type,
          'quantity_delta', page_rows.quantity_delta::text,
          'unit_cost', page_rows.unit_cost::text,
          'value_delta', page_rows.value_delta::text,
          'source_type', page_rows.source_type,
          'source_id', page_rows.source_id,
          'project_id', page_rows.project_id,
          'cost_category_id', page_rows.cost_category_id,
          'occurred_at', page_rows.occurred_at,
          'created_by_employee_id', page_rows.created_by_employee_id,
          'created_by_employee_name', page_rows.created_by_employee_name,
          'created_at', page_rows.created_at
        )
        ORDER BY page_rows.occurred_at DESC, page_rows.id DESC
      ) FILTER (WHERE page_rows.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM counted
  LEFT JOIN page_rows ON true
  GROUP BY counted.total;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_inventory_transactions(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_inventory_transactions(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  integer
) TO service_role;

COMMIT;
