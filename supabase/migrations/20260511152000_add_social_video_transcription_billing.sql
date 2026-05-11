ALTER TABLE public.social_video_transcriptions
ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS billing_duration_seconds numeric(12, 2) NULL,
ADD COLUMN IF NOT EXISTS billing_minutes integer NULL,
ADD COLUMN IF NOT EXISTS billing_source text NULL,
ADD COLUMN IF NOT EXISTS billed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_tenant_billing_created
ON public.social_video_transcriptions(tenant_id, billable, status, created_at DESC);

COMMENT ON COLUMN public.social_video_transcriptions.billable IS '是否进入租户短视频转写分钟计费';
COMMENT ON COLUMN public.social_video_transcriptions.billing_duration_seconds IS '短视频转写最终计费秒数';
COMMENT ON COLUMN public.social_video_transcriptions.billing_minutes IS '短视频转写最终计费分钟，按秒数向上取整';
COMMENT ON COLUMN public.social_video_transcriptions.billing_source IS '短视频转写计费来源，如 tencent_asr、apify、cache、manual_backfill';
COMMENT ON COLUMN public.social_video_transcriptions.billed_at IS '短视频转写计费字段确认时间';
