-- Forward-only migration. Never repair this feature with manual DML.
BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
  v_partial_count integer;
BEGIN
  SELECT array_agg(required.name ORDER BY required.name)
  INTO v_missing
  FROM (VALUES
    ('public.tenants'),
    ('public.employees'),
    ('public.roles'),
    ('public.permissions'),
    ('public.employee_roles'),
    ('public.role_permissions'),
    ('public.employee_permission_overrides'),
    ('public.notifications'),
    ('public.tenant_service_trials'),
    ('public.tenant_service_trial_events')
  ) AS required(name)
  WHERE to_regclass(required.name) IS NULL;

  IF v_missing IS NOT NULL
    OR to_regprocedure('public.platform_service_trial_lock_platform_actor(uuid,text[])') IS NULL
    OR to_regprocedure('public.platform_service_trial_normalize_effective_status(uuid,uuid,timestamp with time zone)') IS NULL
    OR to_regprocedure('extensions.digest(text,text)') IS NULL
    OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_OPERATIONS_HISTORY_INVALID'
      USING ERRCODE = 'P0001',
        DETAIL = 'required service-trial operations prerequisites are missing',
        HINT = 'apply all released migrations before retrying this forward migration';
  END IF;

  SELECT
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'platform_service_trial_operations_state',
          'tenant_service_trial_followups',
          'tenant_service_trial_notification_deliveries'
        ))
    + (SELECT count(*) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname LIKE 'platform_service_trial_%notification%')
    + (SELECT count(*) FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname IN (
          'platform_service_trial_create_follow_up',
          'platform_service_trial_cancel_follow_up',
          'platform_service_trial_protect_follow_up'
        ))
    + (SELECT count(*) FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname LIKE 'platform_service_trial_%')
    + (SELECT count(*) FROM pg_constraint
      WHERE conname LIKE 'tenant_service_trial_followups_%'
        OR conname LIKE 'tenant_service_trial_notification_deliveries_%')
  INTO v_partial_count;

  IF v_partial_count <> 0 THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_OPERATIONS_HISTORY_INVALID'
      USING ERRCODE = 'P0001',
        DETAIL = 'partial or replayed service-trial operations schema detected',
        HINT = 'restore the database from a consistent migration snapshot; do not apply manual DML';
  END IF;
END;
$preflight$;

LOCK TABLE public.roles IN SHARE MODE;
LOCK TABLE public.permissions IN SHARE MODE;
LOCK TABLE public.employees IN SHARE MODE;
LOCK TABLE public.employee_roles IN SHARE MODE;
LOCK TABLE public.role_permissions IN SHARE MODE;
LOCK TABLE public.employee_permission_overrides IN SHARE MODE;
LOCK TABLE public.tenants IN SHARE MODE;
LOCK TABLE public.notifications IN SHARE MODE;
LOCK TABLE public.tenant_service_trials IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.tenant_service_trial_events IN ACCESS EXCLUSIVE MODE;

CREATE TABLE public.platform_service_trial_operations_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton IS TRUE),
  cutover_at timestamptz NOT NULL
);

INSERT INTO public.platform_service_trial_operations_state (singleton, cutover_at)
VALUES (true, clock_timestamp());

