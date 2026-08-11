-- Forward-only compatibility fix. `employees` has never exposed an `updated_at`
-- column; role permission replacement invalidates platform sessions through the
-- existing version counters instead. Rollback is a function-definition restore
-- only and must not reintroduce the nonexistent column reference.
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
  v_existing := public.get_platform_command_idempotent_result(
    p_actor_user_id,
    p_idempotency_key,
    'platform_role_permissions_replace'
  );
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
    version = version + 1
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

REVOKE ALL ON FUNCTION public.replace_platform_role_permissions(
  uuid, uuid, uuid, integer, uuid, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_platform_role_permissions(
  uuid, uuid, uuid, integer, uuid, uuid[]
) TO service_role;
