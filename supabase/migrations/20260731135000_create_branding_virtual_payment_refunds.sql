-- Brand entitlement virtual-payment refunds and entitlement reversal facts.
-- This migration intentionally depends only on migrations through 20260731134000.
-- The later message inbox integration uses the official iOS inquiry event:
-- xpay_subscribe_ios_refund_query_notify.

ALTER TABLE public.tenant_entitlements
  DROP CONSTRAINT tenant_entitlements_term_check,
  ADD CONSTRAINT tenant_entitlements_term_check
    CHECK (expires_at >= starts_at);

ALTER TABLE public.tenant_entitlement_events
  ADD COLUMN reverses_event_id uuid NULL
    REFERENCES public.tenant_entitlement_events(id) ON DELETE RESTRICT,
  DROP CONSTRAINT tenant_entitlement_events_event_type_check,
  ADD CONSTRAINT tenant_entitlement_events_event_type_check
    CHECK (
      event_type IN (
        'granted', 'renewed', 'suspended', 'resumed', 'expired', 'revoked',
        'refunded'
      )
    ),
  DROP CONSTRAINT tenant_entitlement_events_source_type_check,
  ADD CONSTRAINT tenant_entitlement_events_source_type_check
    CHECK (source_type IN ('manual_grant', 'purchase', 'system', 'refund')),
  ADD CONSTRAINT tenant_entitlement_events_refund_reversal_check
    CHECK (
      (
        event_type = 'refunded'
        AND source_type = 'refund'
        AND source_id IS NOT NULL
        AND reverses_event_id IS NOT NULL
      )
      OR (
        event_type <> 'refunded'
        AND source_type <> 'refund'
        AND reverses_event_id IS NULL
      )
    );

CREATE UNIQUE INDEX tenant_entitlement_events_reverses_event_unique_idx
ON public.tenant_entitlement_events(reverses_event_id)
WHERE reverses_event_id IS NOT NULL;

