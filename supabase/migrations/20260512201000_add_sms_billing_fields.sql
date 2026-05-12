ALTER TABLE public.sms_send_logs
ADD COLUMN IF NOT EXISTS delivery_status text NULL,
ADD COLUMN IF NOT EXISTS billed boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS billed_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS billing_event_id uuid NULL REFERENCES public.tenant_billing_events(id);

CREATE INDEX IF NOT EXISTS sms_send_logs_billing_event_idx
ON public.sms_send_logs(billing_event_id)
WHERE billing_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_send_logs_tenant_billed_created_idx
ON public.sms_send_logs(tenant_id, billed, created_at DESC);

COMMENT ON COLUMN public.sms_send_logs.delivery_status IS '短信供应商送达状态，第一期以提交成功或失败回执为准';
COMMENT ON COLUMN public.sms_send_logs.billed IS '该短信日志是否已真实扣费';
COMMENT ON COLUMN public.sms_send_logs.billed_at IS '真实扣费完成时间';
COMMENT ON COLUMN public.sms_send_logs.billing_event_id IS '关联的租户计费事件';
