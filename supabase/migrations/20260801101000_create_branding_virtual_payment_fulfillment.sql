-- Rollback: first move the product to maintenance and finish every processing
-- or failed notification. In a forward migration revoke the confirmation RPC,
-- restore the previous order-state guard, drop the message-token trigger/function,
-- then drop the inbox table. Never delete virtual orders, entitlement events, or
-- provider payment identities; late paid facts must remain auditable.

BEGIN;

CREATE TABLE public.wechat_virtual_payment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  environment text NOT NULL,
  recipient_original_id text NOT NULL,
  sender_id_hash text NOT NULL,
  provider_created_at bigint NOT NULL,
  msg_type text NOT NULL,
  order_id uuid NULL
    REFERENCES public.tenant_virtual_addon_orders(id) ON DELETE RESTRICT,
  out_trade_no text NULL,
  provider_product_id text NULL,
  openid_hash text NULL,
  provider_order_no text NULL,
  transaction_id text NULL,
  paid_at timestamptz NULL,
  quantity integer NULL,
  orig_price_fen integer NULL,
  actual_price_fen integer NULL,
  attach text NULL,
  authentication_method text NOT NULL,
  authentication_status text NOT NULL,
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  retry_count integer NOT NULL DEFAULT 0,
  last_error_code text NULL,
  last_error_summary text NULL,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_virtual_payment_notifications_event_key_check
    CHECK (event_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT wechat_virtual_payment_notifications_event_type_check
    CHECK (event_type IN (
      'xpay_goods_deliver_notify',
      'xpay_refund_notify',
      'xpay_refund_inquiry'
    )),
  CONSTRAINT wechat_virtual_payment_notifications_environment_check
    CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT wechat_virtual_payment_notifications_recipient_check
    CHECK (
      char_length(recipient_original_id) <= 128
      AND recipient_original_id ~ '^gh_[A-Za-z0-9_-]+$'
    ),
  CONSTRAINT wechat_virtual_payment_notifications_sender_hash_check
    CHECK (sender_id_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT wechat_virtual_payment_notifications_created_at_check
    CHECK (provider_created_at BETWEEN 0 AND 4102444800),
  CONSTRAINT wechat_virtual_payment_notifications_msg_type_check
    CHECK (msg_type = 'event'),
  CONSTRAINT wechat_virtual_payment_notifications_trade_no_check
    CHECK (
      out_trade_no IS NULL
      OR (btrim(out_trade_no) <> '' AND char_length(out_trade_no) <= 32)
    ),
  CONSTRAINT wechat_virtual_payment_notifications_product_check
    CHECK (
      provider_product_id IS NULL
      OR (
        btrim(provider_product_id) <> ''
        AND char_length(provider_product_id) <= 128
      )
    ),
  CONSTRAINT wechat_virtual_payment_notifications_openid_hash_check
    CHECK (openid_hash IS NULL OR openid_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT wechat_virtual_payment_notifications_provider_order_check
    CHECK (
      provider_order_no IS NULL
      OR (btrim(provider_order_no) <> '' AND char_length(provider_order_no) <= 128)
    ),
  CONSTRAINT wechat_virtual_payment_notifications_transaction_check
    CHECK (
      transaction_id IS NULL
      OR (btrim(transaction_id) <> '' AND char_length(transaction_id) <= 128)
    ),
  CONSTRAINT wechat_virtual_payment_notifications_quantity_check
    CHECK (quantity IS NULL OR quantity = 1),
  CONSTRAINT wechat_virtual_payment_notifications_prices_check
    CHECK (
      (orig_price_fen IS NULL OR orig_price_fen BETWEEN 1 AND 2147483647)
      AND (actual_price_fen IS NULL OR actual_price_fen BETWEEN 1 AND 2147483647)
    ),
  CONSTRAINT wechat_virtual_payment_notifications_attach_check
    CHECK (
      attach IS NULL
      OR (btrim(attach) <> '' AND char_length(attach) <= 128)
    ),
  CONSTRAINT wechat_virtual_payment_notifications_goods_context_check
    CHECK (
      event_type <> 'xpay_goods_deliver_notify'
      OR (
        out_trade_no IS NOT NULL
        AND provider_product_id IS NOT NULL
        AND openid_hash IS NOT NULL
        AND provider_order_no IS NOT NULL
        AND transaction_id IS NOT NULL
        AND paid_at IS NOT NULL
        AND quantity IS NOT NULL
        AND orig_price_fen IS NOT NULL
        AND actual_price_fen IS NOT NULL
        AND attach IS NOT NULL
      )
    ),
  CONSTRAINT wechat_virtual_payment_notifications_auth_method_check
    CHECK (authentication_method = 'wechat_plaintext_sha1'),
  CONSTRAINT wechat_virtual_payment_notifications_auth_status_check
    CHECK (authentication_status = 'verified'),
  CONSTRAINT wechat_virtual_payment_notifications_payload_object_check
    CHECK (
      jsonb_typeof(normalized_payload) = 'object'
      AND NOT normalized_payload ? 'openid'
      AND NOT normalized_payload ? 'token'
      AND NOT normalized_payload ? 'appKey'
      AND NOT normalized_payload ? 'sessionKey'
    ),
  CONSTRAINT wechat_virtual_payment_notifications_payload_hash_check
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT wechat_virtual_payment_notifications_status_check
    CHECK (status IN ('processing', 'processed', 'failed')),
  CONSTRAINT wechat_virtual_payment_notifications_retry_count_check
    CHECK (retry_count >= 0),
  CONSTRAINT wechat_virtual_payment_notifications_error_code_check
    CHECK (
      last_error_code IS NULL
      OR (
        btrim(last_error_code) <> ''
        AND char_length(last_error_code) <= 100
      )
    ),
  CONSTRAINT wechat_virtual_payment_notifications_error_summary_check
    CHECK (
      last_error_summary IS NULL
      OR (
        btrim(last_error_summary) <> ''
        AND char_length(last_error_summary) <= 500
      )
    ),
  CONSTRAINT wechat_virtual_payment_notifications_result_object_check
    CHECK (jsonb_typeof(result_summary) = 'object'),
  CONSTRAINT wechat_virtual_payment_notifications_result_shape_check
    CHECK (
      event_type <> 'xpay_goods_deliver_notify'
      OR (
        (
          status = 'processed'
          AND jsonb_object_length(result_summary) = 4
          AND result_summary->>'payment_recorded' = 'true'
          AND result_summary->>'fulfilled' = 'true'
          AND result_summary->>'entitlement_event_id'
            ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND result_summary->>'entitlement_status'
            IN ('active', 'suspended', 'expired', 'revoked')
        )
        OR (status <> 'processed' AND result_summary = '{}'::jsonb)
      )
    ),
  CONSTRAINT wechat_virtual_payment_notifications_request_id_check
    CHECK (
      request_id IS NULL
      OR (btrim(request_id) <> '' AND char_length(request_id) <= 128)
    ),
  CONSTRAINT wechat_virtual_payment_notifications_processed_state_check
    CHECK (
      (status = 'processed' AND processed_at IS NOT NULL AND order_id IS NOT NULL)
      OR (status <> 'processed' AND processed_at IS NULL)
    )
);

CREATE INDEX wechat_virtual_payment_notifications_retry_idx
ON public.wechat_virtual_payment_notifications(status, received_at, id)
WHERE status IN ('processing', 'failed');

CREATE INDEX wechat_virtual_payment_notifications_order_received_idx
ON public.wechat_virtual_payment_notifications(order_id, received_at DESC, id DESC)
WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_wechat_virtual_payment_notification_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(
    OLD.event_key,
    OLD.event_type,
    OLD.environment,
    OLD.recipient_original_id,
    OLD.sender_id_hash,
    OLD.provider_created_at,
    OLD.msg_type,
    OLD.out_trade_no,
    OLD.provider_product_id,
    OLD.openid_hash,
    OLD.provider_order_no,
    OLD.transaction_id,
    OLD.paid_at,
    OLD.quantity,
    OLD.orig_price_fen,
    OLD.actual_price_fen,
    OLD.attach,
    OLD.authentication_method,
    OLD.authentication_status,
    OLD.normalized_payload,
    OLD.payload_sha256,
    OLD.request_id,
    OLD.received_at,
    OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.event_key,
    NEW.event_type,
    NEW.environment,
    NEW.recipient_original_id,
    NEW.sender_id_hash,
    NEW.provider_created_at,
    NEW.msg_type,
    NEW.out_trade_no,
    NEW.provider_product_id,
    NEW.openid_hash,
    NEW.provider_order_no,
    NEW.transaction_id,
    NEW.paid_at,
    NEW.quantity,
    NEW.orig_price_fen,
    NEW.actual_price_fen,
    NEW.attach,
    NEW.authentication_method,
    NEW.authentication_status,
    NEW.normalized_payload,
    NEW.payload_sha256,
    NEW.request_id,
    NEW.received_at,
    NEW.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_SNAPSHOT_IMMUTABLE';
  END IF;

  IF OLD.order_id IS NOT NULL
     AND NEW.order_id IS DISTINCT FROM OLD.order_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_ORDER_CONFLICT';
  END IF;

  IF NEW.retry_count < OLD.retry_count
     OR NEW.retry_count > OLD.retry_count + 1
     OR (
       NEW.retry_count IS DISTINCT FROM OLD.retry_count
       AND NEW.status <> 'failed'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_RETRY_MONOTONIC';
  END IF;

  IF NEW.status = 'failed'
     AND NEW.retry_count <> OLD.retry_count + 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_RETRY_MONOTONIC';
  END IF;

  IF OLD.result_summary <> '{}'::jsonb
     AND NEW.result_summary IS DISTINCT FROM OLD.result_summary
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_RESULT_IMMUTABLE';
  END IF;

  IF OLD.status = 'processed' AND ROW(
    NEW.status,
    NEW.order_id,
    NEW.retry_count,
    NEW.processed_at,
    NEW.result_summary,
    NEW.last_error_code,
    NEW.last_error_summary
  ) IS DISTINCT FROM ROW(
    OLD.status,
    OLD.order_id,
    OLD.retry_count,
    OLD.processed_at,
    OLD.result_summary,
    OLD.last_error_code,
    OLD.last_error_summary
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_PROCESSED_TERMINAL';
  END IF;

  IF OLD.status <> 'processed'
     AND NEW.status NOT IN ('failed', 'processed')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_PROCESSED_TERMINAL';
  END IF;

  IF OLD.processed_at IS NOT NULL
     AND NEW.processed_at IS DISTINCT FROM OLD.processed_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_PROCESSED_TERMINAL';
  END IF;

  IF ROW(NEW.last_error_code, NEW.last_error_summary)
     IS DISTINCT FROM ROW(OLD.last_error_code, OLD.last_error_summary)
     AND NOT (
       (
         NEW.status = 'failed'
         AND NEW.retry_count = OLD.retry_count + 1
       )
       OR (
         NEW.status = 'processed'
         AND NEW.last_error_code IS NULL
         AND NEW.last_error_summary IS NULL
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_PROCESSED_TERMINAL';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_wechat_virtual_payment_notification_snapshot()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_wechat_virtual_payment_notifications_snapshot_immutable
BEFORE UPDATE ON public.wechat_virtual_payment_notifications
FOR EACH ROW
EXECUTE FUNCTION public.guard_wechat_virtual_payment_notification_snapshot();

CREATE TRIGGER tr_wechat_virtual_payment_notifications_updated_at
BEFORE UPDATE ON public.wechat_virtual_payment_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wechat_virtual_payment_notifications
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wechat_virtual_payment_notifications
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wechat_virtual_payment_notifications
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT
ON TABLE public.wechat_virtual_payment_notifications
TO service_role;

CREATE OR REPLACE FUNCTION public.wechat_accept_virtual_payment_notification(
  p_event_type text,
  p_environment text,
  p_recipient_original_id text,
  p_sender_id_hash text,
  p_provider_created_at bigint,
  p_msg_type text,
  p_out_trade_no text,
  p_provider_product_id text,
  p_openid_hash text,
  p_provider_order_no text,
  p_transaction_id text,
  p_paid_at timestamptz,
  p_quantity integer,
  p_orig_price_fen integer,
  p_actual_price_fen integer,
  p_attach text,
  p_request_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_key text;
  v_normalized_payload jsonb;
  v_payload_sha256 text;
  v_notification public.wechat_virtual_payment_notifications%ROWTYPE;
  v_created boolean := false;
BEGIN
  IF p_event_type IS NULL
     OR p_event_type <> 'xpay_goods_deliver_notify'
     OR p_environment IS NULL
     OR p_environment NOT IN ('sandbox', 'production')
     OR p_recipient_original_id IS NULL
     OR char_length(p_recipient_original_id) > 128
     OR p_recipient_original_id !~ '^gh_[A-Za-z0-9_-]+$'
     OR p_sender_id_hash IS NULL
     OR p_sender_id_hash !~ '^[0-9a-f]{64}$'
     OR p_provider_created_at IS NULL
     OR p_provider_created_at NOT BETWEEN 0 AND 4102444800
     OR p_msg_type IS NULL
     OR p_msg_type <> 'event'
     OR p_out_trade_no IS NULL OR btrim(p_out_trade_no) = ''
     OR char_length(p_out_trade_no) > 32
     OR p_provider_product_id IS NULL OR btrim(p_provider_product_id) = ''
     OR char_length(p_provider_product_id) > 128
     OR p_openid_hash IS NULL OR p_openid_hash !~ '^[0-9a-f]{64}$'
     OR p_provider_order_no IS NULL OR btrim(p_provider_order_no) = ''
     OR char_length(p_provider_order_no) > 128
     OR p_transaction_id IS NULL OR btrim(p_transaction_id) = ''
     OR char_length(p_transaction_id) > 128
     OR p_paid_at IS NULL
     OR p_quantity IS DISTINCT FROM 1
     OR p_orig_price_fen IS NULL
     OR p_orig_price_fen NOT BETWEEN 1 AND 2147483647
     OR p_actual_price_fen IS NULL
     OR p_actual_price_fen NOT BETWEEN 1 AND 2147483647
     OR p_attach IS NULL OR btrim(p_attach) = ''
     OR char_length(p_attach) > 128
     OR (
       p_request_id IS NOT NULL
       AND (btrim(p_request_id) = '' OR char_length(p_request_id) > 128)
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_INPUT_INVALID';
  END IF;

  v_event_key := encode(
    digest(p_event_type || E'\n' || p_transaction_id, 'sha256'),
    'hex'
  );
  v_normalized_payload := jsonb_build_object(
    'event_type', p_event_type,
    'environment', p_environment,
    'recipient_original_id', p_recipient_original_id,
    'sender_id_hash', p_sender_id_hash,
    'provider_created_at', p_provider_created_at,
    'msg_type', p_msg_type,
    'out_trade_no', p_out_trade_no,
    'provider_product_id', p_provider_product_id,
    'openid_hash', p_openid_hash,
    'provider_order_no', p_provider_order_no,
    'transaction_id', p_transaction_id,
    'paid_at', to_char(
      p_paid_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'quantity', p_quantity,
    'orig_price_fen', p_orig_price_fen,
    'actual_price_fen', p_actual_price_fen,
    'attach', p_attach
  );
  v_payload_sha256 := encode(
    digest(v_normalized_payload::text, 'sha256'),
    'hex'
  );

  INSERT INTO public.wechat_virtual_payment_notifications (
    event_key, event_type, environment, recipient_original_id,
    sender_id_hash, provider_created_at, msg_type, out_trade_no,
    provider_product_id, openid_hash, provider_order_no, transaction_id,
    paid_at, quantity, orig_price_fen, actual_price_fen, attach,
    authentication_method, authentication_status, normalized_payload,
    payload_sha256, request_id
  ) VALUES (
    v_event_key, p_event_type, p_environment, p_recipient_original_id,
    p_sender_id_hash, p_provider_created_at, p_msg_type, p_out_trade_no,
    p_provider_product_id, p_openid_hash, p_provider_order_no,
    p_transaction_id, p_paid_at, p_quantity, p_orig_price_fen,
    p_actual_price_fen, p_attach,
    'wechat_plaintext_sha1', 'verified', v_normalized_payload,
    v_payload_sha256, p_request_id
  )
  ON CONFLICT (event_key) DO NOTHING
  RETURNING * INTO v_notification;

  IF FOUND THEN
    v_created := true;
  ELSE
    SELECT notification.* INTO v_notification
    FROM public.wechat_virtual_payment_notifications AS notification
    WHERE notification.event_key = v_event_key
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_NOT_FOUND';
    END IF;
    IF v_notification.payload_sha256 IS DISTINCT FROM v_payload_sha256 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_EVENT_CONFLICT';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'created', v_created,
    'record', jsonb_build_object(
      'id', v_notification.id,
      'event_key', v_notification.event_key,
      'payload_sha256', v_notification.payload_sha256,
      'status', v_notification.status,
      'order_id', v_notification.order_id,
      'retry_count', v_notification.retry_count,
      'result_summary', v_notification.result_summary
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wechat_accept_virtual_payment_notification(
  text, text, text, text, bigint, text, text, text, text, text, text,
  timestamptz, integer, integer, integer, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wechat_accept_virtual_payment_notification(
  text, text, text, text, bigint, text, text, text, text, text, text,
  timestamptz, integer, integer, integer, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.wechat_mark_virtual_payment_notification_processed(
  p_notification_id uuid,
  p_order_id uuid,
  p_payment_recorded boolean,
  p_fulfilled boolean,
  p_entitlement_event_id uuid,
  p_entitlement_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification public.wechat_virtual_payment_notifications%ROWTYPE;
  v_result_summary jsonb;
BEGIN
  IF p_notification_id IS NULL
     OR p_order_id IS NULL
     OR p_payment_recorded IS DISTINCT FROM true
     OR p_fulfilled IS DISTINCT FROM true
     OR p_entitlement_event_id IS NULL
     OR p_entitlement_status IS NULL
     OR p_entitlement_status NOT IN ('active', 'suspended', 'expired', 'revoked')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_INPUT_INVALID';
  END IF;

  v_result_summary := jsonb_build_object(
    'payment_recorded', p_payment_recorded,
    'fulfilled', true,
    'entitlement_event_id', p_entitlement_event_id,
    'entitlement_status', p_entitlement_status
  );

  SELECT notification.* INTO v_notification
  FROM public.wechat_virtual_payment_notifications AS notification
  WHERE notification.id = p_notification_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_NOT_FOUND';
  END IF;
  IF v_notification.order_id IS NOT NULL
     AND v_notification.order_id IS DISTINCT FROM p_order_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_ORDER_CONFLICT';
  END IF;
  IF v_notification.status = 'processed' THEN
    IF v_notification.result_summary IS DISTINCT FROM v_result_summary THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_RESULT_IMMUTABLE';
    END IF;
  ELSE
    UPDATE public.wechat_virtual_payment_notifications
    SET order_id = COALESCE(order_id, p_order_id),
        status = 'processed',
        result_summary = v_result_summary,
        last_error_code = NULL,
        last_error_summary = NULL,
        processed_at = now()
    WHERE id = p_notification_id
    RETURNING * INTO v_notification;
  END IF;

  RETURN jsonb_build_object(
    'id', v_notification.id,
    'event_key', v_notification.event_key,
    'payload_sha256', v_notification.payload_sha256,
    'status', v_notification.status,
    'order_id', v_notification.order_id,
    'retry_count', v_notification.retry_count,
    'result_summary', v_notification.result_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wechat_mark_virtual_payment_notification_processed(
  uuid, uuid, boolean, boolean, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wechat_mark_virtual_payment_notification_processed(
  uuid, uuid, boolean, boolean, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.wechat_mark_virtual_payment_notification_failed(
  p_notification_id uuid,
  p_order_id uuid,
  p_error_code text,
  p_error_summary text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification public.wechat_virtual_payment_notifications%ROWTYPE;
BEGIN
  IF p_notification_id IS NULL
     OR p_error_code IS NULL OR btrim(p_error_code) = ''
     OR char_length(p_error_code) > 100
     OR p_error_summary IS NULL OR btrim(p_error_summary) = ''
     OR char_length(p_error_summary) > 500
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_INPUT_INVALID';
  END IF;

  SELECT notification.* INTO v_notification
  FROM public.wechat_virtual_payment_notifications AS notification
  WHERE notification.id = p_notification_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_NOT_FOUND';
  END IF;
  IF v_notification.status = 'processed' THEN
    RETURN jsonb_build_object(
      'id', v_notification.id,
      'event_key', v_notification.event_key,
      'payload_sha256', v_notification.payload_sha256,
      'status', v_notification.status,
      'order_id', v_notification.order_id,
      'retry_count', v_notification.retry_count,
      'result_summary', v_notification.result_summary
    );
  END IF;
  IF v_notification.order_id IS NOT NULL
     AND v_notification.order_id IS DISTINCT FROM p_order_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_NOTIFICATION_ORDER_CONFLICT';
  END IF;

  UPDATE public.wechat_virtual_payment_notifications
  SET order_id = COALESCE(order_id, p_order_id),
      status = 'failed',
      retry_count = retry_count + 1,
      last_error_code = p_error_code,
      last_error_summary = p_error_summary
  WHERE id = p_notification_id
  RETURNING * INTO v_notification;

  RETURN jsonb_build_object(
    'id', v_notification.id,
    'event_key', v_notification.event_key,
    'payload_sha256', v_notification.payload_sha256,
    'status', v_notification.status,
    'order_id', v_notification.order_id,
    'retry_count', v_notification.retry_count,
    'result_summary', v_notification.result_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wechat_mark_virtual_payment_notification_failed(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.wechat_mark_virtual_payment_notification_failed(
  uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_wechat_virtual_payment_message_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_protected boolean := false;
  v_new_protected boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_protected := OLD.key = 'WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_protected := NEW.key = 'WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN';
  END IF;

  IF NOT v_old_protected AND NOT v_new_protected THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    OLD.key IS DISTINCT FROM NEW.key
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.is_secret IS DISTINCT FROM NEW.is_secret
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_MESSAGE_TOKEN_IDENTITY_IMMUTABLE';
  END IF;

  IF TG_OP <> 'DELETE'
     AND (NEW.tenant_id IS NOT NULL OR NEW.is_secret IS NOT TRUE)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_MESSAGE_TOKEN_SCOPE_INVALID';
  END IF;
  IF TG_OP = 'DELETE'
     AND (OLD.tenant_id IS NOT NULL OR OLD.is_secret IS NOT TRUE)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'WECHAT_VIRTUAL_MESSAGE_TOKEN_SCOPE_INVALID';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_wechat_virtual_payment_message_token()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_system_settings_wechat_virtual_message_token
BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.guard_wechat_virtual_payment_message_token();

CREATE OR REPLACE FUNCTION public.guard_tenant_virtual_addon_order_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status
     AND NOT (
       (
         OLD.payment_status = 'pending'
         AND NEW.payment_status IN ('succeeded', 'closed', 'failed')
       )
       OR (
         OLD.payment_status = 'closed'
         AND NEW.payment_status = 'succeeded'
         AND OLD.payment_request_issued_at IS NOT NULL
         AND NEW.fulfillment_status = 'grant_failed'
         AND NEW.paid_amount_fen = NEW.amount_fen
         AND NEW.paid_at IS NOT NULL
         AND NEW.failure_code = 'BRANDING_VIRTUAL_LATE_PAYMENT_AFTER_CLOSE'
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_STATUS_TRANSITION_INVALID';
  END IF;

  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status
     AND NOT (
       (
         OLD.fulfillment_status = 'pending'
         AND NEW.fulfillment_status IN ('granted', 'grant_failed')
       )
       OR (
         OLD.fulfillment_status = 'grant_failed'
         AND NEW.fulfillment_status = 'granted'
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_FULFILLMENT_STATUS_TRANSITION_INVALID';
  END IF;

  IF OLD.refund_status IS DISTINCT FROM NEW.refund_status
     AND NOT (
       (OLD.refund_status = 'none' AND NEW.refund_status = 'reviewing')
       OR (
         OLD.refund_status = 'reviewing'
         AND NEW.refund_status IN ('submitted', 'external_required', 'rejected')
       )
       OR (
         OLD.refund_status = 'submitted'
         AND NEW.refund_status IN ('succeeded', 'failed')
       )
       OR (
         OLD.refund_status = 'external_required'
         AND NEW.refund_status IN ('succeeded', 'failed')
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_STATUS_TRANSITION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_confirm_virtual_addon_purchase(
  p_order_id uuid,
  p_notification_id uuid,
  p_source text,
  p_allow_late_closed_recovery boolean,
  p_event_type text,
  p_recipient_original_id text,
  p_sender_id_hash text,
  p_provider_created_at bigint,
  p_msg_type text,
  p_successful_state boolean,
  p_environment text,
  p_openid text,
  p_out_trade_no text,
  p_provider_product_id text,
  p_quantity integer,
  p_currency text,
  p_orig_price_fen integer,
  p_actual_price_fen integer,
  p_provider_order_no text,
  p_transaction_id text,
  p_paid_at timestamptz,
  p_attach text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_notification public.wechat_virtual_payment_notifications%ROWTYPE;
  v_tenant_id uuid;
  v_entitlement public.tenant_entitlements%ROWTYPE;
  v_event public.tenant_entitlement_events%ROWTYPE;
  v_old_value jsonb := '{}'::jsonb;
  v_event_type text;
  v_is_late_closed boolean := false;
BEGIN
  IF p_order_id IS NULL
     OR p_source IS NULL
     OR p_source NOT IN ('notification', 'query', 'reconciliation')
     OR p_allow_late_closed_recovery IS NULL
     OR (
       p_allow_late_closed_recovery
       AND p_source IS DISTINCT FROM 'reconciliation'
     )
     OR p_event_type IS NULL
     OR p_event_type NOT IN ('xpay_goods_deliver_notify', 'query_order')
     OR (p_source = 'notification' AND p_msg_type IS NULL)
     OR NOT (
       (
         p_source = 'notification'
         AND p_notification_id IS NOT NULL
         AND p_event_type = 'xpay_goods_deliver_notify'
         AND p_recipient_original_id IS NOT NULL
         AND char_length(p_recipient_original_id) <= 128
         AND p_recipient_original_id ~ '^gh_[A-Za-z0-9_-]+$'
         AND p_sender_id_hash IS NOT NULL
         AND p_sender_id_hash ~ '^[0-9a-f]{64}$'
         AND p_provider_created_at IS NOT NULL
         AND p_provider_created_at BETWEEN 0 AND 4102444800
         AND p_msg_type = 'event'
       )
       OR (
         p_source IN ('query', 'reconciliation')
         AND p_notification_id IS NULL
         AND p_event_type = 'query_order'
         AND p_recipient_original_id IS NULL
         AND p_sender_id_hash IS NULL
         AND p_provider_created_at IS NULL
         AND p_msg_type IS NULL
       )
     )
     OR p_successful_state IS DISTINCT FROM true
     OR p_environment IS NULL
     OR p_environment NOT IN ('sandbox', 'production')
     OR p_openid IS NULL OR btrim(p_openid) = ''
     OR char_length(p_openid) > 128
     OR p_out_trade_no IS NULL OR btrim(p_out_trade_no) = ''
     OR char_length(p_out_trade_no) > 32
     OR p_provider_product_id IS NULL OR btrim(p_provider_product_id) = ''
     OR char_length(p_provider_product_id) > 128
     OR p_quantity IS DISTINCT FROM 1
     OR (p_currency IS NOT NULL AND p_currency <> 'CNY')
     OR p_orig_price_fen IS NULL OR p_orig_price_fen <= 0
     OR p_actual_price_fen IS NULL OR p_actual_price_fen <= 0
     OR p_provider_order_no IS NULL OR btrim(p_provider_order_no) = ''
     OR char_length(p_provider_order_no) > 128
     OR p_transaction_id IS NULL OR btrim(p_transaction_id) = ''
     OR char_length(p_transaction_id) > 128
     OR p_paid_at IS NULL
     OR p_attach IS NULL OR btrim(p_attach) = ''
     OR char_length(p_attach) > 128
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_CONFIRM_INPUT_INVALID';
  END IF;

  SELECT orders.tenant_id
  INTO v_tenant_id
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_FOUND';
  END IF;

  -- Global lock order for branding entitlement writers:
  -- tenant entitlement advisory -> provider identity advisories -> order row
  -- -> entitlement row. Task 5 takes the same tenant advisory before config and
  -- order locks, so notification/query confirmation cannot deadlock issuance.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_tenant_id::text || ':custom_support_branding', 20260728)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('wechat_virtual_tx:' || p_transaction_id, 20260801)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended('wechat_virtual_order:' || p_provider_order_no, 20260801)
  );

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_ORDER_NOT_FOUND';
  END IF;

  IF encode(digest(v_order.payer_openid, 'sha256'), 'hex')
     IS DISTINCT FROM encode(digest(p_openid, 'sha256'), 'hex')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_OPENID_MISMATCH';
  END IF;
  IF v_order.out_trade_no IS DISTINCT FROM p_out_trade_no THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_OUT_TRADE_NO_MISMATCH';
  END IF;
  IF v_order.environment IS DISTINCT FROM p_environment THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_ENVIRONMENT_MISMATCH';
  END IF;
  IF v_order.provider_product_id IS DISTINCT FROM p_provider_product_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_PRODUCT_MISMATCH';
  END IF;
  IF p_quantity IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_QUANTITY_MISMATCH';
  END IF;
  IF p_currency IS NOT NULL AND p_currency <> 'CNY' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_CURRENCY_MISMATCH';
  END IF;
  IF v_order.amount_fen IS DISTINCT FROM p_orig_price_fen
     OR v_order.amount_fen IS DISTINCT FROM p_actual_price_fen
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH';
  END IF;
  IF p_attach IS DISTINCT FROM v_order.id::text THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_ATTACH_MISMATCH';
  END IF;

  IF p_notification_id IS NOT NULL THEN
    SELECT notification.* INTO v_notification
    FROM public.wechat_virtual_payment_notifications AS notification
    WHERE notification.id = p_notification_id
    FOR SHARE;
    IF NOT FOUND
       OR v_notification.authentication_status <> 'verified'
       OR v_notification.event_type <> 'xpay_goods_deliver_notify'
       OR v_notification.recipient_original_id IS DISTINCT FROM
          p_recipient_original_id
       OR v_notification.sender_id_hash IS DISTINCT FROM p_sender_id_hash
       OR v_notification.provider_created_at IS DISTINCT FROM
          p_provider_created_at
       OR v_notification.msg_type IS DISTINCT FROM p_msg_type
       OR v_notification.environment IS DISTINCT FROM v_order.environment
       OR v_notification.out_trade_no IS DISTINCT FROM v_order.out_trade_no
       OR v_notification.provider_product_id IS DISTINCT FROM
          v_order.provider_product_id
       OR v_notification.openid_hash IS DISTINCT FROM
          encode(digest(p_openid, 'sha256'), 'hex')
       OR v_notification.provider_order_no IS DISTINCT FROM p_provider_order_no
       OR v_notification.transaction_id IS DISTINCT FROM p_transaction_id
       OR v_notification.paid_at IS DISTINCT FROM p_paid_at
       OR v_notification.quantity IS DISTINCT FROM p_quantity
       OR v_notification.orig_price_fen IS DISTINCT FROM p_orig_price_fen
       OR v_notification.actual_price_fen IS DISTINCT FROM p_actual_price_fen
       OR v_notification.attach IS DISTINCT FROM p_attach
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_NOTIFICATION_MISMATCH';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_virtual_addon_orders AS other_order
    WHERE other_order.id <> v_order.id
      AND other_order.transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_TRANSACTION_CONFLICT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_virtual_addon_orders AS other_order
    WHERE other_order.id <> v_order.id
      AND other_order.provider_order_no = p_provider_order_no
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_PROVIDER_ORDER_CONFLICT';
  END IF;

  IF v_order.payment_status = 'succeeded' THEN
    IF v_order.transaction_id IS DISTINCT FROM p_transaction_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_TRANSACTION_CONFLICT';
    END IF;
    IF v_order.provider_order_no IS DISTINCT FROM p_provider_order_no THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_PROVIDER_ORDER_CONFLICT';
    END IF;
    IF v_order.paid_amount_fen IS DISTINCT FROM p_actual_price_fen
       OR v_order.paid_at IS DISTINCT FROM p_paid_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH';
    END IF;
    IF v_order.entitlement_event_id IS NOT NULL
       AND v_order.fulfillment_status = 'granted'
    THEN
      SELECT entitlement.* INTO v_entitlement
      FROM public.tenant_entitlements AS entitlement
      WHERE entitlement.tenant_id = v_order.tenant_id
        AND entitlement.entitlement_code = v_order.entitlement_code;
      RETURN jsonb_build_object(
        'idempotent', true,
        'payment_recorded', true,
        'fulfilled', true,
        'recoverable', false,
        'entitlement_event_id', v_order.entitlement_event_id,
        'entitlement_status', v_entitlement.status,
        'failure_code', NULL
      );
    END IF;
    v_is_late_closed := v_order.failure_code =
      'BRANDING_VIRTUAL_LATE_PAYMENT_AFTER_CLOSE';
  ELSIF v_order.payment_status = 'pending' THEN
    IF v_order.payment_request_issued_at IS NULL
       OR v_order.payment_request_attempt_revision < 1
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_LATE_UNISSUED_ORDER';
    END IF;
    UPDATE public.tenant_virtual_addon_orders
    SET payment_status = 'succeeded',
        fulfillment_status = 'grant_failed',
        settlement_channel = 'wechat',
        provider_order_no = p_provider_order_no,
        transaction_id = p_transaction_id,
        paid_amount_fen = p_actual_price_fen,
        paid_at = p_paid_at,
        failure_code = 'BRANDING_VIRTUAL_ENTITLEMENT_GRANT_PENDING',
        failure_message = '支付已确认，权益等待发放',
        payment_request_claim_token = NULL,
        payment_request_claimed_at = NULL,
        payment_request_claim_expires_at = NULL
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  ELSIF v_order.payment_status = 'closed' THEN
    IF v_order.payment_request_issued_at IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_LATE_UNISSUED_ORDER';
    END IF;
    v_is_late_closed := true;
    UPDATE public.tenant_virtual_addon_orders
    SET payment_status = 'succeeded',
        fulfillment_status = 'grant_failed',
        settlement_channel = 'wechat',
        provider_order_no = p_provider_order_no,
        transaction_id = p_transaction_id,
        paid_amount_fen = p_actual_price_fen,
        paid_at = p_paid_at,
        failure_code = 'BRANDING_VIRTUAL_LATE_PAYMENT_AFTER_CLOSE',
        failure_message = '已关闭订单收到微信支付成功事实，等待补偿复核',
        payment_request_claim_token = NULL,
        payment_request_claimed_at = NULL,
        payment_request_claim_expires_at = NULL
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_ORDER_STATUS_INVALID';
  END IF;

  IF v_is_late_closed AND NOT p_allow_late_closed_recovery THEN
    RETURN jsonb_build_object(
      'idempotent', false,
      'payment_recorded', true,
      'fulfilled', false,
      'recoverable', true,
      'entitlement_event_id', NULL,
      'entitlement_status', NULL,
      'failure_code', 'BRANDING_VIRTUAL_LATE_PAYMENT_AFTER_CLOSE'
    );
  END IF;

  BEGIN
    SELECT entitlement.* INTO v_entitlement
    FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = v_order.tenant_id
      AND entitlement.entitlement_code = v_order.entitlement_code
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.tenant_entitlements (
        tenant_id, entitlement_code, status, starts_at, expires_at,
        source_type, source_id, version, updated_by_employee_id
      ) VALUES (
        v_order.tenant_id, v_order.entitlement_code, 'active', p_paid_at,
        p_paid_at + interval '1 year', 'purchase', v_order.id, 1, NULL
      )
      RETURNING * INTO v_entitlement;
      v_event_type := 'granted';
    ELSE
      v_old_value := to_jsonb(v_entitlement);
      v_event_type := 'renewed';
      IF v_entitlement.status IN ('suspended', 'revoked') THEN
        UPDATE public.tenant_entitlements
        SET expires_at = GREATEST(expires_at, p_paid_at) + interval '1 year',
            source_type = 'purchase',
            source_id = v_order.id,
            version = version + 1,
            updated_by_employee_id = NULL
        WHERE id = v_entitlement.id
        RETURNING * INTO v_entitlement;
      ELSIF v_entitlement.status = 'active'
        AND v_entitlement.expires_at > p_paid_at
      THEN
        UPDATE public.tenant_entitlements
        SET expires_at = expires_at + interval '1 year',
            source_type = 'purchase',
            source_id = v_order.id,
            version = version + 1,
            updated_by_employee_id = NULL
        WHERE id = v_entitlement.id
        RETURNING * INTO v_entitlement;
      ELSE
        UPDATE public.tenant_entitlements
        SET status = 'active',
            starts_at = p_paid_at,
            expires_at = p_paid_at + interval '1 year',
            source_type = 'purchase',
            source_id = v_order.id,
            suspended_at = NULL,
            suspend_reason = NULL,
            version = version + 1,
            updated_by_employee_id = NULL
        WHERE id = v_entitlement.id
        RETURNING * INTO v_entitlement;
      END IF;
    END IF;

    INSERT INTO public.tenant_entitlement_events (
      entitlement_id, tenant_id, entitlement_code, event_type,
      source_type, source_id, old_value, new_value, reason,
      actor_employee_id, actor_user_id
    ) VALUES (
      v_entitlement.id, v_entitlement.tenant_id,
      v_entitlement.entitlement_code, v_event_type, 'purchase', v_order.id,
      v_old_value, to_jsonb(v_entitlement),
      'Annual branding virtual-payment purchase confirmed', NULL, NULL
    )
    RETURNING * INTO v_event;

    UPDATE public.tenant_virtual_addon_orders
    SET fulfillment_status = 'granted',
        entitlement_event_id = v_event.id,
        failure_code = NULL,
        failure_message = NULL
    WHERE id = v_order.id
      AND payment_status = 'succeeded'
      AND fulfillment_status = 'grant_failed'
    RETURNING * INTO v_order;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_ORDER_STATUS_INVALID';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      UPDATE public.tenant_virtual_addon_orders
      SET fulfillment_status = 'grant_failed',
          failure_code = 'BRANDING_VIRTUAL_ENTITLEMENT_GRANT_FAILED',
          failure_message = '支付已确认，权益发放失败，等待重试'
      WHERE id = v_order.id;
      RETURN jsonb_build_object(
        'idempotent', false,
        'payment_recorded', true,
        'fulfilled', false,
        'recoverable', true,
        'entitlement_event_id', NULL,
        'entitlement_status', NULL,
        'failure_code', 'BRANDING_VIRTUAL_ENTITLEMENT_GRANT_FAILED'
      );
  END;

  RETURN jsonb_build_object(
    'idempotent', false,
    'payment_recorded', true,
    'fulfilled', true,
    'recoverable', false,
    'entitlement_event_id', v_event.id,
    'entitlement_status', v_entitlement.status,
    'failure_code', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.branding_confirm_virtual_addon_purchase(
  uuid, uuid, text, boolean, text, text, text, bigint, text,
  boolean, text, text, text, text,
  integer, text, integer, integer, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.branding_confirm_virtual_addon_purchase(
  uuid, uuid, text, boolean, text, text, text, bigint, text,
  boolean, text, text, text, text,
  integer, text, integer, integer, text, text, timestamptz, text
) TO service_role;

COMMENT ON TABLE public.wechat_virtual_payment_notifications
IS 'Private sanitized inbox for authenticated WeChat virtual-payment events; raw bodies, tokens, signatures, AppKeys, session keys, and plaintext OpenIDs are forbidden.';
COMMENT ON FUNCTION public.branding_confirm_virtual_addon_purchase(
  uuid, uuid, text, boolean, text, text, text, bigint, text,
  boolean, text, text, text, text,
  integer, text, integer, integer, text, text, timestamptz, text
) IS 'Records one provider payment fact, then grants or renews annual branding entitlement in a recoverable subtransaction using tenant-before-order lock order.';

COMMIT;
