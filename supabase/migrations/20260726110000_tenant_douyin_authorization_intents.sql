-- Tenant self-service Douyin authorization intents.
--
-- Rollback:
-- 1. disable tenant authorization-link and authorization-callback endpoints;
-- 2. stop authorization event code-digest correlation;
-- 3. drop the RPCs, indexes, trigger, and intent table;
-- 4. drop douyin_authorization_event_deliveries.authorization_code_digest.
--
-- Existing merchant installation bindings and credentials are intentionally
-- preserved. Never roll this migration back while tenant authorization
-- callbacks remain enabled.

BEGIN;

CREATE TABLE public.douyin_miniapp_authorization_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  requested_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  component_appid text NOT NULL
    REFERENCES public.douyin_third_party_components(component_appid)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  intent_digest text NOT NULL UNIQUE,
  authorization_code_digest text NULL UNIQUE,
  authorizer_appid text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN ('pending', 'completing', 'completed', 'expired', 'failed')
    ),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  failure_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_authorization_intents_intent_digest_check
    CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_authorization_intents_code_digest_check
    CHECK (
      authorization_code_digest IS NULL
      OR authorization_code_digest ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT douyin_authorization_intents_authorizer_check
    CHECK (authorizer_appid IS NULL OR btrim(authorizer_appid) <> ''),
  CONSTRAINT douyin_authorization_intents_failure_code_check
    CHECK (
      failure_code IS NULL
      OR failure_code ~ '^DOUYIN_[A-Z0-9_]{1,95}$'
    ),
  CONSTRAINT douyin_authorization_intents_terminal_state_check CHECK (
    (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND authorizer_appid IS NOT NULL
      AND failure_code IS NULL
    )
    OR (
      status = 'failed'
      AND completed_at IS NULL
      AND failure_code IS NOT NULL
    )
    OR (
      status IN ('pending', 'completing', 'expired')
      AND completed_at IS NULL
      AND failure_code IS NULL
    )
  )
);

CREATE UNIQUE INDEX douyin_authorization_intents_one_open_per_tenant_idx
  ON public.douyin_miniapp_authorization_intents(tenant_id)
  WHERE status IN ('pending', 'completing');

CREATE INDEX douyin_authorization_intents_expiry_idx
  ON public.douyin_miniapp_authorization_intents(expires_at, id)
  WHERE status IN ('pending', 'completing');

ALTER TABLE public.douyin_authorization_event_deliveries
  ADD COLUMN authorization_code_digest text NULL;

