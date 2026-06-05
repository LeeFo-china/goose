ALTER TABLE public.user_location_contexts
ALTER COLUMN auth_user_id DROP NOT NULL;

ALTER TABLE public.user_location_contexts
ADD COLUMN IF NOT EXISTS visitor_id text NULL;

ALTER TABLE public.user_location_contexts
ADD COLUMN IF NOT EXISTS selection_status text NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_location_contexts_identity_present'
  ) THEN
    ALTER TABLE public.user_location_contexts
    ADD CONSTRAINT user_location_contexts_identity_present
    CHECK (
      auth_user_id IS NOT NULL
      OR visitor_id IS NOT NULL
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_location_contexts_selection_status_check'
  ) THEN
    ALTER TABLE public.user_location_contexts
    ADD CONSTRAINT user_location_contexts_selection_status_check
    CHECK (
      selection_status = ANY (
        ARRAY[
          'pending'::text,
          'selected'::text,
          'skipped'::text,
          'expired'::text
        ]
      )
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_location_contexts_visitor
ON public.user_location_contexts(visitor_id, created_at DESC)
WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_location_contexts_selection_status
ON public.user_location_contexts(selection_status, expires_at);

COMMENT ON COLUMN public.user_location_contexts.visitor_id IS 'visitor_session token 中的访客 ID，格式由登录态生成';
COMMENT ON COLUMN public.user_location_contexts.selection_status IS 'visitor 定位选择状态：pending/selected/skipped/expired';
