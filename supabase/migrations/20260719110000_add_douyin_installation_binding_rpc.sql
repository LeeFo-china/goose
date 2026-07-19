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

  -- Fixed lock order: installation first, tenant second.
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

REVOKE ALL ON FUNCTION public.bind_douyin_miniapp_installation(
  text, uuid, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_douyin_miniapp_installation(
  text, uuid, text, jsonb
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.bind_douyin_miniapp_installation(
  text, uuid, text, jsonb
) TO service_role;

COMMENT ON FUNCTION public.bind_douyin_miniapp_installation(text, uuid, text, jsonb)
IS 'Atomically binds one Douyin merchant installation to an active tenant.';
