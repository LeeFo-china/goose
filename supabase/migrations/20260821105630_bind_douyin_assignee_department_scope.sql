-- Bind department-scoped assignee authorization to the atomic assignment write.
-- Rollback: drop the three trigram indexes, revoke/drop the seven-argument
-- overload, then restore service_role EXECUTE on the six-argument function.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.assign_douyin_lead(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_actor_employee_id uuid,
  p_assigned_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_expected_assignee_department_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_request_hash bytea;
  v_operation public.douyin_lead_workflow_operations%ROWTYPE;
  v_lead public.marketing_leads%ROWTYPE;
  v_assignee_department_id uuid;
  v_result jsonb;
  v_appointments_updated integer;
BEGIN
  IF p_tenant_id IS NULL
    OR p_marketing_lead_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_assigned_employee_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_idempotency_key IS NULL
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_LEAD_ASSIGN_COMMAND_INVALID'
      )
    );
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  JOIN public.tenants AS tenant ON tenant.id = employee.tenant_id
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
    AND tenant.status = 'active'
  FOR SHARE OF employee, tenant;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_LEAD_ACTOR_NOT_FOUND'
      )
    );
  END IF;

  v_request_hash := extensions.digest(convert_to(jsonb_build_object(
    'action', 'assign',
    'tenant_id', p_tenant_id,
    'lead_id', p_marketing_lead_id,
    'actor_employee_id', p_actor_employee_id,
    'assigned_employee_id', p_assigned_employee_id,
    'expected_version', p_expected_version
  )::text, 'UTF8'), 'sha256');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-lead-operation:' || p_tenant_id::text
        || ':assign:' || p_idempotency_key::text,
      20260821105000
    )
  );

  SELECT operation.*
  INTO v_operation
  FROM public.douyin_lead_workflow_operations AS operation
  WHERE operation.tenant_id = p_tenant_id
    AND operation.action = 'assign'
    AND operation.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_operation.request_hash IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 409,
          'code', 'DOUYIN_LEAD_IDEMPOTENCY_CONFLICT'
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'data', v_operation.result_payload || jsonb_build_object(
        'idempotent', true
      )
    );
  END IF;

  SELECT employee.tenant_department_id
  INTO v_assignee_department_id
  FROM public.employees AS employee
  WHERE employee.id = p_assigned_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_LEAD_ASSIGNEE_NOT_FOUND'
      )
    );
  END IF;
  IF p_expected_assignee_department_id IS NOT NULL
    AND v_assignee_department_id IS DISTINCT FROM p_expected_assignee_department_id
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_ASSIGNEE_SCOPE_CONFLICT'
      )
    );
  END IF;

  SELECT lead.*
  INTO v_lead
  FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id
    AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_LEAD_NOT_FOUND'
      )
    );
  END IF;

  IF v_lead.lead_status IN ('converted', 'invalid') THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_NOT_ASSIGNABLE'
      )
    );
  END IF;
  IF v_lead.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_VERSION_CONFLICT'
      )
    );
  END IF;

  UPDATE public.marketing_leads AS lead
  SET assigned_employee_id = p_assigned_employee_id,
      assigned_at = v_now
  WHERE lead.id = v_lead.id
  RETURNING * INTO v_lead;

  UPDATE public.douyin_measurement_appointments
  SET assigned_employee_id = p_assigned_employee_id,
      assigned_at = v_now
  WHERE tenant_id = p_tenant_id
    AND marketing_lead_id = p_marketing_lead_id
    AND status IN ('pending_confirmation', 'confirmed');
  GET DIAGNOSTICS v_appointments_updated = ROW_COUNT;

  v_result := jsonb_build_object(
    'action', 'assign',
    'result', 'assigned',
    'lead_id', v_lead.id,
    'assigned_employee_id', p_assigned_employee_id,
    'lead_version', v_lead.version,
    'appointments_updated', v_appointments_updated,
    'idempotent', false
  );

  INSERT INTO public.douyin_lead_workflow_operations (
    tenant_id,
    marketing_lead_id,
    actor_employee_id,
    action,
    idempotency_key,
    request_hash,
    result_payload,
    created_at
  ) VALUES (
    p_tenant_id,
    p_marketing_lead_id,
    p_actor_employee_id,
    'assign',
    p_idempotency_key,
    v_request_hash,
    v_result - 'idempotent',
    v_now
  );

  RETURN jsonb_build_object('data', v_result);
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_douyin_lead(
  uuid, uuid, uuid, uuid, integer, uuid
) FROM service_role;
REVOKE ALL ON FUNCTION public.assign_douyin_lead(
  uuid, uuid, uuid, uuid, integer, uuid, uuid
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_douyin_lead(
  uuid, uuid, uuid, uuid, integer, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.assign_douyin_lead(
  uuid, uuid, uuid, uuid, integer, uuid, uuid
) IS '原子校验负责人部门快照并分配抖音线索';

CREATE INDEX marketing_leads_douyin_name_trgm_idx
ON public.marketing_leads
USING gin (name extensions.gin_trgm_ops)
WHERE source = 'douyin_miniapp';

CREATE INDEX marketing_leads_douyin_phone_trgm_idx
ON public.marketing_leads
USING gin (phone extensions.gin_trgm_ops)
WHERE source = 'douyin_miniapp';

CREATE INDEX marketing_leads_douyin_community_trgm_idx
ON public.marketing_leads
USING gin (community extensions.gin_trgm_ops)
WHERE source = 'douyin_miniapp';

COMMENT ON INDEX public.marketing_leads_douyin_name_trgm_idx
  IS '加速租户抖音线索姓名包含搜索';
COMMENT ON INDEX public.marketing_leads_douyin_phone_trgm_idx
  IS '加速租户抖音线索手机号包含搜索';
COMMENT ON INDEX public.marketing_leads_douyin_community_trgm_idx
  IS '加速租户抖音线索小区包含搜索';

COMMIT;
