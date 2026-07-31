CREATE FUNCTION public.get_supplier_payables_by_ids(
  p_tenant_id uuid,
  p_visible_project_ids uuid[],
  p_payable_event_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_distinct_count integer;
BEGIN
  IF p_tenant_id IS NULL
    OR p_payable_event_ids IS NULL
    OR NOT cardinality(p_payable_event_ids) BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_BATCH_IDS_INVALID';
  END IF;

  SELECT COUNT(DISTINCT requested_id)
  INTO v_distinct_count
  FROM unnest(p_payable_event_ids) AS requested(requested_id);

  IF v_distinct_count <> cardinality(p_payable_event_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_BATCH_IDS_INVALID';
  END IF;

  IF p_visible_project_ids IS NOT NULL
    AND cardinality(p_visible_project_ids) = 0
  THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH target_payables AS MATERIALIZED (
    SELECT
      payable.id,
      payable.project_id,
      payable.tenant_supplier_id,
      payable.supplier_id,
      payable.supplier_purchase_order_id,
      payable.supplier_purchase_order_receipt_id,
      payable.supplier_purchase_order_receipt_item_id,
      project.name AS project_name,
      supplier.name AS supplier_name,
      purchase_order.order_no AS purchase_order_no,
      receipt.receipt_no,
      payable.invoice_required_before_payment,
      payable.amount,
      payable.currency,
      payable.occurred_at,
      payable.due_at
    FROM public.supplier_payable_events AS payable
    JOIN public.projects AS project
      ON project.id = payable.project_id
      AND project.tenant_id = payable.tenant_id
    JOIN public.suppliers AS supplier
      ON supplier.id = payable.supplier_id
    JOIN public.supplier_purchase_orders AS purchase_order
      ON purchase_order.id = payable.supplier_purchase_order_id
      AND purchase_order.tenant_id = payable.tenant_id
    JOIN public.supplier_purchase_order_receipts AS receipt
      ON receipt.id = payable.supplier_purchase_order_receipt_id
      AND receipt.tenant_id = payable.tenant_id
    WHERE payable.tenant_id = p_tenant_id
      AND payable.id = ANY (p_payable_event_ids)
      AND (
        p_visible_project_ids IS NULL
        OR payable.project_id = ANY (p_visible_project_ids)
      )
    ORDER BY payable.id
    LIMIT 100
  ),
  paid AS MATERIALIZED (
    SELECT
      allocation.payable_event_id,
      SUM(allocation.amount)::numeric(18, 2) AS paid_amount
    FROM public.supplier_payment_allocations AS allocation
    JOIN target_payables AS target
      ON target.id = allocation.payable_event_id
    WHERE allocation.tenant_id = p_tenant_id
    GROUP BY allocation.payable_event_id
  ),
  reserved AS MATERIALIZED (
    SELECT
      allocation.payable_event_id,
      SUM(
        allocation.requested_amount - allocation.paid_amount
      )::numeric(18, 2) AS reserved_amount
    FROM public.supplier_payment_request_allocations AS allocation
    JOIN target_payables AS target
      ON target.id = allocation.payable_event_id
    JOIN public.supplier_payment_requests AS payment_request
      ON payment_request.id = allocation.payment_request_id
      AND payment_request.tenant_id = allocation.tenant_id
    WHERE allocation.tenant_id = p_tenant_id
      AND payment_request.status IN (
        'pending_approval',
        'approved',
        'partially_paid'
      )
    GROUP BY allocation.payable_event_id
  ),
  facts AS MATERIALIZED (
    SELECT
      payable.*,
      COALESCE(paid.paid_amount, 0)::numeric(18, 2) AS paid_amount,
      COALESCE(reserved.reserved_amount, 0)::numeric(18, 2)
        AS reserved_amount,
      (
        payable.amount - COALESCE(paid.paid_amount, 0)
      )::numeric(18, 2) AS open_amount
    FROM target_payables AS payable
    LEFT JOIN paid ON paid.payable_event_id = payable.id
    LEFT JOIN reserved ON reserved.payable_event_id = payable.id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', facts.id,
        'project_id', facts.project_id,
        'tenant_supplier_id', facts.tenant_supplier_id,
        'supplier_id', facts.supplier_id,
        'supplier_purchase_order_id', facts.supplier_purchase_order_id,
        'receipt_id', facts.supplier_purchase_order_receipt_id,
        'receipt_item_id', facts.supplier_purchase_order_receipt_item_id,
        'project_name', facts.project_name,
        'supplier_name', facts.supplier_name,
        'purchase_order_no', facts.purchase_order_no,
        'receipt_no', facts.receipt_no,
        'invoice_required_before_payment',
          facts.invoice_required_before_payment,
        'amount', facts.amount::text,
        'paid_amount', facts.paid_amount::text,
        'reserved_amount', facts.reserved_amount::text,
        'open_amount', facts.open_amount::text,
        'currency', facts.currency,
        'occurred_at', facts.occurred_at,
        'due_at', facts.due_at,
        'status', CASE
          WHEN facts.open_amount = 0 THEN 'paid'
          WHEN facts.due_at < now() THEN 'overdue'
          WHEN facts.paid_amount > 0 THEN 'partially_paid'
          WHEN facts.reserved_amount > 0 THEN 'reserved'
          ELSE 'open'
        END
      )
      ORDER BY facts.id
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM facts;

  RETURN v_items;
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_supplier_payables_by_ids(uuid, uuid[], uuid[])
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_supplier_payables_by_ids(uuid, uuid[], uuid[])
TO service_role;
