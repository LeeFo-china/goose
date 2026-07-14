-- Convert an approved onboarding application into a fully initialized tenant in
-- one transaction. Rollback: revoke/drop the approval and region-path functions,
-- drop the employee phone trigger, revoke/drop its trigger/lock functions, and
-- drop employees_active_normalized_phone_idx before dropping the initializer.
-- Converted business data must be preserved or reversed by a separately reviewed
-- forward migration; never delete converted tenants as part of a schema rollback.

BEGIN;

CREATE INDEX IF NOT EXISTS employees_active_normalized_phone_idx
  ON public.employees ((pg_catalog.btrim(phone)))
  WHERE status = 'active'
    AND phone IS NOT NULL
    AND pg_catalog.btrim(phone) <> '';

CREATE OR REPLACE FUNCTION public.lock_tenant_onboarding_employee_phones(
  p_phones text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_phone text;
BEGIN
  FOR v_phone IN
    SELECT normalized.normalized_phone
    FROM (
      SELECT DISTINCT pg_catalog.btrim(input.phone) AS normalized_phone
      FROM pg_catalog.unnest(COALESCE(p_phones, '{}'::text[]))
        AS input(phone)
      WHERE input.phone IS NOT NULL
        AND pg_catalog.btrim(input.phone) <> ''
    ) AS normalized
    ORDER BY normalized_phone ASC
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'tenant-onboarding-admin-phone:' || v_phone,
        0
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_tenant_onboarding_employee_phones(text[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_tenant_onboarding_employee_phones(text[])
  FROM anon;
REVOKE ALL ON FUNCTION public.lock_tenant_onboarding_employee_phones(text[])
  FROM authenticated;
REVOKE ALL ON FUNCTION public.lock_tenant_onboarding_employee_phones(text[])
  FROM service_role;

CREATE OR REPLACE FUNCTION public.lock_active_employee_phone_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_phones text[] := '{}'::text[];
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.status = 'active'
      AND OLD.phone IS NOT NULL
      AND pg_catalog.btrim(OLD.phone) <> ''
    THEN
      v_phones := pg_catalog.array_append(v_phones, OLD.phone);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.status = 'active'
      AND NEW.phone IS NOT NULL
      AND pg_catalog.btrim(NEW.phone) <> ''
    THEN
      v_phones := pg_catalog.array_append(v_phones, NEW.phone);
    END IF;
  END IF;

  PERFORM public.lock_tenant_onboarding_employee_phones(v_phones);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_active_employee_phone_mutation()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_active_employee_phone_mutation()
  FROM anon;
REVOKE ALL ON FUNCTION public.lock_active_employee_phone_mutation()
  FROM authenticated;
REVOKE ALL ON FUNCTION public.lock_active_employee_phone_mutation()
  FROM service_role;

DROP TRIGGER IF EXISTS tr_lock_active_employee_phone_mutation
  ON public.employees;
CREATE TRIGGER tr_lock_active_employee_phone_mutation
  BEFORE INSERT OR UPDATE OF phone, status OR DELETE
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_active_employee_phone_mutation();

CREATE OR REPLACE FUNCTION public.resolve_tenant_onboarding_region_paths(
  p_service_region_codes text[]
)
RETURNS TABLE(
  service_code text,
  adcode text,
  name text,
  level text,
  depth integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  WITH RECURSIVE requested_codes AS (
    SELECT DISTINCT input.code AS service_code
    FROM pg_catalog.unnest(COALESCE(p_service_region_codes, '{}'::text[]))
      AS input(code)
  ),
  region_walk AS (
    SELECT
      requested.service_code,
      exact.adcode AS current_adcode,
      exact.level AS current_level,
      exact.parent_adcode AS current_parent_adcode,
      ARRAY[exact.adcode]::text[] AS path_adcodes,
      ARRAY[exact.name]::text[] AS path_names,
      ARRAY[exact.level]::text[] AS path_levels,
      1 AS depth,
      CASE
        WHEN exact.level = 'province' AND exact.parent_adcode IS NULL
          THEN 'prefix'
        WHEN exact.level = 'province' THEN 'exact_only'
        WHEN exact.parent_adcode IS NULL THEN 'prefix'
        ELSE 'continue'
      END AS outcome
    FROM requested_codes AS requested
    JOIN public.administrative_areas AS exact
      ON exact.adcode = requested.service_code
     AND exact.status = 'active'

    UNION ALL

    SELECT
      walk.service_code,
      parent.adcode,
      parent.level,
      parent.parent_adcode,
      CASE
        WHEN parent.adcode IS NOT NULL
          AND NOT (parent.adcode = ANY (walk.path_adcodes))
          AND (
            (walk.current_level = 'district' AND parent.level = 'city')
            OR (walk.current_level = 'city' AND parent.level = 'province')
          )
          THEN pg_catalog.array_append(walk.path_adcodes, parent.adcode)
        ELSE walk.path_adcodes
      END,
      CASE
        WHEN parent.adcode IS NOT NULL
          AND NOT (parent.adcode = ANY (walk.path_adcodes))
          AND (
            (walk.current_level = 'district' AND parent.level = 'city')
            OR (walk.current_level = 'city' AND parent.level = 'province')
          )
          THEN pg_catalog.array_append(walk.path_names, parent.name)
        ELSE walk.path_names
      END,
      CASE
        WHEN parent.adcode IS NOT NULL
          AND NOT (parent.adcode = ANY (walk.path_adcodes))
          AND (
            (walk.current_level = 'district' AND parent.level = 'city')
            OR (walk.current_level = 'city' AND parent.level = 'province')
          )
          THEN pg_catalog.array_append(walk.path_levels, parent.level)
        ELSE walk.path_levels
      END,
      walk.depth + 1,
      CASE
        WHEN parent.adcode IS NULL THEN 'prefix'
        WHEN parent.adcode = ANY (walk.path_adcodes) THEN 'exact_only'
        WHEN NOT (
          (walk.current_level = 'district' AND parent.level = 'city')
          OR (walk.current_level = 'city' AND parent.level = 'province')
        ) THEN 'exact_only'
        WHEN parent.level = 'province'
          AND parent.parent_adcode IS NOT NULL THEN 'exact_only'
        WHEN parent.level = 'province' THEN 'prefix'
        WHEN parent.parent_adcode IS NULL THEN 'prefix'
        WHEN walk.depth + 1 >= 3 THEN 'exact_only'
        ELSE 'continue'
      END
    FROM region_walk AS walk
    LEFT JOIN public.administrative_areas AS parent
      ON parent.adcode = walk.current_parent_adcode
     AND parent.status = 'active'
    WHERE walk.outcome = 'continue'
  ),
  output_paths AS (
    SELECT
      walk.service_code,
      CASE
        WHEN walk.outcome = 'exact_only' THEN walk.path_adcodes[1:1]
        ELSE walk.path_adcodes
      END AS path_adcodes,
      CASE
        WHEN walk.outcome = 'exact_only' THEN walk.path_names[1:1]
        ELSE walk.path_names
      END AS path_names,
      CASE
        WHEN walk.outcome = 'exact_only' THEN walk.path_levels[1:1]
        ELSE walk.path_levels
      END AS path_levels
    FROM region_walk AS walk
    WHERE walk.outcome <> 'continue'
  )
  SELECT
    output.service_code,
    output.path_adcodes[path_index],
    output.path_names[path_index],
    output.path_levels[path_index],
    path_index::integer
  FROM output_paths AS output
  CROSS JOIN LATERAL pg_catalog.generate_subscripts(
    output.path_adcodes,
    1
  ) AS indexes(path_index)
  ORDER BY output.service_code ASC, indexes.path_index ASC;
$$;

REVOKE ALL ON FUNCTION public.resolve_tenant_onboarding_region_paths(text[])
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_tenant_onboarding_region_paths(text[])
  FROM anon;
REVOKE ALL ON FUNCTION public.resolve_tenant_onboarding_region_paths(text[])
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_onboarding_region_paths(text[])
  TO service_role;

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
  v_departments_count integer := 0;
  v_posts_count integer := 0;
  v_roles_count integer := 0;
  v_admin_department_id uuid;
  v_admin_post_id uuid;
  v_admin_employee_id uuid;
  v_admin_role_id uuid;
  v_template_id uuid;
  v_initialization jsonb;
BEGIN
  IF p_tenant_id IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_admin_name, '')), '') IS NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(p_admin_phone, '')), '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_INITIALIZATION_INPUT_INVALID';
  END IF;

  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'TENANT_INITIALIZATION_TENANT_NOT_FOUND';
  END IF;

  WITH department_defaults(code, alias_name) AS (
    VALUES
      ('BOARD', '董事会'),
      ('EXEC_OFFICE', '总裁办/总经理办公室'),
      ('SALES', '销售部/客户部'),
      ('MARKETING', '市场部'),
      ('DESIGN', '设计部'),
      ('PROJECT', '工程部'),
      ('PROCURE', '采购部'),
      ('AFTER_SALE', '售后部/维保部'),
      ('PRODUCT', '产品部'),
      ('TECH', '技术研发部'),
      ('IT', '信息技术部'),
      ('BIM_CENTER', 'BIM中心'),
      ('SUPPLY_CHAIN', '供应链管理部'),
      ('LOGISTICS', '物流部'),
      ('WAREHOUSE', '仓储部'),
      ('FACTORY', '工厂/生产基地'),
      ('PROJECT_MGT', '工程项目管理部'),
      ('QUALITY_SUPERVISION', '质量监理部'),
      ('SAFETY', '安全监察部'),
      ('ACCEPTANCE', '竣工验收部'),
      ('MAINTENANCE', '维修保养部'),
      ('ADMIN', '行政人事部'),
      ('FINANCE', '财务部'),
      ('LEGAL', '法务部'),
      ('COMPLIANCE', '合规部'),
      ('INTERNAL_AUDIT', '内审部'),
      ('BRAND', '品牌管理部'),
      ('PUBLIC_RELATIONS', '公关部'),
      ('DIGITAL_MARKETING', '数字营销部'),
      ('SELF_MEDIA', '自媒体部'),
      ('CHANNEL', '渠道部'),
      ('COMMUNITY', '社区运营部'),
      ('CUSTOMER_SERVICE', '客服部'),
      ('CUSTOMER_SUCCESS', '客户成功部'),
      ('COMPLAINTS', '客诉处理部'),
      ('STRATEGY', '战略发展部'),
      ('INVESTOR', '投资者关系部'),
      ('BUSINESS_DEV', '商务拓展部'),
      ('PMO', '项目管理办公室'),
      ('TRAINING', '培训部'),
      ('OPERATIONS', '运营部'),
      ('DATA_CENTER', '数据中心')
  ),
  upserted_departments AS (
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
      template.id,
      department_defaults.code,
      department_defaults.alias_name,
      COALESCE(existing.enabled, false),
      COALESCE(template.sort, 0)
    FROM department_defaults
    JOIN public.department_templates AS template
      ON template.code = department_defaults.code
    LEFT JOIN public.tenant_departments AS existing
      ON existing.tenant_id = p_tenant_id
     AND existing.code = department_defaults.code
    ON CONFLICT (tenant_id, code) DO UPDATE SET
      template_id = EXCLUDED.template_id,
      alias_name = EXCLUDED.alias_name,
      enabled = public.tenant_departments.enabled,
      sort = EXCLUDED.sort
    RETURNING tenant_departments.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_departments_count
  FROM upserted_departments;

  WITH post_defaults(code, name, sort) AS (
    VALUES
      ('GENERAL_MANAGER', '总经理', 1),
      ('OPERATIONS_DIRECTOR', '运营总监', 2),
      ('GENERAL_MANAGER_ASSISTANT', '总经理助理', 3),
      ('HR_ADMIN_MANAGER', '行政人事主管', 4),
      ('HR_SPECIALIST', '人事专员', 5),
      ('ADMIN_SPECIALIST', '行政专员', 6),
      ('MARKETING_DIRECTOR', '营销总监', 7),
      ('MARKETING_MANAGER', '市场经理', 8),
      ('NEW_MEDIA_OPERATOR', '新媒体运营', 9),
      ('VIDEO_EDITOR', '摄影剪辑', 10),
      ('LIVE_STREAM_OPERATOR', '直播运营', 11),
      ('AD_OPERATOR', '投流专员', 12),
      ('CUSTOMER_INVITER', '客服邀约专员', 13),
      ('SALES_MANAGER', '销售经理', 14),
      ('SALES_CONSULTANT', '客户经理', 15),
      ('TELESALES', '电话销售', 16),
      ('CHANNEL_MANAGER', '渠道经理', 17),
      ('DESIGN_DIRECTOR', '设计总监', 18),
      ('CHIEF_DESIGNER', '主案设计师', 19),
      ('INTERIOR_DESIGNER', '设计师', 20),
      ('ASSISTANT_DESIGNER', '助理设计师', 21),
      ('RENDERING_DESIGNER', '效果图设计师', 22),
      ('ENGINEERING_DIRECTOR', '工程总监', 23),
      ('PROJECT_MANAGER', '项目经理', 24),
      ('CONSTRUCTION_SUPER', '工程监理', 25),
      ('QUALITY_INSPECTOR', '质检专员', 26),
      ('SAFETY_OFFICER', '安全员', 27),
      ('HYDROPOWER_FOREMAN', '水电工长', 28),
      ('TILE_FOREMAN', '瓦工工长', 29),
      ('CARPENTRY_FOREMAN', '木工工长', 30),
      ('PAINT_FOREMAN', '油漆工长', 31),
      ('MAINTENANCE_WORKER', '维修工', 32),
      ('PROCUREMENT_MANAGER', '采购主管', 33),
      ('PROCURE_OFFICER', '采购专员', 34),
      ('MATERIAL_CLERK', '材料员', 35),
      ('WAREHOUSE_KEEPER', '仓库管理员', 36),
      ('DELIVERY_COORDINATOR', '配送协调员', 37),
      ('FINANCE_MANAGER', '财务经理', 38),
      ('FINANCE_ACCOUNTANT', '会计', 39),
      ('CASHIER', '出纳', 40),
      ('COST_ACCOUNTANT', '成本核算员', 41),
      ('CUSTOMER_SERVICE_MANAGER', '客服主管', 42),
      ('CUSTOMER_SERVICE', '客服专员', 43),
      ('AFTER_SALES_SPECIALIST', '售后专员', 44),
      ('CUSTOMER_RETURN_VISITOR', '回访专员', 45),
      ('SYSTEM_ADMIN', '系统管理员', 46),
      ('DATA_SPECIALIST', '数据专员', 47),
      ('IT_SUPPORT', 'IT技术支持', 48)
  ),
  upserted_posts AS (
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
      post_defaults.code,
      post_defaults.name,
      'fixed',
      1,
      post_defaults.sort
    FROM post_defaults
    ON CONFLICT (tenant_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      salary_type = EXCLUDED.salary_type,
      status = EXCLUDED.status,
      sort = EXCLUDED.sort
    RETURNING posts.id
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_posts_count
  FROM upserted_posts;

  WITH role_defaults(code, name, description) AS (
    VALUES
      (
        'system_admin',
        '系统管理员',
        '租户管理员，拥有当前租户全部后台管理权限'
      ),
      (
        'employee_base',
        '员工基础角色',
        '普通员工的默认基础权限模板'
      ),
      (
        'finance_base',
        '财务基础角色',
        '财务人员的默认基础权限模板'
      ),
      (
        'design_manage',
        '设计主管',
        '设计主管的部门级客户查看与负责人分配权限模板'
      )
  ),
  upserted_roles AS (
    INSERT INTO public.roles (
      tenant_id,
      code,
      name,
      description,
      status
    )
    SELECT
      p_tenant_id,
      role_defaults.code,
      role_defaults.name,
      role_defaults.description,
      'active'
    FROM role_defaults
    ON CONFLICT (tenant_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      status = EXCLUDED.status
    RETURNING roles.id, roles.code
  )
  SELECT pg_catalog.count(*)::integer
  INTO v_roles_count
  FROM upserted_roles;

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

  INSERT INTO public.role_permissions (
    role_id,
    permission_id,
    access_scope
  )
  SELECT
    v_admin_role_id,
    permission.id,
    'all'
  FROM public.permissions AS permission
  WHERE permission.status = 'active'
  ON CONFLICT (role_id, permission_id) DO UPDATE SET
    access_scope = EXCLUDED.access_scope;

  SELECT department.id
  INTO v_admin_department_id
  FROM public.tenant_departments AS department
  WHERE department.tenant_id = p_tenant_id
    AND department.code = 'ADMIN'
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
    pg_catalog.btrim(p_admin_name),
    pg_catalog.btrim(p_admin_phone),
    NULL,
    v_admin_department_id,
    v_admin_post_id,
    'active',
    NULL
  )
  ON CONFLICT (tenant_id, phone)
    WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    tenant_department_id = EXCLUDED.tenant_department_id,
    post_id = EXCLUDED.post_id,
    status = EXCLUDED.status
  RETURNING employees.id INTO v_admin_employee_id;

  INSERT INTO public.employee_roles (employee_id, role_id)
  VALUES (v_admin_employee_id, v_admin_role_id)
  ON CONFLICT (employee_id, role_id) DO NOTHING;

  SELECT template.id
  INTO v_template_id
  FROM public.tenant_templates AS template
  WHERE template.code = 'default_decoration_company'
    AND template.version = '2026.05.10'
  LIMIT 1;

  v_initialization := pg_catalog.jsonb_build_object(
    'template_code', 'default_decoration_company',
    'template_version', '2026.05.10',
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
    '2026.05.10',
    p_operator_employee_id,
    v_initialization
  )
  ON CONFLICT (tenant_id, template_code, template_version) DO UPDATE SET
    template_id = EXCLUDED.template_id,
    applied_by_employee_id = EXCLUDED.applied_by_employee_id,
    result = EXCLUDED.result;

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
GRANT EXECUTE ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_tenant_onboarding_application(
  p_application_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_tenant_slug text,
  p_final_partner_id uuid DEFAULT NULL,
  p_attribution_source_type text DEFAULT NULL,
  p_review_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_application public.tenant_onboarding_applications%ROWTYPE;
  v_tenant_id uuid;
  v_binding_id uuid;
  v_profile_id uuid;
  v_initialization jsonb;
  v_credit_code text;
  v_tenant_slug text;
  v_review_remark text;
  v_ancestor_codes text[] := '{}'::text[];
  v_candidate_count integer := 0;
  v_best_tie_count integer := 0;
  v_best_partner_id uuid;
  v_fresh_invite_partner_id uuid;
  v_fresh_eligible_partner_ids uuid[] := '{}'::uuid[];
  v_region_best_partner_ids uuid[] := '{}'::uuid[];
  v_requested_region_count integer := 0;
  v_resolved_region_count integer := 0;
  v_idempotent_binding_count integer := 0;
  v_before_assist_status text;
  v_after_assist_status text;
  v_constraint_name text;
BEGIN
  SELECT application.*
  INTO v_application
  FROM public.tenant_onboarding_applications AS application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'application_not_found');
  END IF;

  IF v_application.status = 'approved' THEN
    IF v_application.converted_tenant_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'status',
        'application_state_conflict'
      );
    END IF;

    SELECT profile.id
    INTO v_profile_id
    FROM public.tenant_service_provider_profiles AS profile
    WHERE profile.tenant_id = v_application.converted_tenant_id
    LIMIT 1;

    -- Approved idempotency integrity start.
    -- Approved idempotency is fail-closed: the durable binding must still match
    -- the application attribution snapshot instead of returning partial state.
    IF v_application.final_partner_id IS NOT NULL THEN
      IF v_application.attribution_source_type IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'status',
          'application_state_conflict'
        );
      END IF;

      SELECT pg_catalog.count(*)::integer
      INTO v_idempotent_binding_count
      FROM public.tenant_partner_bindings AS binding
      WHERE binding.tenant_id = v_application.converted_tenant_id
        AND (
          binding.source_id = v_application.id::text
          OR binding.status = 'active'
        );

      IF v_idempotent_binding_count <> 1 THEN
        RETURN pg_catalog.jsonb_build_object(
          'status',
          'application_state_conflict'
        );
      END IF;

      SELECT binding.id
      INTO v_binding_id
      FROM public.tenant_partner_bindings AS binding
      WHERE binding.tenant_id = v_application.converted_tenant_id
        AND binding.partner_id = v_application.final_partner_id
        AND binding.source_type = v_application.attribution_source_type
        AND binding.source_id = v_application.id::text
        AND binding.status = 'active'
        AND binding.invite_code_id IS NOT DISTINCT FROM CASE
          WHEN v_application.attribution_source_type = 'invite_code'
            THEN v_application.invite_code_id
          ELSE NULL
        END
        AND (
          v_application.attribution_source_type <> 'invite_code'
          OR v_application.invite_code_id IS NOT NULL
        )
      LIMIT 1;

      IF v_binding_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'status',
          'application_state_conflict'
        );
      END IF;
    ELSIF v_application.final_partner_id IS NULL THEN
      IF v_application.attribution_source_type IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
          'status',
          'application_state_conflict'
        );
      END IF;

      SELECT pg_catalog.count(*)::integer
      INTO v_idempotent_binding_count
      FROM public.tenant_partner_bindings AS binding
      WHERE binding.tenant_id = v_application.converted_tenant_id
        AND (
          binding.source_id = v_application.id::text
          OR binding.status = 'active'
        );

      IF v_idempotent_binding_count <> 0 THEN
        RETURN pg_catalog.jsonb_build_object(
          'status',
          'application_state_conflict'
        );
      END IF;
      v_binding_id := NULL;
    END IF;
    -- Approved idempotency integrity end.

    SELECT template_application.result
    INTO v_initialization
    FROM public.tenant_template_applications AS template_application
    WHERE template_application.tenant_id = v_application.converted_tenant_id
      AND template_application.template_code = 'default_decoration_company'
      AND template_application.template_version = '2026.05.10'
    LIMIT 1;

    IF v_profile_id IS NULL OR v_initialization IS NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'status',
        'application_state_conflict'
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'approved',
      'application_id', v_application.id,
      'tenant_id', v_application.converted_tenant_id,
      'binding_id', v_binding_id,
      'profile_id', v_profile_id,
      'initialization', v_initialization,
      'idempotent', true
    );
  END IF;

  IF v_application.status NOT IN (
    'submitted',
    'reviewing'
  ) OR v_application.converted_tenant_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status',
      'application_state_conflict'
    );
  END IF;

  IF v_application.version IS DISTINCT FROM p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object(
      'status',
      'application_version_conflict'
    );
  END IF;

  v_tenant_slug := pg_catalog.lower(
    pg_catalog.btrim(COALESCE(p_tenant_slug, ''))
  );
  IF p_tenant_slug IS NULL
    OR p_tenant_slug IS DISTINCT FROM v_tenant_slug
    OR pg_catalog.char_length(v_tenant_slug) NOT BETWEEN 2 AND 64
    OR v_tenant_slug !~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_TENANT_SLUG_INVALID';
  END IF;

  IF (
    p_final_partner_id IS NULL
    AND p_attribution_source_type IS NOT NULL
  ) OR (
    p_final_partner_id IS NOT NULL
    AND (
      p_attribution_source_type IS NULL
      OR p_attribution_source_type NOT IN (
        'invite_code',
        'region_auto_assignment',
        'platform_manual'
      )
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_ONBOARDING_ATTRIBUTION_INVALID';
  END IF;

  v_credit_code := pg_catalog.upper(
    pg_catalog.btrim(v_application.unified_social_credit_code)
  );
  v_review_remark := NULLIF(
    pg_catalog.btrim(COALESCE(p_review_remark, '')),
    ''
  );

  -- The credit index is unique. Active employee phones use the same advisory
  -- protocol as the employees trigger, closing approval/ordinary-write races.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tenant-onboarding-subject:' || v_credit_code,
      0
    )
  );
  PERFORM public.lock_tenant_onboarding_employee_phones(
    ARRAY[v_application.admin_phone]::text[]
  );

  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE pg_catalog.upper(pg_catalog.btrim(tenant.unified_social_credit_code)) =
    v_credit_code
  LIMIT 1
  FOR SHARE;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'subject_exists');
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.status = 'active'
    AND employee.phone IS NOT NULL
    AND pg_catalog.btrim(employee.phone) <> ''
    AND pg_catalog.btrim(employee.phone) =
      pg_catalog.btrim(v_application.admin_phone)
  LIMIT 1;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'admin_phone_exists');
  END IF;

  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE tenant.slug = v_tenant_slug
  LIMIT 1
  FOR SHARE;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status',
      'application_state_conflict'
    );
  END IF;

  -- Approval is a low-frequency background transaction. SHARE keeps the region
  -- hierarchy and partner candidate snapshot stable until conversion finishes.
  LOCK TABLE public.administrative_areas IN SHARE MODE;
  LOCK TABLE public.platform_partners IN SHARE MODE;
  LOCK TABLE public.platform_partner_invite_codes IN SHARE MODE;

  SELECT pg_catalog.count(*)::integer
  INTO v_requested_region_count
  FROM (
    SELECT DISTINCT requested.code
    FROM pg_catalog.unnest(v_application.service_region_codes)
      AS requested(code)
  ) AS requested_codes;

  SELECT pg_catalog.count(DISTINCT paths.service_code)::integer
  INTO v_resolved_region_count
  FROM public.resolve_tenant_onboarding_region_paths(
    v_application.service_region_codes
  ) AS paths;

  IF v_requested_region_count <> v_resolved_region_count THEN
    RETURN pg_catalog.jsonb_build_object(
      'status',
      'application_state_conflict'
    );
  END IF;

  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT paths.adcode),
    '{}'::text[]
  )
  INTO v_ancestor_codes
  FROM public.resolve_tenant_onboarding_region_paths(
    v_application.service_region_codes
  ) AS paths;

  SELECT partner.id
  INTO v_fresh_invite_partner_id
  FROM public.platform_partner_invite_codes AS invite
  JOIN public.platform_partners AS partner
    ON partner.id = invite.partner_id
   AND partner.status = 'active'
  WHERE invite.id = v_application.invite_code_id
    AND invite.status = 'active'
    AND (invite.expires_at IS NULL OR invite.expires_at > pg_catalog.now())
    AND partner.region_codes && v_ancestor_codes
  LIMIT 1;

  WITH region_paths AS (
    SELECT
      paths.service_code,
      paths.adcode,
      paths.level
    FROM public.resolve_tenant_onboarding_region_paths(
      v_application.service_region_codes
    ) AS paths
  ),
  bounded_partners AS (
    SELECT partner.id, partner.region_codes
    FROM public.platform_partners AS partner
    WHERE partner.status = 'active'
      AND partner.region_codes && v_ancestor_codes
    ORDER BY partner.id ASC
    LIMIT 101
  ),
  best_region_match AS (
    SELECT
      partner.id AS partner_id,
      path.service_code,
      pg_catalog.max(
        CASE path.level
          WHEN 'district' THEN 2
          WHEN 'city' THEN 1
          ELSE 0
        END
      ) AS specificity
    FROM bounded_partners AS partner
    JOIN region_paths AS path
      ON path.adcode = ANY (partner.region_codes)
    GROUP BY partner.id, path.service_code
  ),
  partner_scores AS (
    SELECT
      region_match.partner_id,
      pg_catalog.count(*) FILTER (
        WHERE region_match.specificity = 2
      )::integer AS district_matches,
      pg_catalog.count(*) FILTER (
        WHERE region_match.specificity = 1
      )::integer AS city_matches,
      pg_catalog.count(*) FILTER (
        WHERE region_match.specificity = 0
      )::integer AS province_matches
    FROM best_region_match AS region_match
    GROUP BY region_match.partner_id
  ),
  best_score AS (
    SELECT
      score.district_matches,
      score.city_matches,
      score.province_matches
    FROM partner_scores AS score
    ORDER BY
      score.district_matches DESC,
      score.city_matches DESC,
      score.province_matches DESC
    LIMIT 1
  )
  SELECT
    (SELECT pg_catalog.count(*)::integer FROM bounded_partners),
    (
      SELECT pg_catalog.count(*)::integer
      FROM partner_scores AS score
      CROSS JOIN best_score AS best
      WHERE score.district_matches = best.district_matches
        AND score.city_matches = best.city_matches
        AND score.province_matches = best.province_matches
    ),
    (
      SELECT score.partner_id
      FROM partner_scores AS score
      CROSS JOIN best_score AS best
      WHERE score.district_matches = best.district_matches
        AND score.city_matches = best.city_matches
        AND score.province_matches = best.province_matches
      ORDER BY score.partner_id ASC
      LIMIT 1
    ),
    COALESCE(
      (
        SELECT pg_catalog.array_agg(
          score.partner_id ORDER BY score.partner_id
        )
        FROM partner_scores AS score
        CROSS JOIN best_score AS best
        WHERE score.district_matches = best.district_matches
          AND score.city_matches = best.city_matches
          AND score.province_matches = best.province_matches
      ),
      '{}'::uuid[]
    )
  INTO v_candidate_count, v_best_tie_count, v_best_partner_id,
    v_region_best_partner_ids;

  IF v_fresh_invite_partner_id IS NOT NULL THEN
    v_fresh_eligible_partner_ids := ARRAY[v_fresh_invite_partner_id];
  ELSIF v_candidate_count <= 100 THEN
    v_fresh_eligible_partner_ids := v_region_best_partner_ids;
  END IF;

  IF p_final_partner_id IS NOT NULL THEN
    PERFORM partner.id
    FROM public.platform_partners AS partner
    WHERE partner.id = p_final_partner_id
      AND partner.status = 'active'
      AND partner.region_codes && v_ancestor_codes
    FOR SHARE;
    IF NOT FOUND THEN
      RETURN pg_catalog.jsonb_build_object('status', 'partner_unavailable');
    END IF;

    IF (
      v_fresh_invite_partner_id IS NULL
      AND v_candidate_count > 100
    ) OR (
      p_attribution_source_type = 'region_auto_assignment'
      AND pg_catalog.cardinality(v_fresh_eligible_partner_ids) > 1
    ) THEN
      RETURN pg_catalog.jsonb_build_object('status', 'partner_ambiguous');
    END IF;

    IF p_attribution_source_type = 'invite_code' THEN
      IF v_fresh_invite_partner_id IS DISTINCT FROM p_final_partner_id THEN
        RETURN pg_catalog.jsonb_build_object('status', 'partner_unavailable');
      END IF;
    ELSIF p_attribution_source_type = 'region_auto_assignment' THEN
      IF v_fresh_invite_partner_id IS NOT NULL
        OR v_best_tie_count <> 1
        OR v_best_partner_id <> p_final_partner_id
      THEN
        RETURN pg_catalog.jsonb_build_object('status', 'partner_unavailable');
      END IF;
    ELSIF p_attribution_source_type = 'platform_manual' THEN
      IF NOT (
        p_final_partner_id = ANY (v_fresh_eligible_partner_ids)
      ) THEN
        RETURN pg_catalog.jsonb_build_object('status', 'partner_unavailable');
      END IF;
    END IF;
  END IF;

  v_before_assist_status := v_application.partner_assist_status;
  v_after_assist_status := CASE
    WHEN v_before_assist_status = 'pending' THEN 'expired'
    ELSE v_before_assist_status
  END;

  BEGIN
    INSERT INTO public.tenants (
      name,
      slug,
      status,
      unified_social_credit_code,
      contact_name,
      contact_phone,
      address,
      address_province,
      address_city,
      address_district,
      address_adcode,
      address_latitude,
      address_longitude,
      address_source,
      address_confirmed_at
    )
    VALUES (
      pg_catalog.btrim(v_application.company_name),
      v_tenant_slug,
      'active',
      v_credit_code,
      pg_catalog.btrim(v_application.admin_name),
      pg_catalog.btrim(v_application.admin_phone),
      pg_catalog.btrim(v_application.address),
      v_application.address_province,
      v_application.address_city,
      v_application.address_district,
      v_application.address_region_code,
      v_application.address_latitude,
      v_application.address_longitude,
      'manual',
      pg_catalog.now()
    )
    RETURNING tenants.id INTO v_tenant_id;

    v_initialization := public.initialize_default_decoration_tenant(
      v_tenant_id,
      v_application.admin_name,
      v_application.admin_phone,
      p_reviewer_employee_id
    );

    WITH region_paths AS (
      SELECT
        paths.service_code,
        paths.name,
        paths.level
      FROM public.resolve_tenant_onboarding_region_paths(
        v_application.service_region_codes
      ) AS paths
    ),
    region_names AS (
      SELECT
        path.service_code,
        pg_catalog.max(path.name) FILTER (
          WHERE path.level = 'province'
        ) AS province,
        pg_catalog.max(path.name) FILTER (
          WHERE path.level = 'city'
        ) AS city,
        pg_catalog.max(path.name) FILTER (
          WHERE path.level = 'district'
        ) AS district
      FROM region_paths AS path
      GROUP BY path.service_code
    )
    INSERT INTO public.tenant_service_areas (
      tenant_id,
      province,
      city,
      district,
      adcode,
      center_latitude,
      center_longitude,
      priority,
      status
    )
    SELECT
      v_tenant_id,
      region_names.province,
      COALESCE(
        region_names.city,
        region_names.province,
        region_names.district
      ),
      region_names.district,
      region_names.service_code,
      CASE
        WHEN region_names.service_code = v_application.address_region_code
          THEN v_application.address_latitude
        ELSE NULL
      END,
      CASE
        WHEN region_names.service_code = v_application.address_region_code
          THEN v_application.address_longitude
        ELSE NULL
      END,
      100,
      'inactive'
    FROM region_names
    ORDER BY service_code;

    IF p_final_partner_id IS NOT NULL THEN
      PERFORM binding.id
      FROM public.tenant_partner_bindings AS binding
      WHERE binding.tenant_id = v_tenant_id
        AND binding.status = 'active'
      FOR UPDATE;
      IF FOUND THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          CONSTRAINT = 'tenant_partner_bindings_one_active_idx',
          MESSAGE = 'TENANT_ONBOARDING_ACTIVE_BINDING_EXISTS';
      END IF;

      INSERT INTO public.tenant_partner_bindings (
        tenant_id,
        partner_id,
        invite_code_id,
        source_type,
        source_id,
        status,
        changed_by_employee_id,
        change_reason
      )
      VALUES (
        v_tenant_id,
        p_final_partner_id,
        CASE
          WHEN p_attribution_source_type = 'invite_code'
            THEN v_application.invite_code_id
          ELSE NULL
        END,
        p_attribution_source_type,
        v_application.id::text,
        'active',
        p_reviewer_employee_id,
        v_review_remark
      )
      RETURNING tenant_partner_bindings.id INTO v_binding_id;
    END IF;

    INSERT INTO public.tenant_service_provider_profiles (
      tenant_id,
      public_name,
      public_phone,
      address_province,
      address_city,
      address_district,
      address_region_code,
      address,
      address_latitude,
      address_longitude,
      status
    )
    VALUES (
      v_tenant_id,
      pg_catalog.btrim(v_application.company_name),
      NULL,
      v_application.address_province,
      v_application.address_city,
      v_application.address_district,
      v_application.address_region_code,
      pg_catalog.btrim(v_application.address),
      v_application.address_latitude,
      v_application.address_longitude,
      'draft'
    )
    RETURNING tenant_service_provider_profiles.id INTO v_profile_id;

    UPDATE public.tenant_onboarding_applications AS application
    SET
      status = 'approved',
      partner_assist_status = v_after_assist_status,
      final_partner_id = p_final_partner_id,
      attribution_source_type = p_attribution_source_type,
      converted_tenant_id = v_tenant_id,
      reviewed_by_employee_id = p_reviewer_employee_id,
      reviewed_at = pg_catalog.now(),
      review_remark = v_review_remark,
      version = application.version + 1
    WHERE application.id = v_application.id;

    INSERT INTO public.tenant_onboarding_application_reviews (
      application_id,
      review_stage,
      decision,
      actor_type,
      actor_employee_id,
      before_status,
      after_status,
      before_partner_assist_status,
      after_partner_assist_status,
      remark,
      metadata
    )
    VALUES (
      v_application.id,
      'platform_review',
      'approved',
      'platform_employee',
      p_reviewer_employee_id,
      v_application.status,
      'approved',
      v_before_assist_status,
      v_after_assist_status,
      v_review_remark,
      pg_catalog.jsonb_build_object(
        'before_version', v_application.version,
        'after_version', v_application.version + 1,
        'tenant_id', v_tenant_id,
        'binding_id', v_binding_id,
        'profile_id', v_profile_id,
        'final_partner_id', p_final_partner_id,
        'attribution_source_type', p_attribution_source_type,
        'initialization', v_initialization
      )
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'tenants_unified_social_credit_code_unique_idx' THEN
      RETURN pg_catalog.jsonb_build_object('status', 'subject_exists');
    END IF;
    IF v_constraint_name IN (
      'tenant_partner_bindings_one_active_idx',
      'tenants_slug_key'
    ) THEN
      RETURN pg_catalog.jsonb_build_object(
        'status',
        'application_state_conflict'
      );
    END IF;
    RAISE;
  END;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'approved',
    'application_id', v_application.id,
    'tenant_id', v_tenant_id,
    'binding_id', v_binding_id,
    'profile_id', v_profile_id,
    'initialization', v_initialization,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_tenant_onboarding_application(
  uuid,
  integer,
  uuid,
  text,
  uuid,
  text,
  text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_tenant_onboarding_application(
  uuid,
  integer,
  uuid,
  text,
  uuid,
  text,
  text
) FROM anon;
REVOKE ALL ON FUNCTION public.approve_tenant_onboarding_application(
  uuid,
  integer,
  uuid,
  text,
  uuid,
  text,
  text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_tenant_onboarding_application(
  uuid,
  integer,
  uuid,
  text,
  uuid,
  text,
  text
) TO service_role;

COMMENT ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) IS 'Idempotently initializes the current default decoration tenant template.';

COMMENT ON FUNCTION public.approve_tenant_onboarding_application(
  uuid,
  integer,
  uuid,
  text,
  uuid,
  text,
  text
) IS 'Atomically approves an onboarding application, initializes its tenant, optional partner binding, inactive service areas, draft provider profile, and append-only review.';

COMMIT;
