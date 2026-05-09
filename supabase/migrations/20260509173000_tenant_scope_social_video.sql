ALTER TABLE public.social_video_transcriptions
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.social_video_scripts
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.social_video_transcriptions
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

UPDATE public.social_video_scripts scripts
SET tenant_id = transcriptions.tenant_id
FROM public.social_video_transcriptions transcriptions
WHERE scripts.transcription_id = transcriptions.id
  AND scripts.tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id
  FROM public.tenants
  WHERE slug = 'gooes_default'
  LIMIT 1
)
UPDATE public.social_video_scripts
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_tenant_hash_completed
ON public.social_video_transcriptions(tenant_id, input_hash, completed_at DESC)
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_tenant_created_by
ON public.social_video_transcriptions(tenant_id, created_by_auth_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_video_transcriptions_tenant_status_created
ON public.social_video_transcriptions(tenant_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_tenant_transcription
ON public.social_video_scripts(tenant_id, transcription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_tenant_user_created
ON public.social_video_scripts(tenant_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_video_scripts_tenant_cache
ON public.social_video_scripts(
  tenant_id,
  transcription_id,
  target_platform,
  style,
  duration_seconds,
  goal,
  status,
  created_at DESC
);

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

COMMENT ON COLUMN public.social_video_transcriptions.tenant_id IS '短视频识别任务所属租户';
COMMENT ON COLUMN public.social_video_scripts.tenant_id IS '短视频脚本所属租户，从转写任务继承';
