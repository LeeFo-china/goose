CREATE TABLE IF NOT EXISTS public.tenant_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  description text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_templates_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT tenant_templates_version_not_blank CHECK (btrim(version) <> ''),
  CONSTRAINT tenant_templates_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_templates_code_version_unique
ON public.tenant_templates(code, version);

CREATE INDEX IF NOT EXISTS tenant_templates_status_created_at_idx
ON public.tenant_templates(status, created_at DESC);

DROP TRIGGER IF EXISTS tr_tenant_templates_updated_at ON public.tenant_templates;

CREATE TRIGGER tr_tenant_templates_updated_at
  BEFORE UPDATE ON public.tenant_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_template_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.tenant_templates(id) ON DELETE SET NULL,
  template_code text NOT NULL,
  template_version text NOT NULL,
  applied_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_template_applications_template_code_not_blank CHECK (btrim(template_code) <> ''),
  CONSTRAINT tenant_template_applications_template_version_not_blank CHECK (btrim(template_version) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_template_applications_unique
ON public.tenant_template_applications(tenant_id, template_code, template_version);

CREATE INDEX IF NOT EXISTS tenant_template_applications_tenant_applied_at_idx
ON public.tenant_template_applications(tenant_id, applied_at DESC);

INSERT INTO public.tenant_templates (
  code,
  name,
  version,
  description,
  payload,
  status
)
VALUES (
  'default_decoration_company',
  '装修公司默认初始化模板',
  '2026.05.10',
  '初始化标准部门、岗位、系统管理员角色和租户管理员员工',
  jsonb_build_object(
    'department_source', 'packages/domain DepartmentConfig',
    'post_source', 'packages/domain EmployeePostConfig',
    'roles', jsonb_build_array('system_admin', 'employee_base', 'finance_base', 'design_manage')
  ),
  'active'
)
ON CONFLICT (code, version) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  payload = EXCLUDED.payload,
  status = EXCLUDED.status,
  updated_at = now();

COMMENT ON TABLE public.tenant_templates IS '租户初始化模板版本';
COMMENT ON TABLE public.tenant_template_applications IS '租户初始化模板应用记录';
