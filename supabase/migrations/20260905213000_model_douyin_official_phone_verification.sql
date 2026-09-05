BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.douyin_measurement_appointments
  ALTER COLUMN sms_verification_code_id DROP NOT NULL;

ALTER TABLE public.douyin_measurement_appointments
  DROP CONSTRAINT IF EXISTS douyin_measurement_appointments_snapshot_check;

ALTER TABLE public.douyin_measurement_appointments
  ADD CONSTRAINT douyin_measurement_appointments_snapshot_check CHECK ((
    jsonb_typeof(source_snapshot) = 'object'
    AND source_snapshot - ARRAY[
      'privacy_policy_version', 'consented_at', 'attribution', 'demand',
      'budget_estimate', 'phone_verification_method'
    ] = '{}'::jsonb
    AND jsonb_typeof(source_snapshot->'privacy_policy_version') = 'string'
    AND jsonb_typeof(source_snapshot->'consented_at') = 'string'
    AND jsonb_typeof(source_snapshot->'attribution') = 'object'
    AND jsonb_typeof(source_snapshot->'demand') IN ('string', 'null')
    AND jsonb_typeof(source_snapshot->'budget_estimate') IN ('object', 'null')
    AND (
      NOT source_snapshot ? 'phone_verification_method'
      OR source_snapshot->>'phone_verification_method' IN ('sms', 'douyin_phone')
    )
    AND pg_column_size(source_snapshot) <= 65536
  ) IS TRUE);

ALTER TABLE public.douyin_measurement_appointments
  DROP CONSTRAINT IF EXISTS douyin_measurement_appointments_phone_verification_check;

ALTER TABLE public.douyin_measurement_appointments
  ADD CONSTRAINT douyin_measurement_appointments_phone_verification_check CHECK ((
    (
      sms_verification_code_id IS NOT NULL
      AND COALESCE(source_snapshot->>'phone_verification_method', 'sms') = 'sms'
    )
    OR (
      sms_verification_code_id IS NULL
      AND source_snapshot->>'phone_verification_method' = 'douyin_phone'
    )
  ) IS TRUE);

