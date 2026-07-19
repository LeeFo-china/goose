BEGIN;

ALTER TABLE public.douyin_miniapp_installations
  ADD COLUMN authorization_event_occurred_at timestamptz NULL;

CREATE TABLE public.douyin_authorization_event_deliveries (
  event_key text PRIMARY KEY,
  component_appid text NOT NULL REFERENCES public.douyin_third_party_components(component_appid)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  event_name text NOT NULL,
  authorizer_appid text NULL,
  occurred_at timestamptz NOT NULL,
  processing_state text NOT NULL DEFAULT 'processing',
  claim_token uuid NULL,
  claim_expires_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_authorization_events_key_check
    CHECK (event_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT douyin_authorization_events_name_check
    CHECK (event_name ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  CONSTRAINT douyin_authorization_events_authorizer_check
    CHECK (authorizer_appid IS NULL OR btrim(authorizer_appid) <> ''),
  CONSTRAINT douyin_authorization_events_state_check
    CHECK (processing_state IN ('processing', 'completed')),
  CONSTRAINT douyin_authorization_events_claim_state_check CHECK (
    (
      processing_state = 'processing'
      AND claim_token IS NOT NULL
      AND claim_expires_at IS NOT NULL
      AND completed_at IS NULL
    ) OR (
      processing_state = 'completed'
      AND claim_token IS NULL
      AND claim_expires_at IS NULL
      AND completed_at IS NOT NULL
    )
  )
);

CREATE TABLE public.douyin_authorization_event_subject_leases (
  component_appid text NOT NULL REFERENCES public.douyin_third_party_components(component_appid)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  authorizer_appid text NOT NULL,
  active_event_key text NULL,
  active_event_name text NULL,
  active_occurred_at timestamptz NULL,
  claim_token uuid NULL,
  claim_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (authorizer_appid),
  CONSTRAINT douyin_authorization_subject_authorizer_check
    CHECK (btrim(authorizer_appid) <> ''),
  CONSTRAINT douyin_authorization_subject_lease_check CHECK (
    (
      active_event_key IS NULL
      AND active_event_name IS NULL
      AND active_occurred_at IS NULL
      AND claim_token IS NULL
      AND claim_expires_at IS NULL
    ) OR (
      active_event_key ~ '^[0-9a-f]{64}$'
      AND active_event_name IN ('AUTHORIZED', 'UPDATE_AUTHORIZED', 'UNAUTHORIZED')
      AND active_occurred_at IS NOT NULL
      AND claim_token IS NOT NULL
      AND claim_expires_at IS NOT NULL
    )
  )
);

CREATE INDEX douyin_authorization_events_completed_cleanup_idx
  ON public.douyin_authorization_event_deliveries(completed_at, event_key)
  WHERE processing_state = 'completed';

CREATE TRIGGER tr_douyin_authorization_event_deliveries_updated_at
  BEFORE UPDATE ON public.douyin_authorization_event_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_douyin_authorization_event_subject_leases_updated_at
  BEFORE UPDATE ON public.douyin_authorization_event_subject_leases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_authorization_event_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_authorization_event_subject_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.douyin_authorization_event_deliveries
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_authorization_event_subject_leases
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_douyin_authorization_event(
  p_event_key text,
  p_component_appid text,
  p_event_name text,
  p_authorizer_appid text,
  p_occurred_at timestamptz
)
RETURNS TABLE(claim_state text, claim_token uuid, claim_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_claim_token uuid := gen_random_uuid();
  v_claim_expires_at timestamptz;
  v_delivery public.douyin_authorization_event_deliveries%ROWTYPE;
  v_active_delivery public.douyin_authorization_event_deliveries%ROWTYPE;
  v_subject public.douyin_authorization_event_subject_leases%ROWTYPE;
  v_installation public.douyin_miniapp_installations%ROWTYPE;
  v_component_status text;
  v_incoming_priority integer;
  v_active_priority integer;
  v_installation_priority integer;
  v_has_installation boolean;
BEGIN
  IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
    OR p_component_appid IS NULL OR btrim(p_component_appid) = ''
    OR p_event_name IS NULL OR p_event_name !~ '^[A-Z][A-Z0-9_]{0,63}$'
    OR (p_authorizer_appid IS NOT NULL AND btrim(p_authorizer_appid) = '')
    OR p_occurred_at IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_EVENT_CLAIM_INVALID';
  END IF;

  INSERT INTO public.douyin_third_party_components(component_appid)
  VALUES (p_component_appid)
  ON CONFLICT (component_appid) DO NOTHING;

  SELECT component.status INTO v_component_status
  FROM public.douyin_third_party_components AS component
  WHERE component.component_appid = p_component_appid;
  IF v_component_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_COMPONENT_NOT_ACTIVE';
  END IF;

  IF p_event_name NOT IN ('AUTHORIZED', 'UPDATE_AUTHORIZED', 'UNAUTHORIZED') THEN
    v_now := clock_timestamp();
    v_claim_expires_at := v_now + interval '60 seconds';
    INSERT INTO public.douyin_authorization_event_deliveries(
      event_key, component_appid, event_name, authorizer_appid, occurred_at,
      processing_state, claim_token, claim_expires_at
    ) VALUES (
      p_event_key, p_component_appid, p_event_name, p_authorizer_appid, p_occurred_at,
      'processing', v_claim_token, v_claim_expires_at
    )
    ON CONFLICT (event_key) DO NOTHING
    RETURNING * INTO v_delivery;
    IF FOUND THEN
      RETURN QUERY SELECT 'claimed'::text, v_claim_token, v_claim_expires_at;
      RETURN;
    END IF;

    SELECT delivery.* INTO v_delivery
    FROM public.douyin_authorization_event_deliveries AS delivery
    WHERE delivery.event_key = p_event_key
    FOR UPDATE;
    v_now := clock_timestamp();
    IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
      OR v_delivery.event_name IS DISTINCT FROM p_event_name
      OR v_delivery.authorizer_appid IS DISTINCT FROM p_authorizer_appid
      OR v_delivery.occurred_at IS DISTINCT FROM p_occurred_at
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_EVENT_KEY_COLLISION';
    END IF;
    IF v_delivery.processing_state = 'completed' THEN
      RETURN QUERY SELECT 'completed'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    IF v_delivery.claim_expires_at > v_now THEN
      RETURN QUERY SELECT 'busy'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    v_claim_expires_at := v_now + interval '60 seconds';
    UPDATE public.douyin_authorization_event_deliveries AS delivery
    SET claim_token = v_claim_token, claim_expires_at = v_claim_expires_at
    WHERE delivery.event_key = p_event_key;
    RETURN QUERY SELECT 'reclaimed'::text, v_claim_token, v_claim_expires_at;
    RETURN;
  END IF;

  IF p_authorizer_appid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_LIFECYCLE_AUTHORIZER_REQUIRED';
  END IF;

  INSERT INTO public.douyin_authorization_event_subject_leases(
    component_appid, authorizer_appid
  ) VALUES (p_component_appid, p_authorizer_appid)
  ON CONFLICT (authorizer_appid) DO NOTHING;

  SELECT subject.* INTO v_subject
  FROM public.douyin_authorization_event_subject_leases AS subject
  WHERE subject.authorizer_appid = p_authorizer_appid
  FOR UPDATE;

  SELECT delivery.* INTO v_delivery
  FROM public.douyin_authorization_event_deliveries AS delivery
  WHERE delivery.event_key = p_event_key
  FOR UPDATE;
  IF FOUND THEN
    v_now := clock_timestamp();
    IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
      OR v_delivery.event_name IS DISTINCT FROM p_event_name
      OR v_delivery.authorizer_appid IS DISTINCT FROM p_authorizer_appid
      OR v_delivery.occurred_at IS DISTINCT FROM p_occurred_at
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_EVENT_KEY_COLLISION';
    END IF;
    IF v_delivery.processing_state = 'completed' THEN
      RETURN QUERY SELECT 'completed'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    IF v_subject.active_event_key IS DISTINCT FROM p_event_key
      OR v_subject.claim_token IS DISTINCT FROM v_delivery.claim_token
      OR v_subject.claim_expires_at IS DISTINCT FROM v_delivery.claim_expires_at
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_SUBJECT_LEASE_INCONSISTENT';
    END IF;
    IF v_subject.claim_expires_at > v_now THEN
      RETURN QUERY SELECT 'busy'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
    v_claim_expires_at := v_now + interval '60 seconds';
    UPDATE public.douyin_authorization_event_deliveries AS delivery
    SET claim_token = v_claim_token, claim_expires_at = v_claim_expires_at
    WHERE delivery.event_key = p_event_key;
    UPDATE public.douyin_authorization_event_subject_leases AS subject
    SET claim_token = v_claim_token, claim_expires_at = v_claim_expires_at
    WHERE subject.authorizer_appid = p_authorizer_appid;
    RETURN QUERY SELECT 'reclaimed'::text, v_claim_token, v_claim_expires_at;
    RETURN;
  END IF;

  IF v_subject.active_event_key IS NOT NULL THEN
    SELECT delivery.* INTO v_active_delivery
    FROM public.douyin_authorization_event_deliveries AS delivery
    WHERE delivery.event_key = v_subject.active_event_key
    FOR UPDATE;
    IF NOT FOUND OR v_active_delivery.processing_state <> 'processing'
      OR v_active_delivery.claim_token IS DISTINCT FROM v_subject.claim_token
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_SUBJECT_LEASE_INCONSISTENT';
    END IF;
  END IF;

  SELECT installation.* INTO v_installation
  FROM public.douyin_miniapp_installations AS installation
  WHERE installation.authorizer_appid = p_authorizer_appid
  FOR UPDATE;
  v_has_installation := FOUND;
  v_now := clock_timestamp();

  IF v_subject.active_event_key IS NOT NULL
    AND v_subject.claim_expires_at > v_now
  THEN
    RETURN QUERY SELECT 'busy'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_subject.component_appid IS DISTINCT FROM p_component_appid THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;
  IF v_has_installation AND v_installation.installation_kind <> 'merchant' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_KIND_CONFLICT';
  END IF;
  IF v_has_installation AND v_installation.component_appid IS DISTINCT FROM p_component_appid THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;

  v_incoming_priority := CASE WHEN p_event_name = 'UNAUTHORIZED' THEN 2 ELSE 1 END;
  IF v_installation.authorization_event_occurred_at IS NOT NULL THEN
    v_installation_priority := CASE
      WHEN v_installation.authorization_status = 'revoked' THEN 2 ELSE 1
    END;
    IF p_occurred_at < v_installation.authorization_event_occurred_at
      OR (p_occurred_at = v_installation.authorization_event_occurred_at
        AND v_incoming_priority <= v_installation_priority)
    THEN
      INSERT INTO public.douyin_authorization_event_deliveries(
        event_key, component_appid, event_name, authorizer_appid, occurred_at,
        processing_state, completed_at
      ) VALUES (
        p_event_key, p_component_appid, p_event_name, p_authorizer_appid,
        p_occurred_at, 'completed', v_now
      );
      RETURN QUERY SELECT 'completed'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  IF v_subject.active_event_key IS NOT NULL THEN
    v_active_priority := CASE WHEN v_subject.active_event_name = 'UNAUTHORIZED' THEN 2 ELSE 1 END;
    IF p_occurred_at < v_subject.active_occurred_at
      OR (p_occurred_at = v_subject.active_occurred_at
        AND v_incoming_priority <= v_active_priority)
    THEN
      INSERT INTO public.douyin_authorization_event_deliveries(
        event_key, component_appid, event_name, authorizer_appid, occurred_at,
        processing_state, completed_at
      ) VALUES (
        p_event_key, p_component_appid, p_event_name, p_authorizer_appid,
        p_occurred_at, 'completed', v_now
      );
      RETURN QUERY SELECT 'completed'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;

    UPDATE public.douyin_authorization_event_deliveries AS delivery
    SET processing_state = 'completed', claim_token = NULL,
        claim_expires_at = NULL, completed_at = v_now
    WHERE delivery.event_key = v_subject.active_event_key;
  END IF;

  v_claim_expires_at := v_now + interval '60 seconds';
  INSERT INTO public.douyin_authorization_event_deliveries(
    event_key, component_appid, event_name, authorizer_appid, occurred_at,
    processing_state, claim_token, claim_expires_at
  ) VALUES (
    p_event_key, p_component_appid, p_event_name, p_authorizer_appid, p_occurred_at,
    'processing', v_claim_token, v_claim_expires_at
  );
  UPDATE public.douyin_authorization_event_subject_leases AS subject
  SET active_event_key = p_event_key,
      active_event_name = p_event_name,
      active_occurred_at = p_occurred_at,
      claim_token = v_claim_token,
      claim_expires_at = v_claim_expires_at
  WHERE subject.component_appid = p_component_appid
    AND subject.authorizer_appid = p_authorizer_appid;
  RETURN QUERY SELECT 'claimed'::text, v_claim_token, v_claim_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_douyin_authorization_event_state(p_event_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT delivery.processing_state
  FROM public.douyin_authorization_event_deliveries AS delivery
  WHERE delivery.event_key = p_event_key
$$;

CREATE OR REPLACE FUNCTION public.complete_douyin_ticket_event(
  p_event_key text, p_claim_token uuid, p_component_appid text,
  p_ticket_ciphertext text, p_ticket_iv text, p_ticket_tag text,
  p_ticket_key_version text, p_received_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_delivery public.douyin_authorization_event_deliveries%ROWTYPE;
BEGIN
  IF p_event_key IS NULL OR p_claim_token IS NULL OR p_component_appid IS NULL
    OR p_ticket_ciphertext IS NULL OR btrim(p_ticket_ciphertext) = ''
    OR p_ticket_iv IS NULL OR btrim(p_ticket_iv) = ''
    OR p_ticket_tag IS NULL OR btrim(p_ticket_tag) = ''
    OR p_ticket_key_version IS NULL OR btrim(p_ticket_key_version) = ''
    OR p_received_at IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_TICKET_EVENT_INVALID';
  END IF;

  SELECT delivery.* INTO v_delivery
  FROM public.douyin_authorization_event_deliveries AS delivery
  WHERE delivery.event_key = p_event_key
    AND delivery.processing_state = 'processing'
    AND delivery.claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := clock_timestamp();
  IF v_delivery.claim_expires_at <= v_now THEN RETURN false; END IF;
  IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
    OR v_delivery.event_name <> 'PUSH' OR v_delivery.authorizer_appid IS NOT NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_TICKET_EVENT_MISMATCH';
  END IF;

  UPDATE public.douyin_third_party_components AS component
  SET component_ticket_ciphertext = p_ticket_ciphertext,
      component_ticket_iv = p_ticket_iv,
      component_ticket_tag = p_ticket_tag,
      component_ticket_key_version = p_ticket_key_version,
      component_ticket_received_at = p_received_at,
      token_refresh_last_error = NULL
  WHERE component.component_appid = p_component_appid
    AND (component.component_ticket_received_at IS NULL
      OR component.component_ticket_received_at <= p_received_at);

  UPDATE public.douyin_authorization_event_deliveries AS delivery
  SET processing_state = 'completed', claim_token = NULL,
      claim_expires_at = NULL, completed_at = v_now
  WHERE delivery.event_key = p_event_key;
  RETURN true;
END;
$$;

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
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_INVALID';
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
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;
  IF v_subject.active_event_key IS DISTINCT FROM p_event_key
    OR v_subject.claim_token IS DISTINCT FROM p_claim_token
    OR v_delivery.claim_token IS DISTINCT FROM p_claim_token
  THEN
    RETURN false;
  END IF;
  IF v_subject.claim_expires_at IS DISTINCT FROM v_delivery.claim_expires_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_SUBJECT_LEASE_INCONSISTENT';
  END IF;
  IF v_subject.claim_expires_at <= v_now OR v_delivery.claim_expires_at <= v_now THEN
    RETURN false;
  END IF;
  IF p_access_token_expires_at <= v_now OR p_refresh_token_expires_at <= v_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_INVALID';
  END IF;
  IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
    OR v_delivery.event_name IS DISTINCT FROM p_event_name
    OR v_delivery.authorizer_appid IS DISTINCT FROM p_authorizer_appid
    OR v_delivery.occurred_at IS DISTINCT FROM p_occurred_at
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_EVENT_MISMATCH';
  END IF;
  IF v_has_existing AND v_existing.installation_kind <> 'merchant' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_KIND_CONFLICT';
  END IF;
  IF v_has_existing AND v_existing.component_appid IS DISTINCT FROM p_component_appid THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;

  INSERT INTO public.douyin_miniapp_installations(
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
    OR (installation.authorization_event_occurred_at = p_occurred_at
      AND installation.authorization_status <> 'revoked');

  UPDATE public.douyin_authorization_event_deliveries AS delivery
  SET processing_state = 'completed', claim_token = NULL,
      claim_expires_at = NULL, completed_at = v_now
  WHERE delivery.event_key = p_event_key;
  UPDATE public.douyin_authorization_event_subject_leases AS subject
  SET active_event_key = NULL, active_event_name = NULL,
      active_occurred_at = NULL, claim_token = NULL, claim_expires_at = NULL
  WHERE subject.component_appid = p_component_appid
    AND subject.authorizer_appid = p_authorizer_appid;
  RETURN true;
END;
$$;

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
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_REVOCATION_EVENT_INVALID';
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
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;
  IF v_subject.active_event_key IS DISTINCT FROM p_event_key
    OR v_subject.claim_token IS DISTINCT FROM p_claim_token
    OR v_delivery.claim_token IS DISTINCT FROM p_claim_token
  THEN
    RETURN false;
  END IF;
  IF v_subject.claim_expires_at IS DISTINCT FROM v_delivery.claim_expires_at THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_SUBJECT_LEASE_INCONSISTENT';
  END IF;
  IF v_subject.claim_expires_at <= v_now OR v_delivery.claim_expires_at <= v_now THEN
    RETURN false;
  END IF;
  IF v_delivery.component_appid IS DISTINCT FROM p_component_appid
    OR v_delivery.event_name <> 'UNAUTHORIZED'
    OR v_delivery.authorizer_appid IS DISTINCT FROM p_authorizer_appid
    OR v_delivery.occurred_at IS DISTINCT FROM p_occurred_at
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_REVOCATION_EVENT_MISMATCH';
  END IF;
  IF v_has_existing AND v_existing.installation_kind <> 'merchant' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_KIND_CONFLICT';
  END IF;
  IF v_has_existing AND v_existing.component_appid IS DISTINCT FROM p_component_appid THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_AUTHORIZATION_COMPONENT_MISMATCH';
  END IF;

  INSERT INTO public.douyin_miniapp_installations(
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
  SET processing_state = 'completed', claim_token = NULL,
      claim_expires_at = NULL, completed_at = v_now
  WHERE delivery.event_key = p_event_key;
  UPDATE public.douyin_authorization_event_subject_leases AS subject
  SET active_event_key = NULL, active_event_name = NULL,
      active_occurred_at = NULL, claim_token = NULL, claim_expires_at = NULL
  WHERE subject.component_appid = p_component_appid
    AND subject.authorizer_appid = p_authorizer_appid;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_douyin_unsupported_event(
  p_event_key text, p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
  v_delivery public.douyin_authorization_event_deliveries%ROWTYPE;
BEGIN
  SELECT delivery.* INTO v_delivery
  FROM public.douyin_authorization_event_deliveries AS delivery
  WHERE delivery.event_key = p_event_key
    AND delivery.processing_state = 'processing'
    AND delivery.claim_token = p_claim_token
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_now := clock_timestamp();
  IF v_delivery.claim_expires_at <= v_now THEN RETURN false; END IF;
  IF v_delivery.event_name IN ('PUSH', 'AUTHORIZED', 'UPDATE_AUTHORIZED', 'UNAUTHORIZED') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DOUYIN_UNSUPPORTED_EVENT_KIND_INVALID';
  END IF;

  UPDATE public.douyin_authorization_event_deliveries AS delivery
  SET processing_state = 'completed', claim_token = NULL,
      claim_expires_at = NULL, completed_at = v_now
  WHERE delivery.event_key = p_event_key;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_douyin_authorization_event_deliveries(
  p_before timestamptz,
  p_limit integer DEFAULT 1000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_before IS NULL OR p_before >= clock_timestamp()
    OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DOUYIN_EVENT_PRUNE_INVALID';
  END IF;

  WITH candidates AS (
    SELECT delivery.event_key
    FROM public.douyin_authorization_event_deliveries AS delivery
    WHERE delivery.processing_state = 'completed'
      AND delivery.completed_at < p_before
    ORDER BY delivery.completed_at, delivery.event_key
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.douyin_authorization_event_deliveries AS delivery
  USING candidates
  WHERE delivery.event_key = candidates.event_key;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_douyin_authorization_event(
  text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_douyin_authorization_event_state(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_douyin_ticket_event(
  text, uuid, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_douyin_authorization_event(
  text, uuid, text, text, text, timestamptz,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_douyin_revocation_event(
  text, uuid, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_douyin_unsupported_event(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prune_douyin_authorization_event_deliveries(timestamptz, integer)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_douyin_authorization_event(
  text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_douyin_authorization_event_state(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_ticket_event(
  text, uuid, text, text, text, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_authorization_event(
  text, uuid, text, text, text, timestamptz,
  text, text, text, text, timestamptz,
  text, text, text, text, timestamptz, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_revocation_event(
  text, uuid, text, text, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_douyin_unsupported_event(text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_douyin_authorization_event_deliveries(timestamptz, integer)
  TO service_role;

COMMENT ON TABLE public.douyin_authorization_event_deliveries IS
  'Fixed-length HMAC event keys and sixty-second processing leases for idempotent Douyin callbacks. Prune completed rows in batches after the operational retention window.';
COMMENT ON TABLE public.douyin_authorization_event_subject_leases IS
  'One global persistent lifecycle-event lease per Douyin authorizer; component_appid records ownership metadata while active fields are cleared after finalization.';
COMMENT ON COLUMN public.douyin_miniapp_installations.authorization_event_occurred_at IS
  'Latest applied Douyin authorization lifecycle timestamp; prevents stale callbacks from reversing newer state.';

COMMIT;

-- Rollback: stop both callback endpoints first, then drop the seven RPCs, the
-- delivery and subject-lease tables, and authorization_event_occurred_at. Token state written by
-- a completed callback is intentionally not reversible.
