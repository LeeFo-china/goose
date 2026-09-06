-- Tenant H5 leads join the existing command core; preserve IDs and ledger hashes.
-- No historical rows or permissions are rewritten.
-- Rollback: disable H5 commands first, then restore functions in a reviewed forward
-- migration. Keep immutable follow-ups/source facts and monotonically increasing versions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DROP INDEX public.customer_sources_customer_lead_without_appointment_uidx;
CREATE UNIQUE INDEX customer_sources_customer_lead_without_appointment_uidx
 ON public.customer_sources(customer_id, marketing_lead_id)
 WHERE douyin_measurement_appointment_id IS NULL
 AND marketing_lead_id IS NOT NULL AND source IN ('douyin_miniapp', 'h5');

CREATE INDEX marketing_leads_customer_created_idx ON public.marketing_leads(tenant_id, created_at DESC, id DESC)
 WHERE source IN ('douyin_miniapp', 'h5');
CREATE INDEX marketing_leads_customer_assignee_created_idx ON public.marketing_leads(tenant_id, assigned_employee_id, created_at DESC, id DESC)
 WHERE source IN ('douyin_miniapp', 'h5') AND assigned_employee_id IS NOT NULL;
CREATE INDEX marketing_leads_h5_name_trgm_idx ON public.marketing_leads USING gin(name extensions.gin_trgm_ops) WHERE source = 'h5';
CREATE INDEX marketing_leads_h5_phone_trgm_idx ON public.marketing_leads USING gin(phone extensions.gin_trgm_ops) WHERE source = 'h5';
CREATE INDEX marketing_leads_h5_community_trgm_idx ON public.marketing_leads USING gin(community extensions.gin_trgm_ops) WHERE source = 'h5';

CREATE OR REPLACE FUNCTION public.customer_lead_source_metadata(p_lead public.marketing_leads)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE WHEN p_lead.source = 'h5' THEN jsonb_build_object(
    'marketing_lead_id', p_lead.id, 'source', p_lead.source,
    'community', p_lead.community, 'page_id', p_lead.page_id,
    'page_version_id', p_lead.page_version_id
  ) ELSE jsonb_build_object(
    'installation_id', p_lead.douyin_miniapp_installation_id,
    'marketing_lead_id', p_lead.id,
    'source', p_lead.source,
    'community', p_lead.community
  ) END;
$function$;

CREATE OR REPLACE FUNCTION public.customer_lead_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_owner name;
  v_lead public.marketing_leads%ROWTYPE;
  v_is_ordinary boolean;
BEGIN
  v_is_ordinary := CASE TG_OP
    WHEN 'INSERT' THEN NEW.source IN ('douyin_miniapp', 'h5')
      AND NEW.marketing_lead_id IS NOT NULL
      AND NEW.douyin_measurement_appointment_id IS NULL
    WHEN 'DELETE' THEN OLD.source IN ('douyin_miniapp', 'h5')
      AND OLD.marketing_lead_id IS NOT NULL
      AND OLD.douyin_measurement_appointment_id IS NULL
    ELSE (OLD.source IN ('douyin_miniapp', 'h5') AND OLD.marketing_lead_id IS NOT NULL
      AND OLD.douyin_measurement_appointment_id IS NULL)
      OR (NEW.source IN ('douyin_miniapp', 'h5') AND NEW.marketing_lead_id IS NOT NULL
      AND NEW.douyin_measurement_appointment_id IS NULL)
  END;
  IF NOT v_is_ordinary THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'CUSTOMER_LEAD_SOURCE_IMMUTABLE';
  END IF;
  SELECT pg_get_userbyid(relowner) INTO v_owner
  FROM pg_class WHERE oid = TG_RELID;
  IF current_user <> v_owner THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'CUSTOMER_LEAD_SOURCE_DIRECT_WRITE_FORBIDDEN';
  END IF;
  SELECT lead.* INTO v_lead
  FROM public.marketing_leads AS lead
  WHERE lead.id = NEW.marketing_lead_id
    AND lead.tenant_id = NEW.tenant_id
    AND lead.customer_id = NEW.customer_id
    AND lead.source IN ('douyin_miniapp', 'h5');
  IF NOT FOUND OR NEW.source IS DISTINCT FROM v_lead.source
    OR NEW.source_label IS DISTINCT FROM (CASE WHEN v_lead.source = 'h5' THEN 'H5活动' ELSE '抖音小程序' END)
    OR NEW.metadata IS DISTINCT FROM public.customer_lead_source_metadata(v_lead)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'CUSTOMER_LEAD_SOURCE_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_customer_lead(
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
    AND lead.source IN ('douyin_miniapp', 'h5')
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

