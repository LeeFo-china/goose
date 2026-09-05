-- Rollback: deploy a forward migration restoring awaiting_receipt to
-- shipment-backed statuses only, restoring received_quantity <= shipped_quantity
-- constraints, and removing calls to
-- ensure_supplier_purchase_order_fulfillment_from_share_link from the API.
-- This migration preserves purchase order, share-link, fulfillment, shipment,
-- and receipt audit facts.

BEGIN;

ALTER TABLE public.supplier_purchase_order_fulfillments
DROP CONSTRAINT supplier_purchase_order_fulfillments_quantities_check;

ALTER TABLE public.supplier_purchase_order_fulfillments
ADD CONSTRAINT supplier_purchase_order_fulfillments_quantities_check CHECK (
  ordered_quantity >= 0
  AND shipped_quantity >= 0
  AND received_quantity >= 0
  AND accepted_quantity >= 0
  AND rejected_quantity >= 0
  AND received_quantity <= ordered_quantity
  AND shipped_quantity <= ordered_quantity
  AND accepted_quantity + rejected_quantity = received_quantity
);

ALTER TABLE public.supplier_purchase_order_item_fulfillments
DROP CONSTRAINT supplier_purchase_order_item_fulfillments_quantities_check;

ALTER TABLE public.supplier_purchase_order_item_fulfillments
ADD CONSTRAINT supplier_purchase_order_item_fulfillments_quantities_check CHECK (
  ordered_quantity > 0
  AND shipped_quantity >= 0
  AND received_quantity >= 0
  AND accepted_quantity >= 0
  AND rejected_quantity >= 0
  AND received_quantity <= ordered_quantity
  AND shipped_quantity <= ordered_quantity
  AND accepted_quantity + rejected_quantity = received_quantity
);

