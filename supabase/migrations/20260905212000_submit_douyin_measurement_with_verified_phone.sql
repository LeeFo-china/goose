BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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
) IS '使用抖音官方手机号授权结果提交量房预约；复用既有预约状态机并保持同幂等重放无额外验证记录';

COMMIT;
