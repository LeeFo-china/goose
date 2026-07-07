ALTER TABLE public.sms_verification_codes
DROP CONSTRAINT IF EXISTS sms_verification_codes_scene_check;

ALTER TABLE public.sms_verification_codes
ADD CONSTRAINT sms_verification_codes_scene_check
CHECK (
  scene = ANY (
    ARRAY[
      'bind_customer'::text,
      'bind_employee'::text,
      'admin_login'::text,
      'rebind_wechat'::text,
      'bind_platform_partner'::text,
      'unbind_platform_partner'::text,
      'partner_application'::text
    ]
  )
);

CREATE OR REPLACE FUNCTION public.unbind_platform_partner_member_binding(
  p_member_id uuid,
  p_auth_user_id uuid,
  p_partner_id uuid,
  p_code text
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
  SELECT
      member.id,
      member.auth_user_id,
      member.phone,
      member.status AS member_status,
      partner.status AS partner_status
    INTO v_member
  FROM public.platform_partner_members AS member
  JOIN public.platform_partners AS partner ON partner.id = member.partner_id
  WHERE member.id = p_member_id
    AND member.partner_id = p_partner_id
  LIMIT 1
  FOR UPDATE OF member, partner SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'member_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_member.member_status = 'disabled' OR v_member.partner_status <> 'active' THEN
    RETURN QUERY SELECT 'partner_unavailable'::text, v_member.id;
    RETURN;
  END IF;

  IF v_member.auth_user_id IS NULL OR v_member.auth_user_id <> p_auth_user_id THEN
    RETURN QUERY SELECT 'member_not_bound'::text, v_member.id;
    RETURN;
  END IF;

  SELECT sms.id
    INTO v_sms_id
  FROM public.sms_verification_codes AS sms
  WHERE sms.phone = v_member.phone
    AND sms.scene = 'unbind_platform_partner'
    AND sms.code = p_code
    AND sms.status = 'pending'
    AND sms.expired_at > now()
  ORDER BY sms.created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_sms_id IS NULL THEN
    RETURN QUERY SELECT 'sms_invalid'::text, v_member.id;
    RETURN;
  END IF;

  UPDATE public.platform_partner_members
  SET auth_user_id = NULL,
      status = 'pending_bind'
  WHERE id = v_member.id;

  UPDATE public.sms_verification_codes
  SET status = 'verified',
      verified_at = now()
  WHERE id = v_sms_id;

  RETURN QUERY SELECT 'unbound'::text, v_member.id;
END;
$$;

REVOKE ALL ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.unbind_platform_partner_member_binding(uuid, uuid, uuid, text) TO service_role;
