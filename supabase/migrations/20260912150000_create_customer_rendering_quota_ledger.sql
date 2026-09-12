-- Rollback: remove the API routes first and preserve all quota facts. Correct
-- functions, constraints, or indexes with a forward migration; do not drop data.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.customer_rendering_quota_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  phone_key_version smallint,
  phone_digest text,
  merged_into_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_quota_accounts_tenant_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT customer_rendering_quota_accounts_status_check
    CHECK (status IN ('active', 'merged')),
  CONSTRAINT customer_rendering_quota_accounts_phone_pair_check CHECK (
    (phone_key_version IS NULL AND phone_digest IS NULL)
    OR (
      phone_key_version > 0
      AND phone_digest ~ '^[0-9a-f]{64}$'
    )
  ),
  CONSTRAINT customer_rendering_quota_accounts_merge_state_check CHECK (
    (status = 'active' AND merged_into_account_id IS NULL)
    OR (
      status = 'merged'
      AND merged_into_account_id IS NOT NULL
      AND merged_into_account_id <> id
    )
  ),
  CONSTRAINT customer_rendering_quota_accounts_merged_account_fkey
    FOREIGN KEY (tenant_id, merged_into_account_id)
    REFERENCES public.customer_rendering_quota_accounts (tenant_id, id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX customer_rendering_quota_accounts_phone_key
  ON public.customer_rendering_quota_accounts (
    tenant_id,
    phone_key_version,
    phone_digest
  )
  WHERE status = 'active' AND phone_digest IS NOT NULL;

CREATE INDEX customer_rendering_quota_accounts_merge_idx
  ON public.customer_rendering_quota_accounts (tenant_id, merged_into_account_id, id)
  WHERE status = 'merged';

CREATE TABLE public.customer_rendering_identity_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  channel text NOT NULL,
  application_id text,
  installation_id uuid,
  subject_key_version smallint NOT NULL,
  subject_digest text NOT NULL,
  quota_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_identity_bindings_tenant_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT customer_rendering_identity_bindings_channel_check
    CHECK (channel IN ('wechat', 'douyin')),
  CONSTRAINT customer_rendering_identity_bindings_subject_check CHECK (
    subject_key_version > 0
    AND subject_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT customer_rendering_identity_bindings_scope_check CHECK (
    (
      channel = 'wechat'
      AND application_id IS NULL
      AND installation_id IS NULL
    )
    OR (
      channel = 'douyin'
      AND application_id = btrim(application_id)
      AND char_length(application_id) BETWEEN 1 AND 128
      AND installation_id IS NOT NULL
    )
  ),
  CONSTRAINT customer_rendering_identity_bindings_account_fkey
    FOREIGN KEY (tenant_id, quota_account_id)
    REFERENCES public.customer_rendering_quota_accounts (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_identity_bindings_subject_key
    UNIQUE (tenant_id, channel, subject_key_version, subject_digest)
);

CREATE INDEX customer_rendering_identity_bindings_account_idx
  ON public.customer_rendering_identity_bindings (tenant_id, quota_account_id, id);

CREATE TABLE public.customer_rendering_identity_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  channel text NOT NULL,
  subject_key_version smallint NOT NULL,
  subject_digest text NOT NULL,
  operation text NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  result_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_identity_commands_channel_check
    CHECK (channel IN ('wechat', 'douyin')),
  CONSTRAINT customer_rendering_identity_commands_subject_check CHECK (
    subject_key_version > 0
    AND subject_digest ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT customer_rendering_identity_commands_operation_check
    CHECK (operation IN ('phone_bind')),
  CONSTRAINT customer_rendering_identity_commands_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT customer_rendering_identity_commands_account_fkey
    FOREIGN KEY (tenant_id, result_account_id)
    REFERENCES public.customer_rendering_quota_accounts (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_identity_commands_idempotency_key
    UNIQUE (
      tenant_id,
      channel,
      subject_key_version,
      subject_digest,
      operation,
      idempotency_key
    )
);

CREATE TABLE public.customer_rendering_quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  quota_account_id uuid NOT NULL,
  identity_binding_id uuid NOT NULL,
  operation text NOT NULL DEFAULT 'generate',
  job_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_quota_reservations_tenant_id_key
    UNIQUE (tenant_id, id),
  CONSTRAINT customer_rendering_quota_reservations_account_fkey
    FOREIGN KEY (tenant_id, quota_account_id)
    REFERENCES public.customer_rendering_quota_accounts (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_quota_reservations_binding_fkey
    FOREIGN KEY (tenant_id, identity_binding_id)
    REFERENCES public.customer_rendering_identity_bindings (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_quota_reservations_operation_check
    CHECK (operation IN ('generate')),
  CONSTRAINT customer_rendering_quota_reservations_request_hash_check
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT customer_rendering_quota_reservations_status_check
    CHECK (status IN ('reserved', 'consumed', 'released')),
  CONSTRAINT customer_rendering_quota_reservations_state_time_check CHECK (
    (
      status = 'reserved'
      AND consumed_at IS NULL
      AND released_at IS NULL
    )
    OR (
      status = 'consumed'
      AND consumed_at IS NOT NULL
      AND released_at IS NULL
    )
    OR (
      status = 'released'
      AND consumed_at IS NULL
      AND released_at IS NOT NULL
    )
  ),
  CONSTRAINT customer_rendering_quota_reservations_job_key
    UNIQUE (tenant_id, job_id),
  CONSTRAINT customer_rendering_quota_reservations_idempotency_key
    UNIQUE (tenant_id, identity_binding_id, operation, idempotency_key)
);

CREATE INDEX customer_rendering_quota_reservations_account_status_idx
  ON public.customer_rendering_quota_reservations (
    tenant_id,
    quota_account_id,
    status,
    reserved_at,
    id
  );

CREATE TABLE public.customer_rendering_quota_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  quota_account_id uuid NOT NULL,
  source_account_id uuid,
  reservation_id uuid,
  event_type text NOT NULL,
  units smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_quota_events_account_fkey
    FOREIGN KEY (tenant_id, quota_account_id)
    REFERENCES public.customer_rendering_quota_accounts (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_quota_events_source_account_fkey
    FOREIGN KEY (tenant_id, source_account_id)
    REFERENCES public.customer_rendering_quota_accounts (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_quota_events_reservation_fkey
    FOREIGN KEY (tenant_id, reservation_id)
    REFERENCES public.customer_rendering_quota_reservations (tenant_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT customer_rendering_quota_events_type_check
    CHECK (event_type IN ('reserve', 'consume', 'release', 'merge')),
  CONSTRAINT customer_rendering_quota_events_shape_check CHECK (
    (
      event_type IN ('reserve', 'consume', 'release')
      AND reservation_id IS NOT NULL
      AND source_account_id IS NULL
      AND units = 1
    )
    OR (
      event_type = 'merge'
      AND reservation_id IS NULL
      AND source_account_id IS NOT NULL
      AND source_account_id <> quota_account_id
      AND units = 0
    )
  ),
  CONSTRAINT customer_rendering_quota_events_transition_key
    UNIQUE (tenant_id, reservation_id, event_type)
);

CREATE INDEX customer_rendering_quota_events_account_created_idx
  ON public.customer_rendering_quota_events (
    tenant_id,
    quota_account_id,
    created_at,
    id
  );

CREATE TRIGGER tr_customer_rendering_quota_accounts_updated_at
  BEFORE UPDATE ON public.customer_rendering_quota_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_customer_rendering_identity_bindings_updated_at
  BEFORE UPDATE ON public.customer_rendering_identity_bindings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_customer_rendering_quota_reservations_updated_at
  BEFORE UPDATE ON public.customer_rendering_quota_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.customer_rendering_quota_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_rendering_identity_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_rendering_identity_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_rendering_quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_rendering_quota_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_rendering_quota_accounts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.customer_rendering_identity_bindings FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.customer_rendering_identity_commands FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.customer_rendering_quota_reservations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.customer_rendering_quota_events FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_rendering_quota_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_rendering_identity_bindings TO service_role;
GRANT SELECT, INSERT ON TABLE public.customer_rendering_identity_commands TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_rendering_quota_reservations TO service_role;
GRANT SELECT, INSERT ON TABLE public.customer_rendering_quota_events TO service_role;

CREATE FUNCTION public.customer_rendering_quota_snapshot(
  p_tenant_id uuid,
  p_account_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_account public.customer_rendering_quota_accounts%ROWTYPE;
  v_consumed integer := 0;
  v_reserved integer := 0;
  v_active_job_id uuid;
BEGIN
  IF p_account_id IS NULL THEN
    RETURN jsonb_build_object(
      'decision', 'ok',
      'account_id', NULL,
      'phone_verified', false,
      'consumed', 0,
      'reserved', 0,
      'active_job_id', NULL,
      'reservation_status', NULL
    );
  END IF;

  SELECT account.*
  INTO v_account
  FROM public.customer_rendering_quota_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer rendering quota account not found';
  END IF;

  IF v_account.status = 'merged' THEN
    SELECT account.*
    INTO v_account
    FROM public.customer_rendering_quota_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.id = v_account.merged_into_account_id
      AND account.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'customer rendering canonical quota account not found';
    END IF;
  END IF;

  SELECT
    count(*) FILTER (WHERE reservation.status = 'consumed')::integer,
    count(*) FILTER (WHERE reservation.status = 'reserved')::integer,
    (
      array_agg(reservation.job_id ORDER BY reservation.reserved_at, reservation.id)
        FILTER (WHERE reservation.status = 'reserved')
    )[1]
  INTO v_consumed, v_reserved, v_active_job_id
  FROM public.customer_rendering_quota_reservations AS reservation
  JOIN public.customer_rendering_quota_accounts AS family
    ON family.tenant_id = reservation.tenant_id
   AND family.id = reservation.quota_account_id
  WHERE reservation.tenant_id = p_tenant_id
    AND (
      family.id = v_account.id
      OR family.merged_into_account_id = v_account.id
    );

  RETURN jsonb_build_object(
    'decision', 'ok',
    'account_id', v_account.id,
    'phone_verified', v_account.phone_digest IS NOT NULL,
    'consumed', coalesce(v_consumed, 0),
    'reserved', coalesce(v_reserved, 0),
    'active_job_id', v_active_job_id,
    'reservation_status', NULL
  );
END;
$$;

CREATE FUNCTION public.ensure_customer_rendering_quota_identity(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_application_id text,
  p_installation_id uuid,
  p_phone_key_version smallint,
  p_phone_digest text
) RETURNS TABLE (account_id uuid, binding_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_subject_account_id uuid;
  v_phone_account_id uuid;
  v_target_account_id uuid;
  v_source_account_id uuid;
  v_binding_id uuid;
  v_lock_key text;
BEGIN
  IF p_tenant_id IS NULL
    OR p_channel NOT IN ('wechat', 'douyin')
    OR p_subject_key_version IS NULL
    OR p_subject_key_version <= 0
    OR p_subject_digest !~ '^[0-9a-f]{64}$'
    OR (p_phone_key_version IS NULL) <> (p_phone_digest IS NULL)
    OR (
      p_phone_digest IS NOT NULL
      AND (
        p_phone_key_version <= 0
        OR p_phone_digest !~ '^[0-9a-f]{64}$'
      )
    )
    OR (
      p_channel = 'wechat'
      AND (p_application_id IS NOT NULL OR p_installation_id IS NOT NULL)
    )
    OR (
      p_channel = 'douyin'
      AND (
        p_application_id IS NULL
        OR btrim(p_application_id) = ''
        OR p_installation_id IS NULL
      )
    )
  THEN
    RAISE EXCEPTION 'invalid customer rendering identity';
  END IF;

  FOR v_lock_key IN
    SELECT lock_key
    FROM (
      VALUES
        (p_tenant_id::text || ':subject:' || p_channel || ':' || p_subject_digest),
        (CASE WHEN p_phone_digest IS NULL THEN NULL
          ELSE p_tenant_id::text || ':phone:' || p_phone_digest END)
    ) AS locks(lock_key)
    WHERE lock_key IS NOT NULL
    ORDER BY lock_key
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
  END LOOP;

  SELECT binding.id, binding.quota_account_id
  INTO v_binding_id, v_subject_account_id
  FROM public.customer_rendering_identity_bindings AS binding
  WHERE binding.tenant_id = p_tenant_id
    AND binding.channel = p_channel
    AND binding.subject_key_version = p_subject_key_version
    AND binding.subject_digest = p_subject_digest
  FOR UPDATE;

  IF v_subject_account_id IS NOT NULL THEN
    SELECT CASE
      WHEN account.status = 'active' THEN account.id
      ELSE account.merged_into_account_id
    END
    INTO v_subject_account_id
    FROM public.customer_rendering_quota_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.id = v_subject_account_id;
  END IF;

  IF p_phone_digest IS NOT NULL THEN
    SELECT account.id
    INTO v_phone_account_id
    FROM public.customer_rendering_quota_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.phone_key_version = p_phone_key_version
      AND account.phone_digest = p_phone_digest
      AND account.status = 'active'
    FOR UPDATE;
  END IF;

  IF v_subject_account_id IS NULL AND v_phone_account_id IS NULL THEN
    INSERT INTO public.customer_rendering_quota_accounts (
      tenant_id,
      phone_key_version,
      phone_digest
    ) VALUES (
      p_tenant_id,
      p_phone_key_version,
      p_phone_digest
    )
    RETURNING id INTO v_target_account_id;
  ELSIF v_subject_account_id IS NULL THEN
    v_target_account_id := v_phone_account_id;
  ELSIF v_phone_account_id IS NULL THEN
    v_target_account_id := v_subject_account_id;
    IF p_phone_digest IS NOT NULL THEN
      UPDATE public.customer_rendering_quota_accounts AS account
      SET phone_key_version = p_phone_key_version,
          phone_digest = p_phone_digest
      WHERE account.tenant_id = p_tenant_id
        AND account.id = v_target_account_id
        AND account.status = 'active';
    END IF;
  ELSIF v_subject_account_id = v_phone_account_id THEN
    v_target_account_id := v_subject_account_id;
  ELSE
    v_target_account_id := v_phone_account_id;
    v_source_account_id := v_subject_account_id;

    PERFORM account.id
    FROM public.customer_rendering_quota_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.id IN (v_target_account_id, v_source_account_id)
    ORDER BY account.id::text
    FOR UPDATE;

    UPDATE public.customer_rendering_identity_bindings AS binding
    SET quota_account_id = v_target_account_id
    WHERE binding.tenant_id = p_tenant_id
      AND binding.quota_account_id IN (
        SELECT account.id
        FROM public.customer_rendering_quota_accounts AS account
        WHERE account.tenant_id = p_tenant_id
          AND (
            account.id = v_source_account_id
            OR account.merged_into_account_id = v_source_account_id
          )
      );

    UPDATE public.customer_rendering_quota_accounts AS account
    SET status = 'merged',
        merged_into_account_id = v_target_account_id
    WHERE account.tenant_id = p_tenant_id
      AND (
        account.id = v_source_account_id
        OR account.merged_into_account_id = v_source_account_id
      );

    INSERT INTO public.customer_rendering_quota_events (
      tenant_id,
      quota_account_id,
      source_account_id,
      event_type,
      units
    ) VALUES (
      p_tenant_id,
      v_target_account_id,
      v_source_account_id,
      'merge',
      0
    );
  END IF;

  IF v_binding_id IS NULL THEN
    INSERT INTO public.customer_rendering_identity_bindings (
      tenant_id,
      channel,
      application_id,
      installation_id,
      subject_key_version,
      subject_digest,
      quota_account_id
    ) VALUES (
      p_tenant_id,
      p_channel,
      p_application_id,
      p_installation_id,
      p_subject_key_version,
      p_subject_digest,
      v_target_account_id
    )
    RETURNING id INTO v_binding_id;
  ELSE
    UPDATE public.customer_rendering_identity_bindings AS binding
    SET quota_account_id = v_target_account_id,
        application_id = p_application_id,
        installation_id = p_installation_id
    WHERE binding.tenant_id = p_tenant_id
      AND binding.id = v_binding_id;
  END IF;

  RETURN QUERY SELECT v_target_account_id, v_binding_id;
END;
$$;

CREATE FUNCTION public.get_customer_rendering_quota(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_phone_key_version smallint DEFAULT NULL,
  p_phone_digest text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_tenant_id IS NULL
    OR p_channel NOT IN ('wechat', 'douyin')
    OR p_subject_key_version IS NULL
    OR p_subject_key_version <= 0
    OR p_subject_digest !~ '^[0-9a-f]{64}$'
    OR (p_phone_key_version IS NULL) <> (p_phone_digest IS NULL)
    OR (
      p_phone_digest IS NOT NULL
      AND (
        p_phone_key_version <= 0
        OR p_phone_digest !~ '^[0-9a-f]{64}$'
      )
    )
  THEN
    RAISE EXCEPTION 'invalid customer rendering quota identity';
  END IF;

  SELECT CASE
    WHEN account.status = 'active' THEN account.id
    ELSE account.merged_into_account_id
  END
  INTO v_account_id
  FROM public.customer_rendering_identity_bindings AS binding
  JOIN public.customer_rendering_quota_accounts AS account
    ON account.tenant_id = binding.tenant_id
   AND account.id = binding.quota_account_id
  WHERE binding.tenant_id = p_tenant_id
    AND binding.channel = p_channel
    AND binding.subject_key_version = p_subject_key_version
    AND binding.subject_digest = p_subject_digest;

  IF p_phone_digest IS NOT NULL THEN
    SELECT coalesce(v_account_id, account.id)
    INTO v_account_id
    FROM public.customer_rendering_quota_accounts AS account
    WHERE account.tenant_id = p_tenant_id
      AND account.phone_key_version = p_phone_key_version
      AND account.phone_digest = p_phone_digest
      AND account.status = 'active';
  END IF;

  RETURN public.customer_rendering_quota_snapshot(p_tenant_id, v_account_id);
END;
$$;

CREATE FUNCTION public.bind_customer_rendering_phone(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_application_id text,
  p_installation_id uuid,
  p_phone_key_version smallint,
  p_phone_digest text,
  p_idempotency_key uuid,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.customer_rendering_identity_commands%ROWTYPE;
  v_identity record;
  v_result jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid customer rendering phone bind command';
  END IF;

  SELECT command.*
  INTO v_existing
  FROM public.customer_rendering_identity_commands AS command
  WHERE command.tenant_id = p_tenant_id
    AND command.channel = p_channel
    AND command.subject_key_version = p_subject_key_version
    AND command.subject_digest = p_subject_digest
    AND command.operation = 'phone_bind'
    AND command.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('decision', 'idempotency_conflict');
    END IF;
    v_result := public.customer_rendering_quota_snapshot(
      p_tenant_id,
      v_existing.result_account_id
    );
    RETURN jsonb_set(v_result, '{decision}', to_jsonb('existing'::text));
  END IF;

  SELECT ensured.account_id, ensured.binding_id
  INTO v_identity
  FROM public.ensure_customer_rendering_quota_identity(
    p_tenant_id,
    p_channel,
    p_subject_key_version,
    p_subject_digest,
    p_application_id,
    p_installation_id,
    p_phone_key_version,
    p_phone_digest
  ) AS ensured;

  BEGIN
    INSERT INTO public.customer_rendering_identity_commands (
      tenant_id,
      channel,
      subject_key_version,
      subject_digest,
      operation,
      idempotency_key,
      request_hash,
      result_account_id
    ) VALUES (
      p_tenant_id,
      p_channel,
      p_subject_key_version,
      p_subject_digest,
      'phone_bind',
      p_idempotency_key,
      p_request_hash,
      v_identity.account_id
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT command.*
    INTO STRICT v_existing
    FROM public.customer_rendering_identity_commands AS command
    WHERE command.tenant_id = p_tenant_id
      AND command.channel = p_channel
      AND command.subject_key_version = p_subject_key_version
      AND command.subject_digest = p_subject_digest
      AND command.operation = 'phone_bind'
      AND command.idempotency_key = p_idempotency_key;
    IF v_existing.request_hash <> p_request_hash THEN
      RETURN jsonb_build_object('decision', 'idempotency_conflict');
    END IF;
  END;

  v_result := public.customer_rendering_quota_snapshot(
    p_tenant_id,
    v_identity.account_id
  );
  RETURN jsonb_set(v_result, '{decision}', to_jsonb('bound'::text));
END;
$$;

CREATE FUNCTION public.reserve_customer_rendering_quota(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_application_id text,
  p_installation_id uuid,
  p_phone_key_version smallint,
  p_phone_digest text,
  p_job_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity record;
  v_existing public.customer_rendering_quota_reservations%ROWTYPE;
  v_account public.customer_rendering_quota_accounts%ROWTYPE;
  v_consumed integer;
  v_reserved integer;
  v_limit integer;
  v_reservation_id uuid;
  v_result jsonb;
BEGIN
  IF p_job_id IS NULL
    OR p_idempotency_key IS NULL
    OR p_request_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'invalid customer rendering reservation command';
  END IF;

  SELECT ensured.account_id, ensured.binding_id
  INTO v_identity
  FROM public.ensure_customer_rendering_quota_identity(
    p_tenant_id,
    p_channel,
    p_subject_key_version,
    p_subject_digest,
    p_application_id,
    p_installation_id,
    p_phone_key_version,
    p_phone_digest
  ) AS ensured;

  SELECT reservation.*
  INTO v_existing
  FROM public.customer_rendering_quota_reservations AS reservation
  WHERE reservation.tenant_id = p_tenant_id
    AND reservation.identity_binding_id = v_identity.binding_id
    AND reservation.operation = 'generate'
    AND reservation.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.request_hash <> p_request_hash OR v_existing.job_id <> p_job_id THEN
      RETURN jsonb_build_object('decision', 'idempotency_conflict');
    END IF;
    v_result := public.customer_rendering_quota_snapshot(
      p_tenant_id,
      v_identity.account_id
    );
    RETURN jsonb_set(
      jsonb_set(v_result, '{decision}', to_jsonb('existing'::text)),
      '{reservation_status}',
      to_jsonb(v_existing.status)
    );
  END IF;

  SELECT account.*
  INTO v_account
  FROM public.customer_rendering_quota_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.id = v_identity.account_id
    AND account.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer rendering canonical quota account not found';
  END IF;

  SELECT
    count(*) FILTER (WHERE reservation.status = 'consumed')::integer,
    count(*) FILTER (WHERE reservation.status = 'reserved')::integer
  INTO v_consumed, v_reserved
  FROM public.customer_rendering_quota_reservations AS reservation
  JOIN public.customer_rendering_quota_accounts AS family
    ON family.tenant_id = reservation.tenant_id
   AND family.id = reservation.quota_account_id
  WHERE reservation.tenant_id = p_tenant_id
    AND (
      family.id = v_account.id
      OR family.merged_into_account_id = v_account.id
    );

  v_consumed := coalesce(v_consumed, 0);
  v_reserved := coalesce(v_reserved, 0);
  v_limit := CASE WHEN v_account.phone_digest IS NULL THEN 1 ELSE 5 END;

  IF v_reserved > 0 THEN
    v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account.id);
    RETURN jsonb_set(v_result, '{decision}', to_jsonb('job_active'::text));
  END IF;
  IF v_consumed >= v_limit THEN
    v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account.id);
    RETURN jsonb_set(
      v_result,
      '{decision}',
      CASE WHEN v_account.phone_digest IS NULL
        THEN to_jsonb('phone_required'::text)
        ELSE to_jsonb('quota_exhausted'::text)
      END
    );
  END IF;

  BEGIN
    INSERT INTO public.customer_rendering_quota_reservations (
      tenant_id,
      quota_account_id,
      identity_binding_id,
      job_id,
      idempotency_key,
      request_hash
    ) VALUES (
      p_tenant_id,
      v_account.id,
      v_identity.binding_id,
      p_job_id,
      p_idempotency_key,
      p_request_hash
    )
    RETURNING id INTO v_reservation_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT reservation.*
    INTO v_existing
    FROM public.customer_rendering_quota_reservations AS reservation
    WHERE reservation.tenant_id = p_tenant_id
      AND reservation.identity_binding_id = v_identity.binding_id
      AND reservation.operation = 'generate'
      AND reservation.idempotency_key = p_idempotency_key;
    IF NOT FOUND
      OR v_existing.request_hash <> p_request_hash
      OR v_existing.job_id <> p_job_id
    THEN
      RETURN jsonb_build_object('decision', 'idempotency_conflict');
    END IF;
    v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account.id);
    RETURN jsonb_set(
      jsonb_set(v_result, '{decision}', to_jsonb('existing'::text)),
      '{reservation_status}',
      to_jsonb(v_existing.status)
    );
  END;

  INSERT INTO public.customer_rendering_quota_events (
    tenant_id,
    quota_account_id,
    reservation_id,
    event_type,
    units
  ) VALUES (
    p_tenant_id,
    v_account.id,
    v_reservation_id,
    'reserve',
    1
  );

  v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account.id);
  RETURN jsonb_set(
    jsonb_set(v_result, '{decision}', to_jsonb('reserved'::text)),
    '{reservation_status}',
    to_jsonb('reserved'::text)
  );
END;
$$;

CREATE FUNCTION public.settle_customer_rendering_quota(
  p_tenant_id uuid,
  p_job_id uuid,
  p_outcome text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_reservation public.customer_rendering_quota_reservations%ROWTYPE;
  v_account_id uuid;
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL
    OR p_job_id IS NULL
    OR p_outcome NOT IN ('consume', 'release')
  THEN
    RAISE EXCEPTION 'invalid customer rendering settlement command';
  END IF;

  SELECT reservation.*
  INTO v_reservation
  FROM public.customer_rendering_quota_reservations AS reservation
  WHERE reservation.tenant_id = p_tenant_id
    AND reservation.job_id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('decision', 'not_found');
  END IF;

  SELECT CASE
    WHEN account.status = 'active' THEN account.id
    ELSE account.merged_into_account_id
  END
  INTO v_account_id
  FROM public.customer_rendering_quota_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.id = v_reservation.quota_account_id;

  PERFORM account.id
  FROM public.customer_rendering_quota_accounts AS account
  WHERE account.tenant_id = p_tenant_id
    AND account.id = v_account_id
  FOR UPDATE;

  IF (p_outcome = 'consume' AND v_reservation.status = 'consumed')
    OR (p_outcome = 'release' AND v_reservation.status = 'released')
  THEN
    v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account_id);
    RETURN jsonb_set(
      jsonb_set(v_result, '{decision}', to_jsonb('existing'::text)),
      '{reservation_status}',
      to_jsonb(v_reservation.status)
    );
  END IF;

  IF v_reservation.status <> 'reserved' THEN
    v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account_id);
    RETURN jsonb_set(v_result, '{decision}', to_jsonb('invalid_state'::text));
  END IF;

  UPDATE public.customer_rendering_quota_reservations AS reservation
  SET status = CASE WHEN p_outcome = 'consume' THEN 'consumed' ELSE 'released' END,
      consumed_at = CASE WHEN p_outcome = 'consume' THEN now() ELSE NULL END,
      released_at = CASE WHEN p_outcome = 'release' THEN now() ELSE NULL END
  WHERE reservation.tenant_id = p_tenant_id
    AND reservation.id = v_reservation.id;

  INSERT INTO public.customer_rendering_quota_events (
    tenant_id,
    quota_account_id,
    reservation_id,
    event_type,
    units
  ) VALUES (
    p_tenant_id,
    v_account_id,
    v_reservation.id,
    p_outcome,
    1
  );

  v_result := public.customer_rendering_quota_snapshot(p_tenant_id, v_account_id);
  RETURN jsonb_set(
    jsonb_set(v_result, '{decision}', to_jsonb(p_outcome)),
    '{reservation_status}',
    to_jsonb(CASE WHEN p_outcome = 'consume' THEN 'consumed' ELSE 'released' END)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_rendering_quota_snapshot(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_customer_rendering_quota_identity(
  uuid, text, smallint, text, text, uuid, smallint, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_customer_rendering_quota(
  uuid, text, smallint, text, smallint, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_customer_rendering_phone(
  uuid, text, smallint, text, text, uuid, smallint, text, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_customer_rendering_quota(
  uuid, text, smallint, text, text, uuid, smallint, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_customer_rendering_quota(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_customer_rendering_quota(
  uuid, text, smallint, text, smallint, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_customer_rendering_phone(
  uuid, text, smallint, text, text, uuid, smallint, text, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_customer_rendering_quota(
  uuid, text, smallint, text, text, uuid, smallint, text, uuid, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_customer_rendering_quota(uuid, uuid, text)
  TO service_role;

COMMENT ON TABLE public.customer_rendering_quota_accounts IS
  '租户内客户装修生图规范额度账户；不存储裸手机号。';
COMMENT ON TABLE public.customer_rendering_identity_bindings IS
  '微信或抖音渠道身份摘要到额度账户的映射；不授予历史文件访问权。';
COMMENT ON TABLE public.customer_rendering_quota_reservations IS
  '客户装修生图次数的任务级预占和终态。';
COMMENT ON TABLE public.customer_rendering_quota_events IS
  '客户装修生图额度只追加审计事件；应用角色不可更新或删除。';

COMMIT;
