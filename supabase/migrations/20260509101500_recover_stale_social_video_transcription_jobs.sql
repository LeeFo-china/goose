CREATE OR REPLACE FUNCTION public.claim_next_social_video_transcription(
  p_stale_before timestamptz DEFAULT now() - interval '15 minutes'
)
RETURNS SETOF public.social_video_transcriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_task AS (
    SELECT id
    FROM public.social_video_transcriptions
    WHERE
      status = 'pending'
      OR (
        status = ANY (
          ARRAY[
            'resolving'::text,
            'downloading'::text,
            'extracting_audio'::text,
            'creating_asr_task'::text,
            'transcribing'::text
          ]
        )
        AND updated_at < p_stale_before
      )
    ORDER BY
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.social_video_transcriptions target
  SET
    status = 'resolving',
    progress = 10,
    error_code = NULL,
    error_message = NULL,
    completed_at = NULL
  FROM next_task
  WHERE target.id = next_task.id
  RETURNING target.*;
END;
$$;

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
  ('SOCIAL_VIDEO_STALE_TASK_TIMEOUT_MS', 'social_video', '短视频识别任务超时回收', 'worker 重启或崩溃后，处理中任务超过该时间未更新则允许重新领取，单位毫秒。', 'number', NULL, false, 'active')
ON CONFLICT (key) DO UPDATE SET
  group_code = EXCLUDED.group_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  is_secret = EXCLUDED.is_secret,
  status = EXCLUDED.status;
