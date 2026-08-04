BEGIN;

CREATE TABLE public.tenant_service_order_shipping_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_key uuid NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  wechat_errcode integer NULL,
  wechat_errmsg text NULL,
  provider_request_id text NULL,
  last_attempt_at timestamptz NULL,
  succeeded_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_order_id),
  FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE CASCADE,
  CHECK (source IN ('tenant_acceptance', 'platform_acceptance')),
  CHECK (status IN ('pending', 'succeeded', 'failed')),
  CONSTRAINT tenant_service_order_shipping_reports_payload_object
    CHECK (jsonb_typeof(request_payload) = 'object'),
  CONSTRAINT tenant_service_order_shipping_reports_wechat_errmsg_len
    CHECK (wechat_errmsg IS NULL OR char_length(wechat_errmsg) <= 500),
  CONSTRAINT tenant_service_order_shipping_reports_request_id_len
    CHECK (
      provider_request_id IS NULL
      OR (
        btrim(provider_request_id) <> ''
        AND char_length(provider_request_id) <= 128
      )
    )
);

CREATE INDEX tenant_service_order_shipping_reports_status_attempt_idx
  ON public.tenant_service_order_shipping_reports (
    status,
    last_attempt_at ASC,
    id
  );
CREATE INDEX tenant_service_order_shipping_reports_tenant_created_idx
  ON public.tenant_service_order_shipping_reports (tenant_id, created_at DESC);

CREATE TRIGGER tr_tenant_service_order_shipping_reports_updated_at
BEFORE UPDATE ON public.tenant_service_order_shipping_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_service_order_shipping_reports
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.platform_service_begin_order_shipping_report_attempt(
  p_tenant_id uuid,
  p_service_order_id uuid,
  p_source text,
  p_attempt_key uuid,
  p_request_payload jsonb,
  p_attempted_at timestamptz
)
RETURNS public.tenant_service_order_shipping_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
  v_report public.tenant_service_order_shipping_reports%ROWTYPE;
BEGIN
  IF p_source NOT IN ('tenant_acceptance', 'platform_acceptance')
    OR p_attempt_key IS NULL
    OR p_request_payload IS NULL
    OR jsonb_typeof(p_request_payload) <> 'object'
    OR p_attempted_at IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_ORDER_SHIPPING_REPORT_REQUEST_INVALID';
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

  IF v_order.payment_status <> 'paid'
    OR v_order.service_status <> 'accepted'
    OR v_order.transaction_id IS NULL
    OR btrim(v_order.transaction_id) = ''
    OR btrim(v_order.payer_openid) = ''
  THEN
    RAISE EXCEPTION 'SERVICE_ORDER_SHIPPING_REPORT_STATE_INVALID';
  END IF;

  SELECT *
  INTO v_report
  FROM public.tenant_service_order_shipping_reports
  WHERE service_order_id = p_service_order_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_report.status = 'succeeded' THEN
      RETURN v_report;
    END IF;

    UPDATE public.tenant_service_order_shipping_reports
    SET
      source = p_source,
      status = 'pending',
      attempt_count = attempt_count + 1,
      last_attempt_key = p_attempt_key,
      request_payload = p_request_payload,
      wechat_errcode = NULL,
      wechat_errmsg = NULL,
      provider_request_id = NULL,
      last_attempt_at = p_attempted_at,
      succeeded_at = NULL
    WHERE id = v_report.id
    RETURNING * INTO v_report;
    RETURN v_report;
  END IF;

  INSERT INTO public.tenant_service_order_shipping_reports (
    tenant_id,
    service_order_id,
    source,
    status,
    attempt_count,
    last_attempt_key,
    request_payload,
    last_attempt_at
  )
  VALUES (
    p_tenant_id,
    p_service_order_id,
    p_source,
    'pending',
    1,
    p_attempt_key,
    p_request_payload,
    p_attempted_at
  )
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_finish_order_shipping_report_attempt(
  p_report_id uuid,
  p_attempt_key uuid,
  p_status text,
  p_wechat_errcode integer,
  p_wechat_errmsg text,
  p_provider_request_id text,
  p_finished_at timestamptz
)
RETURNS public.tenant_service_order_shipping_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.tenant_service_order_shipping_reports%ROWTYPE;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed')
    OR p_attempt_key IS NULL
    OR p_finished_at IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_ORDER_SHIPPING_REPORT_REQUEST_INVALID';
  END IF;

  SELECT *
  INTO v_report
  FROM public.tenant_service_order_shipping_reports
  WHERE id = p_report_id
    AND last_attempt_key = p_attempt_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_SHIPPING_REPORT_ATTEMPT_CONFLICT';
  END IF;

  IF v_report.status = 'succeeded' THEN
    RETURN v_report;
  END IF;

  UPDATE public.tenant_service_order_shipping_reports
  SET
    status = p_status,
    wechat_errcode = p_wechat_errcode,
    wechat_errmsg = NULLIF(btrim(left(coalesce(p_wechat_errmsg, ''), 500)), ''),
    provider_request_id =
      NULLIF(btrim(left(coalesce(p_provider_request_id, ''), 128)), ''),
    succeeded_at = CASE
      WHEN p_status = 'succeeded' THEN p_finished_at
      ELSE NULL
    END
  WHERE id = v_report.id
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_begin_order_shipping_report_attempt(
  uuid,
  uuid,
  text,
  uuid,
  jsonb,
  timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_begin_order_shipping_report_attempt(
  uuid,
  uuid,
  text,
  uuid,
  jsonb,
  timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_finish_order_shipping_report_attempt(
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_finish_order_shipping_report_attempt(
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  timestamptz
) TO service_role;

COMMENT ON TABLE public.tenant_service_order_shipping_reports
IS '平台技术服务普通微信支付订单的交易管理发货信息上报记录。';
COMMENT ON COLUMN public.tenant_service_order_shipping_reports.request_payload
IS '提交给微信发货信息录入接口的安全业务载荷，不包含 access_token。';

COMMIT;
