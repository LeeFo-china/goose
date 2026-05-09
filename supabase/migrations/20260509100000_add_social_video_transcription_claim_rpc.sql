CREATE OR REPLACE FUNCTION public.claim_next_social_video_transcription()
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
    WHERE status = 'pending'
    ORDER BY created_at ASC
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
