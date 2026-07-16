-- Add unified phone identity verification and short-lived selection sessions.
-- Rollback: deploy the previous API first, then drop the six RPCs, the two
-- session tables and phone-first indexes. Restore the old SMS scene constraint
-- only after proving no login_identity rows remain.
BEGIN;

ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check CHECK (
  scene IN (
    'bind_customer',
    'bind_employee',
    'admin_login',
    'rebind_wechat',
    'bind_platform_partner',
    'unbind_platform_partner',
    'rebind_platform_partner',
    'partner_application',
    'partner_tenant_onboarding',
    'tenant_onboarding_application',
    'login_identity'
  )
);

CREATE TABLE public.phone_identity_login_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sms_verification_code_id uuid NOT NULL UNIQUE
    REFERENCES public.sms_verification_codes(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  openid_hash text NOT NULL CHECK (length(openid_hash) = 64),
  verified_phone text NOT NULL CHECK (verified_phone ~ '^1[3-9][0-9]{9}$'),
  selection_token_hash text NULL CHECK (
    selection_token_hash IS NULL OR length(selection_token_hash) = 64
  ),
  status text NOT NULL DEFAULT 'verified' CHECK (
    status IN ('verified', 'selection_required', 'binding', 'consumed', 'expired')
  ),
  selected_candidate_id uuid NULL,
  share_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(share_context) = 'object'
  ),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX phone_identity_login_sessions_token_hash_unique_idx
ON public.phone_identity_login_sessions(selection_token_hash)
WHERE selection_token_hash IS NOT NULL;

CREATE INDEX phone_identity_login_sessions_status_expires_idx
ON public.phone_identity_login_sessions(status, expires_at);

CREATE INDEX phone_identity_login_sessions_auth_created_idx
ON public.phone_identity_login_sessions(auth_user_id, created_at DESC);

