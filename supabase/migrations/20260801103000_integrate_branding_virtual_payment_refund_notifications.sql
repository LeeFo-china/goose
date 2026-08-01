-- Authenticated WeChat virtual-payment refund completion and iOS inquiry inbox.

ALTER TABLE public.wechat_virtual_payment_notifications
  DROP CONSTRAINT wechat_virtual_payment_notifications_event_type_check,
  ADD CONSTRAINT wechat_virtual_payment_notifications_event_type_check CHECK (
    event_type IN (
      'xpay_goods_deliver_notify',
      'xpay_refund_notify',
      'xpay_subscribe_ios_refund_query_notify'
    )
  );

CREATE TABLE public.wechat_virtual_refund_event_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (event_key ~ '^[0-9a-f]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text NOT NULL CHECK (event_type IN (
    'xpay_refund_notify', 'xpay_subscribe_ios_refund_query_notify'
  )),
  recipient_original_id text NOT NULL CHECK (
    btrim(recipient_original_id) <> '' AND char_length(recipient_original_id) <= 128
  ),
  sender_id_hash text NOT NULL CHECK (sender_id_hash ~ '^[0-9a-f]{64}$'),
  provider_created_at bigint NOT NULL CHECK (provider_created_at >= 0),
  out_trade_no text NOT NULL CHECK (
    btrim(out_trade_no) <> '' AND char_length(out_trade_no) <= 32
  ),
  order_id uuid NULL REFERENCES public.tenant_virtual_addon_orders(id) ON DELETE RESTRICT,
  refund_id uuid NULL REFERENCES public.tenant_virtual_addon_refunds(id) ON DELETE RESTRICT,
  provider_reference_hash text NOT NULL CHECK (
    provider_reference_hash ~ '^[0-9a-f]{64}$'
  ),
  provider_result_code integer NULL CHECK (provider_result_code >= 0),
  decision_code integer NULL CHECK (decision_code IN (0, 1)),
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(result_summary) = 'object'
  ),
  request_id text NULL CHECK (request_id IS NULL OR char_length(request_id) <= 128),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wechat_virtual_refund_event_inbox_order_idx
ON public.wechat_virtual_refund_event_inbox(order_id, received_at DESC, id DESC);

