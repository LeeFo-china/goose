CREATE TABLE IF NOT EXISTS public.user_oauth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  openid text NOT NULL,
  unionid text NULL,
  status text NOT NULL DEFAULT 'active',
  bound_at timestamptz NOT NULL DEFAULT now(),
  unbound_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_oauth_identities_status_check
    CHECK (status IN ('active', 'unbound', 'disabled')),
  CONSTRAINT user_oauth_identities_platform_check
    CHECK (platform IN ('wechat_mini', 'wechat_web', 'ios', 'android', 'web', 'apple'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_oauth_identities_platform_openid_active_unique
ON public.user_oauth_identities(platform, openid)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS user_oauth_identities_user_status_idx
ON public.user_oauth_identities(user_id, status);

CREATE INDEX IF NOT EXISTS user_oauth_identities_openid_status_idx
ON public.user_oauth_identities(platform, openid, status);

DROP TRIGGER IF EXISTS tr_user_oauth_identities_updated_at ON public.user_oauth_identities;
CREATE TRIGGER tr_user_oauth_identities_updated_at
BEFORE UPDATE ON public.user_oauth_identities
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  identity_type text NOT NULL,
  identity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_business_memberships_identity_type_check
    CHECK (identity_type IN ('customer', 'employee', 'platform_admin')),
  CONSTRAINT user_business_memberships_status_check
    CHECK (status IN ('active', 'disabled', 'unbound'))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_business_memberships_identity_active_unique
ON public.user_business_memberships(
  user_id,
  (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  identity_type,
  identity_id
)
WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS user_business_memberships_default_active_unique
ON public.user_business_memberships(
  user_id,
  (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)),
  identity_type
)
WHERE status = 'active' AND is_default = true;

CREATE INDEX IF NOT EXISTS user_business_memberships_user_status_idx
ON public.user_business_memberships(user_id, status);

CREATE INDEX IF NOT EXISTS user_business_memberships_identity_idx
ON public.user_business_memberships(identity_type, identity_id, status);

CREATE INDEX IF NOT EXISTS user_business_memberships_tenant_status_idx
ON public.user_business_memberships(tenant_id, status);

DROP TRIGGER IF EXISTS tr_user_business_memberships_updated_at ON public.user_business_memberships;
CREATE TRIGGER tr_user_business_memberships_updated_at
BEFORE UPDATE ON public.user_business_memberships
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.user_auth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  platform text NULL,
  openid_hash text NULL,
  operator_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ip text NULL,
  user_agent text NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_auth_events_user_created_at_idx
ON public.user_auth_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_auth_events_event_type_created_at_idx
ON public.user_auth_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS user_auth_events_operator_created_at_idx
ON public.user_auth_events(operator_user_id, created_at DESC)
WHERE operator_user_id IS NOT NULL;

COMMENT ON TABLE public.user_oauth_identities IS '用户登录凭证表，表达微信小程序、网页、App 等登录入口与 auth.users 的关系';
COMMENT ON COLUMN public.user_oauth_identities.platform IS '登录平台：wechat_mini/wechat_web/ios/android/web/apple';
COMMENT ON COLUMN public.user_oauth_identities.openid IS '平台侧用户标识，后续不同平台可存 openid、sub 或同等稳定 ID';
COMMENT ON COLUMN public.user_oauth_identities.status IS '凭证状态：active/unbound/disabled';
COMMENT ON COLUMN public.user_oauth_identities.unbound_at IS '凭证解绑时间，逻辑解绑时保留历史关系';

COMMENT ON TABLE public.user_business_memberships IS '用户业务身份关系表，表达 auth.users 与客户、员工、平台管理员等业务档案的关系';
COMMENT ON COLUMN public.user_business_memberships.tenant_id IS '业务身份所属租户；平台管理员等全局身份可为空';
COMMENT ON COLUMN public.user_business_memberships.identity_type IS '业务身份类型：customer/employee/platform_admin';
COMMENT ON COLUMN public.user_business_memberships.identity_id IS '业务档案 ID，对应 customers.id、employees.id 或后续平台管理员档案 ID';
COMMENT ON COLUMN public.user_business_memberships.is_default IS '同租户同身份类型下的默认业务身份';

COMMENT ON TABLE public.user_auth_events IS '登录、绑定、解绑、换绑等身份安全事件审计表';
COMMENT ON COLUMN public.user_auth_events.openid_hash IS 'openid 的哈希值，避免在审计事件中重复暴露原始 openid';
