-- Safe release ledger: provider bodies and credentials must never be stored.
-- Rollback: revoke/drop RPCs, drop template_release_id, then drop this table;
-- provider packages already published by Douyin remain unaffected.
BEGIN;
CREATE TABLE public.douyin_miniapp_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL
    REFERENCES public.douyin_miniapp_installations(id) ON DELETE RESTRICT,
  template_id text NOT NULL,
  template_version text NOT NULL,
  description text NOT NULL,
  channel text NOT NULL DEFAULT 'default',
  ext_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'created',
  douyin_log_id text NULL,
  test_qr_url text NULL,
  audit_host_names text[] NOT NULL DEFAULT ARRAY[]::text[],
  audit_note text NULL,
  audit_result jsonb NULL,
  submitted_at timestamptz NULL,
  audited_at timestamptz NULL,
  released_at timestamptz NULL,
  operation_name text NULL,
  operation_claim_token uuid NULL,
  operation_claim_expires_at timestamptz NULL,
  platform_operator_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_miniapp_releases_template_id_check
    CHECK (template_id ~ '^[1-9][0-9]{0,18}$'),
  CONSTRAINT douyin_miniapp_releases_template_version_check CHECK (
    length(template_version) <= 64
    AND template_version ~
      '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)([.](0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?([+][0-9A-Za-z-]+([.][0-9A-Za-z-]+)*)?$'
  ),
  CONSTRAINT douyin_miniapp_releases_description_check
    CHECK (description = btrim(description) AND length(description) BETWEEN 1 AND 200),
  CONSTRAINT douyin_miniapp_releases_channel_check
    CHECK (channel IN ('default', '1')),
  CONSTRAINT douyin_miniapp_releases_status_check CHECK (
    status IN (
      'created',
      'uploaded',
      'testing',
      'audit_pending',
      'audit_rejected',
      'audit_approved',
      'released',
      'failed'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_operation_name_check CHECK (
    operation_name IS NULL
    OR operation_name IN (
      'upload', 'test_qr', 'submit_audit', 'sync_status', 'publish'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_operation_claim_check CHECK (
    (
      operation_name IS NULL
      AND operation_claim_token IS NULL
      AND operation_claim_expires_at IS NULL
    )
    OR (
      operation_name IS NOT NULL
      AND operation_claim_token IS NOT NULL
      AND operation_claim_expires_at IS NOT NULL
    )
  ),
  CONSTRAINT douyin_miniapp_releases_ext_json_check CHECK (
    jsonb_typeof(ext_json) = 'object'
    AND ext_json ?& ARRAY['extEnable', 'extAppid', 'ext']::text[]
    AND ext_json - ARRAY['extEnable', 'extAppid', 'ext']::text[] = '{}'::jsonb
    AND ext_json -> 'extEnable' = 'true'::jsonb
    AND jsonb_typeof(ext_json -> 'extAppid') = 'string'
    AND length(ext_json ->> 'extAppid') BETWEEN 1 AND 128
    AND (ext_json ->> 'extAppid') = btrim(ext_json ->> 'extAppid')
    AND jsonb_typeof(ext_json -> 'ext') = 'object'
    AND ext_json -> 'ext' ? 'deployment_key'
    AND ext_json -> 'ext' - 'deployment_key' = '{}'::jsonb
    AND jsonb_typeof(ext_json -> 'ext' -> 'deployment_key') = 'string'
    AND length(ext_json -> 'ext' ->> 'deployment_key') BETWEEN 1 AND 128
    AND (ext_json -> 'ext' ->> 'deployment_key')
      = btrim(ext_json -> 'ext' ->> 'deployment_key')
  ),
  CONSTRAINT douyin_miniapp_releases_log_id_check
    CHECK (douyin_log_id IS NULL OR douyin_log_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  CONSTRAINT douyin_miniapp_releases_test_qr_url_check CHECK (
    test_qr_url IS NULL
    OR (
      length(test_qr_url) <= 2048
      AND test_qr_url ~ '^https://[^[:space:]]+$'
      AND position('@' IN test_qr_url) = 0
    )
  ),
  CONSTRAINT douyin_miniapp_releases_audit_host_names_check CHECK (
    cardinality(audit_host_names) <= 20
    AND array_position(audit_host_names, NULL) IS NULL
    AND array_position(audit_host_names, '') IS NULL
    AND octet_length(array_to_string(audit_host_names, ',')) <= 4096
    AND array_to_string(audit_host_names, ',')
      ~ '^(|[A-Za-z0-9.-]{1,253}(,[A-Za-z0-9.-]{1,253})*)$'
    AND array_to_string(audit_host_names, ',') !~* '(token|secret|phone|openid)'
  ),
  CONSTRAINT douyin_miniapp_releases_audit_note_check CHECK (
    audit_note IS NULL
    OR (
      audit_note = btrim(audit_note)
      AND length(audit_note) BETWEEN 1 AND 1000
      AND audit_note !~* '(token|secret|phone|openid)'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_audit_result_check CHECK (
    audit_result IS NULL
    OR (
      jsonb_typeof(audit_result) = 'object'
      AND octet_length(audit_result::text) <= 4096
      AND audit_result
        - ARRAY['audit_id', 'status', 'reason', 'error_code']::text[] = '{}'::jsonb
      AND (
        NOT audit_result ? 'audit_id'
        OR (
          jsonb_typeof(audit_result -> 'audit_id') = 'string'
          AND audit_result ->> 'audit_id' ~ '^[A-Za-z0-9._:-]{1,128}$'
        )
      )
      AND (
        NOT audit_result ? 'status'
        OR audit_result ->> 'status' IN ('pending', 'approved', 'rejected', 'failed')
      )
      AND (
        NOT audit_result ? 'reason'
        OR (
          jsonb_typeof(audit_result -> 'reason') = 'string'
          AND length(audit_result ->> 'reason') BETWEEN 1 AND 1000
        )
      )
      AND (
        NOT audit_result ? 'error_code'
        OR (
          jsonb_typeof(audit_result -> 'error_code') = 'string'
          AND audit_result ->> 'error_code' ~ '^[A-Z0-9_:-]{1,128}$'
        )
      )
      AND audit_result::text !~* '(token|secret|phone|openid)'
    )
  ),
  CONSTRAINT douyin_miniapp_releases_timestamps_check CHECK (
    (audited_at IS NULL OR submitted_at IS NOT NULL)
    AND (released_at IS NULL OR (submitted_at IS NOT NULL AND audited_at IS NOT NULL))
    AND (status <> 'audit_pending' OR submitted_at IS NOT NULL)
    AND (status NOT IN ('audit_rejected', 'audit_approved') OR audited_at IS NOT NULL)
    AND (status <> 'released' OR released_at IS NOT NULL)
    AND (released_at IS NULL OR status = 'released')
  ),
  CONSTRAINT douyin_miniapp_releases_delivery_key_unique
    UNIQUE (installation_id, template_version),
  CONSTRAINT douyin_miniapp_releases_id_installation_unique
    UNIQUE (id, installation_id)
);
ALTER TABLE public.douyin_miniapp_installations
ADD COLUMN template_release_id uuid NULL,
ADD CONSTRAINT douyin_miniapp_installations_template_release_owner_fkey
FOREIGN KEY (template_release_id, id)
REFERENCES public.douyin_miniapp_releases(id, installation_id) ON DELETE RESTRICT;
CREATE INDEX douyin_miniapp_releases_installation_created_idx
ON public.douyin_miniapp_releases(installation_id, created_at DESC, id DESC);
CREATE INDEX douyin_miniapp_releases_status_updated_idx
ON public.douyin_miniapp_releases(status, updated_at DESC);
CREATE INDEX douyin_miniapp_releases_operation_claim_expiry_idx
ON public.douyin_miniapp_releases(installation_id, operation_claim_expires_at)
WHERE operation_claim_expires_at IS NOT NULL;
CREATE FUNCTION public.claim_douyin_miniapp_release_operation(
  p_release_id uuid, p_expected_statuses text[], p_operation_name text,
  p_claim_token uuid, p_claim_expires_at timestamptz, p_operator_id uuid
)
RETURNS TABLE(
  release_id uuid, claim_token uuid, claim_expires_at timestamptz,
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
      'upload', 'test_qr', 'submit_audit', 'sync_status', 'publish'
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
CREATE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
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
    OR p_ext_json -> 'ext' - 'deployment_key' <> '{}'::jsonb
    OR jsonb_typeof(p_ext_json -> 'ext' -> 'deployment_key') <> 'string'
    OR length(p_ext_json -> 'ext' ->> 'deployment_key') NOT BETWEEN 1 AND 128
    OR p_ext_json -> 'ext' ->> 'deployment_key'
      <> btrim(p_ext_json -> 'ext' ->> 'deployment_key')
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
CREATE FUNCTION public.sync_douyin_miniapp_release_metadata(
  p_installation_id uuid, p_release_id uuid, p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_release public.douyin_miniapp_releases%ROWTYPE;
  v_template_release_id uuid;
  v_current_release_created_at timestamptz;
  v_update_template boolean;
BEGIN
  IF p_installation_id IS NULL OR p_release_id IS NULL OR p_claim_token IS NULL THEN
    RETURN false;
  END IF;
  SELECT installation.template_release_id INTO v_template_release_id
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_installation_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT release.* INTO v_release
  FROM public.douyin_miniapp_releases AS release
  WHERE release.id = p_release_id
    AND release.installation_id = p_installation_id
    AND release.operation_claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT current_release.created_at INTO v_current_release_created_at
  FROM public.douyin_miniapp_releases AS current_release
  WHERE current_release.id = v_template_release_id;
  v_update_template := v_release.status IN (
    'uploaded', 'testing', 'audit_pending', 'audit_rejected', 'audit_approved', 'released'
  ) AND (
    v_current_release_created_at IS NULL
    OR (v_release.created_at, v_release.id)
      >= (v_current_release_created_at, v_template_release_id)
  );
  UPDATE public.douyin_miniapp_installations AS installation
  SET
    template_release_id = CASE WHEN v_update_template THEN v_release.id
      ELSE installation.template_release_id END,
    template_id = CASE WHEN v_update_template THEN v_release.template_id
      ELSE installation.template_id END,
    template_version = CASE WHEN v_update_template THEN v_release.template_version
      ELSE installation.template_version END,
    last_submitted_at = GREATEST(installation.last_submitted_at, v_release.submitted_at),
    last_audited_at = GREATEST(installation.last_audited_at, v_release.audited_at),
    last_released_at = GREATEST(installation.last_released_at, v_release.released_at)
  WHERE installation.id = p_installation_id;
  RETURN true;
END;
$$;
CREATE TRIGGER tr_douyin_miniapp_releases_updated_at
  BEFORE UPDATE ON public.douyin_miniapp_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.douyin_miniapp_releases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.douyin_miniapp_releases
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_miniapp_releases
TO service_role;
REVOKE ALL ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_douyin_miniapp_release_operation(
  uuid, text[], text, uuid, timestamptz, uuid
) TO service_role;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) TO service_role;
REVOKE ALL ON FUNCTION public.sync_douyin_miniapp_release_metadata(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_douyin_miniapp_release_metadata(
  uuid, uuid, uuid
) TO service_role;
COMMIT;
