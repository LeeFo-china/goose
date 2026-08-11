-- Record WeChat provider CLOSED as an independent terminal execution fact.
-- Forward-only remediation: if this not-yet-released migration fails, revise
-- this migration or introduce a versioned predecessor with an earlier
-- timestamp before rollout. Do not repair dev or production with manual DML.
-- Task 7 must measure this bounded lock window on a production-like dataset.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Lock referenced and altered tables up front in one deterministic order so
-- later constraints cannot introduce an unbounded FK or DDL lock upgrade.
LOCK TABLE public.employees IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE
  public.tenant_service_work_order_events,
  public.tenant_service_refund_requests
IN ACCESS EXCLUSIVE MODE;

-- SERVICE_REFUND_PROVIDER_CLOSED_HISTORY_INVALID means an earlier local
-- rehearsal left a partial provider CLOSED schema or fact group. Because this
-- migration is not released, repair it only by revising this migration or by
-- introducing a versioned predecessor with an earlier timestamp before
-- rollout. Do not repair dev or production with manual DML.
DO $$
DECLARE
  v_provider_column_count integer;
  v_invalid_refund_request_id uuid;
BEGIN
  SELECT count(*)::integer
  INTO v_provider_column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tenant_service_refund_requests'
    AND column_name IN (
      'provider_refund_status',
      'provider_out_refund_no',
      'provider_wechat_refund_id',
      'provider_refund_amount_fen',
      'provider_checked_at',
      'provider_checked_by_employee_id'
    );

  IF v_provider_column_count = 6 THEN
    EXECUTE $preflight$
      SELECT id
      FROM public.tenant_service_refund_requests
      WHERE NOT ((
        (
          provider_refund_status IS NULL
          AND provider_out_refund_no IS NULL
          AND provider_wechat_refund_id IS NULL
          AND provider_refund_amount_fen IS NULL
          AND provider_checked_at IS NULL
          AND provider_checked_by_employee_id IS NULL
        )
        OR (
          status = 'cancelled'
          AND provider_refund_status = 'CLOSED'
          AND provider_out_refund_no IS NOT NULL
          AND provider_wechat_refund_id IS NOT NULL
          AND provider_refund_amount_fen IS NOT NULL
          AND provider_checked_at IS NOT NULL
          AND provider_checked_by_employee_id IS NOT NULL
        )
      ) IS TRUE)
      LIMIT 1
    $preflight$
    INTO v_invalid_refund_request_id;

    IF v_invalid_refund_request_id IS NOT NULL THEN
      RAISE EXCEPTION 'SERVICE_REFUND_PROVIDER_CLOSED_HISTORY_INVALID';
    END IF;
  END IF;

  -- This migration is transactional and not resumable from a staged schema.
  -- Even a complete valid six-column group must stop with the stable code
  -- before the unconditional first-release DDL below can raise duplicate_column.
  IF v_provider_column_count <> 0 THEN
    RAISE EXCEPTION 'SERVICE_REFUND_PROVIDER_CLOSED_HISTORY_INVALID';
  END IF;
END;
$$;

ALTER TABLE public.tenant_service_refund_requests
  ADD COLUMN provider_refund_status text NULL,
  ADD COLUMN provider_out_refund_no text NULL,
  ADD COLUMN provider_wechat_refund_id text NULL,
  ADD COLUMN provider_refund_amount_fen bigint NULL,
  ADD COLUMN provider_checked_at timestamptz NULL,
  ADD COLUMN provider_checked_by_employee_id uuid NULL;