CREATE OR REPLACE FUNCTION public.douyin_measurement_appointment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
    AND current_setting('gooes.douyin_official_phone_cleanup', true) = '1'
    AND OLD.sms_verification_code_id IS NOT NULL
    AND NEW.sms_verification_code_id IS NULL
    AND NEW.source_snapshot = OLD.source_snapshot
      || jsonb_build_object('phone_verification_method', 'douyin_phone')
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.appointment_no IS NOT DISTINCT FROM OLD.appointment_no
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.douyin_miniapp_installation_id IS NOT DISTINCT FROM
      OLD.douyin_miniapp_installation_id
    AND NEW.marketing_lead_id IS NOT DISTINCT FROM OLD.marketing_lead_id
    AND NEW.customer_id IS NOT DISTINCT FROM OLD.customer_id
    AND NEW.budget_estimate_id IS NOT DISTINCT FROM OLD.budget_estimate_id
    AND NEW.preferred_visit_date IS NOT DISTINCT FROM OLD.preferred_visit_date
    AND NEW.preferred_visit_period IS NOT DISTINCT FROM OLD.preferred_visit_period
    AND NEW.community IS NOT DISTINCT FROM OLD.community
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.confirmed_visit_at IS NOT DISTINCT FROM OLD.confirmed_visit_at
    AND NEW.assigned_employee_id IS NOT DISTINCT FROM OLD.assigned_employee_id
    AND NEW.assigned_at IS NOT DISTINCT FROM OLD.assigned_at
    AND NEW.create_idempotency_key IS NOT DISTINCT FROM OLD.create_idempotency_key
    AND NEW.create_request_hash IS NOT DISTINCT FROM OLD.create_request_hash
    AND NEW.updated_existing IS NOT DISTINCT FROM OLD.updated_existing
    AND NEW.existing_customer_linked_at_submit IS NOT DISTINCT FROM
      OLD.existing_customer_linked_at_submit
    AND NEW.recent_pending_appointment_exists IS NOT DISTINCT FROM
      OLD.recent_pending_appointment_exists
    AND NEW.version IS NOT DISTINCT FROM OLD.version
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.appointment_no IS DISTINCT FROM OLD.appointment_no
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.douyin_miniapp_installation_id IS DISTINCT FROM OLD.douyin_miniapp_installation_id
    OR NEW.marketing_lead_id IS DISTINCT FROM OLD.marketing_lead_id
    OR NEW.budget_estimate_id IS DISTINCT FROM OLD.budget_estimate_id
    OR NEW.sms_verification_code_id IS DISTINCT FROM OLD.sms_verification_code_id
    OR NEW.preferred_visit_date IS DISTINCT FROM OLD.preferred_visit_date
    OR NEW.preferred_visit_period IS DISTINCT FROM OLD.preferred_visit_period
    OR NEW.community IS DISTINCT FROM OLD.community
    OR NEW.create_idempotency_key IS DISTINCT FROM OLD.create_idempotency_key
    OR NEW.create_request_hash IS DISTINCT FROM OLD.create_request_hash
    OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
    OR NEW.updated_existing IS DISTINCT FROM OLD.updated_existing
    OR NEW.existing_customer_linked_at_submit IS DISTINCT FROM OLD.existing_customer_linked_at_submit
    OR NEW.recent_pending_appointment_exists IS DISTINCT FROM OLD.recent_pending_appointment_exists
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_APPOINTMENT_IMMUTABLE';
  END IF;

  IF NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_APPOINTMENT_VERSION_MANAGED';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending_confirmation'
      AND NEW.status IN ('confirmed', 'canceled', 'invalid'))
    OR (OLD.status = 'confirmed'
      AND NEW.status IN ('completed', 'canceled', 'invalid'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_APPOINTMENT_TRANSITION_INVALID';
  END IF;

  IF OLD.version >= 2147483647 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_APPOINTMENT_VERSION_EXHAUSTED';
  END IF;
  NEW.version := OLD.version + 1;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_appointment_guard()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone(
  p_douyin_miniapp_installation_id uuid,
  p_tenant_id uuid,
  p_phone text,
  p_name text,
  p_community text,
  p_preferred_visit_date date,
  p_preferred_visit_period text,
  p_budget_estimate_id uuid,
  p_demand text,
  p_idempotency_key uuid,
  p_subject_hash text,
  p_request_ip text,
  p_user_agent text,
  p_privacy_policy_version text,
  p_consented_at timestamptz,
  p_attribution jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_request_hash bytea;
  v_appointment public.douyin_measurement_appointments%ROWTYPE;
  v_sms_id uuid;
  v_sms_code text;
  v_result jsonb;
  v_appointment_id uuid;
BEGIN
  IF p_douyin_miniapp_installation_id IS NULL
    OR p_tenant_id IS NULL
    OR p_phone IS NULL
    OR p_phone <> btrim(p_phone)
    OR p_phone !~ '^1[3-9][0-9]{9}$'
    OR p_name IS NULL
    OR p_name <> btrim(p_name)
    OR char_length(p_name) NOT BETWEEN 1 AND 40
    OR p_community IS NULL
    OR p_community <> btrim(p_community)
    OR char_length(p_community) NOT BETWEEN 1 AND 80
    OR p_preferred_visit_date IS NULL
    OR p_preferred_visit_period IS NULL
    OR p_preferred_visit_period NOT IN ('morning', 'afternoon', 'evening')
    OR p_demand IS NOT NULL
      AND (
        p_demand <> btrim(p_demand)
        OR char_length(p_demand) NOT BETWEEN 1 AND 1000
      )
    OR p_idempotency_key IS NULL
    OR p_subject_hash IS NULL
    OR p_subject_hash !~ '^[0-9a-f]{64}$'
    OR p_request_ip IS NOT NULL AND char_length(p_request_ip) > 64
    OR p_user_agent IS NOT NULL AND char_length(p_user_agent) > 512
    OR p_privacy_policy_version IS NULL
    OR p_privacy_policy_version <> btrim(p_privacy_policy_version)
    OR char_length(p_privacy_policy_version) NOT BETWEEN 1 AND 40
    OR p_consented_at IS NULL
    OR p_consented_at > v_now + interval '5 minutes'
    OR p_attribution IS NULL
    OR jsonb_typeof(p_attribution) <> 'object'
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_MEASUREMENT_COMMAND_INVALID'
      )
    );
  END IF;

  v_request_hash := extensions.digest(convert_to(jsonb_build_object(
    'installation_id', p_douyin_miniapp_installation_id,
    'tenant_id', p_tenant_id,
    'subject_hash', p_subject_hash,
    'phone', p_phone,
    'name', btrim(p_name),
    'community', btrim(p_community),
    'preferred_visit_date', p_preferred_visit_date,
    'preferred_visit_period', p_preferred_visit_period,
    'budget_estimate_id', p_budget_estimate_id,
    'demand', CASE WHEN p_demand IS NULL THEN NULL ELSE btrim(p_demand) END,
    'privacy_policy_version', btrim(p_privacy_policy_version),
    'consented_at', p_consented_at,
    'attribution', p_attribution
  )::text, 'UTF8'), 'sha256');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-measurement-idempotency:'
        || p_douyin_miniapp_installation_id::text
        || ':' || p_idempotency_key::text,
      20260821105000
    )
  );

  SELECT appointment.*
  INTO v_appointment
  FROM public.douyin_measurement_appointments AS appointment
  WHERE appointment.douyin_miniapp_installation_id =
      p_douyin_miniapp_installation_id
    AND appointment.create_idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_appointment.create_request_hash IS DISTINCT FROM v_request_hash THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 409,
          'code', 'DOUYIN_MEASUREMENT_IDEMPOTENCY_CONFLICT'
        )
      );
    END IF;
    RETURN jsonb_build_object(
      'data', jsonb_build_object(
        'lead_id', v_appointment.marketing_lead_id,
        'appointment_id', v_appointment.id,
        'appointment_no', v_appointment.appointment_no,
        'status', 'pending_confirmation',
        'already_submitted', true,
        'updated_existing', v_appointment.updated_existing,
        'existing_customer_linked',
          v_appointment.existing_customer_linked_at_submit,
        'recent_pending_appointment_exists',
          v_appointment.recent_pending_appointment_exists
      )
    );
  END IF;

  v_sms_code := lpad(
    floor(pg_catalog.random() * 1000000)::integer::text,
    6,
    '0'
  );

  INSERT INTO public.sms_verification_codes (
    phone,
    scene,
    code,
    status,
    expired_at,
    verified_at,
    request_ip,
    request_device
  ) VALUES (
    p_phone,
    'douyin_lead',
    v_sms_code,
    'pending',
    v_now + interval '5 minutes',
    NULL,
    p_request_ip,
    p_subject_hash
  )
  RETURNING id INTO v_sms_id;

  v_result := public.submit_douyin_measurement_appointment(
    p_douyin_miniapp_installation_id,
    p_tenant_id,
    p_phone,
    p_name,
    p_community,
    p_preferred_visit_date,
    p_preferred_visit_period,
    p_budget_estimate_id,
    p_demand,
    v_sms_code,
    p_idempotency_key,
    p_subject_hash,
    p_request_ip,
    p_user_agent,
    p_privacy_policy_version,
    p_consented_at,
    p_attribution
  );

  IF v_result ? 'error' THEN
    DELETE FROM public.sms_verification_codes AS sms
    WHERE sms.id = v_sms_id
      AND sms.status = 'pending';
    RETURN v_result;
  END IF;

  v_appointment_id := NULLIF(v_result #>> '{data,appointment_id}', '')::uuid;
  IF v_appointment_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_PHONE_CLEANUP_FAILED';
  END IF;

  PERFORM set_config('gooes.douyin_official_phone_cleanup', '1', true);

  UPDATE public.douyin_measurement_appointments
  SET sms_verification_code_id = NULL,
      source_snapshot = source_snapshot
        || jsonb_build_object('phone_verification_method', 'douyin_phone')
  WHERE id = v_appointment_id
    AND tenant_id = p_tenant_id
    AND douyin_miniapp_installation_id = p_douyin_miniapp_installation_id
    AND create_idempotency_key = p_idempotency_key
    AND sms_verification_code_id = v_sms_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_PHONE_CLEANUP_FAILED';
  END IF;

  DELETE FROM public.sms_verification_codes AS sms
  WHERE sms.id = v_sms_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_PHONE_CLEANUP_FAILED';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone(
  uuid, uuid, text, text, text, date, text, uuid, text, uuid,
  text, text, text, text, timestamptz, jsonb
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone(
  uuid, uuid, text, text, text, date, text, uuid, text, uuid,
  text, text, text, text, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone(
  uuid, uuid, text, text, text, date, text, uuid, text, uuid,
  text, text, text, text, timestamptz, jsonb
) IS '使用抖音官方手机号授权结果提交量房预约；成功后转为非SMS验证事实并清理临时验证记录';

COMMIT;