CREATE TABLE public.tenant_virtual_addon_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_no text NOT NULL UNIQUE,
  order_id uuid NOT NULL UNIQUE
    REFERENCES public.tenant_virtual_addon_orders(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  reason text NOT NULL CHECK (
    btrim(reason) <> '' AND char_length(reason) <= 500
  ),
  evidence_summary text NOT NULL DEFAULT '' CHECK (
    char_length(evidence_summary) <= 1000
  ),
  request_source text NOT NULL CHECK (
    request_source IN ('platform_admin', 'apple_notification')
  ),
  requested_by uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  reviewed_by uuid NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  platform_mode text NOT NULL CHECK (
    platform_mode IN ('merchant_initiated', 'apple_external')
  ),
  status text NOT NULL CHECK (
    status IN (
      'reviewing', 'submitted', 'external_required', 'succeeded', 'failed',
      'rejected'
    )
  ),
  provider_refund_id text NULL UNIQUE CHECK (
    provider_refund_id IS NULL
    OR (btrim(provider_refund_id) <> '' AND char_length(provider_refund_id) <= 128)
  ),
  provider_refund_no text NULL UNIQUE CHECK (
    provider_refund_no IS NULL OR (
      btrim(provider_refund_no) <> '' AND char_length(provider_refund_no) <= 64
    )
  ),
  provider_refund_transaction_id text NULL UNIQUE CHECK (
    provider_refund_transaction_id IS NULL
    OR (
      btrim(provider_refund_transaction_id) <> ''
      AND char_length(provider_refund_transaction_id) <= 128
    )
  ),
  provider_request_id text NULL CHECK (
    provider_request_id IS NULL OR char_length(provider_request_id) <= 128
  ),
  apple_receipt_hash text NULL CHECK (
    apple_receipt_hash IS NULL OR apple_receipt_hash ~ '^[0-9a-f]{64}$'
  ),
  purchase_entitlement_event_id uuid NOT NULL
    REFERENCES public.tenant_entitlement_events(id) ON DELETE RESTRICT,
  compensation_entitlement_event_id uuid NULL UNIQUE
    REFERENCES public.tenant_entitlement_events(id) ON DELETE RESTRICT,
  provider_refund_started_at timestamptz NULL,
  provider_refund_succeeded_at timestamptz NULL,
  submitted_at timestamptz NULL,
  succeeded_at timestamptz NULL,
  failed_at timestamptz NULL,
  rejected_at timestamptz NULL,
  last_error_code text NULL CHECK (
    last_error_code IS NULL
    OR (btrim(last_error_code) <> '' AND char_length(last_error_code) <= 100)
  ),
  last_error_summary text NULL CHECK (
    last_error_summary IS NULL
    OR (btrim(last_error_summary) <> '' AND char_length(last_error_summary) <= 500)
  ),
  compensation_status text NOT NULL DEFAULT 'pending' CHECK (
    compensation_status IN ('pending', 'succeeded', 'failed')
  ),
  compensation_last_error text NULL CHECK (
    compensation_last_error IS NULL
    OR (
      btrim(compensation_last_error) <> ''
      AND char_length(compensation_last_error) <= 500
    )
  ),
  reconcile_claim_token uuid NULL,
  reconcile_claim_expires_at timestamptz NULL,
  reconcile_attempt_count integer NOT NULL DEFAULT 0 CHECK (
    reconcile_attempt_count >= 0
  ),
  reconcile_next_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_virtual_addon_refunds_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT tenant_virtual_addon_refunds_request_actor_check CHECK (
    (
      request_source = 'platform_admin'
      AND requested_by IS NOT NULL
      AND reviewed_by IS NOT NULL
    )
    OR (
      request_source = 'apple_notification'
      AND requested_by IS NULL
      AND reviewed_by IS NULL
      AND platform_mode = 'apple_external'
    )
  ),
  CONSTRAINT tenant_virtual_addon_refunds_platform_status_check CHECK (
    (platform_mode = 'merchant_initiated' AND status <> 'external_required')
    OR (platform_mode = 'apple_external' AND status <> 'submitted')
  ),
  CONSTRAINT tenant_virtual_addon_refunds_terminal_timestamp_check CHECK (
    (status = 'succeeded' AND succeeded_at IS NOT NULL)
    OR (status = 'failed' AND failed_at IS NOT NULL)
    OR (status = 'rejected' AND rejected_at IS NOT NULL)
    OR status IN ('reviewing', 'submitted', 'external_required')
  ),
  CONSTRAINT tenant_virtual_addon_refunds_provider_time_check CHECK (
    provider_refund_succeeded_at IS NULL OR (
      status = 'succeeded'
      AND provider_refund_started_at IS NOT NULL
      AND provider_refund_succeeded_at >= provider_refund_started_at
    )
  ),
  CONSTRAINT tenant_virtual_addon_refunds_compensation_check CHECK (
    (
      compensation_status = 'succeeded'
      AND status = 'succeeded'
      AND compensation_entitlement_event_id IS NOT NULL
      AND compensation_last_error IS NULL
    )
    OR (
      compensation_status IN ('pending', 'failed')
      AND compensation_entitlement_event_id IS NULL
    )
  ),
  CONSTRAINT tenant_virtual_addon_refunds_claim_check CHECK (
    (reconcile_claim_token IS NULL AND reconcile_claim_expires_at IS NULL)
    OR (
      reconcile_claim_token IS NOT NULL
      AND reconcile_claim_expires_at IS NOT NULL
    )
  )
);

CREATE TRIGGER tr_tenant_virtual_addon_refunds_updated_at
BEFORE UPDATE ON public.tenant_virtual_addon_refunds
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX tenant_virtual_addon_refunds_pending_idx
ON public.tenant_virtual_addon_refunds(
  status, compensation_status, reconcile_next_at, created_at, id
)
WHERE status IN ('submitted', 'external_required', 'succeeded');

