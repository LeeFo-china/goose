-- Retire two superseded development testing releases before enforcing the
-- one-unfinished-release invariant. This is intentionally scoped to the
-- observed development installation and exact provider-backed release rows.
-- Other environments are a no-op when that installation is absent.
--
-- Rollback (forward migration only): disable release mutations, drop the
-- one-unfinished-release index from 20260813200000 if already applied, and
-- restore these two exact rows to testing only after revalidating Douyin's
-- latest version evidence.

BEGIN;

DO $$
DECLARE
  v_installation_id constant uuid :=
    '82061c96-29ac-4426-baff-5efc1061fbc8'::uuid;
  v_current_release_id constant uuid :=
    '3073642f-4cf4-4f3a-9576-688247733659'::uuid;
  v_retired_release_ids constant uuid[] := ARRAY[
    '2329c8c1-6eb2-4f15-9d7f-04dcf66047e7'::uuid,
    'ea547440-fb61-41fa-bf1c-8c0a6304b646'::uuid
  ];
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_unfinished_count integer;
  v_matched_count integer;
  v_updated_count integer;
BEGIN
  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = v_installation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_installation.authorizer_appid IS DISTINCT FROM 'ttd033a68e4e56ccd301'
    OR v_installation.installation_kind IS DISTINCT FROM 'merchant'
    OR v_installation.authorization_status IS DISTINCT FROM 'active'
    OR v_installation.tenant_id IS DISTINCT FROM
      '3eebca47-961f-4899-b976-a3d3208d326b'::uuid
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_DEV_RELEASE_REPAIR_PRECONDITION_FAILED';
  END IF;

  PERFORM 1
  FROM public.douyin_miniapp_releases AS release
  WHERE release.installation_id = v_installation_id
  ORDER BY release.created_at, release.id
  FOR UPDATE;

  SELECT count(*)
  INTO v_unfinished_count
  FROM public.douyin_miniapp_releases AS release
  WHERE release.installation_id = v_installation_id
    AND release.status IN (
      'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved'
    );

  SELECT count(*)
  INTO v_matched_count
  FROM public.douyin_miniapp_releases AS release
  WHERE release.installation_id = v_installation_id
    AND release.status = 'testing'
    AND release.operation_name IS NULL
    AND release.operation_claim_token IS NULL
    AND release.operation_claim_expires_at IS NULL
    AND release.test_qr_url IS NOT NULL
    AND release.douyin_log_id IS NOT NULL
    AND (
      (
        release.id = '2329c8c1-6eb2-4f15-9d7f-04dcf66047e7'::uuid
        AND release.template_id = '77538'
        AND release.template_version = '0.1.1'
      )
      OR (
        release.id = 'ea547440-fb61-41fa-bf1c-8c0a6304b646'::uuid
        AND release.template_id = '77595'
        AND release.template_version = '0.1.2'
      )
      OR (
        release.id = v_current_release_id
        AND release.template_id = '77595'
        AND release.template_version = '0.1.3'
      )
    );

  IF v_unfinished_count <> 3 OR v_matched_count <> 3 OR NOT EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS current_release
    WHERE current_release.id = v_current_release_id
      AND current_release.installation_id = v_installation_id
      AND current_release.updated_at >= ALL (
        SELECT superseded_release.updated_at
        FROM public.douyin_miniapp_releases AS superseded_release
        WHERE superseded_release.id = ANY (v_retired_release_ids)
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_DEV_RELEASE_REPAIR_PRECONDITION_FAILED';
  END IF;

  UPDATE public.douyin_miniapp_releases AS release
  SET status = 'failed',
      updated_at = clock_timestamp()
  WHERE release.id = ANY (v_retired_release_ids)
    AND release.installation_id = v_installation_id
    AND release.status = 'testing'
    AND release.operation_name IS NULL
    AND release.operation_claim_token IS NULL
    AND release.operation_claim_expires_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_DEV_RELEASE_REPAIR_UPDATE_MISMATCH';
  END IF;
END;
$$;

COMMIT;
