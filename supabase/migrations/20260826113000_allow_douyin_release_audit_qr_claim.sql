-- Keep the release operation lease command aligned with the audit QR stage.
-- Rollback: deploy an API without audit QR claims, then replace this function
-- with the definition from 20260719102000_create_douyin_miniapp_releases.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.claim_douyin_miniapp_release_operation(
  p_release_id uuid,
  p_expected_statuses text[],
  p_operation_name text,
  p_claim_token uuid,
  p_claim_expires_at timestamptz,
  p_operator_id uuid
)
RETURNS TABLE(
  release_id uuid,
  claim_token uuid,
  claim_expires_at timestamptz,
  recovery_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_installation_id uuid;
  v_release public.douyin_miniapp_releases%ROWTYPE;
  v_recovery_required boolean := false;
BEGIN
  IF p_release_id IS NULL
    OR p_expected_statuses IS NULL
    OR cardinality(p_expected_statuses) NOT BETWEEN 1 AND 8
    OR array_position(p_expected_statuses, NULL) IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM unnest(p_expected_statuses) AS expected(status)
      WHERE expected.status <> ALL(ARRAY[
        'created', 'uploaded', 'testing', 'audit_pending',
        'audit_rejected', 'audit_approved', 'released', 'failed'
      ]::text[])
    )
    OR p_operation_name IS NULL
    OR p_operation_name <> ALL(ARRAY[
      'upload', 'test_qr', 'audit_qr', 'submit_audit', 'sync_status', 'publish'
    ]::text[])
    OR p_claim_token IS NULL
    OR p_claim_expires_at IS NULL
    OR p_claim_expires_at <= v_now
    OR p_claim_expires_at > v_now + interval '5 minutes'
    OR p_operator_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_MINIAPP_RELEASE_OPERATION_CLAIM_INVALID';
  END IF;

  SELECT release.installation_id INTO v_installation_id
  FROM public.douyin_miniapp_releases AS release
  WHERE release.id = p_release_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT installation.id INTO v_installation_id
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = v_installation_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS other_release
    WHERE other_release.installation_id = v_installation_id
      AND other_release.id <> p_release_id
      AND other_release.operation_claim_token IS NOT NULL
      AND other_release.operation_claim_expires_at > v_now
  ) THEN
    RETURN;
  END IF;

  SELECT release.* INTO v_release
  FROM public.douyin_miniapp_releases AS release
  WHERE release.id = p_release_id
  FOR UPDATE;
  IF NOT FOUND OR NOT (v_release.status = ANY(p_expected_statuses)) THEN
    RETURN;
  END IF;

  IF v_release.operation_claim_token IS NOT NULL
    AND v_release.operation_claim_expires_at > v_now
  THEN
    RETURN;
  END IF;

  v_recovery_required := v_release.operation_claim_token IS NOT NULL
    AND v_release.operation_claim_expires_at <= v_now;

  UPDATE public.douyin_miniapp_releases AS release
  SET
    operation_name = p_operation_name,
    operation_claim_token = p_claim_token,
    operation_claim_expires_at = p_claim_expires_at,
    platform_operator_id = p_operator_id
  WHERE release.id = p_release_id;

  RETURN QUERY SELECT
    p_release_id,
    p_claim_token,
    p_claim_expires_at,
    v_recovery_required;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) TO service_role;

COMMIT;
