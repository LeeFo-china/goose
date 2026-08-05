-- Platform operator and role atomic commands.
--
-- Rollback strategy:
-- use a forward migration to revoke EXECUTE from service_role and disable the
-- related Admin routes. Preserve command audit rows and version fields.

CREATE OR REPLACE FUNCTION public.assert_platform_operator_actor(
  p_actor_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    JOIN public.employee_roles AS employee_role
      ON employee_role.employee_id = employee.id
    JOIN public.roles AS role
      ON role.id = employee_role.role_id
    WHERE employee.id = p_actor_employee_id
      AND employee.tenant_id IS NULL
      AND employee.status = 'active'
      AND role.tenant_id IS NULL
      AND role.status = 'active'
      AND role.code = 'platform_admin'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_SUPER_ADMIN_REQUIRED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_command_idempotent_result(
  p_actor_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR p_idempotency_key IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'platform-operator-command:' || p_actor_user_id::text || ':' || p_idempotency_key::text,
      0
    )
  );

  SELECT audit_log.metadata->'result'
  INTO v_result
  FROM public.platform_audit_logs AS audit_log
  WHERE audit_log.actor_user_id = p_actor_user_id
    AND audit_log.idempotency_key = p_idempotency_key
  ORDER BY audit_log.created_at ASC
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_set(v_result, '{idempotent}', 'true'::jsonb, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.write_platform_command_audit(
  p_action text,
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_label text,
  p_summary text,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_audit_logs (
    action,
    actor_employee_id,
    actor_user_id,
    idempotency_key,
    resource_type,
    resource_id,
    resource_label,
    status,
    summary,
    metadata
  )
  VALUES (
    p_action,
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    p_resource_type,
    p_resource_id,
    p_resource_label,
    'success',
    p_summary,
    jsonb_build_object('result', p_result)
  )
  ON CONFLICT (actor_user_id, idempotency_key)
  WHERE actor_user_id IS NOT NULL AND idempotency_key IS NOT NULL
  DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_platform_operator_role_ids(
  p_role_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_role_id uuid;
  v_role_ids uuid[];
  v_invalid_count integer;
BEGIN
  SELECT role.id
  INTO v_staff_role_id
  FROM public.roles AS role
  WHERE role.tenant_id IS NULL
    AND role.status = 'active'
    AND role.code = 'platform_staff'
  LIMIT 1;

  IF v_staff_role_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_NOT_FOUND';
  END IF;

  SELECT array_agg(DISTINCT role_id)
  INTO v_role_ids
  FROM unnest(coalesce(p_role_ids, ARRAY[]::uuid[])) AS role_id;

  v_role_ids := array_append(coalesce(v_role_ids, ARRAY[]::uuid[]), v_staff_role_id);

  SELECT count(*)
  INTO v_invalid_count
  FROM unnest(v_role_ids) AS requested(role_id)
  LEFT JOIN public.roles AS role
    ON role.id = requested.role_id
  WHERE role.id IS NULL
    OR role.tenant_id IS NOT NULL
    OR role.status <> 'active'
    OR role.code = 'system_admin'
    OR role.code NOT LIKE 'platform_%';

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_PERMISSION_INVALID';
  END IF;

  SELECT array_agg(DISTINCT role_id)
  INTO v_role_ids
  FROM unnest(v_role_ids) AS role_id;

  RETURN coalesce(v_role_ids, ARRAY[v_staff_role_id]::uuid[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_platform_super_admin_survives(
  p_target_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_is_super_admin boolean := false;
  v_remaining_count integer := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_roles AS employee_role
    JOIN public.roles AS role
      ON role.id = employee_role.role_id
    WHERE employee_role.employee_id = p_target_employee_id
      AND role.tenant_id IS NULL
      AND role.status = 'active'
      AND role.code = 'platform_admin'
  )
  INTO v_target_is_super_admin;

  IF NOT v_target_is_super_admin THEN
    RETURN;
  END IF;

  WITH locked_super_admins AS (
    SELECT employee.id
    FROM public.employees AS employee
    JOIN public.employee_roles AS employee_role
      ON employee_role.employee_id = employee.id
    JOIN public.roles AS role
      ON role.id = employee_role.role_id
    WHERE employee.id <> p_target_employee_id
      AND employee.tenant_id IS NULL
      AND employee.status = 'active'
      AND employee.phone IS NOT NULL
      AND role.tenant_id IS NULL
      AND role.status = 'active'
      AND role.code = 'platform_admin'
    FOR UPDATE OF employee
  )
  SELECT count(*)
  INTO v_remaining_count
  FROM locked_super_admins;

  IF v_remaining_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_LAST_SUPER_ADMIN_REQUIRED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_platform_operator(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key uuid,
  p_name text,
  p_phone text,
  p_role_ids uuid[],
  p_status text DEFAULT 'pending'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_operator_id uuid := gen_random_uuid();
  v_role_ids uuid[];
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF p_status NOT IN ('pending', 'active') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_STATUS_INVALID';
  END IF;

  v_role_ids := public.normalize_platform_operator_role_ids(p_role_ids);

  INSERT INTO public.employees (
    id,
    tenant_id,
    name,
    phone,
    status,
    role,
    version,
    admin_auth_version
  )
  VALUES (
    v_operator_id,
    NULL,
    NULLIF(btrim(p_name), ''),
    NULLIF(btrim(p_phone), ''),
    p_status,
    'employee',
    1,
    1
  );

  INSERT INTO public.employee_roles (employee_id, role_id)
  SELECT v_operator_id, role_id
  FROM unnest(v_role_ids) AS role_id
  ON CONFLICT (employee_id, role_id) DO NOTHING;

  SELECT jsonb_build_object(
    'id', employee.id,
    'name', employee.name,
    'phone', employee.phone,
    'status', employee.status,
    'version', employee.version,
    'admin_auth_version', employee.admin_auth_version
  )
  INTO v_record
  FROM public.employees AS employee
  WHERE employee.id = v_operator_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_operator_create',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_operator',
    v_operator_id,
    p_name,
    '创建平台运营人员',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_platform_operator(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_operator_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_current public.employees%ROWTYPE;
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_current
  FROM public.employees
  WHERE id = p_operator_id
    AND tenant_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_NOT_FOUND';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_VERSION_CONFLICT';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'active', 'suspended', 'leaved') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_STATUS_INVALID';
  END IF;

  IF p_status IN ('suspended', 'leaved') THEN
    PERFORM public.ensure_platform_super_admin_survives(p_operator_id);
  END IF;

  UPDATE public.employees
  SET
    name = coalesce(NULLIF(btrim(p_name), ''), name),
    phone = coalesce(NULLIF(btrim(p_phone), ''), phone),
    status = coalesce(p_status, status),
    version = version + 1,
    admin_auth_version = admin_auth_version + 1,
    updated_at = now()
  WHERE id = p_operator_id;

  SELECT jsonb_build_object(
    'id', employee.id,
    'name', employee.name,
    'phone', employee.phone,
    'status', employee.status,
    'version', employee.version,
    'admin_auth_version', employee.admin_auth_version
  )
  INTO v_record
  FROM public.employees AS employee
  WHERE employee.id = p_operator_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_operator_update',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_operator',
    p_operator_id,
    v_record->>'name',
    '更新平台运营人员',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_platform_operator_roles(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_operator_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_role_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_current public.employees%ROWTYPE;
  v_role_ids uuid[];
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_current
  FROM public.employees
  WHERE id = p_operator_id
    AND tenant_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_NOT_FOUND';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_VERSION_CONFLICT';
  END IF;

  v_role_ids := public.normalize_platform_operator_role_ids(p_role_ids);

  IF EXISTS (
    SELECT 1
    FROM public.employee_roles AS employee_role
    JOIN public.roles AS role
      ON role.id = employee_role.role_id
    WHERE employee_role.employee_id = p_operator_id
      AND role.code = 'platform_admin'
      AND role.id <> ALL(v_role_ids)
  ) THEN
    PERFORM public.ensure_platform_super_admin_survives(p_operator_id);
  END IF;

  DELETE FROM public.employee_roles
  WHERE employee_id = p_operator_id;

  INSERT INTO public.employee_roles (employee_id, role_id)
  SELECT p_operator_id, role_id
  FROM unnest(v_role_ids) AS role_id
  ON CONFLICT (employee_id, role_id) DO NOTHING;

  UPDATE public.employees
  SET
    version = version + 1,
    admin_auth_version = admin_auth_version + 1,
    updated_at = now()
  WHERE id = p_operator_id;

  SELECT jsonb_build_object(
    'id', employee.id,
    'status', employee.status,
    'version', employee.version,
    'admin_auth_version', employee.admin_auth_version,
    'role_ids', to_jsonb(v_role_ids)
  )
  INTO v_record
  FROM public.employees AS employee
  WHERE employee.id = p_operator_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_operator_roles_replace',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_operator',
    p_operator_id,
    v_current.name,
    '替换平台运营人员角色',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_platform_operator_status(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_operator_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_target_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (p_target_status = ANY (ARRAY['active', 'suspended', 'leaved']::text[])) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_STATUS_INVALID';
  END IF;

  RETURN public.update_platform_operator(
    p_actor_employee_id,
    p_actor_user_id,
    p_operator_id,
    p_expected_version,
    p_idempotency_key,
    NULL,
    NULL,
    p_target_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_platform_operator_sessions(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_operator_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_current public.employees%ROWTYPE;
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_current
  FROM public.employees
  WHERE id = p_operator_id
    AND tenant_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_NOT_FOUND';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_OPERATOR_VERSION_CONFLICT';
  END IF;

  UPDATE public.employees
  SET
    version = version + 1,
    admin_auth_version = admin_auth_version + 1,
    updated_at = now()
  WHERE id = p_operator_id;

  SELECT jsonb_build_object(
    'id', employee.id,
    'version', employee.version,
    'admin_auth_version', employee.admin_auth_version
  )
  INTO v_record
  FROM public.employees AS employee
  WHERE employee.id = p_operator_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_operator_sessions_revoke',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_operator',
    p_operator_id,
    v_current.name,
    '强制平台运营人员重新登录',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_platform_role(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_permission_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_role_id uuid := gen_random_uuid();
  v_code text := 'platform_custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_permission_ids uuid[];
  v_invalid_count integer;
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.roles (
    id,
    tenant_id,
    code,
    name,
    description,
    status,
    version
  )
  VALUES (
    v_role_id,
    NULL,
    v_code,
    NULLIF(btrim(p_name), ''),
    NULLIF(btrim(p_description), ''),
    'active',
    1
  );

  SELECT array_agg(DISTINCT permission_id)
  INTO v_permission_ids
  FROM unnest(coalesce(p_permission_ids, ARRAY[]::uuid[])) AS permission_id;
  v_permission_ids := coalesce(v_permission_ids, ARRAY[]::uuid[]);

  SELECT count(*)
  INTO v_invalid_count
  FROM unnest(v_permission_ids) AS requested(permission_id)
  LEFT JOIN public.permissions AS permissions
    ON permissions.id = requested.permission_id
  WHERE permissions.id IS NULL
    OR permissions.status <> 'active'
    OR NOT (permissions.code LIKE 'platform.%');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_PERMISSION_INVALID';
  END IF;

  INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
  SELECT v_role_id, permission_id, 'all'
  FROM unnest(v_permission_ids) AS permission_id
  ON CONFLICT (role_id, permission_id) DO UPDATE SET
    access_scope = 'all';

  SELECT jsonb_build_object(
    'id', role.id,
    'code', role.code,
    'name', role.name,
    'description', role.description,
    'status', role.status,
    'version', role.version,
    'permission_ids', to_jsonb(v_permission_ids)
  )
  INTO v_record
  FROM public.roles AS role
  WHERE role.id = v_role_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_role_create',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_role',
    v_role_id,
    p_name,
    '创建平台角色',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_platform_role(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_role_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_current public.roles%ROWTYPE;
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_current
  FROM public.roles
  WHERE id = p_role_id
    AND tenant_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_NOT_FOUND';
  END IF;

  IF v_current.code = ANY (ARRAY['platform_admin', 'platform_staff']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_PROTECTED';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_VERSION_CONFLICT';
  END IF;

  UPDATE public.roles
  SET
    name = coalesce(NULLIF(btrim(p_name), ''), name),
    description = coalesce(NULLIF(btrim(p_description), ''), description),
    version = version + 1,
    updated_at = now()
  WHERE id = p_role_id;

  SELECT jsonb_build_object(
    'id', role.id,
    'code', role.code,
    'name', role.name,
    'description', role.description,
    'status', role.status,
    'version', role.version
  )
  INTO v_record
  FROM public.roles AS role
  WHERE role.id = p_role_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_role_update',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_role',
    p_role_id,
    v_record->>'name',
    '更新平台角色',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_platform_role_permissions(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_role_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_permission_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_current public.roles%ROWTYPE;
  v_permission_ids uuid[];
  v_invalid_count integer;
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_current
  FROM public.roles
  WHERE id = p_role_id
    AND tenant_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_NOT_FOUND';
  END IF;

  IF v_current.code = ANY (ARRAY['platform_admin', 'platform_staff']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_PROTECTED';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_VERSION_CONFLICT';
  END IF;

  SELECT array_agg(DISTINCT permission_id)
  INTO v_permission_ids
  FROM unnest(coalesce(p_permission_ids, ARRAY[]::uuid[])) AS permission_id;
  v_permission_ids := coalesce(v_permission_ids, ARRAY[]::uuid[]);

  SELECT count(*)
  INTO v_invalid_count
  FROM unnest(v_permission_ids) AS requested(permission_id)
  LEFT JOIN public.permissions AS permissions
    ON permissions.id = requested.permission_id
  WHERE permissions.id IS NULL
    OR permissions.status <> 'active'
    OR NOT (permissions.code LIKE 'platform.%');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_PERMISSION_INVALID';
  END IF;

  DELETE FROM public.role_permissions
  WHERE role_id = p_role_id;

  INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
  SELECT p_role_id, permission_id, 'all'
  FROM unnest(v_permission_ids) AS permission_id
  ON CONFLICT (role_id, permission_id) DO UPDATE SET
    access_scope = 'all';

  UPDATE public.roles
  SET
    version = version + 1,
    updated_at = now()
  WHERE id = p_role_id;

  UPDATE public.employees
  SET
    admin_auth_version = admin_auth_version + 1,
    version = version + 1,
    updated_at = now()
  WHERE tenant_id IS NULL
    AND status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.employee_roles AS employee_role
      WHERE employee_role.employee_id = employees.id
        AND employee_role.role_id = p_role_id
    );

  SELECT jsonb_build_object(
    'id', role.id,
    'code', role.code,
    'version', role.version,
    'permission_ids', to_jsonb(v_permission_ids)
  )
  INTO v_record
  FROM public.roles AS role
  WHERE role.id = p_role_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_role_permissions_replace',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_role',
    p_role_id,
    v_current.name,
    '替换平台角色权限',
    v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_platform_role(
  p_actor_employee_id uuid,
  p_actor_user_id uuid,
  p_role_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_current public.roles%ROWTYPE;
  v_in_use_count integer;
  v_record jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.assert_platform_operator_actor(p_actor_employee_id);
  v_existing := public.get_platform_command_idempotent_result(p_actor_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
  INTO v_current
  FROM public.roles
  WHERE id = p_role_id
    AND tenant_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_NOT_FOUND';
  END IF;

  IF v_current.code = ANY (ARRAY['platform_admin', 'platform_staff']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_PROTECTED';
  END IF;

  IF v_current.version <> p_expected_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_VERSION_CONFLICT';
  END IF;

  SELECT count(*)
  INTO v_in_use_count
  FROM public.employee_roles AS employee_role
  JOIN public.employees AS employee
    ON employee.id = employee_role.employee_id
  WHERE employee_role.role_id = p_role_id
    AND employee.tenant_id IS NULL
    AND employee.status = 'active';

  IF v_in_use_count > 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PLATFORM_ROLE_IN_USE';
  END IF;

  UPDATE public.roles
  SET
    status = 'inactive',
    version = version + 1,
    updated_at = now()
  WHERE id = p_role_id;

  SELECT jsonb_build_object(
    'id', role.id,
    'code', role.code,
    'status', role.status,
    'version', role.version
  )
  INTO v_record
  FROM public.roles AS role
  WHERE role.id = p_role_id;

  v_result := jsonb_build_object('record', v_record, 'idempotent', false);
  PERFORM public.write_platform_command_audit(
    'platform_role_archive',
    p_actor_employee_id,
    p_actor_user_id,
    p_idempotency_key,
    'platform_role',
    p_role_id,
    v_current.name,
    '归档平台角色',
    v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_platform_operator_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_command_idempotent_result(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_platform_command_audit(text, uuid, uuid, uuid, text, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_platform_operator_role_ids(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_platform_super_admin_survives(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_platform_operator(uuid, uuid, uuid, text, text, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_platform_operator(uuid, uuid, uuid, integer, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_platform_operator_roles(uuid, uuid, uuid, integer, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_platform_operator_status(uuid, uuid, uuid, integer, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_platform_operator_sessions(uuid, uuid, uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_platform_role(uuid, uuid, uuid, text, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_platform_role(uuid, uuid, uuid, integer, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_platform_role_permissions(uuid, uuid, uuid, integer, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_platform_role(uuid, uuid, uuid, integer, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_platform_operator_actor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_platform_command_idempotent_result(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.write_platform_command_audit(text, uuid, uuid, uuid, text, uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_platform_operator_role_ids(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_platform_super_admin_survives(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_platform_operator(uuid, uuid, uuid, text, text, uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_platform_operator(uuid, uuid, uuid, integer, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_platform_operator_roles(uuid, uuid, uuid, integer, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_platform_operator_status(uuid, uuid, uuid, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_platform_operator_sessions(uuid, uuid, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_platform_role(uuid, uuid, uuid, text, text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_platform_role(uuid, uuid, uuid, integer, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_platform_role_permissions(uuid, uuid, uuid, integer, uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_platform_role(uuid, uuid, uuid, integer, uuid) TO service_role;