CREATE OR REPLACE FUNCTION public.ensure_supplier_purchase_order_fulfillment_from_share_link(
  p_share_link_id uuid,
  p_confirmed_at timestamptz,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_share_link public.supplier_purchase_order_share_links%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_existing_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_employee record;
  v_result jsonb;
  v_remark text := NULLIF(btrim(COALESCE(p_remark, '')), '');
BEGIN
  IF p_share_link_id IS NULL
    OR p_confirmed_at IS NULL
    OR char_length(v_remark) > 500
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_SHARE_CONFIRMATION_VALIDATION_ERROR'
    );
  END IF;

  SELECT share_link.*
  INTO v_share_link
  FROM public.supplier_purchase_order_share_links AS share_link
  WHERE share_link.id = p_share_link_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_SHARE_LINK_NOT_FOUND'
    );
  END IF;

  IF v_share_link.status <> 'active'
    OR v_share_link.expires_at <= now()
    OR v_share_link.confirmed_at IS NULL
  THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = v_share_link.supplier_purchase_order_id
    AND purchase_order.tenant_id = v_share_link.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'submitted' THEN
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  SELECT fulfillment.*
  INTO v_existing_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id =
      v_share_link.supplier_purchase_order_id
    AND fulfillment.tenant_id = v_share_link.tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  IF v_existing_fulfillment.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_confirmed',
      'fulfillment_id', v_existing_fulfillment.id,
      'version', v_existing_fulfillment.version
    );
  END IF;

  SELECT employee.id, employee.user_id
  INTO v_employee
  FROM public.employees AS employee
  WHERE employee.id = v_share_link.created_by_employee_id
    AND employee.tenant_id = v_share_link.tenant_id
    AND employee.status = 'active'
    AND employee.user_id IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PROXY_ACTOR_INVALID'
    );
  END IF;

  v_result := public.confirm_supplier_purchase_order_fulfillment(
    v_order.id,
    v_order.tenant_id,
    v_order.version,
    COALESCE(v_share_link.confirmed_at, p_confirmed_at),
    COALESCE(v_share_link.confirm_remark, v_remark, '供应商已确认采购单'),
    v_employee.user_id,
    v_employee.id,
    'supplier-share-confirm:' || v_share_link.id::text
  );

  IF v_result ->> 'error_code' =
    'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED'
  THEN
    RETURN jsonb_build_object('status', 'already_confirmed');
  END IF;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_supplier_purchase_orders(
  p_tenant_id uuid,
  p_visible_project_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_status text DEFAULT NULL,
  p_fulfillment_status text DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_tenant_supplier_id uuid DEFAULT NULL,
  p_keyword text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(1, COALESCE(p_page, 1));
  v_page_size integer := LEAST(100, GREATEST(1, COALESCE(p_page_size, 20)));
  v_offset integer;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_keyword text := NULLIF(btrim(COALESCE(p_keyword, '')), '');
BEGIN
  IF p_status IS NOT NULL
    AND p_status NOT IN ('draft', 'submitted', 'cancelled')
  THEN
    RAISE EXCEPTION 'SUPPLIER_PURCHASE_ORDER_STATUS_INVALID';
  END IF;

  IF p_fulfillment_status IS NOT NULL
    AND p_fulfillment_status NOT IN (
      'unconfirmed',
      'confirmed',
      'partially_shipped',
      'shipped',
      'partially_received',
      'received',
      'received_with_variance',
      'cancelled',
      'awaiting_receipt'
    )
  THEN
    RAISE EXCEPTION 'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATUS_INVALID';
  END IF;

  IF p_visible_project_ids IS NOT NULL
    AND COALESCE(array_length(p_visible_project_ids, 1), 0) = 0
  THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', v_page,
      'page_size', v_page_size
    );
  END IF;

  IF p_project_id IS NOT NULL
    AND p_visible_project_ids IS NOT NULL
    AND NOT (p_project_id = ANY(p_visible_project_ids))
  THEN
    RETURN jsonb_build_object(
      'items', '[]'::jsonb,
      'total', 0,
      'page', v_page,
      'page_size', v_page_size
    );
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  WITH filtered AS (
    SELECT
      purchase_order.id,
      purchase_order.tenant_id,
      purchase_order.project_id,
      purchase_order.tenant_supplier_id,
      purchase_order.supplier_id,
      purchase_order.order_no,
      purchase_order.status,
      purchase_order.currency,
      purchase_order.expected_delivery_date,
      purchase_order.remark,
      purchase_order.priced_at,
      purchase_order.subtotal_amount,
      purchase_order.tax_amount,
      purchase_order.total_amount,
      purchase_order.purchase_requisition_id,
      purchase_order.purchase_batch_id,
      purchase_order.version,
      purchase_order.created_by_employee_id,
      purchase_order.creator_snapshot,
      purchase_order.updated_by_employee_id,
      purchase_order.submitted_by_employee_id,
      purchase_order.submitted_at,
      purchase_order.applicant_snapshot,
      purchase_order.cancelled_by_employee_id,
      purchase_order.cancelled_at,
      purchase_order.cancel_reason,
      purchase_order.created_at,
      purchase_order.updated_at,
      CASE
        WHEN purchase_order.status = 'cancelled' THEN 'cancelled'
        WHEN fulfillment.status IS NULL THEN 'unconfirmed'
        ELSE fulfillment.status
      END AS fulfillment_status,
      project.name AS project_name,
      project.status AS project_status,
      supplier.code AS supplier_code,
      supplier.name AS supplier_name,
      supplier.legal_name AS supplier_legal_name,
      supplier.onboarding_status AS supplier_onboarding_status,
      supplier.operational_status AS supplier_operational_status,
      requisition.request_no AS requisition_request_no,
      requisition.status AS requisition_status,
      requisition.budget_status AS requisition_budget_status,
      batch.id AS batch_id,
      batch.status AS batch_status,
      batch.submitted_by_employee_id AS batch_submitted_by_employee_id,
      batch.submitted_at AS batch_submitted_at,
      batch.reviewed_by_employee_id AS batch_reviewed_by_employee_id,
      batch.reviewed_at AS batch_reviewed_at,
      batch.review_remark AS batch_review_remark,
      batch.applicant_snapshot AS batch_applicant_snapshot,
      batch.last_reviewer_snapshot AS batch_last_reviewer_snapshot
    FROM public.supplier_purchase_orders AS purchase_order
    JOIN public.projects AS project
      ON project.id = purchase_order.project_id
    JOIN public.suppliers AS supplier
      ON supplier.id = purchase_order.supplier_id
    LEFT JOIN public.supplier_purchase_order_fulfillments AS fulfillment
      ON fulfillment.supplier_purchase_order_id = purchase_order.id
      AND fulfillment.tenant_id = purchase_order.tenant_id
    LEFT JOIN LATERAL (
      SELECT TRUE AS is_confirmed
      FROM public.supplier_purchase_order_share_links AS share_link
      WHERE share_link.tenant_id = purchase_order.tenant_id
        AND share_link.supplier_purchase_order_id = purchase_order.id
        AND share_link.status = 'active'
        AND share_link.expires_at > now()
        AND share_link.confirmed_at IS NOT NULL
      ORDER BY share_link.confirmed_at DESC, share_link.id DESC
      LIMIT 1
    ) AS share_confirmation ON TRUE
    LEFT JOIN public.supplier_purchase_requisitions AS requisition
      ON requisition.id = purchase_order.purchase_requisition_id
      AND requisition.tenant_id = purchase_order.tenant_id
    LEFT JOIN public.supplier_purchase_batches AS batch
      ON batch.id = purchase_order.purchase_batch_id
      AND batch.tenant_id = purchase_order.tenant_id
    WHERE purchase_order.tenant_id = p_tenant_id
      AND (
        p_visible_project_ids IS NULL
        OR purchase_order.project_id = ANY(p_visible_project_ids)
      )
      AND (p_project_id IS NULL OR purchase_order.project_id = p_project_id)
      AND (p_status IS NULL OR purchase_order.status = p_status)
      AND (
        p_tenant_supplier_id IS NULL
        OR purchase_order.tenant_supplier_id = p_tenant_supplier_id
      )
      AND (v_keyword IS NULL OR purchase_order.order_no ILIKE '%' || v_keyword || '%')
      AND (
        p_fulfillment_status IS NULL
        OR (
          p_fulfillment_status = 'unconfirmed'
          AND purchase_order.status = 'submitted'
          AND fulfillment.id IS NULL
          AND NOT COALESCE(share_confirmation.is_confirmed, false)
        )
        OR (
          p_fulfillment_status = 'cancelled'
          AND (
            purchase_order.status = 'cancelled'
            OR fulfillment.status = 'cancelled'
          )
        )
        OR (
          p_fulfillment_status = 'awaiting_receipt'
          AND purchase_order.status = 'submitted'
          AND (
            fulfillment.status IN ('confirmed', 'partially_shipped', 'shipped')
            OR (
              fulfillment.id IS NULL
              AND COALESCE(share_confirmation.is_confirmed, false)
            )
          )
        )
        OR (
          p_fulfillment_status NOT IN (
            'unconfirmed',
            'cancelled',
            'awaiting_receipt'
          )
          AND fulfillment.status = p_fulfillment_status
        )
      )
  ),
  counted AS (
    SELECT count(*) AS total FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY updated_at DESC, id DESC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT counted.total,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', paged.id,
        'tenant_id', paged.tenant_id,
        'project_id', paged.project_id,
        'tenant_supplier_id', paged.tenant_supplier_id,
        'supplier_id', paged.supplier_id,
        'order_no', paged.order_no,
        'status', paged.status,
        'currency', paged.currency,
        'expected_delivery_date', paged.expected_delivery_date,
        'remark', paged.remark,
        'priced_at', paged.priced_at,
        'subtotal_amount', paged.subtotal_amount::text,
        'tax_amount', paged.tax_amount::text,
        'total_amount', paged.total_amount::text,
        'purchase_requisition_id', paged.purchase_requisition_id,
        'purchase_batch_id', paged.purchase_batch_id,
        'version', paged.version,
        'created_by_employee_id', paged.created_by_employee_id,
        'creator_snapshot', paged.creator_snapshot,
        'updated_by_employee_id', paged.updated_by_employee_id,
        'submitted_by_employee_id', paged.submitted_by_employee_id,
        'submitted_at', paged.submitted_at,
        'applicant_snapshot', paged.applicant_snapshot,
        'cancelled_by_employee_id', paged.cancelled_by_employee_id,
        'cancelled_at', paged.cancelled_at,
        'cancel_reason', paged.cancel_reason,
        'created_at', paged.created_at,
        'updated_at', paged.updated_at,
        'fulfillment_status', paged.fulfillment_status,
        'project', jsonb_build_object(
          'id', paged.project_id,
          'name', paged.project_name,
          'status', paged.project_status
        ),
        'supplier', jsonb_build_object(
          'id', paged.supplier_id,
          'code', paged.supplier_code,
          'name', paged.supplier_name,
          'legal_name', paged.supplier_legal_name,
          'onboarding_status', paged.supplier_onboarding_status,
          'operational_status', paged.supplier_operational_status
        ),
        'purchase_requisition',
          CASE
            WHEN paged.purchase_requisition_id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', paged.purchase_requisition_id,
              'request_no', paged.requisition_request_no,
              'status', paged.requisition_status,
              'budget_status', paged.requisition_budget_status
            )
          END,
        'purchase_batch',
          CASE
            WHEN paged.batch_id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', paged.batch_id,
              'status', paged.batch_status,
              'submitted_by_employee_id', paged.batch_submitted_by_employee_id,
              'submitted_at', paged.batch_submitted_at,
              'reviewed_by_employee_id', paged.batch_reviewed_by_employee_id,
              'reviewed_at', paged.batch_reviewed_at,
              'review_remark', paged.batch_review_remark,
              'applicant_snapshot', paged.batch_applicant_snapshot,
              'last_reviewer_snapshot', paged.batch_last_reviewer_snapshot
            )
          END
      )
      ORDER BY paged.updated_at DESC, paged.id DESC
    ) FILTER (WHERE paged.id IS NOT NULL), '[]'::jsonb)
  INTO v_total, v_items
  FROM counted
  LEFT JOIN paged ON TRUE
  GROUP BY counted.total;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

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
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_normalized_items jsonb;
  v_requested_count integer;
  v_distinct_count integer;
  v_has_duplicates boolean;
  v_matched_count integer;
  v_invalid_quantity boolean;
  v_variance_reason_required boolean;
  v_variance_reason_forbidden boolean;
  v_over_received boolean;
  v_global_event_exists boolean;
  v_remark text := NULLIF(btrim(p_remark), '');
