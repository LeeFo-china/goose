-- Qualify status column references in phone identity selection RPCs.

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
  verified_phone text,
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
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  IF v_session.expires_at <= p_now THEN
    UPDATE public.phone_identity_login_sessions AS session_row
    SET status = 'expired',
        updated_at = p_now
    WHERE session_row.id = v_session.id;
    RETURN QUERY SELECT
      'expired'::text,
      v_session.id,
      v_session.verified_phone,
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
          v_session.verified_phone,
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
      v_session.verified_phone,
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
          v_session.verified_phone,
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
      v_session.verified_phone,
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
      v_session.verified_phone,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.phone_identity_login_sessions AS session_row
  SET status = 'binding',
      selected_candidate_id = p_candidate_id,
      updated_at = p_now
  WHERE session_row.id = v_session.id
    AND session_row.status = 'selection_required';

  RETURN QUERY SELECT
    'reserved'::text,
    v_session.id,
    v_session.verified_phone,
    v_candidate.target_mode,
    v_candidate.tenant_id,
    v_candidate.customer_id,
    v_candidate.employee_id,
    v_candidate.partner_id,
    v_candidate.partner_member_id;
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

  UPDATE public.phone_identity_login_sessions AS session_row
  SET status = 'selection_required',
      selected_candidate_id = NULL,
      updated_at = p_now
  WHERE session_row.id = p_session_id
    AND session_row.selected_candidate_id = p_candidate_id
    AND session_row.status = 'binding';

  RETURN QUERY SELECT 'released'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_phone_identity_selection(text, uuid, uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_phone_identity_selection(text, uuid, uuid, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.release_phone_identity_selection(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_phone_identity_selection(uuid, uuid, timestamptz) TO service_role;
