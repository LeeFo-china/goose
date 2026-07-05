CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_members_auth_user_active_unique_idx
  ON public.platform_partner_members(auth_user_id)
  WHERE auth_user_id IS NOT NULL AND status <> 'disabled';

CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_members_phone_active_unique_idx
  ON public.platform_partner_members(phone)
  WHERE status <> 'disabled';

CREATE OR REPLACE FUNCTION public.claim_platform_partner_member_binding(
  p_phone text,
  p_code text,
  p_auth_user_id uuid
)
RETURNS TABLE(status text, member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sms_id uuid;
  v_member record;
BEGIN
  SELECT sms.id
    INTO v_sms_id
  FROM public.sms_verification_codes AS sms
  WHERE sms.phone = p_phone
    AND sms.scene = 'bind_platform_partner'
    AND sms.code = p_code
    AND sms.status = 'pending'
    AND sms.expired_at > now()
  ORDER BY sms.created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_sms_id IS NULL THEN
    RETURN QUERY SELECT 'sms_invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  SELECT member.id, member.auth_user_id
    INTO v_member
  FROM public.platform_partner_members AS member
  WHERE member.phone = p_phone
    AND member.status IN ('pending_bind', 'active')
  ORDER BY member.created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'member_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_member.auth_user_id IS NOT NULL AND v_member.auth_user_id <> p_auth_user_id THEN
    RETURN QUERY SELECT 'member_already_bound'::text, v_member.id;
    RETURN;
  END IF;

  UPDATE public.platform_partner_members
  SET auth_user_id = p_auth_user_id,
      status = 'active'
  WHERE id = v_member.id;

  UPDATE public.sms_verification_codes
  SET status = 'verified',
      verified_at = now()
  WHERE id = v_sms_id;

  RETURN QUERY SELECT 'bound'::text, v_member.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_platform_partner_member_binding(text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_platform_partner_member_binding(text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_platform_partner_member_binding(text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_platform_partner_member_binding(text, text, uuid) TO service_role;