BEGIN
  IF p_order_id IS NULL
    OR p_receipt_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_fulfillment_version IS NULL
    OR p_expected_fulfillment_version <= 0
    OR p_receipt_no IS NULL
    OR btrim(p_receipt_no) = ''
    OR char_length(btrim(p_receipt_no)) > 80
    OR p_received_at IS NULL
    OR char_length(v_remark) > 500
    OR p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  WITH requested AS MATERIALIZED (
    SELECT
      item.purchase_order_item_id,
      item.accepted_quantity,
      item.rejected_quantity,
      btrim(item.variance_reason) AS variance_reason,
      item.variance_reason IS NOT NULL AS variance_reason_provided
    FROM jsonb_to_recordset(p_items) AS item(
      purchase_order_item_id uuid,
      accepted_quantity numeric,
      rejected_quantity numeric,
      variance_reason text
    )
  )
  SELECT
    COUNT(*)::integer,
    COUNT(DISTINCT purchase_order_item_id)::integer,
    COUNT(*) <> COUNT(DISTINCT purchase_order_item_id),
    COALESCE(bool_or(
      purchase_order_item_id IS NULL
      OR accepted_quantity IS NULL
      OR rejected_quantity IS NULL
      OR accepted_quantity < 0
      OR rejected_quantity < 0
      OR accepted_quantity + rejected_quantity <= 0
      OR accepted_quantity + rejected_quantity >= 100000000000000
      OR scale(accepted_quantity) > 4
      OR scale(rejected_quantity) > 4
      OR accepted_quantity >= 100000000000000
      OR rejected_quantity >= 100000000000000
    ), true),
    COALESCE(bool_or(
      rejected_quantity > 0
      AND (
        variance_reason IS NULL
        OR variance_reason = ''
        OR char_length(variance_reason) > 500
      )
    ), true),
    COALESCE(bool_or(
      rejected_quantity = 0
      AND variance_reason_provided
    ), true),
    jsonb_agg(
      jsonb_build_object(
        'purchase_order_item_id',
          requested.purchase_order_item_id,
        'accepted_quantity',
          requested.accepted_quantity::numeric(18, 4),
        'rejected_quantity',
          requested.rejected_quantity::numeric(18, 4),
        'variance_reason', requested.variance_reason
      )
      ORDER BY requested.purchase_order_item_id
    )
  INTO
    v_requested_count,
    v_distinct_count,
    v_has_duplicates,
    v_invalid_quantity,
    v_variance_reason_required,
    v_variance_reason_forbidden,
    v_normalized_items
  FROM requested;

  IF v_has_duplicates
    OR v_requested_count <> v_distinct_count
    OR v_invalid_quantity
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  END IF;
  IF v_variance_reason_forbidden THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  END IF;
  IF v_variance_reason_required THEN
    RETURN jsonb_build_object(
      'status', 'variance_reason_required',
      'error_code', 'VARIANCE_REASON_REQUIRED'
    );
  END IF;

  v_request := jsonb_build_object(
    'event_id', p_receipt_id,
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_fulfillment_version', p_expected_fulfillment_version,
    'receipt_no', btrim(p_receipt_no),
    'received_at', p_received_at,
    'remark', v_remark,
    'items', v_normalized_items,
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
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'create_supplier_purchase_order_receipt'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240730100000
    )
  );

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;

  SELECT fulfillment.*
  INTO v_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id = p_order_id
    AND fulfillment.tenant_id = p_tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'FULFILLMENT_NOT_CONFIRMED'
    );
  END IF;
  IF v_fulfillment.status IN (
    'received',
    'received_with_variance',
    'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT'
    );
  END IF;
  IF v_fulfillment.version <> p_expected_fulfillment_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'FULFILLMENT_VERSION_CONFLICT'
    );
  END IF;

  PERFORM item_fulfillment.id
  FROM public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  JOIN jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
    ON requested.purchase_order_item_id =
      item_fulfillment.supplier_purchase_order_item_id
  WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id
  ORDER BY item_fulfillment.id
  FOR UPDATE;

  SELECT
    COUNT(item_fulfillment.id)::integer,
    COALESCE(bool_or(
      item_fulfillment.received_quantity +
        requested.accepted_quantity +
        requested.rejected_quantity >
        item_fulfillment.ordered_quantity
    ), false)
  INTO v_matched_count, v_over_received
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
  LEFT JOIN public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
    ON item_fulfillment.supplier_purchase_order_item_id =
      requested.purchase_order_item_id
    AND item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id;

  IF v_matched_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND'
    );
  END IF;
  IF v_over_received THEN
    RETURN jsonb_build_object(
      'status', 'over_received',
      'error_code', 'OVER_RECEIVED'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_purchase_order_receipts AS receipt
    WHERE receipt.id = p_receipt_id
  )
  INTO v_global_event_exists;
  IF v_global_event_exists
    OR EXISTS (
      SELECT 1
      FROM public.supplier_purchase_order_receipts AS receipt
      WHERE receipt.supplier_purchase_order_id = p_order_id
        AND receipt.receipt_no = btrim(p_receipt_no)
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT'
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_fulfillment_command',
    'receipt',
    true
  );

  INSERT INTO public.supplier_purchase_order_receipts (
    id,
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    receipt_no,
    received_at,
    remark,
    created_by_user_id,
    received_by_employee_id
  )
  VALUES (
    p_receipt_id,
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    btrim(p_receipt_no),
    p_received_at,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id
  );

  INSERT INTO public.supplier_purchase_order_receipt_items (
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    receipt_id,
    supplier_purchase_order_item_id,
    accepted_quantity,
    rejected_quantity,
    variance_reason
  )
  SELECT
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    p_receipt_id,
    requested.purchase_order_item_id,
    requested.accepted_quantity::numeric(18, 4),
    requested.rejected_quantity::numeric(18, 4),
    requested.variance_reason
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
  ORDER BY requested.purchase_order_item_id;

  UPDATE public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  SET received_quantity =
        item_fulfillment.received_quantity +
          requested.accepted_quantity +
          requested.rejected_quantity,
      accepted_quantity =
        item_fulfillment.accepted_quantity +
          requested.accepted_quantity,
      rejected_quantity =
        item_fulfillment.rejected_quantity +
          requested.rejected_quantity,
      updated_at = now()
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
  WHERE item_fulfillment.supplier_purchase_order_item_id =
      requested.purchase_order_item_id
    AND item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id;

  v_fulfillment :=
    private.recalculate_supplier_purchase_order_fulfillment(
      v_fulfillment.id
    );

  UPDATE public.supplier_purchase_order_fulfillments AS fulfillment
  SET version = fulfillment.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE fulfillment.id = v_fulfillment.id
  RETURNING fulfillment.* INTO v_fulfillment;

  v_result := jsonb_build_object(
    'status', 'receipt_created',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'fulfillment', private.supplier_purchase_order_fulfillment_snapshot(
      v_fulfillment
    ),
    'version', v_fulfillment.version
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'create_supplier_purchase_order_receipt',
    jsonb_build_object('_request', v_request) ||
      jsonb_build_object(
        'fulfillment_version',
        p_expected_fulfillment_version
      ),
    v_result,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_fulfillment.version
  );

  RETURN v_result;
