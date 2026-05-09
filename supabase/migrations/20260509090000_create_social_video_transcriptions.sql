CREATE TABLE IF NOT EXISTS public.social_video_transcriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  source_url text NOT NULL,
  normalized_url text NOT NULL,
  input_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  provider text NULL,
  provider_actor_id text NULL,
  provider_run_id text NULL,
  provider_dataset_id text NULL,
  title text NULL,
  text text NULL,
  segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NULL,
  error_code text NULL,
  error_message text NULL,
  created_by_auth_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT social_video_transcriptions_platform_check CHECK (
    platform = ANY (ARRAY['douyin'::text])
  ),
  CONSTRAINT social_video_transcriptions_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending'::text,
        'resolving'::text,
        'transcribing'::text,
        'completed'::text,
        'failed'::text
      ]
    )
  ),
  CONSTRAINT social_video_transcriptions_progress_check CHECK (
    progress >= 0 AND progress <= 100
  )
);

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_input_hash
ON public.social_video_transcriptions USING btree (input_hash);

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_status
ON public.social_video_transcriptions USING btree (status);

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_created_by
ON public.social_video_transcriptions USING btree (created_by_auth_user_id, created_at DESC);

DROP TRIGGER IF EXISTS tr_social_video_transcriptions_updated_at ON public.social_video_transcriptions;
CREATE TRIGGER tr_social_video_transcriptions_updated_at
BEFORE UPDATE ON public.social_video_transcriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.system_settings (
  key,
  group_code,
  name,
  description,
  value_type,
  value_text,
  is_secret,
  status
)
VALUES
  ('SOCIAL_VIDEO_TRANSCRIPTION_ENABLED', 'social_video', '短视频语音识别开关', '是否启用小程序抖音链接语音转文本能力。', 'boolean', NULL, false, 'active'),
  ('APIFY_API_TOKEN', 'social_video', 'Apify API Token', 'Apify API Token，加密存储。', 'string', NULL, true, 'active'),
  ('APIFY_TRANSCRIPT_ACTOR_ID', 'social_video', 'Apify 转写 Actor ID', '用于抖音视频转文本的 Apify Actor ID。默认 apple_yang/douyin-transcripts-scraper。', 'string', NULL, false, 'active'),
  ('APIFY_TRANSCRIPT_TIMEOUT_MS', 'social_video', 'Apify 转写超时', '调用 Apify Actor 的最大等待时间，单位毫秒。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_CACHE_TTL_HOURS', 'social_video', '短视频识别缓存时间', '同一抖音链接识别成功后复用结果的小时数。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_DAILY_LIMIT_PER_USER', 'social_video', '单用户每日识别上限', '单个登录用户每天最多可创建的短视频识别任务数。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_MAX_DURATION_SECONDS', 'social_video', '短视频最大时长', '短视频语音识别建议最大视频时长，单位秒。Apify 直接转写路径中作为配置和后续兜底限制。', 'number', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
