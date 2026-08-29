-- Rollback (forward only): add a later migration that marks template version
-- 2026.08.30 inactive and restores both commands to a compatible version.
-- Preserve all tenant organization data already applied from this template.

BEGIN;

WITH audit_department_defaults(code, alias_name, enabled, sort) AS (
  VALUES
    ('BOARD', '董事会', FALSE, 1),
    ('EXEC_OFFICE', '总裁办/总经理办公室', TRUE, 2),
    ('SALES', '销售部/客户部', FALSE, 3),
    ('MARKETING', '市场部', TRUE, 4),
    ('DESIGN', '设计部', TRUE, 5),
    ('PROJECT', '工程部', TRUE, 6),
    ('PROCURE', '采购部', FALSE, 7),
    ('AFTER_SALE', '售后部/维保部', FALSE, 8),
    ('PRODUCT', '产品部', FALSE, 9),
    ('TECH', '技术研发部', FALSE, 10),
    ('IT', '信息技术部', FALSE, 11),
    ('BIM_CENTER', 'BIM中心', FALSE, 12),
    ('SUPPLY_CHAIN', '供应链管理部', FALSE, 13),
    ('LOGISTICS', '物流部', FALSE, 14),
    ('WAREHOUSE', '仓储部', FALSE, 15),
    ('FACTORY', '工厂/生产基地', FALSE, 16),
    ('PROJECT_MGT', '工程项目管理部', FALSE, 17),
    ('QUALITY_SUPERVISION', '质量监理部', FALSE, 18),
    ('SAFETY', '安全监察部', FALSE, 19),
    ('ACCEPTANCE', '竣工验收部', FALSE, 20),
    ('MAINTENANCE', '维修保养部', FALSE, 21),
    ('ADMIN', '行政人事部', FALSE, 22),
    ('FINANCE', '财务部', TRUE, 23),
    ('LEGAL', '法务部', FALSE, 24),
    ('COMPLIANCE', '合规部', FALSE, 25),
    ('INTERNAL_AUDIT', '内审部', FALSE, 26),
    ('BRAND', '品牌管理部', FALSE, 27),
    ('PUBLIC_RELATIONS', '公关部', FALSE, 28),
    ('DIGITAL_MARKETING', '数字营销部', FALSE, 29),
    ('SELF_MEDIA', '自媒体部', TRUE, 30),
    ('CHANNEL', '渠道部', FALSE, 31),
    ('COMMUNITY', '社区运营部', FALSE, 32),
    ('CUSTOMER_SERVICE', '客服部', TRUE, 33),
    ('CUSTOMER_SUCCESS', '客户成功部', FALSE, 34),
    ('COMPLAINTS', '客诉处理部', FALSE, 35),
    ('STRATEGY', '战略发展部', FALSE, 36),
    ('INVESTOR', '投资者关系部', FALSE, 37),
    ('BUSINESS_DEV', '商务拓展部', FALSE, 38),
    ('PMO', '项目管理办公室', FALSE, 39),
    ('TRAINING', '培训部', FALSE, 40),
    ('OPERATIONS', '运营部', FALSE, 41),
    ('DATA_CENTER', '数据中心', FALSE, 42)
),
audit_post_defaults(code, alias_name, status, sort) AS (
  VALUES
    ('GENERAL_MANAGER', '总经理', 1, 1),
    ('OPERATIONS_DIRECTOR', '运营总监', 1, 2),
    ('GENERAL_MANAGER_ASSISTANT', '总经理助理', 0, 3),
    ('HR_ADMIN_MANAGER', '行政人事主管', 0, 4),
    ('HR_SPECIALIST', '人事专员', 0, 5),
    ('ADMIN_SPECIALIST', '行政专员', 0, 6),
    ('MARKETING_DIRECTOR', '营销总监', 0, 7),
    ('MARKETING_MANAGER', '市场经理', 1, 8),
    ('NEW_MEDIA_OPERATOR', '新媒体运营', 1, 9),
    ('VIDEO_EDITOR', '摄影剪辑', 1, 10),
    ('LIVE_STREAM_OPERATOR', '直播运营', 1, 11),
    ('AD_OPERATOR', '投流专员', 0, 12),
    ('CUSTOMER_INVITER', '客服邀约专员', 0, 13),
    ('SALES_MANAGER', '销售经理', 0, 14),
    ('SALES_CONSULTANT', '客户经理', 1, 15),
    ('TELESALES', '电话销售', 0, 16),
    ('CHANNEL_MANAGER', '渠道经理', 0, 17),
    ('DESIGN_DIRECTOR', '设计总监', 1, 18),
    ('CHIEF_DESIGNER', '主案设计师', 1, 19),
    ('INTERIOR_DESIGNER', '设计师', 0, 20),
    ('ASSISTANT_DESIGNER', '助理设计师', 0, 21),
    ('RENDERING_DESIGNER', '效果图设计师', 0, 22),
    ('ENGINEERING_DIRECTOR', '工程总监', 1, 23),
    ('PROJECT_MANAGER', '项目经理', 0, 24),
    ('CONSTRUCTION_SUPER', '工程监理', 1, 25),
    ('QUALITY_INSPECTOR', '质检专员', 0, 26),
    ('SAFETY_OFFICER', '安全员', 0, 27),
    ('HYDROPOWER_FOREMAN', '水电工长', 1, 28),
    ('TILE_FOREMAN', '瓦工工长', 1, 29),
    ('CARPENTRY_FOREMAN', '木工工长', 1, 30),
    ('PAINT_FOREMAN', '油漆工长', 1, 31),
    ('MAINTENANCE_WORKER', '维修工', 1, 32),
    ('PROCUREMENT_MANAGER', '采购主管', 0, 33),
    ('PROCURE_OFFICER', '采购专员', 0, 34),
    ('MATERIAL_CLERK', '材料员', 0, 35),
    ('WAREHOUSE_KEEPER', '仓库管理员', 0, 36),
    ('DELIVERY_COORDINATOR', '配送协调员', 0, 37),
    ('FINANCE_MANAGER', '财务经理', 1, 38),
    ('FINANCE_ACCOUNTANT', '会计', 1, 39),
    ('CASHIER', '出纳', 0, 40),
    ('COST_ACCOUNTANT', '成本核算员', 0, 41),
    ('CUSTOMER_SERVICE_MANAGER', '客服主管', 1, 42),
    ('CUSTOMER_SERVICE', '客服专员', 1, 43),
    ('AFTER_SALES_SPECIALIST', '售后专员', 0, 44),
    ('CUSTOMER_RETURN_VISITOR', '回访专员', 0, 45),
    ('SYSTEM_ADMIN', '系统管理员', 1, 46),
    ('DATA_SPECIALIST', '数据专员', 0, 47),
    ('IT_SUPPORT', 'IT技术支持', 0, 48)
),
audit_department_post_defaults(
  department_code,
  post_code,
  alias_name,
  enabled,
  sort
) AS (
  VALUES
    ('EXEC_OFFICE', 'GENERAL_MANAGER', NULL, TRUE, 1),
    ('EXEC_OFFICE', 'SYSTEM_ADMIN', NULL, TRUE, 2),
    ('MARKETING', 'SALES_CONSULTANT', '销售专员', TRUE, 3),
    ('MARKETING', 'MARKETING_MANAGER', NULL, TRUE, 4),
    ('DESIGN', 'DESIGN_DIRECTOR', NULL, TRUE, 5),
    ('DESIGN', 'CHIEF_DESIGNER', NULL, TRUE, 6),
    ('PROJECT', 'ENGINEERING_DIRECTOR', NULL, TRUE, 7),
    ('PROJECT', 'CONSTRUCTION_SUPER', NULL, TRUE, 8),
    ('PROJECT', 'HYDROPOWER_FOREMAN', NULL, TRUE, 9),
    ('PROJECT', 'TILE_FOREMAN', NULL, TRUE, 10),
    ('PROJECT', 'CARPENTRY_FOREMAN', NULL, TRUE, 11),
    ('PROJECT', 'PAINT_FOREMAN', NULL, TRUE, 12),
    ('PROJECT', 'MAINTENANCE_WORKER', NULL, TRUE, 13),
    ('FINANCE', 'FINANCE_ACCOUNTANT', '财务专员', TRUE, 14),
    ('FINANCE', 'FINANCE_MANAGER', NULL, TRUE, 15),
    ('SELF_MEDIA', 'OPERATIONS_DIRECTOR', NULL, TRUE, 16),
    ('SELF_MEDIA', 'NEW_MEDIA_OPERATOR', NULL, TRUE, 17),
    ('SELF_MEDIA', 'VIDEO_EDITOR', NULL, TRUE, 18),
    ('SELF_MEDIA', 'LIVE_STREAM_OPERATOR', NULL, TRUE, 19),
    ('CUSTOMER_SERVICE', 'CUSTOMER_SERVICE_MANAGER', NULL, TRUE, 20),
    ('CUSTOMER_SERVICE', 'CUSTOMER_SERVICE', NULL, TRUE, 21)
),
audit_role_defaults(code, name, description, status) AS (
  VALUES
    ('system_admin', '系统管理员', '租户管理员，拥有当前租户全部后台管理权限', 'active'),
    ('employee_base', '员工基础角色', '无明确业务岗位时的最小基础权限', 'active'),
    ('business_manager', '业务经理', '管理市场客户、线索和项目转化', 'active'),
    ('salesperson', '业务员', '维护本人客户、线索和项目', 'active'),
    ('design_manage', '设计主管', '管理设计部门项目和施工流程', 'active'),
    ('designer', '设计师', '维护本人参与的项目和日志', 'active'),
    ('engineering_manager', '工程部主管', '管理工程项目、流程和验收', 'active'),
    ('construction_supervisor', '工程监理', '执行项目流程、日志和验收', 'active'),
    ('construction_worker', '施工人员', '执行本人施工节点和日志', 'active'),
    ('finance_base', '财务基础角色', '财务核算、收支、预算和报表', 'active'),
    ('cashier', '出纳员', '收付款和应收账款操作', 'active')
),
audit_non_admin_permission_defaults(
  role_code,
  permission_code,
  access_scope
) AS (
  VALUES
    ('employee_base', 'dashboard.read', 'self'),
    ('employee_base', 'employee.read', 'self'),
    ('employee_base', 'expense_request.create', 'self'),
    ('employee_base', 'expense_request.read', 'self'),
    ('employee_base', 'expense_request.submit', 'self'),
    ('employee_base', 'task_center.read', 'self'),
    ('business_manager', 'customer.assign_owner', 'all'),
    ('business_manager', 'project.read', 'all'),
    ('business_manager', 'customer.create', 'department'),
    ('business_manager', 'customer.phone.call', 'department'),
    ('business_manager', 'customer.phone.copy', 'department'),
    ('business_manager', 'customer.phone.view', 'department'),
    ('business_manager', 'customer.read', 'department'),
    ('business_manager', 'customer.update', 'department'),
    ('business_manager', 'employee.read', 'department'),
    ('business_manager', 'expense_request.approve_manager', 'department'),
    ('business_manager', 'expense_request.read', 'department'),
    ('business_manager', 'marketing_lead.read', 'department'),
    ('business_manager', 'marketing_lead.update', 'department'),
    ('business_manager', 'marketing_page.create', 'department'),
    ('business_manager', 'marketing_page.delete', 'department'),
    ('business_manager', 'marketing_page.publish', 'department'),
    ('business_manager', 'marketing_page.read', 'department'),
    ('business_manager', 'marketing_page.update', 'department'),
    ('business_manager', 'project.create', 'department'),
    ('business_manager', 'project.delete', 'department'),
    ('business_manager', 'project.update', 'department'),
    ('business_manager', 'dashboard.read', 'self'),
    ('business_manager', 'expense_request.create', 'self'),
    ('business_manager', 'expense_request.submit', 'self'),
    ('business_manager', 'project_acceptance.read', 'self'),
    ('business_manager', 'task_center.read', 'self'),
    ('salesperson', 'customer.create', 'self'),
    ('salesperson', 'customer.phone.call', 'self'),
    ('salesperson', 'customer.phone.view', 'self'),
    ('salesperson', 'customer.read', 'self'),
    ('salesperson', 'customer.update', 'self'),
    ('salesperson', 'dashboard.read', 'self'),
    ('salesperson', 'expense_request.create', 'self'),
    ('salesperson', 'expense_request.read', 'self'),
    ('salesperson', 'expense_request.submit', 'self'),
    ('salesperson', 'marketing_lead.read', 'self'),
    ('salesperson', 'marketing_lead.update', 'self'),
    ('salesperson', 'marketing_page.read', 'self'),
    ('salesperson', 'project.create', 'self'),
    ('salesperson', 'project.delete', 'self'),
    ('salesperson', 'project.read', 'self'),
    ('salesperson', 'project.update', 'self'),
    ('salesperson', 'task_center.read', 'self'),
    ('design_manage', 'project_acceptance.read', 'all'),
    ('design_manage', 'expense_request.approve_manager', 'department'),
    ('design_manage', 'expense_request.read', 'department'),
    ('design_manage', 'project.read', 'department'),
    ('design_manage', 'dashboard.read', 'self'),
    ('design_manage', 'expense_request.create', 'self'),
    ('design_manage', 'expense_request.submit', 'self'),
    ('design_manage', 'project_procedure.adjust', 'self'),
    ('design_manage', 'project_procedure.assign', 'self'),
    ('design_manage', 'project_procedure.read', 'self'),
    ('design_manage', 'task_center.read', 'self'),
    ('designer', 'dashboard.read', 'self'),
    ('designer', 'expense_request.create', 'self'),
    ('designer', 'expense_request.read', 'self'),
    ('designer', 'expense_request.submit', 'self'),
    ('designer', 'project.read', 'self'),
    ('designer', 'project.update', 'self'),
    ('designer', 'project_log.create', 'self'),
    ('designer', 'project_procedure.read', 'self'),
    ('designer', 'project_acceptance.read', 'self'),
    ('designer', 'task_center.read', 'self'),
    ('engineering_manager', 'project_acceptance.manage', 'all'),
    ('engineering_manager', 'project_acceptance.reject', 'all'),
    ('engineering_manager', 'project_acceptance.review', 'all'),
    ('engineering_manager', 'project_acceptance.submit', 'all'),
    ('engineering_manager', 'project.read', 'all'),
    ('engineering_manager', 'project.update', 'all'),
    ('engineering_manager', 'expense_request.approve_manager', 'department'),
    ('engineering_manager', 'expense_request.read', 'department'),
    ('engineering_manager', 'project_acceptance.create', 'department'),
    ('engineering_manager', 'project_acceptance.read', 'department'),
    ('engineering_manager', 'project_log.create', 'department'),
    ('engineering_manager', 'project_procedure.adjust', 'department'),
    ('engineering_manager', 'project_procedure.assign', 'department'),
    ('engineering_manager', 'project_procedure.read', 'department'),
    ('engineering_manager', 'customer.phone.call', 'self'),
    ('engineering_manager', 'customer.phone.view', 'self'),
    ('engineering_manager', 'dashboard.read', 'self'),
    ('engineering_manager', 'employee.read', 'self'),
    ('engineering_manager', 'expense_request.create', 'self'),
    ('engineering_manager', 'expense_request.submit', 'self'),
    ('engineering_manager', 'project_acceptance.update_own', 'self'),
    ('engineering_manager', 'task_center.read', 'self'),
    ('construction_supervisor', 'project_acceptance.create', 'department'),
    ('construction_supervisor', 'project_acceptance.submit', 'department'),
    ('construction_supervisor', 'project_acceptance.update_own', 'department'),
    ('construction_supervisor', 'project.read', 'department'),
    ('construction_supervisor', 'dashboard.read', 'self'),
    ('construction_supervisor', 'expense_request.create', 'self'),
    ('construction_supervisor', 'expense_request.read', 'self'),
    ('construction_supervisor', 'expense_request.submit', 'self'),
    ('construction_supervisor', 'project_acceptance.read', 'self'),
    ('construction_supervisor', 'project_log.create', 'self'),
    ('construction_supervisor', 'project_procedure.adjust', 'self'),
    ('construction_supervisor', 'project_procedure.assign', 'self'),
    ('construction_supervisor', 'project_procedure.complete', 'self'),
    ('construction_supervisor', 'project_procedure.read', 'self'),
    ('construction_supervisor', 'project.update', 'self'),
    ('construction_supervisor', 'social_video_transcription.create', 'self'),
    ('construction_supervisor', 'social_video_transcription.manage', 'self'),
    ('construction_supervisor', 'task_center.read', 'self'),
    ('construction_worker', 'project_log.create', 'self'),
    ('construction_worker', 'project_procedure.assignee', 'self'),
    ('construction_worker', 'task_center.read', 'self'),
    ('finance_base', 'expense_request.approve_finance', 'all'),
    ('finance_base', 'expense_request.pay', 'all'),
    ('finance_base', 'expense_request.read', 'all'),
    ('finance_base', 'finance.budget.manage', 'all'),
    ('finance_base', 'finance.budget.view', 'all'),
    ('finance_base', 'finance.closing.manage', 'all'),
    ('finance_base', 'finance.closing.read', 'all'),
    ('finance_base', 'finance.cost-allocation.manage', 'all'),
    ('finance_base', 'finance.cost-category.manage', 'all'),
    ('finance_base', 'finance.cost-category.view', 'all'),
    ('finance_base', 'finance.dashboard.view', 'all'),
    ('finance_base', 'finance.expense.pay', 'all'),
    ('finance_base', 'finance.expense.review', 'all'),
    ('finance_base', 'finance.ledger.view', 'all'),
    ('finance_base', 'finance.payment.confirm', 'all'),
    ('finance_base', 'finance.payment.create', 'all'),
    ('finance_base', 'finance.receivable.manage', 'all'),
    ('finance_base', 'finance.receivable.view', 'all'),
    ('finance_base', 'finance.reconciliation.manage', 'all'),
    ('finance_base', 'finance.reports.export', 'all'),
    ('finance_base', 'finance.reports.read', 'all'),
    ('finance_base', 'finance.view', 'all'),
    ('finance_base', 'project_acceptance.read', 'all'),
    ('finance_base', 'project.read', 'all'),
    ('finance_base', 'project_referral.manage', 'all'),
    ('finance_base', 'project_referral.read', 'all'),
    ('finance_base', 'wechat_pay.notify.read', 'all'),
    ('finance_base', 'wechat_pay.order.read', 'all'),
    ('finance_base', 'dashboard.read', 'self'),
    ('finance_base', 'expense_request.create', 'self'),
    ('finance_base', 'expense_request.submit', 'self'),
    ('finance_base', 'task_center.read', 'self'),
    ('cashier', 'expense_request.approve_finance', 'all'),
    ('cashier', 'expense_request.pay', 'all'),
    ('cashier', 'expense_request.read', 'all'),
    ('cashier', 'finance.expense.pay', 'all'),
    ('cashier', 'finance.expense.review', 'all'),
    ('cashier', 'finance.ledger.view', 'all'),
    ('cashier', 'finance.payment.create', 'all'),
    ('cashier', 'finance.receivable.manage', 'all'),
    ('cashier', 'finance.receivable.view', 'all'),
    ('cashier', 'finance.view', 'all'),
    ('cashier', 'task_center.read', 'department'),
    ('cashier', 'dashboard.read', 'self'),
    ('cashier', 'finance.budget.view', 'self'),
    ('cashier', 'finance.cost-allocation.manage', 'self'),
    ('cashier', 'finance.cost-category.manage', 'self'),
    ('cashier', 'finance.cost-category.view', 'self'),
    ('cashier', 'finance.dashboard.view', 'self')
),
audit_payload AS (
  SELECT pg_catalog.jsonb_build_object(
    'departments', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', code,
          'alias_name', alias_name,
          'enabled', enabled,
          'sort', sort
        ) ORDER BY sort
      )
      FROM audit_department_defaults
    ),
    'posts', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', code,
          'alias_name', alias_name,
          'status', status,
          'sort', sort
        ) ORDER BY sort
      )
      FROM audit_post_defaults
    ),
    'department_posts', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'department_code', department_code,
          'post_code', post_code,
          'alias_name', alias_name,
          'enabled', enabled,
          'sort', sort
        ) ORDER BY sort
      )
      FROM audit_department_post_defaults
    ),
    'roles', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'code', code,
          'name', name,
          'description', description,
          'status', status
        ) ORDER BY code
      )
      FROM audit_role_defaults
    ),
    'role_permissions', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'role_code', role_code,
          'permission_code', permission_code,
          'access_scope', access_scope
        ) ORDER BY role_code, permission_code
      )
      FROM audit_non_admin_permission_defaults
    ),
    'system_admin_permission_rule', 'active_non_platform',
    'template_code', 'default_decoration_company',
    'template_version', '2026.08.30',
    'source', 'tenant-standard-template-migration'
  ) AS payload
)
INSERT INTO public.tenant_templates (
  code,
  name,
  version,
  description,
  payload,
  status
)
SELECT
  'default_decoration_company',
  '装修公司标准组织模板',
  '2026.08.30',
  '初始化标准部门、岗位、部门岗位规则、角色权限和可选租户管理员',
  audit_payload.payload,
  'active'
