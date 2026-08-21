-- Reject stale customer-creation preflight for repeated seven-argument conversions.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.convert_douyin_lead_to_customer(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_expected_customer_id uuid,
  p_allow_customer_create boolean
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
  v_customer public.customers%ROWTYPE;
  v_result jsonb;
  v_phone text;
  v_customer_created boolean := false;
  v_appointments_updated integer := 0;
BEGIN
  IF p_tenant_id IS NULL
    OR p_marketing_lead_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_idempotency_key IS NULL
    OR p_allow_customer_create IS NULL
    OR (p_allow_customer_create AND p_expected_customer_id IS NOT NULL)
    OR (NOT p_allow_customer_create AND p_expected_customer_id IS NULL)
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_LEAD_CONVERT_COMMAND_INVALID'
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
    'action', 'convert',
    'tenant_id', p_tenant_id,
    'lead_id', p_marketing_lead_id,
    'actor_employee_id', p_actor_employee_id,
    'expected_version', p_expected_version,
    'expected_customer_id', p_expected_customer_id,
    'allow_customer_create', p_allow_customer_create
  )::text, 'UTF8'), 'sha256');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-lead-operation:' || p_tenant_id::text
        || ':convert:' || p_idempotency_key::text,
      20260821105600
    )
  );

  SELECT operation.*
  INTO v_operation
  FROM public.douyin_lead_workflow_operations AS operation
  WHERE operation.tenant_id = p_tenant_id
    AND operation.action = 'convert'
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

  SELECT lead.phone
  INTO v_phone
  FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id
    AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp';
  IF NOT FOUND OR v_phone IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_LEAD_NOT_FOUND'
      )
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-measurement-phone:' || p_tenant_id::text || ':' || v_phone,
      20260821105000
    )
  );

  SELECT lead.*
  INTO v_lead
  FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id
    AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp'
  FOR UPDATE;
  IF NOT FOUND OR v_lead.phone IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_LEAD_NOT_FOUND'
      )
    );
  END IF;
  IF v_lead.phone IS DISTINCT FROM v_phone THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_PHONE_CONFLICT'
      )
    );
  END IF;
  IF v_lead.lead_status = 'invalid' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_INVALID_NOT_CONVERTIBLE'
      )
    );
  END IF;

  SELECT customer.*
  INTO v_customer
  FROM public.customers AS customer
  WHERE customer.tenant_id = p_tenant_id
    AND customer.phone = v_lead.phone
  ORDER BY customer.created_at ASC, customer.id ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT p_allow_customer_create AND (
    v_customer.id IS NULL OR v_customer.id IS DISTINCT FROM p_expected_customer_id
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT'
      )
    );
  END IF;

  IF v_lead.lead_status = 'converted' THEN
    IF p_allow_customer_create THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 409,
          'code', 'DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT'
        )
      );
    END IF;
    IF v_lead.customer_id IS NULL
      OR v_customer.id IS NULL
      OR v_customer.id IS DISTINCT FROM v_lead.customer_id
    THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 500,
          'code', 'DOUYIN_LEAD_CONVERSION_STATE_INVALID'
        )
      );
    END IF;
    PERFORM appointment.id
    FROM public.douyin_measurement_appointments AS appointment
    WHERE appointment.tenant_id = p_tenant_id
      AND appointment.marketing_lead_id = p_marketing_lead_id
    ORDER BY appointment.id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.douyin_measurement_appointments AS appointment
      WHERE appointment.tenant_id = p_tenant_id
        AND appointment.marketing_lead_id = p_marketing_lead_id
        AND appointment.customer_id IS NOT NULL
        AND appointment.customer_id IS DISTINCT FROM v_customer.id
    ) THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 409,
          'code', 'DOUYIN_LEAD_APPOINTMENT_CUSTOMER_CONFLICT'
        )
      );
    END IF;

    v_result := jsonb_build_object(
      'action', 'convert',
      'result', 'converted',
      'lead_id', v_lead.id,
      'customer_id', v_customer.id,
      'created_customer', false,
      'repeated_conversion', true,
      'lead_version', v_lead.version,
      'appointments_updated', 0
    );
    INSERT INTO public.douyin_lead_workflow_operations (
      tenant_id, marketing_lead_id, actor_employee_id, action,
      idempotency_key, request_hash, result_payload, created_at
    ) VALUES (
      p_tenant_id, p_marketing_lead_id, p_actor_employee_id, 'convert',
      p_idempotency_key, v_request_hash, v_result, v_now
    );
    RETURN jsonb_build_object(
      'data', v_result || jsonb_build_object('idempotent', false)
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

  PERFORM appointment.id
  FROM public.douyin_measurement_appointments AS appointment
  WHERE appointment.tenant_id = p_tenant_id
    AND appointment.marketing_lead_id = p_marketing_lead_id
  ORDER BY appointment.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.douyin_measurement_appointments AS appointment
    WHERE appointment.tenant_id = p_tenant_id
      AND appointment.marketing_lead_id = p_marketing_lead_id
      AND appointment.customer_id IS NOT NULL
      AND (
        v_customer.id IS NULL
        OR appointment.customer_id IS DISTINCT FROM v_customer.id
      )
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_APPOINTMENT_CUSTOMER_CONFLICT'
      )
    );
  END IF;

  IF v_customer.id IS NULL THEN
    INSERT INTO public.customers (
      tenant_id, name, phone, status, source, owner_id
    ) VALUES (
      p_tenant_id,
      COALESCE(NULLIF(btrim(v_lead.name), ''), '客户' || right(v_lead.phone, 4)),
      v_lead.phone,
      'potential',
      'douyin',
      COALESCE(v_lead.assigned_employee_id, p_actor_employee_id)
    )
    ON CONFLICT (tenant_id, phone)
      WHERE tenant_id IS NOT NULL AND phone IS NOT NULL
    DO NOTHING
    RETURNING * INTO v_customer;
    v_customer_created := FOUND;

    IF NOT v_customer_created THEN
      SELECT customer.*
      INTO v_customer
      FROM public.customers AS customer
      WHERE customer.tenant_id = p_tenant_id
        AND customer.phone = v_lead.phone
      ORDER BY customer.created_at ASC, customer.id ASC
      LIMIT 1
      FOR UPDATE;
    END IF;
  END IF;

  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 500,
        'code', 'DOUYIN_LEAD_CUSTOMER_UPSERT_FAILED'
      )
    );
  END IF;

  UPDATE public.marketing_leads AS lead
  SET customer_id = v_customer.id,
      lead_status = 'converted',
      followed_by = p_actor_employee_id,
      followed_at = v_now
  WHERE lead.id = v_lead.id
  RETURNING * INTO v_lead;

  UPDATE public.douyin_measurement_appointments
  SET customer_id = v_customer.id
  WHERE tenant_id = p_tenant_id
    AND marketing_lead_id = p_marketing_lead_id
    AND customer_id IS NULL;
  GET DIAGNOSTICS v_appointments_updated = ROW_COUNT;

  INSERT INTO public.customer_sources (
    tenant_id,
    customer_id,
    source,
    source_label,
    marketing_lead_id,
    douyin_measurement_appointment_id,
    assigned_by_employee_id,
    assigned_at,
    metadata
  )
  SELECT
    appointment.tenant_id,
    v_customer.id,
    'douyin_miniapp',
    '抖音小程序',
    appointment.marketing_lead_id,
    appointment.id,
    p_actor_employee_id,
    v_now,
    public.douyin_measurement_source_metadata(appointment)
  FROM public.douyin_measurement_appointments AS appointment
  WHERE appointment.tenant_id = p_tenant_id
    AND appointment.marketing_lead_id = p_marketing_lead_id
    AND appointment.customer_id = v_customer.id
  ON CONFLICT (customer_id, douyin_measurement_appointment_id)
    WHERE douyin_measurement_appointment_id IS NOT NULL
  DO NOTHING;

  v_result := jsonb_build_object(
    'action', 'convert',
    'result', 'converted',
    'lead_id', v_lead.id,
    'customer_id', v_customer.id,
    'created_customer', v_customer_created,
    'repeated_conversion', false,
    'lead_version', v_lead.version,
    'appointments_updated', v_appointments_updated
  );
  INSERT INTO public.douyin_lead_workflow_operations (
    tenant_id, marketing_lead_id, actor_employee_id, action,
    idempotency_key, request_hash, result_payload, created_at
  ) VALUES (
    p_tenant_id, p_marketing_lead_id, p_actor_employee_id, 'convert',
    p_idempotency_key, v_request_hash, v_result, v_now
  );

  RETURN jsonb_build_object(
    'data', v_result || jsonb_build_object('idempotent', false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_douyin_lead_to_customer(
  uuid, uuid, uuid, integer, uuid, uuid, boolean
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_douyin_lead_to_customer(
  uuid, uuid, uuid, integer, uuid, uuid, boolean
) TO service_role;

COMMENT ON FUNCTION public.convert_douyin_lead_to_customer(
  uuid, uuid, uuid, integer, uuid, uuid, boolean
) IS '按授权预检结果原子转换抖音线索，并拒绝重复转换中的过期客户创建预检';

COMMIT;
