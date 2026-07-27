-- Rollback: in a forward migration, revoke and drop the four RPCs, remove the
-- four scoped role-permission mappings and permission rows, then drop the
-- entitlement event, entitlement, and brand profile tables in that order.

BEGIN;

CREATE TABLE public.brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  logo_file_id uuid NOT NULL
    REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  published_display_name text NULL,
  published_logo_file_id uuid NULL
    REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  published_version integer NULL,
  published_at timestamptz NULL,
  updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brand_profiles_scope_check
    CHECK (scope IN ('platform', 'tenant')),
  CONSTRAINT brand_profiles_scope_tenant_check
    CHECK (
      (scope = 'platform' AND tenant_id IS NULL)
      OR (scope = 'tenant' AND tenant_id IS NOT NULL)
    ),
  CONSTRAINT brand_profiles_display_name_length_check
    CHECK (char_length(display_name) BETWEEN 2 AND 40),
  CONSTRAINT brand_profiles_published_display_name_length_check
    CHECK (
      published_display_name IS NULL
      OR char_length(published_display_name) BETWEEN 2 AND 40
    ),
  CONSTRAINT brand_profiles_status_check
    CHECK (status IN ('draft', 'published', 'disabled')),
  CONSTRAINT brand_profiles_version_check
    CHECK (version > 0),
  CONSTRAINT brand_profiles_published_version_check
    CHECK (
      published_version IS NULL
      OR (
        published_version > 0
        AND published_version <= version
      )
    ),
  CONSTRAINT brand_profiles_published_snapshot_check
    CHECK (
      (
        published_display_name IS NULL
        AND published_logo_file_id IS NULL
        AND published_version IS NULL
        AND published_at IS NULL
      )
      OR (
        published_display_name IS NOT NULL
        AND published_logo_file_id IS NOT NULL
        AND published_version IS NOT NULL
        AND published_at IS NOT NULL
      )
    ),
  CONSTRAINT brand_profiles_published_status_check
    CHECK (
      status <> 'published'
      OR (
        published_display_name IS NOT NULL
        AND published_logo_file_id IS NOT NULL
        AND published_version IS NOT NULL
        AND published_at IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX brand_profiles_platform_unique_idx
ON public.brand_profiles(scope)
WHERE scope = 'platform';

CREATE UNIQUE INDEX brand_profiles_tenant_unique_idx
ON public.brand_profiles(tenant_id)
WHERE scope = 'tenant';

CREATE TABLE public.tenant_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  entitlement_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  source_type text NOT NULL,
  source_id uuid NULL,
  suspended_at timestamptz NULL,
  suspend_reason text NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_entitlements_tenant_code_key
    UNIQUE (tenant_id, entitlement_code),
  CONSTRAINT tenant_entitlements_code_check
    CHECK (entitlement_code = 'custom_support_branding'),
  CONSTRAINT tenant_entitlements_status_check
    CHECK (status IN ('active', 'suspended', 'expired', 'revoked')),
  CONSTRAINT tenant_entitlements_term_check
    CHECK (expires_at > starts_at),
  CONSTRAINT tenant_entitlements_source_type_check
    CHECK (source_type IN ('manual_grant', 'purchase')),
  CONSTRAINT tenant_entitlements_suspend_metadata_check
    CHECK (
      status <> 'suspended'
      OR (
        suspended_at IS NOT NULL
        AND suspend_reason IS NOT NULL
        AND btrim(suspend_reason) <> ''
      )
    ),
  CONSTRAINT tenant_entitlements_version_check
    CHECK (version > 0)
);

CREATE INDEX tenant_entitlements_status_expiry_idx
ON public.tenant_entitlements(status, expires_at, tenant_id);

CREATE INDEX tenant_entitlements_tenant_updated_idx
ON public.tenant_entitlements(tenant_id, updated_at DESC, id DESC);

CREATE TABLE public.tenant_entitlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL
    REFERENCES public.tenant_entitlements(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  entitlement_code text NOT NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NULL,
  old_value jsonb NOT NULL,
  new_value jsonb NOT NULL,
  reason text NULL,
  actor_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_entitlement_events_code_not_blank_check
    CHECK (btrim(entitlement_code) <> ''),
  CONSTRAINT tenant_entitlement_events_event_type_check
    CHECK (
      event_type IN (
        'granted',
        'renewed',
        'suspended',
        'resumed',
        'expired',
        'revoked'
      )
    ),
  CONSTRAINT tenant_entitlement_events_source_type_check
    CHECK (source_type IN ('manual_grant', 'purchase', 'system')),
  CONSTRAINT tenant_entitlement_events_old_value_object_check
    CHECK (jsonb_typeof(old_value) = 'object'),
  CONSTRAINT tenant_entitlement_events_new_value_object_check
    CHECK (jsonb_typeof(new_value) = 'object'),
  CONSTRAINT tenant_entitlement_events_reason_not_blank_check
    CHECK (reason IS NULL OR btrim(reason) <> '')
);

CREATE INDEX tenant_entitlement_events_tenant_created_idx
ON public.tenant_entitlement_events(tenant_id, created_at DESC, id DESC);

CREATE INDEX tenant_entitlement_events_entitlement_created_idx
ON public.tenant_entitlement_events(
  entitlement_id,
  created_at DESC,
  id DESC
);

CREATE TRIGGER tr_brand_profiles_updated_at
BEFORE UPDATE ON public.brand_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_entitlements_updated_at
BEFORE UPDATE ON public.tenant_entitlements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_entitlement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_entitlement_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.brand_profiles
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_entitlements
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_entitlement_events
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_entitlement_events
FROM service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.brand_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.tenant_entitlements TO service_role;
GRANT SELECT, INSERT
ON TABLE public.tenant_entitlement_events TO service_role;

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  ('platform.branding.manage', '管理平台技术支持品牌', 'platform_branding', 'branding', 'manage', '管理平台技术支持品牌资料和发布状态', 'active'),
  ('platform.tenant_entitlement.manage', '管理租户增值权益', 'platform_entitlement', 'tenant_entitlement', 'manage', '管理租户增值权益状态和期限', 'active'),
  ('brand.settings.read', '查看品牌技术支持设置', 'branding', 'brand_settings', 'read', '查看当前租户品牌技术支持设置', 'active'),
  ('brand.settings.update', '编辑品牌技术支持设置', 'branding', 'brand_settings', 'update', '编辑和发布当前租户品牌技术支持设置', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'platform.branding.manage',
    'platform.tenant_entitlement.manage'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'brand.settings.read',
    'brand.settings.update'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE OR REPLACE FUNCTION public.save_brand_profile_draft(
  p_scope text,
  p_tenant_id uuid,
  p_display_name text,
  p_logo_file_id uuid,
  p_expected_version integer,
  p_actor_employee_id uuid
)
RETURNS public.brand_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.brand_profiles%ROWTYPE;
BEGIN
  IF p_scope IS NULL
     OR p_scope NOT IN ('platform', 'tenant')
     OR (p_scope = 'platform' AND p_tenant_id IS NOT NULL)
     OR (p_scope = 'tenant' AND p_tenant_id IS NULL)
     OR p_display_name IS NULL
     OR char_length(p_display_name) NOT BETWEEN 2 AND 40
     OR p_logo_file_id IS NULL
     OR p_expected_version IS NULL
     OR p_expected_version < 0
     OR p_actor_employee_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Invalid brand profile draft input',
      DETAIL = 'VALIDATION_ERROR';
  END IF;

  IF p_scope = 'tenant' THEN
    PERFORM 1
    FROM public.tenants AS tenant
    WHERE tenant.id = p_tenant_id
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Tenant not found',
        DETAIL = 'TENANT_NOT_FOUND';
    END IF;
  END IF;

  PERFORM 1
  FROM public.platform_file_objects AS file
  WHERE file.id = p_logo_file_id
    AND file.scene = 'brand_logo'
    AND file.status = 'active'
    AND file.visibility = 'public'
    AND (
      (p_scope = 'platform' AND file.tenant_id IS NULL)
      OR (p_scope = 'tenant' AND file.tenant_id = p_tenant_id)
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Brand logo file not found',
      DETAIL = 'BRANDING_LOGO_FILE_NOT_FOUND';
  END IF;

  SELECT profile.*
  INTO v_profile
  FROM public.brand_profiles AS profile
  WHERE profile.scope = p_scope
    AND profile.tenant_id IS NOT DISTINCT FROM p_tenant_id
  FOR UPDATE;

  IF p_expected_version = 0 THEN
    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Brand profile version conflict',
        DETAIL = 'BRANDING_PROFILE_VERSION_CONFLICT';
    END IF;

    BEGIN
      INSERT INTO public.brand_profiles (
        scope,
        tenant_id,
        display_name,
        logo_file_id,
        status,
        version,
        updated_by_employee_id
      )
      VALUES (
        p_scope,
        p_tenant_id,
        p_display_name,
        p_logo_file_id,
        'draft',
        1,
        p_actor_employee_id
      )
      RETURNING brand_profiles.* INTO v_profile;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Brand profile version conflict',
          DETAIL = 'BRANDING_PROFILE_VERSION_CONFLICT';
    END;

    RETURN v_profile;
  END IF;

  IF NOT FOUND OR v_profile.version <> p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Brand profile version conflict',
      DETAIL = 'BRANDING_PROFILE_VERSION_CONFLICT';
  END IF;

  UPDATE public.brand_profiles
  SET
    display_name = p_display_name,
    logo_file_id = p_logo_file_id,
    version = version + 1,
    updated_by_employee_id = p_actor_employee_id
  WHERE id = v_profile.id
  RETURNING brand_profiles.* INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_brand_profile(
  p_scope text,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_employee_id uuid
)
RETURNS public.brand_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.brand_profiles%ROWTYPE;
BEGIN
  IF p_scope IS NULL
     OR p_scope NOT IN ('platform', 'tenant')
     OR (p_scope = 'platform' AND p_tenant_id IS NOT NULL)
     OR (p_scope = 'tenant' AND p_tenant_id IS NULL)
     OR p_expected_version IS NULL
     OR p_expected_version <= 0
     OR p_actor_employee_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Invalid brand profile publish input',
      DETAIL = 'VALIDATION_ERROR';
  END IF;

  SELECT profile.*
  INTO v_profile
  FROM public.brand_profiles AS profile
  WHERE profile.scope = p_scope
    AND profile.tenant_id IS NOT DISTINCT FROM p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Brand profile draft is incomplete',
      DETAIL = 'BRANDING_PROFILE_INCOMPLETE';
  END IF;

  IF v_profile.version <> p_expected_version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Brand profile version conflict',
      DETAIL = 'BRANDING_PROFILE_VERSION_CONFLICT';
  END IF;

  IF v_profile.display_name IS NULL
     OR char_length(v_profile.display_name) NOT BETWEEN 2 AND 40
     OR v_profile.logo_file_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Brand profile draft is incomplete',
      DETAIL = 'BRANDING_PROFILE_INCOMPLETE';
  END IF;

  PERFORM 1
  FROM public.platform_file_objects AS file
  WHERE file.id = v_profile.logo_file_id
    AND file.scene = 'brand_logo'
    AND file.status = 'active'
    AND file.visibility = 'public'
    AND (
      (p_scope = 'platform' AND file.tenant_id IS NULL)
      OR (p_scope = 'tenant' AND file.tenant_id = p_tenant_id)
    )
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Brand logo file not found',
      DETAIL = 'BRANDING_LOGO_FILE_NOT_FOUND';
  END IF;

  UPDATE public.brand_profiles
  SET
    published_display_name = display_name,
    published_logo_file_id = logo_file_id,
    status = 'published',
    published_version = version,
    published_at = clock_timestamp(),
    updated_by_employee_id = p_actor_employee_id
  WHERE id = v_profile.id
  RETURNING brand_profiles.* INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_tenant_entitlement_action(
  p_tenant_id uuid,
  p_entitlement_code text,
  p_action text,
  p_term_years integer,
  p_reason text,
  p_expected_version integer,
  p_actor_employee_id uuid,
  p_actor_user_id uuid
)
RETURNS public.tenant_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entitlement public.tenant_entitlements%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_old_value jsonb := '{}'::jsonb;
  v_new_value jsonb;
  v_event_type text;
  v_found boolean := false;
BEGIN
  IF p_tenant_id IS NULL
     OR p_entitlement_code IS NULL
     OR p_entitlement_code <> 'custom_support_branding'
     OR p_action IS NULL
     OR p_action NOT IN ('grant', 'suspend', 'resume', 'revoke')
     OR p_expected_version IS NULL
     OR p_expected_version < 0
     OR p_actor_employee_id IS NULL
     OR p_actor_user_id IS NULL
     OR (
       p_reason IS NOT NULL
       AND btrim(p_reason) = ''
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Invalid tenant entitlement action input',
      DETAIL = 'VALIDATION_ERROR';
  END IF;

  IF p_action = 'grant' THEN
    IF p_term_years IS NULL
       OR p_term_years NOT BETWEEN 1 AND 10 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Invalid tenant entitlement term',
        DETAIL = 'VALIDATION_ERROR';
    END IF;
  ELSIF p_term_years IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Term is only valid for grant',
      DETAIL = 'VALIDATION_ERROR';
  END IF;

  IF p_action IN ('suspend', 'resume', 'revoke')
     AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Reason is required for this entitlement action',
      DETAIL = 'VALIDATION_ERROR';
  END IF;

  PERFORM 1
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Tenant not found',
      DETAIL = 'TENANT_NOT_FOUND';
  END IF;

  SELECT entitlement.*
  INTO v_entitlement
  FROM public.tenant_entitlements AS entitlement
  WHERE entitlement.tenant_id = p_tenant_id
    AND entitlement.entitlement_code = p_entitlement_code
  FOR UPDATE;

  v_found := FOUND;

  IF p_action = 'grant' THEN
    IF NOT v_found THEN
      IF p_expected_version <> 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement version conflict',
          DETAIL = 'TENANT_ENTITLEMENT_VERSION_CONFLICT';
      END IF;

      INSERT INTO public.tenant_entitlements (
        tenant_id,
        entitlement_code,
        status,
        starts_at,
        expires_at,
        source_type,
        source_id,
        version,
        updated_by_employee_id
      )
      VALUES (
        p_tenant_id,
        p_entitlement_code,
        'active',
        v_now,
        v_now + make_interval(years => p_term_years),
        'manual_grant',
        NULL,
        1,
        p_actor_employee_id
      )
      RETURNING tenant_entitlements.* INTO v_entitlement;

      v_event_type := 'granted';
    ELSE
      IF v_entitlement.version <> p_expected_version THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement version conflict',
          DETAIL = 'TENANT_ENTITLEMENT_VERSION_CONFLICT';
      END IF;

      IF v_entitlement.status IN ('active', 'suspended') THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement state conflict',
          DETAIL = 'TENANT_ENTITLEMENT_STATE_CONFLICT';
      END IF;

      v_old_value := to_jsonb(v_entitlement);

      UPDATE public.tenant_entitlements
      SET
        status = 'active',
        starts_at = v_now,
        expires_at = v_now + make_interval(years => p_term_years),
        source_type = 'manual_grant',
        source_id = NULL,
        suspended_at = NULL,
        suspend_reason = NULL,
        version = version + 1,
        updated_by_employee_id = p_actor_employee_id
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;

      v_event_type := 'renewed';
    END IF;
  ELSE
    IF NOT v_found THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Tenant entitlement not found',
        DETAIL = 'TENANT_ENTITLEMENT_NOT_FOUND';
    END IF;

    IF v_entitlement.version <> p_expected_version THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Tenant entitlement version conflict',
        DETAIL = 'TENANT_ENTITLEMENT_VERSION_CONFLICT';
    END IF;

    v_old_value := to_jsonb(v_entitlement);

    IF p_action = 'suspend' THEN
      IF v_entitlement.status <> 'active' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement state conflict',
          DETAIL = 'TENANT_ENTITLEMENT_STATE_CONFLICT';
      END IF;

      IF v_entitlement.expires_at <= v_now THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement has expired',
          DETAIL = 'BRANDING_ENTITLEMENT_EXPIRED';
      END IF;

      UPDATE public.tenant_entitlements
      SET
        status = 'suspended',
        suspended_at = v_now,
        suspend_reason = p_reason,
        version = version + 1,
        updated_by_employee_id = p_actor_employee_id
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;

      v_event_type := 'suspended';
    ELSIF p_action = 'resume' THEN
      IF v_entitlement.status <> 'suspended' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement state conflict',
          DETAIL = 'TENANT_ENTITLEMENT_STATE_CONFLICT';
      END IF;

      IF v_entitlement.expires_at <= v_now THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement has expired',
          DETAIL = 'BRANDING_ENTITLEMENT_EXPIRED';
      END IF;

      UPDATE public.tenant_entitlements
      SET
        status = 'active',
        suspended_at = NULL,
        suspend_reason = NULL,
        version = version + 1,
        updated_by_employee_id = p_actor_employee_id
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;

      v_event_type := 'resumed';
    ELSIF p_action = 'revoke' THEN
      IF v_entitlement.status NOT IN ('active', 'suspended') THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'Tenant entitlement state conflict',
          DETAIL = 'TENANT_ENTITLEMENT_STATE_CONFLICT';
      END IF;

      UPDATE public.tenant_entitlements
      SET
        status = 'revoked',
        version = version + 1,
        updated_by_employee_id = p_actor_employee_id
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;

      v_event_type := 'revoked';
    END IF;
  END IF;

  v_new_value := to_jsonb(v_entitlement);

  INSERT INTO public.tenant_entitlement_events (
    entitlement_id,
    tenant_id,
    entitlement_code,
    event_type,
    source_type,
    source_id,
    old_value,
    new_value,
    reason,
    actor_employee_id,
    actor_user_id
  )
  VALUES (
    v_entitlement.id,
    v_entitlement.tenant_id,
    v_entitlement.entitlement_code,
    v_event_type,
    'manual_grant',
    NULL,
    v_old_value,
    v_new_value,
    p_reason,
    p_actor_employee_id,
    p_actor_user_id
  );

  INSERT INTO public.platform_audit_logs (
    action,
    actor_employee_id,
    actor_user_id,
    target_tenant_id,
    resource_type,
    resource_id,
    resource_label,
    status,
    summary,
    metadata
  )
  VALUES (
    'tenant_entitlement_' || p_action,
    p_actor_employee_id,
    p_actor_user_id,
    p_tenant_id,
    'tenant_entitlement',
    v_entitlement.id,
    p_entitlement_code,
    'success',
    'Tenant entitlement action applied',
    jsonb_build_object(
      'previous',
      v_old_value,
      'current',
      v_new_value,
      'reason',
      p_reason
    )
  );

  RETURN v_entitlement;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_tenant_entitlement_if_due(
  p_tenant_id uuid,
  p_entitlement_code text,
  p_now timestamptz
)
RETURNS public.tenant_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entitlement public.tenant_entitlements%ROWTYPE;
  v_old_value jsonb;
BEGIN
  IF p_tenant_id IS NULL
     OR p_entitlement_code IS NULL
     OR p_entitlement_code <> 'custom_support_branding'
     OR p_now IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Invalid tenant entitlement expiry input',
      DETAIL = 'VALIDATION_ERROR';
  END IF;

  SELECT entitlement.*
  INTO v_entitlement
  FROM public.tenant_entitlements AS entitlement
  WHERE entitlement.tenant_id = p_tenant_id
    AND entitlement.entitlement_code = p_entitlement_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_entitlement.status NOT IN ('active', 'suspended')
     OR v_entitlement.expires_at > p_now THEN
    RETURN v_entitlement;
  END IF;

  v_old_value := to_jsonb(v_entitlement);

  UPDATE public.tenant_entitlements
  SET
    status = 'expired',
    version = version + 1,
    updated_by_employee_id = NULL
  WHERE id = v_entitlement.id
    AND status IN ('active', 'suspended')
    AND expires_at <= p_now
  RETURNING tenant_entitlements.* INTO v_entitlement;

  IF NOT FOUND THEN
    SELECT entitlement.*
    INTO v_entitlement
    FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = p_tenant_id
      AND entitlement.entitlement_code = p_entitlement_code;

    RETURN v_entitlement;
  END IF;

  INSERT INTO public.tenant_entitlement_events (
    entitlement_id,
    tenant_id,
    entitlement_code,
    event_type,
    source_type,
    source_id,
    old_value,
    new_value,
    reason,
    actor_employee_id,
    actor_user_id
  )
  VALUES (
    v_entitlement.id,
    v_entitlement.tenant_id,
    v_entitlement.entitlement_code,
    'expired',
    'system',
    NULL,
    v_old_value,
    to_jsonb(v_entitlement),
    'Entitlement term elapsed',
    NULL,
    NULL
  );

  RETURN v_entitlement;
END;
$$;

REVOKE ALL ON FUNCTION public.save_brand_profile_draft(
  text, uuid, text, uuid, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_brand_profile_draft(
  text, uuid, text, uuid, integer, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.save_brand_profile_draft(
  text, uuid, text, uuid, integer, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_brand_profile_draft(
  text, uuid, text, uuid, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.publish_brand_profile(
  text, uuid, integer, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_brand_profile(
  text, uuid, integer, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.publish_brand_profile(
  text, uuid, integer, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_brand_profile(
  text, uuid, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.apply_tenant_entitlement_action(
  uuid, text, text, integer, text, integer, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_tenant_entitlement_action(
  uuid, text, text, integer, text, integer, uuid, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.apply_tenant_entitlement_action(
  uuid, text, text, integer, text, integer, uuid, uuid
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_tenant_entitlement_action(
  uuid, text, text, integer, text, integer, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.expire_tenant_entitlement_if_due(
  uuid, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_tenant_entitlement_if_due(
  uuid, text, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.expire_tenant_entitlement_if_due(
  uuid, text, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_tenant_entitlement_if_due(
  uuid, text, timestamptz
) TO service_role;

COMMENT ON TABLE public.brand_profiles
IS 'Platform and tenant support-branding draft plus published snapshot.';
COMMENT ON TABLE public.tenant_entitlements
IS 'Current tenant entitlement state with optimistic-lock version.';
COMMENT ON TABLE public.tenant_entitlement_events
IS 'Append-only tenant entitlement state-transition events.';

COMMIT;
