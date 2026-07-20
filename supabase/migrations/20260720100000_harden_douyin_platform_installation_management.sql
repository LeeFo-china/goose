-- Harden platform-managed Douyin installation state changes against TOCTOU.
--
-- Lock ordering:
-- - existing installations: installation -> component -> tenant;
-- - visible template installation: installation -> component -> tenant;
-- - first template-development insert: component -> tenant -> authorizer unique key.
-- Shared component/tenant locks prevent status changes until the installation
-- mutation commits. The authorizer unique index serializes concurrent creates.
-- ON CONFLICT can only wait for another creator's uncommitted unique row.
-- A later enable's component and tenant SHARE locks are compatible with the creator's locks.
-- It can therefore finish without a lock cycle before the creator re-reads that row.
--
-- Rollback (run only after disabling platform installation mutations):
-- DROP FUNCTION IF EXISTS public.create_douyin_template_development_installation( text, text, uuid, jsonb );
-- DROP FUNCTION IF EXISTS public.enable_douyin_miniapp_installation( uuid );
-- DROP FUNCTION IF EXISTS public.bind_douyin_miniapp_installation( text, uuid, text, jsonb );
-- Then restore bind_douyin_miniapp_installation from migration 20260719110000.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_douyin_template_development_installation(
  p_component_appid text,
  p_authorizer_appid text,
  p_tenant_id uuid,
  p_runtime_config jsonb
)
RETURNS public.douyin_miniapp_installations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_component_appid text;
  v_tenant_id uuid;
  v_installation public.douyin_miniapp_installations%ROWTYPE;
BEGIN
  IF p_component_appid IS NULL
    OR btrim(p_component_appid) = ''
    OR p_authorizer_appid IS NULL
    OR btrim(p_authorizer_appid) = ''
    OR p_tenant_id IS NULL
    OR p_runtime_config IS NULL
    OR jsonb_typeof(p_runtime_config) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TEMPLATE_INSTALLATION_CONFLICT';
  END IF;

  -- A visible authorizer always follows installation -> component -> tenant.
  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.authorizer_appid = p_authorizer_appid
  FOR UPDATE;

  IF FOUND THEN
    IF v_installation.component_appid IS DISTINCT FROM p_component_appid
      OR v_installation.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_installation.installation_kind <> 'template_development'
      OR v_installation.authorization_status <> 'active'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_TEMPLATE_INSTALLATION_CONFLICT';
    END IF;

    SELECT component.component_appid
    INTO v_component_appid
    FROM public.douyin_third_party_components AS component
    WHERE component.component_appid = v_installation.component_appid
      AND component.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE';
    END IF;

    SELECT tenant.id
    INTO v_tenant_id
    FROM public.tenants AS tenant
    WHERE tenant.id = v_installation.tenant_id
      AND tenant.status = 'active'
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
    END IF;

    RETURN v_installation;
  END IF;

  -- No visible installation exists: lock active component, then active tenant.
  SELECT component.component_appid
  INTO v_component_appid
  FROM public.douyin_third_party_components AS component
  WHERE component.component_appid = p_component_appid
    AND component.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE';
  END IF;

  SELECT tenant.id
  INTO v_tenant_id
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
  END IF;

  INSERT INTO public.douyin_miniapp_installations (
    component_appid,
    authorizer_appid,
    tenant_id,
    installation_kind,
    authorization_status,
    runtime_config
  )
  VALUES (
    p_component_appid,
    p_authorizer_appid,
    p_tenant_id,
    'template_development',
    'active',
    p_runtime_config
  )
  ON CONFLICT (authorizer_appid) DO NOTHING
  RETURNING * INTO v_installation;

  IF NOT FOUND THEN
    SELECT installation.*
    INTO v_installation
    FROM public.douyin_miniapp_installations AS installation
    WHERE installation.authorizer_appid = p_authorizer_appid
    FOR UPDATE;
  END IF;

  IF v_installation.id IS NULL
    OR v_installation.component_appid IS DISTINCT FROM p_component_appid
    OR v_installation.tenant_id IS DISTINCT FROM p_tenant_id
    OR v_installation.installation_kind <> 'template_development'
    OR v_installation.authorization_status <> 'active'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TEMPLATE_INSTALLATION_CONFLICT';
  END IF;

  RETURN v_installation;
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_douyin_miniapp_installation(
  p_installation_id uuid
)
RETURNS public.douyin_miniapp_installations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_component_appid text;
  v_tenant_id uuid;
