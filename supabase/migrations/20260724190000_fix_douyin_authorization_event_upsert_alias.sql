-- Fix the authorization finalizer's ON CONFLICT references by declaring the
-- target-table alias they use. The original function was accepted by PL/pgSQL
-- but failed when PostgreSQL first planned the INSERT statement.
--
-- Rollback: stop the authorization callback first, then replace this function
-- with the previously deployed definition. No table or data rollback is needed.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_douyin_authorization_event(
  p_event_key text, p_claim_token uuid, p_component_appid text,
  p_authorizer_appid text, p_event_name text, p_occurred_at timestamptz,
  p_access_token_ciphertext text, p_access_token_iv text, p_access_token_tag text,
  p_access_token_key_version text, p_access_token_expires_at timestamptz,
  p_refresh_token_ciphertext text, p_refresh_token_iv text, p_refresh_token_tag text,
  p_refresh_token_key_version text, p_refresh_token_expires_at timestamptz,
  p_permissions jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_delivery public.douyin_authorization_event_deliveries%ROWTYPE;
  v_subject public.douyin_authorization_event_subject_leases%ROWTYPE;
  v_existing public.douyin_miniapp_installations%ROWTYPE;
  v_has_existing boolean;
  v_default_runtime jsonb := '{
    "brand":{"logo_url":null,"qualifications":[]},
    "theme":{"primary_color":"#C45A32","navigation_text_color":"black"},
    "features":{"cases":true,"sites":true,"sms_lead":true,"douyin_phone":false,"phone_capture_mode":"sms"},
    "home_banners":[],"trust_metrics":[],"privacy_policy_version":"2026-07-19"
  }'::jsonb;
