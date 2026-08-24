-- allow_douyin_testing_release_template_replacement
--
-- Allow a platform-confirmed newer template to supersede tenant releases that
-- are only in uploaded/testing experience mode. Audit-protected releases and
-- active operation leases remain exclusive per installation.
--
-- Rollback (forward migration only):
-- 1. Stop tenant release creation.
-- 2. Recreate prevent_douyin_unfinished_release_replacement() and
--    douyin_miniapp_releases_one_unfinished_installation_idx with uploaded and
--    testing included in the protected status set.
-- 3. Verify no duplicate protected rows exist before restoring old exclusivity.

BEGIN;

LOCK TABLE public.douyin_miniapp_releases IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS release
    WHERE release.status IN (
      'created', 'audit_pending', 'audit_approved'
    )
    GROUP BY release.installation_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'DOUYIN_UNFINISHED_RELEASE_DUPLICATES_EXIST';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_douyin_unfinished_release_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM 1
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = NEW.installation_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS release
    WHERE release.installation_id = NEW.installation_id
      AND release.template_version <> NEW.template_version
      AND (
        release.status IN (
          'created', 'audit_pending', 'audit_approved'
        )
        OR (
          release.operation_claim_token IS NOT NULL
          AND release.operation_claim_expires_at > clock_timestamp()
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_TENANT_RELEASE_IN_PROGRESS';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_douyin_unfinished_release_replacement()
FROM PUBLIC, anon, authenticated;

DROP INDEX IF EXISTS public.douyin_miniapp_releases_one_unfinished_installation_idx;

CREATE UNIQUE INDEX douyin_miniapp_releases_one_unfinished_installation_idx
ON public.douyin_miniapp_releases(installation_id)
WHERE status IN (
  'created', 'audit_pending', 'audit_approved'
);

COMMIT;
