-- Allow a tenant to restart an abandoned Douyin authorization attempt.
--
-- The latest pending attempt wins. An intent whose callback is already being
-- processed remains protected and continues to reject replacement requests.
--
-- Rollback: restore create_tenant_douyin_authorization_intent from
-- 20260726110000_tenant_douyin_authorization_intents.sql. Existing intents do
-- not need data rollback because superseded rows are valid terminal failures.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_tenant_douyin_authorization_intent(
  p_tenant_id uuid,
  p_requested_by_employee_id uuid,
  p_component_appid text,
  p_intent_digest text,
  p_expires_at timestamptz
)
RETURNS public.douyin_miniapp_authorization_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_intent public.douyin_miniapp_authorization_intents%ROWTYPE;
  v_component_appid text;
  v_tenant_id uuid;
  v_employee_id uuid;
BEGIN
  IF p_tenant_id IS NULL
    OR p_requested_by_employee_id IS NULL
    OR p_component_appid IS NULL
    OR btrim(p_component_appid) = ''
    OR p_intent_digest IS NULL
    OR p_intent_digest !~ '^[0-9a-f]{64}$'
    OR p_expires_at IS NULL
    OR p_expires_at <= v_now
    OR p_expires_at > v_now + interval '10 minutes'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_INVALID';
  END IF;

  -- Creation lock order: component, tenant, employee. The tenant update lock
  -- serializes restart attempts before the partial unique index is evaluated.
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
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
  END IF;

  SELECT employee.id
  INTO v_employee_id
  FROM public.employees AS employee
  WHERE employee.id = p_requested_by_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_EMPLOYEE_INVALID';
  END IF;

  UPDATE public.douyin_miniapp_authorization_intents AS intent
  SET status = 'expired'
  WHERE intent.tenant_id = p_tenant_id
    AND intent.status IN ('pending', 'completing')
    AND intent.expires_at <= v_now;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_authorization_intents AS intent
    WHERE intent.tenant_id = p_tenant_id
      AND intent.status = 'completing'
      AND intent.expires_at > v_now
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
  END IF;

  UPDATE public.douyin_miniapp_authorization_intents AS intent
  SET status = 'failed',
      failure_code = 'DOUYIN_AUTHORIZATION_RESTARTED'
  WHERE intent.tenant_id = p_tenant_id
    AND intent.status = 'pending';

  INSERT INTO public.douyin_miniapp_authorization_intents (
    tenant_id,
    requested_by_employee_id,
    component_appid,
    intent_digest,
    expires_at
  )
  VALUES (
    p_tenant_id,
    p_requested_by_employee_id,
    p_component_appid,
    p_intent_digest,
    p_expires_at
  )
  RETURNING * INTO v_intent;

  RETURN v_intent;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_douyin_authorization_intent(
  uuid, uuid, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_tenant_douyin_authorization_intent(
  uuid, uuid, text, text, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.create_tenant_douyin_authorization_intent(
  uuid, uuid, text, text, timestamptz
)
IS 'Creates the latest tenant Douyin authorization intent and supersedes an abandoned pending attempt.';

COMMIT;