ALTER TABLE public.tenant_service_refund_requests
  ADD CONSTRAINT tenant_service_refund_requests_provider_status_check
    CHECK (
      provider_refund_status IS NULL
      OR provider_refund_status = 'CLOSED'
    ),
  ADD CONSTRAINT tenant_service_refund_requests_provider_out_refund_no_check
    CHECK (
      provider_out_refund_no IS NULL
      OR (
        btrim(provider_out_refund_no) <> ''
        AND char_length(provider_out_refund_no) <= 64
      )
    ),
  ADD CONSTRAINT tenant_service_refund_requests_provider_wechat_refund_id_check
    CHECK (
      provider_wechat_refund_id IS NULL
      OR (
        btrim(provider_wechat_refund_id) <> ''
        AND char_length(provider_wechat_refund_id) <= 128
      )
    ),
  ADD CONSTRAINT tenant_service_refund_requests_provider_refund_amount_check
    CHECK (
      provider_refund_amount_fen IS NULL
      OR provider_refund_amount_fen > 0
    ),
  ADD CONSTRAINT tenant_service_refund_requests_provider_checked_by_employee_fkey
    FOREIGN KEY (provider_checked_by_employee_id)
    REFERENCES public.employees(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_service_refund_requests_provider_closed_fields_check
    CHECK (((
      (
        provider_refund_status IS NULL
        AND provider_out_refund_no IS NULL
        AND provider_wechat_refund_id IS NULL
        AND provider_refund_amount_fen IS NULL
        AND provider_checked_at IS NULL
        AND provider_checked_by_employee_id IS NULL
      )
      OR
      (
        status = 'cancelled'
        AND provider_refund_status = 'CLOSED'
        AND provider_out_refund_no IS NOT NULL
        AND provider_wechat_refund_id IS NOT NULL
        AND provider_refund_amount_fen IS NOT NULL
        AND provider_checked_at IS NOT NULL
        AND provider_checked_by_employee_id IS NOT NULL
      )
    )) IS TRUE);

CREATE UNIQUE INDEX tenant_service_refund_requests_provider_out_refund_unique_idx
  ON public.tenant_service_refund_requests (provider_out_refund_no)
  WHERE provider_out_refund_no IS NOT NULL;

CREATE UNIQUE INDEX tenant_service_refund_requests_provider_wechat_refund_unique_idx
  ON public.tenant_service_refund_requests (provider_wechat_refund_id)
  WHERE provider_wechat_refund_id IS NOT NULL;

-- The expression indexes serialize the same provider identifier across the
-- mutually exclusive SUCCESS and CLOSED terminal fact columns. A pre-check is
-- still useful for a stable early error, while the unique constraint closes
-- the concurrent different-request race at the database boundary.
CREATE UNIQUE INDEX tenant_service_refund_requests_terminal_out_refund_unique_idx
  ON public.tenant_service_refund_requests
  ((COALESCE(out_refund_no, provider_out_refund_no)))
  WHERE COALESCE(out_refund_no, provider_out_refund_no) IS NOT NULL;

CREATE UNIQUE INDEX tenant_service_refund_requests_terminal_wechat_refund_unique_idx
  ON public.tenant_service_refund_requests
  ((COALESCE(wechat_refund_id, provider_wechat_refund_id)))
  WHERE COALESCE(wechat_refund_id, provider_wechat_refund_id) IS NOT NULL;

ALTER TABLE public.tenant_service_work_order_events
  DROP CONSTRAINT tenant_service_work_order_events_action_check;

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
    'refund_review',
    'refund_confirm',
    'refund_provider_closed',
    'contract_period_void',
    'contract_period_adjust'
  ));

