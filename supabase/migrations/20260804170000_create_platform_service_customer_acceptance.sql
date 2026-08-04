-- Platform service customer acceptance decision RPC.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.tenant_service_decide_acceptance(uuid, uuid, text, integer, uuid, text, jsonb);
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
--       'refund_review'
--     ));

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
    'refund_review'
  ));

CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance(
  p_tenant_id uuid,
  p_service_order_id uuid,
  p_decision text,
  p_expected_work_order_version integer,
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
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_acceptance public.tenant_service_acceptance_preparations%ROWTYPE;
  v_to_status text;
  v_acceptance_status text;
  v_action text;
BEGIN
  IF p_decision NOT IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_service_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE service_order_id = p_service_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_acceptance
  FROM public.tenant_service_acceptance_preparations
  WHERE work_order_id = v_work_order.id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF v_work_order.version <> p_expected_work_order_version THEN
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

  IF p_decision = 'accepted' THEN
    v_to_status := 'accepted';
    v_acceptance_status := 'accepted';
    v_action := 'customer_accept';
  ELSE
    v_to_status := 'rectifying';
    v_acceptance_status := 'rejected';
    v_action := 'customer_reject';
  END IF;

  UPDATE public.tenant_service_work_orders
  SET
    status = v_to_status,
    version = version + 1
  WHERE id = v_work_order.id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_orders
  SET
    service_status = v_to_status,
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE public.tenant_service_acceptance_preparations
  SET
    status = v_acceptance_status,
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
    p_tenant_id,
    p_service_order_id,
    v_work_order.id,
    v_action,
    'awaiting_acceptance',
    v_to_status,
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

REVOKE ALL ON FUNCTION public.tenant_service_decide_acceptance(
  uuid,
  uuid,
  text,
  integer,
  uuid,
  text,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_service_decide_acceptance(
  uuid,
  uuid,
  text,
  integer,
  uuid,
  text,
  jsonb
) TO service_role;
