-- Phase 9 Task 5: callback lookup indexes for WeChat Pay notifications.

CREATE INDEX IF NOT EXISTS wechat_payment_orders_out_trade_no_idx
ON public.wechat_payment_orders(out_trade_no);

CREATE INDEX IF NOT EXISTS tenant_payment_configs_wechat_callback_candidates_idx
ON public.tenant_payment_configs(provider, status, updated_at DESC)
WHERE provider = 'wechat_pay'
  AND encrypted_config_ref IS NOT NULL;
