CREATE TABLE IF NOT EXISTS public.department_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  default_name text NOT NULL,
  description text NULL,
  sort integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_department_templates_updated_at
ON public.department_templates;

CREATE TRIGGER tr_department_templates_updated_at
BEFORE UPDATE ON public.department_templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.department_templates(id) ON DELETE RESTRICT,
  code text NOT NULL,
  alias_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  legacy_department_id uuid NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tr_tenant_departments_updated_at
ON public.tenant_departments;

CREATE TRIGGER tr_tenant_departments_updated_at
BEFORE UPDATE ON public.tenant_departments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS tenant_departments_tenant_code_unique
ON public.tenant_departments(tenant_id, code);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_departments_tenant_template_unique
ON public.tenant_departments(tenant_id, template_id);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_departments_legacy_department_unique
ON public.tenant_departments(legacy_department_id)
WHERE legacy_department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_departments_tenant_enabled_sort_idx
ON public.tenant_departments(tenant_id, enabled, sort);

CREATE INDEX IF NOT EXISTS department_templates_enabled_sort_idx
ON public.department_templates(enabled, sort);

WITH department_dictionary(code, default_name, sort) AS (
  VALUES
    ('BOARD', '董事会', 10),
    ('EXEC_OFFICE', '总裁办/总经理办公室', 20),
    ('SALES', '销售部/客户部', 30),
    ('MARKETING', '市场部', 40),
    ('DESIGN', '设计部', 50),
    ('PROJECT', '工程部', 60),
    ('PROCURE', '采购部', 70),
    ('AFTER_SALE', '售后部/维保部', 80),
    ('PRODUCT', '产品部', 90),
    ('TECH', '技术研发部', 100),
    ('IT', '信息技术部', 110),
    ('BIM_CENTER', 'BIM中心', 120),
    ('SUPPLY_CHAIN', '供应链管理部', 130),
    ('LOGISTICS', '物流部', 140),
    ('WAREHOUSE', '仓储部', 150),
    ('FACTORY', '工厂/生产基地', 160),
    ('PROJECT_MGT', '工程项目管理部', 170),
    ('QUALITY_SUPERVISION', '质量监理部', 180),
    ('SAFETY', '安全监察部', 190),
    ('ACCEPTANCE', '竣工验收部', 200),
    ('MAINTENANCE', '维修保养部', 210),
    ('ADMIN', '行政人事部', 220),
    ('FINANCE', '财务部', 230),
    ('LEGAL', '法务部', 240),
    ('COMPLIANCE', '合规部', 250),
    ('INTERNAL_AUDIT', '内审部', 260),
    ('BRAND', '品牌管理部', 270),
    ('PUBLIC_RELATIONS', '公关部', 280),
    ('DIGITAL_MARKETING', '数字营销部', 290),
    ('SELF_MEDIA', '自媒体部', 300),
    ('CHANNEL', '渠道部', 310),
    ('COMMUNITY', '社区运营部', 320),
    ('CUSTOMER_SERVICE', '客服部', 330),
    ('CUSTOMER_SUCCESS', '客户成功部', 340),
    ('COMPLAINTS', '客诉处理部', 350),
    ('STRATEGY', '战略发展部', 360),
    ('INVESTOR', '投资者关系部', 370),
    ('BUSINESS_DEV', '商务拓展部', 380),
    ('PMO', '项目管理办公室', 390),
    ('TRAINING', '培训部', 400),
    ('OPERATIONS', '运营部', 410),
    ('DATA_CENTER', '数据中心', 420)
)
INSERT INTO public.department_templates (
  code,
  default_name,
  sort,
  enabled
)
SELECT
  department_dictionary.code,
  department_dictionary.default_name,
  department_dictionary.sort,
  true
FROM department_dictionary
ON CONFLICT (code) DO UPDATE
SET
  default_name = EXCLUDED.default_name,
  sort = EXCLUDED.sort,
  enabled = true,
  updated_at = now();

INSERT INTO public.tenant_departments (
  tenant_id,
  template_id,
  code,
  alias_name,
  enabled,
  sort,
  legacy_department_id,
  created_at,
  updated_at
)
SELECT
  departments.tenant_id,
  department_templates.id,
  departments.code,
  departments.name,
  true,
  COALESCE(department_templates.sort, 0),
  departments.id,
  COALESCE(departments.created_at::timestamptz, now()),
  now()
FROM public.departments AS departments
JOIN public.department_templates AS department_templates
  ON department_templates.code = departments.code
WHERE departments.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, code) DO UPDATE
SET
  template_id = EXCLUDED.template_id,
  alias_name = EXCLUDED.alias_name,
  legacy_department_id = COALESCE(
    public.tenant_departments.legacy_department_id,
    EXCLUDED.legacy_department_id
  ),
  updated_at = now();

COMMENT ON TABLE public.department_templates IS '平台标准部门模板，由平台维护标准部门 code 与默认名称';
COMMENT ON COLUMN public.department_templates.code IS '平台标准部门编码，作为权限、统计和规则的稳定语义';
COMMENT ON COLUMN public.department_templates.default_name IS '平台标准部门默认名称';
COMMENT ON TABLE public.tenant_departments IS '租户启用部门配置，表达租户选择启用哪些标准部门及其显示别名';
COMMENT ON COLUMN public.tenant_departments.template_id IS '对应平台标准部门模板';
COMMENT ON COLUMN public.tenant_departments.code IS '冗余标准部门编码，便于兼容旧规则和查询';
COMMENT ON COLUMN public.tenant_departments.alias_name IS '租户侧部门显示名称/别名';
COMMENT ON COLUMN public.tenant_departments.enabled IS '租户是否启用该部门';
COMMENT ON COLUMN public.tenant_departments.legacy_department_id IS '第一阶段兼容旧 departments.id 的映射';
