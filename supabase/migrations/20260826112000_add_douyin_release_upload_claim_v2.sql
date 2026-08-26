-- Return the complete current release projection while retaining the original
-- upload claim command for rolling API compatibility.
-- Rollback: deploy an API that calls the legacy RPC, revoke v2, then drop v2.
BEGIN;

CREATE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v2(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    legacy.id,
    legacy.installation_id,
    legacy.template_id,
    legacy.template_version,
    legacy.description,
    legacy.channel,
    legacy.ext_json,
    legacy.status,
    legacy.douyin_log_id,
    legacy.test_qr_url,
    release.latest_test_qr_url,
    release.audit_qr_url,
    legacy.audit_host_names,
    legacy.audit_note,
    legacy.audit_result,
    legacy.submitted_at,
    legacy.audited_at,
    legacy.released_at,
    legacy.platform_operator_id,
    legacy.created_at,
    legacy.updated_at,
    legacy.operation_name,
    legacy.operation_claim_token,
    legacy.operation_claim_expires_at,
    legacy.recovery_required
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
  ) AS legacy
  JOIN public.douyin_miniapp_releases AS release
    ON release.id = legacy.id
   AND release.installation_id = legacy.installation_id;
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
) IS 'Atomically claims a Douyin release upload and returns all persisted QR stage fields.';

COMMIT;
