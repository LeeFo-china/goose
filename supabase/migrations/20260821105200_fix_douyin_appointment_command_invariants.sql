-- Forward repair only:
-- 1. The applied 105000 and 105100 migrations remain immutable.
-- 2. Submission replay returns the immutable initial appointment status.
-- 3. Reused leads follow the current tenant and phone customer identity.
-- 4. The obsolete global number sequence is dropped only after a dependency
--    preflight and with RESTRICT.
-- Roll back only through another reviewed forward migration.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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
    OR p_appointment_id IS NULL
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

CREATE OR REPLACE FUNCTION public.submit_douyin_measurement_appointment(
  p_douyin_miniapp_installation_id uuid,
  p_tenant_id uuid,
  p_phone text,
  p_name text,
  p_community text,
  p_preferred_visit_date date,
  p_preferred_visit_period text,
  p_budget_estimate_id uuid,
  p_demand text,
  p_sms_code text,
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
  v_expected_privacy_policy_version text;
  v_request_hash bytea;
  v_appointment public.douyin_measurement_appointments%ROWTYPE;
  v_sms public.sms_verification_codes%ROWTYPE;
  v_estimate public.douyin_budget_estimates%ROWTYPE;
  v_lead public.marketing_leads%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_source_snapshot jsonb;
  v_form_data jsonb;
  v_updated_existing boolean := false;
  v_recent_pending boolean := false;
  v_existing_customer_linked boolean := false;
  v_number_value integer;
  v_appointment_prefix text;
  v_appointment_no text;
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
    OR p_sms_code IS NULL
    OR p_sms_code !~ '^[0-9]{4,8}$'
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

  IF p_attribution - ARRAY[
      'source_type', 'entry_path', 'scene', 'campaign_code', 'content_id'
    ] <> '{}'::jsonb
    OR pg_column_size(p_attribution) > 2048
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(p_attribution) AS attribution(key, value)
      WHERE jsonb_typeof(attribution.value) <> 'string'
        OR char_length(attribution.value #>> '{}') NOT BETWEEN 1 AND 120
        OR attribution.value #>> '{}' <> btrim(attribution.value #>> '{}')
    )
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_MEASUREMENT_ATTRIBUTION_INVALID'
      )
    );
  END IF;

  SELECT installation.runtime_config ->> 'privacy_policy_version'
  INTO v_expected_privacy_policy_version
  FROM public.douyin_miniapp_installations AS installation
  JOIN public.tenants AS tenant ON tenant.id = installation.tenant_id
  WHERE installation.id = p_douyin_miniapp_installation_id
    AND installation.tenant_id = p_tenant_id
    AND installation.installation_kind = 'merchant'
    AND installation.authorization_status = 'active'
    AND tenant.status = 'active'
  FOR SHARE OF installation, tenant;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_MEASUREMENT_INSTALLATION_UNSUPPORTED'
      )
    );
  END IF;

  IF v_expected_privacy_policy_version IS NULL
    OR v_expected_privacy_policy_version IS DISTINCT FROM p_privacy_policy_version
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH'
      )
    );
  END IF;

  v_request_hash := extensions.digest(convert_to(jsonb_build_object(
    'installation_id', p_douyin_miniapp_installation_id,
    'tenant_id', p_tenant_id,
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sms:phone:douyin_lead:' || p_phone, 0)
  );

  SELECT sms.*
  INTO v_sms
  FROM public.sms_verification_codes AS sms
  WHERE sms.scene = 'douyin_lead'
    AND sms.phone = p_phone
  ORDER BY sms.created_at DESC, sms.id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND
    OR v_sms.status IS DISTINCT FROM 'pending'
    OR v_sms.request_device IS DISTINCT FROM p_subject_hash
    OR v_sms.code IS DISTINCT FROM p_sms_code
  THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_MEASUREMENT_SMS_INVALID'
      )
    );
  END IF;

  IF v_sms.expired_at <= v_now THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_MEASUREMENT_SMS_EXPIRED'
      )
    );
  END IF;

  IF p_budget_estimate_id IS NOT NULL THEN
    SELECT estimate.*
    INTO v_estimate
    FROM public.douyin_budget_estimates AS estimate
    WHERE estimate.id = p_budget_estimate_id
      AND estimate.tenant_id = p_tenant_id
      AND estimate.douyin_miniapp_installation_id =
        p_douyin_miniapp_installation_id
      AND estimate.subject_hash = p_subject_hash
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 404,
          'code', 'DOUYIN_MEASUREMENT_ESTIMATE_NOT_FOUND'
        )
      );
    END IF;
  END IF;

  v_source_snapshot := jsonb_build_object(
    'privacy_policy_version', btrim(p_privacy_policy_version),
    'consented_at', p_consented_at,
    'attribution', p_attribution,
    'demand', CASE WHEN p_demand IS NULL THEN NULL ELSE btrim(p_demand) END,
    'budget_estimate', CASE
      WHEN p_budget_estimate_id IS NULL THEN NULL
      ELSE public.douyin_measurement_estimate_snapshot(v_estimate, v_now)
    END
  );

  IF pg_column_size(v_source_snapshot) > 65536 THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 400,
        'code', 'DOUYIN_MEASUREMENT_SNAPSHOT_TOO_LARGE'
      )
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-measurement-phone:' || p_tenant_id::text || ':' || p_phone,
      20260821105000
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.marketing_leads AS recent_lead
    JOIN public.douyin_measurement_appointments AS recent_appointment
      ON recent_appointment.marketing_lead_id = recent_lead.id
      AND recent_appointment.tenant_id = recent_lead.tenant_id
    WHERE recent_lead.tenant_id = p_tenant_id
      AND recent_lead.source = 'douyin_miniapp'
      AND recent_lead.phone = p_phone
      AND recent_appointment.status IN ('pending_confirmation', 'confirmed')
      AND recent_appointment.created_at >= v_now - interval '24 hours'
    LIMIT 1
  ) INTO v_recent_pending;

  SELECT lead.*
  INTO v_lead
  FROM public.marketing_leads AS lead
  WHERE lead.tenant_id = p_tenant_id
    AND lead.source = 'douyin_miniapp'
    AND lead.phone = p_phone
    AND lead.lead_status IN ('new', 'contacted')
    AND lead.created_at >= v_now - interval '24 hours'
  ORDER BY lead.created_at DESC, lead.id DESC
  LIMIT 1
  FOR UPDATE;

  v_updated_existing := FOUND;

  SELECT customer.*
  INTO v_customer
  FROM public.customers AS customer
  WHERE customer.tenant_id = p_tenant_id
    AND customer.phone = p_phone
  ORDER BY customer.created_at ASC, customer.id ASC
  LIMIT 1
  FOR UPDATE;

  v_existing_customer_linked := FOUND;
  v_form_data := jsonb_build_object(
    'preferred_visit_date', p_preferred_visit_date,
    'preferred_visit_period', p_preferred_visit_period,
    'budget_estimate_id', p_budget_estimate_id,
    'demand', CASE WHEN p_demand IS NULL THEN NULL ELSE btrim(p_demand) END,
    'privacy_policy_version', btrim(p_privacy_policy_version),
    'consented_at', p_consented_at,
    'attribution', p_attribution
  );

  IF v_updated_existing THEN
    UPDATE public.marketing_leads AS lead
    SET douyin_miniapp_installation_id = p_douyin_miniapp_installation_id,
        name = btrim(p_name),
        community = btrim(p_community),
        form_data = v_form_data,
        customer_id = CASE
          WHEN v_existing_customer_linked THEN v_customer.id
          ELSE NULL
        END,
        request_ip = p_request_ip,
        user_agent = p_user_agent
    WHERE lead.id = v_lead.id
    RETURNING * INTO v_lead;
  ELSE
    INSERT INTO public.marketing_leads (
      tenant_id,
      douyin_miniapp_installation_id,
      name,
      phone,
      community,
      form_data,
      source,
      customer_id,
      request_ip,
      user_agent
    ) VALUES (
      p_tenant_id,
      p_douyin_miniapp_installation_id,
      btrim(p_name),
      p_phone,
      btrim(p_community),
      v_form_data,
      'douyin_miniapp',
      CASE WHEN v_existing_customer_linked THEN v_customer.id ELSE NULL END,
      p_request_ip,
      p_user_agent
    )
    RETURNING * INTO v_lead;
  END IF;

  v_appointment_prefix := 'DYLF-'
    || to_char(v_now AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD')
    || '-';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-measurement-appointment-number:' || v_appointment_prefix,
      20260821105100
    )
  );

  SELECT substring(appointment.appointment_no FROM 15 FOR 6)::integer
  INTO v_number_value
  FROM public.douyin_measurement_appointments AS appointment
  WHERE appointment.appointment_no >= v_appointment_prefix || '000001'
    AND appointment.appointment_no <= v_appointment_prefix || '999999'
  ORDER BY appointment.appointment_no DESC
  LIMIT 1;

  v_number_value := COALESCE(v_number_value, 0) + 1;
  IF v_number_value > 999999 THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_MEASUREMENT_NUMBER_EXHAUSTED'
      )
    );
  END IF;
  v_appointment_no := v_appointment_prefix
    || lpad(v_number_value::text, 6, '0');

  INSERT INTO public.douyin_measurement_appointments (
    appointment_no,
    tenant_id,
    douyin_miniapp_installation_id,
    marketing_lead_id,
    customer_id,
    budget_estimate_id,
    sms_verification_code_id,
    preferred_visit_date,
    preferred_visit_period,
    community,
    source_snapshot,
    create_idempotency_key,
    create_request_hash,
    updated_existing,
    existing_customer_linked_at_submit,
    recent_pending_appointment_exists,
    created_at,
    updated_at
  ) VALUES (
    v_appointment_no,
    p_tenant_id,
    p_douyin_miniapp_installation_id,
    v_lead.id,
    CASE WHEN v_existing_customer_linked THEN v_customer.id ELSE NULL END,
    p_budget_estimate_id,
    v_sms.id,
    p_preferred_visit_date,
    p_preferred_visit_period,
    btrim(p_community),
    v_source_snapshot,
    p_idempotency_key,
    v_request_hash,
    v_updated_existing,
    v_existing_customer_linked,
    v_recent_pending,
    v_now,
    v_now
  )
  RETURNING * INTO v_appointment;

  IF v_existing_customer_linked THEN
    INSERT INTO public.customer_sources (
      tenant_id,
      customer_id,
      source,
      source_label,
      marketing_lead_id,
      douyin_measurement_appointment_id,
      assigned_at,
      metadata
    ) VALUES (
      p_tenant_id,
      v_customer.id,
      'douyin_miniapp',
      '抖音小程序',
      v_lead.id,
      v_appointment.id,
      v_now,
      public.douyin_measurement_source_metadata(v_appointment)
    )
    ON CONFLICT (customer_id, douyin_measurement_appointment_id)
      WHERE douyin_measurement_appointment_id IS NOT NULL
    DO NOTHING;
  END IF;

  UPDATE public.sms_verification_codes
  SET status = 'verified',
      verified_at = v_now
  WHERE id = v_sms.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_MEASUREMENT_SMS_CONSUME_CONFLICT'
      )
    );
  END IF;

  INSERT INTO public.marketing_events (
    tenant_id,
    douyin_miniapp_installation_id,
    source,
    subject_hash,
    event_name,
    payload,
    request_ip,
    user_agent,
    created_at
  ) VALUES
    (
      p_tenant_id,
      p_douyin_miniapp_installation_id,
      'douyin_miniapp',
      p_subject_hash,
      'lead_submit',
      p_attribution || jsonb_build_object(
        'lead_id', v_lead.id,
        'appointment_id', v_appointment.id
      ),
      p_request_ip,
      p_user_agent,
      v_now
    ),
    (
      p_tenant_id,
      p_douyin_miniapp_installation_id,
      'douyin_miniapp',
      p_subject_hash,
      'lead_submit_success',
      p_attribution || jsonb_build_object(
        'lead_id', v_lead.id,
        'appointment_id', v_appointment.id
      ),
      p_request_ip,
      p_user_agent,
      v_now
    );

  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'lead_id', v_lead.id,
      'appointment_id', v_appointment.id,
      'appointment_no', v_appointment.appointment_no,
      'status', v_appointment.status,
      'already_submitted', false,
      'updated_existing', v_updated_existing,
      'existing_customer_linked', v_existing_customer_linked,
      'recent_pending_appointment_exists', v_recent_pending
    )
  );
