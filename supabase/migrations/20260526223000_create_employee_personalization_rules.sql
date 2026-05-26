CREATE TABLE IF NOT EXISTS public.employee_personalization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scene varchar(64) NOT NULL,
  employee_id uuid NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  tenant_department_id uuid NULL REFERENCES public.tenant_departments(id) ON DELETE CASCADE,
  post_id uuid NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  role_code varchar(64) NULL,
  priority integer NOT NULL DEFAULT 0,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(32) NOT NULL DEFAULT 'draft',
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_personalization_rules_status_check
    CHECK (status IN ('draft', 'active', 'disabled')),
  CONSTRAINT employee_personalization_rules_scene_not_blank_check
    CHECK (btrim(scene) <> ''),
  CONSTRAINT employee_personalization_rules_content_object_check
    CHECK (jsonb_typeof(content_json) = 'object'),
  CONSTRAINT employee_personalization_rules_time_range_check
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT employee_personalization_rules_single_scope_check
    CHECK (
      (
        employee_id IS NOT NULL
        AND tenant_department_id IS NULL
        AND post_id IS NULL
        AND role_code IS NULL
      )
      OR (
        employee_id IS NULL
        AND tenant_department_id IS NOT NULL
        AND post_id IS NOT NULL
        AND role_code IS NULL
      )
      OR (
        employee_id IS NULL
        AND tenant_department_id IS NULL
        AND post_id IS NOT NULL
        AND role_code IS NULL
      )
      OR (
        employee_id IS NULL
        AND tenant_department_id IS NOT NULL
        AND post_id IS NULL
        AND role_code IS NULL
      )
      OR (
        employee_id IS NULL
        AND tenant_department_id IS NULL
        AND post_id IS NULL
        AND role_code IS NOT NULL
      )
      OR (
        employee_id IS NULL
        AND tenant_department_id IS NULL
        AND post_id IS NULL
        AND role_code IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_employee_personalization_rules_tenant_scene_status
ON public.employee_personalization_rules(tenant_id, scene, status);

CREATE INDEX IF NOT EXISTS idx_employee_personalization_rules_employee
ON public.employee_personalization_rules(tenant_id, scene, employee_id)
WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_personalization_rules_department_post
ON public.employee_personalization_rules(tenant_id, scene, tenant_department_id, post_id)
WHERE tenant_department_id IS NOT NULL AND post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_personalization_rules_post
ON public.employee_personalization_rules(tenant_id, scene, post_id)
WHERE tenant_department_id IS NULL AND post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_personalization_rules_department
ON public.employee_personalization_rules(tenant_id, scene, tenant_department_id)
WHERE tenant_department_id IS NOT NULL AND post_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_personalization_rules_role
ON public.employee_personalization_rules(tenant_id, scene, role_code)
WHERE role_code IS NOT NULL;

DROP TRIGGER IF EXISTS tr_employee_personalization_rules_updated_at
ON public.employee_personalization_rules;

CREATE TRIGGER tr_employee_personalization_rules_updated_at
BEFORE UPDATE ON public.employee_personalization_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.employee_personalization_rules IS '员工端按员工、租户部门、岗位、角色和租户默认匹配的个性化内容规则';
COMMENT ON COLUMN public.employee_personalization_rules.scene IS '个性化场景编码，例如 employee_home';
COMMENT ON COLUMN public.employee_personalization_rules.content_json IS '当前规则命中后返回给端上的场景配置 JSON';
COMMENT ON COLUMN public.employee_personalization_rules.status IS '规则状态：draft 草稿，active 启用，disabled 停用';
