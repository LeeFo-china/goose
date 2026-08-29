\set ON_ERROR_STOP on

-- Run only against a local disposable Supabase/PostgreSQL database. The
-- transaction is always rolled back; the companion concurrency script also
-- enforces its connection host before performing committed two-session checks.

SELECT
  pg_catalog.to_char(
    pg_catalog.clock_timestamp(),
    'YYYYMMDDHH24MISSMS'
  ) || '-' || pg_catalog.pg_backend_pid()::text AS run_token
\gset tenant_standard_

SELECT
  'tenant-standard-direct-' || :'tenant_standard_run_token' AS direct_slug,
  'tenant-standard-approval-' || :'tenant_standard_run_token' AS approval_slug,
  'tenant-standard-null-' || :'tenant_standard_run_token' AS null_admin_slug,
  'tenant-standard-conflict-' || :'tenant_standard_run_token' AS conflict_slug,
  '19' || pg_catalog.lpad(
    (
      ('x' || pg_catalog.substr(
        pg_catalog.md5(:'tenant_standard_run_token' || ':direct-phone'),
        1,
        8
      ))::bit(32)::bigint % 1000000000
    )::text,
    9,
    '0'
  ) AS direct_phone,
  '19' || pg_catalog.lpad(
    (
      ('x' || pg_catalog.substr(
        pg_catalog.md5(:'tenant_standard_run_token' || ':approval-phone'),
        1,
        8
      ))::bit(32)::bigint % 1000000000
    )::text,
    9,
    '0'
  ) AS approval_phone
\gset tenant_standard_

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '10s';

CREATE TEMP TABLE tenant_standard_organization_template_fixture
ON COMMIT DROP
AS
SELECT
  :'tenant_standard_run_token'::text AS run_token,
  :'tenant_standard_direct_slug'::text AS direct_slug,
  :'tenant_standard_approval_slug'::text AS approval_slug,
  :'tenant_standard_null_admin_slug'::text AS null_admin_slug,
  :'tenant_standard_conflict_slug'::text AS conflict_slug,
  :'tenant_standard_direct_phone'::text AS direct_phone,
  :'tenant_standard_approval_phone'::text AS approval_phone,
  pg_catalog.md5(
    :'tenant_standard_run_token' || ':approval-tenant'
  )::uuid AS approval_tenant_id,
  pg_catalog.md5(
    :'tenant_standard_run_token' || ':null-admin-tenant'
  )::uuid AS null_admin_tenant_id,
  pg_catalog.md5(
    :'tenant_standard_run_token' || ':conflict-tenant'
  )::uuid AS conflict_tenant_id;

DO $smoke$
DECLARE
  v_fixture tenant_standard_organization_template_fixture%ROWTYPE;
  v_direct_result jsonb;
  v_direct_initialization jsonb;
  v_direct_replay jsonb;
  v_approval_initialization jsonb;
  v_null_admin_initialization jsonb;
  v_direct_tenant_id uuid;
  v_admin_employee_id uuid;
  v_admin_role_id uuid;
  v_tenant_id uuid;
  v_expected_admin_employee_id uuid;
  v_count integer;
  v_enabled_count integer;
  v_before_employee_count integer;
  v_after_employee_count integer;
  v_error_message text;
