CREATE TABLE IF NOT EXISTS public.social_video_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id uuid NOT NULL REFERENCES public.social_video_transcriptions(id) ON DELETE CASCADE,
  user_id uuid NULL,
  platform text NOT NULL,
  style text NOT NULL,
  duration_seconds integer NOT NULL,
  goal text NOT NULL,
  title text NOT NULL,
  rewritten_copy text NOT NULL,
  hook text NOT NULL,
  shooting_script jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_text_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  caption_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  tips jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_text_length integer NOT NULL DEFAULT 0,
  prompt_version text NOT NULL,
  model_provider text NULL,
  model_name text NULL,
  status text NOT NULL DEFAULT 'completed',
  error_code text NULL,
  error_message text NULL,
  raw_payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_video_scripts_platform_check CHECK (
    platform = ANY (ARRAY['douyin'::text])
  ),
  CONSTRAINT social_video_scripts_style_check CHECK (
    style = ANY (
      ARRAY[
        'professional'::text,
        'down_to_earth'::text,
        'douyin_practical'::text,
        'xiaohongshu'::text
      ]
    )
  ),
  CONSTRAINT social_video_scripts_duration_check CHECK (
    duration_seconds = ANY (ARRAY[30, 60, 90])
  ),
  CONSTRAINT social_video_scripts_goal_check CHECK (
    goal = ANY (
      ARRAY[
        'lead_generation'::text,
        'education'::text,
        'case_seeding'::text,
        'brand_trust'::text
      ]
    )
  ),
  CONSTRAINT social_video_scripts_status_check CHECK (
    status = ANY (ARRAY['completed'::text, 'failed'::text])
  )
);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_transcription
ON public.social_video_scripts USING btree (transcription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_user_created
ON public.social_video_scripts USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_cache
ON public.social_video_scripts USING btree (
  transcription_id,
  style,
  duration_seconds,
  goal,
  status,
  created_at DESC
);

DROP TRIGGER IF EXISTS tr_social_video_scripts_updated_at ON public.social_video_scripts;
CREATE TRIGGER tr_social_video_scripts_updated_at
BEFORE UPDATE ON public.social_video_scripts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('social_video_transcription.manage', '管理短视频转写与脚本', 'social_video', 'transcription', 'manage', '管理短视频转写任务和脚本生成结果', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

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
  ('SOCIAL_VIDEO_SCRIPT_DAILY_LIMIT_PER_USER', 'social_video', '短视频脚本每日生成上限', '单个登录用户每天最多生成的短视频拍摄脚本数量。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_SCRIPT_CACHE_TTL_HOURS', 'social_video', '短视频脚本缓存时间', '同一转写任务、风格、时长和目标生成成功后复用结果的小时数。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_SCRIPT_AI_MODEL', 'social_video', '短视频脚本 AI 模型', '短视频脚本生成优先使用的 AI 模型；为空时使用 AI_MODEL。', 'string', NULL, false, 'active'),
  ('SOCIAL_VIDEO_SCRIPT_AI_TIMEOUT_MS', 'social_video', '短视频脚本 AI 超时', '短视频脚本同步生成接口的 AI 请求超时时间，单位毫秒。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_SCRIPT_SOURCE_MAX_CHARS', 'social_video', '短视频脚本输入文本上限', '发送给 AI 的转写文本最大字符数。', 'number', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
