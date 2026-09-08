-- Warehouse receipts create inventory and supplier payables, not project costs.
-- Read the existing fulfillment accumulator, which preserves cumulative receipt
-- tax/rounding rules for both project and warehouse destinations.
-- Rollback: restore the previous function body from 20260731110000 in a forward
-- migration. No business facts are modified; rollback would restore the display bug.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_supplier_purchase_order_financial_summary(
  p_tenant_id uuid,
  p_supplier_purchase_order_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH accepted AS (
    -- supplier_purchase_order_fulfillments_order_key bounds this to one row.
    SELECT COALESCE(SUM(fulfillment.accepted_total_amount), 0) AS amount
    FROM public.supplier_purchase_order_fulfillments AS fulfillment
    WHERE fulfillment.tenant_id = p_tenant_id
      AND fulfillment.supplier_purchase_order_id =
        p_supplier_purchase_order_id
  ),
  payables AS (
    SELECT COALESCE(SUM(payable.amount), 0) AS amount
    FROM public.supplier_payable_events AS payable
    WHERE payable.tenant_id = p_tenant_id
      AND payable.supplier_purchase_order_id =
        p_supplier_purchase_order_id
  ),
  paid AS (
    SELECT
      COALESCE(SUM(payment_allocation.amount), 0) AS amount
    FROM public.supplier_payment_allocations AS payment_allocation
    JOIN public.supplier_payable_events AS payable
      ON payable.id = payment_allocation.payable_event_id
      AND payable.tenant_id = payment_allocation.tenant_id
    WHERE payment_allocation.tenant_id = p_tenant_id
      AND payable.supplier_purchase_order_id =
        p_supplier_purchase_order_id
  ),
  reserved AS (
    SELECT COALESCE(
      SUM(
        GREATEST(
          allocation.requested_amount - allocation.paid_amount,
          0
        )
      ),
      0
    ) AS amount
    FROM public.supplier_payment_request_allocations AS allocation
    JOIN public.supplier_payment_requests AS payment_request
      ON payment_request.id = allocation.payment_request_id
      AND payment_request.tenant_id = allocation.tenant_id
    JOIN public.supplier_payable_events AS payable
      ON payable.id = allocation.payable_event_id
      AND payable.tenant_id = allocation.tenant_id
    WHERE allocation.tenant_id = p_tenant_id
      AND payable.supplier_purchase_order_id =
        p_supplier_purchase_order_id
      AND payment_request.status IN (
        'pending_approval',
        'approved',
        'partially_paid'
      )
  )
  SELECT jsonb_build_object(
    'purchase_order_id', p_supplier_purchase_order_id,
    'accepted_amount',
      round(accepted.amount, 2)::numeric(18, 2)::text,
    'payable_amount',
      round(payables.amount, 2)::numeric(18, 2)::text,
    'reserved_request_amount',
      round(reserved.amount, 2)::numeric(18, 2)::text,
    'paid_amount',
      round(paid.amount, 2)::numeric(18, 2)::text,
    'open_amount',
      round(
        GREATEST(payables.amount - paid.amount, 0),
        2
      )::numeric(18, 2)::text,
    'available_to_request_amount',
      round(
        GREATEST(
          payables.amount - paid.amount - reserved.amount,
          0
        ),
        2
      )::numeric(18, 2)::text
  )
  FROM accepted
  CROSS JOIN payables
  CROSS JOIN paid
  CROSS JOIN reserved;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_purchase_order_financial_summary(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_supplier_purchase_order_financial_summary(uuid, uuid)
TO service_role;

COMMIT;
