CREATE TABLE IF NOT EXISTS public.sms_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id),
  provider text NOT NULL,
  channel_mode text NULL,
  purpose text NOT NULL,
  template_code text NULL,
  phone_masked text NOT NULL,
  phone_hash text NOT NULL,
  status text NOT NULL,
  request_id text NULL,
  provider_code text NULL,
  provider_message text NULL,
  error_code text NULL,
  error_message text NULL,
  sms_count integer NOT NULL DEFAULT 1,
  duration_ms integer NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_send_logs_status_check CHECK (
    status IN ('success', 'failure', 'mock', 'disabled')
  ),
  CONSTRAINT sms_send_logs_sms_count_check CHECK (sms_count >= 0)
);

CREATE INDEX IF NOT EXISTS sms_send_logs_tenant_created_idx
ON public.sms_send_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_send_logs_tenant_status_created_idx
ON public.sms_send_logs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_send_logs_tenant_purpose_created_idx
ON public.sms_send_logs(tenant_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_send_logs_phone_hash_created_idx
ON public.sms_send_logs(phone_hash, created_at DESC);

ALTER TABLE public.ai_call_logs
ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS source text NULL,
ADD COLUMN IF NOT EXISTS cost_estimate numeric(12, 6) NULL;

CREATE TABLE IF NOT EXISTS public.tenant_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  usage_date date NOT NULL,
  ai_call_count integer NOT NULL DEFAULT 0,
  ai_success_count integer NOT NULL DEFAULT 0,
  ai_failure_count integer NOT NULL DEFAULT 0,
  ai_prompt_tokens integer NOT NULL DEFAULT 0,
  ai_completion_tokens integer NOT NULL DEFAULT 0,
  ai_total_tokens integer NOT NULL DEFAULT 0,
  ai_missing_token_count integer NOT NULL DEFAULT 0,
  sms_send_count integer NOT NULL DEFAULT 0,
  sms_success_count integer NOT NULL DEFAULT 0,
  sms_failure_count integer NOT NULL DEFAULT 0,
  sms_mock_count integer NOT NULL DEFAULT 0,
  sms_disabled_count integer NOT NULL DEFAULT 0,
  social_video_transcription_count integer NOT NULL DEFAULT 0,
  social_video_duration_seconds numeric(12, 2) NOT NULL DEFAULT 0,
  social_video_missing_duration_count integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, usage_date)
);

CREATE INDEX IF NOT EXISTS tenant_usage_daily_tenant_date_idx
ON public.tenant_usage_daily(tenant_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS tenant_usage_daily_date_idx
ON public.tenant_usage_daily(usage_date DESC);

DROP TRIGGER IF EXISTS tr_tenant_usage_daily_updated_at ON public.tenant_usage_daily;
CREATE TRIGGER tr_tenant_usage_daily_updated_at
BEFORE UPDATE ON public.tenant_usage_daily
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.sms_send_logs IS '短信发送明细日志，用于租户短信用量统计和失败排查';
COMMENT ON TABLE public.tenant_usage_daily IS '租户每日资源用量汇总';
COMMENT ON COLUMN public.ai_call_logs.billable IS '是否计入租户 AI 用量账单';
COMMENT ON COLUMN public.ai_call_logs.source IS 'AI 调用来源模块';
COMMENT ON COLUMN public.ai_call_logs.cost_estimate IS '按模型单价估算的调用成本，MVP 可为空';