BEGIN
  IF p_event_key IS NULL OR p_claim_token IS NULL
    OR p_component_appid IS NULL OR btrim(p_component_appid) = ''
    OR p_authorizer_appid IS NULL OR btrim(p_authorizer_appid) = ''
    OR p_event_name NOT IN ('AUTHORIZED', 'UPDATE_AUTHORIZED')
    OR p_occurred_at IS NULL
    OR p_access_token_ciphertext IS NULL OR btrim(p_access_token_ciphertext) = ''
    OR p_access_token_iv IS NULL OR btrim(p_access_token_iv) = ''
    OR p_access_token_tag IS NULL OR btrim(p_access_token_tag) = ''
    OR p_access_token_key_version IS NULL OR btrim(p_access_token_key_version) = ''
    OR p_access_token_expires_at IS NULL
    OR p_refresh_token_ciphertext IS NULL OR btrim(p_refresh_token_ciphertext) = ''
    OR p_refresh_token_iv IS NULL OR btrim(p_refresh_token_iv) = ''
    OR p_refresh_token_tag IS NULL OR btrim(p_refresh_token_tag) = ''
    OR p_refresh_token_key_version IS NULL OR btrim(p_refresh_token_key_version) = ''
    OR p_refresh_token_expires_at IS NULL
    OR p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'array'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_INVALID';
  END IF;

  SELECT subject.* INTO v_subject
  FROM public.douyin_authorization_event_subject_leases AS subject
  WHERE subject.authorizer_appid = p_authorizer_appid
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT delivery.* INTO v_delivery
  FROM public.douyin_authorization_event_deliveries AS delivery
  WHERE delivery.event_key = p_event_key
    AND delivery.processing_state = 'processing'
    AND delivery.claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT installation.* INTO v_existing
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.authorizer_appid = p_authorizer_appid
  FOR UPDATE;
  v_has_existing := FOUND;
  v_now := clock_timestamp();

  IF v_subject.component_appid IS DISTINCT FROM p_component_appid THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;
  IF v_subject.active_event_key IS DISTINCT FROM p_event_key
    OR v_subject.claim_token IS DISTINCT FROM p_claim_token
    OR v_delivery.claim_token IS DISTINCT FROM p_claim_token
  THEN
    RETURN false;
  END IF;
  IF v_subject.claim_expires_at IS DISTINCT FROM v_delivery.claim_expires_at THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_SUBJECT_LEASE_INCONSISTENT';
  END IF;
  IF v_subject.claim_expires_at <= v_now OR v_delivery.claim_expires_at <= v_now THEN
    RETURN false;
  END IF;
  IF p_access_token_expires_at <= v_now OR p_refresh_token_expires_at <= v_now THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_INVALID';
  END IF;
  IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
    OR v_delivery.event_name IS DISTINCT FROM p_event_name
    OR v_delivery.authorizer_appid IS DISTINCT FROM p_authorizer_appid
    OR v_delivery.occurred_at IS DISTINCT FROM p_occurred_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_MISMATCH';
  END IF;
  IF v_has_existing AND v_existing.installation_kind <> 'merchant' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_KIND_CONFLICT';
  END IF;
  IF v_has_existing
    AND v_existing.component_appid IS DISTINCT FROM p_component_appid
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;

  INSERT INTO public.douyin_miniapp_installations AS installation(
    component_appid, authorizer_appid, installation_kind, authorization_status,
    access_token_ciphertext, access_token_iv, access_token_tag,
    access_token_key_version, access_token_expires_at,
    refresh_token_ciphertext, refresh_token_iv, refresh_token_tag,
    refresh_token_key_version, refresh_token_expires_at,
    permission_snapshot, runtime_config, authorization_event_occurred_at
  ) VALUES (
    p_component_appid, p_authorizer_appid, 'merchant', 'authorized_unbound',
    p_access_token_ciphertext, p_access_token_iv, p_access_token_tag,
    p_access_token_key_version, p_access_token_expires_at,
    p_refresh_token_ciphertext, p_refresh_token_iv, p_refresh_token_tag,
    p_refresh_token_key_version, p_refresh_token_expires_at,
    p_permissions, v_default_runtime, p_occurred_at
  )
  ON CONFLICT (authorizer_appid) DO UPDATE SET
    component_appid = EXCLUDED.component_appid,
    installation_kind = 'merchant',
    tenant_id = CASE
      WHEN p_event_name = 'AUTHORIZED' THEN NULL
      WHEN p_event_name = 'UPDATE_AUTHORIZED' THEN installation.tenant_id
    END,
    deployment_key = CASE
      WHEN p_event_name = 'AUTHORIZED' THEN NULL
      WHEN p_event_name = 'UPDATE_AUTHORIZED' THEN installation.deployment_key
    END,
    runtime_config = CASE
      WHEN p_event_name = 'AUTHORIZED' THEN v_default_runtime
      WHEN p_event_name = 'UPDATE_AUTHORIZED' THEN installation.runtime_config
    END,
    authorization_status = CASE
      WHEN p_event_name = 'UPDATE_AUTHORIZED'
        AND installation.tenant_id IS NOT NULL
        AND installation.deployment_key IS NOT NULL THEN 'active'
      ELSE 'authorized_unbound'
    END,
    access_token_ciphertext = EXCLUDED.access_token_ciphertext,
    access_token_iv = EXCLUDED.access_token_iv,
    access_token_tag = EXCLUDED.access_token_tag,
    access_token_key_version = EXCLUDED.access_token_key_version,
    access_token_expires_at = EXCLUDED.access_token_expires_at,
    refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
    refresh_token_iv = EXCLUDED.refresh_token_iv,
    refresh_token_tag = EXCLUDED.refresh_token_tag,
    refresh_token_key_version = EXCLUDED.refresh_token_key_version,
    refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
    permission_snapshot = EXCLUDED.permission_snapshot,
    token_refresh_claim_token = NULL,
    token_refresh_claim_expires_at = NULL,
    token_refresh_last_error = NULL,
    revoked_at = NULL,
    authorization_event_occurred_at = EXCLUDED.authorization_event_occurred_at
  WHERE installation.authorization_event_occurred_at IS NULL
    OR installation.authorization_event_occurred_at < p_occurred_at
    OR (
      installation.authorization_event_occurred_at = p_occurred_at
      AND installation.authorization_status <> 'revoked'
    );

  UPDATE public.douyin_authorization_event_deliveries AS delivery
  SET processing_state = 'completed',
      claim_token = NULL,
      claim_expires_at = NULL,
      completed_at = v_now
  WHERE delivery.event_key = p_event_key;

  UPDATE public.douyin_authorization_event_subject_leases AS subject
  SET active_event_key = NULL,
      active_event_name = NULL,
      active_occurred_at = NULL,
      claim_token = NULL,
      claim_expires_at = NULL
  WHERE subject.component_appid = p_component_appid
    AND subject.authorizer_appid = p_authorizer_appid;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_douyin_authorization_event(
  text, uuid, text, text, text, timestamptz,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_douyin_authorization_event(
  text, uuid, text, text, text, timestamptz,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) TO service_role;

COMMIT;