ALTER TABLE public.douyin_authorization_event_deliveries
  ADD CONSTRAINT douyin_authorization_events_code_digest_check
  CHECK (
    authorization_code_digest IS NULL
    OR authorization_code_digest ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX douyin_authorization_events_code_digest_idx
  ON public.douyin_authorization_event_deliveries(
    authorization_code_digest
  )
  WHERE authorization_code_digest IS NOT NULL;

CREATE TRIGGER tr_douyin_miniapp_authorization_intents_updated_at
  BEFORE UPDATE ON public.douyin_miniapp_authorization_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_miniapp_authorization_intents
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_miniapp_authorization_intents
  FROM PUBLIC, anon, authenticated, service_role;

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

  -- Creation lock order: component, tenant, employee.
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

CREATE OR REPLACE FUNCTION public.claim_tenant_douyin_authorization_intent(
  p_intent_digest text,
  p_authorization_code_digest text
)
RETURNS TABLE(
  claim_state text,
  intent_id uuid,
  tenant_id uuid,
  component_appid text,
  expires_at timestamptz,
  authorizer_appid text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_intent public.douyin_miniapp_authorization_intents%ROWTYPE;
BEGIN
  IF p_intent_digest IS NULL
    OR p_intent_digest !~ '^[0-9a-f]{64}$'
    OR p_authorization_code_digest IS NULL
    OR p_authorization_code_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_INVALID';
  END IF;

  SELECT intent.*
  INTO v_intent
  FROM public.douyin_miniapp_authorization_intents AS intent
  WHERE intent.intent_digest = p_intent_digest
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_NOT_FOUND';
  END IF;

  IF v_intent.status IN ('pending', 'completing')
    AND v_intent.expires_at <= v_now
  THEN
    UPDATE public.douyin_miniapp_authorization_intents
    SET status = 'expired'
    WHERE id = v_intent.id
    RETURNING * INTO v_intent;
  END IF;

  IF v_intent.status = 'expired' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_EXPIRED';
  END IF;

  IF v_intent.status = 'failed' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_FAILED';
  END IF;

  IF v_intent.authorization_code_digest IS NOT NULL
    AND v_intent.authorization_code_digest
      IS DISTINCT FROM p_authorization_code_digest
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
  END IF;

  IF v_intent.status = 'pending' THEN
    UPDATE public.douyin_miniapp_authorization_intents
    SET
      authorization_code_digest = p_authorization_code_digest,
      status = 'completing'
    WHERE id = v_intent.id
    RETURNING * INTO v_intent;
  END IF;

  RETURN QUERY
  SELECT
    v_intent.status,
    v_intent.id,
    v_intent.tenant_id,
    v_intent.component_appid,
    v_intent.expires_at,
    v_intent.authorizer_appid;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_douyin_authorization_event_code_digest(
  p_event_key text,
  p_authorization_code_digest text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_event_key IS NULL
    OR p_event_key !~ '^[0-9a-f]{64}$'
    OR p_authorization_code_digest IS NULL
    OR p_authorization_code_digest !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_INVALID';
  END IF;

  UPDATE public.douyin_authorization_event_deliveries AS delivery
  SET authorization_code_digest = p_authorization_code_digest
  WHERE delivery.event_key = p_event_key
    AND delivery.event_name IN ('AUTHORIZED', 'UPDATE_AUTHORIZED')
    AND (
      delivery.authorization_code_digest IS NULL
      OR delivery.authorization_code_digest = p_authorization_code_digest
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_MISMATCH';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_tenant_douyin_authorization_intent(
  p_intent_id uuid,
  p_authorization_code_digest text,
  p_authorizer_appid text,
  p_deployment_key text,
  p_runtime_config jsonb,
  p_access_token_ciphertext text DEFAULT NULL,
  p_access_token_iv text DEFAULT NULL,
  p_access_token_tag text DEFAULT NULL,
  p_access_token_key_version text DEFAULT NULL,
  p_access_token_expires_at timestamptz DEFAULT NULL,
  p_refresh_token_ciphertext text DEFAULT NULL,
  p_refresh_token_iv text DEFAULT NULL,
  p_refresh_token_tag text DEFAULT NULL,
  p_refresh_token_key_version text DEFAULT NULL,
  p_refresh_token_expires_at timestamptz DEFAULT NULL,
  p_permissions jsonb DEFAULT NULL
)
RETURNS public.douyin_miniapp_authorization_intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_intent public.douyin_miniapp_authorization_intents%ROWTYPE;
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_component_appid text;
  v_tenant_id uuid;
  v_has_credentials boolean;
  v_has_installation boolean;
BEGIN
  v_has_credentials :=
    p_access_token_ciphertext IS NOT NULL
    AND p_access_token_iv IS NOT NULL
    AND p_access_token_tag IS NOT NULL
    AND p_access_token_key_version IS NOT NULL
    AND p_access_token_expires_at IS NOT NULL
    AND p_refresh_token_ciphertext IS NOT NULL
    AND p_refresh_token_iv IS NOT NULL
    AND p_refresh_token_tag IS NOT NULL
    AND p_refresh_token_key_version IS NOT NULL
    AND p_refresh_token_expires_at IS NOT NULL
    AND p_permissions IS NOT NULL
    AND jsonb_typeof(p_permissions) = 'array';

  IF p_intent_id IS NULL
    OR p_authorization_code_digest IS NULL
    OR p_authorization_code_digest !~ '^[0-9a-f]{64}$'
    OR p_authorizer_appid IS NULL
    OR btrim(p_authorizer_appid) = ''
    OR p_deployment_key IS NULL
    OR btrim(p_deployment_key) = ''
    OR p_runtime_config IS NULL
    OR jsonb_typeof(p_runtime_config) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_INVALID';
  END IF;

  -- Fixed lock order: intent, installation, component, tenant.
  SELECT intent.*
  INTO v_intent
  FROM public.douyin_miniapp_authorization_intents AS intent
  WHERE intent.id = p_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_NOT_FOUND';
  END IF;

  IF v_intent.status = 'completed' THEN
    IF v_intent.authorization_code_digest = p_authorization_code_digest
      AND v_intent.authorizer_appid = p_authorizer_appid
    THEN
      RETURN v_intent;
    END IF;

    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
  END IF;

  IF v_intent.status <> 'completing'
    OR v_intent.expires_at <= v_now
    OR v_intent.authorization_code_digest
      IS DISTINCT FROM p_authorization_code_digest
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = CASE
        WHEN v_intent.expires_at <= v_now
          THEN 'DOUYIN_AUTHORIZATION_INTENT_EXPIRED'
        ELSE 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT'
      END;
  END IF;

  SELECT installation.*
  INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.authorizer_appid = p_authorizer_appid
  FOR UPDATE;
  v_has_installation := FOUND;

  SELECT component.component_appid
  INTO v_component_appid
  FROM public.douyin_third_party_components AS component
  WHERE component.component_appid = v_intent.component_appid
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
  WHERE tenant.id = v_intent.tenant_id
    AND tenant.status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_TENANT_NOT_ACTIVE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_miniapp_installations AS other_installation
    WHERE other_installation.tenant_id = v_intent.tenant_id
      AND other_installation.installation_kind = 'merchant'
      AND other_installation.authorization_status = 'active'
      AND (
        NOT v_has_installation
        OR other_installation.id <> v_installation.id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
  END IF;

  IF v_has_installation THEN
    IF v_installation.installation_kind <> 'merchant'
      OR v_installation.component_appid IS DISTINCT FROM v_intent.component_appid
      OR v_installation.authorization_status
        NOT IN ('authorized_unbound', 'active')
      OR (
        v_installation.authorization_status = 'active'
        AND v_installation.tenant_id IS DISTINCT FROM v_intent.tenant_id
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
    END IF;

    UPDATE public.douyin_miniapp_installations
    SET
      tenant_id = v_intent.tenant_id,
      deployment_key = CASE
        WHEN v_installation.authorization_status = 'active'
          THEN v_installation.deployment_key
        ELSE p_deployment_key
      END,
      runtime_config = CASE
        WHEN v_installation.authorization_status = 'active'
          THEN v_installation.runtime_config
        ELSE p_runtime_config
      END,
      authorization_status = 'active',
      access_token_ciphertext = CASE
        WHEN v_has_credentials THEN p_access_token_ciphertext
        ELSE v_installation.access_token_ciphertext
      END,
      access_token_iv = CASE
        WHEN v_has_credentials THEN p_access_token_iv
        ELSE v_installation.access_token_iv
      END,
      access_token_tag = CASE
        WHEN v_has_credentials THEN p_access_token_tag
        ELSE v_installation.access_token_tag
      END,
      access_token_key_version = CASE
        WHEN v_has_credentials THEN p_access_token_key_version
        ELSE v_installation.access_token_key_version
      END,
      access_token_expires_at = CASE
        WHEN v_has_credentials THEN p_access_token_expires_at
        ELSE v_installation.access_token_expires_at
      END,
      refresh_token_ciphertext = CASE
        WHEN v_has_credentials THEN p_refresh_token_ciphertext
        ELSE v_installation.refresh_token_ciphertext
      END,
      refresh_token_iv = CASE
        WHEN v_has_credentials THEN p_refresh_token_iv
        ELSE v_installation.refresh_token_iv
      END,
      refresh_token_tag = CASE
        WHEN v_has_credentials THEN p_refresh_token_tag
        ELSE v_installation.refresh_token_tag
      END,
      refresh_token_key_version = CASE
        WHEN v_has_credentials THEN p_refresh_token_key_version
        ELSE v_installation.refresh_token_key_version
      END,
      refresh_token_expires_at = CASE
        WHEN v_has_credentials THEN p_refresh_token_expires_at
        ELSE v_installation.refresh_token_expires_at
      END,
      permission_snapshot = CASE
        WHEN v_has_credentials THEN p_permissions
        ELSE v_installation.permission_snapshot
      END,
      token_refresh_claim_token = NULL,
      token_refresh_claim_expires_at = NULL,
      token_refresh_last_error = NULL,
      revoked_at = NULL
    WHERE id = v_installation.id
    RETURNING * INTO v_installation;
  ELSE
    IF NOT v_has_credentials
      OR p_access_token_expires_at <= v_now
      OR p_refresh_token_expires_at <= v_now
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
    END IF;

    INSERT INTO public.douyin_miniapp_installations (
      tenant_id,
      component_appid,
      authorizer_appid,
      deployment_key,
      installation_kind,
      authorization_status,
      access_token_ciphertext,
      access_token_iv,
      access_token_tag,
      access_token_key_version,
      access_token_expires_at,
      refresh_token_ciphertext,
      refresh_token_iv,
      refresh_token_tag,
      refresh_token_key_version,
      refresh_token_expires_at,
      permission_snapshot,
      runtime_config
    )
    VALUES (
      v_intent.tenant_id,
      v_intent.component_appid,
      p_authorizer_appid,
      p_deployment_key,
      'merchant',
      'active',
      p_access_token_ciphertext,
      p_access_token_iv,
      p_access_token_tag,
      p_access_token_key_version,
      p_access_token_expires_at,
      p_refresh_token_ciphertext,
      p_refresh_token_iv,
      p_refresh_token_tag,
      p_refresh_token_key_version,
      p_refresh_token_expires_at,
      p_permissions,
      p_runtime_config
    )
    RETURNING * INTO v_installation;
  END IF;

  IF v_installation.access_token_ciphertext IS NULL
    OR v_installation.refresh_token_ciphertext IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
  END IF;

  UPDATE public.douyin_miniapp_authorization_intents
  SET
    authorizer_appid = p_authorizer_appid,
    status = 'completed',
    completed_at = v_now,
    failure_code = NULL
  WHERE id = v_intent.id
  RETURNING * INTO v_intent;

  RETURN v_intent;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_CONFLICT';
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_tenant_douyin_authorization_intent(
  p_intent_id uuid,
  p_failure_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_intent_id IS NULL
    OR p_failure_code IS NULL
    OR p_failure_code !~ '^DOUYIN_[A-Z0-9_]{1,95}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_INTENT_INVALID';
  END IF;

  UPDATE public.douyin_miniapp_authorization_intents
  SET
    status = 'failed',
    completed_at = NULL,
    failure_code = p_failure_code
  WHERE id = p_intent_id
    AND status IN ('pending', 'completing');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_douyin_authorization_intent(
  uuid, uuid, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_douyin_authorization_intent(
  uuid, uuid, text, text, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.claim_tenant_douyin_authorization_intent(
  text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_tenant_douyin_authorization_intent(
  text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.attach_douyin_authorization_event_code_digest(
  text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_douyin_authorization_event_code_digest(
  text, text
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_tenant_douyin_authorization_intent(
  uuid, text, text, text, jsonb,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_tenant_douyin_authorization_intent(
  uuid, text, text, text, jsonb,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.fail_tenant_douyin_authorization_intent(
  uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_tenant_douyin_authorization_intent(
  uuid, text
) TO service_role;

COMMENT ON TABLE public.douyin_miniapp_authorization_intents
IS 'Short-lived tenant authorization intents containing digests only.';

COMMENT ON FUNCTION public.complete_tenant_douyin_authorization_intent(
  uuid, text, text, text, jsonb,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) IS 'Atomically binds one authorized Douyin merchant installation to the initiating tenant.';

COMMIT;
