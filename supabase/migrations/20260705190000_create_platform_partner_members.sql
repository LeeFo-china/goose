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
      'bind_platform_partner'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.platform_partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  status text NOT NULL DEFAULT 'pending_bind',
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_members_role_check CHECK (role IN ('owner', 'operator')),
  CONSTRAINT platform_partner_members_status_check CHECK (status IN ('pending_bind', 'active', 'disabled'))
);

DROP TRIGGER IF EXISTS tr_platform_partner_members_updated_at
  ON public.platform_partner_members;
CREATE TRIGGER tr_platform_partner_members_updated_at
  BEFORE UPDATE ON public.platform_partner_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_members_partner_phone_idx
  ON public.platform_partner_members(partner_id, phone);

CREATE UNIQUE INDEX IF NOT EXISTS platform_partner_members_partner_auth_user_idx
  ON public.platform_partner_members(partner_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_partner_members_auth_user_status_idx
  ON public.platform_partner_members(auth_user_id, status)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_partner_members_partner_status_idx
  ON public.platform_partner_members(partner_id, status);