BEGIN
  SELECT *
  INTO STRICT v_fixture
  FROM tenant_standard_organization_template_fixture;

  v_direct_result := public.create_tenant_with_default_template(
    p_name => 'Tenant standard direct ' || v_fixture.run_token,
    p_slug => v_fixture.direct_slug,
    p_status => 'active',
    p_address => 'Local smoke address',
    p_address_title => 'Local smoke title',
    p_address_poi_id => 'local-smoke-poi',
    p_address_province => 'Local province',
    p_address_city => 'Local city',
    p_address_district => 'Local district',
    p_address_adcode => '000000',
    p_address_latitude => 31.2304,
    p_address_longitude => 121.4737,
    p_address_source => 'manual',
    p_address_confidence => 1,
    p_address_confirmed_at => pg_catalog.clock_timestamp(),
    p_contact_name => 'Direct contact',
    p_contact_phone => v_fixture.direct_phone,
    p_admin_name => 'Direct administrator',
    p_admin_phone => v_fixture.direct_phone,
    p_admin_auth_user_id => NULL,
    p_admin_department_code => 'EXEC_OFFICE',
    p_admin_post_code => 'SYSTEM_ADMIN',
    p_operator_employee_id => NULL
  );

  v_direct_initialization := v_direct_result -> 'initialization';
  v_direct_tenant_id := (v_direct_result -> 'tenant' ->> 'id')::uuid;
  v_admin_employee_id :=
    (v_direct_initialization ->> 'admin_employee_id')::uuid;
  v_admin_role_id := (v_direct_initialization ->> 'admin_role_id')::uuid;

  IF v_direct_result -> 'tenant' ->> 'slug' IS DISTINCT FROM
      v_fixture.direct_slug
    OR v_direct_result -> 'tenant' ->> 'name' IS DISTINCT FROM
      'Tenant standard direct ' || v_fixture.run_token
    OR v_direct_result -> 'tenant' ->> 'status' IS DISTINCT FROM 'active'
    OR v_direct_result -> 'tenant' ->> 'contact_name' IS DISTINCT FROM
      'Direct contact'
    OR v_direct_result -> 'tenant' ->> 'contact_phone' IS DISTINCT FROM
      v_fixture.direct_phone
    OR v_direct_result -> 'tenant' ->> 'address_source' IS DISTINCT FROM
      'manual'
    OR v_direct_initialization ->> 'template_code' IS DISTINCT FROM
      'default_decoration_company'
    OR v_direct_initialization ->> 'template_version' IS DISTINCT FROM
      '2026.08.30'
    OR (v_direct_initialization ->> 'departments_count')::integer <> 42
    OR (v_direct_initialization ->> 'posts_count')::integer <> 48
    OR (v_direct_initialization ->> 'roles_count')::integer <> 11
  THEN
    RAISE EXCEPTION 'direct create result is incoherent: %', v_direct_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    INNER JOIN public.tenant_departments AS department
      ON department.id = employee.tenant_department_id
    INNER JOIN public.posts AS post
      ON post.id = employee.post_id
    WHERE employee.id = v_admin_employee_id
      AND employee.tenant_id = v_direct_tenant_id
      AND employee.name = 'Direct administrator'
      AND employee.phone = v_fixture.direct_phone
      AND employee.status = 'active'
      AND department.tenant_id = v_direct_tenant_id
      AND department.code = 'EXEC_OFFICE'
      AND post.tenant_id = v_direct_tenant_id
      AND post.code = 'SYSTEM_ADMIN'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.employee_roles AS employee_role
    INNER JOIN public.roles AS role ON role.id = employee_role.role_id
    WHERE employee_role.employee_id = v_admin_employee_id
      AND employee_role.role_id = v_admin_role_id
      AND role.tenant_id = v_direct_tenant_id
      AND role.code = 'system_admin'
  ) THEN
    RAISE EXCEPTION 'direct initializer identifiers are incoherent';
  END IF;

  INSERT INTO public.tenants (id, slug, name, status)
  VALUES (
    v_fixture.approval_tenant_id,
    v_fixture.approval_slug,
    'Tenant standard approval ' || v_fixture.run_token,
    'active'
  );

  v_approval_initialization := public.initialize_default_decoration_tenant(
    v_fixture.approval_tenant_id,
    'Approval administrator',
    v_fixture.approval_phone,
    NULL
  );

  IF v_approval_initialization ->> 'template_code' IS DISTINCT FROM
      'default_decoration_company'
    OR v_approval_initialization ->> 'template_version' IS DISTINCT FROM
      '2026.08.30'
  THEN
    RAISE EXCEPTION
      'approval-equivalent initialization identity is incoherent: %',
      v_approval_initialization;
  END IF;

  INSERT INTO public.tenants (id, slug, name, status)
  VALUES (
    v_fixture.null_admin_tenant_id,
    v_fixture.null_admin_slug,
    'Tenant standard null administrator ' || v_fixture.run_token,
    'active'
  );

  v_null_admin_initialization := public.initialize_default_decoration_tenant(
    v_fixture.null_admin_tenant_id,
    NULL,
    NULL,
    NULL
  );

  IF v_null_admin_initialization ->> 'template_version' IS DISTINCT FROM
      '2026.08.30'
    OR v_null_admin_initialization ->> 'admin_employee_id' IS NOT NULL
    OR v_null_admin_initialization ->> 'admin_role_id' IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.tenant_id = v_fixture.null_admin_tenant_id
    )
  THEN
    RAISE EXCEPTION
      'null-administrator initialization is incoherent: %',
      v_null_admin_initialization;
  END IF;

  FOR v_tenant_id IN
    SELECT tenant_id
    FROM (
      VALUES
        (v_direct_tenant_id),
        (v_fixture.approval_tenant_id),
        (v_fixture.null_admin_tenant_id)
    ) AS initialized_tenants(tenant_id)
  LOOP
    SELECT
      pg_catalog.count(*)::integer,
      pg_catalog.count(*) FILTER (WHERE department.enabled)::integer
    INTO v_count, v_enabled_count
    FROM public.tenant_departments AS department
    WHERE department.tenant_id = v_tenant_id;
    IF v_count <> 42 OR v_enabled_count <> 7 THEN
      RAISE EXCEPTION
        'tenant % department counts mismatch: total %, enabled %',
        v_tenant_id, v_count, v_enabled_count;
    END IF;

    SELECT
      pg_catalog.count(*)::integer,
      pg_catalog.count(*) FILTER (WHERE post.status = 1)::integer
    INTO v_count, v_enabled_count
    FROM public.posts AS post
    WHERE post.tenant_id = v_tenant_id;
    IF v_count <> 48 OR v_enabled_count <> 21 THEN
      RAISE EXCEPTION
        'tenant % post counts mismatch: total %, enabled %',
        v_tenant_id, v_count, v_enabled_count;
    END IF;

    SELECT
      pg_catalog.count(*)::integer,
      pg_catalog.count(*) FILTER (WHERE rule.enabled)::integer
    INTO v_count, v_enabled_count
    FROM public.department_post_rules AS rule
    WHERE rule.tenant_id = v_tenant_id;
    IF v_count <> 21 OR v_enabled_count <> 21 THEN
      RAISE EXCEPTION
        'tenant % department-post counts mismatch: total %, enabled %',
        v_tenant_id, v_count, v_enabled_count;
    END IF;

    SELECT
      pg_catalog.count(*)::integer,
      pg_catalog.count(*) FILTER (WHERE role.status = 'active')::integer
    INTO v_count, v_enabled_count
    FROM public.roles AS role
    WHERE role.tenant_id = v_tenant_id;
    IF v_count <> 11 OR v_enabled_count <> 11 THEN
      RAISE EXCEPTION
        'tenant % role counts mismatch: total %, active %',
        v_tenant_id, v_count, v_enabled_count;
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.role_permissions AS role_permission
    INNER JOIN public.roles AS role ON role.id = role_permission.role_id
    INNER JOIN public.permissions AS permission
      ON permission.id = role_permission.permission_id
    WHERE role.tenant_id = v_tenant_id
      AND role.code = 'system_admin'
      AND permission.code LIKE 'platform.%';
    IF v_count <> 0 THEN
      RAISE EXCEPTION
        'tenant % system administrator received platform permissions',
        v_tenant_id;
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.permissions AS permission
    WHERE permission.status = 'active'
      AND permission.code NOT LIKE 'platform.%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.role_permissions AS role_permission
        INNER JOIN public.roles AS role ON role.id = role_permission.role_id
        WHERE role_permission.permission_id = permission.id
          AND role.tenant_id = v_tenant_id
          AND role.code = 'system_admin'
          AND role_permission.access_scope = 'all'
      );
    IF v_count <> 0 THEN
      RAISE EXCEPTION
        'tenant % system administrator misses active tenant permissions',
        v_tenant_id;
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.role_permissions AS role_permission
    INNER JOIN public.roles AS role ON role.id = role_permission.role_id
    INNER JOIN public.permissions AS permission
      ON permission.id = role_permission.permission_id
    WHERE role.tenant_id = v_tenant_id
      AND role.code = 'system_admin'
      AND (
        permission.status <> 'active'
        OR permission.code LIKE 'platform.%'
        OR role_permission.access_scope <> 'all'
      );
    IF v_count <> 0 THEN
      RAISE EXCEPTION
        'tenant % system administrator has invalid permission grants',
        v_tenant_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.employee_permission_overrides AS override
      INNER JOIN public.employees AS employee
        ON employee.id = override.employee_id
      WHERE employee.tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION
        'tenant % received employee permission overrides', v_tenant_id;
    END IF;
  END LOOP;

  FOR v_tenant_id, v_expected_admin_employee_id IN
    SELECT tenant_id, admin_employee_id
    FROM (
      VALUES
        (
          v_direct_tenant_id,
          (v_direct_initialization ->> 'admin_employee_id')::uuid
        ),
        (
          v_fixture.approval_tenant_id,
          (v_approval_initialization ->> 'admin_employee_id')::uuid
        )
    ) AS administrator_tenants(tenant_id, admin_employee_id)
  LOOP
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.employees AS employee
    WHERE employee.tenant_id = v_tenant_id;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'tenant % expected one initial employee, got %',
        v_tenant_id, v_count;
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.employee_roles AS employee_role
    INNER JOIN public.employees AS employee
      ON employee.id = employee_role.employee_id
    INNER JOIN public.roles AS role ON role.id = employee_role.role_id
    WHERE employee.tenant_id = v_tenant_id
      AND employee.id = v_expected_admin_employee_id
      AND role.tenant_id = v_tenant_id
      AND role.code = 'system_admin';
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'tenant % initial administrator role assignment mismatch', v_tenant_id;
    END IF;

    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.employee_roles AS employee_role
    INNER JOIN public.employees AS employee
      ON employee.id = employee_role.employee_id
    WHERE employee.tenant_id = v_tenant_id;
    IF v_count <> 1 THEN
      RAISE EXCEPTION
        'tenant % assigned roles beyond the initial administrator', v_tenant_id;
    END IF;
  END LOOP;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.role_permissions AS role_permission
  INNER JOIN public.roles AS role ON role.id = role_permission.role_id
  WHERE role.tenant_id = v_direct_tenant_id
    AND role.code <> 'system_admin';
  IF v_count <> 162 THEN
    RAISE EXCEPTION 'direct tenant non-admin permission count %, expected 162',
      v_count;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.role_permissions AS role_permission
  INNER JOIN public.roles AS role ON role.id = role_permission.role_id
  WHERE role.tenant_id = v_fixture.approval_tenant_id
    AND role.code <> 'system_admin';
  IF v_count <> 162 THEN
    RAISE EXCEPTION 'approval tenant non-admin permission count %, expected 162',
      v_count;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM (
    (
      SELECT role.code, permission.code, role_permission.access_scope
      FROM public.role_permissions AS role_permission
      INNER JOIN public.roles AS role ON role.id = role_permission.role_id
      INNER JOIN public.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE role.tenant_id = v_direct_tenant_id
        AND role.code <> 'system_admin'
      EXCEPT
      SELECT role.code, permission.code, role_permission.access_scope
      FROM public.role_permissions AS role_permission
      INNER JOIN public.roles AS role ON role.id = role_permission.role_id
      INNER JOIN public.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE role.tenant_id = v_fixture.approval_tenant_id
        AND role.code <> 'system_admin'
    )
    UNION ALL
    (
      SELECT role.code, permission.code, role_permission.access_scope
      FROM public.role_permissions AS role_permission
      INNER JOIN public.roles AS role ON role.id = role_permission.role_id
      INNER JOIN public.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE role.tenant_id = v_fixture.approval_tenant_id
        AND role.code <> 'system_admin'
      EXCEPT
      SELECT role.code, permission.code, role_permission.access_scope
      FROM public.role_permissions AS role_permission
      INNER JOIN public.roles AS role ON role.id = role_permission.role_id
      INNER JOIN public.permissions AS permission
        ON permission.id = role_permission.permission_id
      WHERE role.tenant_id = v_direct_tenant_id
        AND role.code <> 'system_admin'
    )
  ) AS permission_difference;
  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'direct and approval non-admin permission triples differ by % rows',
      v_count;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_before_employee_count
  FROM public.employees AS employee
  WHERE employee.tenant_id = v_direct_tenant_id;

  v_direct_replay := public.initialize_default_decoration_tenant(
    v_direct_tenant_id,
    'Direct administrator',
    v_fixture.direct_phone,
    NULL
  );

  SELECT pg_catalog.count(*)::integer
  INTO v_after_employee_count
  FROM public.employees AS employee
  WHERE employee.tenant_id = v_direct_tenant_id;

  IF v_direct_replay IS DISTINCT FROM v_direct_initialization
    OR v_direct_replay ->> 'admin_employee_id' IS DISTINCT FROM
      v_direct_initialization ->> 'admin_employee_id'
    OR v_direct_replay ->> 'admin_role_id' IS DISTINCT FROM
      v_direct_initialization ->> 'admin_role_id'
    OR v_before_employee_count <> v_after_employee_count
  THEN
    RAISE EXCEPTION
      'direct tenant replay changed identifiers or employee count';
  END IF;

  INSERT INTO public.tenants (id, slug, name, status)
  VALUES (
    v_fixture.conflict_tenant_id,
    v_fixture.conflict_slug,
    'Tenant standard old template conflict ' || v_fixture.run_token,
    'active'
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
    v_fixture.conflict_tenant_id,
    NULL,
    'default_decoration_company',
    '2026.05.10',
    NULL,
    pg_catalog.jsonb_build_object('template_version', '2026.05.10')
  );

  v_error_message := NULL;
  BEGIN
    PERFORM public.initialize_default_decoration_tenant(
      v_fixture.conflict_tenant_id,
      NULL,
      NULL,
      NULL
    );
  EXCEPTION
    WHEN SQLSTATE '23514' THEN
      GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
  END;

  IF v_error_message IS DISTINCT FROM 'TENANT_TEMPLATE_STATE_CONFLICT' THEN
    RAISE EXCEPTION
      'old template conflict error %, expected TENANT_TEMPLATE_STATE_CONFLICT',
      v_error_message;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.tenant_template_applications AS application
  WHERE application.tenant_id IN (
      v_direct_tenant_id,
      v_fixture.approval_tenant_id,
      v_fixture.null_admin_tenant_id
    )
    AND application.template_code = 'default_decoration_company'
    AND application.template_version = '2026.08.30'
    AND application.result ->> 'template_version' = '2026.08.30';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'current template application count %, expected 3', v_count;
  END IF;

  RAISE NOTICE
    'tenant_standard_organization_template_smoke_ok direct=% approval=% null_admin=%',
    v_direct_tenant_id,
    v_fixture.approval_tenant_id,
    v_fixture.null_admin_tenant_id;
END;
$smoke$;

ROLLBACK;

SELECT pg_catalog.count(*) AS rollback_residue_count
FROM public.tenants AS tenant
WHERE tenant.slug IN (
  :'tenant_standard_direct_slug',
  :'tenant_standard_approval_slug',
  :'tenant_standard_null_admin_slug',
  :'tenant_standard_conflict_slug'
);

SELECT (pg_catalog.count(*) = 0)::text AS rollback_clean
FROM public.tenants AS tenant
WHERE tenant.slug IN (
  :'tenant_standard_direct_slug',
  :'tenant_standard_approval_slug',
  :'tenant_standard_null_admin_slug',
  :'tenant_standard_conflict_slug'
)
\gset tenant_standard_

\if :tenant_standard_rollback_clean
\echo tenant_standard_organization_template_rollback_ok
\else
\echo tenant_standard_organization_template_rollback_failed
\quit 1
\endif
