-- Establish formal platform technical-service contract periods and explicit
-- paid-onboarding access termination facts.
--
-- Forward-only rollback/remediation: do not drop these facts or restore an
-- older RPC in place. If rollout must be stopped, first disable the API paths,
-- reconcile every contract/period/refund fact with a later migration, then use
-- another forward migration to restore the prior exact RPC definitions and
-- revoke newly unused privileges. Destructive rollback would erase accepted
-- service history and is intentionally not provided.

BEGIN;

-- Historical invariant preflight runs before any DDL and fails closed. The
-- stable exception messages are deployment/remediation contract codes.
DO $$
DECLARE
  v_invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO v_invalid_count
  FROM public.tenant_service_orders AS service_order
  WHERE service_order.payment_status IN (
    'paid',
    'refund_reviewing',
    'refunding'
  )
    AND (
      service_order.paid_at IS NULL
      OR service_order.paid_amount_fen IS DISTINCT FROM service_order.amount_fen
      OR service_order.transaction_id IS NULL
      OR btrim(service_order.transaction_id) = ''
      OR NOT EXISTS (
        SELECT 1
        FROM public.tenant_service_work_orders AS work_order
        WHERE work_order.service_order_id = service_order.id
          AND work_order.tenant_id = service_order.tenant_id
      )
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'PLATFORM_SERVICE_ACCESS_PREFLIGHT_PAID_HISTORY_INVALID';
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM public.tenant_service_orders AS service_order
  LEFT JOIN public.tenant_service_work_orders AS work_order
    ON work_order.service_order_id = service_order.id
   AND work_order.tenant_id = service_order.tenant_id
  LEFT JOIN public.tenant_service_acceptance_preparations AS acceptance
    ON acceptance.service_order_id = service_order.id
   AND acceptance.tenant_id = service_order.tenant_id
  WHERE (
      service_order.service_status IN ('accepted', 'active')
      OR work_order.status IN ('accepted', 'active')
      OR acceptance.status = 'accepted'
    )
    AND NOT (
      service_order.service_status IN ('accepted', 'active')
      AND service_order.payment_status IN (
        'paid',
        'refund_reviewing',
        'refunding'
      )
      AND work_order.id IS NOT NULL
      AND work_order.status IN ('accepted', 'active')
      AND acceptance.id IS NOT NULL
      AND acceptance.status = 'accepted'
      AND (
        SELECT count(*)
        FROM public.tenant_service_work_order_events AS acceptance_event
        WHERE acceptance_event.service_order_id = service_order.id
          AND acceptance_event.tenant_id = service_order.tenant_id
          AND acceptance_event.work_order_id = work_order.id
          AND acceptance_event.action IN (
            'customer_accept',
            'platform_accept_overdue'
          )
      ) = 1
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'PLATFORM_SERVICE_ACCESS_PREFLIGHT_ACCEPTANCE_HISTORY_INVALID';
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM public.tenant_service_refund_requests AS refund_request
  JOIN public.tenant_service_orders AS service_order
    ON service_order.id = refund_request.service_order_id
   AND service_order.tenant_id = refund_request.tenant_id
  WHERE (
      refund_request.status = 'reviewing'
      AND service_order.payment_status <> 'refund_reviewing'
    )
    OR (
      refund_request.status = 'approved'
      AND (
        service_order.payment_status NOT IN ('refund_reviewing', 'refunding')
        OR refund_request.reviewed_at IS NULL
        OR refund_request.reviewed_by_employee_id IS NULL
      )
    )
    OR (
      refund_request.status = 'rejected'
      AND (
        refund_request.reviewed_at IS NULL
        OR refund_request.reviewed_by_employee_id IS NULL
      )
    )
    OR (
      refund_request.status IN ('reviewing', 'approved')
      AND (
        SELECT count(*)
        FROM public.tenant_service_refund_requests AS concurrent_request
        WHERE concurrent_request.service_order_id = refund_request.service_order_id
          AND concurrent_request.tenant_id = refund_request.tenant_id
          AND concurrent_request.status IN ('reviewing', 'approved')
      ) > 1
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'PLATFORM_SERVICE_ACCESS_PREFLIGHT_REFUND_HISTORY_INVALID';
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM public.tenant_service_orders
  WHERE payment_status IN ('partially_refunded', 'refunded');

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION
      'PLATFORM_SERVICE_ACCESS_PREFLIGHT_LEGACY_REFUND_UNSUPPORTED';
  END IF;
END;
$$;

ALTER TABLE public.tenant_service_orders
  ADD COLUMN source_trial_id uuid NULL,
  ADD COLUMN service_access_terminated_at timestamptz NULL,
  ADD COLUMN service_access_termination_reason text NULL,
  ADD COLUMN service_access_terminated_by_employee_id uuid NULL;

ALTER TABLE public.tenant_service_orders
  ADD CONSTRAINT tenant_service_orders_access_termination_reason_check
    CHECK (
      service_access_termination_reason IS NULL
      OR (
        btrim(service_access_termination_reason) <> ''
        AND char_length(service_access_termination_reason) <= 500
      )
    ),
  ADD CONSTRAINT tenant_service_orders_access_terminator_tenant_fkey
    FOREIGN KEY (service_access_terminated_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_service_orders_access_termination_fields_check
    CHECK (
      (
        payment_status <> 'refunded'
        AND service_access_terminated_at IS NULL
        AND service_access_termination_reason IS NULL
        AND service_access_terminated_by_employee_id IS NULL
      )
      OR
      (
        payment_status = 'refunded'
        AND service_access_terminated_at IS NOT NULL
        AND service_access_termination_reason IS NOT NULL
        AND service_access_terminated_by_employee_id IS NOT NULL
        AND paid_at IS NOT NULL
        AND service_access_terminated_at >= paid_at
      )
    );

CREATE INDEX tenant_service_orders_paid_onboarding_access_idx
  ON public.tenant_service_orders (tenant_id, paid_at DESC, id DESC)
  WHERE payment_status IN (
    'paid',
    'refund_reviewing',
    'refunding',
    'partially_refunded'
  )
    AND service_access_terminated_at IS NULL;

ALTER TABLE public.tenant_service_refund_requests
  ADD COLUMN out_refund_no text NULL,
  ADD COLUMN wechat_refund_id text NULL,
  ADD COLUMN refund_amount_fen bigint NULL,
  ADD COLUMN refunded_at timestamptz NULL,
  ADD COLUMN refunded_by_employee_id uuid NULL;

ALTER TABLE public.tenant_service_refund_requests
  DROP CONSTRAINT tenant_service_refund_requests_status_check;

ALTER TABLE public.tenant_service_refund_requests
  ADD CONSTRAINT tenant_service_refund_requests_status_check
    CHECK (status IN (
      'reviewing',
      'approved',
      'refunding',
      'refunded',
      'rejected',
      'cancelled'
    )),
  ADD CONSTRAINT tenant_service_refund_requests_identity_key
    UNIQUE (id, tenant_id),
  ADD CONSTRAINT tenant_service_refund_requests_out_refund_no_check
    CHECK (
      out_refund_no IS NULL
      OR (btrim(out_refund_no) <> '' AND char_length(out_refund_no) <= 64)
    ),
  ADD CONSTRAINT tenant_service_refund_requests_wechat_refund_id_check
    CHECK (
      wechat_refund_id IS NULL
      OR (
        btrim(wechat_refund_id) <> ''
        AND char_length(wechat_refund_id) <= 128
      )
    ),
  ADD CONSTRAINT tenant_service_refund_requests_refund_amount_check
    CHECK (refund_amount_fen IS NULL OR refund_amount_fen > 0),
  ADD CONSTRAINT tenant_service_refund_requests_refunded_by_tenant_fkey
    FOREIGN KEY (refunded_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_service_refund_requests_execution_fields_check
    CHECK (
      (
        status <> 'refunded'
        AND out_refund_no IS NULL
        AND wechat_refund_id IS NULL
        AND refund_amount_fen IS NULL
        AND refunded_at IS NULL
        AND refunded_by_employee_id IS NULL
      )
      OR
      (
        status = 'refunded'
        AND out_refund_no IS NOT NULL
        AND wechat_refund_id IS NOT NULL
        AND refund_amount_fen IS NOT NULL
        AND refunded_at IS NOT NULL
        AND refunded_by_employee_id IS NOT NULL
      )
    );

CREATE UNIQUE INDEX tenant_service_refund_requests_out_refund_unique_idx
  ON public.tenant_service_refund_requests (out_refund_no)
  WHERE out_refund_no IS NOT NULL;

CREATE UNIQUE INDEX tenant_service_refund_requests_wechat_refund_unique_idx
  ON public.tenant_service_refund_requests (wechat_refund_id)
  WHERE wechat_refund_id IS NOT NULL;

CREATE TABLE public.tenant_service_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  service_family text NOT NULL DEFAULT 'platform_technical_service',
  status text NOT NULL DEFAULT 'active',
  service_start_at timestamptz NOT NULL,
  service_end_at timestamptz NOT NULL,
  last_period_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_contracts_tenant_family_key
    UNIQUE (tenant_id, service_family),
  CONSTRAINT tenant_service_contracts_identity_key
    UNIQUE (id, tenant_id),
  CONSTRAINT tenant_service_contracts_service_family_check
    CHECK (
      service_family = 'platform_technical_service'
      AND btrim(service_family) <> ''
      AND char_length(service_family) <= 80
    ),
  CONSTRAINT tenant_service_contracts_status_check
    CHECK (status IN ('active', 'suspended', 'expired', 'canceled')),
  CONSTRAINT tenant_service_contracts_time_check
    CHECK (service_end_at > service_start_at),
  CONSTRAINT tenant_service_contracts_version_check
    CHECK (version > 0)
);

CREATE TABLE public.tenant_service_contract_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  accepted_at timestamptz NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  original_starts_at timestamptz NOT NULL,
  original_ends_at timestamptz NOT NULL,
  term_years integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  adjustment_reason text NULL,
  refund_request_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_contract_periods_order_key
    UNIQUE (service_order_id),
  CONSTRAINT tenant_service_contract_periods_identity_key
    UNIQUE (id, tenant_id),
  CONSTRAINT tenant_service_contract_periods_contract_identity_key
    UNIQUE (id, contract_id, tenant_id),
  CONSTRAINT tenant_service_contract_periods_contract_identity_fkey
    FOREIGN KEY (contract_id, tenant_id)
    REFERENCES public.tenant_service_contracts(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_contract_periods_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_contract_periods_refund_identity_fkey
    FOREIGN KEY (refund_request_id, tenant_id)
    REFERENCES public.tenant_service_refund_requests(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_contract_periods_term_check
    CHECK (term_years IN (1, 2, 3)),
  CONSTRAINT tenant_service_contract_periods_time_check
    CHECK (
      ends_at > starts_at
      AND original_ends_at > original_starts_at
      AND accepted_at <= original_starts_at
      AND ends_at = starts_at + make_interval(years => term_years)
      AND original_ends_at =
        original_starts_at + make_interval(years => term_years)
    ),
  CONSTRAINT tenant_service_contract_periods_status_check
    CHECK (status IN ('active', 'adjusted', 'voided')),
  CONSTRAINT tenant_service_contract_periods_adjustment_reason_check
    CHECK (
      adjustment_reason IS NULL
      OR (
        btrim(adjustment_reason) <> ''
        AND char_length(adjustment_reason) <= 1000
      )
    ),
  CONSTRAINT tenant_service_contract_periods_status_fields_check
    CHECK (
      (
        status = 'active'
        AND starts_at = original_starts_at
        AND ends_at = original_ends_at
        AND adjustment_reason IS NULL
        AND refund_request_id IS NULL
      )
      OR
      (
        status IN ('adjusted', 'voided')
        AND adjustment_reason IS NOT NULL
        AND refund_request_id IS NOT NULL
      )
    ),
  CONSTRAINT tenant_service_contract_periods_metadata_check
    CHECK (
      jsonb_typeof(metadata) = 'object'
      AND pg_column_size(metadata) <= 8192
    ),
  CONSTRAINT tenant_service_contract_periods_version_check
    CHECK (version > 0)
);

ALTER TABLE public.tenant_service_contracts
  ADD CONSTRAINT tenant_service_contracts_last_period_fkey
  FOREIGN KEY (last_period_id, id, tenant_id)
  REFERENCES public.tenant_service_contract_periods(id, contract_id, tenant_id)
  ON DELETE RESTRICT;

CREATE INDEX tenant_service_contracts_tenant_status_end_idx
  ON public.tenant_service_contracts (
    tenant_id,
    status,
    service_end_at DESC,
    id
  );

CREATE INDEX tenant_service_contract_periods_tenant_active_idx
  ON public.tenant_service_contract_periods (
    tenant_id,
    ends_at DESC,
    starts_at DESC,
    id
  )
  WHERE status <> 'voided';

CREATE INDEX tenant_service_contract_periods_contract_active_idx
  ON public.tenant_service_contract_periods (
    contract_id,
    starts_at ASC,
    id ASC
  )
  WHERE status <> 'voided';

CREATE TRIGGER tr_tenant_service_contracts_updated_at
BEFORE UPDATE ON public.tenant_service_contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_service_contract_periods_updated_at
BEFORE UPDATE ON public.tenant_service_contract_periods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tenant_service_protect_period_originals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.contract_id IS DISTINCT FROM NEW.contract_id
    OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.service_order_id IS DISTINCT FROM NEW.service_order_id
    OR OLD.accepted_at IS DISTINCT FROM NEW.accepted_at
    OR OLD.original_starts_at IS DISTINCT FROM NEW.original_starts_at
    OR OLD.original_ends_at IS DISTINCT FROM NEW.original_ends_at
    OR OLD.term_years IS DISTINCT FROM NEW.term_years
  THEN
    RAISE EXCEPTION 'SERVICE_CONTRACT_PERIOD_ORIGINALS_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_tenant_service_contract_periods_protect_originals
BEFORE UPDATE ON public.tenant_service_contract_periods
FOR EACH ROW
EXECUTE FUNCTION public.tenant_service_protect_period_originals();

REVOKE ALL ON FUNCTION public.tenant_service_protect_period_originals()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_service_protect_period_originals()
  FROM anon;
REVOKE ALL ON FUNCTION public.tenant_service_protect_period_originals()
  FROM authenticated;

ALTER TABLE public.tenant_service_work_order_events
  DROP CONSTRAINT tenant_service_work_order_events_action_check;

ALTER TABLE public.tenant_service_work_order_events
  ADD CONSTRAINT tenant_service_work_order_events_action_check
  CHECK (action IN (
    'assign',
    'transition',
    'fulfillment_record_create',
    'acceptance_prepare',
    'acceptance_submit',
    'customer_accept',
    'customer_reject',
    'platform_accept_overdue',
    'refund_review',
    'refund_confirm'
  ));

-- Internal-only helper shared by both official acceptance entry points. It is
-- SECURITY INVOKER and has no direct API grant, so only controlled definer RPCs
-- (and the migration owner during historical backfill) can mutate periods.
CREATE OR REPLACE FUNCTION public.tenant_service_ensure_contract_period(
  p_tenant_id uuid,
  p_service_order_id uuid,
  p_accepted_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
  v_contract public.tenant_service_contracts%ROWTYPE;
  v_period public.tenant_service_contract_periods%ROWTYPE;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_contract_exists boolean := false;
BEGIN
  IF p_accepted_at IS NULL THEN
    RAISE EXCEPTION 'SERVICE_CONTRACT_ACCEPTED_AT_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':platform_technical_service',
      2026081019
    )
  );

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_service_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;

  IF v_order.payment_status NOT IN (
    'paid',
    'refund_reviewing',
    'refunding'
  ) THEN
    RAISE EXCEPTION 'SERVICE_CONTRACT_ORDER_INVALID_STATE';
  END IF;

  SELECT *
  INTO v_period
  FROM public.tenant_service_contract_periods
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT *
    INTO v_contract
    FROM public.tenant_service_contracts
    WHERE id = v_period.contract_id
      AND tenant_id = v_period.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_CONTRACT_PERIOD_BINDING_INVALID';
    END IF;

    RETURN jsonb_build_object(
      'contract', to_jsonb(v_contract),
      'contract_period', to_jsonb(v_period),
      'idempotent', true
    );
  END IF;

  SELECT *
  INTO v_contract
  FROM public.tenant_service_contracts
  WHERE tenant_id = v_order.tenant_id
    AND service_family = 'platform_technical_service'
  FOR UPDATE;
  v_contract_exists := FOUND;

  IF v_contract_exists THEN
    v_starts_at := CASE
      WHEN v_contract.status = 'canceled' THEN p_accepted_at
      ELSE GREATEST(v_contract.service_end_at, p_accepted_at)
    END;
  ELSE
    v_starts_at := p_accepted_at;
  END IF;

  v_ends_at :=
    v_starts_at + make_interval(years => v_order.term_years);

  IF NOT v_contract_exists THEN
    INSERT INTO public.tenant_service_contracts (
      tenant_id,
      service_family,
      status,
      service_start_at,
      service_end_at
    )
    VALUES (
      v_order.tenant_id,
      'platform_technical_service',
      'active',
      v_starts_at,
      v_ends_at
    )
    RETURNING * INTO v_contract;
  END IF;

  INSERT INTO public.tenant_service_contract_periods (
    contract_id,
    tenant_id,
    service_order_id,
    accepted_at,
    starts_at,
    ends_at,
    original_starts_at,
    original_ends_at,
    term_years,
    status,
    metadata
  )
  VALUES (
    v_contract.id,
    v_order.tenant_id,
    v_order.id,
    p_accepted_at,
    v_starts_at,
    v_ends_at,
    v_starts_at,
    v_ends_at,
    v_order.term_years,
    'active',
    '{}'::jsonb
  )
  ON CONFLICT (service_order_id) DO NOTHING;

  SELECT *
  INTO v_period
  FROM public.tenant_service_contract_periods
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_period.contract_id <> v_contract.id
    OR v_period.tenant_id <> v_contract.tenant_id
  THEN
    RAISE EXCEPTION 'SERVICE_CONTRACT_PERIOD_BINDING_INVALID';
  END IF;

  UPDATE public.tenant_service_contracts
  SET
    status = CASE
      WHEN status = 'suspended' THEN 'suspended'
      ELSE 'active'
    END,
    service_start_at = CASE
      WHEN status = 'canceled' THEN v_period.starts_at
      ELSE LEAST(service_start_at, v_period.starts_at)
    END,
    service_end_at = v_period.ends_at,
    last_period_id = v_period.id,
    version = version + 1
  WHERE id = v_contract.id
    AND tenant_id = v_contract.tenant_id
  RETURNING * INTO v_contract;

  RETURN jsonb_build_object(
    'contract', to_jsonb(v_contract),
    'contract_period', to_jsonb(v_period),
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_service_ensure_contract_period(
  uuid, uuid, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_service_ensure_contract_period(
  uuid, uuid, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.tenant_service_ensure_contract_period(
  uuid, uuid, timestamptz
) FROM authenticated;
REVOKE ALL ON FUNCTION public.tenant_service_ensure_contract_period(
  uuid, uuid, timestamptz
) FROM service_role;

-- Backfill already accepted orders in deterministic tenant/decision order.
-- The preflight above guarantees one authoritative acceptance event per row.
DO $$
DECLARE
  v_history record;
BEGIN
  FOR v_history IN
    SELECT
      service_order.tenant_id,
      service_order.id AS service_order_id,
      acceptance_event.created_at AS accepted_at
    FROM public.tenant_service_orders AS service_order
    JOIN public.tenant_service_work_orders AS work_order
      ON work_order.service_order_id = service_order.id
     AND work_order.tenant_id = service_order.tenant_id
    JOIN LATERAL (
      SELECT work_order_event.created_at
      FROM public.tenant_service_work_order_events AS work_order_event
      WHERE work_order_event.service_order_id = service_order.id
        AND work_order_event.tenant_id = service_order.tenant_id
        AND work_order_event.work_order_id = work_order.id
        AND work_order_event.action IN (
          'customer_accept',
          'platform_accept_overdue'
        )
      ORDER BY work_order_event.created_at ASC, work_order_event.id ASC
      LIMIT 1
    ) AS acceptance_event ON true
    WHERE service_order.service_status IN ('accepted', 'active')
    ORDER BY
      service_order.tenant_id ASC,
      acceptance_event.created_at ASC,
      service_order.id ASC
  LOOP
    PERFORM public.tenant_service_ensure_contract_period(
      v_history.tenant_id,
      v_history.service_order_id,
      v_history.accepted_at
    );
  END LOOP;
END;
$$;

UPDATE public.tenant_service_contracts
SET
  status = 'expired',
  version = version + 1
WHERE status = 'active'
  AND service_end_at <= clock_timestamp();

ALTER TABLE public.tenant_service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_contract_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_contract_periods FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tenant_service_contracts FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_contracts FROM anon;
REVOKE ALL ON TABLE public.tenant_service_contracts FROM authenticated;
GRANT SELECT ON TABLE public.tenant_service_contracts TO authenticated;
REVOKE ALL ON TABLE public.tenant_service_contracts FROM service_role;
GRANT SELECT ON TABLE public.tenant_service_contracts TO service_role;

REVOKE ALL ON TABLE public.tenant_service_contract_periods FROM PUBLIC;
REVOKE ALL ON TABLE public.tenant_service_contract_periods FROM anon;
REVOKE ALL ON TABLE public.tenant_service_contract_periods FROM authenticated;
GRANT SELECT ON TABLE public.tenant_service_contract_periods TO authenticated;
REVOKE ALL ON TABLE public.tenant_service_contract_periods FROM service_role;
GRANT SELECT ON TABLE public.tenant_service_contract_periods TO service_role;

CREATE POLICY tenant_service_contracts_self_read
  ON public.tenant_service_contracts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_contracts.tenant_id
        AND employee.status = 'active'
    )
  );

CREATE POLICY tenant_service_contract_periods_self_read
  ON public.tenant_service_contract_periods
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_contract_periods.tenant_id
        AND employee.status = 'active'
    )
  );

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
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
BEGIN
  IF p_transaction_id IS NULL OR btrim(p_transaction_id) = '' THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_TRANSACTION_ID_REQUIRED';
  END IF;

  IF p_paid_amount_fen IS NULL OR p_paid_amount_fen <= 0 THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_AMOUNT_MISMATCH';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
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

    RETURN jsonb_build_object(
      'order', to_jsonb(v_order),
      'work_order', to_jsonb(v_work_order),
      'access_mode', 'paid_onboarding',
      'idempotent', true
    );
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'SERVICE_ORDER_INVALID_STATE';
  END IF;

  IF p_paid_amount_fen <> v_order.amount_fen THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_AMOUNT_MISMATCH';
  END IF;

  UPDATE public.tenant_service_orders
  SET
    payment_status = 'paid',
    service_status = 'waiting_assignment',
    paid_amount_fen = p_paid_amount_fen,
    paid_at = coalesce(p_paid_at, clock_timestamp()),
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

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'work_order', to_jsonb(v_work_order),
    'access_mode', 'paid_onboarding',
    'idempotent', false,
    'notification_id', p_notification_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(
  uuid, text, bigint, timestamptz, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(
  uuid, text, bigint, timestamptz, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(
  uuid, text, bigint, timestamptz, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_confirm_payment(
  uuid, text, bigint, timestamptz, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.tenant_service_decide_acceptance(
  p_tenant_id uuid,
  p_service_order_id uuid,
  p_decision text,
  p_expected_work_order_version integer,
  p_operator_employee_id uuid,
  p_remark text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_acceptance public.tenant_service_acceptance_preparations%ROWTYPE;
  v_contract public.tenant_service_contracts%ROWTYPE;
  v_period public.tenant_service_contract_periods%ROWTYPE;
  v_to_status text;
  v_acceptance_status text;
  v_action text;
  v_decided_at timestamptz;
BEGIN
  IF p_decision NOT IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF p_decision = 'accepted' THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        p_tenant_id::text || ':platform_technical_service',
        2026081019
      )
    );
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_service_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE service_order_id = p_service_order_id
    AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_acceptance
  FROM public.tenant_service_acceptance_preparations
  WHERE work_order_id = v_work_order.id
    AND tenant_id = p_tenant_id
    AND service_order_id = p_service_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF p_decision = 'accepted' THEN
    SELECT *
    INTO v_period
    FROM public.tenant_service_contract_periods
    WHERE service_order_id = v_order.id
      AND tenant_id = v_order.tenant_id
    FOR UPDATE;

    IF FOUND THEN
      SELECT *
      INTO v_contract
      FROM public.tenant_service_contracts
      WHERE id = v_period.contract_id
        AND tenant_id = v_period.tenant_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'SERVICE_CONTRACT_PERIOD_BINDING_INVALID';
      END IF;

      RETURN jsonb_build_object(
        'work_order', to_jsonb(v_work_order),
        'order', to_jsonb(v_order),
        'acceptance_preparation', to_jsonb(v_acceptance),
        'contract', to_jsonb(v_contract),
        'contract_period', to_jsonb(v_period),
        'idempotent', true,
        'error_code', NULL
      );
    END IF;
  END IF;

  IF v_work_order.version <> p_expected_work_order_version THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_WORK_ORDER_VERSION_CONFLICT'
    );
  END IF;

  IF v_order.payment_status <> 'paid'
    OR v_work_order.status <> 'awaiting_acceptance'
    OR v_acceptance.status <> 'submitted'
  THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF p_decision = 'accepted' THEN
    v_to_status := 'accepted';
    v_acceptance_status := 'accepted';
    v_action := 'customer_accept';
  ELSE
    v_to_status := 'rectifying';
    v_acceptance_status := 'rejected';
    v_action := 'customer_reject';
  END IF;

  v_decided_at := clock_timestamp();

  UPDATE public.tenant_service_work_orders
  SET
    status = v_to_status,
    version = version + 1
  WHERE id = v_work_order.id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_orders
  SET
    service_status = v_to_status,
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE public.tenant_service_acceptance_preparations
  SET
    status = v_acceptance_status,
    updated_at = v_decided_at
  WHERE id = v_acceptance.id
  RETURNING * INTO v_acceptance;

  IF p_decision = 'accepted' THEN
    PERFORM public.tenant_service_ensure_contract_period(
      v_order.tenant_id,
      v_order.id,
      v_decided_at
    );

    SELECT *
    INTO v_period
    FROM public.tenant_service_contract_periods
    WHERE service_order_id = v_order.id
      AND tenant_id = v_order.tenant_id
    FOR UPDATE;

    SELECT *
    INTO v_contract
    FROM public.tenant_service_contracts
    WHERE id = v_period.contract_id
      AND tenant_id = v_period.tenant_id
    FOR UPDATE;
  END IF;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata,
    created_at
  )
  VALUES (
    p_tenant_id,
    p_service_order_id,
    v_work_order.id,
    v_action,
    'awaiting_acceptance',
    v_to_status,
    p_remark,
    p_operator_employee_id,
    coalesce(p_metadata, '{}'::jsonb),
    v_decided_at
  );

  RETURN jsonb_build_object(
    'work_order', to_jsonb(v_work_order),
    'order', to_jsonb(v_order),
    'acceptance_preparation', to_jsonb(v_acceptance),
    'contract', CASE
      WHEN p_decision = 'accepted' THEN to_jsonb(v_contract)
      ELSE NULL
    END,
    'contract_period', CASE
      WHEN p_decision = 'accepted' THEN to_jsonb(v_period)
      ELSE NULL
    END,
    'idempotent', false,
    'error_code', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_service_decide_acceptance(
  uuid, uuid, text, integer, uuid, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_service_decide_acceptance(
  uuid, uuid, text, integer, uuid, text, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.tenant_service_decide_acceptance(
  uuid, uuid, text, integer, uuid, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_service_decide_acceptance(
  uuid, uuid, text, integer, uuid, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_service_confirm_overdue_acceptance(
  p_work_order_id uuid,
  p_expected_version integer,
  p_operator_employee_id uuid,
  p_remark text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_acceptance public.tenant_service_acceptance_preparations%ROWTYPE;
  v_contract public.tenant_service_contracts%ROWTYPE;
  v_period public.tenant_service_contract_periods%ROWTYPE;
  v_decided_at timestamptz;
BEGIN
  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE id = p_work_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_work_order.tenant_id::text || ':platform_technical_service',
      2026081019
    )
  );

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE id = p_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = v_work_order.service_order_id
    AND tenant_id = v_work_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  SELECT *
  INTO v_acceptance
  FROM public.tenant_service_acceptance_preparations
  WHERE work_order_id = v_work_order.id
    AND tenant_id = v_work_order.tenant_id
    AND service_order_id = v_work_order.service_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  SELECT *
  INTO v_period
  FROM public.tenant_service_contract_periods
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF FOUND THEN
    SELECT *
    INTO v_contract
    FROM public.tenant_service_contracts
    WHERE id = v_period.contract_id
      AND tenant_id = v_period.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_CONTRACT_PERIOD_BINDING_INVALID';
    END IF;

    RETURN jsonb_build_object(
      'work_order', to_jsonb(v_work_order),
      'order', to_jsonb(v_order),
      'acceptance_preparation', to_jsonb(v_acceptance),
      'contract', to_jsonb(v_contract),
      'contract_period', to_jsonb(v_period),
      'idempotent', true,
      'error_code', NULL
    );
  END IF;

  IF v_work_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_WORK_ORDER_VERSION_CONFLICT'
    );
  END IF;

  IF v_order.payment_status <> 'paid'
    OR v_work_order.status <> 'awaiting_acceptance'
    OR v_acceptance.status <> 'submitted'
  THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_INVALID_STATE'
    );
  END IF;

  IF v_acceptance.acceptance_due_at IS NULL
    OR v_acceptance.acceptance_due_at > clock_timestamp()
  THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'acceptance_preparation', NULL,
      'contract', NULL,
      'contract_period', NULL,
      'idempotent', false,
      'error_code', 'SERVICE_ACCEPTANCE_NOT_OVERDUE'
    );
  END IF;

  v_decided_at := clock_timestamp();

  UPDATE public.tenant_service_work_orders
  SET
    status = 'accepted',
    version = version + 1
  WHERE id = v_work_order.id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_orders
  SET
    service_status = 'accepted',
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE public.tenant_service_acceptance_preparations
  SET
    status = 'accepted',
    updated_at = v_decided_at
  WHERE id = v_acceptance.id
  RETURNING * INTO v_acceptance;

  PERFORM public.tenant_service_ensure_contract_period(
    v_order.tenant_id,
    v_order.id,
    v_decided_at
  );

  SELECT *
  INTO v_period
  FROM public.tenant_service_contract_periods
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  SELECT *
  INTO v_contract
  FROM public.tenant_service_contracts
  WHERE id = v_period.contract_id
    AND tenant_id = v_period.tenant_id
  FOR UPDATE;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata,
    created_at
  )
  VALUES (
    v_work_order.tenant_id,
    v_work_order.service_order_id,
    v_work_order.id,
    'platform_accept_overdue',
    'awaiting_acceptance',
    'accepted',
    p_remark,
    p_operator_employee_id,
    coalesce(p_metadata, '{}'::jsonb),
    v_decided_at
  );

  RETURN jsonb_build_object(
    'work_order', to_jsonb(v_work_order),
    'order', to_jsonb(v_order),
    'acceptance_preparation', to_jsonb(v_acceptance),
    'contract', to_jsonb(v_contract),
    'contract_period', to_jsonb(v_period),
    'idempotent', false,
    'error_code', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_confirm_overdue_acceptance(
  uuid, integer, uuid, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_confirm_overdue_acceptance(
  uuid, integer, uuid, text, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_confirm_overdue_acceptance(
  uuid, integer, uuid, text, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_confirm_overdue_acceptance(
  uuid, integer, uuid, text, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_service_confirm_refund(
  p_refund_request_id uuid,
  p_out_refund_no text,
  p_wechat_refund_id text,
  p_refund_amount_fen bigint,
  p_refunded_at timestamptz,
  p_operator_employee_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_refund public.tenant_service_refund_requests%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_contract public.tenant_service_contracts%ROWTYPE;
  v_period public.tenant_service_contract_periods%ROWTYPE;
  v_reflow_period public.tenant_service_contract_periods%ROWTYPE;
  v_has_period boolean := false;
  v_work_order_from_status text;
  v_contract_start_at timestamptz;
  v_contract_end_at timestamptz;
  v_reflow_starts_at timestamptz;
  v_reflow_ends_at timestamptz;
  v_reflow_status text;
  v_last_period_id uuid;
BEGIN
  IF p_out_refund_no IS NULL
    OR btrim(p_out_refund_no) = ''
    OR char_length(p_out_refund_no) > 64
    OR p_wechat_refund_id IS NULL
    OR btrim(p_wechat_refund_id) = ''
    OR char_length(p_wechat_refund_id) > 128
    OR p_refund_amount_fen IS NULL
    OR p_refund_amount_fen <= 0
    OR p_refunded_at IS NULL
    OR jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    OR pg_column_size(p_metadata) > 8192
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_CONFIRMATION_INVALID';
  END IF;

  SELECT tenant_id
  INTO v_tenant_id
  FROM public.tenant_service_refund_requests
  WHERE id = p_refund_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_tenant_id::text || ':platform_technical_service',
      2026081019
    )
  );

  SELECT *
  INTO v_refund
  FROM public.tenant_service_refund_requests
  WHERE id = p_refund_request_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = v_refund.service_order_id
    AND tenant_id = v_refund.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_ORDER_BINDING_INVALID';
  END IF;

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE service_order_id = v_order.id
    AND tenant_id = v_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_period
  FROM public.tenant_service_contract_periods
  WHERE service_order_id = v_order.id
    AND tenant_id = v_refund.tenant_id
  FOR UPDATE;
  v_has_period := FOUND;

  IF v_has_period THEN
    SELECT *
    INTO v_contract
    FROM public.tenant_service_contracts
    WHERE id = v_period.contract_id
      AND tenant_id = v_refund.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SERVICE_REFUND_CONTRACT_BINDING_INVALID';
    END IF;
  ELSIF v_order.service_status IN ('accepted', 'active') THEN
    RAISE EXCEPTION 'SERVICE_REFUND_CONTRACT_BINDING_INVALID';
  END IF;

  IF v_refund.status = 'refunded' THEN
    IF v_refund.out_refund_no IS DISTINCT FROM p_out_refund_no
      OR v_refund.wechat_refund_id IS DISTINCT FROM p_wechat_refund_id
      OR v_refund.refund_amount_fen IS DISTINCT FROM p_refund_amount_fen
    THEN
      RAISE EXCEPTION 'SERVICE_REFUND_IDEMPOTENCY_CONFLICT';
    END IF;

    IF v_order.payment_status <> 'refunded'
      OR v_order.service_access_terminated_at IS NULL
    THEN
      RAISE EXCEPTION 'SERVICE_REFUND_FINALIZATION_INCONSISTENT';
    END IF;

    RETURN jsonb_build_object(
      'refund_request', to_jsonb(v_refund),
      'order', to_jsonb(v_order),
      'contract', to_jsonb(v_contract),
      'contract_period', to_jsonb(v_period),
      'idempotent', true,
      'error_code', NULL
    );
  END IF;

  IF v_has_period AND v_period.status = 'voided' THEN
    RAISE EXCEPTION 'SERVICE_REFUND_CONTRACT_BINDING_INVALID';
  END IF;

  IF v_refund.status NOT IN ('approved', 'refunding')
    OR v_order.payment_status NOT IN ('refund_reviewing', 'refunding')
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_CONFIRMATION_INVALID_STATE';
  END IF;

  IF p_refund_amount_fen < v_order.amount_fen THEN
    RAISE EXCEPTION 'SERVICE_REFUND_PARTIAL_NOT_SUPPORTED';
  END IF;

  IF p_refund_amount_fen <> v_order.amount_fen
    OR v_order.paid_amount_fen IS DISTINCT FROM v_order.amount_fen
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_AMOUNT_MISMATCH';
  END IF;

  IF v_order.paid_at IS NULL
    OR p_refunded_at < v_order.paid_at
    OR (v_has_period AND p_refunded_at < v_period.accepted_at)
  THEN
    RAISE EXCEPTION 'SERVICE_REFUND_TIME_INVALID';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id = p_operator_employee_id
      AND employee.tenant_id = v_refund.tenant_id
      AND employee.status = 'active'
  ) THEN
    RAISE EXCEPTION 'SERVICE_REFUND_OPERATOR_INVALID';
  END IF;

  -- Caller metadata is bounded and type-checked above but intentionally is not
  -- persisted or returned. The tenant-readable audit event contains only the
  -- refund request ID and amount, never gateway payloads or credentials.

  IF EXISTS (
    SELECT 1
    FROM public.tenant_service_refund_requests AS reused_refund
    WHERE reused_refund.id <> v_refund.id
      AND (
        reused_refund.out_refund_no = p_out_refund_no
        OR reused_refund.wechat_refund_id = p_wechat_refund_id
      )
  ) THEN
    RAISE EXCEPTION 'SERVICE_REFUND_EXECUTION_ID_CONFLICT';
  END IF;

  UPDATE public.tenant_service_refund_requests
  SET
    status = 'refunded',
    out_refund_no = p_out_refund_no,
    wechat_refund_id = p_wechat_refund_id,
    refund_amount_fen = p_refund_amount_fen,
    refunded_at = p_refunded_at,
    refunded_by_employee_id = p_operator_employee_id,
    version = version + 1
  WHERE id = v_refund.id
    AND tenant_id = v_refund.tenant_id
  RETURNING * INTO v_refund;

  -- service_status='canceled' is workflow state only. Access removal is driven
  -- exclusively by service_access_terminated_at written in this same atomic
  -- external-refund-success transaction.
  UPDATE public.tenant_service_orders
  SET
    payment_status = 'refunded',
    service_status = 'canceled',
    service_access_terminated_at = p_refunded_at,
    service_access_termination_reason = 'full_refund_confirmed',
    service_access_terminated_by_employee_id = p_operator_employee_id,
    version = version + 1
  WHERE id = v_order.id
    AND tenant_id = v_refund.tenant_id
  RETURNING * INTO v_order;

  v_work_order_from_status := v_work_order.status;

  UPDATE public.tenant_service_work_orders
  SET
    status = 'canceled',
    version = version + 1
  WHERE id = v_work_order.id
    AND tenant_id = v_refund.tenant_id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_acceptance_preparations
  SET
    status = 'cancelled',
    updated_at = p_refunded_at
  WHERE service_order_id = v_order.id
    AND tenant_id = v_refund.tenant_id
    AND status <> 'accepted';

  IF v_has_period THEN
    UPDATE public.tenant_service_contract_periods
    SET
      status = 'voided',
      adjustment_reason = 'full_order_refund',
      refund_request_id = v_refund.id,
      version = version + 1
    WHERE id = v_period.id
      AND contract_id = v_contract.id
      AND tenant_id = v_refund.tenant_id
    RETURNING * INTO v_period;

    v_contract_start_at := NULL;
    v_contract_end_at := NULL;
    v_last_period_id := NULL;

    FOR v_reflow_period IN
      SELECT *
      FROM public.tenant_service_contract_periods
      WHERE contract_id = v_contract.id
        AND tenant_id = v_refund.tenant_id
        AND status <> 'voided'
      ORDER BY accepted_at ASC, id ASC
      FOR UPDATE
    LOOP
      v_reflow_starts_at := CASE
        WHEN v_contract_end_at IS NULL THEN v_reflow_period.accepted_at
        ELSE GREATEST(v_contract_end_at, v_reflow_period.accepted_at)
      END;
      v_reflow_ends_at := v_reflow_starts_at
        + make_interval(years => v_reflow_period.term_years);
      v_reflow_status := CASE
        WHEN v_reflow_starts_at = v_reflow_period.original_starts_at
          AND v_reflow_ends_at = v_reflow_period.original_ends_at
        THEN 'active'
        ELSE 'adjusted'
      END;

      UPDATE public.tenant_service_contract_periods
      SET
        starts_at = v_reflow_starts_at,
        ends_at = v_reflow_ends_at,
        status = v_reflow_status,
        adjustment_reason = CASE
          WHEN v_reflow_status = 'adjusted'
          THEN 'full_refund_period_reflow'
          ELSE NULL
        END,
        refund_request_id = CASE
          WHEN v_reflow_status = 'adjusted' THEN v_refund.id
          ELSE NULL
        END,
        version = version + 1
      WHERE id = v_reflow_period.id
        AND tenant_id = v_refund.tenant_id
        AND (
          starts_at IS DISTINCT FROM v_reflow_starts_at
          OR ends_at IS DISTINCT FROM v_reflow_ends_at
          OR status IS DISTINCT FROM v_reflow_status
          OR adjustment_reason IS DISTINCT FROM CASE
            WHEN v_reflow_status = 'adjusted'
            THEN 'full_refund_period_reflow'
            ELSE NULL
          END
          OR refund_request_id IS DISTINCT FROM CASE
            WHEN v_reflow_status = 'adjusted' THEN v_refund.id
            ELSE NULL
          END
        );

      IF v_contract_start_at IS NULL THEN
        v_contract_start_at := v_reflow_starts_at;
      END IF;
      v_contract_end_at := v_reflow_ends_at;
      v_last_period_id := v_reflow_period.id;
    END LOOP;

    IF v_last_period_id IS NULL THEN
      UPDATE public.tenant_service_contracts
      SET
        status = 'canceled',
        last_period_id = NULL,
        version = version + 1
      WHERE id = v_contract.id
        AND tenant_id = v_refund.tenant_id
      RETURNING * INTO v_contract;
    ELSE
      UPDATE public.tenant_service_contracts
      SET
        status = CASE
          WHEN v_contract_end_at <= clock_timestamp() THEN 'expired'
          WHEN v_contract.status = 'suspended' THEN 'suspended'
          ELSE 'active'
        END,
        service_start_at = v_contract_start_at,
        service_end_at = v_contract_end_at,
        last_period_id = v_last_period_id,
        version = version + 1
      WHERE id = v_contract.id
        AND tenant_id = v_refund.tenant_id
      RETURNING * INTO v_contract;
    END IF;
  END IF;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata
  )
  VALUES (
    v_refund.tenant_id,
    v_refund.service_order_id,
    v_work_order.id,
    'refund_confirm',
    v_work_order_from_status,
    'canceled',
    '微信全额退款确认',
    p_operator_employee_id,
    jsonb_build_object(
      'refund_request_id', v_refund.id,
      'refund_amount_fen', v_refund.refund_amount_fen
    )
  );

  RETURN jsonb_build_object(
    'refund_request', to_jsonb(v_refund),
    'order', to_jsonb(v_order),
    'contract', to_jsonb(v_contract),
    'contract_period', to_jsonb(v_period),
    'idempotent', false,
    'error_code', NULL
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'SERVICE_REFUND_EXECUTION_ID_CONFLICT';
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_confirm_refund(
  uuid, text, text, bigint, timestamptz, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_confirm_refund(
  uuid, text, text, bigint, timestamptz, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_confirm_refund(
  uuid, text, text, bigint, timestamptz, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_confirm_refund(
  uuid, text, text, bigint, timestamptz, uuid, jsonb
) TO service_role;

COMMENT ON TABLE public.tenant_service_contracts
  IS '每个租户的平台技术服务正式合同汇总事实；当前起止时间由非作废合同期确定。';
COMMENT ON TABLE public.tenant_service_contract_periods
  IS '由已验收服务订单产生的合同期；original_* 日期不可变，退款仅作废或重排当前日期。';
COMMENT ON COLUMN public.tenant_service_orders.source_trial_id
  IS '未来试用转正式订单的来源事实；试用表建立前保持可空且暂不添加外键。';
COMMENT ON COLUMN public.tenant_service_orders.service_access_terminated_at
  IS '受控访问终止事实；service_status=canceled 本身不得用于移除服务访问。';
COMMENT ON FUNCTION public.platform_service_confirm_refund(
  uuid, text, text, bigint, timestamptz, uuid, jsonb
) IS '在微信全额退款成功后原子固化退款、访问终止、合同期重排和不可变工单事件；不支持部分退款。';

COMMIT;
