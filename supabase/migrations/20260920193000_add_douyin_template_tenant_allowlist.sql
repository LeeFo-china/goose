-- Allow platform administrators to keep multiple reviewed Douyin templates
-- selectable while retaining one recommended template per channel. A selected
-- template starts a new immutable release cycle after an earlier cycle reached
-- released; unfinished cycles remain idempotent and exclusive per installation.
--
-- Rollback: first disable the tenant template selector in API/Admin and require
-- reads from is_current again. Keep the additive audit columns and release rows.
-- A later forward migration may disable all non-current allowlist rows. Do not
-- restore the permanent delivery-key unique constraint while repeated released
-- cycles exist, and never delete release history to force a schema rollback.
BEGIN;

ALTER TABLE public.douyin_miniapp_deployable_templates
  ADD COLUMN is_tenant_selectable boolean NOT NULL DEFAULT false,
  ADD COLUMN selectability_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN selectability_updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL;

UPDATE public.douyin_miniapp_deployable_templates
SET is_tenant_selectable = true,
    selectability_updated_at = confirmed_at,
    selectability_updated_by_employee_id = confirmed_by_employee_id
WHERE is_current = true;

CREATE INDEX douyin_deployable_templates_selectable_channel_idx
ON public.douyin_miniapp_deployable_templates(
  channel,
  is_tenant_selectable,
  is_current DESC,
  confirmed_at DESC,
  id DESC
);

CREATE FUNCTION public.ensure_current_douyin_template_selectable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.is_current = true AND NEW.is_tenant_selectable = false THEN
    NEW.is_tenant_selectable := true;
    NEW.selectability_updated_at := clock_timestamp();
    NEW.selectability_updated_by_employee_id := NEW.confirmed_by_employee_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_current_douyin_template_selectable()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER ensure_current_douyin_template_selectable_trigger
BEFORE INSERT OR UPDATE OF is_current
ON public.douyin_miniapp_deployable_templates
FOR EACH ROW
EXECUTE FUNCTION public.ensure_current_douyin_template_selectable();

CREATE FUNCTION public.set_douyin_deployable_template_selectability(
  p_template_record_id uuid,
  p_is_tenant_selectable boolean,
  p_expected_is_tenant_selectable boolean,
  p_actor_employee_id uuid
)
RETURNS public.douyin_miniapp_deployable_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_template public.douyin_miniapp_deployable_templates%ROWTYPE;
BEGIN
  IF p_template_record_id IS NULL
    OR p_is_tenant_selectable IS NULL
    OR p_expected_is_tenant_selectable IS NULL
    OR p_actor_employee_id IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_TEMPLATE_SELECTABILITY_INPUT_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    JOIN public.employee_roles AS employee_role
      ON employee_role.employee_id = employee.id
    JOIN public.roles AS role ON role.id = employee_role.role_id
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_id = role.id
    JOIN public.permissions AS permission
      ON permission.id = role_permission.permission_id
    WHERE employee.id = p_actor_employee_id
      AND employee.tenant_id IS NULL
      AND employee.status = 'active'
      AND role.tenant_id IS NULL
      AND role.status = 'active'
      AND permission.code = 'platform.douyin_miniapp.manage'
      AND permission.status = 'active'
      AND role_permission.access_scope = 'all'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TEMPLATE_SELECTABILITY_FORBIDDEN';
  END IF;

  SELECT template.* INTO v_template
  FROM public.douyin_miniapp_deployable_templates AS template
  WHERE template.id = p_template_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'DOUYIN_DEPLOYABLE_TEMPLATE_NOT_FOUND';
  END IF;

  IF v_template.is_tenant_selectable
    IS DISTINCT FROM p_expected_is_tenant_selectable
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'DOUYIN_TEMPLATE_SELECTABILITY_CHANGED';
  END IF;

  IF v_template.is_current = true AND p_is_tenant_selectable = false THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_CURRENT_TEMPLATE_MUST_REMAIN_SELECTABLE';
  END IF;

  IF v_template.is_tenant_selectable = p_is_tenant_selectable THEN
    RETURN v_template;
  END IF;

  UPDATE public.douyin_miniapp_deployable_templates AS template
  SET is_tenant_selectable = p_is_tenant_selectable,
      selectability_updated_at = clock_timestamp(),
      selectability_updated_by_employee_id = p_actor_employee_id
  WHERE template.id = p_template_record_id
  RETURNING template.* INTO v_template;

  RETURN v_template;