CREATE OR REPLACE FUNCTION public.mark_customer_lead_invalid(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_actor_employee_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key uuid
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
  v_result jsonb;
  v_appointments_updated integer := 0;
BEGIN
  IF p_tenant_id IS NULL
    OR p_marketing_lead_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_idempotency_key IS NULL
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_LEAD_INVALID_COMMAND_INVALID'
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
    'action', 'mark_invalid',
    'tenant_id', p_tenant_id,
    'lead_id', p_marketing_lead_id,
    'actor_employee_id', p_actor_employee_id,
    'reason', btrim(p_reason),
    'expected_version', p_expected_version
  )::text, 'UTF8'), 'sha256');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-lead-operation:' || p_tenant_id::text
        || ':mark_invalid:' || p_idempotency_key::text,
      20260821105000
    )
  );

  SELECT operation.*
  INTO v_operation
  FROM public.douyin_lead_workflow_operations AS operation
  WHERE operation.tenant_id = p_tenant_id
    AND operation.action = 'mark_invalid'
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

  SELECT lead.*
  INTO v_lead
  FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id
    AND lead.tenant_id = p_tenant_id
    AND lead.source IN ('douyin_miniapp', 'h5')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_LEAD_NOT_FOUND'
      )
    );
  END IF;

  IF v_lead.lead_status = 'converted' THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_LEAD_CONVERTED_NOT_INVALIDATABLE'
      )
    );
  END IF;

  IF v_lead.lead_status = 'invalid' THEN
    v_result := jsonb_build_object(
      'action', 'mark_invalid',
      'result', 'invalid',
      'lead_id', v_lead.id,
      'lead_version', v_lead.version,
      'appointments_updated', 0,
      'repeated_invalidation', true
    );
    INSERT INTO public.douyin_lead_workflow_operations (
      tenant_id, marketing_lead_id, actor_employee_id, action,
      idempotency_key, request_hash, result_payload, created_at
    ) VALUES (
      p_tenant_id, p_marketing_lead_id, p_actor_employee_id, 'mark_invalid',
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

  UPDATE public.marketing_leads AS lead
  SET lead_status = 'invalid',
      follow_remark = btrim(p_reason),
      followed_by = p_actor_employee_id,
      followed_at = v_now
  WHERE lead.id = v_lead.id
  RETURNING * INTO v_lead;

  UPDATE public.douyin_measurement_appointments
  SET status = CASE
        WHEN status = 'pending_confirmation' THEN 'invalid'
        WHEN status = 'confirmed' THEN 'canceled'
        ELSE status
      END
  WHERE tenant_id = p_tenant_id
    AND marketing_lead_id = p_marketing_lead_id
    AND status IN ('pending_confirmation', 'confirmed');
  GET DIAGNOSTICS v_appointments_updated = ROW_COUNT;

  v_result := jsonb_build_object(
    'action', 'mark_invalid',
    'result', 'invalid',
    'lead_id', v_lead.id,
    'lead_version', v_lead.version,
    'appointments_updated', v_appointments_updated,
    'repeated_invalidation', false
  );
  INSERT INTO public.douyin_lead_workflow_operations (
    tenant_id, marketing_lead_id, actor_employee_id, action,
    idempotency_key, request_hash, result_payload, created_at
  ) VALUES (
    p_tenant_id, p_marketing_lead_id, p_actor_employee_id, 'mark_invalid',
    p_idempotency_key, v_request_hash, v_result, v_now
  );

  RETURN jsonb_build_object(
    'data', v_result || jsonb_build_object('idempotent', false)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_customer_lead_follow_up(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_appointment_id uuid,
  p_actor_employee_id uuid,
  p_follow_up_type text,
  p_summary text,
  p_result text,
  p_next_follow_up_at timestamptz,
  p_appointment_status text,
  p_confirmed_visit_at timestamptz,
  p_expected_version integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_request_hash bytea;
  v_follow_up public.douyin_lead_follow_ups%ROWTYPE;
  v_lead public.marketing_leads%ROWTYPE;
  v_appointment public.douyin_measurement_appointments%ROWTYPE;
  v_follow_up_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL
    OR p_marketing_lead_id IS NULL
    OR (p_appointment_id IS NULL AND (p_appointment_status IS NOT NULL
      OR p_confirmed_visit_at IS NOT NULL))
    OR p_actor_employee_id IS NULL
    OR p_follow_up_type IS NULL
    OR p_follow_up_type NOT IN ('phone', 'wechat', 'online_meeting', 'onsite', 'other')
    OR p_summary IS NULL
    OR char_length(btrim(p_summary)) NOT BETWEEN 1 AND 500
    OR p_result IS NULL
    OR char_length(btrim(p_result)) NOT BETWEEN 1 AND 1000
    OR p_appointment_status IS NOT NULL
      AND p_appointment_status NOT IN ('confirmed', 'completed', 'canceled', 'invalid')
    OR p_appointment_status IS NULL AND p_confirmed_visit_at IS NOT NULL
    OR p_appointment_status = 'confirmed' AND p_confirmed_visit_at IS NULL
    OR p_appointment_status IS DISTINCT FROM 'confirmed'
      AND p_confirmed_visit_at IS NOT NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_idempotency_key IS NULL
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID'
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
    'action', 'follow_up',
    'tenant_id', p_tenant_id,
    'lead_id', p_marketing_lead_id,
    'appointment_id', p_appointment_id,
    'actor_employee_id', p_actor_employee_id,
    'follow_up_type', p_follow_up_type,
    'summary', btrim(p_summary),
    'result', btrim(p_result),
    'next_follow_up_at', p_next_follow_up_at,
    'appointment_status', p_appointment_status,
    'confirmed_visit_at', p_confirmed_visit_at,
    'expected_version', p_expected_version
  )::text, 'UTF8'), 'sha256');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-lead-follow-up:' || p_tenant_id::text
        || ':' || p_idempotency_key::text,
      20260821105000
    )
  );

  SELECT follow_up.*
  INTO v_follow_up
  FROM public.douyin_lead_follow_ups AS follow_up
  WHERE follow_up.tenant_id = p_tenant_id
    AND follow_up.create_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_follow_up.create_request_hash IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 409,
          'code', 'DOUYIN_LEAD_IDEMPOTENCY_CONFLICT'
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'data', v_follow_up.result_payload || jsonb_build_object(
        'idempotent', true
      )
    );
  END IF;

  SELECT lead.*
  INTO v_lead
  FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id
    AND lead.tenant_id = p_tenant_id
    AND lead.source IN ('douyin_miniapp', 'h5')
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
        'code', 'DOUYIN_LEAD_NOT_FOLLOWABLE'
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

  IF p_appointment_id IS NOT NULL AND v_lead.source = 'h5' THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400, 'code', 'DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID'));
  END IF;

  IF p_appointment_id IS NOT NULL THEN
  SELECT appointment.*
  INTO v_appointment
  FROM public.douyin_measurement_appointments AS appointment
  WHERE appointment.id = p_appointment_id
    AND appointment.tenant_id = p_tenant_id
    AND appointment.marketing_lead_id = p_marketing_lead_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 404,
        'code', 'DOUYIN_MEASUREMENT_APPOINTMENT_NOT_FOUND'
      )
    );
  END IF;

  IF p_appointment_status IS NOT NULL AND NOT (
    (v_appointment.status = 'pending_confirmation'
      AND p_appointment_status IN ('confirmed', 'canceled', 'invalid'))
    OR (v_appointment.status = 'confirmed'
      AND p_appointment_status IN ('completed', 'canceled', 'invalid'))
  ) THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID'
      )
    );
  END IF;

  IF p_appointment_status IS NOT NULL THEN
    UPDATE public.douyin_measurement_appointments AS appointment
    SET status = p_appointment_status,
        confirmed_visit_at = CASE
          WHEN p_appointment_status = 'confirmed' THEN p_confirmed_visit_at
          ELSE appointment.confirmed_visit_at
        END
    WHERE appointment.id = v_appointment.id
    RETURNING * INTO v_appointment;
  END IF;

  END IF;

  UPDATE public.marketing_leads AS lead
  SET lead_status = CASE WHEN lead_status = 'new' THEN 'contacted'
      ELSE lead_status END,
      followed_by = p_actor_employee_id,
      followed_at = v_now,
      follow_remark = btrim(p_summary)
  WHERE lead.id = v_lead.id
  RETURNING * INTO v_lead;

  v_result := jsonb_build_object(
    'action', 'follow_up',
    'result', 'followed_up',
    'follow_up_id', v_follow_up_id,
    'lead_id', v_lead.id,
    'appointment_id', v_appointment.id,
    'lead_version', v_lead.version,
    'appointment_version', v_appointment.version,
    'appointment_status', v_appointment.status,
    'idempotent', false
  );

  INSERT INTO public.douyin_lead_follow_ups (
    id,
    tenant_id,
    marketing_lead_id,
    douyin_measurement_appointment_id,
    employee_id,
    follow_up_type,
    summary,
    result,
    next_follow_up_at,
    create_idempotency_key,
    create_request_hash,
    result_payload,
    created_at
  ) VALUES (
    v_follow_up_id,
    p_tenant_id,
    p_marketing_lead_id,
    p_appointment_id,
    p_actor_employee_id,
    p_follow_up_type,
    btrim(p_summary),
    btrim(p_result),
    p_next_follow_up_at,
    p_idempotency_key,
    v_request_hash,
    v_result,
    v_now
  )
  RETURNING * INTO v_follow_up;

  RETURN jsonb_build_object('data', v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.convert_customer_lead_to_customer(
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
    IF v_operation.request_hash IS DISTINCT FROM v_request_hash AND (
      -- After first creation the HTTP preflight sees the recorded customer.
      -- Reconstruct only that original request; all other hash changes conflict.
      NOT p_allow_customer_create
      AND v_operation.result_payload->>'created_customer' = 'true'
      AND v_operation.result_payload->>'customer_id' = p_expected_customer_id::text
      AND v_operation.request_hash = extensions.digest(convert_to(jsonb_build_object(
        'action', 'convert',
        'tenant_id', p_tenant_id,
        'lead_id', p_marketing_lead_id,
        'actor_employee_id', p_actor_employee_id,
        'expected_version', p_expected_version,
        'expected_customer_id', NULL,
        'allow_customer_create', true
      )::text, 'UTF8'), 'sha256')
    ) IS NOT TRUE THEN
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
    AND lead.source IN ('douyin_miniapp', 'h5');
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
    AND lead.source IN ('douyin_miniapp', 'h5')
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
      CASE WHEN v_lead.source = 'h5' THEN 'h5_campaign' ELSE 'douyin' END,
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

  -- A lead without appointments still contributes exactly one source fact.
  INSERT INTO public.customer_sources (
    tenant_id, customer_id, source, source_label, marketing_lead_id,
    assigned_by_employee_id, assigned_at, metadata
  )
  SELECT p_tenant_id, v_customer.id, v_lead.source,
    CASE WHEN v_lead.source = 'h5' THEN 'H5活动' ELSE '抖音小程序' END,
    v_lead.id, p_actor_employee_id, v_now,
    public.customer_lead_source_metadata(v_lead)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.douyin_measurement_appointments AS appointment
    WHERE appointment.tenant_id = p_tenant_id
      AND appointment.marketing_lead_id = p_marketing_lead_id
  )
  ON CONFLICT (customer_id, marketing_lead_id)
    WHERE douyin_measurement_appointment_id IS NULL
      AND marketing_lead_id IS NOT NULL AND source IN ('douyin_miniapp', 'h5')
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

CREATE OR REPLACE FUNCTION public.assign_douyin_lead(
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
BEGIN
  PERFORM lead.id FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 404, 'code', 'DOUYIN_LEAD_NOT_FOUND'));
  END IF;
  RETURN public.assign_customer_lead(p_tenant_id, p_marketing_lead_id, p_actor_employee_id, p_assigned_employee_id, p_expected_version, p_idempotency_key, p_expected_assignee_department_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_douyin_lead_follow_up(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_appointment_id uuid,
  p_actor_employee_id uuid,
  p_follow_up_type text,
  p_summary text,
  p_result text,
  p_next_follow_up_at timestamptz,
  p_appointment_status text,
  p_confirmed_visit_at timestamptz,
  p_expected_version integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM lead.id FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 404, 'code', 'DOUYIN_LEAD_NOT_FOUND'));
  END IF;
  IF p_appointment_id IS NULL THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400, 'code', 'DOUYIN_LEAD_FOLLOW_UP_COMMAND_INVALID'
    ));
  END IF;
  RETURN public.append_customer_lead_follow_up(p_tenant_id, p_marketing_lead_id, p_appointment_id, p_actor_employee_id, p_follow_up_type, p_summary, p_result, p_next_follow_up_at, p_appointment_status, p_confirmed_visit_at, p_expected_version, p_idempotency_key);
