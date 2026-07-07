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
      'rebind_platform_partner'::text,
      'partner_application'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.platform_partner_member_rebind_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  member_id uuid NOT NULL REFERENCES public.platform_partner_members(id),
  phone text NOT NULL,
  old_auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  new_auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  applicant_name text NULL,
  reason text NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewer_employee_id uuid NULL REFERENCES public.employees(id),
  review_comment text NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_member_rebind_requests_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT platform_partner_member_rebind_requests_phone_not_blank CHECK (
    btrim(phone) <> ''
  ),
  CONSTRAINT platform_partner_member_rebind_requests_distinct_auth_check CHECK (
    old_auth_user_id <> new_auth_user_id
  )
);

DROP TRIGGER IF EXISTS tr_platform_partner_member_rebind_requests_updated_at
  ON public.platform_partner_member_rebind_requests;
CREATE TRIGGER tr_platform_partner_member_rebind_requests_updated_at
  BEFORE UPDATE ON public.platform_partner_member_rebind_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS platform_partner_member_rebind_requests_status_created_idx
  ON public.platform_partner_member_rebind_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_partner_member_rebind_requests_partner_status_created_idx
  ON public.platform_partner_member_rebind_requests(partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_partner_member_rebind_requests_phone_created_idx
  ON public.platform_partner_member_rebind_requests(phone, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_member_rebind_requests_member_pending_unique_idx
  ON public.platform_partner_member_rebind_requests(member_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.approve_platform_partner_member_rebind_request(
  p_request_id uuid,
  p_reviewer_employee_id uuid,
  p_comment text DEFAULT NULL
)
RETURNS TABLE(status text, request_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_request record;
  v_member record;
  v_existing_member_id uuid;
BEGIN
  SELECT request.*
    INTO v_request
  FROM public.platform_partner_member_rebind_requests AS request
  WHERE request.id = p_request_id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'request_not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN QUERY SELECT 'request_already_reviewed'::text, v_request.id;
    RETURN;
  END IF;

  SELECT
      member.id,
      member.partner_id,
      member.auth_user_id,
      member.phone,
      member.status AS member_status,
      partner.status AS partner_status
    INTO v_member
  FROM public.platform_partner_members AS member
  JOIN public.platform_partners AS partner ON partner.id = member.partner_id
  WHERE member.id = v_request.member_id
  LIMIT 1
  FOR UPDATE OF member, partner;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'member_not_found'::text, v_request.id;
    RETURN;
  END IF;

  IF v_member.member_status <> 'active' OR v_member.partner_status <> 'active' THEN
    RETURN QUERY SELECT 'partner_unavailable'::text, v_request.id;
    RETURN;
  END IF;

  IF v_member.partner_id <> v_request.partner_id
    OR v_member.phone <> v_request.phone
    OR v_member.auth_user_id IS NULL
    OR v_member.auth_user_id <> v_request.old_auth_user_id THEN
    RETURN QUERY SELECT 'member_binding_changed'::text, v_request.id;
    RETURN;
  END IF;

  SELECT member.id
    INTO v_existing_member_id
  FROM public.platform_partner_members AS member
  WHERE member.auth_user_id = v_request.new_auth_user_id
    AND member.id <> v_request.member_id
    AND member.status <> 'disabled'
  LIMIT 1
  FOR UPDATE;

  IF v_existing_member_id IS NOT NULL THEN
    RETURN QUERY SELECT 'new_auth_user_already_bound'::text, v_request.id;
    RETURN;
  END IF;

  UPDATE public.platform_partner_members
  SET auth_user_id = v_request.new_auth_user_id,
      status = 'active'
  WHERE id = v_request.member_id;

  UPDATE public.platform_partner_member_rebind_requests
  SET status = 'approved',
      reviewer_employee_id = p_reviewer_employee_id,
      review_comment = NULLIF(btrim(COALESCE(p_comment, '')), ''),
      reviewed_at = now()
  WHERE id = v_request.id;

  RETURN QUERY SELECT 'approved'::text, v_request.id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_platform_partner_member_rebind_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_platform_partner_member_rebind_request(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_platform_partner_member_rebind_request(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_platform_partner_member_rebind_request(uuid, uuid, text) TO service_role;

COMMENT ON TABLE public.platform_partner_member_rebind_requests IS '城市合伙人成员旧微信不可用时的平台人工换绑申请';
COMMENT ON FUNCTION public.approve_platform_partner_member_rebind_request(uuid, uuid, text)
IS '平台超管审核通过合伙人成员换绑申请，原子转移 platform_partner_members.auth_user_id';
