ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

UPDATE public.system_settings
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.system_setting_change_logs
ADD COLUMN IF NOT EXISTS tenant_id uuid NULL REFERENCES public.tenants(id);

ALTER TABLE public.system_setting_change_logs
DROP CONSTRAINT IF EXISTS system_setting_change_logs_setting_key_fkey;

ALTER TABLE public.system_settings
DROP CONSTRAINT IF EXISTS system_settings_pkey;

ALTER TABLE public.system_settings
ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_system_settings_platform_key
ON public.system_settings(key)
WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_system_settings_tenant_key
ON public.system_settings(tenant_id, key)
WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_settings_tenant_group
ON public.system_settings(tenant_id, group_code);

CREATE INDEX IF NOT EXISTS idx_system_setting_change_logs_tenant_key_created
ON public.system_setting_change_logs(tenant_id, setting_key, created_at DESC);

COMMENT ON COLUMN public.system_settings.tenant_id IS '租户ID。NULL 表示平台级配置；非 NULL 表示租户级覆盖配置';
COMMENT ON COLUMN public.system_setting_change_logs.tenant_id IS '配置变更所属租户。NULL 表示平台级配置变更';
