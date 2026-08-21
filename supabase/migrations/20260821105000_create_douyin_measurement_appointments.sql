-- Forward rollback only:
-- 1. Disable public appointment submission and tenant lead mutations.
-- 2. Revoke EXECUTE on the five commands and let in-flight transactions end.
-- 3. Preserve and export every lead, appointment, follow-up, source and customer.
-- 4. In a reviewed forward migration, remove commands, triggers, indexes and
--    schema objects in dependency order. Never bulk-delete business history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.customers AS customer
    WHERE customer.tenant_id IS NULL
  ) OR EXISTS (
    SELECT customer.id, customer.tenant_id
    FROM public.customers AS customer
    GROUP BY customer.id, customer.tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_IDENTITY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.marketing_leads AS lead
    WHERE lead.source = 'douyin_miniapp'
      AND lead.tenant_id IS NULL
  ) OR EXISTS (
    SELECT lead.id, lead.tenant_id
    FROM public.marketing_leads AS lead
    GROUP BY lead.id, lead.tenant_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_LEAD_IDENTITY_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.marketing_leads AS lead
    JOIN public.customers AS customer ON customer.id = lead.customer_id
    WHERE lead.source = 'douyin_miniapp'
      AND customer.tenant_id IS DISTINCT FROM lead.tenant_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_LEAD_CUSTOMER_SCOPE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_sources AS source
    JOIN public.customers AS customer ON customer.id = source.customer_id
    WHERE customer.tenant_id IS DISTINCT FROM source.tenant_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_SOURCE_CUSTOMER_SCOPE_INVALID';
  END IF;
END;
$block$;

ALTER TABLE public.customers
ADD CONSTRAINT customers_id_tenant_key UNIQUE (id, tenant_id);

ALTER TABLE public.marketing_leads
ADD COLUMN assigned_employee_id uuid NULL,
ADD COLUMN assigned_at timestamptz NULL,
ADD COLUMN version integer NOT NULL DEFAULT 1,
ADD CONSTRAINT marketing_leads_id_tenant_key UNIQUE (id, tenant_id),
ADD CONSTRAINT marketing_leads_assignee_tenant_fkey
  FOREIGN KEY (assigned_employee_id, tenant_id)
  REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT marketing_leads_assignment_shape_check CHECK ((
  (assigned_employee_id IS NULL AND assigned_at IS NULL)
  OR (assigned_employee_id IS NOT NULL AND assigned_at IS NOT NULL)
) IS TRUE),
ADD CONSTRAINT marketing_leads_version_check CHECK ((
  version BETWEEN 1 AND 2147483647
) IS TRUE);

CREATE SEQUENCE public.douyin_measurement_appointment_number_seq
AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE TABLE public.douyin_measurement_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_no text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  douyin_miniapp_installation_id uuid NOT NULL,
  marketing_lead_id uuid NOT NULL,
  customer_id uuid NULL,
  budget_estimate_id uuid NULL,
  sms_verification_code_id uuid NOT NULL UNIQUE
    REFERENCES public.sms_verification_codes(id) ON DELETE RESTRICT,
  preferred_visit_date date NOT NULL,
  preferred_visit_period text NOT NULL,
  community text NOT NULL,
  status text NOT NULL DEFAULT 'pending_confirmation',
  confirmed_visit_at timestamptz NULL,
  assigned_employee_id uuid NULL,
  assigned_at timestamptz NULL,
  create_idempotency_key uuid NOT NULL,
  create_request_hash bytea NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_existing boolean NOT NULL,
  existing_customer_linked_at_submit boolean NOT NULL,
  recent_pending_appointment_exists boolean NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT douyin_measurement_appointments_installation_tenant_fkey
    FOREIGN KEY (douyin_miniapp_installation_id, tenant_id)
    REFERENCES public.douyin_miniapp_installations(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT douyin_measurement_appointments_lead_tenant_fkey
    FOREIGN KEY (marketing_lead_id, tenant_id)
    REFERENCES public.marketing_leads(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_measurement_appointments_customer_tenant_fkey
    FOREIGN KEY (customer_id, tenant_id)
    REFERENCES public.customers(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_measurement_appointments_estimate_tenant_fkey
    FOREIGN KEY (budget_estimate_id, tenant_id)
    REFERENCES public.douyin_budget_estimates(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_measurement_appointments_assignee_tenant_fkey
    FOREIGN KEY (assigned_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_measurement_appointments_idempotency_unique
    UNIQUE (douyin_miniapp_installation_id, create_idempotency_key),
  CONSTRAINT douyin_measurement_appointments_identity_owner_key
    UNIQUE (id, tenant_id),
  CONSTRAINT douyin_measurement_appointments_number_check CHECK ((
    appointment_no ~ '^DYLF-[0-9]{8}-[0-9]{6}$'
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_period_check CHECK ((
    preferred_visit_period IN ('morning', 'afternoon', 'evening')
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_community_check CHECK ((
    community = btrim(community)
    AND char_length(community) BETWEEN 1 AND 80
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_status_check CHECK ((
    status IN ('pending_confirmation', 'confirmed', 'completed', 'canceled', 'invalid')
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_confirmed_shape_check CHECK ((
    (status = 'pending_confirmation' AND confirmed_visit_at IS NULL)
    OR (status IN ('confirmed', 'completed') AND confirmed_visit_at IS NOT NULL)
    OR status IN ('canceled', 'invalid')
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_assignment_shape_check CHECK ((
    (assigned_employee_id IS NULL AND assigned_at IS NULL)
    OR (assigned_employee_id IS NOT NULL AND assigned_at IS NOT NULL)
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_hash_check CHECK ((
    octet_length(create_request_hash) = 32
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_snapshot_check CHECK ((
    jsonb_typeof(source_snapshot) = 'object'
    AND source_snapshot - ARRAY[
      'privacy_policy_version', 'consented_at', 'attribution', 'demand',
      'budget_estimate'
    ] = '{}'::jsonb
    AND jsonb_typeof(source_snapshot->'privacy_policy_version') = 'string'
    AND jsonb_typeof(source_snapshot->'consented_at') = 'string'
    AND jsonb_typeof(source_snapshot->'attribution') = 'object'
    AND jsonb_typeof(source_snapshot->'demand') IN ('string', 'null')
    AND jsonb_typeof(source_snapshot->'budget_estimate') IN ('object', 'null')
    AND pg_column_size(source_snapshot) <= 65536
  ) IS TRUE),
  CONSTRAINT douyin_measurement_appointments_version_check CHECK ((
    version BETWEEN 1 AND 2147483647
  ) IS TRUE)
);

CREATE TABLE public.douyin_lead_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  marketing_lead_id uuid NOT NULL,
  douyin_measurement_appointment_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  follow_up_type text NOT NULL,
  summary text NOT NULL,
  result text NOT NULL,
  next_follow_up_at timestamptz NULL,
  create_idempotency_key uuid NOT NULL,
  create_request_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT douyin_lead_follow_ups_lead_tenant_fkey
    FOREIGN KEY (marketing_lead_id, tenant_id)
    REFERENCES public.marketing_leads(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_lead_follow_ups_appointment_tenant_fkey
    FOREIGN KEY (douyin_measurement_appointment_id, tenant_id)
    REFERENCES public.douyin_measurement_appointments(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT douyin_lead_follow_ups_employee_tenant_fkey
    FOREIGN KEY (employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_lead_follow_ups_idempotency_unique
    UNIQUE (tenant_id, create_idempotency_key),
  CONSTRAINT douyin_lead_follow_ups_type_check CHECK ((
    follow_up_type IN ('phone', 'wechat', 'online_meeting', 'onsite', 'other')
  ) IS TRUE),
  CONSTRAINT douyin_lead_follow_ups_text_check CHECK ((
    char_length(btrim(summary)) BETWEEN 1 AND 500
    AND char_length(btrim(result)) BETWEEN 1 AND 1000
  ) IS TRUE),
  CONSTRAINT douyin_lead_follow_ups_hash_check CHECK ((
    octet_length(create_request_hash) = 32
  ) IS TRUE)
);

CREATE TABLE public.douyin_lead_workflow_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  marketing_lead_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL,
  action text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash bytea NOT NULL,
  result_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT douyin_lead_workflow_operations_lead_tenant_fkey
    FOREIGN KEY (marketing_lead_id, tenant_id)
    REFERENCES public.marketing_leads(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_lead_workflow_operations_actor_tenant_fkey
    FOREIGN KEY (actor_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_lead_workflow_operations_idempotency_unique
    UNIQUE (tenant_id, action, idempotency_key),
  CONSTRAINT douyin_lead_workflow_operations_action_check CHECK ((
    action IN ('assign', 'convert', 'mark_invalid')
  ) IS TRUE),
  CONSTRAINT douyin_lead_workflow_operations_hash_check CHECK ((
    octet_length(request_hash) = 32
  ) IS TRUE),
  CONSTRAINT douyin_lead_workflow_operations_result_check CHECK ((
    jsonb_typeof(result_payload) = 'object'
    AND pg_column_size(result_payload) <= 8192
  ) IS TRUE)
);

ALTER TABLE public.customer_sources
ADD COLUMN marketing_lead_id uuid NULL,
ADD COLUMN douyin_measurement_appointment_id uuid NULL,
ADD CONSTRAINT customer_sources_marketing_lead_tenant_fkey
  FOREIGN KEY (marketing_lead_id, tenant_id)
  REFERENCES public.marketing_leads(id, tenant_id) ON DELETE RESTRICT,
ADD CONSTRAINT customer_sources_measurement_appointment_tenant_fkey
  FOREIGN KEY (douyin_measurement_appointment_id, tenant_id)
  REFERENCES public.douyin_measurement_appointments(id, tenant_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX customer_sources_measurement_appointment_unique_idx
ON public.customer_sources(customer_id, douyin_measurement_appointment_id)
WHERE douyin_measurement_appointment_id IS NOT NULL;

CREATE INDEX customer_sources_marketing_lead_idx
ON public.customer_sources(marketing_lead_id)
WHERE marketing_lead_id IS NOT NULL;

CREATE INDEX customer_sources_measurement_appointment_idx
ON public.customer_sources(douyin_measurement_appointment_id)
WHERE douyin_measurement_appointment_id IS NOT NULL;

CREATE INDEX douyin_measurement_appointments_tenant_status_created_idx
ON public.douyin_measurement_appointments(tenant_id, status, created_at DESC, id DESC);

CREATE INDEX douyin_measurement_appointments_lead_created_idx
ON public.douyin_measurement_appointments(marketing_lead_id, created_at DESC, id DESC);

CREATE INDEX douyin_measurement_appointments_assignee_status_created_idx
ON public.douyin_measurement_appointments(
  tenant_id, assigned_employee_id, status, created_at DESC, id DESC
)
WHERE assigned_employee_id IS NOT NULL;

CREATE INDEX douyin_measurement_appointments_customer_created_idx
ON public.douyin_measurement_appointments(customer_id, created_at DESC, id DESC)
WHERE customer_id IS NOT NULL;

CREATE INDEX douyin_measurement_appointments_estimate_idx
ON public.douyin_measurement_appointments(budget_estimate_id)
WHERE budget_estimate_id IS NOT NULL;

CREATE INDEX douyin_lead_follow_ups_tenant_lead_created_idx
ON public.douyin_lead_follow_ups(
  tenant_id, marketing_lead_id, created_at DESC, id DESC
);

CREATE INDEX douyin_lead_follow_ups_appointment_created_idx
ON public.douyin_lead_follow_ups(
  douyin_measurement_appointment_id, created_at DESC, id DESC
);

CREATE INDEX douyin_lead_follow_ups_next_idx
ON public.douyin_lead_follow_ups(tenant_id, next_follow_up_at, id)
WHERE next_follow_up_at IS NOT NULL;

CREATE INDEX douyin_lead_workflow_operations_lead_created_idx
ON public.douyin_lead_workflow_operations(
  tenant_id, marketing_lead_id, created_at DESC, id DESC
);

CREATE INDEX marketing_leads_douyin_status_created_v2_idx
ON public.marketing_leads(tenant_id, lead_status, created_at DESC, id DESC)
WHERE source = 'douyin_miniapp';

CREATE INDEX marketing_leads_douyin_assignee_status_created_idx
ON public.marketing_leads(
  tenant_id, assigned_employee_id, lead_status, created_at DESC, id DESC
)
WHERE source = 'douyin_miniapp' AND assigned_employee_id IS NOT NULL;

ALTER TABLE public.douyin_measurement_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_measurement_appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_lead_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_lead_follow_ups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_lead_workflow_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.douyin_lead_workflow_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_measurement_appointments
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_lead_follow_ups
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.douyin_lead_workflow_operations
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.douyin_measurement_appointment_number_seq
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.douyin_measurement_appointments TO service_role;
GRANT SELECT ON TABLE public.douyin_lead_follow_ups TO service_role;
GRANT SELECT ON TABLE public.douyin_lead_workflow_operations TO service_role;

CREATE FUNCTION public.douyin_measurement_estimate_snapshot(
  p_estimate public.douyin_budget_estimates,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'estimate_no', p_estimate.estimate_no,
    'result', p_estimate.result_payload,
    'ai_status', p_estimate.ai_status,
    'ai_analysis', CASE
      WHEN p_estimate.ai_status = 'succeeded'
        AND jsonb_typeof(p_estimate.ai_analysis) = 'object'
      THEN jsonb_build_object(
        'summary', p_estimate.ai_analysis->'summary',
        'allocation_advice', p_estimate.ai_analysis->'allocation_advice',
        'risk_factors', p_estimate.ai_analysis->'risk_factors',
        'onsite_questions', p_estimate.ai_analysis->'onsite_questions'
      )
      ELSE NULL
    END,
    'expired', p_estimate.expires_at <= p_now
  );
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_estimate_snapshot(
  public.douyin_budget_estimates, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.douyin_measurement_source_metadata(
  p_appointment public.douyin_measurement_appointments
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'installation_id', p_appointment.douyin_miniapp_installation_id,
    'marketing_lead_id', p_appointment.marketing_lead_id,
    'appointment_id', p_appointment.id,
    'appointment_no', p_appointment.appointment_no,
    'community', p_appointment.community,
    'preferred_visit_date', p_appointment.preferred_visit_date,
    'preferred_visit_period', p_appointment.preferred_visit_period,
    'attribution', p_appointment.source_snapshot->'attribution',
    'budget_estimate_id', p_appointment.budget_estimate_id,
    'budget_estimate', p_appointment.source_snapshot->'budget_estimate'
  );
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_source_metadata(
  public.douyin_measurement_appointments
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.is_valid_douyin_measurement_source_metadata(
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_typeof(p_metadata) = 'object'
    AND p_metadata - ARRAY[
      'installation_id', 'marketing_lead_id', 'appointment_id',
      'appointment_no', 'community', 'preferred_visit_date',
      'preferred_visit_period', 'attribution', 'budget_estimate_id',
      'budget_estimate'
    ] = '{}'::jsonb
    AND NOT p_metadata ?| ARRAY[
      'request_ip', 'user_agent', 'sms_code', 'subject_hash'
    ]
    AND jsonb_typeof(p_metadata->'attribution') = 'object'
    AND jsonb_typeof(p_metadata->'budget_estimate') IN ('object', 'null')
    AND pg_column_size(p_metadata) <= 65536;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_source_metadata(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.douyin_measurement_marketing_lead_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_table_owner name;
  v_is_douyin boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
  INTO v_table_owner
  FROM pg_catalog.pg_class AS class
  WHERE class.oid = TG_RELID;

  v_is_douyin := CASE TG_OP
    WHEN 'INSERT' THEN NEW.source = 'douyin_miniapp'
    WHEN 'DELETE' THEN OLD.source = 'douyin_miniapp'
    ELSE OLD.source = 'douyin_miniapp' OR NEW.source = 'douyin_miniapp'
  END;

  IF v_is_douyin AND current_user <> v_table_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_MARKETING_LEAD_DIRECT_WRITE_FORBIDDEN';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.source = 'douyin_miniapp' THEN
    IF NEW.version IS DISTINCT FROM OLD.version THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_MEASUREMENT_MARKETING_LEAD_VERSION_MANAGED';
    END IF;
    IF OLD.version >= 2147483647 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_MEASUREMENT_MARKETING_LEAD_VERSION_EXHAUSTED';
    END IF;
    NEW.version := OLD.version + 1;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE FUNCTION public.assign_douyin_lead(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_actor_employee_id uuid,
  p_assigned_employee_id uuid,
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

  PERFORM employee.id
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

CREATE FUNCTION public.append_douyin_lead_follow_up(
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
BEGIN
  IF p_tenant_id IS NULL
    OR p_marketing_lead_id IS NULL
    OR p_appointment_id IS NULL
    OR p_actor_employee_id IS NULL
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
      'data', jsonb_build_object(
        'action', 'follow_up',
        'result', 'followed_up',
        'lead_id', v_follow_up.marketing_lead_id,
        'appointment_id', v_follow_up.douyin_measurement_appointment_id,
        'follow_up_id', v_follow_up.id,
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

  INSERT INTO public.douyin_lead_follow_ups (
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
    created_at
  ) VALUES (
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
    v_now
  )
  RETURNING * INTO v_follow_up;

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

  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'action', 'follow_up',
      'result', 'followed_up',
      'lead_id', v_lead.id,
      'appointment_id', v_appointment.id,
      'follow_up_id', v_follow_up.id,
      'lead_version', v_lead.version,
      'appointment_version', v_appointment.version,
      'appointment_status', v_appointment.status,
      'idempotent', false
    )
  );
END;
$function$;

CREATE FUNCTION public.convert_douyin_lead_to_customer(
  p_tenant_id uuid,
  p_marketing_lead_id uuid,
  p_actor_employee_id uuid,
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
    'expected_version', p_expected_version
  )::text, 'UTF8'), 'sha256');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'douyin-lead-operation:' || p_tenant_id::text
        || ':convert:' || p_idempotency_key::text,
      20260821105000
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

  IF v_lead.lead_status = 'converted' THEN
    IF v_lead.customer_id IS NULL THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 500,
          'code', 'DOUYIN_LEAD_CONVERSION_STATE_INVALID'
        )
      );
    END IF;
    SELECT customer.*
    INTO v_customer
    FROM public.customers AS customer
    WHERE customer.id = v_lead.customer_id
      AND customer.tenant_id = p_tenant_id
      AND customer.phone = v_lead.phone
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'error', jsonb_build_object(
          'status_code', 500,
          'code', 'DOUYIN_LEAD_CONVERSION_STATE_INVALID'
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
      'lead_version', v_lead.version
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

  SELECT customer.*
  INTO v_customer
  FROM public.customers AS customer
  WHERE customer.tenant_id = p_tenant_id
    AND customer.phone = v_lead.phone
  ORDER BY customer.created_at ASC, customer.id ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.customers (
      tenant_id, name, phone, status, source, owner_id
    ) VALUES (
      p_tenant_id,
      COALESCE(NULLIF(btrim(v_lead.name), ''), '客户' || right(v_lead.phone, 4)),
      v_lead.phone,
      'potential',
      'douyin',
      v_lead.assigned_employee_id
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
    AND customer_id IS DISTINCT FROM v_customer.id;
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

CREATE FUNCTION public.mark_douyin_lead_invalid(
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

REVOKE ALL ON FUNCTION public.douyin_measurement_marketing_lead_guard()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_measurement_marketing_lead_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.marketing_leads
FOR EACH ROW EXECUTE FUNCTION public.douyin_measurement_marketing_lead_guard();

CREATE FUNCTION public.douyin_measurement_appointment_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
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

CREATE TRIGGER douyin_measurement_appointment_guard
BEFORE UPDATE OR DELETE ON public.douyin_measurement_appointments
FOR EACH ROW EXECUTE FUNCTION public.douyin_measurement_appointment_guard();

CREATE FUNCTION public.douyin_lead_follow_up_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'DOUYIN_LEAD_FOLLOW_UP_IMMUTABLE';
END;
$function$;

REVOKE ALL ON FUNCTION public.douyin_lead_follow_up_immutable()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_lead_follow_up_immutable
BEFORE UPDATE OR DELETE ON public.douyin_lead_follow_ups
FOR EACH ROW EXECUTE FUNCTION public.douyin_lead_follow_up_immutable();

CREATE FUNCTION public.douyin_lead_workflow_operation_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'DOUYIN_LEAD_WORKFLOW_OPERATION_IMMUTABLE';
END;
$function$;

REVOKE ALL ON FUNCTION public.douyin_lead_workflow_operation_immutable()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_lead_workflow_operation_immutable
BEFORE UPDATE OR DELETE ON public.douyin_lead_workflow_operations
FOR EACH ROW EXECUTE FUNCTION public.douyin_lead_workflow_operation_immutable();

CREATE FUNCTION public.douyin_measurement_customer_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_table_owner name;
  v_is_measurement boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
  INTO v_table_owner
  FROM pg_catalog.pg_class AS class
  WHERE class.oid = TG_RELID;

  v_is_measurement := CASE TG_OP
    WHEN 'INSERT' THEN NEW.douyin_measurement_appointment_id IS NOT NULL
    WHEN 'DELETE' THEN OLD.douyin_measurement_appointment_id IS NOT NULL
    ELSE OLD.douyin_measurement_appointment_id IS NOT NULL
      OR NEW.douyin_measurement_appointment_id IS NOT NULL
  END;

  IF v_is_measurement AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_IMMUTABLE';
  END IF;

  IF v_is_measurement AND current_user <> v_table_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_DIRECT_WRITE_FORBIDDEN';
  END IF;

  IF v_is_measurement AND (
    NEW.source IS DISTINCT FROM 'douyin_miniapp'
    OR NEW.source_label IS DISTINCT FROM '抖音小程序'
    OR NEW.marketing_lead_id IS NULL
    OR public.is_valid_douyin_measurement_source_metadata(NEW.metadata)
      IS NOT TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_INVALID';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_customer_source_guard()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_measurement_customer_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.customer_sources
FOR EACH ROW EXECUTE FUNCTION public.douyin_measurement_customer_source_guard();

CREATE FUNCTION public.submit_douyin_measurement_appointment(
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
  v_number_value bigint;
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
        'status', v_appointment.status,
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
          ELSE lead.customer_id
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

  v_number_value := nextval(
    'public.douyin_measurement_appointment_number_seq'::regclass
  );
  IF v_number_value > 999999 THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'status_code', 409,
        'code', 'DOUYIN_MEASUREMENT_NUMBER_EXHAUSTED'
      )
    );
  END IF;
  v_appointment_no := 'DYLF-'
    || to_char(v_now AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD')
    || '-' || lpad(v_number_value::text, 6, '0');

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

REVOKE ALL ON FUNCTION public.submit_douyin_measurement_appointment(
  uuid, uuid, text, text, text, date, text, uuid, text, text, uuid, text,
  text, text, text, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_douyin_measurement_appointment(
  uuid, uuid, text, text, text, date, text, uuid, text, text, uuid, text,
  text, text, text, timestamptz, jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.assign_douyin_lead(
  uuid, uuid, uuid, uuid, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_douyin_lead(
  uuid, uuid, uuid, uuid, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.append_douyin_lead_follow_up(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, timestamptz,
  integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_douyin_lead_follow_up(
  uuid, uuid, uuid, uuid, text, text, text, timestamptz, text, timestamptz,
  integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.convert_douyin_lead_to_customer(
  uuid, uuid, uuid, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_douyin_lead_to_customer(
  uuid, uuid, uuid, integer, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.mark_douyin_lead_invalid(
  uuid, uuid, uuid, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_douyin_lead_invalid(
  uuid, uuid, uuid, text, integer, uuid
) TO service_role;

COMMENT ON TABLE public.douyin_measurement_appointments IS
  '抖音量房预约申请事实，仅通过受控命令写入和流转';
COMMENT ON TABLE public.douyin_lead_follow_ups IS
  '抖音线索不可变跟进记录';
COMMENT ON TABLE public.douyin_lead_workflow_operations IS
  '抖音线索工作流命令幂等结果账本';

COMMIT;
