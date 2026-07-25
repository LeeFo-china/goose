CREATE TABLE IF NOT EXISTS public.customer_wechat_pay_smoke_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  payment_config_id uuid NULL REFERENCES public.tenant_payment_configs(id) ON DELETE SET NULL,
  out_trade_no text NOT NULL,
  idempotency_key text NULL,
  amount_fen integer NOT NULL DEFAULT 100,
  paid_amount_fen integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CNY',
  status text NOT NULL DEFAULT 'pending',
  payer_openid text NOT NULL,
  prepay_id text NULL,
  transaction_id text NULL,
  trade_state text NULL,
  trade_state_desc text NULL,
  paid_at timestamptz NULL,
  closed_at timestamptz NULL,
  failed_at timestamptz NULL,
  failure_reason text NULL,
  latest_notification_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_wechat_pay_smoke_out_trade_no_not_blank
    CHECK (btrim(out_trade_no) <> ''),
  CONSTRAINT customer_wechat_pay_smoke_idempotency_key_not_blank
    CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> ''),
  CONSTRAINT customer_wechat_pay_smoke_payer_openid_not_blank
    CHECK (btrim(payer_openid) <> ''),
  CONSTRAINT customer_wechat_pay_smoke_transaction_id_not_blank
    CHECK (transaction_id IS NULL OR btrim(transaction_id) <> ''),
  CONSTRAINT customer_wechat_pay_smoke_amount_fen_check
    CHECK (amount_fen = 100),
  CONSTRAINT customer_wechat_pay_smoke_paid_amount_fen_check
    CHECK (paid_amount_fen >= 0),
  CONSTRAINT customer_wechat_pay_smoke_currency_check
    CHECK (currency = 'CNY'),
  CONSTRAINT customer_wechat_pay_smoke_status_check
    CHECK (status IN ('pending', 'paid', 'closed', 'refunded', 'failed')),
  CONSTRAINT customer_wechat_pay_smoke_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_wechat_pay_smoke_tenant_out_trade_unique_idx
ON public.customer_wechat_pay_smoke_orders(tenant_id, out_trade_no);

CREATE UNIQUE INDEX IF NOT EXISTS customer_wechat_pay_smoke_transaction_unique_idx
ON public.customer_wechat_pay_smoke_orders(transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_wechat_pay_smoke_idempotency_unique_idx
ON public.customer_wechat_pay_smoke_orders(tenant_id, customer_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_wechat_pay_smoke_customer_created_idx
ON public.customer_wechat_pay_smoke_orders(tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_wechat_pay_smoke_status_created_idx
ON public.customer_wechat_pay_smoke_orders(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_wechat_pay_smoke_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  smoke_order_id uuid NULL REFERENCES public.customer_wechat_pay_smoke_orders(id) ON DELETE SET NULL,
  notify_id text NOT NULL,
  event_type text NOT NULL,
  resource_type text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_wechat_pay_smoke_notifications_notify_id_not_blank
    CHECK (btrim(notify_id) <> ''),
  CONSTRAINT customer_wechat_pay_smoke_notifications_event_type_not_blank
    CHECK (btrim(event_type) <> ''),
  CONSTRAINT customer_wechat_pay_smoke_notifications_payload_object_check
    CHECK (jsonb_typeof(raw_payload) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_wechat_pay_smoke_notifications_notify_unique_idx
ON public.customer_wechat_pay_smoke_notifications(notify_id);

CREATE INDEX IF NOT EXISTS customer_wechat_pay_smoke_notifications_order_idx
ON public.customer_wechat_pay_smoke_notifications(smoke_order_id, created_at DESC)
WHERE smoke_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_customer_wechat_pay_smoke_orders_updated_at
ON public.customer_wechat_pay_smoke_orders;

CREATE TRIGGER tr_customer_wechat_pay_smoke_orders_updated_at
  BEFORE UPDATE ON public.customer_wechat_pay_smoke_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_customer_wechat_pay_smoke_notifications_updated_at
ON public.customer_wechat_pay_smoke_notifications;

CREATE TRIGGER tr_customer_wechat_pay_smoke_notifications_updated_at
  BEFORE UPDATE ON public.customer_wechat_pay_smoke_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.customer_wechat_pay_smoke_orders
IS '客户侧微信支付 1 元真实支付 smoke 订单；不关联项目应收或 workflow。';

COMMENT ON TABLE public.customer_wechat_pay_smoke_notifications
IS '客户侧微信支付 1 元 smoke 回调通知处理记录。';