CREATE TABLE public.tenant_service_trial_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  follow_up_type text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  summary text NOT NULL,
  result text NOT NULL,
  next_follow_up_at timestamptz NULL,
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  create_idempotency_key uuid NOT NULL,
  create_request_hash bytea NOT NULL,
  canceled_at timestamptz NULL,
  canceled_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  cancel_idempotency_key uuid NULL,
  cancel_request_hash bytea NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tenant_service_trial_followups_trial_identity_fkey
    FOREIGN KEY (trial_id, tenant_id)
    REFERENCES public.tenant_service_trials(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_trial_followups_create_idempotency_unique
    UNIQUE (trial_id, create_idempotency_key),
  CONSTRAINT tenant_service_trial_followups_type_check CHECK ((
    follow_up_type IN ('phone', 'wechat', 'online_meeting', 'onsite', 'other')
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_followups_status_check CHECK ((
    status IN ('pending', 'completed', 'canceled')
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_followups_text_check CHECK ((
    char_length(btrim(summary)) BETWEEN 1 AND 500
    AND char_length(btrim(result)) BETWEEN 1 AND 1000
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_followups_next_check CHECK ((
    status <> 'pending' OR next_follow_up_at IS NOT NULL
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_followups_hash_check CHECK ((
    octet_length(create_request_hash) = 32
    AND (cancel_request_hash IS NULL OR octet_length(cancel_request_hash) = 32)
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_followups_cancel_facts_check CHECK ((
    (
      status = 'canceled'
      AND canceled_at IS NOT NULL
      AND canceled_by_employee_id IS NOT NULL
      AND cancel_idempotency_key IS NOT NULL
      AND cancel_request_hash IS NOT NULL
    ) OR (
      status <> 'canceled'
      AND canceled_at IS NULL
      AND canceled_by_employee_id IS NULL
      AND cancel_idempotency_key IS NULL
      AND cancel_request_hash IS NULL
    )
  ) IS TRUE)
);

CREATE TABLE public.tenant_service_trial_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  target_date date NOT NULL,
  recipient_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  completed_lease_token uuid NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  retry_at timestamptz NULL,
  notification_id uuid NULL REFERENCES public.notifications(id) ON DELETE RESTRICT,
  last_error_code text NULL,
  sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT tenant_service_trial_notification_deliveries_trial_identity_fkey
    FOREIGN KEY (trial_id, tenant_id)
    REFERENCES public.tenant_service_trials(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_trial_notification_deliveries_identity_unique
    UNIQUE (trial_id, event_type, target_date, recipient_employee_id),
  CONSTRAINT tenant_service_trial_notification_deliveries_event_check CHECK ((
    event_type IN (
      'application_submitted', 'approved', 'rejected', 'extended', 'revoked',
      'expires_in_7_days', 'expires_in_3_days', 'expires_in_1_day',
      'entered_grace', 'expired', 'converted'
    )
    AND source IN ('event', 'time_boundary')
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_notification_deliveries_status_check CHECK ((
    status IN ('pending', 'processing', 'sent', 'failed')
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_notification_deliveries_lease_check CHECK ((
    (
      status = 'processing'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    ) OR (
      status <> 'processing'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
    )
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_notification_deliveries_sent_check CHECK ((
    (
      status = 'sent'
      AND sent_at IS NOT NULL
      AND completed_lease_token IS NOT NULL
    ) OR (
      status <> 'sent'
      AND sent_at IS NULL
      AND completed_lease_token IS NULL
    )
  ) IS TRUE),
  CONSTRAINT tenant_service_trial_notification_deliveries_retry_check CHECK ((
    attempt_count BETWEEN 0 AND 10
    AND (last_error_code IS NULL OR (
      char_length(last_error_code) <= 64
      AND last_error_code ~ '^[a-z][a-z0-9_]{0,63}$'
    ))
    AND (status = 'failed' OR retry_at IS NULL)
  ) IS TRUE)
);

CREATE UNIQUE INDEX tenant_service_trial_followups_cancel_idempotency_idx
  ON public.tenant_service_trial_followups (trial_id, cancel_idempotency_key)
  WHERE cancel_idempotency_key IS NOT NULL;
CREATE INDEX tenant_service_trial_followups_trial_created_idx
  ON public.tenant_service_trial_followups (trial_id, created_at DESC, id DESC);
CREATE INDEX tenant_service_trial_followups_next_status_idx
  ON public.tenant_service_trial_followups (next_follow_up_at, status);
CREATE INDEX tenant_service_trial_notifications_due_claim_idx
  ON public.tenant_service_trial_notification_deliveries (
    status, retry_at, due_at, id
  );
CREATE INDEX tenant_service_trial_notifications_lease_idx
  ON public.tenant_service_trial_notification_deliveries (lease_expires_at, id)
  WHERE status = 'processing';
CREATE INDEX tenant_service_trial_notifications_trial_event_idx
  ON public.tenant_service_trial_notification_deliveries (
    trial_id, event_type, target_date, id
  );

ALTER TABLE public.tenant_service_trial_events
  DROP CONSTRAINT tenant_service_trial_events_event_type_check;
ALTER TABLE public.tenant_service_trial_events
  ADD CONSTRAINT tenant_service_trial_events_event_type_check CHECK ((
    event_type IN (
      'application_submitted', 'application_withdrawn', 'application_approved',
      'application_rejected', 'trial_granted', 'trial_activated',
      'trial_grace_started', 'trial_expired', 'trial_extended',
      'trial_revoked', 'trial_assigned', 'formal_purchase_attributed',
      'conversion_anomaly', 'trial_follow_up_created',
      'trial_follow_up_canceled'
    )
  ) IS TRUE);

ALTER TABLE public.tenant_service_trial_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_followups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_trial_notification_deliveries FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.platform_service_trial_protect_follow_up()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF current_setting('app.platform_service_trial_follow_up_guard', true)
      IS DISTINCT FROM OLD.id::text
    OR OLD.status <> 'pending'
    OR NEW.status <> 'canceled'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.trial_id IS DISTINCT FROM OLD.trial_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.follow_up_type IS DISTINCT FROM OLD.follow_up_type
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.result IS DISTINCT FROM OLD.result
    OR NEW.next_follow_up_at IS DISTINCT FROM OLD.next_follow_up_at
    OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
    OR NEW.create_idempotency_key IS DISTINCT FROM OLD.create_idempotency_key
    OR NEW.create_request_hash IS DISTINCT FROM OLD.create_request_hash
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_service_trial_protect_follow_up
  BEFORE UPDATE OR DELETE ON public.tenant_service_trial_followups
  FOR EACH ROW EXECUTE FUNCTION public.platform_service_trial_protect_follow_up();

CREATE OR REPLACE FUNCTION public.platform_service_trial_protect_notification_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR current_setting('app.platform_service_trial_notification_guard', true)
      IS DISTINCT FROM 'enabled'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.trial_id IS DISTINCT FROM OLD.trial_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.target_date IS DISTINCT FROM OLD.target_date
    OR NEW.recipient_employee_id IS DISTINCT FROM OLD.recipient_employee_id
    OR NEW.due_at IS DISTINCT FROM OLD.due_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_service_trial_protect_notification_delivery
  BEFORE UPDATE OR DELETE ON public.tenant_service_trial_notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.platform_service_trial_protect_notification_delivery();

CREATE OR REPLACE FUNCTION public.platform_service_trial_create_follow_up(
  p_actor_employee_id uuid,
  p_trial_id uuid,
  p_tenant_id uuid,
  p_follow_up_type text,
  p_status text,
  p_summary text,
  p_result text,
  p_next_follow_up_at timestamp with time zone,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_request_hash bytea;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_follow_up public.tenant_service_trial_followups%ROWTYPE;
  v_event_metadata jsonb;
  v_inserted boolean := false;
BEGIN
  IF p_actor_employee_id IS NULL OR p_trial_id IS NULL OR p_tenant_id IS NULL
    OR p_idempotency_key IS NULL OR p_follow_up_type IS NULL OR p_status IS NULL
    OR p_summary IS NULL OR p_result IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_follow_up_type NOT IN ('phone', 'wechat', 'online_meeting', 'onsite', 'other')
    OR p_status NOT IN ('pending', 'completed')
    OR (p_status = 'pending' AND p_next_follow_up_at IS NULL)
    OR char_length(btrim(p_summary)) NOT BETWEEN 1 AND 500
    OR char_length(btrim(p_result)) NOT BETWEEN 1 AND 1000
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage']::text[]
  );

  v_request_hash := extensions.digest(jsonb_build_object(
    'trial_id', p_trial_id,
    'tenant_id', p_tenant_id,
    'follow_up_type', p_follow_up_type,
    'status', p_status,
    'summary', btrim(p_summary),
    'result', btrim(p_result),
    'next_follow_up_at', p_next_follow_up_at
  )::text, 'sha256');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'platform_service_trial_follow_up:' || p_trial_id::text || ':'
      || p_idempotency_key::text,
    0
  ));

  SELECT follow_up.* INTO v_follow_up
  FROM public.tenant_service_trial_followups AS follow_up
  WHERE follow_up.trial_id = p_trial_id
    AND follow_up.create_idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_follow_up.create_request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'id', v_follow_up.id, 'trial_id', v_follow_up.trial_id,
      'tenant_id', v_follow_up.tenant_id,
      'follow_up_type', v_follow_up.follow_up_type, 'status', v_follow_up.status,
      'summary', v_follow_up.summary, 'result', v_follow_up.result,
      'next_follow_up_at', v_follow_up.next_follow_up_at,
      'created_by_employee_id', v_follow_up.created_by_employee_id,
      'created_at', v_follow_up.created_at, 'idempotent', true
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'platform_service_trial_tenant:' || p_tenant_id::text,
    0
  ));
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, p_tenant_id, v_now
  );

  INSERT INTO public.tenant_service_trial_followups (
    trial_id, tenant_id, follow_up_type, status, summary, result,
    next_follow_up_at, created_by_employee_id, create_idempotency_key,
    create_request_hash, created_at
  ) VALUES (
    p_trial_id, p_tenant_id, p_follow_up_type, p_status, btrim(p_summary),
    btrim(p_result), p_next_follow_up_at, p_actor_employee_id,
    p_idempotency_key, v_request_hash, v_now
  )
  ON CONFLICT (trial_id, create_idempotency_key) DO NOTHING
  RETURNING * INTO v_follow_up;
  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT follow_up.* INTO v_follow_up
    FROM public.tenant_service_trial_followups AS follow_up
    WHERE follow_up.trial_id = p_trial_id
      AND follow_up.create_idempotency_key = p_idempotency_key;
    IF v_follow_up.create_request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_event_metadata := jsonb_build_object(
      'follow_up_id', v_follow_up.id,
      'status', v_follow_up.status,
      'follow_up_type', v_follow_up.follow_up_type
    );
    IF jsonb_typeof(v_event_metadata) IS DISTINCT FROM 'object'
      OR (v_event_metadata - ARRAY['follow_up_id', 'status', 'follow_up_type'] = '{}'::jsonb) IS NOT TRUE
      OR pg_column_size(v_event_metadata) > 8192
    THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_EVENT_METADATA_INVALID' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.tenant_service_trial_events (
      tenant_id, trial_id, event_key, event_type, from_status, to_status,
      actor_employee_id, metadata, occurred_at, created_at
    ) VALUES (
      p_tenant_id, p_trial_id, 'follow-up-created:' || p_idempotency_key::text,
      'trial_follow_up_created', v_trial.status, v_trial.status,
      p_actor_employee_id, v_event_metadata, v_now, v_now
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_follow_up.id, 'trial_id', v_follow_up.trial_id,
    'tenant_id', v_follow_up.tenant_id,
    'follow_up_type', v_follow_up.follow_up_type, 'status', v_follow_up.status,
    'summary', v_follow_up.summary, 'result', v_follow_up.result,
    'next_follow_up_at', v_follow_up.next_follow_up_at,
    'created_by_employee_id', v_follow_up.created_by_employee_id,
    'created_at', v_follow_up.created_at, 'idempotent', NOT v_inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_cancel_follow_up(
  p_actor_employee_id uuid,
  p_follow_up_id uuid,
  p_trial_id uuid,
  p_tenant_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_request_hash bytea;
  v_trial public.tenant_service_trials%ROWTYPE;
  v_follow_up public.tenant_service_trial_followups%ROWTYPE;
  v_event_metadata jsonb;
BEGIN
  IF p_actor_employee_id IS NULL OR p_trial_id IS NULL OR p_tenant_id IS NULL
    OR p_follow_up_id IS NULL OR p_idempotency_key IS NULL
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.platform_service_trial_lock_platform_actor(
    p_actor_employee_id,
    ARRAY['platform.service_trial.manage']::text[]
  );
  v_request_hash := extensions.digest(jsonb_build_object(
    'follow_up_id', p_follow_up_id,
    'trial_id', p_trial_id,
    'tenant_id', p_tenant_id,
    'status', 'canceled'
  )::text, 'sha256');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'platform_service_trial_follow_up_cancel:' || p_trial_id::text || ':'
      || p_idempotency_key::text,
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM public.tenant_service_trial_followups AS prior_cancel
    WHERE prior_cancel.trial_id = p_trial_id
      AND prior_cancel.cancel_idempotency_key = p_idempotency_key
      AND prior_cancel.id <> p_follow_up_id
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'platform_service_trial_tenant:' || p_tenant_id::text,
    0
  ));
  v_trial := public.platform_service_trial_normalize_effective_status(
    p_trial_id, p_tenant_id, v_now
  );

  SELECT follow_up.* INTO v_follow_up
  FROM public.tenant_service_trial_followups AS follow_up
  WHERE follow_up.id = p_follow_up_id
    AND follow_up.trial_id = p_trial_id
    AND follow_up.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_follow_up.status = 'canceled' THEN
    IF v_follow_up.cancel_idempotency_key IS NOT DISTINCT FROM p_idempotency_key
      AND v_follow_up.cancel_request_hash IS NOT DISTINCT FROM v_request_hash
    THEN
      RETURN jsonb_build_object(
        'id', v_follow_up.id, 'trial_id', v_follow_up.trial_id,
        'tenant_id', v_follow_up.tenant_id,
        'follow_up_type', v_follow_up.follow_up_type, 'status', v_follow_up.status,
        'summary', v_follow_up.summary, 'result', v_follow_up.result,
        'next_follow_up_at', v_follow_up.next_follow_up_at,
        'created_by_employee_id', v_follow_up.created_by_employee_id,
        'created_at', v_follow_up.created_at, 'idempotent', true
      );
    END IF;
    IF v_follow_up.cancel_request_hash IS DISTINCT FROM v_request_hash THEN
      RAISE EXCEPTION 'SERVICE_TRIAL_IDEMPOTENCY_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF v_follow_up.status <> 'pending' THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_FOLLOW_UP_STATUS_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.platform_service_trial_follow_up_guard', v_follow_up.id::text, true);
  UPDATE public.tenant_service_trial_followups
  SET status = 'canceled', canceled_at = v_now,
    canceled_by_employee_id = p_actor_employee_id,
    cancel_idempotency_key = p_idempotency_key,
    cancel_request_hash = v_request_hash
  WHERE id = v_follow_up.id
  RETURNING * INTO v_follow_up;
  PERFORM set_config('app.platform_service_trial_follow_up_guard', '', true);

  v_event_metadata := jsonb_build_object(
    'follow_up_id', v_follow_up.id,
    'status', v_follow_up.status,
    'follow_up_type', v_follow_up.follow_up_type
  );
  IF jsonb_typeof(v_event_metadata) IS DISTINCT FROM 'object'
    OR (v_event_metadata - ARRAY['follow_up_id', 'status', 'follow_up_type'] = '{}'::jsonb) IS NOT TRUE
    OR pg_column_size(v_event_metadata) > 8192
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_EVENT_METADATA_INVALID' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.tenant_service_trial_events (
    tenant_id, trial_id, event_key, event_type, from_status, to_status,
    actor_employee_id, metadata, occurred_at, created_at
  ) VALUES (
    p_tenant_id, p_trial_id, 'follow-up-canceled:' || p_idempotency_key::text,
    'trial_follow_up_canceled', v_trial.status, v_trial.status,
    p_actor_employee_id, v_event_metadata, v_now, v_now
  );

  RETURN jsonb_build_object(
    'id', v_follow_up.id, 'trial_id', v_follow_up.trial_id,
    'tenant_id', v_follow_up.tenant_id,
    'follow_up_type', v_follow_up.follow_up_type, 'status', v_follow_up.status,
    'summary', v_follow_up.summary, 'result', v_follow_up.result,
    'next_follow_up_at', v_follow_up.next_follow_up_at,
    'created_by_employee_id', v_follow_up.created_by_employee_id,
    'created_at', v_follow_up.created_at, 'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.platform_service_trial_follow_up_guard', '', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_enqueue_event_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery_event_type text;
BEGIN
  v_delivery_event_type := CASE NEW.event_type
    WHEN 'application_submitted' THEN 'application_submitted'
    WHEN 'application_approved' THEN 'approved'
    WHEN 'application_rejected' THEN 'rejected'
    WHEN 'trial_extended' THEN 'extended'
    WHEN 'trial_revoked' THEN 'revoked'
    WHEN 'formal_purchase_attributed' THEN 'converted'
    ELSE NULL
  END;
  IF v_delivery_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'application_submitted' THEN
    INSERT INTO public.tenant_service_trial_notification_deliveries (
      trial_id, tenant_id, event_type, source, target_date,
      recipient_employee_id, due_at, created_at, updated_at
    )
    SELECT DISTINCT NEW.trial_id, NEW.tenant_id, v_delivery_event_type, 'event',
      NEW.occurred_at::date, employee.id, NEW.occurred_at,
      NEW.occurred_at, NEW.occurred_at
    FROM public.employees AS employee
    CROSS JOIN public.permissions AS permission
    WHERE employee.tenant_id IS NULL
      AND employee.status = 'active'
      AND permission.status = 'active'
      AND permission.code = 'platform.service_trial.review'
      AND NOT EXISTS (
        SELECT 1
        FROM public.employee_permission_overrides AS override_record
        WHERE override_record.employee_id = employee.id
          AND override_record.permission_id = permission.id
          AND override_record.effect = 'deny'
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.employee_roles AS employee_role
          JOIN public.roles AS role ON role.id = employee_role.role_id
          JOIN public.role_permissions AS role_permission
            ON role_permission.role_id = role.id
          WHERE employee_role.employee_id = employee.id
            AND role.tenant_id IS NULL
            AND role.status = 'active'
            AND role_permission.permission_id = permission.id
            AND role_permission.access_scope = 'all'
        ) OR EXISTS (
          SELECT 1
          FROM public.employee_permission_overrides AS override_record
          WHERE override_record.employee_id = employee.id
            AND override_record.permission_id = permission.id
            AND override_record.effect = 'allow'
            AND override_record.access_scope = 'all'
        )
      )
    ON CONFLICT (trial_id, event_type, target_date, recipient_employee_id)
      DO NOTHING;
  ELSE
    INSERT INTO public.tenant_service_trial_notification_deliveries (
      trial_id, tenant_id, event_type, source, target_date,
      recipient_employee_id, due_at, created_at, updated_at
    )
    SELECT DISTINCT NEW.trial_id, NEW.tenant_id, v_delivery_event_type, 'event',
      NEW.occurred_at::date, recipient.employee_id, NEW.occurred_at,
      NEW.occurred_at, NEW.occurred_at
    FROM public.tenant_service_trials AS trial
    CROSS JOIN LATERAL (
      SELECT applicant.id AS employee_id
      FROM public.employees AS applicant
      WHERE applicant.id = trial.requested_by_employee_id
        AND applicant.tenant_id = trial.tenant_id
        AND applicant.status = 'active'
      UNION
      SELECT tenant_admin.id
      FROM public.employees AS tenant_admin
      JOIN public.employee_roles AS employee_role
        ON employee_role.employee_id = tenant_admin.id
      JOIN public.roles AS role ON role.id = employee_role.role_id
      WHERE tenant_admin.tenant_id = trial.tenant_id
        AND tenant_admin.status = 'active'
        AND role.tenant_id = trial.tenant_id
        AND role.status = 'active'
        AND role.code = 'system_admin'
      UNION
      SELECT assignee.id
      FROM public.employees AS assignee
      WHERE assignee.id = trial.assignee_employee_id
        AND assignee.tenant_id IS NULL
        AND assignee.status = 'active'
    ) AS recipient
    WHERE trial.id = NEW.trial_id
      AND trial.tenant_id = NEW.tenant_id
    ON CONFLICT (trial_id, event_type, target_date, recipient_employee_id)
      DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_service_trial_enqueue_event_notification
  AFTER INSERT ON public.tenant_service_trial_events
  FOR EACH ROW EXECUTE FUNCTION public.platform_service_trial_enqueue_event_notification();

CREATE OR REPLACE FUNCTION public.platform_service_trial_enqueue_due_notifications(
  p_now timestamp with time zone
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_inserted integer;
BEGIN
  WITH boundaries AS MATERIALIZED (
    SELECT trial.id AS trial_id, trial.tenant_id, trial.created_at,
      CASE reminder.day_text
        WHEN '7' THEN 'expires_in_7_days'
        WHEN '3' THEN 'expires_in_3_days'
        WHEN '1' THEN 'expires_in_1_day'
      END AS event_type,
      trial.trial_ends_at - reminder.day_text::integer * interval '1 day' AS due_at
    FROM public.tenant_service_trials AS trial
    CROSS JOIN LATERAL jsonb_array_elements_text(
      trial.policy_snapshot->'reminder_days'
    ) AS reminder(day_text)
    WHERE reminder.day_text IN ('7', '3', '1')
      AND trial.status NOT IN ('converted', 'revoked', 'rejected', 'withdrawn')
    UNION ALL
    SELECT trial.id, trial.tenant_id, trial.created_at,
      'entered_grace', trial.trial_ends_at
    FROM public.tenant_service_trials AS trial
    WHERE trial.status NOT IN ('converted', 'revoked', 'rejected', 'withdrawn')
    UNION ALL
    SELECT trial.id, trial.tenant_id, trial.created_at,
      'expired', trial.grace_ends_at
    FROM public.tenant_service_trials AS trial
    WHERE trial.status NOT IN ('converted', 'revoked', 'rejected', 'withdrawn')
  ), eligible AS MATERIALIZED (
    SELECT boundary.*
    FROM boundaries AS boundary
    CROSS JOIN public.platform_service_trial_operations_state AS state
    WHERE boundary.due_at <= v_now
      AND (
        boundary.due_at > state.cutover_at
        OR (
          boundary.created_at >= state.cutover_at
          AND boundary.due_at >= boundary.created_at
        )
      )
  ), inserted AS (
    INSERT INTO public.tenant_service_trial_notification_deliveries (
      trial_id, tenant_id, event_type, source, target_date,
      recipient_employee_id, due_at, created_at, updated_at
    )
    SELECT DISTINCT boundary.trial_id, boundary.tenant_id,
      boundary.event_type, 'time_boundary', boundary.due_at::date,
      recipient.employee_id, boundary.due_at, v_now, v_now
    FROM eligible AS boundary
    JOIN public.tenant_service_trials AS trial
      ON trial.id = boundary.trial_id AND trial.tenant_id = boundary.tenant_id
    CROSS JOIN LATERAL (
      SELECT applicant.id AS employee_id
      FROM public.employees AS applicant
      WHERE applicant.id = trial.requested_by_employee_id
        AND applicant.tenant_id = trial.tenant_id
        AND applicant.status = 'active'
      UNION
      SELECT tenant_admin.id
      FROM public.employees AS tenant_admin
      JOIN public.employee_roles AS employee_role
        ON employee_role.employee_id = tenant_admin.id
      JOIN public.roles AS role ON role.id = employee_role.role_id
      WHERE tenant_admin.tenant_id = trial.tenant_id
        AND tenant_admin.status = 'active'
        AND role.tenant_id = trial.tenant_id
        AND role.status = 'active'
        AND role.code = 'system_admin'
      UNION
      SELECT assignee.id
      FROM public.employees AS assignee
      WHERE assignee.id = trial.assignee_employee_id
        AND assignee.tenant_id IS NULL
        AND assignee.status = 'active'
    ) AS recipient
    ON CONFLICT (trial_id, event_type, target_date, recipient_employee_id)
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_inserted FROM inserted;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_claim_notification_deliveries(
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  delivery_id uuid,
  lease_token uuid,
  trial_id uuid,
  tenant_id uuid,
  recipient_employee_id uuid,
  event_type text,
  source text,
  trial_status text,
  starts_at timestamptz,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_limit IS NULL OR NOT (p_limit BETWEEN 1 AND 100) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_LIMIT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.platform_service_trial_enqueue_due_notifications(v_now);
  PERFORM set_config('app.platform_service_trial_notification_guard', 'enabled', true);

  RETURN QUERY
  WITH selected AS MATERIALIZED (
    SELECT delivery.id,
      encode(extensions.gen_random_bytes(16), 'hex')::uuid AS next_lease_token
    FROM public.tenant_service_trial_notification_deliveries AS delivery
    WHERE delivery.due_at <= v_now
      AND (
        (
          delivery.status IN ('pending', 'failed')
          AND coalesce(delivery.retry_at, delivery.due_at) <= v_now
        ) OR (
          delivery.status = 'processing'
          AND delivery.lease_expires_at <= v_now
        )
      )
      AND delivery.attempt_count < 10
    ORDER BY coalesce(delivery.retry_at, delivery.due_at), delivery.id
    LIMIT least(p_limit, 100)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.tenant_service_trial_notification_deliveries AS delivery
    SET status = 'processing', lease_token = selected.next_lease_token,
      lease_expires_at = v_now + interval '2 minutes', updated_at = v_now
    FROM selected
    WHERE delivery.id = selected.id
    RETURNING delivery.*
  )
  SELECT claimed.id, claimed.lease_token, claimed.trial_id, claimed.tenant_id,
    claimed.recipient_employee_id, claimed.event_type, claimed.source,
    trial.status, trial.starts_at, trial.trial_ends_at, trial.grace_ends_at
  FROM claimed
  JOIN public.tenant_service_trials AS trial
    ON trial.id = claimed.trial_id AND trial.tenant_id = claimed.tenant_id
  ORDER BY coalesce(claimed.retry_at, claimed.due_at), claimed.id;

  PERFORM set_config('app.platform_service_trial_notification_guard', '', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.platform_service_trial_notification_guard', '', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_complete_notification_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_delivery public.tenant_service_trial_notification_deliveries%ROWTYPE;
BEGIN
  IF p_delivery_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_LEASE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT delivery.* INTO v_delivery
  FROM public.tenant_service_trial_notification_deliveries AS delivery
  WHERE delivery.id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_LEASE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF v_delivery.status = 'sent'
    AND v_delivery.completed_lease_token IS NOT DISTINCT FROM p_lease_token
    AND v_delivery.notification_id IS NOT DISTINCT FROM p_notification_id
  THEN
    RETURN jsonb_build_object(
      'delivery_id', v_delivery.id, 'status', v_delivery.status,
      'notification_id', v_delivery.notification_id,
      'sent_at', v_delivery.sent_at, 'idempotent', true
    );
  END IF;
  IF v_delivery.status <> 'processing'
    OR v_delivery.lease_token IS DISTINCT FROM p_lease_token
    OR v_delivery.lease_expires_at IS NULL
    OR v_delivery.lease_expires_at <= v_now
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_LEASE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_notification_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.notifications AS notification
    WHERE notification.id = p_notification_id
      AND notification.recipient_employee_id = v_delivery.recipient_employee_id
      AND notification.tenant_id IS NOT DISTINCT FROM v_delivery.tenant_id
  ) THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_FACT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.platform_service_trial_notification_guard', 'enabled', true);
  UPDATE public.tenant_service_trial_notification_deliveries
  SET status = 'sent', notification_id = p_notification_id,
    sent_at = v_now, completed_lease_token = p_lease_token,
    lease_token = NULL, lease_expires_at = NULL,
    retry_at = NULL, last_error_code = NULL, updated_at = v_now
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;
  PERFORM set_config('app.platform_service_trial_notification_guard', '', true);

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id, 'status', v_delivery.status,
    'notification_id', v_delivery.notification_id,
    'sent_at', v_delivery.sent_at, 'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.platform_service_trial_notification_guard', '', true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_fail_notification_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_error_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_delivery public.tenant_service_trial_notification_deliveries%ROWTYPE;
  v_next_attempt_count integer;
  v_retry_at timestamptz;
BEGIN
  IF p_delivery_id IS NULL OR p_lease_token IS NULL OR p_error_code IS NULL
    OR p_error_code !~ '^[a-z][a-z0-9_]{0,63}$'
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_FAILURE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT delivery.* INTO v_delivery
  FROM public.tenant_service_trial_notification_deliveries AS delivery
  WHERE delivery.id = p_delivery_id
  FOR UPDATE;
  IF NOT FOUND OR v_delivery.status <> 'processing'
    OR v_delivery.lease_token IS DISTINCT FROM p_lease_token
    OR v_delivery.lease_expires_at IS NULL
    OR v_delivery.lease_expires_at <= v_now
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_NOTIFICATION_LEASE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  v_next_attempt_count := least(v_delivery.attempt_count + 1, 10);
  v_retry_at := v_now + least(
    interval '1 hour',
    interval '1 minute' * power(2, least(v_next_attempt_count - 1, 6))
  );
  PERFORM set_config('app.platform_service_trial_notification_guard', 'enabled', true);
  UPDATE public.tenant_service_trial_notification_deliveries
  SET status = 'failed', attempt_count = v_next_attempt_count,
    retry_at = v_retry_at, last_error_code = p_error_code,
    lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;
  PERFORM set_config('app.platform_service_trial_notification_guard', '', true);

  RETURN jsonb_build_object(
    'delivery_id', v_delivery.id, 'status', v_delivery.status,
    'attempt_count', v_delivery.attempt_count,
    'retry_at', v_delivery.retry_at, 'idempotent', false
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.platform_service_trial_notification_guard', '', true);
  RAISE;
END;
$$;

REVOKE ALL ON TABLE public.platform_service_trial_operations_state FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_service_trial_operations_state FROM anon;
REVOKE ALL ON TABLE public.platform_service_trial_operations_state FROM authenticated;
REVOKE ALL ON TABLE public.platform_service_trial_operations_state FROM service_role;
REVOKE ALL ON TABLE public.tenant_service_trial_followups FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_trial_followups FROM anon;
REVOKE ALL ON TABLE public.tenant_service_trial_followups FROM authenticated;
REVOKE ALL ON TABLE public.tenant_service_trial_followups FROM service_role;
REVOKE ALL ON TABLE public.tenant_service_trial_notification_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_trial_notification_deliveries FROM anon;
REVOKE ALL ON TABLE public.tenant_service_trial_notification_deliveries FROM authenticated;
REVOKE ALL ON TABLE public.tenant_service_trial_notification_deliveries FROM service_role;
GRANT SELECT ON TABLE public.tenant_service_trial_followups TO service_role;
GRANT SELECT ON TABLE public.tenant_service_trial_notification_deliveries TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_protect_follow_up() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_follow_up() FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_follow_up() FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_follow_up() FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_notification_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_notification_delivery() FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_notification_delivery() FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_protect_notification_delivery() FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_event_notification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_event_notification() FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_event_notification() FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_event_notification() FROM service_role;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_due_notifications(timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_due_notifications(timestamp with time zone) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_due_notifications(timestamp with time zone) FROM authenticated;
REVOKE ALL ON FUNCTION public.platform_service_trial_enqueue_due_notifications(timestamp with time zone) FROM service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_create_follow_up(uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_create_follow_up(uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_create_follow_up(uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_create_follow_up(uuid, uuid, uuid, text, text, text, text, timestamp with time zone, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_cancel_follow_up(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_cancel_follow_up(uuid, uuid, uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_cancel_follow_up(uuid, uuid, uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_cancel_follow_up(uuid, uuid, uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_claim_notification_deliveries(integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_claim_notification_deliveries(integer)
  FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_claim_notification_deliveries(integer)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_claim_notification_deliveries(integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_complete_notification_delivery(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_complete_notification_delivery(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_complete_notification_delivery(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_complete_notification_delivery(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_trial_fail_notification_delivery(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_fail_notification_delivery(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_fail_notification_delivery(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_fail_notification_delivery(uuid, uuid, text) TO service_role;

COMMIT;