ALTER TABLE public.wechat_virtual_refund_event_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wechat_virtual_refund_event_inbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wechat_virtual_refund_event_inbox
FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.branding_process_virtual_refund_notification(
  p_recipient_original_id text,
  p_sender_id_hash text,
  p_provider_created_at bigint,
  p_out_trade_no text,
  p_openid_hash text,
  p_local_refund_no text,
  p_provider_order_id text,
  p_provider_refund_id text,
  p_provider_refund_transaction_id text,
  p_refund_fee_fen integer,
  p_successful boolean,
  p_provider_result_code integer,
  p_provider_result_message text,
  p_refund_started_at timestamptz,
  p_refund_succeeded_at timestamptz,
  p_retry_times integer,
  p_request_id text DEFAULT NULL
)
RETURNS TABLE (
  notification_id uuid,
  refund_id uuid,
  refund_status text,
  compensation_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_refund public.tenant_virtual_addon_refunds%ROWTYPE;
  v_inbox public.wechat_virtual_refund_event_inbox%ROWTYPE;
  v_event_key text;
  v_payload_hash text;
  v_summary jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_successful <> (p_provider_result_code = 0)
    OR p_successful <> (p_refund_succeeded_at IS NOT NULL)
    OR p_refund_started_at IS NULL
    OR (p_refund_succeeded_at IS NOT NULL
        AND p_refund_succeeded_at < p_refund_started_at)
    OR p_refund_fee_fen <= 0 OR p_retry_times < 0
    OR p_sender_id_hash !~ '^[0-9a-f]{64}$'
    OR p_openid_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_INPUT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.out_trade_no = p_out_trade_no
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF encode(public.digest(v_order.payer_openid, 'sha256'), 'hex') <> p_openid_hash
    OR v_order.amount_fen <> p_refund_fee_fen
    OR v_order.provider_order_no IS DISTINCT FROM p_provider_order_id
    OR v_order.payment_status <> 'succeeded'
    OR v_order.entitlement_event_id IS NULL
  THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  v_payload_hash := encode(public.digest(concat_ws('|',
    p_out_trade_no, p_local_refund_no, p_provider_order_id,
    p_provider_refund_id, p_provider_refund_transaction_id,
    p_refund_fee_fen::text, p_provider_result_code::text,
    p_refund_started_at::text, coalesce(p_refund_succeeded_at::text, '')
  ), 'sha256'), 'hex');
  v_event_key := encode(public.digest(concat_ws('|',
    'xpay_refund_notify', p_provider_refund_id, p_provider_result_code::text
  ), 'sha256'), 'hex');

  SELECT refunds.* INTO v_refund
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE refunds.order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.tenant_virtual_addon_refunds AS conflicting
      WHERE conflicting.refund_no = p_local_refund_no
         OR conflicting.provider_refund_no = p_local_refund_no
         OR conflicting.provider_refund_id = p_provider_refund_id
         OR conflicting.provider_refund_transaction_id = p_provider_refund_transaction_id
    ) THEN
      RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.requested_platform <> 'ios' THEN
      RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_REFUND_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.tenant_virtual_addon_refunds (
      refund_no, order_id, tenant_id, idempotency_key, amount_fen,
      reason, evidence_summary, request_source, requested_by, reviewed_by,
      platform_mode, status, provider_refund_no, provider_refund_id,
      provider_refund_transaction_id, apple_receipt_hash,
      purchase_entitlement_event_id, provider_refund_started_at,
      provider_refund_succeeded_at,
      succeeded_at, failed_at, last_error_code, last_error_summary
    ) VALUES (
      'BVR' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)),
      v_order.id, v_order.tenant_id, gen_random_uuid(),
      p_refund_fee_fen, 'Apple 外部退款通知', '', 'apple_notification', NULL, NULL,
      'apple_external', CASE WHEN p_successful THEN 'succeeded' ELSE 'failed' END,
      p_local_refund_no,
      p_provider_refund_id, p_provider_refund_transaction_id,
      NULL,
      v_order.entitlement_event_id, p_refund_started_at, p_refund_succeeded_at,
      CASE WHEN p_successful THEN p_refund_succeeded_at END,
      CASE WHEN NOT p_successful THEN now() END,
      CASE WHEN NOT p_successful THEN 'WECHAT_VIRTUAL_REFUND_FAILED' END,
      CASE WHEN NOT p_successful THEN left(p_provider_result_message, 500) END
    ) RETURNING * INTO v_refund;
    UPDATE public.tenant_virtual_addon_orders SET refund_status = 'reviewing'
    WHERE id = v_order.id AND refund_status = 'none';
    UPDATE public.tenant_virtual_addon_orders SET refund_status = 'external_required'
    WHERE id = v_order.id AND refund_status = 'reviewing';
    PERFORM 1 FROM public.tenant_virtual_addon_orders AS staged
    WHERE staged.id = v_order.id AND staged.refund_status = 'external_required';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF v_refund.amount_fen <> p_refund_fee_fen
      OR (v_refund.platform_mode = 'merchant_initiated'
          AND v_refund.refund_no <> p_local_refund_no)
      OR (v_refund.provider_refund_no IS NOT NULL
          AND v_refund.provider_refund_no <> p_local_refund_no)
      OR (v_refund.provider_refund_id IS NOT NULL
          AND v_refund.provider_refund_id <> v_refund.refund_no
          AND v_refund.provider_refund_id <> p_provider_refund_id)
      OR (v_refund.provider_refund_transaction_id IS NOT NULL
          AND v_refund.provider_refund_transaction_id <> p_provider_refund_transaction_id)
      OR (v_refund.provider_refund_started_at IS NOT NULL
          AND v_refund.provider_refund_started_at <> p_refund_started_at)
      OR (v_refund.provider_refund_succeeded_at IS NOT NULL
          AND v_refund.provider_refund_succeeded_at IS DISTINCT FROM p_refund_succeeded_at)
      OR EXISTS (
        SELECT 1 FROM public.tenant_virtual_addon_refunds AS conflicting
        WHERE conflicting.id <> v_refund.id AND (
          conflicting.refund_no = p_local_refund_no
          OR conflicting.provider_refund_no = p_local_refund_no
          OR conflicting.provider_refund_id = p_provider_refund_id
          OR conflicting.provider_refund_transaction_id = p_provider_refund_transaction_id
        )
      )
    THEN
      RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF v_refund.status = 'succeeded' THEN
      IF NOT p_successful THEN
        RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
      -- Same successful fact is terminal and does not increment version.
      IF v_refund.provider_refund_no IS NULL
        OR v_refund.provider_refund_id IS NULL
        OR v_refund.provider_refund_id = v_refund.refund_no
        OR v_refund.provider_refund_transaction_id IS NULL
        OR v_refund.provider_refund_started_at IS NULL
        OR v_refund.provider_refund_succeeded_at IS NULL
      THEN
        UPDATE public.tenant_virtual_addon_refunds
        SET provider_refund_no = coalesce(provider_refund_no, p_local_refund_no),
            provider_refund_id = CASE
              WHEN provider_refund_id IS NULL OR provider_refund_id = refund_no
                THEN p_provider_refund_id ELSE provider_refund_id END,
            provider_refund_transaction_id = coalesce(
              provider_refund_transaction_id, p_provider_refund_transaction_id
            ),
            provider_refund_started_at = coalesce(
              provider_refund_started_at, p_refund_started_at
            ),
            provider_refund_succeeded_at = coalesce(
              provider_refund_succeeded_at, p_refund_succeeded_at
            ),
            succeeded_at = p_refund_succeeded_at,
            version = version + 1
        WHERE id = v_refund.id RETURNING * INTO v_refund;
      END IF;
    ELSIF v_refund.status = 'failed' THEN
      IF p_successful THEN
        RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
      -- Same failed fact is terminal and does not increment version.
      IF v_refund.provider_refund_no IS NULL
        OR v_refund.provider_refund_id IS NULL
        OR v_refund.provider_refund_id = v_refund.refund_no
        OR v_refund.provider_refund_transaction_id IS NULL
        OR v_refund.provider_refund_started_at IS NULL
      THEN
        UPDATE public.tenant_virtual_addon_refunds
        SET provider_refund_no = coalesce(provider_refund_no, p_local_refund_no),
            provider_refund_id = CASE
              WHEN provider_refund_id IS NULL OR provider_refund_id = refund_no
                THEN p_provider_refund_id ELSE provider_refund_id END,
            provider_refund_transaction_id = coalesce(
              provider_refund_transaction_id, p_provider_refund_transaction_id
            ),
            provider_refund_started_at = coalesce(
              provider_refund_started_at, p_refund_started_at
            ),
            provider_refund_succeeded_at = NULL,
            version = version + 1
        WHERE id = v_refund.id RETURNING * INTO v_refund;
      END IF;
    ELSIF v_refund.status = 'rejected' THEN
      RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_FACT_CONFLICT' USING ERRCODE = 'P0001';
    ELSE
    UPDATE public.tenant_virtual_addon_orders SET refund_status = 'reviewing'
    WHERE id = v_order.id AND refund_status = 'none';
    IF v_refund.platform_mode = 'merchant_initiated' THEN
      UPDATE public.tenant_virtual_addon_orders SET refund_status = 'submitted'
      WHERE id = v_order.id AND refund_status = 'reviewing';
    ELSE
      UPDATE public.tenant_virtual_addon_orders SET refund_status = 'external_required'
      WHERE id = v_order.id AND refund_status = 'reviewing';
    END IF;
    PERFORM 1 FROM public.tenant_virtual_addon_orders AS staged
    WHERE staged.id = v_order.id AND staged.refund_status = CASE
      WHEN v_refund.platform_mode = 'merchant_initiated' THEN 'submitted'
      ELSE 'external_required'
    END;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.tenant_virtual_addon_refunds
    SET status = CASE WHEN p_successful THEN 'succeeded' ELSE 'failed' END,
        provider_refund_no = p_local_refund_no,
        provider_refund_id = p_provider_refund_id,
        provider_refund_transaction_id = p_provider_refund_transaction_id,
        provider_refund_started_at = p_refund_started_at,
        provider_refund_succeeded_at = p_refund_succeeded_at,
        succeeded_at = CASE WHEN p_successful THEN p_refund_succeeded_at ELSE succeeded_at END,
        failed_at = CASE WHEN NOT p_successful THEN now() ELSE failed_at END,
        last_error_code = CASE WHEN NOT p_successful THEN 'WECHAT_VIRTUAL_REFUND_FAILED' END,
        last_error_summary = CASE WHEN NOT p_successful THEN left(p_provider_result_message, 500) END,
        reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL,
        reconcile_next_at = NULL, version = version + 1
    WHERE id = v_refund.id
      AND status NOT IN ('succeeded', 'rejected')
    RETURNING * INTO v_refund;
    END IF;
  END IF;

  UPDATE public.tenant_virtual_addon_orders
  SET refund_status = v_refund.status, updated_at = now()
  WHERE id = v_order.id AND refund_status <> v_refund.status;

  v_summary := jsonb_build_object(
    'refund_status', v_refund.status,
    'successful', p_successful,
    'retry_times', p_retry_times
  );
  INSERT INTO public.wechat_virtual_refund_event_inbox (
    event_key, payload_sha256, event_type, recipient_original_id,
    sender_id_hash, provider_created_at, out_trade_no, order_id, refund_id,
    provider_reference_hash, provider_result_code, result_summary, request_id
  ) VALUES (
    v_event_key, v_payload_hash, 'xpay_refund_notify', p_recipient_original_id,
    p_sender_id_hash, p_provider_created_at, p_out_trade_no, v_order.id, v_refund.id,
    encode(public.digest(p_provider_refund_id, 'sha256'), 'hex'),
    p_provider_result_code, v_summary, p_request_id
  ) ON CONFLICT (event_key) DO UPDATE
    SET processed_at = public.wechat_virtual_refund_event_inbox.processed_at
  RETURNING * INTO v_inbox;
  IF v_inbox.payload_sha256 <> v_payload_hash OR v_inbox.refund_id <> v_refund.id THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_NOTIFICATION_EVENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT v_inbox.id, v_refund.id, v_refund.status,
    v_refund.compensation_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_process_virtual_ios_refund_inquiry(
  p_recipient_original_id text,
  p_sender_id_hash text,
  p_provider_created_at bigint,
  p_out_trade_no text,
  p_refund_time timestamptz,
  p_order_time timestamptz,
  p_channel_bill_hash text,
  p_bundle_id text,
  p_provider_product_id text,
  p_quantity integer,
  p_refund_request_reason text,
  p_provide_status integer,
  p_request_id text DEFAULT NULL
)
RETURNS TABLE (
  notification_id uuid,
  result_code integer,
  result_info text,
  evidence text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_inbox public.wechat_virtual_refund_event_inbox%ROWTYPE;
  v_event_key text;
  v_payload_hash text;
  v_result_code integer;
  v_result_info text;
  v_evidence text;
  v_platform_approved boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_INQUIRY_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF p_sender_id_hash !~ '^[0-9a-f]{64}$'
    OR p_channel_bill_hash !~ '^[0-9a-f]{64}$'
    OR p_quantity <= 0 OR p_provide_status NOT IN (0, 1, 2)
  THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_INQUIRY_INPUT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.out_trade_no = p_out_trade_no
  LIMIT 1;

  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_virtual_addon_refunds AS approved
      WHERE approved.order_id = v_order.id
        AND approved.request_source = 'platform_admin'
        AND approved.platform_mode = 'apple_external'
        AND approved.status = 'external_required'
        AND btrim(approved.reason) <> ''
        AND btrim(approved.evidence_summary) <> ''
    ) INTO v_platform_approved;
  END IF;

  IF v_platform_approved THEN
    v_result_code := 0;
    v_result_info := '建议退款';
    v_evidence := '平台已完成售后申请核验';
  ELSIF FOUND AND v_order.requested_platform = 'ios'
    AND v_order.payment_status = 'succeeded'
    AND v_order.paid_amount_fen = v_order.amount_fen
    AND v_order.provider_product_id = p_provider_product_id
    AND p_quantity = 1
    AND v_order.fulfillment_status = 'granted'
    AND v_order.entitlement_event_id IS NOT NULL
    AND v_order.paid_at IS NOT NULL
    AND abs(extract(epoch FROM (v_order.paid_at - p_order_time))) <= 300
  THEN
    v_result_code := 1;
    v_result_info := '建议暂缓退款';
    v_evidence := '数字权益已完成交付，建议结合实际使用情况复核';
  ELSE
    v_result_code := 0;
    v_result_info := '建议退款';
    v_evidence := '未发现可确认的数字权益交付事实';
  END IF;

  v_event_key := encode(public.digest(concat_ws('|',
    'xpay_subscribe_ios_refund_query_notify', p_out_trade_no,
    p_channel_bill_hash, p_refund_time::text
  ), 'sha256'), 'hex');
  v_payload_hash := encode(public.digest(concat_ws('|',
    p_out_trade_no, p_channel_bill_hash, p_bundle_id, p_provider_product_id,
    p_quantity::text, p_provide_status::text, p_refund_time::text,
    p_order_time::text, p_refund_request_reason
  ), 'sha256'), 'hex');

  INSERT INTO public.wechat_virtual_refund_event_inbox (
    event_key, payload_sha256, event_type, recipient_original_id,
    sender_id_hash, provider_created_at, out_trade_no, order_id,
    provider_reference_hash, decision_code, result_summary, request_id
  ) VALUES (
    v_event_key, v_payload_hash, 'xpay_subscribe_ios_refund_query_notify',
    p_recipient_original_id, p_sender_id_hash, p_provider_created_at,
    p_out_trade_no, v_order.id, p_channel_bill_hash, v_result_code,
    jsonb_build_object('result_info', v_result_info, 'evidence', v_evidence),
    p_request_id
  ) ON CONFLICT (event_key) DO UPDATE
    SET processed_at = public.wechat_virtual_refund_event_inbox.processed_at
  RETURNING * INTO v_inbox;
  IF v_inbox.payload_sha256 <> v_payload_hash THEN
    RAISE EXCEPTION 'BRANDING_VIRTUAL_REFUND_INQUIRY_EVENT_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT v_inbox.id, v_inbox.decision_code,
    v_inbox.result_summary->>'result_info', v_inbox.result_summary->>'evidence';
END;
$$;

REVOKE ALL ON FUNCTION public.branding_process_virtual_refund_notification(
  text, text, bigint, text, text, text, text, text, text, integer, boolean,
  integer, text, timestamptz, timestamptz, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_process_virtual_refund_notification(
  text, text, bigint, text, text, text, text, text, text, integer, boolean,
  integer, text, timestamptz, timestamptz, integer, text
) TO service_role;

REVOKE ALL ON FUNCTION public.branding_process_virtual_ios_refund_inquiry(
  text, text, bigint, text, timestamptz, timestamptz, text, text, text,
  integer, text, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_process_virtual_ios_refund_inquiry(
  text, text, bigint, text, timestamptz, timestamptz, text, text, text,
  integer, text, integer, text
) TO service_role;

COMMENT ON TABLE public.wechat_virtual_refund_event_inbox IS
  'Authenticated immutable facts for virtual refund completion and iOS inquiry decisions.';
