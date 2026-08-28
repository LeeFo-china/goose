BEGIN;

-- Repair the JSONB key validation added by 20260828224000. PostgreSQL exposes
-- jsonb_array_length but not jsonb_object_length; the allowed-key subtraction
-- already bounds this object to deployment_key plus the optional environment.
CREATE OR REPLACE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  p_installation_id uuid, p_template_id text, p_template_version text,
  p_description text, p_channel text, p_ext_json jsonb,
  p_claim_token uuid, p_claim_expires_at timestamptz, p_operator_id uuid
)
RETURNS TABLE(
  id uuid, installation_id uuid, template_id text, template_version text,
  description text, channel text, ext_json jsonb, status text,
  douyin_log_id text, test_qr_url text, audit_host_names text[], audit_note text,
  audit_result jsonb, submitted_at timestamptz, audited_at timestamptz,
  released_at timestamptz, platform_operator_id uuid, created_at timestamptz,
  updated_at timestamptz, operation_name text, operation_claim_token uuid,
  operation_claim_expires_at timestamptz,
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
  IF p_installation_id IS NULL
    OR p_template_id IS NULL
    OR p_template_id !~ '^[1-9][0-9]{0,18}$'
    OR p_template_version IS NULL
    OR length(p_template_version) > 64
    OR p_template_version !~
      '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
    OR p_description IS NULL
    OR p_description <> btrim(p_description)
    OR length(p_description) NOT BETWEEN 1 AND 200
    OR p_channel IS NULL
    OR p_channel <> ALL(ARRAY['default', '1']::text[])
    OR p_ext_json IS NULL
    OR jsonb_typeof(p_ext_json) <> 'object'
    OR NOT (p_ext_json ?& ARRAY['extEnable', 'extAppid', 'ext']::text[])
    OR p_ext_json - ARRAY['extEnable', 'extAppid', 'ext']::text[] <> '{}'::jsonb
    OR p_ext_json -> 'extEnable' <> 'true'::jsonb
    OR jsonb_typeof(p_ext_json -> 'extAppid') <> 'string'
    OR length(p_ext_json ->> 'extAppid') NOT BETWEEN 1 AND 128
    OR p_ext_json ->> 'extAppid' <> btrim(p_ext_json ->> 'extAppid')
    OR jsonb_typeof(p_ext_json -> 'ext') <> 'object'
    OR NOT (p_ext_json -> 'ext' ? 'deployment_key')
    OR (p_ext_json -> 'ext')
      - ARRAY['deployment_key', 'deployment_environment']::text[] <> '{}'::jsonb
    OR jsonb_typeof(p_ext_json -> 'ext' -> 'deployment_key') <> 'string'
    OR length(p_ext_json -> 'ext' ->> 'deployment_key') NOT BETWEEN 1 AND 128
    OR p_ext_json -> 'ext' ->> 'deployment_key'
      <> btrim(p_ext_json -> 'ext' ->> 'deployment_key')
    OR (
      p_ext_json -> 'ext' ? 'deployment_environment'
      AND (
        jsonb_typeof(p_ext_json -> 'ext' -> 'deployment_environment') <> 'string'
        OR p_ext_json -> 'ext' ->> 'deployment_environment'
          <> ALL(ARRAY['development', 'production']::text[])
      )
    )
    OR p_claim_token IS NULL
    OR p_claim_expires_at IS NULL
    OR p_claim_expires_at <= v_now
    OR p_claim_expires_at > v_now + interval '5 minutes'
    OR p_operator_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_MINIAPP_RELEASE_UPLOAD_CLAIM_INVALID';
  END IF;

  SELECT installation.id INTO v_installation_id
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_installation_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.douyin_miniapp_releases (
    installation_id,
    template_id,
    template_version,
    description,
    channel,
    ext_json,
    status,
    platform_operator_id
  ) VALUES (
    p_installation_id,
    p_template_id,
    p_template_version,
    p_description,
    p_channel,
    p_ext_json,
    'created',
    p_operator_id
  )
  ON CONFLICT ON CONSTRAINT douyin_miniapp_releases_delivery_key_unique
  DO NOTHING;

  SELECT release.* INTO STRICT v_release
  FROM public.douyin_miniapp_releases AS release
  WHERE release.installation_id = p_installation_id
    AND release.template_version = p_template_version
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_releases AS other_release
    WHERE other_release.installation_id = v_installation_id
      AND other_release.id <> v_release.id
      AND other_release.operation_claim_token IS NOT NULL
      AND other_release.operation_claim_expires_at > v_now
  ) THEN
    RETURN;
  END IF;

  IF v_release.template_id IS DISTINCT FROM p_template_id
    OR v_release.channel IS DISTINCT FROM p_channel
    OR v_release.description IS DISTINCT FROM p_description
    OR v_release.ext_json IS DISTINCT FROM p_ext_json
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'DOUYIN_MINIAPP_RELEASE_DELIVERY_CONFLICT';
  END IF;

  IF (
      v_release.status IN (
        'created', 'uploaded', 'testing', 'audit_pending',
        'audit_rejected', 'audit_approved', 'released'
      )
      OR (
        v_release.status = 'failed'
        AND v_release.submitted_at IS NULL
        AND v_release.audited_at IS NULL
        AND v_release.released_at IS NULL
      )
    )
    AND (
      v_release.operation_claim_token IS NULL
      OR v_release.operation_claim_expires_at <= v_now
    )
  THEN
    v_recovery_required := v_release.operation_claim_token IS NOT NULL
      AND v_release.operation_claim_expires_at <= v_now;
    UPDATE public.douyin_miniapp_releases AS release
    SET
      operation_name = 'upload',
      operation_claim_token = p_claim_token,
      operation_claim_expires_at = p_claim_expires_at,
      platform_operator_id = p_operator_id
    WHERE release.id = v_release.id
    RETURNING release.* INTO v_release;
  END IF;

  RETURN QUERY SELECT
    v_release.id, v_release.installation_id, v_release.template_id,
    v_release.template_version, v_release.description, v_release.channel,
    v_release.ext_json, v_release.status, v_release.douyin_log_id,
    v_release.test_qr_url, v_release.audit_host_names, v_release.audit_note,
    v_release.audit_result, v_release.submitted_at, v_release.audited_at,
    v_release.released_at, v_release.platform_operator_id, v_release.created_at,
    v_release.updated_at, v_release.operation_name, v_release.operation_claim_token,
    v_release.operation_claim_expires_at,
    v_recovery_required;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) TO service_role;

COMMENT ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) IS 'Atomically creates or claims a merchant release upload and validates the optional server-controlled deployment environment.';

COMMIT;

-- Rollback: restore the function body from 20260828224000 only while the API
-- does not upload deployment_environment. No table data requires rollback.
