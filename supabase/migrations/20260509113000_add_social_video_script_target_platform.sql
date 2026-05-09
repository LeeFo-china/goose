ALTER TABLE public.social_video_scripts
ADD COLUMN IF NOT EXISTS target_platform text NOT NULL DEFAULT 'douyin';

ALTER TABLE public.social_video_scripts
DROP CONSTRAINT IF EXISTS social_video_scripts_target_platform_check;

ALTER TABLE public.social_video_scripts
ADD CONSTRAINT social_video_scripts_target_platform_check CHECK (
  target_platform = ANY (
    ARRAY[
      'douyin'::text,
      'xiaohongshu'::text,
      'shipinhao'::text,
      'kuaishou'::text
    ]
  )
);

ALTER TABLE public.social_video_scripts
DROP CONSTRAINT IF EXISTS social_video_scripts_style_check;

ALTER TABLE public.social_video_scripts
ADD CONSTRAINT social_video_scripts_style_check CHECK (
  style = ANY (
    ARRAY[
      'practical'::text,
      'seeding'::text,
      'professional'::text,
      'down_to_earth'::text,
      'douyin_practical'::text,
      'xiaohongshu'::text
    ]
  )
);

DROP INDEX IF EXISTS public.idx_social_video_scripts_cache;

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_cache
ON public.social_video_scripts USING btree (
  transcription_id,
  target_platform,
  style,
  duration_seconds,
  goal,
  status,
  created_at DESC
);

UPDATE public.system_settings
SET description = '同一转写任务、目标平台、风格、时长和目标生成成功后复用结果的小时数。'
WHERE key = 'SOCIAL_VIDEO_SCRIPT_CACHE_TTL_HOURS';
