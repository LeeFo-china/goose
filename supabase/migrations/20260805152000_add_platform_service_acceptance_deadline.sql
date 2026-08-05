-- Add a bounded customer acceptance window for platform technical service orders.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.platform_service_confirm_overdue_acceptance(uuid, integer, uuid, text, jsonb);
--   DROP INDEX IF EXISTS public.tenant_service_acceptance_preparations_due_idx;
--   ALTER TABLE public.tenant_service_acceptance_preparations
--     DROP CONSTRAINT IF EXISTS tenant_service_acceptance_preparations_due_after_submit_check;
--   ALTER TABLE public.tenant_service_acceptance_preparations
--     DROP COLUMN IF EXISTS acceptance_due_at;
--   ALTER TABLE public.tenant_service_work_order_events
--     DROP CONSTRAINT IF EXISTS tenant_service_work_order_events_action_check;
--   ALTER TABLE public.tenant_service_work_order_events
--     ADD CONSTRAINT tenant_service_work_order_events_action_check
--     CHECK (action IN (
--       'assign',
--       'transition',
--       'fulfillment_record_create',
--       'acceptance_prepare',
--       'acceptance_submit',
--       'customer_accept',
--       'customer_reject',
--       'refund_review'
--     ));

ALTER TABLE public.tenant_service_acceptance_preparations
  ADD COLUMN IF NOT EXISTS acceptance_due_at timestamptz;

UPDATE public.tenant_service_acceptance_preparations
SET acceptance_due_at = submitted_at + interval '3 days'
WHERE submitted_at IS NOT NULL
  AND acceptance_due_at IS NULL;

ALTER TABLE public.tenant_service_acceptance_preparations
  DROP CONSTRAINT IF EXISTS tenant_service_acceptance_preparations_due_after_submit_check;

ALTER TABLE public.tenant_service_acceptance_preparations
  ADD CONSTRAINT tenant_service_acceptance_preparations_due_after_submit_check
  CHECK (
    acceptance_due_at IS NULL
    OR submitted_at IS NULL
    OR acceptance_due_at >= submitted_at
  );

CREATE INDEX IF NOT EXISTS tenant_service_acceptance_preparations_due_idx
  ON public.tenant_service_acceptance_preparations(status, acceptance_due_at)
  WHERE acceptance_due_at IS NOT NULL;

ALTER TABLE public.tenant_service_work_order_events
  DROP CONSTRAINT IF EXISTS tenant_service_work_order_events_action_check;

ALTER TABLE public.tenant_service_work_order_events
  ADD CONSTRAINT tenant_service_work_order_events_action_check
  CHECK (action IN (
    'assign',
    'transition',
    'fulfillment_record_create',
    'acceptance_prepare',
    'acceptance_submit',
    'customer_accept',
    'customer_reject',
    'platform_accept_overdue',
    'refund_review'
  ));

CREATE OR REPLACE FUNCTION public.platform_service_confirm_overdue_acceptance(
  p_work_order_id uuid,
  p_expected_version integer,
  p_operator_employee_id uuid,
  p_remark text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_acceptance public.tenant_service_acceptance_preparations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE id = p_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = v_work_order.service_order_id
    AND tenant_id = v_work_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  SELECT *
  INTO v_acceptance
  FROM public.tenant_service_acceptance_preparations
  WHERE work_order_id = v_work_order.id
    AND tenant_id = v_work_order.tenant_id
    AND service_order_id = v_work_order.service_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF v_work_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_WORK_ORDER_VERSION_CONFLICT'
    );
  END IF;

  IF v_order.payment_status <> 'paid'
    OR v_work_order.status <> 'awaiting_acceptance'
    OR v_acceptance.status <> 'submitted'
  THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF v_acceptance.acceptance_due_at IS NULL
    OR v_acceptance.acceptance_due_at > now()
  THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_ACCEPTANCE_NOT_OVERDUE'
    );
  END IF;

  UPDATE public.tenant_service_work_orders
  SET
    status = 'accepted',
    version = version + 1
  WHERE id = v_work_order.id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_orders
  SET
    service_status = 'accepted',
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE public.tenant_service_acceptance_preparations
  SET
    status = 'accepted',
    updated_at = now()
  WHERE id = v_acceptance.id
  RETURNING * INTO v_acceptance;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata
  )
  VALUES (
    v_work_order.tenant_id,
    v_work_order.service_order_id,
    v_work_order.id,
    'platform_accept_overdue',
    'awaiting_acceptance',
    'accepted',
    p_remark,
    p_operator_employee_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'work_order', to_jsonb(v_work_order),
    'order', to_jsonb(v_order),
    'acceptance_preparation', to_jsonb(v_acceptance),
    'error_code', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_confirm_overdue_acceptance(
  uuid,
  integer,
  uuid,
  text,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_confirm_overdue_acceptance(
  uuid,
  integer,
  uuid,
  text,
  jsonb
) TO service_role;