END;
$function$;

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
BEGIN
  PERFORM lead.id FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 404, 'code', 'DOUYIN_LEAD_NOT_FOUND'));
  END IF;
  RETURN public.convert_customer_lead_to_customer(p_tenant_id, p_marketing_lead_id, p_actor_employee_id, p_expected_version, p_idempotency_key, p_expected_customer_id, p_allow_customer_create);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_douyin_lead_invalid(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_actor_employee_id uuid,
  p_reason text,
  p_expected_version integer,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  PERFORM lead.id FROM public.marketing_leads AS lead
  WHERE lead.id = p_marketing_lead_id AND lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 404, 'code', 'DOUYIN_LEAD_NOT_FOUND'));
  END IF;
  RETURN public.mark_customer_lead_invalid(p_tenant_id, p_marketing_lead_id, p_actor_employee_id, p_reason, p_expected_version, p_idempotency_key);
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_tenant_customer_leads(
  p_tenant_id uuid,
  p_visible_assignee_ids uuid[],
  p_status text,
  p_assignee_id uuid,
  p_date_from timestamptz,
  p_date_to_exclusive timestamptz,
  p_keyword text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_source text DEFAULT NULL,
  p_assignment text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_keyword text;
  v_list jsonb;
  v_total bigint;
BEGIN
  v_keyword := NULLIF(pg_catalog.btrim(p_keyword), '');
  IF p_tenant_id IS NULL
    OR (p_source IS NOT NULL AND p_source NOT IN ('douyin_miniapp', 'h5'))
    OR p_assignment IS NULL OR p_assignment NOT IN ('all', 'assigned', 'unassigned')
    OR (p_assignment = 'unassigned' AND p_assignee_id IS NOT NULL)
    OR p_page IS NULL OR p_page < 1 OR p_page > 10000
    OR p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
    OR (p_status IS NOT NULL AND p_status NOT IN (
      'new', 'contacted', 'converted', 'invalid'
    ))
    OR (p_keyword IS NOT NULL AND p_keyword IS DISTINCT FROM pg_catalog.btrim(p_keyword))
    OR (v_keyword IS NOT NULL AND (
      pg_catalog.char_length(v_keyword) > 80
      OR v_keyword !~ '^[[:alnum:][:space:]#号栋室-]+$'
    ))
    OR (p_date_from IS NOT NULL AND p_date_to_exclusive IS NOT NULL
      AND p_date_from >= p_date_to_exclusive)
    OR (p_visible_assignee_ids IS NOT NULL
      AND pg_catalog.array_position(p_visible_assignee_ids, NULL) IS NOT NULL)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'DOUYIN_LEAD_LIST_COMMAND_INVALID';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_total
  FROM public.marketing_leads AS lead
  WHERE lead.tenant_id = p_tenant_id
    AND lead.source IN ('douyin_miniapp', 'h5')
    AND (p_source IS NULL OR lead.source = p_source)
    AND (p_assignment = 'all'
      OR (p_assignment = 'assigned' AND lead.assigned_employee_id IS NOT NULL)
      OR (p_assignment = 'unassigned' AND lead.assigned_employee_id IS NULL))
    AND (p_visible_assignee_ids IS NULL
      OR lead.assigned_employee_id = ANY(p_visible_assignee_ids))
    AND (p_status IS NULL OR lead.lead_status = p_status)
    AND (p_assignee_id IS NULL OR lead.assigned_employee_id = p_assignee_id)
    AND (p_date_from IS NULL OR lead.created_at >= p_date_from)
    AND (p_date_to_exclusive IS NULL OR lead.created_at < p_date_to_exclusive)
    AND (v_keyword IS NULL OR lead.name ILIKE '%' || v_keyword || '%'
      OR lead.phone ILIKE '%' || v_keyword || '%'
      OR lead.community ILIKE '%' || v_keyword || '%');

  SELECT COALESCE(pg_catalog.jsonb_agg(page.item ORDER BY page.created_at DESC,
    page.id DESC), '[]'::jsonb)
  INTO v_list
  FROM (
    SELECT lead.id, lead.created_at, pg_catalog.jsonb_build_object(
      'id', lead.id,
      'tenant_id', lead.tenant_id,
      'source', lead.source,
      'page_id', lead.page_id,
      'page_version_id', lead.page_version_id,
      'douyin_miniapp_installation_id', lead.douyin_miniapp_installation_id,
      'customer_id', lead.customer_id,
      'assigned_employee_id', lead.assigned_employee_id,
      'name', lead.name,
      'phone', lead.phone,
      'community', lead.community,
      'lead_status', lead.lead_status,
      'created_at', lead.created_at,
      'followed_at', lead.followed_at,
      'follow_remark', lead.follow_remark,
      'version', lead.version
    ) AS item
    FROM public.marketing_leads AS lead
    WHERE lead.tenant_id = p_tenant_id
      AND lead.source IN ('douyin_miniapp', 'h5')
    AND (p_source IS NULL OR lead.source = p_source)
    AND (p_assignment = 'all'
      OR (p_assignment = 'assigned' AND lead.assigned_employee_id IS NOT NULL)
      OR (p_assignment = 'unassigned' AND lead.assigned_employee_id IS NULL))
      AND (p_visible_assignee_ids IS NULL
        OR lead.assigned_employee_id = ANY(p_visible_assignee_ids))
      AND (p_status IS NULL OR lead.lead_status = p_status)
      AND (p_assignee_id IS NULL OR lead.assigned_employee_id = p_assignee_id)
      AND (p_date_from IS NULL OR lead.created_at >= p_date_from)
      AND (p_date_to_exclusive IS NULL OR lead.created_at < p_date_to_exclusive)
      AND (v_keyword IS NULL OR lead.name ILIKE '%' || v_keyword || '%'
        OR lead.phone ILIKE '%' || v_keyword || '%'
        OR lead.community ILIKE '%' || v_keyword || '%')
    ORDER BY lead.created_at DESC, lead.id DESC
    OFFSET (p_page - 1) * p_page_size
    LIMIT p_page_size
  ) AS page;

  RETURN pg_catalog.jsonb_build_object(
    'data', pg_catalog.jsonb_build_object('list', v_list, 'total', v_total)
  );
END;
$$;

-- H5 capture remains a service-role INSERT/UPDATE path. Protect workflow fields
-- while preserving existing duplicate-submission enrichment and customer matches.
CREATE FUNCTION public.h5_customer_lead_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_owner name;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source = 'h5' THEN
    IF NEW.source IS DISTINCT FROM OLD.source OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.page_id IS DISTINCT FROM OLD.page_id
      OR (OLD.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id)
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_OWNERSHIP_IMMUTABLE';
    END IF;
    IF NEW.version IS DISTINCT FROM OLD.version OR OLD.version >= 2147483647 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_VERSION_MANAGED';
    END IF;
  END IF;
  IF NEW.source <> 'h5' THEN RETURN NEW; END IF;
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid = TG_RELID;
  IF NEW.tenant_id IS NOT NULL THEN
    IF current_user <> v_owner THEN
      IF current_user <> 'service_role' OR (TG_OP = 'INSERT' AND (
        NEW.lead_status <> 'new' OR NEW.assigned_employee_id IS NOT NULL
        OR NEW.assigned_at IS NOT NULL OR NEW.followed_by IS NOT NULL
        OR NEW.followed_at IS NOT NULL OR NEW.follow_remark IS NOT NULL
        OR NEW.version <> 1
      )) OR (TG_OP = 'UPDATE' AND (
        (to_jsonb(NEW) - ARRAY['page_version_id','name','phone','community','city',
          'form_data','request_ip','user_agent','wx_openid','customer_id'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['page_version_id','name','phone','community','city',
          'form_data','request_ip','user_agent','wx_openid','customer_id'])
      )) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_DIRECT_WRITE_FORBIDDEN';
      END IF;
    END IF;
    IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.customers WHERE id = NEW.customer_id
        AND tenant_id = NEW.tenant_id AND phone IS NOT DISTINCT FROM NEW.phone
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_CUSTOMER_SCOPE_INVALID';
    END IF;
    IF NEW.assigned_employee_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.employees WHERE id = NEW.assigned_employee_id AND tenant_id = NEW.tenant_id
    ) OR NEW.followed_by IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.employees WHERE id = NEW.followed_by AND tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_EMPLOYEE_SCOPE_INVALID';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.source = 'h5' THEN NEW.version := OLD.version + 1; END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER h5_customer_lead_guard BEFORE INSERT OR UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.h5_customer_lead_guard();
REVOKE ALL ON FUNCTION public.h5_customer_lead_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Physical follow-up storage is shared. Only trusted commands may append, and
-- the optional appointment must belong to the same Douyin lead.
CREATE FUNCTION public.customer_lead_follow_up_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_owner name;
  v_source text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid = TG_RELID;
  IF current_user <> v_owner THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_FOLLOW_UP_DIRECT_WRITE_FORBIDDEN';
  END IF;
  SELECT source INTO v_source FROM public.marketing_leads
    WHERE id = NEW.marketing_lead_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR v_source NOT IN ('douyin_miniapp', 'h5')
    OR NOT EXISTS (SELECT 1 FROM public.employees
      WHERE id = NEW.employee_id AND tenant_id = NEW.tenant_id)
    OR (NEW.douyin_measurement_appointment_id IS NOT NULL AND (
      v_source <> 'douyin_miniapp' OR NOT EXISTS (
        SELECT 1 FROM public.douyin_measurement_appointments
        WHERE id = NEW.douyin_measurement_appointment_id
          AND tenant_id = NEW.tenant_id AND marketing_lead_id = NEW.marketing_lead_id
      )))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_FOLLOW_UP_SCOPE_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER customer_lead_follow_up_guard BEFORE INSERT ON public.douyin_lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.customer_lead_follow_up_guard();
REVOKE ALL ON FUNCTION public.customer_lead_follow_up_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Capture RPCs only produce Douyin appointments. Keep that invariant at the
-- physical relation as generic lead commands now also accept H5 IDs.
CREATE FUNCTION public.customer_lead_appointment_source_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.marketing_leads
    WHERE id = NEW.marketing_lead_id AND tenant_id = NEW.tenant_id
      AND source = 'douyin_miniapp'
      AND douyin_miniapp_installation_id = NEW.douyin_miniapp_installation_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CUSTOMER_LEAD_APPOINTMENT_SOURCE_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER customer_lead_appointment_source_guard
  BEFORE INSERT ON public.douyin_measurement_appointments
  FOR EACH ROW EXECUTE FUNCTION public.customer_lead_appointment_source_guard();
REVOKE ALL ON FUNCTION public.customer_lead_appointment_source_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Existing function ACLs and owners survive CREATE OR REPLACE. New private
-- trigger helpers use the table owner just like the existing command helpers.
DO $owners$
DECLARE v_owner name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class
    WHERE oid = 'public.marketing_leads'::regclass;
  EXECUTE format('ALTER FUNCTION public.h5_customer_lead_guard() OWNER TO %I', v_owner);
  EXECUTE format('ALTER FUNCTION public.customer_lead_follow_up_guard() OWNER TO %I', v_owner);
  EXECUTE format('ALTER FUNCTION public.customer_lead_appointment_source_guard() OWNER TO %I', v_owner);
END;
$owners$;
COMMIT;