END;
$$;

REVOKE ALL ON FUNCTION public.set_douyin_deployable_template_selectability(
  uuid, boolean, boolean, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_douyin_deployable_template_selectability(
  uuid, boolean, boolean, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.set_douyin_deployable_template_selectability(
  uuid, boolean, boolean, uuid
) TO service_role;

ALTER TABLE public.douyin_miniapp_releases
  ADD COLUMN deployable_template_id uuid NULL
    REFERENCES public.douyin_miniapp_deployable_templates(id) ON DELETE RESTRICT;

UPDATE public.douyin_miniapp_releases AS release
SET deployable_template_id = template.id
FROM public.douyin_miniapp_deployable_templates AS template
WHERE release.deployable_template_id IS NULL
  AND template.template_id = release.template_id
  AND template.template_version = release.template_version
  AND template.channel = release.channel;

CREATE INDEX douyin_miniapp_releases_template_cycles_idx
ON public.douyin_miniapp_releases(
  installation_id,
  template_id,
  template_version,
  created_at DESC,
  id DESC
);

LOCK TABLE public.douyin_miniapp_releases IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.douyin_miniapp_releases
DROP CONSTRAINT douyin_miniapp_releases_delivery_key_unique;

CREATE FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3(
  p_installation_id uuid,
  p_deployable_template_id uuid,
  p_template_id text,
  p_template_version text,
  p_description text,
  p_channel text,
  p_ext_json jsonb,
  p_claim_token uuid,
  p_claim_expires_at timestamptz,
  p_operator_id uuid
)
RETURNS TABLE(
  id uuid, installation_id uuid, deployable_template_id uuid,
  template_id text, template_version text, description text,
  provider_summary text, channel text, ext_json jsonb, status text,
  douyin_log_id text, test_qr_url text, latest_test_qr_url text,
  audit_qr_url text, audit_host_names text[], audit_note text,
  audit_result jsonb, submitted_at timestamptz, audited_at timestamptz,
  released_at timestamptz, platform_operator_id uuid,
  created_at timestamptz, updated_at timestamptz, operation_name text,
  operation_claim_token uuid, operation_claim_expires_at timestamptz,
  recovery_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_template public.douyin_miniapp_deployable_templates%ROWTYPE;
  v_release public.douyin_miniapp_releases%ROWTYPE;
  v_latest_exact public.douyin_miniapp_releases%ROWTYPE;
  v_recovery_required boolean := false;
BEGIN
  IF p_installation_id IS NULL
    OR p_deployable_template_id IS NULL
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

  SELECT template.* INTO v_template
  FROM public.douyin_miniapp_deployable_templates AS template
  WHERE template.id = p_deployable_template_id
  FOR SHARE;

  IF NOT FOUND
    OR v_template.template_id IS DISTINCT FROM p_template_id
    OR v_template.template_version IS DISTINCT FROM p_template_version
    OR v_template.description IS DISTINCT FROM p_description
    OR v_template.channel IS DISTINCT FROM p_channel
    OR v_template.is_tenant_selectable IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'DOUYIN_DEPLOYABLE_TEMPLATE_UNAVAILABLE';
  END IF;

  PERFORM installation.id
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_installation_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT latest_exact.* INTO v_latest_exact
  FROM public.douyin_miniapp_releases AS latest_exact
  WHERE latest_exact.installation_id = p_installation_id
    AND latest_exact.template_id = p_template_id
    AND latest_exact.template_version = p_template_version
  ORDER BY latest_exact.created_at DESC, latest_exact.id DESC
  LIMIT 1
  FOR UPDATE;

  -- A latest_exact.status = 'released' row is immutable history; start a cycle.
  IF NOT FOUND OR v_latest_exact.status = 'released' THEN
    IF EXISTS (
      SELECT 1
      FROM public.douyin_miniapp_releases AS active_release
      WHERE active_release.installation_id = p_installation_id
        AND (
          active_release.status IN (
            'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved'
          )
          OR (
            active_release.operation_claim_token IS NOT NULL
            AND active_release.operation_claim_expires_at > v_now
          )
        )
    ) THEN
      RETURN;
    END IF;

    INSERT INTO public.douyin_miniapp_releases (
      installation_id, deployable_template_id, template_id,
      template_version, description, provider_summary, channel,
      ext_json, status, platform_operator_id
    ) VALUES (
      p_installation_id, p_deployable_template_id, p_template_id,
      p_template_version, p_description,
      left('[#' || p_template_id || '] ' || p_description, 200),
      p_channel, p_ext_json, 'created', p_operator_id
    )
    RETURNING * INTO v_release;
  ELSE
    v_release := v_latest_exact;
  END IF;

  IF v_release.deployable_template_id IS NULL THEN
    UPDATE public.douyin_miniapp_releases AS release
    SET deployable_template_id = p_deployable_template_id
    WHERE release.id = v_release.id
    RETURNING release.* INTO v_release;
  END IF;

  IF v_release.deployable_template_id IS DISTINCT FROM p_deployable_template_id
    OR v_release.channel IS DISTINCT FROM p_channel
    OR v_release.description IS DISTINCT FROM p_description
    OR v_release.ext_json IS DISTINCT FROM p_ext_json
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'DOUYIN_MINIAPP_RELEASE_DELIVERY_CONFLICT';
  END IF;

  IF v_release.operation_claim_token IS NOT NULL
    AND v_release.operation_claim_expires_at > v_now
  THEN
    RETURN;
  END IF;

  IF v_release.status IN (
      'created', 'uploaded', 'testing', 'audit_pending',
      'audit_rejected', 'audit_approved'
    )
    OR (
      v_release.status = 'failed'
      AND v_release.submitted_at IS NULL
      AND v_release.audited_at IS NULL
      AND v_release.released_at IS NULL
    )
  THEN
    v_recovery_required := v_release.operation_claim_token IS NOT NULL
      AND v_release.operation_claim_expires_at <= v_now;
    UPDATE public.douyin_miniapp_releases AS release
    SET operation_name = 'upload',
        operation_claim_token = p_claim_token,
        operation_claim_expires_at = p_claim_expires_at,
        platform_operator_id = p_operator_id
    WHERE release.id = v_release.id
    RETURNING release.* INTO v_release;
  ELSE
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_release.id, v_release.installation_id,
    v_release.deployable_template_id, v_release.template_id,
    v_release.template_version, v_release.description,
    v_release.provider_summary, v_release.channel, v_release.ext_json,
    v_release.status, v_release.douyin_log_id, v_release.test_qr_url,
    v_release.latest_test_qr_url, v_release.audit_qr_url,
    v_release.audit_host_names, v_release.audit_note,
    v_release.audit_result, v_release.submitted_at, v_release.audited_at,
    v_release.released_at, v_release.platform_operator_id,
    v_release.created_at, v_release.updated_at, v_release.operation_name,
    v_release.operation_claim_token, v_release.operation_claim_expires_at,
    v_recovery_required;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3(
  uuid, uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3(
  uuid, uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload_v3(
  uuid, uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) TO service_role;

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
  operation_claim_expires_at timestamptz, recovery_required boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_template_id uuid;
BEGIN
  SELECT template.id INTO v_template_id
  FROM public.douyin_miniapp_deployable_templates AS template
  WHERE template.template_id = p_template_id
    AND template.template_version = p_template_version
    AND template.channel = p_channel
    AND template.is_current = true
    AND template.is_tenant_selectable = true;

  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY SELECT
    claimed.id, claimed.installation_id, claimed.template_id,
    claimed.template_version, claimed.description, claimed.channel,
    claimed.ext_json, claimed.status, claimed.douyin_log_id,
    claimed.test_qr_url, claimed.audit_host_names, claimed.audit_note,
    claimed.audit_result, claimed.submitted_at, claimed.audited_at,
    claimed.released_at, claimed.platform_operator_id, claimed.created_at,
    claimed.updated_at, claimed.operation_name,
    claimed.operation_claim_token, claimed.operation_claim_expires_at,
    claimed.recovery_required
  FROM public.get_or_create_and_claim_douyin_miniapp_release_upload_v3(
    p_installation_id, v_template_id, p_template_id, p_template_version,
    p_description, p_channel, p_ext_json, p_claim_token,
    p_claim_expires_at, p_operator_id
  ) AS claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_or_create_and_claim_douyin_miniapp_release_upload(
  uuid, text, text, text, text, jsonb, uuid, timestamptz, uuid
) TO service_role;

COMMIT;
