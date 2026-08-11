-- Platform technical-service trial aggregate and atomic commands.
--
-- Forward-only remediation / rollback:
-- disable the API feature and revoke the public RPC grants in a later migration;
-- retain trials, commands, and immutable events for audit. If any preflight below
-- fails, prepare a reviewed earlier-versioned remediation migration. Manual DML
-- in development or production is prohibited, and this migration never deletes
-- or rewrites ambiguous historical business facts.
--
-- PLATFORM_SERVICE_TRIAL_PREFLIGHT_PARTIAL_SCHEMA means part of this release was
-- staged outside migration history. PLATFORM_SERVICE_TRIAL_PREFLIGHT_ORDER_SOURCE_INVALID
-- means an older order already carries a source_trial_id that cannot be proven
-- against the not-yet-created aggregate. PREFLIGHT_DIGEST_UNAVAILABLE means the
-- pinned pgcrypto digest routine is missing. All conditions fail closed before DDL.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

-- Referenced identities are locked before trial/order facts. The order table is
-- taken ACCESS EXCLUSIVE up front because this migration adds a FK and unique
-- index; taking the final lock late would invert ordinary write transactions.
LOCK TABLE public.tenants, public.employees, public.roles, public.permissions
  IN ROW SHARE MODE;
LOCK TABLE public.employee_roles, public.role_permissions,
  public.tenant_onboarding_applications,
  public.tenant_service_contracts IN SHARE MODE;
LOCK TABLE public.tenant_service_orders IN ACCESS EXCLUSIVE MODE;

-- Historical invariant preflight. A partially staged schema or an unattributable
-- existing source is not guessed or silently repaired.
DO $preflight$
DECLARE
  v_trial_table_count integer;
