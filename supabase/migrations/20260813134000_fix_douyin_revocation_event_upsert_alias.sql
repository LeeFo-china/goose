-- Fix the revocation finalizer's ON CONFLICT references by declaring the
-- target-table alias they use. The original function was accepted by PL/pgSQL
-- but failed when PostgreSQL first planned the INSERT statement.
--
-- Rollback: stop the authorization callback first, then replace this function
-- with the previously deployed definition. No table or data rollback is needed.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_douyin_revocation_event(
  p_event_key text, p_claim_token uuid, p_component_appid text,
  p_authorizer_appid text, p_occurred_at timestamptz
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
    OR p_occurred_at IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'DOUYIN_REVOCATION_EVENT_INVALID';
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
  IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
    OR v_delivery.event_name <> 'UNAUTHORIZED'
    OR v_delivery.authorizer_appid IS DISTINCT FROM p_authorizer_appid
    OR v_delivery.occurred_at IS DISTINCT FROM p_occurred_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_REVOCATION_EVENT_MISMATCH';
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
    runtime_config, revoked_at, authorization_event_occurred_at
  ) VALUES (
    p_component_appid, p_authorizer_appid, 'merchant', 'revoked',
    v_default_runtime, v_now, p_occurred_at
  )
  ON CONFLICT (authorizer_appid) DO UPDATE SET
    installation_kind = 'merchant',
    authorization_status = 'revoked',
    access_token_ciphertext = NULL,
    access_token_iv = NULL,
    access_token_tag = NULL,
    access_token_key_version = NULL,
    access_token_expires_at = NULL,
    refresh_token_ciphertext = NULL,
    refresh_token_iv = NULL,
    refresh_token_tag = NULL,
    refresh_token_key_version = NULL,
    refresh_token_expires_at = NULL,
    token_refresh_claim_token = NULL,
    token_refresh_claim_expires_at = NULL,
    token_refresh_last_error = NULL,
    revoked_at = v_now,
    authorization_event_occurred_at = EXCLUDED.authorization_event_occurred_at
  WHERE installation.authorization_event_occurred_at IS NULL
    OR installation.authorization_event_occurred_at <= p_occurred_at;

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

REVOKE ALL ON FUNCTION public.complete_douyin_revocation_event(
  text, uuid, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.complete_douyin_revocation_event(
  text, uuid, text, text, timestamptz
) TO service_role;

DO $$
DECLARE
  v_event record;
  v_claim record;
  v_completed boolean;
BEGIN
  FOR v_event IN SELECT delivery.event_key,
      delivery.component_appid,
      delivery.authorizer_appid,
      delivery.event_name,
      delivery.occurred_at
    FROM public.douyin_authorization_event_deliveries AS delivery
    WHERE delivery.event_name = 'UNAUTHORIZED'
      AND delivery.processing_state = 'processing'
      AND delivery.claim_expires_at <= clock_timestamp()
    ORDER BY delivery.created_at, delivery.event_key
    LIMIT 100
  LOOP
    SELECT claim.claim_state, claim.claim_token, claim.claim_expires_at
    INTO v_claim
    FROM public.claim_douyin_authorization_event(
      v_event.event_key,
      v_event.component_appid,
      v_event.event_name,
      v_event.authorizer_appid,
      v_event.occurred_at
    ) AS claim;

    IF v_claim.claim_state NOT IN ('claimed', 'reclaimed')
      OR v_claim.claim_token IS NULL
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_REVOCATION_RECOVERY_FAILED';
    END IF;

    v_completed := public.complete_douyin_revocation_event(
      v_event.event_key,
      v_claim.claim_token,
      v_event.component_appid,
      v_event.authorizer_appid,
      v_event.occurred_at
    );

    IF NOT v_completed THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_REVOCATION_RECOVERY_FAILED';
    END IF;
  END LOOP;
END;
$$;

COMMIT;
