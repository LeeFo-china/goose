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
      'rebind_wechat'::text
    ]
  )
);

CREATE TABLE IF NOT EXISTS public.wechat_rebind_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_role text NOT NULL,
  target_customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  target_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  phone text NOT NULL,
  old_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  new_auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_name text NULL,
  project_hint text NULL,
  community_hint text NULL,
  remark text NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewer_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  review_comment text NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_rebind_requests_target_role_check
    CHECK (target_role IN ('customer', 'employee')),
  CONSTRAINT wechat_rebind_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT wechat_rebind_requests_target_check CHECK (
    (target_role = 'customer' AND target_customer_id IS NOT NULL AND target_employee_id IS NULL)
    OR
    (target_role = 'employee' AND target_employee_id IS NOT NULL AND target_customer_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS wechat_rebind_requests_tenant_status_idx
ON public.wechat_rebind_requests(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS wechat_rebind_requests_phone_idx
ON public.wechat_rebind_requests(phone, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS wechat_rebind_requests_customer_pending_unique
ON public.wechat_rebind_requests(phone, target_role, target_customer_id)
WHERE status = 'pending' AND target_role = 'customer' AND target_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wechat_rebind_requests_employee_pending_unique
ON public.wechat_rebind_requests(phone, target_role, target_employee_id)
WHERE status = 'pending' AND target_role = 'employee' AND target_employee_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_wechat_rebind_requests_updated_at ON public.wechat_rebind_requests;
CREATE TRIGGER tr_wechat_rebind_requests_updated_at
BEFORE UPDATE ON public.wechat_rebind_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.wechat_rebind_requests IS '微信旧账号不可用时的人工换绑申请';
COMMENT ON COLUMN public.wechat_rebind_requests.old_auth_user_id IS '当前目标身份绑定的旧 auth.users.id，禁止对小程序端暴露';
COMMENT ON COLUMN public.wechat_rebind_requests.new_auth_user_id IS '提交申请的新微信 auth.users.id';