EXCEPTION
  WHEN invalid_parameter_value OR invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT'
    );
END;
$$;

DO $$
DECLARE
  v_share_link record;
BEGIN
  FOR v_share_link IN
    SELECT DISTINCT ON (share_link.supplier_purchase_order_id)
      share_link.id,
      share_link.confirmed_at,
      share_link.confirm_remark
    FROM public.supplier_purchase_order_share_links AS share_link
    JOIN public.supplier_purchase_orders AS purchase_order
      ON purchase_order.id = share_link.supplier_purchase_order_id
      AND purchase_order.tenant_id = share_link.tenant_id
      AND purchase_order.status = 'submitted'
    LEFT JOIN public.supplier_purchase_order_fulfillments AS fulfillment
      ON fulfillment.supplier_purchase_order_id =
        share_link.supplier_purchase_order_id
      AND fulfillment.tenant_id = share_link.tenant_id
    WHERE share_link.status = 'active'
      AND share_link.expires_at > now()
      AND share_link.confirmed_at IS NOT NULL
      AND fulfillment.id IS NULL
    ORDER BY
      share_link.supplier_purchase_order_id,
      share_link.confirmed_at DESC,
      share_link.id DESC
  LOOP
    PERFORM public.ensure_supplier_purchase_order_fulfillment_from_share_link(
      v_share_link.id,
      v_share_link.confirmed_at,
      v_share_link.confirm_remark
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.ensure_supplier_purchase_order_fulfillment_from_share_link(
  uuid,
  timestamptz,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_supplier_purchase_order_fulfillment_from_share_link(
  uuid,
  timestamptz,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.list_supplier_purchase_orders(
  uuid,
  uuid[],
  integer,
  integer,
  text,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_supplier_purchase_orders(
  uuid,
  uuid[],
  integer,
  integer,
  text,
  text,
  uuid,
  uuid,
  text
) TO service_role;

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

COMMIT;
