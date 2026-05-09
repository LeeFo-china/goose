ALTER TABLE public.social_video_transcriptions
DROP CONSTRAINT IF EXISTS social_video_transcriptions_status_check;

ALTER TABLE public.social_video_transcriptions
ADD CONSTRAINT social_video_transcriptions_status_check CHECK (
  status = ANY (
    ARRAY[
      'pending'::text,
      'resolving'::text,
      'downloading'::text,
      'extracting_audio'::text,
      'creating_asr_task'::text,
      'transcribing'::text,
      'completed'::text,
      'failed'::text
    ]
  )
);

ALTER TABLE public.social_video_transcriptions
ADD COLUMN IF NOT EXISTS resolved_video_url text NULL,
ADD COLUMN IF NOT EXISTS resolved_audio_url text NULL,
ADD COLUMN IF NOT EXISTS asr_task_id text NULL,
ADD COLUMN IF NOT EXISTS media_file_size_bytes bigint NULL,
ADD COLUMN IF NOT EXISTS audio_file_size_bytes bigint NULL,
ADD COLUMN IF NOT EXISTS audio_duration_seconds double precision NULL;

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
  ('SOCIAL_VIDEO_TRANSCRIPTION_PROVIDER', 'social_video', '短视频识别主链路', 'tencent_asr 使用 Apify 解析音视频地址后由腾讯云 ASR 转写；apify 使用 Apify 直接转写。', 'string', NULL, false, 'active'),
  ('SOCIAL_VIDEO_MAX_DOWNLOAD_BYTES', 'social_video', '短视频下载大小上限', '从解析地址下载媒体文件的最大字节数。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_DOWNLOAD_TIMEOUT_MS', 'social_video', '短视频下载超时', '下载抖音音视频文件的超时时间，单位毫秒。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_FFMPEG_TIMEOUT_MS', 'social_video', 'ffmpeg 提取音频超时', 'ffmpeg 从短视频提取音频的超时时间，单位毫秒。', 'number', NULL, false, 'active'),
  ('SOCIAL_VIDEO_AUDIO_BITRATE', 'social_video', 'ASR 音频码率', 'ffmpeg 生成提交腾讯云 ASR 音频的目标码率，建议 32k。', 'string', NULL, false, 'active'),
  ('TENCENT_ASR_REGION', 'social_video', '腾讯云 ASR 区域', '腾讯云语音识别 API 区域。', 'string', NULL, false, 'active'),
  ('TENCENT_ASR_ENDPOINT', 'social_video', '腾讯云 ASR Endpoint', '腾讯云语音识别 API 域名。', 'string', NULL, false, 'active'),
  ('TENCENT_ASR_ENGINE_MODEL_TYPE', 'social_video', '腾讯云 ASR 引擎', '录音文件识别引擎，中文短视频建议 16k_zh。', 'string', NULL, false, 'active'),
  ('TENCENT_ASR_RES_TEXT_FORMAT', 'social_video', '腾讯云 ASR 返回格式', '录音文件识别返回样式，3 为带标点并按标点分段，适合字幕/短视频文案。', 'number', NULL, false, 'active'),
  ('TENCENT_ASR_POLL_TIMEOUT_MS', 'social_video', '腾讯云 ASR 轮询超时', '提交录音识别任务后等待结果的最大时间，单位毫秒。', 'number', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
