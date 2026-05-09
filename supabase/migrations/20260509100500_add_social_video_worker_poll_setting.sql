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
  ('SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS', 'social_video', '短视频识别 worker 轮询间隔', 'worker 扫描待处理任务的间隔时间，单位毫秒。', 'number', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;

UPDATE public.system_settings
SET description = '短视频识别 worker 同时执行下载、ffmpeg 和 ASR 的最大任务数，建议 1-2。'
WHERE key = 'SOCIAL_VIDEO_CONCURRENCY_LIMIT';
