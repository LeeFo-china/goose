ALTER TABLE public.social_video_transcriptions
ADD COLUMN IF NOT EXISTS billing_frozen_credits bigint NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS billing_correlation_id uuid NULL,
ADD COLUMN IF NOT EXISTS billing_event_id uuid NULL REFERENCES public.tenant_billing_events(id),
ADD COLUMN IF NOT EXISTS billing_charged boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS billing_charged_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS social_video_transcriptions_billing_event_idx
ON public.social_video_transcriptions(billing_event_id)
WHERE billing_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS social_video_transcriptions_billing_correlation_idx
ON public.social_video_transcriptions(billing_correlation_id)
WHERE billing_correlation_id IS NOT NULL;

COMMENT ON COLUMN public.social_video_transcriptions.billing_frozen_credits IS '短视频转文本任务预冻结积分';
COMMENT ON COLUMN public.social_video_transcriptions.billing_correlation_id IS '冻结、解冻、扣费关联 ID';
COMMENT ON COLUMN public.social_video_transcriptions.billing_event_id IS '短视频转文本计费事件 ID';
COMMENT ON COLUMN public.social_video_transcriptions.billing_charged IS '短视频转文本是否已真实扣费';
COMMENT ON COLUMN public.social_video_transcriptions.billing_charged_at IS '短视频转文本真实扣费完成时间';