END;
$function$;

DO $block$
DECLARE
  v_sequence regclass;
BEGIN
  v_sequence := to_regclass(
    'public.douyin_measurement_appointment_number_seq'
  );
  IF v_sequence IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_APPOINTMENT_NUMBER_SEQUENCE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dependency
    WHERE dependency.refobjid = v_sequence
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_APPOINTMENT_NUMBER_SEQUENCE_IN_USE';
  END IF;
END;
$block$;

DROP SEQUENCE public.douyin_measurement_appointment_number_seq RESTRICT;


REVOKE ALL ON FUNCTION public.append_douyin_lead_follow_up(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz,
  text, timestamptz, integer, uuid
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.append_douyin_lead_follow_up(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz,
  text, timestamptz, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.submit_douyin_measurement_appointment(
  uuid, uuid, text, text, text, date, text, uuid, text, text, uuid,
  text, text, text, text, timestamptz, jsonb
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_douyin_measurement_appointment(
  uuid, uuid, text, text, text, date, text, uuid, text, text, uuid,
  text, text, text, text, timestamptz, jsonb
) TO service_role;

COMMENT ON FUNCTION public.submit_douyin_measurement_appointment(
  uuid, uuid, text, text, text, date, text, uuid, text, text, uuid,
  text, text, text, text, timestamptz, jsonb
) IS '提交量房预约；重放保持首发状态，lead customer 以当前租户手机号为准';

COMMIT;
