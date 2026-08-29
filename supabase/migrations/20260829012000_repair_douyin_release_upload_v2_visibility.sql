-- Read the release in a separate PL/pgSQL statement after the legacy command.
-- A SQL-language wrapper uses one statement snapshot, so it cannot see a row
-- inserted by the delegated command when joining the release table.
-- Rollback: restore the SQL wrapper from 20260826112000 only after all callers
-- stop creating releases through v2. The one-time claim reset is irreversible.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
  p_installation_id uuid, p_template_id text, p_template_version text,
  p_description text, p_channel text, p_ext_json jsonb,
  p_claim_token uuid, p_claim_expires_at timestamptz, p_operator_id uuid
)
RETURNS TABLE(
  id uuid, installation_id uuid, template_id text, template_version text,
  description text, channel text, ext_json jsonb, status text,
  douyin_log_id text, test_qr_url text, latest_test_qr_url text,
  audit_qr_url text, audit_host_names text[], audit_note text,
  audit_result jsonb, submitted_at timestamptz, audited_at timestamptz,
  released_at timestamptz, platform_operator_id uuid, created_at timestamptz,
  updated_at timestamptz, operation_name text, operation_claim_token uuid,
  operation_claim_expires_at timestamptz, recovery_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_release_id uuid;
  v_release public.douyin_miniapp_releases%ROWTYPE;
  v_recovery_required boolean;
BEGIN
  SELECT legacy.id, legacy.recovery_required
  INTO v_release_id, v_recovery_required
  FROM public.get_or_create_and_claim_douyin_miniapp_release_upload(
    p_installation_id,
    p_template_id,
    p_template_version,
    p_description,
    p_channel,
    p_ext_json,
    p_claim_token,
    p_claim_expires_at,
    p_operator_id
  ) AS legacy;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT release.* INTO STRICT v_release
  FROM public.douyin_miniapp_releases AS release
  WHERE release.id = v_release_id
    AND release.installation_id = p_installation_id;

  RETURN QUERY SELECT
    v_release.id,
    v_release.installation_id,
    v_release.template_id,
    v_release.template_version,
    v_release.description,
    v_release.channel,
    v_release.ext_json,
    v_release.status,
    v_release.douyin_log_id,
    v_release.test_qr_url,
    v_release.latest_test_qr_url,
    v_release.audit_qr_url,
    v_release.audit_host_names,
    v_release.audit_note,
    v_release.audit_result,
    v_release.submitted_at,
    v_release.audited_at,
    v_release.released_at,
    v_release.platform_operator_id,
    v_release.created_at,
    v_release.updated_at,
    v_release.operation_name,
    v_release.operation_claim_token,
    v_release.operation_claim_expires_at,
    v_recovery_required;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) TO service_role;

COMMENT ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) IS 'Atomically claims a Douyin release upload and reads its full projection after the delegated write becomes visible.';

-- This release was created by the broken wrapper and the API returned before
-- requesting an access token or calling Douyin. Reset only that expired,
-- otherwise untouched production upload claim so the corrected RPC can retry.
UPDATE public.douyin_miniapp_releases
SET
  operation_name = NULL,
  operation_claim_token = NULL,
  operation_claim_expires_at = NULL
WHERE id = '6373d5b7-562a-4681-91e2-dea64fa12ff8'::uuid
  AND installation_id = '2452739c-1683-4a57-a0af-b5e973e349a0'::uuid
  AND template_id = '78689'
  AND template_version = '0.1.7'
  AND created_at = '2026-08-29 01:03:41.205181+00'::timestamptz
  AND status = 'created'
  AND douyin_log_id IS NULL
  AND test_qr_url IS NULL
  AND latest_test_qr_url IS NULL
  AND audit_qr_url IS NULL
  AND audit_host_names = ARRAY[]::text[]
  AND audit_note IS NULL
  AND audit_result IS NULL
  AND submitted_at IS NULL
  AND audited_at IS NULL
  AND released_at IS NULL
  AND operation_name = 'upload'
  AND operation_claim_token IS NOT NULL
  AND operation_claim_expires_at <= clock_timestamp();

COMMIT;