CREATE OR REPLACE FUNCTION public.platform_service_close_refund_execution(
  p_refund_request_id uuid,
  p_service_order_id uuid,
  p_transaction_id text,
  p_out_trade_no text,
  p_payment_config_id uuid,
  p_payment_config_guard_version integer,
  p_out_refund_no text,
  p_wechat_refund_id text,
  p_refund_amount_fen bigint,
  p_operator_employee_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_tenant_id uuid;
  v_command_at timestamptz;
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_refund public.tenant_service_refund_requests%ROWTYPE;
BEGIN
  IF p_refund_request_id IS NULL
    OR p_service_order_id IS NULL
    OR p_transaction_id IS NULL
    OR btrim(p_transaction_id) = ''
    OR char_length(p_transaction_id) > 128
    OR p_out_trade_no IS NULL
    OR btrim(p_out_trade_no) = ''
    OR char_length(p_out_trade_no) > 64
    OR p_payment_config_id IS NULL
    OR p_payment_config_guard_version IS NULL
    OR p_payment_config_guard_version <= 0
    OR p_out_refund_no IS NULL
    OR btrim(p_out_refund_no) = ''
    OR char_length(p_out_refund_no) > 64
    OR p_wechat_refund_id IS NULL
    OR btrim(p_wechat_refund_id) = ''
    OR char_length(p_wechat_refund_id) > 128
    OR p_refund_amount_fen IS NULL
    OR p_refund_amount_fen <= 0
    OR p_operator_employee_id IS NULL
    OR jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    OR pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 8192
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_CLOSURE_INVALID';
  END IF;

  SELECT service_order_id, tenant_id
  INTO v_order_id, v_tenant_id
  FROM public.tenant_service_refund_requests
  WHERE id = p_refund_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  PERFORM public.platform_service_lock_refund_operator(p_operator_employee_id);

  PERFORM public.platform_service_lock_order(v_order_id);

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = v_order_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_ORDER_BINDING_INVALID';
  END IF;

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  PERFORM acceptance.id
  FROM public.tenant_service_acceptance_preparations AS acceptance
  WHERE acceptance.service_order_id = v_order.id
    AND acceptance.work_order_id = v_work_order.id
    AND acceptance.tenant_id = v_order.tenant_id
  FOR UPDATE;

  SELECT *
  INTO v_refund
  FROM public.tenant_service_refund_requests
  WHERE id = p_refund_request_id
    AND service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  IF v_order.id IS DISTINCT FROM p_service_order_id
    OR v_order.transaction_id IS DISTINCT FROM p_transaction_id
    OR v_order.out_trade_no IS DISTINCT FROM p_out_trade_no
    OR v_order.payment_config_id IS DISTINCT FROM p_payment_config_id
    OR v_order.payment_config_guard_version IS DISTINCT FROM
      p_payment_config_guard_version
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_PAYMENT_BINDING_INVALID';
  END IF;

  IF v_refund.status = 'cancelled'
    AND v_refund.provider_refund_status = 'CLOSED'
  THEN
    IF v_refund.provider_out_refund_no IS DISTINCT FROM p_out_refund_no
      OR v_refund.provider_wechat_refund_id IS DISTINCT FROM p_wechat_refund_id
      OR v_refund.provider_refund_amount_fen IS DISTINCT FROM p_refund_amount_fen
    THEN
      RAISE EXCEPTION 'SERVICE_REFUND_CLOSURE_IDEMPOTENCY_CONFLICT';
    END IF;

    RETURN jsonb_build_object(
      'refund_request', to_jsonb(v_refund),
      'order', to_jsonb(v_order),
      'provider_status', 'CLOSED',
      'refunded', false,
      'access_terminated', false,
      'retryable', false,
      'idempotent', true,
      'error_code', NULL
    );
  END IF;

  IF v_refund.status NOT IN ('approved', 'refunding')
    OR v_order.payment_status NOT IN ('refund_reviewing', 'refunding')
    OR v_order.service_access_terminated_at IS NOT NULL
    OR v_refund.provider_refund_status IS NOT NULL
    OR v_refund.provider_out_refund_no IS NOT NULL
    OR v_refund.provider_wechat_refund_id IS NOT NULL
    OR v_refund.provider_refund_amount_fen IS NOT NULL
    OR v_refund.provider_checked_at IS NOT NULL
    OR v_refund.provider_checked_by_employee_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_CLOSURE_INVALID_STATE';
  END IF;

  IF p_refund_amount_fen <> v_order.amount_fen
    OR v_order.paid_amount_fen IS DISTINCT FROM v_order.amount_fen
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_AMOUNT_MISMATCH';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_service_refund_requests AS reused_refund
    WHERE reused_refund.id <> v_refund.id
      AND (
        reused_refund.out_refund_no = p_out_refund_no
        OR reused_refund.provider_out_refund_no = p_out_refund_no
        OR reused_refund.wechat_refund_id = p_wechat_refund_id
        OR reused_refund.provider_wechat_refund_id = p_wechat_refund_id
      )
  ) THEN
    RAISE EXCEPTION 'SERVICE_REFUND_PROVIDER_ID_CONFLICT';
  END IF;

  v_command_at := clock_timestamp();

  UPDATE public.tenant_service_refund_requests
  SET
    status = 'cancelled',
    provider_refund_status = 'CLOSED',
    provider_out_refund_no = p_out_refund_no,
    provider_wechat_refund_id = p_wechat_refund_id,
    provider_refund_amount_fen = p_refund_amount_fen,
    provider_checked_at = v_command_at,
    provider_checked_by_employee_id = p_operator_employee_id,
    version = version + 1
  WHERE id = v_refund.id
    AND tenant_id = v_refund.tenant_id
  RETURNING * INTO v_refund;

  UPDATE public.tenant_service_orders
  SET
    payment_status = 'paid',
    version = version + 1
  WHERE id = v_order.id
    AND tenant_id = v_order.tenant_id
  RETURNING * INTO v_order;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata,
    created_at
  )
  VALUES (
    v_order.tenant_id,
    v_order.id,
    v_work_order.id,
    'refund_provider_closed',
    v_work_order.status,
    v_work_order.status,
    '微信退款已关闭，恢复退款前支付状态',
    p_operator_employee_id,
    jsonb_build_object(
      'refund_request_id', v_refund.id,
      'provider_refund_status', v_refund.provider_refund_status,
      'provider_out_refund_no', v_refund.provider_out_refund_no,
      'provider_wechat_refund_id', v_refund.provider_wechat_refund_id,
      'provider_refund_amount_fen', v_refund.provider_refund_amount_fen
    ),
    v_command_at
  );

  RETURN jsonb_build_object(
    'refund_request', to_jsonb(v_refund),
    'order', to_jsonb(v_order),
    'provider_status', 'CLOSED',
    'refunded', false,
    'access_terminated', false,
    'retryable', false,
    'idempotent', false,
    'error_code', NULL
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SERVICE_REFUND_PROVIDER_ID_CONFLICT';
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_close_refund_execution(
  uuid, uuid, text, text, uuid, integer,
  text, text, bigint, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_close_refund_execution(
  uuid, uuid, text, text, uuid, integer,
  text, text, bigint, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_close_refund_execution(
  uuid, uuid, text, text, uuid, integer,
  text, text, bigint, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_close_refund_execution(
  uuid, uuid, text, text, uuid, integer,
  text, text, bigint, uuid, jsonb
) TO service_role;

COMMENT ON COLUMN public.tenant_service_refund_requests.provider_refund_status
  IS '微信退款执行终态审计；CLOSED 表示本次退款单已关闭且未终止服务访问。';
COMMENT ON FUNCTION public.platform_service_close_refund_execution(
  uuid, uuid, text, text, uuid, integer,
  text, text, bigint, uuid, jsonb
) IS '绑定退款申请、原支付和全局平台操作员，原子记录微信 CLOSED 并仅恢复支付审核状态。';

COMMIT;