CREATE TABLE public.phone_identity_login_candidates (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL
    REFERENCES public.phone_identity_login_sessions(id) ON DELETE CASCADE,
  target_mode text NOT NULL CHECK (
    target_mode IN ('customer', 'tenant_employee', 'platform_partner')
  ),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  partner_id uuid NULL REFERENCES public.platform_partners(id) ON DELETE RESTRICT,
  partner_member_id uuid NULL
    REFERENCES public.platform_partner_members(id) ON DELETE RESTRICT,
  binding_state text NOT NULL CHECK (
    binding_state IN ('current', 'bindable', 'rebind_required')
  ),
  display_snapshot jsonb NOT NULL CHECK (jsonb_typeof(display_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phone_identity_login_candidate_target_check CHECK (
    (target_mode = 'customer' AND tenant_id IS NOT NULL AND customer_id IS NOT NULL
      AND employee_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
    OR
    (target_mode = 'tenant_employee' AND tenant_id IS NOT NULL AND employee_id IS NOT NULL
      AND customer_id IS NULL AND partner_id IS NULL AND partner_member_id IS NULL)
    OR
    (target_mode = 'platform_partner' AND partner_id IS NOT NULL
      AND partner_member_id IS NOT NULL AND tenant_id IS NULL
      AND customer_id IS NULL AND employee_id IS NULL)
  ),
  UNIQUE(session_id, id)
);

ALTER TABLE public.phone_identity_login_sessions
ADD CONSTRAINT phone_identity_login_sessions_selected_candidate_fkey
FOREIGN KEY (id, selected_candidate_id)
REFERENCES public.phone_identity_login_candidates(session_id, id)
DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX phone_identity_login_candidates_session_idx
ON public.phone_identity_login_candidates(session_id, id);

ALTER TABLE public.phone_identity_login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_identity_login_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.phone_identity_login_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.phone_identity_login_candidates FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS customers_phone_identity_login_idx
ON public.customers(phone, tenant_id, id)
WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_phone_identity_login_idx
ON public.employees(phone, tenant_id, status, id)
WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_phone_identity_login_verification(
  p_phone text,
  p_code text,
  p_auth_user_id uuid,
  p_openid_hash text,
  p_now timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE(status text, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sms_id uuid;
  v_sms_expired_at timestamptz;
  v_session_id uuid;
BEGIN
  SELECT sms.id, sms.expired_at
  INTO v_sms_id, v_sms_expired_at
  FROM public.sms_verification_codes AS sms
  WHERE sms.phone = p_phone
    AND sms.scene = 'login_identity'
    AND sms.code = p_code
    AND sms.status = 'pending'
  ORDER BY sms.created_at DESC, sms.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_sms_id IS NULL THEN
    RETURN QUERY SELECT 'sms_invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_sms_expired_at <= p_now THEN
    RETURN QUERY SELECT 'sms_expired'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.sms_verification_codes AS sms
  SET status = 'verified',
      verified_at = p_now
  WHERE sms.id = v_sms_id;

  INSERT INTO public.phone_identity_login_sessions (
    sms_verification_code_id,
    auth_user_id,
    openid_hash,
    verified_phone,
    expires_at
  ) VALUES (
    v_sms_id,
    p_auth_user_id,
    p_openid_hash,
    p_phone,
    p_expires_at
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT 'claimed'::text, v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_phone_identity_selection(
  p_session_id uuid,
  p_auth_user_id uuid,
  p_openid_hash text,
  p_selection_token_hash text,
  p_share_context jsonb,
  p_candidates jsonb,
  p_now timestamptz
)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.phone_identity_login_sessions%ROWTYPE;
  v_allowed_keys constant text[] := ARRAY[
    'id',
    'target_mode',
    'tenant_id',
    'customer_id',
    'employee_id',
    'partner_id',
    'partner_member_id',
    'binding_state',
    'display_snapshot'
  ];
BEGIN
  SELECT session_row.*
  INTO v_session
  FROM public.phone_identity_login_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.auth_user_id = p_auth_user_id
    AND session_row.openid_hash = p_openid_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'session_not_found'::text;
    RETURN;
  END IF;

  IF v_session.expires_at <= p_now THEN
    UPDATE public.phone_identity_login_sessions
    SET status = 'expired',
        updated_at = p_now
    WHERE id = v_session.id;
    RETURN QUERY SELECT 'session_expired'::text;
    RETURN;
  END IF;

  IF v_session.status <> 'verified' THEN
    RETURN QUERY SELECT 'state_conflict'::text;
    RETURN;
  END IF;

  IF jsonb_typeof(p_share_context) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_candidates) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_candidates) NOT BETWEEN 2 AND 100
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_candidates) AS candidate(item)
      WHERE jsonb_typeof(candidate.item) IS DISTINCT FROM 'object'
        OR NOT candidate.item ?& v_allowed_keys
        OR candidate.item - v_allowed_keys <> '{}'::jsonb
        OR jsonb_typeof(candidate.item->'display_snapshot') IS DISTINCT FROM 'object'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PHONE_IDENTITY_SELECTION_PAYLOAD_INVALID';
  END IF;

  INSERT INTO public.phone_identity_login_candidates (
    id,
    session_id,
    target_mode,
    tenant_id,
    customer_id,
    employee_id,
    partner_id,
    partner_member_id,
    binding_state,
    display_snapshot
  )
  SELECT
    parsed.id,
    v_session.id,
    parsed.target_mode,
    parsed.tenant_id,
    parsed.customer_id,
    parsed.employee_id,
    parsed.partner_id,
    parsed.partner_member_id,
    parsed.binding_state,
    parsed.display_snapshot
  FROM jsonb_to_recordset(p_candidates) AS parsed(
    id uuid,
    target_mode text,
    tenant_id uuid,
    customer_id uuid,
    employee_id uuid,
    partner_id uuid,
    partner_member_id uuid,
    binding_state text,
    display_snapshot jsonb
  );

  UPDATE public.phone_identity_login_sessions
  SET selection_token_hash = p_selection_token_hash,
      share_context = p_share_context,
      status = 'selection_required',
      updated_at = p_now
  WHERE id = v_session.id;

  RETURN QUERY SELECT 'ready'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_phone_identity_selection(
  p_selection_token_hash text,
  p_candidate_id uuid,
  p_auth_user_id uuid,
  p_openid_hash text,
  p_now timestamptz
)
RETURNS TABLE(
  status text,
  session_id uuid,
  target_mode text,
  tenant_id uuid,
  customer_id uuid,
  employee_id uuid,
  partner_id uuid,
  partner_member_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_session public.phone_identity_login_sessions%ROWTYPE;
  v_candidate public.phone_identity_login_candidates%ROWTYPE;
BEGIN
  SELECT session_row.*
  INTO v_session
  FROM public.phone_identity_login_sessions AS session_row
  WHERE session_row.selection_token_hash = p_selection_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'session_not_found'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF v_session.auth_user_id <> p_auth_user_id
    OR v_session.openid_hash <> p_openid_hash
  THEN
    RETURN QUERY SELECT
      'session_not_found'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF v_session.expires_at <= p_now THEN
    UPDATE public.phone_identity_login_sessions
    SET status = 'expired',
        updated_at = p_now
    WHERE id = v_session.id;
    RETURN QUERY SELECT
      'expired'::text,
      v_session.id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF v_session.status = 'consumed' THEN
    IF v_session.selected_candidate_id = p_candidate_id THEN
      SELECT candidate.*
      INTO v_candidate
      FROM public.phone_identity_login_candidates AS candidate
      WHERE candidate.session_id = v_session.id
        AND candidate.id = p_candidate_id;

      IF FOUND THEN
        RETURN QUERY SELECT
          'same_candidate_consumed'::text,
          v_session.id,
          v_candidate.target_mode,
          v_candidate.tenant_id,
          v_candidate.customer_id,
          v_candidate.employee_id,
          v_candidate.partner_id,
          v_candidate.partner_member_id;
        RETURN;
      END IF;
    END IF;

    RETURN QUERY SELECT
      'selection_consumed'::text,
      v_session.id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF v_session.status = 'binding' THEN
    IF v_session.selected_candidate_id = p_candidate_id THEN
      SELECT candidate.*
      INTO v_candidate
      FROM public.phone_identity_login_candidates AS candidate
      WHERE candidate.session_id = v_session.id
        AND candidate.id = p_candidate_id;

      IF FOUND THEN
        RETURN QUERY SELECT
          'same_candidate_in_progress'::text,
          v_session.id,
          v_candidate.target_mode,
          v_candidate.tenant_id,
          v_candidate.customer_id,
          v_candidate.employee_id,
          v_candidate.partner_id,
          v_candidate.partner_member_id;
        RETURN;
      END IF;
    END IF;

    RETURN QUERY SELECT
      'in_progress'::text,
      v_session.id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF v_session.status <> 'selection_required' THEN
    RETURN QUERY SELECT
      'session_not_found'::text,
      NULL::uuid,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  SELECT candidate.*
  INTO v_candidate
  FROM public.phone_identity_login_candidates AS candidate
  WHERE candidate.session_id = v_session.id
    AND candidate.id = p_candidate_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      'option_unavailable'::text,
      v_session.id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.phone_identity_login_sessions
  SET status = 'binding',
      selected_candidate_id = p_candidate_id,
      updated_at = p_now
  WHERE id = v_session.id
    AND status = 'selection_required';

  RETURN QUERY SELECT
    'reserved'::text,
    v_session.id,
    v_candidate.target_mode,
    v_candidate.tenant_id,
    v_candidate.customer_id,
    v_candidate.employee_id,
    v_candidate.partner_id,
    v_candidate.partner_member_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_phone_identity_selection(
  p_session_id uuid,
  p_candidate_id uuid,
  p_now timestamptz
)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.phone_identity_login_sessions AS session_row
  SET status = 'consumed',
      consumed_at = p_now,
      updated_at = p_now
  WHERE session_row.id = p_session_id
    AND session_row.selected_candidate_id = p_candidate_id
    AND session_row.status = 'binding';

  IF FOUND THEN
    RETURN QUERY SELECT 'consumed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'state_conflict'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_phone_identity_selection(
  p_session_id uuid,
  p_candidate_id uuid,
  p_now timestamptz
)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT session_row.status
  INTO v_status
  FROM public.phone_identity_login_sessions AS session_row
  WHERE session_row.id = p_session_id
    AND session_row.selected_candidate_id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'state_conflict'::text;
    RETURN;
  END IF;

  IF v_status = 'consumed' THEN
    RETURN QUERY SELECT 'consumed'::text;
    RETURN;
  END IF;

  IF v_status <> 'binding' THEN
    RETURN QUERY SELECT 'state_conflict'::text;
    RETURN;
  END IF;

  UPDATE public.phone_identity_login_sessions
  SET status = 'selection_required',
      selected_candidate_id = NULL,
      updated_at = p_now
  WHERE id = p_session_id
    AND selected_candidate_id = p_candidate_id
    AND status = 'binding';

  RETURN QUERY SELECT 'released'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_phone_identity_login_sessions(
  p_before timestamptz,
  p_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PHONE_IDENTITY_PURGE_LIMIT_INVALID';
  END IF;

  WITH expired_sessions AS (
    SELECT session_row.id
    FROM public.phone_identity_login_sessions AS session_row
    WHERE session_row.expires_at < p_before
    ORDER BY session_row.expires_at, session_row.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  deleted_sessions AS (
    DELETE FROM public.phone_identity_login_sessions AS session_row
    USING expired_sessions
    WHERE session_row.id = expired_sessions.id
    RETURNING session_row.id
  )
  SELECT count(*)::integer
  INTO v_deleted
  FROM deleted_sessions;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_phone_identity_login_verification(text, text, uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_phone_identity_login_verification(text, text, uuid, text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.begin_phone_identity_selection(uuid, uuid, text, text, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_phone_identity_selection(uuid, uuid, text, text, jsonb, jsonb, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_phone_identity_selection(text, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_phone_identity_selection(text, uuid, uuid, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_phone_identity_selection(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_phone_identity_selection(uuid, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.release_phone_identity_selection(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_phone_identity_selection(uuid, uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.purge_phone_identity_login_sessions(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_phone_identity_login_sessions(timestamptz, integer) TO service_role;

COMMIT;