FROM audit_payload
ON CONFLICT (code, version) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  payload = EXCLUDED.payload,
  status = EXCLUDED.status,
  updated_at = pg_catalog.now();

CREATE OR REPLACE FUNCTION public.initialize_default_decoration_tenant(
  p_tenant_id uuid,
  p_admin_name text,
  p_admin_phone text,
  p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_admin_name text := NULLIF(pg_catalog.btrim(COALESCE(p_admin_name, '')), '');
  v_admin_phone text := NULLIF(pg_catalog.btrim(COALESCE(p_admin_phone, '')), '');
  v_existing_application public.tenant_template_applications%ROWTYPE;
  v_existing_admin_employee_id text;
  v_existing_admin_name text;
  v_existing_admin_phone text;
  v_expected_department_count integer := 0;
  v_resolved_department_count integer := 0;
  v_departments_count integer := 0;
  v_posts_count integer := 0;
  v_department_posts_count integer := 0;
  v_roles_count integer := 0;
  v_expected_non_admin_permission_count integer := 0;
  v_resolved_non_admin_permission_count integer := 0;
  v_admin_department_id uuid;
  v_admin_post_id uuid;
  v_admin_employee_id uuid;
  v_admin_role_id uuid;
  v_template_id uuid;
  v_initialization jsonb;
BEGIN
  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TENANT_INITIALIZATION_TENANT_NOT_FOUND';
  END IF;

  IF (v_admin_name IS NULL) <> (v_admin_phone IS NULL) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_INITIALIZATION_INPUT_INVALID';
  END IF;

  PERFORM application.id
  FROM public.tenant_template_applications AS application
  WHERE application.tenant_id = p_tenant_id
    AND application.template_code = 'default_decoration_company'
  FOR UPDATE;

  SELECT application.*
  INTO v_existing_application
  FROM public.tenant_template_applications AS application
  WHERE application.tenant_id = p_tenant_id
    AND application.template_code = 'default_decoration_company'
    AND application.template_version = '2026.08.30'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_existing_admin_employee_id :=
      v_existing_application.result ->> 'admin_employee_id';

    IF v_existing_admin_employee_id IS NULL THEN
      IF v_admin_name IS NOT NULL OR v_admin_phone IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
      END IF;
    ELSE
      SELECT employee.name, employee.phone
      INTO v_existing_admin_name, v_existing_admin_phone
      FROM public.employees AS employee
      WHERE employee.tenant_id = p_tenant_id
        AND employee.id::text = v_existing_admin_employee_id
      LIMIT 1;

      IF NOT FOUND
        OR v_existing_admin_name IS DISTINCT FROM v_admin_name
        OR v_existing_admin_phone IS DISTINCT FROM v_admin_phone
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
      END IF;
    END IF;

    RETURN v_existing_application.result;
  END IF;

  PERFORM application.id
  FROM public.tenant_template_applications AS application
  WHERE application.tenant_id = p_tenant_id
    AND application.template_code = 'default_decoration_company'
    AND application.template_version <> '2026.08.30'
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_departments AS department
    WHERE department.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.posts AS post
    WHERE post.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.department_post_rules AS rule
    WHERE rule.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.roles AS role
    WHERE role.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.employee_roles AS employee_role
    INNER JOIN public.employees AS employee
      ON employee.id = employee_role.employee_id
    WHERE employee.tenant_id = p_tenant_id
  ) OR EXISTS (
    SELECT 1
    FROM public.role_permissions AS role_permission
    INNER JOIN public.roles AS role
      ON role.id = role_permission.role_id
    WHERE role.tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
  END IF;

  SELECT template.id
  INTO v_template_id
  FROM public.tenant_templates AS template
  WHERE template.code = 'default_decoration_company'
    AND template.version = '2026.08.30'
    AND template.status = 'active'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TENANT_TEMPLATE_NOT_FOUND';
  END IF;

  WITH department_defaults(code, alias_name, enabled, sort) AS (
    VALUES
      ('BOARD', '董事会', FALSE, 1),
      ('EXEC_OFFICE', '总裁办/总经理办公室', TRUE, 2),
      ('SALES', '销售部/客户部', FALSE, 3),
      ('MARKETING', '市场部', TRUE, 4),
      ('DESIGN', '设计部', TRUE, 5),
      ('PROJECT', '工程部', TRUE, 6),
      ('PROCURE', '采购部', FALSE, 7),
      ('AFTER_SALE', '售后部/维保部', FALSE, 8),
      ('PRODUCT', '产品部', FALSE, 9),
      ('TECH', '技术研发部', FALSE, 10),
      ('IT', '信息技术部', FALSE, 11),
      ('BIM_CENTER', 'BIM中心', FALSE, 12),
      ('SUPPLY_CHAIN', '供应链管理部', FALSE, 13),
      ('LOGISTICS', '物流部', FALSE, 14),
      ('WAREHOUSE', '仓储部', FALSE, 15),
      ('FACTORY', '工厂/生产基地', FALSE, 16),
      ('PROJECT_MGT', '工程项目管理部', FALSE, 17),
      ('QUALITY_SUPERVISION', '质量监理部', FALSE, 18),
      ('SAFETY', '安全监察部', FALSE, 19),
      ('ACCEPTANCE', '竣工验收部', FALSE, 20),
      ('MAINTENANCE', '维修保养部', FALSE, 21),
      ('ADMIN', '行政人事部', FALSE, 22),
      ('FINANCE', '财务部', TRUE, 23),
      ('LEGAL', '法务部', FALSE, 24),
      ('COMPLIANCE', '合规部', FALSE, 25),
      ('INTERNAL_AUDIT', '内审部', FALSE, 26),
      ('BRAND', '品牌管理部', FALSE, 27),
      ('PUBLIC_RELATIONS', '公关部', FALSE, 28),
      ('DIGITAL_MARKETING', '数字营销部', FALSE, 29),
      ('SELF_MEDIA', '自媒体部', TRUE, 30),
      ('CHANNEL', '渠道部', FALSE, 31),
      ('COMMUNITY', '社区运营部', FALSE, 32),
      ('CUSTOMER_SERVICE', '客服部', TRUE, 33),
      ('CUSTOMER_SUCCESS', '客户成功部', FALSE, 34),
      ('COMPLAINTS', '客诉处理部', FALSE, 35),
      ('STRATEGY', '战略发展部', FALSE, 36),
      ('INVESTOR', '投资者关系部', FALSE, 37),
      ('BUSINESS_DEV', '商务拓展部', FALSE, 38),
      ('PMO', '项目管理办公室', FALSE, 39),
      ('TRAINING', '培训部', FALSE, 40),
      ('OPERATIONS', '运营部', FALSE, 41),
      ('DATA_CENTER', '数据中心', FALSE, 42)
  ),
  resolved_departments AS (
    SELECT
      defaults.code,
      defaults.alias_name,
      defaults.enabled,
      defaults.sort,
      template.id AS template_id
    FROM department_defaults AS defaults
    INNER JOIN public.department_templates AS template
      ON template.code = defaults.code
  ),
  department_counts AS (
    SELECT
      (SELECT pg_catalog.count(*) FROM department_defaults) AS expected_count,
      (SELECT pg_catalog.count(*) FROM resolved_departments) AS resolved_count
  ),
  inserted_departments AS (
    INSERT INTO public.tenant_departments (
      tenant_id,
      template_id,
      code,
      alias_name,
      enabled,
      sort
    )
    SELECT
      p_tenant_id,
      resolved.template_id,
      resolved.code,
      resolved.alias_name,
      resolved.enabled,
      resolved.sort
    FROM resolved_departments AS resolved
    CROSS JOIN department_counts AS counts
    WHERE counts.expected_count = counts.resolved_count
    RETURNING tenant_departments.id
  )
  SELECT
    counts.expected_count::integer,
    counts.resolved_count::integer,
    (SELECT pg_catalog.count(*)::integer FROM inserted_departments)
  INTO
    v_expected_department_count,
    v_resolved_department_count,
    v_departments_count
  FROM department_counts AS counts;

  IF v_expected_department_count <> v_resolved_department_count
    OR v_departments_count <> 42
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TENANT_TEMPLATE_DEPARTMENT_MISSING';
  END IF;

  WITH post_defaults(code, alias_name, status, sort) AS (
    VALUES
      ('GENERAL_MANAGER', '总经理', 1, 1),
      ('OPERATIONS_DIRECTOR', '运营总监', 1, 2),
      ('GENERAL_MANAGER_ASSISTANT', '总经理助理', 0, 3),
      ('HR_ADMIN_MANAGER', '行政人事主管', 0, 4),
      ('HR_SPECIALIST', '人事专员', 0, 5),
      ('ADMIN_SPECIALIST', '行政专员', 0, 6),
      ('MARKETING_DIRECTOR', '营销总监', 0, 7),
      ('MARKETING_MANAGER', '市场经理', 1, 8),
      ('NEW_MEDIA_OPERATOR', '新媒体运营', 1, 9),
      ('VIDEO_EDITOR', '摄影剪辑', 1, 10),
      ('LIVE_STREAM_OPERATOR', '直播运营', 1, 11),
      ('AD_OPERATOR', '投流专员', 0, 12),
      ('CUSTOMER_INVITER', '客服邀约专员', 0, 13),
      ('SALES_MANAGER', '销售经理', 0, 14),
      ('SALES_CONSULTANT', '客户经理', 1, 15),
      ('TELESALES', '电话销售', 0, 16),
      ('CHANNEL_MANAGER', '渠道经理', 0, 17),
      ('DESIGN_DIRECTOR', '设计总监', 1, 18),
      ('CHIEF_DESIGNER', '主案设计师', 1, 19),
      ('INTERIOR_DESIGNER', '设计师', 0, 20),
      ('ASSISTANT_DESIGNER', '助理设计师', 0, 21),
      ('RENDERING_DESIGNER', '效果图设计师', 0, 22),
      ('ENGINEERING_DIRECTOR', '工程总监', 1, 23),
      ('PROJECT_MANAGER', '项目经理', 0, 24),
      ('CONSTRUCTION_SUPER', '工程监理', 1, 25),
      ('QUALITY_INSPECTOR', '质检专员', 0, 26),
      ('SAFETY_OFFICER', '安全员', 0, 27),
      ('HYDROPOWER_FOREMAN', '水电工长', 1, 28),
      ('TILE_FOREMAN', '瓦工工长', 1, 29),
      ('CARPENTRY_FOREMAN', '木工工长', 1, 30),
      ('PAINT_FOREMAN', '油漆工长', 1, 31),
      ('MAINTENANCE_WORKER', '维修工', 1, 32),
      ('PROCUREMENT_MANAGER', '采购主管', 0, 33),
      ('PROCURE_OFFICER', '采购专员', 0, 34),
      ('MATERIAL_CLERK', '材料员', 0, 35),
      ('WAREHOUSE_KEEPER', '仓库管理员', 0, 36),
      ('DELIVERY_COORDINATOR', '配送协调员', 0, 37),
      ('FINANCE_MANAGER', '财务经理', 1, 38),
      ('FINANCE_ACCOUNTANT', '会计', 1, 39),
      ('CASHIER', '出纳', 0, 40),
      ('COST_ACCOUNTANT', '成本核算员', 0, 41),
      ('CUSTOMER_SERVICE_MANAGER', '客服主管', 1, 42),
      ('CUSTOMER_SERVICE', '客服专员', 1, 43),
      ('AFTER_SALES_SPECIALIST', '售后专员', 0, 44),
      ('CUSTOMER_RETURN_VISITOR', '回访专员', 0, 45),
      ('SYSTEM_ADMIN', '系统管理员', 1, 46),
      ('DATA_SPECIALIST', '数据专员', 0, 47),
      ('IT_SUPPORT', 'IT技术支持', 0, 48)
  ),
  inserted_posts AS (
    INSERT INTO public.posts (
      tenant_id,
      code,
      name,
      salary_type,
      status,
      sort
    )
    SELECT
      p_tenant_id,
      defaults.code,
      defaults.alias_name,
      'fixed',
      defaults.status,
      defaults.sort
    FROM post_defaults AS defaults
    RETURNING posts.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_posts_count
  FROM inserted_posts;

  IF v_posts_count <> 48 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_POST_COUNT_MISMATCH';
  END IF;

  WITH department_post_defaults(
    department_code,
    post_code,
    alias_name,
    enabled,
    sort
  ) AS (
    VALUES
      ('EXEC_OFFICE', 'GENERAL_MANAGER', NULL, TRUE, 1),
      ('EXEC_OFFICE', 'SYSTEM_ADMIN', NULL, TRUE, 2),
      ('MARKETING', 'SALES_CONSULTANT', '销售专员', TRUE, 3),
      ('MARKETING', 'MARKETING_MANAGER', NULL, TRUE, 4),
      ('DESIGN', 'DESIGN_DIRECTOR', NULL, TRUE, 5),
      ('DESIGN', 'CHIEF_DESIGNER', NULL, TRUE, 6),
      ('PROJECT', 'ENGINEERING_DIRECTOR', NULL, TRUE, 7),
      ('PROJECT', 'CONSTRUCTION_SUPER', NULL, TRUE, 8),
      ('PROJECT', 'HYDROPOWER_FOREMAN', NULL, TRUE, 9),
      ('PROJECT', 'TILE_FOREMAN', NULL, TRUE, 10),
      ('PROJECT', 'CARPENTRY_FOREMAN', NULL, TRUE, 11),
      ('PROJECT', 'PAINT_FOREMAN', NULL, TRUE, 12),
      ('PROJECT', 'MAINTENANCE_WORKER', NULL, TRUE, 13),
      ('FINANCE', 'FINANCE_ACCOUNTANT', '财务专员', TRUE, 14),
      ('FINANCE', 'FINANCE_MANAGER', NULL, TRUE, 15),
      ('SELF_MEDIA', 'OPERATIONS_DIRECTOR', NULL, TRUE, 16),
      ('SELF_MEDIA', 'NEW_MEDIA_OPERATOR', NULL, TRUE, 17),
      ('SELF_MEDIA', 'VIDEO_EDITOR', NULL, TRUE, 18),
      ('SELF_MEDIA', 'LIVE_STREAM_OPERATOR', NULL, TRUE, 19),
      ('CUSTOMER_SERVICE', 'CUSTOMER_SERVICE_MANAGER', NULL, TRUE, 20),
      ('CUSTOMER_SERVICE', 'CUSTOMER_SERVICE', NULL, TRUE, 21)
  ),
  inserted_department_posts AS (
    INSERT INTO public.department_post_rules (
      tenant_id,
      tenant_department_id,
      department_code,
      post_code,
      alias_name,
      enabled,
      sort
    )
    SELECT
      p_tenant_id,
      department.id,
      defaults.department_code,
      defaults.post_code,
      defaults.alias_name,
      defaults.enabled,
      defaults.sort
    FROM department_post_defaults AS defaults
    INNER JOIN public.tenant_departments AS department
      ON department.tenant_id = p_tenant_id
     AND department.code = defaults.department_code
    INNER JOIN public.posts AS post
      ON post.tenant_id = p_tenant_id
     AND post.code = defaults.post_code
    RETURNING department_post_rules.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_department_posts_count
  FROM inserted_department_posts;

  IF v_department_posts_count <> 21 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_DEPARTMENT_POST_COUNT_MISMATCH';
  END IF;

  WITH role_defaults(code, name, description, status) AS (
    VALUES
      ('system_admin', '系统管理员', '租户管理员，拥有当前租户全部后台管理权限', 'active'),
      ('employee_base', '员工基础角色', '无明确业务岗位时的最小基础权限', 'active'),
      ('business_manager', '业务经理', '管理市场客户、线索和项目转化', 'active'),
      ('salesperson', '业务员', '维护本人客户、线索和项目', 'active'),
      ('design_manage', '设计主管', '管理设计部门项目和施工流程', 'active'),
      ('designer', '设计师', '维护本人参与的项目和日志', 'active'),
      ('engineering_manager', '工程部主管', '管理工程项目、流程和验收', 'active'),
      ('construction_supervisor', '工程监理', '执行项目流程、日志和验收', 'active'),
      ('construction_worker', '施工人员', '执行本人施工节点和日志', 'active'),
      ('finance_base', '财务基础角色', '财务核算、收支、预算和报表', 'active'),
      ('cashier', '出纳员', '收付款和应收账款操作', 'active')
  ),
  inserted_roles AS (
    INSERT INTO public.roles (
      tenant_id,
      code,
      name,
      description,
      status
    )
    SELECT
      p_tenant_id,
      defaults.code,
      defaults.name,
      defaults.description,
      defaults.status
    FROM role_defaults AS defaults
    RETURNING roles.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_roles_count
  FROM inserted_roles;

  IF v_roles_count <> 11 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_ROLE_COUNT_MISMATCH';
  END IF;

  SELECT role.id
  INTO v_admin_role_id
  FROM public.roles AS role
  WHERE role.tenant_id = p_tenant_id
    AND role.code = 'system_admin'
  LIMIT 1;

  IF v_admin_role_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_INITIALIZATION_ADMIN_ROLE_MISSING';
  END IF;

  WITH non_admin_permission_defaults(
    role_code,
    permission_code,
    access_scope
  ) AS (
    VALUES
      ('employee_base', 'dashboard.read', 'self'),
      ('employee_base', 'employee.read', 'self'),
      ('employee_base', 'expense_request.create', 'self'),
      ('employee_base', 'expense_request.read', 'self'),
      ('employee_base', 'expense_request.submit', 'self'),
      ('employee_base', 'task_center.read', 'self'),
      ('business_manager', 'customer.assign_owner', 'all'),
      ('business_manager', 'project.read', 'all'),
      ('business_manager', 'customer.create', 'department'),
      ('business_manager', 'customer.phone.call', 'department'),
      ('business_manager', 'customer.phone.copy', 'department'),
      ('business_manager', 'customer.phone.view', 'department'),
      ('business_manager', 'customer.read', 'department'),
      ('business_manager', 'customer.update', 'department'),
      ('business_manager', 'employee.read', 'department'),
      ('business_manager', 'expense_request.approve_manager', 'department'),
      ('business_manager', 'expense_request.read', 'department'),
      ('business_manager', 'marketing_lead.read', 'department'),
      ('business_manager', 'marketing_lead.update', 'department'),
      ('business_manager', 'marketing_page.create', 'department'),
      ('business_manager', 'marketing_page.delete', 'department'),
      ('business_manager', 'marketing_page.publish', 'department'),
      ('business_manager', 'marketing_page.read', 'department'),
      ('business_manager', 'marketing_page.update', 'department'),
      ('business_manager', 'project.create', 'department'),
      ('business_manager', 'project.delete', 'department'),
      ('business_manager', 'project.update', 'department'),
      ('business_manager', 'dashboard.read', 'self'),
      ('business_manager', 'expense_request.create', 'self'),
      ('business_manager', 'expense_request.submit', 'self'),
      ('business_manager', 'project_acceptance.read', 'self'),
      ('business_manager', 'task_center.read', 'self'),
      ('salesperson', 'customer.create', 'self'),
      ('salesperson', 'customer.phone.call', 'self'),
      ('salesperson', 'customer.phone.view', 'self'),
      ('salesperson', 'customer.read', 'self'),
      ('salesperson', 'customer.update', 'self'),
      ('salesperson', 'dashboard.read', 'self'),
      ('salesperson', 'expense_request.create', 'self'),
      ('salesperson', 'expense_request.read', 'self'),
      ('salesperson', 'expense_request.submit', 'self'),
      ('salesperson', 'marketing_lead.read', 'self'),
      ('salesperson', 'marketing_lead.update', 'self'),
      ('salesperson', 'marketing_page.read', 'self'),
      ('salesperson', 'project.create', 'self'),
      ('salesperson', 'project.delete', 'self'),
      ('salesperson', 'project.read', 'self'),
      ('salesperson', 'project.update', 'self'),
      ('salesperson', 'task_center.read', 'self'),
      ('design_manage', 'project_acceptance.read', 'all'),
      ('design_manage', 'expense_request.approve_manager', 'department'),
      ('design_manage', 'expense_request.read', 'department'),
      ('design_manage', 'project.read', 'department'),
      ('design_manage', 'dashboard.read', 'self'),
      ('design_manage', 'expense_request.create', 'self'),
      ('design_manage', 'expense_request.submit', 'self'),
      ('design_manage', 'project_procedure.adjust', 'self'),
      ('design_manage', 'project_procedure.assign', 'self'),
      ('design_manage', 'project_procedure.read', 'self'),
      ('design_manage', 'task_center.read', 'self'),
      ('designer', 'dashboard.read', 'self'),
      ('designer', 'expense_request.create', 'self'),
      ('designer', 'expense_request.read', 'self'),
      ('designer', 'expense_request.submit', 'self'),
      ('designer', 'project.read', 'self'),
      ('designer', 'project.update', 'self'),
      ('designer', 'project_log.create', 'self'),
      ('designer', 'project_procedure.read', 'self'),
      ('designer', 'project_acceptance.read', 'self'),
      ('designer', 'task_center.read', 'self'),
      ('engineering_manager', 'project_acceptance.manage', 'all'),
      ('engineering_manager', 'project_acceptance.reject', 'all'),
      ('engineering_manager', 'project_acceptance.review', 'all'),
      ('engineering_manager', 'project_acceptance.submit', 'all'),
      ('engineering_manager', 'project.read', 'all'),
      ('engineering_manager', 'project.update', 'all'),
      ('engineering_manager', 'expense_request.approve_manager', 'department'),
      ('engineering_manager', 'expense_request.read', 'department'),
      ('engineering_manager', 'project_acceptance.create', 'department'),
      ('engineering_manager', 'project_acceptance.read', 'department'),
      ('engineering_manager', 'project_log.create', 'department'),
      ('engineering_manager', 'project_procedure.adjust', 'department'),
      ('engineering_manager', 'project_procedure.assign', 'department'),
      ('engineering_manager', 'project_procedure.read', 'department'),
      ('engineering_manager', 'customer.phone.call', 'self'),
      ('engineering_manager', 'customer.phone.view', 'self'),
      ('engineering_manager', 'dashboard.read', 'self'),
      ('engineering_manager', 'employee.read', 'self'),
      ('engineering_manager', 'expense_request.create', 'self'),
      ('engineering_manager', 'expense_request.submit', 'self'),
      ('engineering_manager', 'project_acceptance.update_own', 'self'),
      ('engineering_manager', 'task_center.read', 'self'),
      ('construction_supervisor', 'project_acceptance.create', 'department'),
      ('construction_supervisor', 'project_acceptance.submit', 'department'),
      ('construction_supervisor', 'project_acceptance.update_own', 'department'),
      ('construction_supervisor', 'project.read', 'department'),
      ('construction_supervisor', 'dashboard.read', 'self'),
      ('construction_supervisor', 'expense_request.create', 'self'),
      ('construction_supervisor', 'expense_request.read', 'self'),
      ('construction_supervisor', 'expense_request.submit', 'self'),
      ('construction_supervisor', 'project_acceptance.read', 'self'),
      ('construction_supervisor', 'project_log.create', 'self'),
      ('construction_supervisor', 'project_procedure.adjust', 'self'),
      ('construction_supervisor', 'project_procedure.assign', 'self'),
      ('construction_supervisor', 'project_procedure.complete', 'self'),
      ('construction_supervisor', 'project_procedure.read', 'self'),
      ('construction_supervisor', 'project.update', 'self'),
      ('construction_supervisor', 'social_video_transcription.create', 'self'),
      ('construction_supervisor', 'social_video_transcription.manage', 'self'),
      ('construction_supervisor', 'task_center.read', 'self'),
      ('construction_worker', 'project_log.create', 'self'),
      ('construction_worker', 'project_procedure.assignee', 'self'),
      ('construction_worker', 'task_center.read', 'self'),
      ('finance_base', 'expense_request.approve_finance', 'all'),
      ('finance_base', 'expense_request.pay', 'all'),
      ('finance_base', 'expense_request.read', 'all'),
      ('finance_base', 'finance.budget.manage', 'all'),
      ('finance_base', 'finance.budget.view', 'all'),
      ('finance_base', 'finance.closing.manage', 'all'),
      ('finance_base', 'finance.closing.read', 'all'),
      ('finance_base', 'finance.cost-allocation.manage', 'all'),
      ('finance_base', 'finance.cost-category.manage', 'all'),
      ('finance_base', 'finance.cost-category.view', 'all'),
      ('finance_base', 'finance.dashboard.view', 'all'),
      ('finance_base', 'finance.expense.pay', 'all'),
      ('finance_base', 'finance.expense.review', 'all'),
      ('finance_base', 'finance.ledger.view', 'all'),
      ('finance_base', 'finance.payment.confirm', 'all'),
      ('finance_base', 'finance.payment.create', 'all'),
      ('finance_base', 'finance.receivable.manage', 'all'),
      ('finance_base', 'finance.receivable.view', 'all'),
      ('finance_base', 'finance.reconciliation.manage', 'all'),
      ('finance_base', 'finance.reports.export', 'all'),
      ('finance_base', 'finance.reports.read', 'all'),
      ('finance_base', 'finance.view', 'all'),
      ('finance_base', 'project_acceptance.read', 'all'),
      ('finance_base', 'project.read', 'all'),
      ('finance_base', 'project_referral.manage', 'all'),
      ('finance_base', 'project_referral.read', 'all'),
      ('finance_base', 'wechat_pay.notify.read', 'all'),
      ('finance_base', 'wechat_pay.order.read', 'all'),
      ('finance_base', 'dashboard.read', 'self'),
      ('finance_base', 'expense_request.create', 'self'),
      ('finance_base', 'expense_request.submit', 'self'),
      ('finance_base', 'task_center.read', 'self'),
      ('cashier', 'expense_request.approve_finance', 'all'),
      ('cashier', 'expense_request.pay', 'all'),
      ('cashier', 'expense_request.read', 'all'),
      ('cashier', 'finance.expense.pay', 'all'),
      ('cashier', 'finance.expense.review', 'all'),
      ('cashier', 'finance.ledger.view', 'all'),
      ('cashier', 'finance.payment.create', 'all'),
      ('cashier', 'finance.receivable.manage', 'all'),
      ('cashier', 'finance.receivable.view', 'all'),
      ('cashier', 'finance.view', 'all'),
      ('cashier', 'task_center.read', 'department'),
      ('cashier', 'dashboard.read', 'self'),
      ('cashier', 'finance.budget.view', 'self'),
      ('cashier', 'finance.cost-allocation.manage', 'self'),
      ('cashier', 'finance.cost-category.manage', 'self'),
      ('cashier', 'finance.cost-category.view', 'self'),
      ('cashier', 'finance.dashboard.view', 'self')
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_expected_non_admin_permission_count
  FROM non_admin_permission_defaults;

  WITH non_admin_permission_defaults AS (
    SELECT
      defaults.role_code,
      defaults.permission_code,
      defaults.access_scope
    FROM public.tenant_templates AS template
    CROSS JOIN LATERAL pg_catalog.jsonb_to_recordset(
      template.payload -> 'role_permissions'
    ) AS defaults(
      role_code text,
      permission_code text,
      access_scope text
    )
    WHERE template.id = v_template_id
  ),
  "resolved_non_admin_permissions" AS (
    SELECT
      role.id AS role_id,
      permission.id AS permission_id,
      defaults.access_scope
    FROM non_admin_permission_defaults AS defaults
    INNER JOIN public.roles AS role
      ON role.tenant_id = p_tenant_id
     AND role.code = defaults.role_code
     AND role.status = 'active'
    INNER JOIN public.permissions AS permission
      ON permission.code = defaults.permission_code
     AND permission.status = 'active'
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_resolved_non_admin_permission_count
  FROM resolved_non_admin_permissions;

  IF v_expected_non_admin_permission_count <>
    v_resolved_non_admin_permission_count
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TENANT_TEMPLATE_PERMISSION_MISSING';
  END IF;

  WITH non_admin_permission_defaults AS (
    SELECT
      defaults.role_code,
      defaults.permission_code,
      defaults.access_scope
    FROM public.tenant_templates AS template
    CROSS JOIN LATERAL pg_catalog.jsonb_to_recordset(
      template.payload -> 'role_permissions'
    ) AS defaults(
      role_code text,
      permission_code text,
      access_scope text
    )
    WHERE template.id = v_template_id
  ),
  resolved_non_admin_permissions AS (
    SELECT
      role.id AS role_id,
      permission.id AS permission_id,
      defaults.access_scope
    FROM non_admin_permission_defaults AS defaults
    INNER JOIN public.roles AS role
      ON role.tenant_id = p_tenant_id
     AND role.code = defaults.role_code
     AND role.status = 'active'
    INNER JOIN public.permissions AS permission
      ON permission.code = defaults.permission_code
     AND permission.status = 'active'
  )
  INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
  SELECT role_id, permission_id, access_scope
  FROM resolved_non_admin_permissions
  ON CONFLICT (role_id, permission_id) DO UPDATE SET
    access_scope = EXCLUDED.access_scope;

  INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
  SELECT v_admin_role_id, permission.id, 'all'
  FROM public.permissions AS permission
  WHERE permission.status = 'active'
    AND permission.code NOT LIKE 'platform.%'
  ON CONFLICT (role_id, permission_id) DO UPDATE SET
    access_scope = EXCLUDED.access_scope;

  IF v_admin_name IS NOT NULL THEN
    SELECT department.id
    INTO v_admin_department_id
    FROM public.tenant_departments AS department
    WHERE department.tenant_id = p_tenant_id
      AND department.code = 'EXEC_OFFICE'
    LIMIT 1;

    SELECT post.id
    INTO v_admin_post_id
    FROM public.posts AS post
    WHERE post.tenant_id = p_tenant_id
      AND post.code = 'SYSTEM_ADMIN'
    LIMIT 1;

    IF v_admin_department_id IS NULL OR v_admin_post_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TENANT_INITIALIZATION_ADMIN_ORGANIZATION_MISSING';
    END IF;

    INSERT INTO public.employees (
      tenant_id,
      name,
      phone,
      user_id,
      tenant_department_id,
      post_id,
      status,
      avatar
    )
    VALUES (
      p_tenant_id,
      v_admin_name,
      v_admin_phone,
      NULL,
      v_admin_department_id,
      v_admin_post_id,
      'active',
      NULL
    )
    RETURNING employees.id INTO v_admin_employee_id;

    INSERT INTO public.employee_roles (employee_id, role_id)
    VALUES (v_admin_employee_id, v_admin_role_id)
    ON CONFLICT (employee_id, role_id) DO NOTHING;
  ELSE
    v_admin_employee_id := NULL;
    v_admin_role_id := NULL;
  END IF;

  v_initialization := pg_catalog.jsonb_build_object(
    'template_code', 'default_decoration_company',
    'template_version', '2026.08.30',
    'departments_count', v_departments_count,
    'posts_count', v_posts_count,
    'roles_count', v_roles_count,
    'admin_employee_id', v_admin_employee_id,
    'admin_role_id', v_admin_role_id
  );

  INSERT INTO public.tenant_template_applications (
    tenant_id,
    template_id,
    template_code,
    template_version,
    applied_by_employee_id,
    result
  )
  VALUES (
    p_tenant_id,
    v_template_id,
    'default_decoration_company',
    '2026.08.30',
    p_operator_employee_id,
    v_initialization
  );

  RETURN v_initialization;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.create_tenant_with_default_template(
  p_name text,
  p_slug text,
  p_status text DEFAULT 'active',
  p_address text DEFAULT NULL,
  p_address_title text DEFAULT NULL,
  p_address_poi_id text DEFAULT NULL,
  p_address_province text DEFAULT NULL,
  p_address_city text DEFAULT NULL,
  p_address_district text DEFAULT NULL,
  p_address_adcode text DEFAULT NULL,
  p_address_latitude numeric DEFAULT NULL,
  p_address_longitude numeric DEFAULT NULL,
  p_address_source text DEFAULT NULL,
  p_address_confidence numeric DEFAULT NULL,
  p_address_confirmed_at timestamptz DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_admin_name text DEFAULT NULL,
  p_admin_phone text DEFAULT NULL,
  p_admin_auth_user_id uuid DEFAULT NULL,
  p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_name text := NULLIF(pg_catalog.btrim(COALESCE(p_name, '')), '');
  v_slug text := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_slug, '')));
  v_admin_name text := NULLIF(pg_catalog.btrim(COALESCE(p_admin_name, '')), '');
  v_admin_phone text := NULLIF(pg_catalog.btrim(COALESCE(p_admin_phone, '')), '');
  v_admin_employee_id uuid;
  v_constraint_name text;
  v_tenant public.tenants%ROWTYPE;
  v_initialization jsonb;
BEGIN
  IF v_name IS NULL
    OR pg_catalog.char_length(v_name) > 100
    OR p_slug IS NULL
    OR p_slug IS DISTINCT FROM v_slug
    OR pg_catalog.char_length(v_slug) NOT BETWEEN 2 AND 64
    OR v_slug !~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
    OR p_status IS NULL
    OR p_status NOT IN ('active', 'suspended')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_CREATION_INPUT_INVALID';
  END IF;

  IF (v_admin_name IS NULL) <> (v_admin_phone IS NULL)
    OR (v_admin_name IS NOT NULL AND pg_catalog.char_length(v_admin_name) > 50)
    OR (v_admin_phone IS NOT NULL AND v_admin_phone !~ '^1[3-9][0-9]{9}$')
    OR (p_admin_auth_user_id IS NOT NULL AND v_admin_name IS NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_INITIALIZATION_INPUT_INVALID';
  END IF;

  IF v_admin_phone IS NOT NULL THEN
    PERFORM public.lock_tenant_onboarding_employee_phones(
      ARRAY[v_admin_phone]::text[]
    );

    PERFORM employee.id
    FROM public.employees AS employee
    WHERE employee.status = 'active'
      AND employee.phone IS NOT NULL
      AND pg_catalog.btrim(employee.phone) <> ''
      AND pg_catalog.btrim(employee.phone) = v_admin_phone
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23505',
        MESSAGE = 'TENANT_ADMIN_PHONE_EXISTS';
    END IF;
  END IF;

  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE tenant.slug = v_slug
  LIMIT 1
  FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'TENANT_SLUG_EXISTS';
  END IF;

  BEGIN
    INSERT INTO public.tenants (
      name,
      slug,
      status,
      address,
      address_title,
      address_poi_id,
      address_province,
      address_city,
      address_district,
      address_adcode,
      address_latitude,
      address_longitude,
      address_source,
      address_confidence,
      address_confirmed_at,
      contact_name,
      contact_phone
    )
    VALUES (
      v_name,
      v_slug,
      p_status,
      p_address,
      p_address_title,
      p_address_poi_id,
      p_address_province,
      p_address_city,
      p_address_district,
      p_address_adcode,
      p_address_latitude,
      p_address_longitude,
      p_address_source,
      p_address_confidence,
      p_address_confirmed_at,
      p_contact_name,
      p_contact_phone
    )
    RETURNING tenants.* INTO v_tenant;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'tenants_slug_key' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'TENANT_SLUG_EXISTS';
      END IF;
      RAISE;
  END;

  v_initialization := public.initialize_default_decoration_tenant(
    v_tenant.id,
    v_admin_name,
    v_admin_phone,
    p_operator_employee_id
  );

  IF v_initialization ->> 'template_code' <>
      'default_decoration_company'
    OR v_initialization ->> 'template_version' <> '2026.08.30'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
  END IF;

  IF p_admin_auth_user_id IS NOT NULL THEN
    v_admin_employee_id := NULLIF(
      v_initialization ->> 'admin_employee_id',
      ''
    )::uuid;

    IF v_admin_employee_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
    END IF;

    UPDATE public.employees AS employee
    SET user_id = p_admin_auth_user_id
    WHERE employee.id = v_admin_employee_id
      AND employee.tenant_id = v_tenant.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'tenant', pg_catalog.to_jsonb(v_tenant),
    'initialization', v_initialization
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_default_template(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_with_default_template(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_with_default_template(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_with_default_template(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_default_template(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  numeric,
  timestamptz,
  text,
  text,
  text,
  text,
  uuid,
  uuid
) TO service_role;

COMMIT;