ALTER TABLE public.tenant_virtual_addon_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_virtual_addon_refunds FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_virtual_addon_refunds
FROM anon, authenticated, service_role;

INSERT INTO public.permissions (
  code, name, module, resource, action, description, status
)
VALUES (
  'platform.branding_virtual_refund.manage',
  '管理品牌权益虚拟支付退款',
  'platform_branding',
  'branding_virtual_refund',
  'manage',
  '审核并跟踪品牌权益虚拟支付退款',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code = 'platform.branding_virtual_refund.manage'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE OR REPLACE FUNCTION public.branding_create_virtual_addon_refund(
  p_order_id uuid,
  p_idempotency_key uuid,
  p_reason text,
  p_evidence_summary text,
  p_requested_by uuid
)
RETURNS SETOF public.tenant_virtual_addon_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_existing public.tenant_virtual_addon_refunds%ROWTYPE;
  v_refund public.tenant_virtual_addon_refunds%ROWTYPE;
  v_actor_tenant_id uuid;
  v_actor_user_id uuid;
  v_platform_mode text;
BEGIN
  IF p_order_id IS NULL OR p_idempotency_key IS NULL OR p_requested_by IS NULL
    OR p_reason IS NULL OR btrim(p_reason) = ''
    OR char_length(p_reason) > 500
    OR p_evidence_summary IS NULL OR char_length(p_evidence_summary) > 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;

  SELECT employees.tenant_id, employees.user_id
  INTO v_actor_tenant_id, v_actor_user_id
  FROM public.employees
  WHERE employees.id = p_requested_by
    AND employees.status = 'active';
  IF NOT FOUND OR v_actor_tenant_id IS NOT NULL OR v_actor_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ACTOR_INVALID';
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ORDER_NOT_FOUND';
  END IF;

  SELECT refunds.* INTO v_existing
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE refunds.tenant_id = v_order.tenant_id
    AND refunds.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.order_id <> p_order_id
      OR v_existing.reason <> btrim(p_reason)
      OR v_existing.evidence_summary <> btrim(p_evidence_summary)
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_REFUND_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN NEXT v_existing;
    RETURN;
  END IF;
  IF v_order.payment_status <> 'succeeded'
    OR v_order.fulfillment_status <> 'granted'
    OR v_order.entitlement_event_id IS NULL
    OR v_order.paid_amount_fen IS DISTINCT FROM v_order.amount_fen
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ORDER_NOT_REFUNDABLE';
  END IF;
  IF v_order.refund_status <> 'none' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ALREADY_EXISTS';
  END IF;
  IF v_order.requested_platform NOT IN ('android', 'harmony', 'windows', 'ios')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_PLATFORM_UNSUPPORTED';
  END IF;

  v_platform_mode := CASE WHEN v_order.requested_platform = 'ios'
    THEN 'apple_external' ELSE 'merchant_initiated' END;

  INSERT INTO public.tenant_virtual_addon_refunds (
    refund_no, order_id, tenant_id, idempotency_key, amount_fen, reason,
    evidence_summary, request_source, requested_by, reviewed_by,
    platform_mode, status, purchase_entitlement_event_id, reconcile_next_at
  ) VALUES (
    'BVR' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)),
    v_order.id, v_order.tenant_id, p_idempotency_key, v_order.amount_fen,
    btrim(p_reason), btrim(p_evidence_summary), 'platform_admin',
    p_requested_by, p_requested_by, v_platform_mode,
    CASE WHEN v_platform_mode = 'apple_external'
      THEN 'external_required' ELSE 'reviewing' END,
    v_order.entitlement_event_id,
    CASE WHEN v_platform_mode = 'apple_external' THEN clock_timestamp() ELSE NULL END
  ) RETURNING * INTO v_refund;

  UPDATE public.tenant_virtual_addon_orders
  SET refund_status = 'reviewing'
  WHERE id = v_order.id AND refund_status = 'none';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT';
  END IF;
  IF v_refund.status = 'external_required' THEN
    UPDATE public.tenant_virtual_addon_orders
    SET refund_status = 'external_required'
    WHERE id = v_order.id AND refund_status = 'reviewing';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT';
    END IF;
  END IF;

  RETURN NEXT v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_claim_virtual_addon_refund_submission(
  p_refund_id uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.tenant_virtual_addon_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_refund public.tenant_virtual_addon_refunds%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_refund_id IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;
  SELECT refunds.* INTO v_refund
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE refunds.id = p_refund_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_NOT_FOUND';
  END IF;
  v_now := clock_timestamp();
  IF v_refund.status <> 'reviewing'
    OR v_refund.platform_mode <> 'merchant_initiated'
    OR (
      v_refund.reconcile_claim_token IS NOT NULL
      AND v_refund.reconcile_claim_expires_at > v_now
    )
  THEN
    RETURN;
  END IF;
  UPDATE public.tenant_virtual_addon_refunds
  SET reconcile_claim_token = gen_random_uuid(),
      reconcile_claim_expires_at = v_now + make_interval(secs => p_lease_seconds),
      reconcile_attempt_count = reconcile_attempt_count + 1,
      version = version + 1
  WHERE id = p_refund_id
    AND status = 'reviewing'
    AND (
      reconcile_claim_token IS NULL OR reconcile_claim_expires_at <= v_now
    )
  RETURNING * INTO v_refund;
  IF FOUND THEN RETURN NEXT v_refund; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_renew_virtual_addon_refund_submission_claim(
  p_refund_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz;
BEGIN
  IF p_refund_id IS NULL OR p_claim_token IS NULL
    OR p_lease_seconds < 30 OR p_lease_seconds > 600
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;
  PERFORM 1 FROM public.tenant_virtual_addon_refunds
  WHERE id = p_refund_id FOR UPDATE;
  v_now := clock_timestamp();
  UPDATE public.tenant_virtual_addon_refunds
  SET reconcile_claim_expires_at = v_now + make_interval(secs => p_lease_seconds)
  WHERE id = p_refund_id
    AND status = 'reviewing'
    AND reconcile_claim_token = p_claim_token
    AND reconcile_claim_expires_at > v_now;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_release_virtual_addon_refund_submission_claim(
  p_refund_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_refund_id IS NULL OR p_claim_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;
  UPDATE public.tenant_virtual_addon_refunds
  SET reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL
  WHERE id = p_refund_id
    AND status = 'reviewing'
    AND reconcile_claim_token = p_claim_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_mark_virtual_addon_refund_submitted(
  p_refund_id uuid,
  p_claim_token uuid,
  p_provider_refund_id text,
  p_provider_request_id text
)
RETURNS SETOF public.tenant_virtual_addon_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_refund public.tenant_virtual_addon_refunds%ROWTYPE;
BEGIN
  IF p_refund_id IS NULL OR p_claim_token IS NULL
    OR p_provider_refund_id IS NULL OR btrim(p_provider_refund_id) = ''
    OR char_length(p_provider_refund_id) > 128
    OR (p_provider_request_id IS NOT NULL AND char_length(p_provider_request_id) > 128)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;

  SELECT refunds.* INTO v_refund
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE refunds.id = p_refund_id
  FOR UPDATE;
  IF NOT FOUND OR v_refund.platform_mode <> 'merchant_initiated' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_STATE_CONFLICT';
  END IF;
  IF v_refund.status = 'submitted' THEN
    IF v_refund.provider_refund_id <> p_provider_refund_id THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_REFUND_PROVIDER_CONFLICT';
    END IF;
    RETURN NEXT v_refund;
    RETURN;
  END IF;
  IF v_refund.status <> 'reviewing'
    OR v_refund.reconcile_claim_token <> p_claim_token
    OR v_refund.reconcile_claim_expires_at <= clock_timestamp()
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_STATE_CONFLICT';
  END IF;

  UPDATE public.tenant_virtual_addon_refunds
  SET status = 'submitted', provider_refund_no = refund_no,
      provider_refund_id = btrim(p_provider_refund_id),
      provider_request_id = NULLIF(btrim(p_provider_request_id), ''),
      submitted_at = clock_timestamp(), reconcile_next_at = clock_timestamp(),
      last_error_code = NULL, last_error_summary = NULL,
      reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL,
      version = version + 1
  WHERE id = p_refund_id
  RETURNING * INTO v_refund;
  UPDATE public.tenant_virtual_addon_orders
  SET refund_status = 'submitted'
  WHERE id = v_refund.order_id AND refund_status = 'reviewing';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ORDER_STATE_CONFLICT';
  END IF;
  RETURN NEXT v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_compensate_virtual_addon_refund(
  p_refund_id uuid
)
RETURNS TABLE (
  refund_id uuid,
  compensation_status text,
  compensation_entitlement_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_refund public.tenant_virtual_addon_refunds%ROWTYPE;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_purchase_event public.tenant_entitlement_events%ROWTYPE;
  v_entitlement public.tenant_entitlements%ROWTYPE;
  v_reversal public.tenant_entitlement_events%ROWTYPE;
  v_old_value jsonb;
  v_reversed_expiry timestamptz;
BEGIN
  IF p_refund_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;
  SELECT refunds.* INTO v_refund
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE refunds.id = p_refund_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_NOT_FOUND';
  END IF;
  IF v_refund.status <> 'succeeded' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_NOT_SUCCEEDED';
  END IF;
  IF v_refund.compensation_status = 'succeeded' THEN
    RETURN QUERY SELECT v_refund.id, v_refund.compensation_status,
      v_refund.compensation_entitlement_event_id;
    RETURN;
  END IF;

  SELECT orders.* INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.id = v_refund.order_id
  FOR UPDATE;
  SELECT events.* INTO v_purchase_event
  FROM public.tenant_entitlement_events AS events
  WHERE events.id = v_refund.purchase_entitlement_event_id
  FOR UPDATE;
  SELECT entitlements.* INTO v_entitlement
  FROM public.tenant_entitlements AS entitlements
  WHERE entitlements.tenant_id = v_refund.tenant_id
    AND entitlements.entitlement_code = v_order.entitlement_code
  FOR UPDATE;

  IF v_order.id IS NULL OR v_purchase_event.id IS NULL OR v_entitlement.id IS NULL
    OR v_order.tenant_id <> v_refund.tenant_id
    OR v_order.entitlement_event_id <> v_purchase_event.id
    OR v_order.term_years <> 1
    OR v_purchase_event.source_type <> 'purchase'
    OR v_purchase_event.source_id <> v_order.id
    OR v_purchase_event.entitlement_id <> v_entitlement.id
    OR v_purchase_event.tenant_id <> v_refund.tenant_id
    OR v_purchase_event.entitlement_code <> v_entitlement.entitlement_code
    OR NOT (v_purchase_event.new_value ? 'expires_at')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_ENTITLEMENT_CHAIN_INVALID';
  END IF;

  SELECT events.* INTO v_reversal
  FROM public.tenant_entitlement_events AS events
  WHERE events.reverses_event_id = v_purchase_event.id;
  IF FOUND THEN
    IF v_reversal.source_type <> 'refund' OR v_reversal.source_id <> v_refund.id
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_REFUND_REVERSAL_CONFLICT';
    END IF;
    UPDATE public.tenant_virtual_addon_refunds
    SET compensation_status = 'succeeded',
        compensation_entitlement_event_id = v_reversal.id,
        compensation_last_error = NULL, reconcile_next_at = NULL,
        reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL,
        version = version + 1
    WHERE id = v_refund.id RETURNING * INTO v_refund;
    RETURN QUERY SELECT v_refund.id, v_refund.compensation_status,
      v_refund.compensation_entitlement_event_id;
    RETURN;
  END IF;

  v_old_value := to_jsonb(v_entitlement);
  v_reversed_expiry := v_entitlement.expires_at - interval '1 year';
  UPDATE public.tenant_entitlements
  SET expires_at = v_reversed_expiry,
      status = CASE
        WHEN status = 'active' AND v_reversed_expiry <= clock_timestamp()
          THEN 'expired'
        ELSE status
      END,
      version = version + 1,
      updated_by_employee_id = v_refund.reviewed_by
  WHERE id = v_entitlement.id
  RETURNING * INTO v_entitlement;

  INSERT INTO public.tenant_entitlement_events (
    entitlement_id, tenant_id, entitlement_code, event_type, source_type,
    source_id, reverses_event_id, old_value, new_value, reason,
    actor_employee_id, actor_user_id
  ) VALUES (
    v_entitlement.id, v_entitlement.tenant_id, v_entitlement.entitlement_code,
    'refunded', 'refund', v_refund.id, v_purchase_event.id, v_old_value,
    to_jsonb(v_entitlement), 'Annual branding virtual-payment refund compensated',
    v_refund.reviewed_by, NULL
  ) RETURNING * INTO v_reversal;

  UPDATE public.tenant_virtual_addon_refunds
  SET compensation_status = 'succeeded',
      compensation_entitlement_event_id = v_reversal.id,
      compensation_last_error = NULL, reconcile_next_at = NULL,
      reconcile_claim_token = NULL, reconcile_claim_expires_at = NULL,
      version = version + 1
  WHERE id = v_refund.id RETURNING * INTO v_refund;
  RETURN QUERY SELECT v_refund.id, v_refund.compensation_status,
    v_refund.compensation_entitlement_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_get_virtual_refund_order_context(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', orders.id,
    'tenant_id', orders.tenant_id,
    'out_trade_no', orders.out_trade_no,
    'environment', orders.environment,
    'requested_platform', orders.requested_platform,
    'payer_openid', orders.payer_openid,
    'provider_order_no', orders.provider_order_no,
    'payment_status', orders.payment_status,
    'fulfillment_status', orders.fulfillment_status,
    'refund_status', orders.refund_status,
    'amount_fen', orders.amount_fen,
    'paid_amount_fen', orders.paid_amount_fen,
    'paid_at', orders.paid_at,
    'entitlement_event_id', orders.entitlement_event_id,
    'secret_revision', orders.secret_revision,
    'created_by_user_id', employees.user_id
  )
  FROM public.tenant_virtual_addon_orders AS orders
  JOIN public.employees
    ON employees.id = orders.created_by
   AND employees.tenant_id = orders.tenant_id
  WHERE orders.id = p_order_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.branding_list_virtual_addon_refunds(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_status text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(1, COALESCE(p_page, 1));
  v_page_size integer := LEAST(100, GREATEST(1, COALESCE(p_page_size, 20)));
  v_total bigint;
  v_row record;
  v_returned integer := 0;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN (
    'reviewing', 'submitted', 'external_required', 'succeeded', 'failed',
    'rejected'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_INPUT_INVALID';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.tenant_virtual_addon_refunds AS refunds
  WHERE (p_status IS NULL OR refunds.status = p_status)
    AND (p_tenant_id IS NULL OR refunds.tenant_id = p_tenant_id);

  FOR v_row IN
    SELECT refunds.*, tenants.name AS tenant_name,
      orders.out_trade_no, orders.requested_platform, orders.environment,
      orders.product_name
    FROM public.tenant_virtual_addon_refunds AS refunds
    JOIN public.tenant_virtual_addon_orders AS orders
      ON orders.id = refunds.order_id
     AND orders.tenant_id = refunds.tenant_id
    JOIN public.tenants ON tenants.id = refunds.tenant_id
    WHERE (p_status IS NULL OR refunds.status = p_status)
      AND (p_tenant_id IS NULL OR refunds.tenant_id = p_tenant_id)
    ORDER BY refunds.created_at DESC, refunds.id DESC
    OFFSET (v_page - 1) * v_page_size
    LIMIT v_page_size
  LOOP
    v_returned := v_returned + 1;
    RETURN NEXT to_jsonb(v_row) || jsonb_build_object(
      'total_count', v_total,
      'count_only', false
    );
  END LOOP;

  IF v_returned = 0 THEN
    RETURN NEXT jsonb_build_object(
      'id', gen_random_uuid(),
      'refund_no', 'COUNTONLY',
      'order_id', gen_random_uuid(),
      'tenant_id', COALESCE(p_tenant_id, gen_random_uuid()),
      'idempotency_key', gen_random_uuid(),
      'amount_fen', 1,
      'reason', 'count_only',
      'evidence_summary', '',
      'request_source', 'platform_admin',
      'requested_by', NULL,
      'reviewed_by', NULL,
      'platform_mode', 'merchant_initiated',
      'status', 'reviewing',
      'provider_refund_id', NULL,
      'provider_refund_transaction_id', NULL,
      'provider_request_id', NULL,
      'apple_receipt_hash', NULL,
      'purchase_entitlement_event_id', gen_random_uuid(),
      'compensation_entitlement_event_id', NULL,
      'provider_refund_started_at', NULL,
      'submitted_at', NULL,
      'succeeded_at', NULL,
      'failed_at', NULL,
      'rejected_at', NULL,
      'last_error_code', NULL,
      'last_error_summary', NULL,
      'compensation_status', 'pending',
      'compensation_last_error', NULL,
      'reconcile_claim_token', NULL,
      'reconcile_claim_expires_at', NULL,
      'reconcile_attempt_count', 0,
      'reconcile_next_at', NULL,
      'version', 1,
      'created_at', clock_timestamp(),
      'updated_at', clock_timestamp(),
      'tenant_name', 'count_only',
      'out_trade_no', 'COUNTONLY',
      'requested_platform', 'android',
      'environment', 'production',
      'product_name', 'count_only',
      'total_count', v_total,
      'count_only', true
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_get_virtual_addon_refund_detail(
  p_refund_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT to_jsonb(refunds) || jsonb_build_object(
    'order', jsonb_build_object(
      'out_trade_no', orders.out_trade_no,
      'requested_platform', orders.requested_platform,
      'environment', orders.environment,
      'provider_order_no', orders.provider_order_no,
      'transaction_id', orders.transaction_id,
      'payment_status', orders.payment_status,
      'fulfillment_status', orders.fulfillment_status,
      'refund_status', orders.refund_status,
      'paid_amount_fen', orders.paid_amount_fen,
      'paid_at', orders.paid_at
    )
  )
  FROM public.tenant_virtual_addon_refunds AS refunds
  JOIN public.tenant_virtual_addon_orders AS orders ON orders.id = refunds.order_id
  WHERE refunds.id = p_refund_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_refund(
  uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_mark_virtual_addon_refund_submitted(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_claim_virtual_addon_refund_submission(
  uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_renew_virtual_addon_refund_submission_claim(
  uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_release_virtual_addon_refund_submission_claim(
  uuid, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_compensate_virtual_addon_refund(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_get_virtual_refund_order_context(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_list_virtual_addon_refunds(
  integer, integer, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branding_get_virtual_addon_refund_detail(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.branding_create_virtual_addon_refund(
  uuid, uuid, text, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_mark_virtual_addon_refund_submitted(
  uuid, uuid, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_claim_virtual_addon_refund_submission(
  uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_renew_virtual_addon_refund_submission_claim(
  uuid, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_release_virtual_addon_refund_submission_claim(
  uuid, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_compensate_virtual_addon_refund(uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_get_virtual_refund_order_context(uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_list_virtual_addon_refunds(
  integer, integer, text, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.branding_get_virtual_addon_refund_detail(uuid)
TO service_role;

COMMENT ON TABLE public.tenant_virtual_addon_refunds IS
  'Platform-reviewed virtual-payment refund facts with independent entitlement compensation.';