BEGIN
  IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_SERVICE_TRIAL_PREFLIGHT_DIGEST_UNAVAILABLE';
  END IF;

  SELECT count(*)::integer
  INTO v_trial_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'platform_service_trial_policies',
      'tenant_service_trials',
      'tenant_service_trial_events',
      'tenant_service_trial_commands'
    );

  IF v_trial_table_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_SERVICE_TRIAL_PREFLIGHT_PARTIAL_SCHEMA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS routine
    JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
    WHERE namespace.nspname = 'public'
      AND routine.proname LIKE 'platform_service_trial_%'
  ) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.platform_service_trial_policies_current_unique',
      'public.tenant_service_trials_enterprise_pending_unique',
      'public.tenant_service_trials_enterprise_available_unique',
      'public.tenant_service_orders_open_source_trial_unique'
    ]) AS staged(relation_name)
    WHERE to_regclass(staged.relation_name) IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenant_service_orders_source_trial_tenant_fkey'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_SERVICE_TRIAL_PREFLIGHT_PARTIAL_SCHEMA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenant_service_orders
    WHERE source_trial_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_SERVICE_TRIAL_PREFLIGHT_ORDER_SOURCE_INVALID';
  END IF;

  IF EXISTS (
    SELECT source_trial_id
    FROM public.tenant_service_orders
    WHERE source_trial_id IS NOT NULL
      AND payment_status <> 'closed'
    GROUP BY source_trial_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'PLATFORM_SERVICE_TRIAL_PREFLIGHT_ORDER_SOURCE_DUPLICATE';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_scope_valid(p_scope jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capability text;
  v_count integer := 0;
  v_distinct_count integer;
BEGIN
  IF p_scope IS NULL OR jsonb_typeof(p_scope) <> 'object'
    OR p_scope->>'version' <> '1'
    OR jsonb_typeof(p_scope->'capabilities') <> 'array'
    OR (SELECT count(*) FROM jsonb_object_keys(p_scope)) <> 2
    OR NOT (p_scope ? 'version' AND p_scope ? 'capabilities')
    OR pg_column_size(p_scope) > 4096
  THEN RETURN false; END IF;
  FOR v_capability IN SELECT jsonb_array_elements_text(p_scope->'capabilities')
  LOOP
    v_count := v_count + 1;
    IF v_capability NOT IN (
      'core.projects', 'core.customers', 'core.employees',
      'core.workflows', 'core.files', 'core.notifications'
    ) THEN RETURN false; END IF;
  END LOOP;
  SELECT count(DISTINCT capability)::integer INTO v_distinct_count
  FROM jsonb_array_elements_text(p_scope->'capabilities') AS capability;
  RETURN v_count BETWEEN 1 AND 6 AND v_distinct_count = v_count;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

CREATE TABLE public.platform_service_trial_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_current boolean NOT NULL DEFAULT true,
  trial_days integer NOT NULL DEFAULT 30,
  grace_days integer NOT NULL DEFAULT 7,
  reminder_days integer[] NOT NULL DEFAULT ARRAY[7, 3, 1],
  max_trial_days integer NOT NULL DEFAULT 60,
  max_grace_days integer NOT NULL DEFAULT 14,
  max_schedule_days integer NOT NULL DEFAULT 30,
  max_extension_count integer NOT NULL DEFAULT 1,
  max_extension_days integer NOT NULL DEFAULT 30,
  reapply_cooldown_days integer NOT NULL DEFAULT 30,
  allow_repeat boolean NOT NULL DEFAULT false,
  standard_scope jsonb NOT NULL,
  guided_scope jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  change_reason text NULL,
  created_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT platform_service_trial_policies_values_check CHECK ((
    trial_days BETWEEN 1 AND 365
    AND grace_days BETWEEN 0 AND 30
    AND max_trial_days BETWEEN trial_days AND 365
    AND max_grace_days BETWEEN grace_days AND 30
    AND max_schedule_days BETWEEN 0 AND 365
    AND max_extension_count BETWEEN 0 AND 20
    AND max_extension_days BETWEEN 1 AND 365
    AND reapply_cooldown_days BETWEEN 0 AND 365
    AND version > 0
  ) IS TRUE),
  CONSTRAINT platform_service_trial_policies_reminders_check CHECK ((
    cardinality(reminder_days) BETWEEN 1 AND 10
    AND 0 < ALL(reminder_days)
  ) IS TRUE),
  CONSTRAINT platform_service_trial_policies_scope_check CHECK ((
    public.platform_service_trial_scope_valid(standard_scope)
    AND public.platform_service_trial_scope_valid(guided_scope)
  ) IS TRUE),
  CONSTRAINT platform_service_trial_policies_reason_check CHECK ((
    change_reason IS NULL
    OR (btrim(change_reason) <> '' AND char_length(change_reason) <= 500)
  ) IS TRUE)
);

CREATE UNIQUE INDEX platform_service_trial_policies_current_unique
  ON public.platform_service_trial_policies (is_current)
  WHERE is_current = true;

CREATE TABLE public.tenant_service_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  enterprise_identity_hash bytea NOT NULL,
  source text NOT NULL,
  trial_type text NOT NULL,
  status text NOT NULL,
  application_reason text NULL,
  expected_user_count integer NULL,
  expected_project_count integer NULL,
  contact_name text NULL,
  contact_phone text NULL,
  grant_reason text NULL,
  review_decision text NULL,
  review_reason text NULL,
  revoke_reason text NULL,
  withdraw_reason text NULL,
  requested_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  granted_at timestamptz NULL,
  starts_at timestamptz NULL,
  activated_at timestamptz NULL,
  trial_ends_at timestamptz NULL,
  grace_ends_at timestamptz NULL,
  withdrawn_at timestamptz NULL,
  revoked_at timestamptz NULL,
  converted_at timestamptz NULL,
  converted_order_id uuid NULL,
  granted_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  reviewed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  requested_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  revoked_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  withdrawn_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  assignee_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  scope_snapshot jsonb NOT NULL,
  policy_snapshot jsonb NOT NULL,
  extension_count integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tenant_service_trials_identity_key UNIQUE (id, tenant_id),
  CONSTRAINT tenant_service_trials_enterprise_hash_check CHECK ((
    octet_length(enterprise_identity_hash) = 32
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_source_check CHECK ((
    source IN ('tenant_application', 'platform_grant')
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_type_check CHECK ((
    trial_type IN ('standard', 'guided')
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_status_check CHECK ((status IN (
    'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
    'rejected', 'withdrawn', 'revoked', 'converted'
  )) IS TRUE),
  CONSTRAINT tenant_service_trials_source_facts_check CHECK ((
    (
      source = 'tenant_application'
      AND application_reason IS NOT NULL
      AND expected_user_count IS NOT NULL
      AND expected_project_count IS NOT NULL
      AND contact_name IS NOT NULL
      AND contact_phone IS NOT NULL
      AND requested_at IS NOT NULL
      AND requested_by_employee_id IS NOT NULL
    )
    OR (
      source = 'platform_grant'
      AND application_reason IS NULL
      AND expected_user_count IS NULL
      AND expected_project_count IS NULL
      AND contact_name IS NULL
      AND contact_phone IS NULL
      AND requested_at IS NULL
      AND requested_by_employee_id IS NULL
    )
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_status_facts_check CHECK ((
    (status = 'pending_review' AND reviewed_at IS NULL AND granted_at IS NULL
      AND starts_at IS NULL AND trial_ends_at IS NULL AND grace_ends_at IS NULL)
    OR (status IN ('scheduled', 'active', 'grace_period', 'expired')
      AND granted_at IS NOT NULL AND granted_by_employee_id IS NOT NULL
      AND starts_at IS NOT NULL AND trial_ends_at IS NOT NULL
      AND grace_ends_at IS NOT NULL)
    OR (status = 'converted' AND converted_order_id IS NOT NULL AND (
      (granted_at IS NOT NULL AND granted_by_employee_id IS NOT NULL
        AND starts_at IS NOT NULL AND trial_ends_at IS NOT NULL
        AND grace_ends_at IS NOT NULL)
      OR (granted_at IS NULL AND granted_by_employee_id IS NULL
        AND starts_at IS NULL AND trial_ends_at IS NULL
        AND grace_ends_at IS NULL)
    ))
    OR (status = 'rejected' AND review_decision = 'rejected'
      AND reviewed_at IS NOT NULL AND reviewed_by_employee_id IS NOT NULL
      AND review_reason IS NOT NULL)
    OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL
      AND withdrawn_by_employee_id IS NOT NULL AND withdraw_reason IS NOT NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL
      AND revoked_by_employee_id IS NOT NULL AND revoke_reason IS NOT NULL)
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_review_facts_check CHECK ((
    (review_decision IS NULL AND reviewed_at IS NULL
      AND reviewed_by_employee_id IS NULL AND review_reason IS NULL)
    OR (review_decision IN ('approved', 'rejected')
      AND reviewed_at IS NOT NULL AND reviewed_by_employee_id IS NOT NULL
      AND review_reason IS NOT NULL)
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_conversion_facts_check CHECK ((
    (converted_order_id IS NULL AND converted_at IS NULL)
    OR (converted_order_id IS NOT NULL AND converted_at IS NOT NULL)
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_duration_hard_limit_check CHECK ((
    (starts_at IS NULL AND trial_ends_at IS NULL AND grace_ends_at IS NULL)
    OR (
      starts_at IS NOT NULL AND trial_ends_at IS NOT NULL
      AND grace_ends_at IS NOT NULL
      AND trial_ends_at > starts_at
      AND trial_ends_at <= starts_at + interval '365 days'
      AND grace_ends_at >= trial_ends_at
      AND grace_ends_at <= trial_ends_at + interval '30 days'
    )
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_snapshot_check CHECK ((
    public.platform_service_trial_scope_valid(scope_snapshot)
    AND jsonb_typeof(policy_snapshot) = 'object'
    AND pg_column_size(policy_snapshot) <= 8192
  ) IS TRUE),
  CONSTRAINT tenant_service_trials_contact_check CHECK ((
    (contact_name IS NULL OR (btrim(contact_name) <> '' AND char_length(contact_name) <= 80))
    AND (contact_phone IS NULL OR contact_phone ~ '^1[3-9][0-9]{9}$')
    AND (application_reason IS NULL OR (btrim(application_reason) <> '' AND char_length(application_reason) <= 1000))
    AND (expected_user_count IS NULL OR expected_user_count BETWEEN 1 AND 100000)
    AND (expected_project_count IS NULL OR expected_project_count BETWEEN 1 AND 1000000)
    AND extension_count BETWEEN 0 AND 20
    AND version > 0
  ) IS TRUE)
);

ALTER TABLE public.tenant_service_trials
  ADD CONSTRAINT tenant_service_trials_converted_order_identity_fkey
  FOREIGN KEY (converted_order_id, tenant_id)
  REFERENCES public.tenant_service_orders(id, tenant_id)
  ON DELETE RESTRICT;

CREATE TABLE public.tenant_service_trial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  trial_id uuid NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  reason text NULL,
  actor_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tenant_service_trial_events_trial_identity_fkey
    FOREIGN KEY (trial_id, tenant_id)
    REFERENCES public.tenant_service_trials(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_trial_events_event_key_unique UNIQUE (trial_id, event_key),
  CONSTRAINT tenant_service_trial_events_event_key_check CHECK ((
    btrim(event_key) <> '' AND char_length(event_key) <= 160
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_events_event_type_check CHECK ((
    event_type IN (
      'application_submitted', 'application_withdrawn', 'application_approved',
      'application_rejected', 'trial_granted', 'trial_activated',
      'trial_grace_started', 'trial_expired', 'trial_extended',
      'trial_revoked', 'trial_assigned', 'formal_purchase_attributed',
      'conversion_anomaly'
    )
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_events_status_check CHECK ((
    (from_status IS NULL OR from_status IN (
      'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
      'rejected', 'withdrawn', 'revoked', 'converted'
    ))
    AND (to_status IS NULL OR to_status IN (
      'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
      'rejected', 'withdrawn', 'revoked', 'converted'
    ))
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_events_metadata_check CHECK ((
    jsonb_typeof(metadata) = 'object'
    AND pg_column_size(metadata) <= 8192
    AND NOT (metadata ?| ARRAY['contact_name', 'contact_phone', 'phone', 'mobile'])
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_events_reason_check CHECK ((
    reason IS NULL OR (btrim(reason) <> '' AND char_length(reason) <= 1000)
  ) IS TRUE)
);

CREATE TABLE public.tenant_service_trial_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash bytea NOT NULL,
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  trial_id uuid NULL,
  actor_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  result_envelope jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  CONSTRAINT tenant_service_trial_commands_scope_key_unique
    UNIQUE (scope_key, idempotency_key),
  CONSTRAINT tenant_service_trial_commands_trial_identity_fkey
    FOREIGN KEY (trial_id, tenant_id)
    REFERENCES public.tenant_service_trials(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_trial_commands_scope_check CHECK ((
    btrim(scope_key) <> '' AND char_length(scope_key) <= 160
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_commands_hash_check CHECK ((
    octet_length(request_hash) = 32
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_commands_result_check CHECK ((
    jsonb_typeof(result_envelope) = 'object'
    AND pg_column_size(result_envelope) <= 16384
    AND (
      (
        trial_id IS NULL
        AND result_envelope ?& ARRAY['policy_id', 'version', 'is_current']
        AND result_envelope
          - ARRAY['policy_id', 'version', 'is_current'] = '{}'::jsonb
      )
      OR (
        trial_id IS NOT NULL
        AND jsonb_typeof(result_envelope->'trial_snapshot') = 'object'
        AND result_envelope ?& ARRAY[
          'trial_id', 'tenant_id', 'status', 'version', 'trial_snapshot'
        ]
        AND result_envelope - ARRAY[
          'trial_id', 'tenant_id', 'status', 'version', 'assigned',
          'trial_snapshot'
        ] = '{}'::jsonb
        AND (result_envelope->'trial_snapshot') ?& ARRAY[
          'id', 'tenant_id', 'source', 'trial_type', 'status',
          'expected_user_count', 'expected_project_count',
          'contact_name_masked', 'contact_phone_masked', 'review_decision',
          'requested_at', 'reviewed_at', 'granted_at', 'starts_at',
          'activated_at', 'trial_ends_at', 'grace_ends_at', 'withdrawn_at',
          'revoked_at', 'converted_at', 'converted_order_id', 'scope',
          'policy_snapshot', 'extension_count', 'version', 'created_at',
          'updated_at'
        ]
        AND (result_envelope->'trial_snapshot') - ARRAY[
          'id', 'tenant_id', 'source', 'trial_type', 'status',
          'expected_user_count', 'expected_project_count',
          'contact_name_masked', 'contact_phone_masked', 'review_decision',
          'requested_at', 'reviewed_at', 'granted_at', 'starts_at',
          'activated_at', 'trial_ends_at', 'grace_ends_at', 'withdrawn_at',
          'revoked_at', 'converted_at', 'converted_order_id', 'scope',
          'policy_snapshot', 'extension_count', 'version', 'created_at',
          'updated_at'
        ] = '{}'::jsonb
        AND (result_envelope->'trial_snapshot'->'scope')
          ?& ARRAY['version', 'capabilities']
        AND (result_envelope->'trial_snapshot'->'scope')
          - ARRAY['version', 'capabilities'] = '{}'::jsonb
        AND (result_envelope->'trial_snapshot'->'policy_snapshot') ?& ARRAY[
          'policy_id', 'version', 'trial_days', 'grace_days',
          'max_trial_days', 'max_grace_days', 'max_schedule_days',
          'max_extension_count', 'max_extension_days',
          'reapply_cooldown_days', 'allow_repeat', 'reminder_days'
        ]
        AND (result_envelope->'trial_snapshot'->'policy_snapshot') - ARRAY[
          'policy_id', 'version', 'trial_days', 'grace_days',
          'max_trial_days', 'max_grace_days', 'max_schedule_days',
          'max_extension_count', 'max_extension_days',
          'reapply_cooldown_days', 'allow_repeat', 'reminder_days',
          'override_used'
        ] = '{}'::jsonb
        AND ((result_envelope->>'trial_id')
          = (result_envelope->'trial_snapshot'->>'id')) IS TRUE
        AND ((result_envelope->>'tenant_id')
          = (result_envelope->'trial_snapshot'->>'tenant_id')) IS TRUE
        AND ((result_envelope->>'status')
          = (result_envelope->'trial_snapshot'->>'status')) IS TRUE
        AND ((result_envelope->'version')
          = (result_envelope->'trial_snapshot'->'version')) IS TRUE
      )
    )
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_commands_ttl_check CHECK ((
    expires_at = created_at + interval '90 days'
  ) IS TRUE)
);

-- Effective-status and summary paths are bounded by tenant/enterprise/status and
-- time. List APIs must still use range pagination (max 100); these indexes do not
-- authorize unbounded reads and avoid N+1/count fan-out.
CREATE UNIQUE INDEX tenant_service_trials_enterprise_pending_unique
  ON public.tenant_service_trials (enterprise_identity_hash)
  WHERE status = 'pending_review';
CREATE UNIQUE INDEX tenant_service_trials_enterprise_available_unique
  ON public.tenant_service_trials (enterprise_identity_hash)
  WHERE status IN ('scheduled', 'active', 'grace_period');
CREATE INDEX tenant_service_trials_tenant_created_idx
  ON public.tenant_service_trials (tenant_id, created_at DESC, id DESC);
CREATE INDEX tenant_service_trials_status_requested_idx
  ON public.tenant_service_trials (status, requested_at DESC, id DESC);
CREATE INDEX tenant_service_trials_status_created_idx
  ON public.tenant_service_trials (status, created_at DESC, id DESC);
CREATE INDEX tenant_service_trials_assignee_status_updated_idx
  ON public.tenant_service_trials (assignee_employee_id, status, updated_at DESC);
CREATE INDEX tenant_service_trials_grace_status_idx
  ON public.tenant_service_trials (grace_ends_at, status);
CREATE INDEX tenant_service_trials_expiry_idx
  ON public.tenant_service_trials (trial_ends_at, id)
  WHERE status IN ('scheduled', 'active', 'grace_period');
CREATE INDEX tenant_service_trials_activated_cohort_idx
  ON public.tenant_service_trials (activated_at, converted_at)
  WHERE activated_at IS NOT NULL;
CREATE INDEX tenant_service_trial_events_trial_created_idx
  ON public.tenant_service_trial_events (tenant_id, trial_id, occurred_at DESC, id DESC);
CREATE INDEX tenant_service_trial_commands_expiry_idx
  ON public.tenant_service_trial_commands (expires_at);

INSERT INTO public.platform_service_trial_policies (
  standard_scope,
  guided_scope
)
VALUES (
  '{"version":1,"capabilities":["core.projects","core.customers","core.employees","core.workflows","core.files","core.notifications"]}'::jsonb,
  '{"version":1,"capabilities":["core.projects","core.customers","core.employees","core.workflows","core.files","core.notifications"]}'::jsonb
);

CREATE OR REPLACE FUNCTION public.platform_service_trial_protect_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'SERVICE_TRIAL_EVENT_IMMUTABLE' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER tr_tenant_service_trial_events_immutable
BEFORE UPDATE OR DELETE ON public.tenant_service_trial_events
FOR EACH ROW EXECUTE FUNCTION public.platform_service_trial_protect_event();

CREATE OR REPLACE FUNCTION public.platform_service_trial_command_snapshot(
  p_trial public.tenant_service_trials
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', (p_trial).id,
    'tenant_id', (p_trial).tenant_id,
    'source', (p_trial).source,
    'trial_type', (p_trial).trial_type,
    'status', (p_trial).status,
    'expected_user_count', (p_trial).expected_user_count,
    'expected_project_count', (p_trial).expected_project_count,
    'contact_name_masked', CASE
      WHEN (p_trial).contact_name IS NULL THEN NULL
      ELSE left((p_trial).contact_name, 1)
        || repeat('*', greatest(char_length((p_trial).contact_name) - 1, 1))
    END,
    'contact_phone_masked', CASE
      WHEN (p_trial).contact_phone IS NULL THEN NULL
      ELSE left((p_trial).contact_phone, 3) || '****' || right((p_trial).contact_phone, 4)
    END,
    'review_decision', (p_trial).review_decision,
    'requested_at', (p_trial).requested_at,
    'reviewed_at', (p_trial).reviewed_at,
    'granted_at', (p_trial).granted_at,
    'starts_at', (p_trial).starts_at,
    'activated_at', (p_trial).activated_at,
    'trial_ends_at', (p_trial).trial_ends_at,
    'grace_ends_at', (p_trial).grace_ends_at,
    'withdrawn_at', (p_trial).withdrawn_at,
    'revoked_at', (p_trial).revoked_at,
    'converted_at', (p_trial).converted_at,
    'converted_order_id', (p_trial).converted_order_id,
    'scope', (p_trial).scope_snapshot,
    'policy_snapshot', (p_trial).policy_snapshot,
    'extension_count', (p_trial).extension_count,
    'version', (p_trial).version,
    'created_at', (p_trial).created_at,
    'updated_at', (p_trial).updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_lock_tenant_actor(
  p_actor_employee_id uuid,
  p_tenant_id uuid,
  p_required_permission_codes text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot_role_ids uuid[];
  v_current_role_ids uuid[];
  v_role_ids uuid[];
  v_role_permission_ids uuid[];
  v_denied_permission_ids uuid[];
  v_allowed_permission_ids uuid[];
  v_permission_count integer;
BEGIN
  IF p_required_permission_codes IS NULL
    OR array_position(p_required_permission_codes, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  -- Snapshot without holding an employee row lock. Role-management commands
  -- lock the role before their member employees, so actor authorization must
  -- use that same order and fail closed if membership changes while waiting.
  SELECT coalesce(array_agg(
    employee_role.role_id ORDER BY employee_role.role_id
  ), '{}'::uuid[])
  INTO v_snapshot_role_ids
  FROM public.employee_roles AS employee_role
  WHERE employee_role.employee_id = p_actor_employee_id;

  SELECT coalesce(array_agg(locked.id ORDER BY locked.id), '{}'::uuid[])
  INTO v_role_ids
  FROM (
    SELECT role.id
    FROM public.roles AS role
    WHERE role.id = ANY(v_snapshot_role_ids)
      AND role.tenant_id = p_tenant_id
      AND role.status = 'active'
    ORDER BY role.id
    FOR SHARE
  ) AS locked;
  IF cardinality(coalesce(v_role_ids, '{}'::uuid[])) = 0 THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(
    locked.role_id ORDER BY locked.role_id, locked.id
  ), '{}'::uuid[])
  INTO v_current_role_ids
  FROM (
    SELECT employee_role.id, employee_role.role_id
    FROM public.employee_roles AS employee_role
    WHERE employee_role.employee_id = p_actor_employee_id
    ORDER BY employee_role.role_id, employee_role.id
    FOR SHARE
  ) AS locked;
  IF v_current_role_ids IS DISTINCT FROM v_snapshot_role_ids THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(
    locked.permission_id ORDER BY locked.permission_id, locked.id
  ) FILTER (WHERE locked.access_scope = 'all'), '{}'::uuid[])
  INTO v_role_permission_ids
  FROM (
    SELECT role_permission.id, role_permission.permission_id,
      role_permission.access_scope
    FROM public.role_permissions AS role_permission
    WHERE role_permission.role_id = ANY(v_role_ids)
    ORDER BY role_permission.permission_id, role_permission.id
    FOR SHARE
  ) AS locked;

  SELECT
    coalesce(array_agg(
      locked.permission_id ORDER BY locked.permission_id, locked.id
    ) FILTER (WHERE locked.effect = 'deny'), '{}'::uuid[]),
    coalesce(array_agg(
      locked.permission_id ORDER BY locked.permission_id, locked.id
    ) FILTER (
      WHERE locked.effect = 'allow' AND locked.access_scope = 'all'
    ), '{}'::uuid[])
  INTO v_denied_permission_ids, v_allowed_permission_ids
  FROM (
    SELECT override.id, override.permission_id, override.effect,
      override.access_scope
    FROM public.employee_permission_overrides AS override
    WHERE override.employee_id = p_actor_employee_id
    ORDER BY override.permission_id, override.id
    FOR SHARE
  ) AS locked;

  SELECT count(DISTINCT locked.code)::integer
  INTO v_permission_count
  FROM (
    SELECT permission.id, permission.code
    FROM public.permissions AS permission
    WHERE permission.id = ANY(
      v_role_permission_ids || v_denied_permission_ids || v_allowed_permission_ids
    )
      AND permission.status = 'active'
    ORDER BY permission.id
    FOR SHARE
  ) AS locked
  WHERE locked.code = ANY(p_required_permission_codes)
    AND NOT (locked.id = ANY(v_denied_permission_ids))
    AND (
      locked.id = ANY(v_role_permission_ids)
      OR locked.id = ANY(v_allowed_permission_ids)
    );
  IF v_permission_count <> cardinality(p_required_permission_codes) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_lock_platform_actor(
  p_actor_employee_id uuid,
  p_required_permission_codes text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot_role_ids uuid[];
  v_current_role_ids uuid[];
  v_role_ids uuid[];
  v_role_permission_ids uuid[];
  v_denied_permission_ids uuid[];
  v_allowed_permission_ids uuid[];
  v_permission_count integer;
BEGIN
  IF p_required_permission_codes IS NULL
    OR array_position(p_required_permission_codes, NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(
    employee_role.role_id ORDER BY employee_role.role_id
  ), '{}'::uuid[])
  INTO v_snapshot_role_ids
  FROM public.employee_roles AS employee_role
  WHERE employee_role.employee_id = p_actor_employee_id;

  SELECT coalesce(array_agg(locked.id ORDER BY locked.id), '{}'::uuid[])
  INTO v_role_ids
  FROM (
    SELECT role.id
    FROM public.roles AS role
    WHERE role.id = ANY(v_snapshot_role_ids)
      AND role.tenant_id IS NULL
      AND role.status = 'active'
    ORDER BY role.id
    FOR SHARE
  ) AS locked;
  IF cardinality(coalesce(v_role_ids, '{}'::uuid[])) = 0 THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM employee.id
  FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id IS NULL
    AND employee.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(
    locked.role_id ORDER BY locked.role_id, locked.id
  ), '{}'::uuid[])
  INTO v_current_role_ids
  FROM (
    SELECT employee_role.id, employee_role.role_id
    FROM public.employee_roles AS employee_role
    WHERE employee_role.employee_id = p_actor_employee_id
    ORDER BY employee_role.role_id, employee_role.id
    FOR SHARE
  ) AS locked;
  IF v_current_role_ids IS DISTINCT FROM v_snapshot_role_ids THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(array_agg(
    locked.permission_id ORDER BY locked.permission_id, locked.id
  ) FILTER (WHERE locked.access_scope = 'all'), '{}'::uuid[])
  INTO v_role_permission_ids
  FROM (
    SELECT role_permission.id, role_permission.permission_id,
      role_permission.access_scope
    FROM public.role_permissions AS role_permission
    WHERE role_permission.role_id = ANY(v_role_ids)
    ORDER BY role_permission.permission_id, role_permission.id
    FOR SHARE
  ) AS locked;

  SELECT
    coalesce(array_agg(
      locked.permission_id ORDER BY locked.permission_id, locked.id
    ) FILTER (WHERE locked.effect = 'deny'), '{}'::uuid[]),
    coalesce(array_agg(
      locked.permission_id ORDER BY locked.permission_id, locked.id
    ) FILTER (
      WHERE locked.effect = 'allow' AND locked.access_scope = 'all'
    ), '{}'::uuid[])
  INTO v_denied_permission_ids, v_allowed_permission_ids
  FROM (
    SELECT override.id, override.permission_id, override.effect,
      override.access_scope
    FROM public.employee_permission_overrides AS override
    WHERE override.employee_id = p_actor_employee_id
    ORDER BY override.permission_id, override.id
    FOR SHARE
  ) AS locked;

  SELECT count(DISTINCT locked.code)::integer
  INTO v_permission_count
  FROM (
    SELECT permission.id, permission.code
    FROM public.permissions AS permission
    WHERE permission.id = ANY(
      v_role_permission_ids || v_denied_permission_ids || v_allowed_permission_ids
    )
      AND permission.status = 'active'
    ORDER BY permission.id
    FOR SHARE
  ) AS locked
  WHERE locked.code = ANY(p_required_permission_codes)
    AND NOT (locked.id = ANY(v_denied_permission_ids))
    AND (
      locked.id = ANY(v_role_permission_ids)
      OR locked.id = ANY(v_allowed_permission_ids)
    );
  IF v_permission_count <> cardinality(p_required_permission_codes) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_lock_verified_enterprise_identity(
  p_tenant_id uuid,
  p_expected_hash bytea
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enterprise_hash bytea;
BEGIN
  SELECT extensions.digest(
    regexp_replace(upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'),
    'sha256'
  )
  INTO v_enterprise_hash
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
    AND application.status = 'approved'
    AND application.reviewed_at IS NOT NULL
    AND regexp_replace(
      upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
    ) = regexp_replace(
      upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g'
    )
  FOR SHARE OF tenant, application;

  IF NOT FOUND OR v_enterprise_hash IS DISTINCT FROM p_expected_hash THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_replay_command(
  p_scope_key text,
  p_idempotency_key uuid,
  p_request_hash bytea
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_command public.tenant_service_trial_commands%ROWTYPE;
BEGIN
  SELECT command.*
  INTO v_command
  FROM public.tenant_service_trial_commands AS command
  WHERE command.scope_key = p_scope_key
    AND command.idempotency_key = p_idempotency_key
    AND command.expires_at > clock_timestamp()
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_command.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_command.result_envelope || jsonb_build_object('idempotent', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_store_command(
  p_scope_key text,
  p_idempotency_key uuid,
  p_request_hash bytea,
  p_tenant_id uuid,
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_result_envelope jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_command_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.tenant_service_trial_commands
  WHERE scope_key = p_scope_key
    AND idempotency_key = p_idempotency_key
    AND expires_at <= v_command_at;
  INSERT INTO public.tenant_service_trial_commands (
    scope_key, idempotency_key, request_hash, tenant_id, trial_id,
    actor_employee_id, result_envelope, created_at, expires_at
  ) VALUES (
    p_scope_key, p_idempotency_key, p_request_hash, p_tenant_id, p_trial_id,
    p_actor_employee_id, p_result_envelope, v_command_at,
    v_command_at + interval '90 days'
  );
  RETURN p_result_envelope || jsonb_build_object('idempotent', false);
EXCEPTION
  WHEN unique_violation THEN
    RETURN public.platform_service_trial_replay_command(
      p_scope_key, p_idempotency_key, p_request_hash
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_normalize_effective_status(
  p_trial_id uuid,
  p_tenant_id uuid,
  p_now timestamptz
)
RETURNS public.tenant_service_trials
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trial public.tenant_service_trials%ROWTYPE;
  v_from_status text;
  v_to_status text;
BEGIN
  SELECT trial.* INTO v_trial
  FROM public.tenant_service_trials AS trial
  WHERE trial.id = p_trial_id AND trial.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_from_status := v_trial.status;
  v_to_status := CASE
    WHEN v_trial.status IN ('scheduled', 'active', 'grace_period')
      AND p_now >= v_trial.grace_ends_at THEN 'expired'
    WHEN v_trial.status IN ('scheduled', 'active')
      AND p_now >= v_trial.trial_ends_at
      AND p_now < v_trial.grace_ends_at THEN 'grace_period'
    WHEN v_trial.status = 'scheduled' AND p_now >= v_trial.starts_at THEN 'active'
    ELSE v_trial.status
  END;

  IF v_to_status IS DISTINCT FROM v_from_status THEN
    UPDATE public.tenant_service_trials
    SET status = v_to_status,
      activated_at = CASE
        WHEN v_from_status = 'scheduled' AND p_now >= starts_at
        THEN coalesce(activated_at, starts_at)
        ELSE activated_at
      END,
      version = version + 1,
      updated_at = p_now
    WHERE id = v_trial.id
    RETURNING * INTO v_trial;

    IF v_from_status = 'scheduled' AND p_now >= v_trial.starts_at THEN
      INSERT INTO public.tenant_service_trial_events (
        tenant_id, trial_id, event_key, event_type, from_status, to_status,
        metadata, occurred_at
      ) VALUES (
        v_trial.tenant_id, v_trial.id,
        'effective:active:' || extract(epoch FROM v_trial.starts_at)::text,
        'trial_activated', 'scheduled', 'active', '{}'::jsonb, v_trial.starts_at
      ) ON CONFLICT (trial_id, event_key) DO NOTHING;
    END IF;

    IF v_from_status IN ('scheduled', 'active')
      AND p_now >= v_trial.trial_ends_at
      AND v_trial.trial_ends_at < v_trial.grace_ends_at
    THEN
      INSERT INTO public.tenant_service_trial_events (
        tenant_id, trial_id, event_key, event_type, from_status, to_status,
        metadata, occurred_at
      ) VALUES (
        v_trial.tenant_id, v_trial.id,
        'effective:grace_period:' || extract(epoch FROM v_trial.trial_ends_at)::text,
        'trial_grace_started', 'active', 'grace_period', '{}'::jsonb,
        v_trial.trial_ends_at
      ) ON CONFLICT (trial_id, event_key) DO NOTHING;
    END IF;

    IF v_from_status IN ('scheduled', 'active', 'grace_period')
      AND p_now >= v_trial.grace_ends_at
    THEN
      INSERT INTO public.tenant_service_trial_events (
        tenant_id, trial_id, event_key, event_type, from_status, to_status,
        metadata, occurred_at
      ) VALUES (
        v_trial.tenant_id, v_trial.id,
        'effective:expired:' || extract(epoch FROM v_trial.grace_ends_at)::text,
        'trial_expired',
        CASE WHEN v_trial.grace_ends_at > v_trial.trial_ends_at
          THEN 'grace_period' ELSE 'active' END,
        'expired', '{}'::jsonb, v_trial.grace_ends_at
      ) ON CONFLICT (trial_id, event_key) DO NOTHING;
    END IF;
  END IF;
  RETURN v_trial;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_apply(
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_application_reason text,
  p_expected_user_count integer,
  p_expected_project_count integer,
  p_contact_name text,
  p_contact_phone text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text := 'tenant:' || p_tenant_id::text;
  v_request_hash bytea;
  v_replay jsonb;
  v_credit_code text;
  v_enterprise_hash bytea;
  v_policy public.platform_service_trial_policies%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_existing record;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR NULLIF(btrim(p_application_reason), '') IS NULL
    OR char_length(p_application_reason) > 1000
    OR p_expected_user_count IS NULL
    OR p_expected_user_count NOT BETWEEN 1 AND 100000
    OR p_expected_project_count IS NULL
    OR p_expected_project_count NOT BETWEEN 1 AND 1000000
    OR NULLIF(btrim(p_contact_name), '') IS NULL OR char_length(p_contact_name) > 80
    OR p_contact_phone IS NULL
    OR p_contact_phone !~ '^1[3-9][0-9]{9}$'
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'apply', 'tenant_id', p_tenant_id,
    'application_reason', btrim(p_application_reason),
    'expected_user_count', p_expected_user_count,
    'expected_project_count', p_expected_project_count,
    'contact_name', btrim(p_contact_name), 'contact_phone', p_contact_phone
  )::text, 'sha256');
  PERFORM public.platform_service_trial_lock_tenant_actor(
    p_actor_employee_id, p_tenant_id, ARRAY['billing.service_trial.apply']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT regexp_replace(
    upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
  )
  INTO v_credit_code
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
    AND application.status = 'approved'
    AND application.reviewed_at IS NOT NULL
    AND regexp_replace(
      upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
    ) = regexp_replace(
      upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g'
    );
  IF NOT FOUND OR NULLIF(v_credit_code, '') IS NULL THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_enterprise_hash := extensions.digest(v_credit_code, 'sha256');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_enterprise_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || p_tenant_id::text, 20260811005555
  ));

  PERFORM public.platform_service_trial_lock_verified_enterprise_identity(
    p_tenant_id, v_enterprise_hash
  );

  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  FOR v_existing IN
    SELECT id, tenant_id FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash
    ORDER BY tenant_id, id
  LOOP
    PERFORM public.platform_service_trial_normalize_effective_status(
      v_existing.id, v_existing.tenant_id, v_now
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.tenant_service_contracts AS contract
    WHERE contract.tenant_id = p_tenant_id
      AND contract.service_family = 'platform_technical_service'
      AND contract.status = 'active'
      AND contract.service_start_at <= v_now AND contract.service_end_at > v_now
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_service_orders AS paid_onboarding
    WHERE paid_onboarding.tenant_id = p_tenant_id
      AND paid_onboarding.payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
      AND paid_onboarding.service_status NOT IN ('accepted', 'active')
      AND paid_onboarding.paid_at IS NOT NULL
      AND paid_onboarding.service_access_terminated_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash AND status = 'pending_review') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_APPLICATION_PENDING' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash
      AND status IN ('scheduled', 'active', 'grace_period')) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTIVE_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_policy
  FROM public.platform_service_trial_policies WHERE is_current = true FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tenant_service_trials AS previous
    WHERE previous.enterprise_identity_hash = v_enterprise_hash
      AND previous.source = 'tenant_application'
      AND previous.status = 'rejected'
      AND previous.reviewed_at + make_interval(days =>
        coalesce((previous.policy_snapshot->>'reapply_cooldown_days')::integer,
          v_policy.reapply_cooldown_days)) > v_now
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_REAPPLY_COOLDOWN' USING ERRCODE = 'P0001';
  END IF;
  IF NOT v_policy.allow_repeat AND EXISTS (
    SELECT 1 FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash
      AND (granted_at IS NOT NULL OR converted_order_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tenant_service_trials (
    tenant_id, enterprise_identity_hash, source, trial_type, status,
    application_reason, expected_user_count, expected_project_count,
    contact_name, contact_phone, requested_at, requested_by_employee_id,
    scope_snapshot, policy_snapshot
  ) VALUES (
    p_tenant_id, v_enterprise_hash, 'tenant_application', 'standard', 'pending_review',
    btrim(p_application_reason), p_expected_user_count, p_expected_project_count,
    btrim(p_contact_name), p_contact_phone, v_now, p_actor_employee_id,
    v_policy.standard_scope,
    jsonb_build_object(
      'policy_id', v_policy.id, 'version', v_policy.version,
      'trial_days', v_policy.trial_days, 'grace_days', v_policy.grace_days,
      'max_trial_days', v_policy.max_trial_days,
      'max_grace_days', v_policy.max_grace_days,
      'max_schedule_days', v_policy.max_schedule_days,
      'max_extension_count', v_policy.max_extension_count,
      'max_extension_days', v_policy.max_extension_days,
      'reapply_cooldown_days', v_policy.reapply_cooldown_days,
      'allow_repeat', v_policy.allow_repeat,
      'reminder_days', to_jsonb(v_policy.reminder_days)
    )
  ) RETURNING * INTO v_trial;

  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, to_status,
    actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'application-submitted',
    'application_submitted', 'pending_review', p_actor_employee_id,
    jsonb_build_object(
      'expected_user_count', p_expected_user_count,
      'expected_project_count', p_expected_project_count
    ), v_now
  );

  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_withdraw(
  p_trial_id uuid,
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_reason text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text := 'tenant:' || p_tenant_id::text;
  v_request_hash bytea;
  v_replay jsonb;
  v_enterprise_hash bytea;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_tenant_id IS NULL OR p_actor_employee_id IS NULL
    OR p_expected_version IS NULL OR p_idempotency_key IS NULL
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 500
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'withdraw', 'trial_id', p_trial_id,
    'expected_version', p_expected_version, 'reason', btrim(p_reason)
  )::text, 'sha256');
  PERFORM public.platform_service_trial_lock_tenant_actor(
    p_actor_employee_id, p_tenant_id, ARRAY['billing.service_trial.apply']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT enterprise_identity_hash INTO v_enterprise_hash
  FROM public.tenant_service_trials
  WHERE id = p_trial_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_enterprise_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || p_tenant_id::text, 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, p_tenant_id, v_now
  );
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.status <> 'pending_review' OR v_trial.source <> 'tenant_application' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tenant_service_trials SET
    status = 'withdrawn', withdraw_reason = btrim(p_reason), withdrawn_at = v_now,
    withdrawn_by_employee_id = p_actor_employee_id,
    version = version + 1, updated_at = v_now
  WHERE id = v_trial.id RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    reason, actor_employee_id, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'application-withdrawn',
    'application_withdrawn', 'pending_review', 'withdrawn',
    btrim(p_reason), p_actor_employee_id, v_now
  );
  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_review(
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_decision text,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_reason text,
  p_trial_type text DEFAULT NULL,
  p_scope jsonb DEFAULT NULL,
  p_trial_days integer DEFAULT NULL,
  p_grace_days integer DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_assignee_employee_id uuid DEFAULT NULL,
  p_allow_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text;
  v_request_hash bytea;
  v_replay jsonb;
  v_identity record;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_policy public.platform_service_trial_policies%ROWTYPE;
  v_trial_days integer;
  v_grace_days integer;
  v_starts_at timestamptz;
  v_scope jsonb;
  v_override_needed boolean;
  v_repeat_requires_override boolean;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_actor_employee_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL OR p_decision IS NULL
    OR p_decision NOT IN ('approved', 'rejected')
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 1000
    OR p_allow_override IS NULL
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'review', 'trial_id', p_trial_id, 'decision', p_decision,
    'expected_version', p_expected_version, 'reason', btrim(p_reason),
    'trial_type', p_trial_type, 'scope', p_scope, 'trial_days', p_trial_days,
    'grace_days', p_grace_days, 'starts_at', p_starts_at,
    'assignee_employee_id', p_assignee_employee_id
  )::text, 'sha256');
  SELECT tenant_id, enterprise_identity_hash INTO v_identity
  FROM public.tenant_service_trials WHERE id = p_trial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_scope_key := 'tenant:' || v_identity.tenant_id::text;
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.review']
      || CASE WHEN p_trial_type = 'guided' OR p_assignee_employee_id IS NOT NULL
        THEN ARRAY['platform.service_trial.manage'] ELSE '{}'::text[] END
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN
    IF (v_replay->'trial_snapshot'->'policy_snapshot'->'override_used')
      = 'true'::jsonb
    THEN
      IF NOT p_allow_override THEN
        RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    RETURN v_replay;
  END IF;

  IF p_assignee_employee_id IS NOT NULL THEN
    PERFORM public.platform_service_trial_lock_platform_actor(
      p_assignee_employee_id, '{}'::text[]
    );
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_identity.enterprise_identity_hash, 'hex'),
    20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || v_identity.tenant_id::text, 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN
    IF (v_replay->'trial_snapshot'->'policy_snapshot'->'override_used')
      = 'true'::jsonb
    THEN
      IF NOT p_allow_override THEN
        RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    RETURN v_replay;
  END IF;
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, v_identity.tenant_id, v_now
  );
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.status <> 'pending_review' OR v_trial.source <> 'tenant_application' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'approved' THEN
    PERFORM public.platform_service_trial_lock_verified_enterprise_identity(
      v_identity.tenant_id, v_identity.enterprise_identity_hash
    );
  END IF;

  SELECT * INTO v_policy FROM public.platform_service_trial_policies
  WHERE is_current = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;

  IF p_decision = 'rejected' THEN
    IF p_trial_type IS NOT NULL OR p_scope IS NOT NULL OR p_trial_days IS NOT NULL
      OR p_grace_days IS NOT NULL OR p_starts_at IS NOT NULL
      OR p_assignee_employee_id IS NOT NULL OR p_allow_override
    THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.tenant_service_trials SET
      status = 'rejected', review_decision = 'rejected',
      review_reason = btrim(p_reason), reviewed_at = v_now,
      reviewed_by_employee_id = p_actor_employee_id,
      version = version + 1, updated_at = v_now
    WHERE id = v_trial.id RETURNING * INTO v_trial;
    INSERT INTO public.tenant_service_trial_events (
      tenant_id, trial_id, event_key, event_type, from_status, to_status,
      reason, actor_employee_id, occurred_at
    ) VALUES (
      v_trial.tenant_id, v_trial.id, 'application-rejected',
      'application_rejected', 'pending_review', 'rejected',
      btrim(p_reason), p_actor_employee_id, v_now
    );
  ELSE
    IF p_trial_type IS NULL OR p_trial_type NOT IN ('standard', 'guided')
      OR (p_trial_type = 'guided' AND p_assignee_employee_id IS NULL)
    THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.tenant_service_contracts AS contract
      WHERE contract.tenant_id = v_trial.tenant_id
        AND contract.service_family = 'platform_technical_service'
        AND contract.status = 'active'
        AND contract.service_start_at <= v_now AND contract.service_end_at > v_now
    ) OR EXISTS (
      SELECT 1 FROM public.tenant_service_orders AS paid_onboarding
      WHERE paid_onboarding.tenant_id = v_trial.tenant_id
        AND paid_onboarding.payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
        AND paid_onboarding.service_status NOT IN ('accepted', 'active')
        AND paid_onboarding.paid_at IS NOT NULL
        AND paid_onboarding.service_access_terminated_at IS NULL
    ) THEN RAISE EXCEPTION 'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE' USING ERRCODE = 'P0001'; END IF;

    v_scope := coalesce(p_scope, CASE WHEN p_trial_type = 'guided'
      THEN v_policy.guided_scope ELSE v_policy.standard_scope END);
    IF NOT public.platform_service_trial_scope_valid(v_scope) THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
    END IF;
    v_repeat_requires_override := EXISTS (
      SELECT 1 FROM public.tenant_service_trials AS previous
      WHERE previous.enterprise_identity_hash = v_trial.enterprise_identity_hash
        AND previous.id <> v_trial.id
        AND (previous.granted_at IS NOT NULL OR previous.converted_order_id IS NOT NULL)
    ) AND NOT v_policy.allow_repeat;
    IF v_repeat_requires_override AND NOT p_allow_override THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE' USING ERRCODE = 'P0001';
    END IF;

    v_trial_days := coalesce(p_trial_days, v_policy.trial_days);
    v_grace_days := coalesce(p_grace_days, v_policy.grace_days);
    v_starts_at := coalesce(p_starts_at, v_now);
    v_override_needed := v_repeat_requires_override
      OR v_trial_days > v_policy.max_trial_days
      OR v_grace_days > v_policy.max_grace_days
      OR v_starts_at > v_now + make_interval(days => v_policy.max_schedule_days);
    IF v_trial_days NOT BETWEEN 1 AND 365 OR v_grace_days NOT BETWEEN 0 AND 30
      OR v_starts_at < v_now - interval '5 minutes'
    THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
    IF v_override_needed AND NOT p_allow_override THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF v_override_needed THEN
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    v_status := CASE WHEN v_starts_at > v_now THEN 'scheduled' ELSE 'active' END;

    UPDATE public.tenant_service_trials SET
      trial_type = p_trial_type, status = v_status,
      review_decision = 'approved', review_reason = btrim(p_reason),
      reviewed_at = v_now, reviewed_by_employee_id = p_actor_employee_id,
      granted_at = v_now, granted_by_employee_id = p_actor_employee_id,
      starts_at = v_starts_at,
      activated_at = CASE WHEN v_status = 'active' THEN v_now ELSE NULL END,
      trial_ends_at = v_starts_at + make_interval(days => v_trial_days),
      grace_ends_at = v_starts_at + make_interval(days => v_trial_days + v_grace_days),
      scope_snapshot = v_scope, assignee_employee_id = p_assignee_employee_id,
      policy_snapshot = jsonb_build_object(
        'policy_id', v_policy.id, 'version', v_policy.version,
        'trial_days', v_trial_days, 'grace_days', v_grace_days,
        'max_trial_days', v_policy.max_trial_days,
        'max_grace_days', v_policy.max_grace_days,
        'max_schedule_days', v_policy.max_schedule_days,
        'max_extension_count', v_policy.max_extension_count,
        'max_extension_days', v_policy.max_extension_days,
        'reapply_cooldown_days', v_policy.reapply_cooldown_days,
        'allow_repeat', v_policy.allow_repeat,
        'reminder_days', to_jsonb(v_policy.reminder_days),
        'override_used', v_override_needed
      ), version = version + 1, updated_at = v_now
    WHERE id = v_trial.id RETURNING * INTO v_trial;
    INSERT INTO public.tenant_service_trial_events (
      tenant_id, trial_id, event_key, event_type, from_status, to_status,
      reason, actor_employee_id, metadata, occurred_at
    ) VALUES (
      v_trial.tenant_id, v_trial.id, 'application-approved',
      'application_approved', 'pending_review', v_status, btrim(p_reason),
      p_actor_employee_id,
      jsonb_build_object('trial_type', p_trial_type, 'override_used', v_override_needed),
      v_now
    );
    IF v_status = 'active' THEN
      INSERT INTO public.tenant_service_trial_events (
        tenant_id, trial_id, event_key, event_type, from_status, to_status,
        actor_employee_id, metadata, occurred_at
      ) VALUES (
        v_trial.tenant_id, v_trial.id,
        'effective:active:' || extract(epoch FROM v_trial.starts_at)::text,
        'trial_activated', 'pending_review', 'active',
        p_actor_employee_id, '{}'::jsonb, v_trial.starts_at
      ) ON CONFLICT (trial_id, event_key) DO NOTHING;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_grant(
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_trial_type text,
  p_scope jsonb,
  p_reason text,
  p_idempotency_key uuid,
  p_trial_days integer DEFAULT NULL,
  p_grace_days integer DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_assignee_employee_id uuid DEFAULT NULL,
  p_allow_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text := 'tenant:' || p_tenant_id::text;
  v_request_hash bytea;
  v_replay jsonb;
  v_credit_code text;
  v_enterprise_hash bytea;
  v_policy public.platform_service_trial_policies%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_existing record;
  v_trial_days integer;
  v_grace_days integer;
  v_starts_at timestamptz;
  v_scope jsonb;
  v_override_needed boolean;
  v_repeat_requires_override boolean;
  v_status text;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR p_trial_type IS NULL OR p_trial_type NOT IN ('standard', 'guided')
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 1000
    OR (p_trial_type = 'guided' AND p_assignee_employee_id IS NULL)
    OR p_allow_override IS NULL
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'grant', 'tenant_id', p_tenant_id, 'trial_type', p_trial_type,
    'scope', p_scope, 'reason', btrim(p_reason), 'trial_days', p_trial_days,
    'grace_days', p_grace_days, 'starts_at', p_starts_at,
    'assignee_employee_id', p_assignee_employee_id
  )::text, 'sha256');
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN
    IF (v_replay->'trial_snapshot'->'policy_snapshot'->'override_used')
      = 'true'::jsonb
    THEN
      IF NOT p_allow_override THEN
        RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    RETURN v_replay;
  END IF;

  IF p_assignee_employee_id IS NOT NULL THEN
    PERFORM public.platform_service_trial_lock_platform_actor(
      p_assignee_employee_id, '{}'::text[]
    );
  END IF;
  SELECT regexp_replace(
    upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
  )
  INTO v_credit_code
  FROM public.tenants AS tenant
  JOIN public.tenant_onboarding_applications AS application
    ON application.converted_tenant_id = tenant.id
  WHERE tenant.id = p_tenant_id
    AND tenant.status = 'active'
    AND application.status = 'approved'
    AND application.reviewed_at IS NOT NULL
    AND regexp_replace(
      upper(btrim(application.unified_social_credit_code)), '\s+', '', 'g'
    ) = regexp_replace(
      upper(btrim(tenant.unified_social_credit_code)), '\s+', '', 'g'
    );
  IF NOT FOUND OR NULLIF(v_credit_code, '') IS NULL THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  v_enterprise_hash := extensions.digest(v_credit_code, 'sha256');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_enterprise_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || p_tenant_id::text, 20260811005555
  ));
  PERFORM public.platform_service_trial_lock_verified_enterprise_identity(
    p_tenant_id, v_enterprise_hash
  );

  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN
    IF (v_replay->'trial_snapshot'->'policy_snapshot'->'override_used')
      = 'true'::jsonb
    THEN
      IF NOT p_allow_override THEN
        RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM public.platform_service_trial_lock_platform_actor(
        p_actor_employee_id, ARRAY['platform.service_trial.override']
      );
    END IF;
    RETURN v_replay;
  END IF;

  FOR v_existing IN
    SELECT id, tenant_id FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash ORDER BY tenant_id, id
  LOOP
    PERFORM public.platform_service_trial_normalize_effective_status(
      v_existing.id, v_existing.tenant_id, v_now
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.tenant_service_contracts AS contract
    WHERE contract.tenant_id = p_tenant_id
      AND contract.service_family = 'platform_technical_service'
      AND contract.status = 'active'
      AND contract.service_start_at <= v_now AND contract.service_end_at > v_now
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_service_orders AS paid_onboarding
    WHERE paid_onboarding.tenant_id = p_tenant_id
      AND paid_onboarding.payment_status IN ('paid', 'refund_reviewing', 'refunding', 'partially_refunded')
      AND paid_onboarding.service_status NOT IN ('accepted', 'active')
      AND paid_onboarding.paid_at IS NOT NULL
      AND paid_onboarding.service_access_terminated_at IS NULL
  ) THEN RAISE EXCEPTION 'SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash AND status = 'pending_review') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_APPLICATION_PENDING' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash
      AND status IN ('scheduled', 'active', 'grace_period')) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTIVE_EXISTS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_policy FROM public.platform_service_trial_policies
  WHERE is_current = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_scope := coalesce(p_scope, CASE WHEN p_trial_type = 'guided'
    THEN v_policy.guided_scope ELSE v_policy.standard_scope END);
  IF NOT public.platform_service_trial_scope_valid(v_scope) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  v_repeat_requires_override := EXISTS (SELECT 1 FROM public.tenant_service_trials
    WHERE enterprise_identity_hash = v_enterprise_hash
      AND (granted_at IS NOT NULL OR converted_order_id IS NOT NULL))
    AND NOT v_policy.allow_repeat;
  IF v_repeat_requires_override AND NOT p_allow_override THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  v_trial_days := coalesce(p_trial_days, v_policy.trial_days);
  v_grace_days := coalesce(p_grace_days, v_policy.grace_days);
  v_starts_at := coalesce(p_starts_at, v_now);
  v_override_needed := v_repeat_requires_override
    OR v_trial_days > v_policy.max_trial_days
    OR v_grace_days > v_policy.max_grace_days
    OR v_starts_at > v_now + make_interval(days => v_policy.max_schedule_days);
  IF v_trial_days NOT BETWEEN 1 AND 365 OR v_grace_days NOT BETWEEN 0 AND 30
    OR v_starts_at < v_now - interval '5 minutes'
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  IF v_override_needed AND NOT p_allow_override THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_override_needed THEN
    PERFORM public.platform_service_trial_lock_platform_actor(
      p_actor_employee_id, ARRAY['platform.service_trial.override']
    );
  END IF;
  v_status := CASE WHEN v_starts_at > v_now THEN 'scheduled' ELSE 'active' END;

  INSERT INTO public.tenant_service_trials (
    tenant_id, enterprise_identity_hash, source, trial_type, status,
    grant_reason, granted_at, granted_by_employee_id, starts_at, activated_at,
    trial_ends_at, grace_ends_at, assignee_employee_id,
    scope_snapshot, policy_snapshot
  ) VALUES (
    p_tenant_id, v_enterprise_hash, 'platform_grant', p_trial_type, v_status,
    btrim(p_reason), v_now, p_actor_employee_id, v_starts_at,
    CASE WHEN v_status = 'active' THEN v_now ELSE NULL END,
    v_starts_at + make_interval(days => v_trial_days),
    v_starts_at + make_interval(days => v_trial_days + v_grace_days),
    p_assignee_employee_id, v_scope,
    jsonb_build_object(
      'policy_id', v_policy.id, 'version', v_policy.version,
      'trial_days', v_trial_days, 'grace_days', v_grace_days,
      'max_trial_days', v_policy.max_trial_days,
      'max_grace_days', v_policy.max_grace_days,
      'max_schedule_days', v_policy.max_schedule_days,
      'max_extension_count', v_policy.max_extension_count,
      'max_extension_days', v_policy.max_extension_days,
      'reapply_cooldown_days', v_policy.reapply_cooldown_days,
      'allow_repeat', v_policy.allow_repeat,
      'reminder_days', to_jsonb(v_policy.reminder_days),
      'override_used', v_override_needed
    )
  ) RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, to_status,
    reason, actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'trial-granted', 'trial_granted',
    v_trial.status, btrim(p_reason), p_actor_employee_id,
    jsonb_build_object('trial_type', p_trial_type, 'override_used', v_override_needed),
    v_now
  );
  IF v_status = 'active' THEN
    INSERT INTO public.tenant_service_trial_events (
      tenant_id, trial_id, event_key, event_type, to_status,
      actor_employee_id, metadata, occurred_at
    ) VALUES (
      v_trial.tenant_id, v_trial.id,
      'effective:active:' || extract(epoch FROM v_trial.starts_at)::text,
      'trial_activated', 'active', p_actor_employee_id, '{}'::jsonb,
      v_trial.starts_at
    ) ON CONFLICT (trial_id, event_key) DO NOTHING;
  END IF;
  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_extend(
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_extension_days integer,
  p_reason text,
  p_allow_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text;
  v_request_hash bytea;
  v_replay jsonb;
  v_identity record;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_from_status text;
  v_new_end timestamptz;
  v_grace_days integer;
  v_override_needed boolean;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_actor_employee_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL OR p_extension_days IS NULL
    OR p_extension_days NOT BETWEEN 1 AND 365
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 1000
    OR p_allow_override IS NULL
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_EXTENSION_INVALID' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'extend', 'trial_id', p_trial_id,
    'expected_version', p_expected_version, 'extension_days', p_extension_days,
    'reason', btrim(p_reason)
  )::text, 'sha256');
  SELECT tenant_id, enterprise_identity_hash INTO v_identity
  FROM public.tenant_service_trials WHERE id = p_trial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_scope_key := 'tenant:' || v_identity.tenant_id::text;
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage', 'platform.service_trial.override']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_identity.enterprise_identity_hash, 'hex'),
    20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || v_identity.tenant_id::text, 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, v_identity.tenant_id, v_now
  );
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.status NOT IN ('active', 'grace_period') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  v_from_status := v_trial.status;
  v_override_needed := (
    v_trial.extension_count >= coalesce(
      (v_trial.policy_snapshot->>'max_extension_count')::integer, 1
    ) OR p_extension_days > coalesce(
      (v_trial.policy_snapshot->>'max_extension_days')::integer, 30
    )
  );
  IF v_override_needed AND NOT p_allow_override THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_OVERRIDE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.extension_count >= 20 THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_EXTENSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  v_new_end := greatest(v_now, v_trial.trial_ends_at)
    + make_interval(days => p_extension_days);
  IF v_new_end > v_trial.starts_at + interval '365 days' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_EXTENSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  v_grace_days := least(30, greatest(0,
    extract(epoch FROM (v_trial.grace_ends_at - v_trial.trial_ends_at))::integer / 86400
  ));
  UPDATE public.tenant_service_trials SET
    status = 'active', activated_at = coalesce(activated_at, v_now),
    trial_ends_at = v_new_end,
    grace_ends_at = v_new_end + make_interval(days => v_grace_days),
    extension_count = extension_count + 1,
    version = version + 1, updated_at = v_now
  WHERE id = v_trial.id RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    reason, actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'extend:' || v_trial.version::text,
    'trial_extended', v_from_status, 'active', btrim(p_reason),
    p_actor_employee_id,
    jsonb_build_object('extension_days', p_extension_days,
      'override_used', v_override_needed),
    v_now
  );
  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_revoke(
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text;
  v_request_hash bytea;
  v_replay jsonb;
  v_identity record;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_from_status text;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_actor_employee_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL OR NULLIF(btrim(p_reason), '') IS NULL
    OR char_length(p_reason) > 1000
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'revoke', 'trial_id', p_trial_id,
    'expected_version', p_expected_version, 'reason', btrim(p_reason)
  )::text, 'sha256');
  SELECT tenant_id, enterprise_identity_hash INTO v_identity
  FROM public.tenant_service_trials WHERE id = p_trial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_scope_key := 'tenant:' || v_identity.tenant_id::text;
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage', 'platform.service_trial.override']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_identity.enterprise_identity_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || v_identity.tenant_id::text, 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, v_identity.tenant_id, v_now
  );
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.status NOT IN ('scheduled', 'active', 'grace_period') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  v_from_status := v_trial.status;
  UPDATE public.tenant_service_trials SET
    status = 'revoked', revoke_reason = btrim(p_reason), revoked_at = v_now,
    revoked_by_employee_id = p_actor_employee_id,
    version = version + 1, updated_at = v_now
  WHERE id = v_trial.id RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    reason, actor_employee_id, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'revoke:' || v_trial.version::text,
    'trial_revoked', v_from_status, 'revoked', btrim(p_reason),
    p_actor_employee_id, v_now
  );
  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_assign(
  p_trial_id uuid,
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_assignee_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_scope_key text;
  v_request_hash bytea;
  v_replay jsonb;
  v_identity record;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_trial_id IS NULL OR p_actor_employee_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'assign', 'trial_id', p_trial_id,
    'expected_version', p_expected_version,
    'assignee_employee_id', p_assignee_employee_id
  )::text, 'sha256');
  SELECT tenant_id, enterprise_identity_hash INTO v_identity
  FROM public.tenant_service_trials WHERE id = p_trial_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  v_scope_key := 'tenant:' || v_identity.tenant_id::text;
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id, ARRAY['platform.service_trial.manage']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF p_assignee_employee_id IS NOT NULL THEN
    PERFORM public.platform_service_trial_lock_platform_actor(
      p_assignee_employee_id, '{}'::text[]
    );
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-enterprise:' || encode(v_identity.enterprise_identity_hash, 'hex'), 20260811005555
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || v_identity.tenant_id::text, 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, v_identity.tenant_id, v_now
  );
  IF v_trial.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF v_trial.status IN ('rejected', 'withdrawn', 'revoked', 'expired', 'converted') THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tenant_service_trials SET
    assignee_employee_id = p_assignee_employee_id,
    version = version + 1, updated_at = v_now
  WHERE id = v_trial.id RETURNING * INTO v_trial;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    actor_employee_id, metadata, occurred_at
  ) VALUES (
    v_trial.tenant_id, v_trial.id, 'assign:' || v_trial.version::text,
    'trial_assigned', v_trial.status, v_trial.status, p_actor_employee_id,
    jsonb_build_object('assigned', p_assignee_employee_id IS NOT NULL), v_now
  );
  v_result := jsonb_build_object(
    'trial_id', v_trial.id, 'tenant_id', v_trial.tenant_id,
    'status', v_trial.status, 'version', v_trial.version,
    'assigned', p_assignee_employee_id IS NOT NULL,
    'trial_snapshot', public.platform_service_trial_command_snapshot(v_trial)
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, v_trial.tenant_id,
    v_trial.id, p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_update_policy(
  p_actor_employee_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_policy jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope_key text := 'platform:service_trial_policy';
  v_request_hash bytea;
  v_replay jsonb;
  v_current public.platform_service_trial_policies%ROWTYPE;
  v_new public.platform_service_trial_policies%ROWTYPE;
  v_trial_days integer;
  v_grace_days integer;
  v_reminder_days integer[];
  v_max_trial_days integer;
  v_max_grace_days integer;
  v_max_schedule_days integer;
  v_max_extension_count integer;
  v_max_extension_days integer;
  v_reapply_cooldown_days integer;
  v_allow_repeat boolean;
  v_standard_scope jsonb;
  v_guided_scope jsonb;
  v_result jsonb;
BEGIN
  IF p_actor_employee_id IS NULL OR p_expected_version IS NULL
    OR p_idempotency_key IS NULL OR jsonb_typeof(p_policy) <> 'object'
    OR NULLIF(btrim(p_reason), '') IS NULL OR char_length(p_reason) > 500
    OR (SELECT count(*) FROM jsonb_object_keys(p_policy)) <> 12
    OR NOT (p_policy ?& ARRAY[
      'trial_days', 'grace_days', 'reminder_days', 'max_trial_days',
      'max_grace_days', 'max_schedule_days', 'max_extension_count',
      'max_extension_days', 'reapply_cooldown_days', 'allow_repeat',
      'standard_scope', 'guided_scope'
    ])
    OR pg_column_size(p_policy) > 16384
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;

  BEGIN
    v_trial_days := (p_policy->>'trial_days')::integer;
    v_grace_days := (p_policy->>'grace_days')::integer;
    SELECT array_agg(value::integer ORDER BY ordinal)
    INTO v_reminder_days
    FROM jsonb_array_elements_text(p_policy->'reminder_days')
      WITH ORDINALITY AS reminder(value, ordinal);
    v_max_trial_days := (p_policy->>'max_trial_days')::integer;
    v_max_grace_days := (p_policy->>'max_grace_days')::integer;
    v_max_schedule_days := (p_policy->>'max_schedule_days')::integer;
    v_max_extension_count := (p_policy->>'max_extension_count')::integer;
    v_max_extension_days := (p_policy->>'max_extension_days')::integer;
    v_reapply_cooldown_days := (p_policy->>'reapply_cooldown_days')::integer;
    v_allow_repeat := (p_policy->>'allow_repeat')::boolean;
    v_standard_scope := p_policy->'standard_scope';
    v_guided_scope := p_policy->'guided_scope';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END;

  IF v_trial_days IS NULL OR v_grace_days IS NULL
    OR v_max_trial_days IS NULL OR v_max_grace_days IS NULL
    OR v_max_schedule_days IS NULL OR v_max_extension_count IS NULL
    OR v_max_extension_days IS NULL OR v_reapply_cooldown_days IS NULL
    OR v_allow_repeat IS NULL OR v_reminder_days IS NULL
    OR v_trial_days NOT BETWEEN 1 AND 365 OR v_grace_days NOT BETWEEN 0 AND 30
    OR v_max_trial_days NOT BETWEEN v_trial_days AND 365
    OR v_max_grace_days NOT BETWEEN v_grace_days AND 30
    OR v_max_schedule_days NOT BETWEEN 0 AND 365
    OR v_max_extension_count NOT BETWEEN 0 AND 20
    OR v_max_extension_days NOT BETWEEN 1 AND 365
    OR v_reapply_cooldown_days NOT BETWEEN 0 AND 365
    OR cardinality(v_reminder_days) NOT BETWEEN 1 AND 10
    OR NOT (0 < ALL(v_reminder_days))
    OR NOT public.platform_service_trial_scope_valid(v_standard_scope)
    OR NOT public.platform_service_trial_scope_valid(v_guided_scope)
  THEN RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;

  v_request_hash := extensions.digest(jsonb_build_object(
    'action', 'update_policy', 'expected_version', p_expected_version,
    'policy', p_policy, 'reason', btrim(p_reason)
  )::text, 'sha256');
  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage', 'platform.service_trial.override']
  );
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-policy:current', 20260811005555
  ));
  v_replay := public.platform_service_trial_replay_command(
    v_scope_key, p_idempotency_key, v_request_hash
  );
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_current FROM public.platform_service_trial_policies
  WHERE is_current = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_TRIAL_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_current.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.platform_service_trial_policies
  SET is_current = false, updated_at = clock_timestamp(),
    updated_by_employee_id = p_actor_employee_id
  WHERE id = v_current.id;
  INSERT INTO public.platform_service_trial_policies (
    is_current, trial_days, grace_days, reminder_days, max_trial_days,
    max_grace_days, max_schedule_days, max_extension_count,
    max_extension_days, reapply_cooldown_days, allow_repeat,
    standard_scope, guided_scope, version, change_reason,
    created_by_employee_id, updated_by_employee_id
  ) VALUES (
    true, v_trial_days, v_grace_days, v_reminder_days, v_max_trial_days,
    v_max_grace_days, v_max_schedule_days, v_max_extension_count,
    v_max_extension_days, v_reapply_cooldown_days, v_allow_repeat,
    v_standard_scope, v_guided_scope, v_current.version + 1, btrim(p_reason),
    p_actor_employee_id, p_actor_employee_id
  ) RETURNING * INTO v_new;
  v_result := jsonb_build_object(
    'policy_id', v_new.id, 'version', v_new.version, 'is_current', true
  );
  RETURN public.platform_service_trial_store_command(
    v_scope_key, p_idempotency_key, v_request_hash, NULL, NULL,
    p_actor_employee_id, v_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_platform_summary(
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH effective AS MATERIALIZED (
    SELECT trial.*,
      CASE
        WHEN trial.status IN ('scheduled', 'active', 'grace_period')
          AND p_now >= trial.grace_ends_at THEN 'expired'
        WHEN trial.status IN ('scheduled', 'active')
          AND p_now >= trial.trial_ends_at
          AND p_now < trial.grace_ends_at THEN 'grace_period'
        WHEN trial.status = 'scheduled' AND p_now >= trial.starts_at THEN 'active'
        ELSE trial.status
      END AS effective_status
    FROM public.tenant_service_trials AS trial
  ), aggregate AS (
    SELECT
      count(*) FILTER (WHERE status = 'pending_review') AS pending_review_count,
      count(*) FILTER (WHERE effective_status = 'scheduled') AS scheduled_count,
      count(*) FILTER (WHERE effective_status IN ('active', 'grace_period')) AS current_active_count,
      count(*) FILTER (
        WHERE effective_status IN ('active', 'grace_period')
          AND trial_ends_at >= p_now
          AND trial_ends_at < p_now + interval '7 days'
      ) AS expiring_within_7_days_count,
      count(*) FILTER (
        WHERE created_at >= date_trunc('month', p_now)
      ) AS month_new_count,
      count(*) FILTER (
        WHERE review_decision = 'approved'
          AND reviewed_at >= date_trunc('month', p_now)
      ) AS month_approved_count,
      count(*) FILTER (
        WHERE converted_at >= date_trunc('month', p_now)
      ) AS month_converted_count,
      count(*) FILTER (
        WHERE source = 'tenant_application' AND review_decision IN ('approved', 'rejected')
      ) AS application_reviewed_count,
      count(*) FILTER (
        WHERE source = 'tenant_application' AND review_decision = 'approved'
      ) AS application_approved_count,
      count(*) FILTER (
        WHERE activated_at >= date_trunc('month', p_now)
          AND activated_at < date_trunc('month', p_now) + interval '1 month'
      ) AS activated_cohort_count,
      count(*) FILTER (
        WHERE activated_at >= date_trunc('month', p_now)
          AND activated_at < date_trunc('month', p_now) + interval '1 month'
          AND converted_at IS NOT NULL
      ) AS activated_cohort_converted_count
    FROM effective
  )
  SELECT jsonb_build_object(
    'pending_review_count', pending_review_count,
    'scheduled_count', scheduled_count,
    'current_active_count', current_active_count,
    'expiring_within_7_days_count', expiring_within_7_days_count,
    'month_new_count', month_new_count,
    'month_approved_count', month_approved_count,
    'month_converted_count', month_converted_count,
    'application_approval_rate', CASE WHEN application_reviewed_count = 0 THEN 0
      ELSE round(application_approved_count::numeric / application_reviewed_count, 4) END,
    'activated_cohort_conversion_rate', CASE WHEN activated_cohort_count = 0 THEN 0
      ELSE round(activated_cohort_converted_count::numeric / activated_cohort_count, 4) END,
    'server_time', p_now
  )
  FROM aggregate;
$$;

ALTER TABLE public.tenant_service_orders
  ADD CONSTRAINT tenant_service_orders_source_trial_tenant_fkey
  FOREIGN KEY (source_trial_id, tenant_id)
  REFERENCES public.tenant_service_trials(id, tenant_id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX tenant_service_orders_open_source_trial_unique
  ON public.tenant_service_orders (source_trial_id)
  WHERE source_trial_id IS NOT NULL AND payment_status <> 'closed';

COMMENT ON COLUMN public.tenant_service_orders.source_trial_id IS
  '显式购买来源试用；仅 API service 可自动选择，订单 RPC 只消费调用方显式传入值';

DROP FUNCTION public.platform_service_create_pending_order(
  uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer,
  bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text
);

CREATE OR REPLACE FUNCTION public.platform_service_create_pending_order(
  p_tenant_id uuid,
  p_product_id uuid,
  p_product_version_id uuid,
  p_order_no text,
  p_out_trade_no text,
  p_idempotency_key uuid,
  p_product_code text,
  p_pricing_version integer,
  p_product_snapshot jsonb,
  p_term_years integer,
  p_amount_fen bigint,
  p_payment_config_id uuid,
  p_payment_config_guard_version integer,
  p_payer_openid text,
  p_payment_expires_at timestamptz,
  p_terms_version integer,
  p_terms_accepted_at timestamptz,
  p_created_by_employee_id uuid,
  p_required_channel text DEFAULT 'platform_service',
  p_source_trial_id uuid DEFAULT NULL
)
RETURNS public.tenant_service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_config public.platform_payment_configs%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_trial_identity record;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_required_channel IS NULL OR btrim(p_required_channel) = '' THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CHANNEL_REQUIRED';
  END IF;

  IF p_source_trial_id IS NOT NULL THEN
    -- Lock the employee identity before any trial/order fact lock so employee
    -- deletion cannot invert the FK lock order with this source-attributed path.
    PERFORM employee.id
    FROM public.employees AS employee
    WHERE employee.id = p_created_by_employee_id
      AND employee.tenant_id = p_tenant_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT trial.tenant_id, trial.enterprise_identity_hash
    INTO v_trial_identity
    FROM public.tenant_service_trials AS trial
    WHERE trial.id = p_source_trial_id
      AND trial.tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'service-trial-enterprise:' || encode(v_trial_identity.enterprise_identity_hash, 'hex'),
      20260811005555
    ));
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'service-trial-tenant:' || p_tenant_id::text, 20260811005555
    ));
    v_trial := public.platform_service_trial_normalize_effective_status(
      p_source_trial_id, p_tenant_id, v_now
    );
    IF v_trial.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_trial.status NOT IN (
        'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
        'rejected', 'withdrawn', 'revoked', 'converted'
      )
    THEN RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT *
  INTO v_payment_config
  FROM public.platform_payment_configs
  WHERE id = p_payment_config_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_NOT_FOUND';
  END IF;

  IF v_payment_config.provider <> 'wechat_pay'
    OR v_payment_config.principal_type <> 'platform'
    OR v_payment_config.merchant_mode <> 'direct_merchant'
    OR v_payment_config.status <> 'active'
    OR NOT (p_required_channel = ANY(v_payment_config.enabled_channels))
  THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_INVALID';
  END IF;

  IF v_payment_config.recharge_guard_version <> p_payment_config_guard_version THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_VERSION_CONFLICT';
  END IF;

  BEGIN
    INSERT INTO public.tenant_service_orders (
      tenant_id,
      product_id,
      product_version_id,
      order_no,
      out_trade_no,
      idempotency_key,
      product_code,
      pricing_version,
      product_snapshot,
      term_years,
      amount_fen,
      payment_config_id,
      payment_config_guard_version,
      payer_openid,
      payment_expires_at,
      terms_version,
      terms_accepted_at,
      created_by_employee_id,
      source_trial_id
    )
    VALUES (
      p_tenant_id,
      p_product_id,
      p_product_version_id,
      p_order_no,
      p_out_trade_no,
      p_idempotency_key,
      p_product_code,
      p_pricing_version,
      p_product_snapshot,
      p_term_years,
      p_amount_fen,
      p_payment_config_id,
      p_payment_config_guard_version,
      p_payer_openid,
      p_payment_expires_at,
      p_terms_version,
      p_terms_accepted_at,
      p_created_by_employee_id,
      p_source_trial_id
    )
    RETURNING * INTO v_order;
  EXCEPTION WHEN unique_violation THEN
    IF p_source_trial_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.tenant_service_orders AS conflicting
      WHERE conflicting.source_trial_id = p_source_trial_id
        AND conflicting.payment_status <> 'closed'
    ) THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RAISE;
  END;

  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_confirm_payment(
  p_order_id uuid,
  p_transaction_id text,
  p_paid_amount_fen bigint,
  p_paid_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_snapshot public.tenant_service_orders%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_trial_identity record;
  v_trial_from_status text;
  v_conversion_anomaly jsonb := NULL;
  v_paid_at timestamptz;
BEGIN
  IF p_transaction_id IS NULL OR btrim(p_transaction_id) = '' THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_TRANSACTION_ID_REQUIRED';
  END IF;

  IF p_paid_amount_fen IS NULL OR p_paid_amount_fen <= 0 THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_AMOUNT_MISMATCH';
  END IF;

  -- Resolve the lock namespace without taking a business row lock. Every
  -- payment path then takes enterprise (when sourced), tenant, trial (when
  -- sourced), and finally order, matching source order creation.
  SELECT *
  INTO v_order_snapshot
  FROM public.tenant_service_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;

  IF v_order_snapshot.source_trial_id IS NOT NULL THEN
    SELECT trial.tenant_id, trial.enterprise_identity_hash
    INTO v_trial_identity
    FROM public.tenant_service_trials AS trial
    WHERE trial.id = v_order_snapshot.source_trial_id
      AND trial.tenant_id = v_order_snapshot.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'service-trial-enterprise:' || encode(v_trial_identity.enterprise_identity_hash, 'hex'),
      20260811005555
    ));
  END IF;

  -- Unsourced payments also take the tenant mutex so a simultaneous review or
  -- grant cannot inspect a pre-payment formal-service snapshot.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'service-trial-tenant:' || v_order_snapshot.tenant_id::text, 20260811005555
  ));

  IF v_order_snapshot.source_trial_id IS NOT NULL THEN
    SELECT trial.* INTO v_trial
    FROM public.tenant_service_trials AS trial
    WHERE trial.id = v_order_snapshot.source_trial_id
      AND trial.tenant_id = v_order_snapshot.tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_ORDER_SOURCE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM v_order_snapshot.tenant_id
    OR v_order.source_trial_id IS DISTINCT FROM v_order_snapshot.source_trial_id
  THEN
    RAISE EXCEPTION 'SERVICE_ORDER_INVALID_STATE';
  END IF;

  IF v_order.payment_status IN (
    'paid',
    'refund_reviewing',
    'refunding',
    'partially_refunded',
    'refunded'
  ) THEN
    IF v_order.transaction_id IS DISTINCT FROM p_transaction_id THEN
      RAISE EXCEPTION 'SERVICE_PAYMENT_TRANSACTION_MISMATCH';
    END IF;

    IF v_order.paid_amount_fen IS DISTINCT FROM p_paid_amount_fen
      OR v_order.amount_fen IS DISTINCT FROM p_paid_amount_fen
    THEN
      RAISE EXCEPTION 'SERVICE_PAYMENT_AMOUNT_MISMATCH';
    END IF;

    SELECT *
    INTO v_work_order
    FROM public.tenant_service_work_orders
    WHERE service_order_id = v_order.id
      AND tenant_id = v_order.tenant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
    END IF;

    IF v_order.source_trial_id IS NOT NULL THEN
      SELECT event.metadata INTO v_conversion_anomaly
      FROM public.tenant_service_trial_events AS event
      WHERE event.trial_id = v_order.source_trial_id
        AND event.tenant_id = v_order.tenant_id
        AND event.event_type = 'conversion_anomaly'
        AND event.metadata->>'order_id' = v_order.id::text
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
      'order', to_jsonb(v_order),
      'work_order', to_jsonb(v_work_order),
      'access_mode', CASE
        WHEN v_order.service_access_terminated_at IS NULL
          AND v_order.service_status NOT IN ('accepted', 'active')
        THEN 'paid_onboarding'
        ELSE NULL
      END,
      'conversion_anomaly', v_conversion_anomaly,
      'idempotent', true
    );
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'SERVICE_ORDER_INVALID_STATE';
  END IF;

  IF p_paid_amount_fen <> v_order.amount_fen THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_AMOUNT_MISMATCH';
  END IF;

  v_paid_at := coalesce(p_paid_at, clock_timestamp());
  UPDATE public.tenant_service_orders
  SET
    payment_status = 'paid',
    service_status = 'waiting_assignment',
    paid_amount_fen = p_paid_amount_fen,
    paid_at = v_paid_at,
    transaction_id = p_transaction_id,
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.tenant_service_work_orders (
    tenant_id,
    service_order_id,
    order_no,
    status,
    created_by_employee_id
  )
  VALUES (
    v_order.tenant_id,
    v_order.id,
    v_order.order_no,
    'waiting_assignment',
    v_order.created_by_employee_id
  )
  ON CONFLICT (service_order_id) DO NOTHING;

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  -- Funding and the unique work-order fact are complete above. Attribution below
  -- is audit-only on conflict and deliberately has no exception branch that can
  -- roll back a trusted payment fact.
  IF v_order.source_trial_id IS NOT NULL THEN
    v_trial := public.platform_service_trial_normalize_effective_status(
      v_order.source_trial_id, v_order.tenant_id, v_paid_at
    );

    IF v_trial.converted_order_id IS NULL THEN
      v_trial_from_status := v_trial.status;
      UPDATE public.tenant_service_trials SET
        status = CASE WHEN status IN (
          'pending_review', 'scheduled', 'active', 'grace_period', 'expired'
        ) THEN 'converted' ELSE status END,
        converted_order_id = v_order.id,
        converted_at = v_paid_at,
        version = version + 1,
        updated_at = v_paid_at
      WHERE id = v_trial.id
      RETURNING * INTO v_trial;

      INSERT INTO public.tenant_service_trial_events (
        tenant_id, trial_id, event_key, event_type, from_status, to_status,
        metadata, occurred_at
      ) VALUES (
        v_trial.tenant_id, v_trial.id, 'formal:' || v_order.id::text,
        'formal_purchase_attributed', v_trial_from_status, v_trial.status,
        jsonb_build_object('order_id', v_order.id), v_paid_at
      ) ON CONFLICT (trial_id, event_key) DO NOTHING;
    ELSIF v_trial.converted_order_id IS DISTINCT FROM v_order.id THEN
      v_conversion_anomaly := jsonb_build_object(
        'code', 'TRIAL_ALREADY_ATTRIBUTED',
        'trial_id', v_trial.id,
        'order_id', v_order.id,
        'attributed_order_id', v_trial.converted_order_id
      );
      INSERT INTO public.tenant_service_trial_events (
        tenant_id, trial_id, event_key, event_type, from_status, to_status,
        metadata, occurred_at
      ) VALUES (
        v_trial.tenant_id, v_trial.id, 'conversion-anomaly:' || v_order.id::text,
        'conversion_anomaly', v_trial.status, v_trial.status,
        v_conversion_anomaly, v_paid_at
      ) ON CONFLICT (trial_id, event_key) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'work_order', to_jsonb(v_work_order),
    'access_mode', 'paid_onboarding',
    'conversion_anomaly', v_conversion_anomaly,
    'idempotent', false,
    'notification_id', p_notification_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
END;
$$;

INSERT INTO public.permissions (
  code, name, module, resource, action, description, status
)
VALUES
  ('billing.service_trial.apply', '申请技术服务试用', 'billing', 'service_trial', 'apply', '租户提交技术服务试用申请', 'active'),
  ('billing.service_trial.read', '查看技术服务试用', 'billing', 'service_trial', 'read', '租户查看自身试用记录', 'active'),
  ('platform.service_trial.read', '查看技术服务试用', 'platform_billing', 'service_trial', 'read', '平台查看试用与汇总', 'active'),
  ('platform.service_trial.review', '审核技术服务试用', 'platform_billing', 'service_trial', 'review', '平台审批租户试用申请', 'active'),
  ('platform.service_trial.manage', '管理技术服务试用', 'platform_billing', 'service_trial', 'manage', '平台开通、延期、撤销、分配与规则管理', 'active'),
  ('platform.service_trial.override', '例外管理技术服务试用', 'platform_billing', 'service_trial', 'override', '平台批准重复试用和规则上限例外', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

-- The repository's real tenant-admin role code is system_admin. It is tenant
-- scoped here; employee_base and every ordinary employee role receive nothing.
INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permission.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permission
  ON permission.code IN ('billing.service_trial.apply', 'billing.service_trial.read')
  AND permission.status = 'active'
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET access_scope = 'all';

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permission.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permission
  ON permission.code LIKE 'platform.service_trial.%'
  AND permission.status = 'active'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET access_scope = 'all';

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permission.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permission
  ON permission.code IN (
    'platform.service_trial.read',
    'platform.service_trial.review',
    'platform.service_trial.manage'
  )
  AND permission.code <> 'platform.service_trial.override'
  AND permission.status = 'active'
WHERE roles.code = 'platform_operations'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET access_scope = 'all';

ALTER TABLE public.platform_service_trial_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_service_trial_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_commands FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_service_trial_policies FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_service_trial_policies FROM anon;
REVOKE ALL ON TABLE public.platform_service_trial_policies FROM authenticated;
REVOKE ALL ON TABLE public.platform_service_trial_policies FROM service_role;
GRANT SELECT ON TABLE public.platform_service_trial_policies TO service_role;

REVOKE ALL ON TABLE public.tenant_service_trials FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_trials FROM anon;
REVOKE ALL ON TABLE public.tenant_service_trials FROM authenticated;
REVOKE ALL ON TABLE public.tenant_service_trials FROM service_role;
GRANT SELECT ON TABLE public.tenant_service_trials TO service_role;

REVOKE ALL ON TABLE public.tenant_service_trial_events FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_trial_events FROM anon;
REVOKE ALL ON TABLE public.tenant_service_trial_events FROM authenticated;
REVOKE ALL ON TABLE public.tenant_service_trial_events FROM service_role;
GRANT SELECT ON TABLE public.tenant_service_trial_events TO service_role;

REVOKE ALL ON TABLE public.tenant_service_trial_commands FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_trial_commands FROM anon;
REVOKE ALL ON TABLE public.tenant_service_trial_commands FROM authenticated;
REVOKE ALL ON TABLE public.tenant_service_trial_commands FROM service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_scope_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_scope_valid(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_scope_valid(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_scope_valid(jsonb) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_event() FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_event() FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_event() FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_command_snapshot(public.tenant_service_trials) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_command_snapshot(public.tenant_service_trials) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_command_snapshot(public.tenant_service_trials) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_command_snapshot(public.tenant_service_trials) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_tenant_actor(uuid, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_tenant_actor(uuid, uuid, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_tenant_actor(uuid, uuid, text[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_tenant_actor(uuid, uuid, text[]) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_platform_actor(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_platform_actor(uuid, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_platform_actor(uuid, text[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_platform_actor(uuid, text[]) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_verified_enterprise_identity(uuid, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_verified_enterprise_identity(uuid, bytea) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_verified_enterprise_identity(uuid, bytea) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_lock_verified_enterprise_identity(uuid, bytea) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_replay_command(text, uuid, bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_replay_command(text, uuid, bytea) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_replay_command(text, uuid, bytea) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_replay_command(text, uuid, bytea) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_store_command(text, uuid, bytea, uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_store_command(text, uuid, bytea, uuid, uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_store_command(text, uuid, bytea, uuid, uuid, uuid, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_store_command(text, uuid, bytea, uuid, uuid, uuid, jsonb) FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_normalize_effective_status(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_normalize_effective_status(uuid, uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_normalize_effective_status(uuid, uuid, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_normalize_effective_status(uuid, uuid, timestamptz) FROM service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_apply(uuid, uuid, text, integer, integer, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_apply(uuid, uuid, text, integer, integer, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_apply(uuid, uuid, text, integer, integer, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_apply(uuid, uuid, text, integer, integer, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_withdraw(uuid, uuid, uuid, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_withdraw(uuid, uuid, uuid, integer, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_withdraw(uuid, uuid, uuid, integer, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_withdraw(uuid, uuid, uuid, integer, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_review(uuid, uuid, text, integer, uuid, text, text, jsonb, integer, integer, timestamptz, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_review(uuid, uuid, text, integer, uuid, text, text, jsonb, integer, integer, timestamptz, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_review(uuid, uuid, text, integer, uuid, text, text, jsonb, integer, integer, timestamptz, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_review(uuid, uuid, text, integer, uuid, text, text, jsonb, integer, integer, timestamptz, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_grant(uuid, uuid, text, jsonb, text, uuid, integer, integer, timestamptz, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_grant(uuid, uuid, text, jsonb, text, uuid, integer, integer, timestamptz, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_grant(uuid, uuid, text, jsonb, text, uuid, integer, integer, timestamptz, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_grant(uuid, uuid, text, jsonb, text, uuid, integer, integer, timestamptz, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_extend(uuid, uuid, integer, uuid, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_extend(uuid, uuid, integer, uuid, integer, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_extend(uuid, uuid, integer, uuid, integer, text, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_extend(uuid, uuid, integer, uuid, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_revoke(uuid, uuid, integer, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_revoke(uuid, uuid, integer, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_revoke(uuid, uuid, integer, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_revoke(uuid, uuid, integer, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_assign(uuid, uuid, integer, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_assign(uuid, uuid, integer, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_assign(uuid, uuid, integer, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_assign(uuid, uuid, integer, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_update_policy(uuid, integer, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_update_policy(uuid, integer, uuid, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_update_policy(uuid, integer, uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_update_policy(uuid, integer, uuid, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_platform_summary(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_platform_summary(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_platform_summary(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_platform_summary(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_create_pending_order(uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer, bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_create_pending_order(uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer, bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_create_pending_order(uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer, bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_create_pending_order(uuid, uuid, uuid, text, text, uuid, text, integer, jsonb, integer, bigint, uuid, integer, text, timestamptz, integer, timestamptz, uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(uuid, text, bigint, timestamptz, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(uuid, text, bigint, timestamptz, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(uuid, text, bigint, timestamptz, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_confirm_payment(uuid, text, bigint, timestamptz, uuid, jsonb) TO service_role;

COMMENT ON TABLE public.tenant_service_trials IS
  '技术服务试用 aggregate；effective status 由每个写 RPC 在锁内推进，不依赖定时任务';
COMMENT ON TABLE public.tenant_service_trial_events IS
  '不可变试用事件；metadata 禁止联系人/手机号快照且限制 8KiB';
COMMENT ON TABLE public.tenant_service_trial_commands IS
  '90 天命令幂等摘要与非敏感结果 envelope；不保存原始请求或联系人快照';

COMMIT;
