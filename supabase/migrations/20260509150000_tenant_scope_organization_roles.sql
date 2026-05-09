ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.roles
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.department_post_rules
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

ALTER TABLE public.project_member_role_post_rules
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.departments
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.posts
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.roles
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.department_post_rules
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

WITH default_tenant AS (
  SELECT id FROM public.tenants WHERE slug = 'gooes_default'
)
UPDATE public.project_member_role_post_rules
SET tenant_id = (SELECT id FROM default_tenant)
WHERE tenant_id IS NULL;

ALTER TABLE public.department_post_rules
DROP CONSTRAINT IF EXISTS department_post_rules_department_code_fkey,
DROP CONSTRAINT IF EXISTS department_post_rules_post_code_fkey,
DROP CONSTRAINT IF EXISTS department_post_rules_unique_department_post;

ALTER TABLE public.project_member_role_post_rules
DROP CONSTRAINT IF EXISTS project_member_role_post_rules_post_code_fkey,
DROP CONSTRAINT IF EXISTS project_member_role_post_rules_unique_role_post;

ALTER TABLE public.departments
DROP CONSTRAINT IF EXISTS departments_code_key;

ALTER TABLE public.posts
DROP CONSTRAINT IF EXISTS posts_code_key,
DROP CONSTRAINT IF EXISTS posts_name_key;

ALTER TABLE public.roles
DROP CONSTRAINT IF EXISTS roles_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS departments_tenant_code_unique
ON public.departments(tenant_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS posts_tenant_code_unique
ON public.posts(tenant_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS posts_tenant_name_unique
ON public.posts(tenant_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_code_unique
ON public.roles(tenant_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS department_post_rules_tenant_department_post_unique
ON public.department_post_rules(tenant_id, department_code, post_code);

CREATE UNIQUE INDEX IF NOT EXISTS project_member_role_post_rules_tenant_role_post_unique
ON public.project_member_role_post_rules(tenant_id, role_code, post_code);

CREATE INDEX IF NOT EXISTS departments_tenant_created_at_idx
ON public.departments(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_tenant_created_at_idx
ON public.posts(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS roles_tenant_created_at_idx
ON public.roles(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS department_post_rules_tenant_department_enabled_sort_idx
ON public.department_post_rules(tenant_id, department_code, enabled, sort);

CREATE INDEX IF NOT EXISTS project_member_role_post_rules_tenant_role_enabled_sort_idx
ON public.project_member_role_post_rules(tenant_id, role_code, enabled, sort);

COMMENT ON COLUMN public.departments.tenant_id IS '部门所属租户';
COMMENT ON COLUMN public.posts.tenant_id IS '岗位所属租户';
COMMENT ON COLUMN public.roles.tenant_id IS '角色所属租户';
COMMENT ON COLUMN public.department_post_rules.tenant_id IS '部门岗位规则所属租户';
COMMENT ON COLUMN public.project_member_role_post_rules.tenant_id IS '项目成员角色岗位规则所属租户';