BEGIN
  IF p_installation_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_INSTALLATION_STATE_CONFLICT';
  END IF;

  -- Existing-installation lock order: installation, component, tenant.
  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.id = p_installation_id
  FOR UPDATE;

  IF NOT FOUND OR v_installation.authorization_status <> 'disabled' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_INSTALLATION_STATE_CONFLICT';
  END IF;

  SELECT component.component_appid
  INTO v_component_appid
  FROM public.douyin_third_party_components AS component
  WHERE component.component_appid = v_installation.component_appid
    AND component.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE';
  END IF;

  SELECT tenant.id
  INTO v_tenant_id
  FROM public.tenants AS tenant
  WHERE tenant.id = v_installation.tenant_id
    AND tenant.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
  END IF;

  UPDATE public.douyin_miniapp_installations
  SET authorization_status = 'active'
  WHERE id = v_installation.id
  RETURNING * INTO v_installation;

  RETURN v_installation;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_douyin_miniapp_installation(
  p_authorizer_appid text,
  p_tenant_id uuid,
  p_deployment_key text,
  p_runtime_config jsonb
)
RETURNS public.douyin_miniapp_installations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_component_appid text;
  v_tenant_id uuid;
BEGIN
  IF p_authorizer_appid IS NULL
    OR btrim(p_authorizer_appid) = ''
    OR p_tenant_id IS NULL
    OR p_deployment_key IS NULL
    OR btrim(p_deployment_key) = ''
    OR p_runtime_config IS NULL
    OR jsonb_typeof(p_runtime_config) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_INSTALLATION_BIND_CONFLICT';
  END IF;

  -- Existing-installation lock order: installation, component, tenant.
  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.authorizer_appid = p_authorizer_appid
    AND installation.installation_kind = 'merchant'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_INSTALLATION_BIND_CONFLICT';
  END IF;

  SELECT component.component_appid
  INTO v_component_appid
  FROM public.douyin_third_party_components AS component
  WHERE component.component_appid = v_installation.component_appid
    AND component.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE';
  END IF;

  SELECT tenant.id
  INTO v_tenant_id
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
  END IF;

  IF v_installation.authorization_status = 'authorized_unbound' THEN
    UPDATE public.douyin_miniapp_installations
    SET
      tenant_id = p_tenant_id,
      deployment_key = p_deployment_key,
      runtime_config = p_runtime_config,
      authorization_status = 'active'
    WHERE id = v_installation.id
    RETURNING * INTO v_installation;
  ELSIF v_installation.authorization_status <> 'active'
    OR v_installation.tenant_id IS DISTINCT FROM p_tenant_id
    OR v_installation.deployment_key IS DISTINCT FROM p_deployment_key
    OR v_installation.runtime_config IS DISTINCT FROM p_runtime_config
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_INSTALLATION_BIND_CONFLICT';
  END IF;

  RETURN v_installation;
END;
$$;

REVOKE ALL ON FUNCTION public.create_douyin_template_development_installation(
  text, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_douyin_template_development_installation(
  text, text, uuid, jsonb
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_douyin_template_development_installation(
  text, text, uuid, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.enable_douyin_miniapp_installation(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enable_douyin_miniapp_installation(uuid)
FROM service_role;
GRANT EXECUTE ON FUNCTION public.enable_douyin_miniapp_installation(uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.bind_douyin_miniapp_installation(
  text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_douyin_miniapp_installation(
  text, uuid, text, jsonb
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.bind_douyin_miniapp_installation(
  text, uuid, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.create_douyin_template_development_installation(
  text, text, uuid, jsonb
) IS 'Atomically creates or returns the one credential-free template-development installation.';
COMMENT ON FUNCTION public.enable_douyin_miniapp_installation(uuid)
IS 'Atomically enables a Douyin installation only while its component and tenant remain active.';
COMMENT ON FUNCTION public.bind_douyin_miniapp_installation(text, uuid, text, jsonb)
IS 'Atomically binds one Douyin merchant installation while its component and tenant remain active.';

COMMIT;
