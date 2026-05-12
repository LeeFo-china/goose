CREATE TABLE IF NOT EXISTS public.tenant_credit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  balance_credits bigint NOT NULL DEFAULT 0,
  frozen_credits bigint NOT NULL DEFAULT 0,
  total_recharged_credits bigint NOT NULL DEFAULT 0,
  total_consumed_credits bigint NOT NULL DEFAULT 0,
  total_granted_credits bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  is_test boolean NOT NULL DEFAULT false,
  expires_at timestamptz NULL,
  last_recharged_at timestamptz NULL,
  last_activity_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_accounts_non_negative_check CHECK (
    balance_credits >= 0
    AND frozen_credits >= 0
    AND frozen_credits <= balance_credits
  ),
  CONSTRAINT tenant_credit_accounts_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'disabled'::text])
  )
);

CREATE INDEX IF NOT EXISTS tenant_credit_accounts_status_idx
ON public.tenant_credit_accounts(status);

CREATE OR REPLACE VIEW public.tenant_credit_account_balances AS
SELECT
  account.*,
  greatest(account.balance_credits - account.frozen_credits, 0) AS available_credits
FROM public.tenant_credit_accounts account;

CREATE TABLE IF NOT EXISTS public.tenant_credit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_no text NOT NULL UNIQUE,
  idempotency_key text NULL UNIQUE,
  package_code text NULL,
  credits bigint NOT NULL,
  amount_fen integer NOT NULL,
  bonus_credits bigint NOT NULL DEFAULT 0,
  channel text NOT NULL,
  status text NOT NULL,
  paid_at timestamptz NULL,
  created_by uuid NULL,
  remark text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_orders_amount_check CHECK (
    credits > 0 AND amount_fen >= 0 AND bonus_credits >= 0
  ),
  CONSTRAINT tenant_credit_orders_channel_check CHECK (
    channel = ANY (ARRAY['manual'::text, 'wechat_pay'::text, 'alipay'::text, 'bank_transfer'::text])
  ),
  CONSTRAINT tenant_credit_orders_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'paid'::text, 'closed'::text, 'refunded'::text])
  )
);

CREATE INDEX IF NOT EXISTS tenant_credit_orders_tenant_created_idx
ON public.tenant_credit_orders(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_orders_status_created_idx
ON public.tenant_credit_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  account_id uuid NOT NULL REFERENCES public.tenant_credit_accounts(id),
  direction text NOT NULL,
  change_credits bigint NOT NULL,
  balance_after bigint NOT NULL,
  frozen_after bigint NOT NULL,
  event_type text NOT NULL,
  correlation_id uuid NULL,
  source_type text NULL,
  source_id text NULL,
  source_no text NULL,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NULL,
  operator_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_ledger_change_check CHECK (change_credits > 0),
  CONSTRAINT tenant_credit_ledger_after_check CHECK (
    balance_after >= 0
    AND frozen_after >= 0
    AND frozen_after <= balance_after
  ),
  CONSTRAINT tenant_credit_ledger_direction_check CHECK (
    direction = ANY (ARRAY['in'::text, 'out'::text, 'freeze'::text, 'unfreeze'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_ledger_source_event_unique_idx
ON public.tenant_credit_ledger(
  tenant_id,
  coalesce(source_type, ''),
  coalesce(source_id, ''),
  event_type
)
WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_credit_ledger_tenant_created_idx
ON public.tenant_credit_ledger(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_ledger_correlation_idx
ON public.tenant_credit_ledger(correlation_id)
WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  metric_code text NOT NULL,
  scene_code text NULL,
  provider text NULL,
  model text NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  source_sub_id text NULL,
  billable_units numeric(18, 6) NOT NULL,
  unit_name text NOT NULL,
  unit_price_credits numeric(18, 6) NOT NULL,
  credits bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  provider_request_id text NULL,
  pricing_rule_id uuid NULL,
  pricing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  settled_at timestamptz NULL,
  failure_code text NULL,
  failure_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_events_units_check CHECK (
    billable_units >= 0 AND unit_price_credits >= 0 AND credits >= 0
  ),
  CONSTRAINT tenant_billing_events_status_check CHECK (
    status = ANY (ARRAY['pending'::text, 'estimated'::text, 'charged'::text, 'waived'::text, 'refunded'::text, 'failed'::text])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_billing_events_source_unique_idx
ON public.tenant_billing_events(
  metric_code,
  source_type,
  source_id,
  coalesce(source_sub_id, '')
);

CREATE INDEX IF NOT EXISTS tenant_billing_events_tenant_created_idx
ON public.tenant_billing_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_events_status_created_idx
ON public.tenant_billing_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_events_metric_created_idx
ON public.tenant_billing_events(metric_code, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_group_id uuid NULL,
  version integer NOT NULL DEFAULT 1,
  tenant_id uuid NULL REFERENCES public.tenants(id),
  metric_code text NOT NULL,
  provider_code text NULL,
  model_code text NULL,
  scene_code text NULL,
  unit_name text NOT NULL,
  unit_price_credits numeric(18, 6) NOT NULL,
  min_charge_credits bigint NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_pricing_rules_price_check CHECK (
    unit_price_credits >= 0 AND min_charge_credits >= 0
  ),
  CONSTRAINT tenant_pricing_rules_window_check CHECK (
    expires_at IS NULL OR expires_at > effective_at
  )
);

CREATE INDEX IF NOT EXISTS tenant_pricing_rules_lookup_idx
ON public.tenant_pricing_rules(
  tenant_id,
  metric_code,
  provider_code,
  model_code,
  scene_code,
  enabled,
  priority,
  effective_at DESC
);

DROP TRIGGER IF EXISTS tr_tenant_credit_accounts_updated_at ON public.tenant_credit_accounts;
CREATE TRIGGER tr_tenant_credit_accounts_updated_at
BEFORE UPDATE ON public.tenant_credit_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_credit_orders_updated_at ON public.tenant_credit_orders;
CREATE TRIGGER tr_tenant_credit_orders_updated_at
BEFORE UPDATE ON public.tenant_credit_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_billing_events_updated_at ON public.tenant_billing_events;
CREATE TRIGGER tr_tenant_billing_events_updated_at
BEFORE UPDATE ON public.tenant_billing_events
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_pricing_rules_updated_at ON public.tenant_pricing_rules;
CREATE TRIGGER tr_tenant_pricing_rules_updated_at
BEFORE UPDATE ON public.tenant_pricing_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.tenant_pricing_rules (
  rule_group_id,
  version,
  tenant_id,
  metric_code,
  unit_name,
  unit_price_credits,
  min_charge_credits,
  enabled,
  priority
)
VALUES
  (gen_random_uuid(), 1, NULL, 'sms_domestic_success', 'message', 50, 50, true, 100),
  (gen_random_uuid(), 1, NULL, 'social_video_transcription_minute', 'minute', 60, 60, true, 100),
  (gen_random_uuid(), 1, NULL, 'ai_input_text_token', '1k_tokens', 10, 0, true, 100),
  (gen_random_uuid(), 1, NULL, 'ai_output_text_token', '1k_tokens', 50, 0, true, 100),
  (gen_random_uuid(), 1, NULL, 'ai_cached_input_token', '1k_tokens', 1, 0, true, 100)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.billing_ensure_account(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.tenant_credit_account_balances%ROWTYPE;
BEGIN
  INSERT INTO public.tenant_credit_accounts (tenant_id, last_activity_at)
  VALUES (p_tenant_id, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
  INTO v_account
  FROM public.tenant_credit_account_balances
  WHERE tenant_id = p_tenant_id;

  RETURN jsonb_build_object('account', to_jsonb(v_account));
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_manual_recharge(
  p_tenant_id uuid,
  p_amount_fen integer,
  p_credits bigint,
  p_bonus_credits bigint DEFAULT 0,
  p_operator_user_id uuid DEFAULT NULL,
  p_remark text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_order public.tenant_credit_orders%ROWTYPE;
  v_existing_order public.tenant_credit_orders%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
  v_total_credits bigint := p_credits + coalesce(p_bonus_credits, 0);
  v_order_no text;
BEGIN
  IF p_amount_fen < 0 OR p_credits <= 0 OR coalesce(p_bonus_credits, 0) < 0 THEN
    RAISE EXCEPTION 'INVALID_RECHARGE_AMOUNT';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT *
    INTO v_existing_order
    FROM public.tenant_credit_orders
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      SELECT *
      INTO v_account_balance
      FROM public.tenant_credit_account_balances
      WHERE tenant_id = v_existing_order.tenant_id;

      SELECT *
      INTO v_ledger
      FROM public.tenant_credit_ledger
      WHERE source_type = 'tenant_credit_order'
        AND source_id = v_existing_order.id::text
        AND event_type = 'manual_recharge'
      LIMIT 1;

      RETURN jsonb_build_object(
        'order', to_jsonb(v_existing_order),
        'account', to_jsonb(v_account_balance),
        'ledger', to_jsonb(v_ledger),
        'idempotent', true
      );
    END IF;
  END IF;

  INSERT INTO public.tenant_credit_accounts (tenant_id, last_activity_at)
  VALUES (p_tenant_id, now())
  ON CONFLICT (tenant_id) DO NOTHING;

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_account.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_BILLING_DISABLED';
  END IF;

  v_order_no := 'TC' || to_char(now(), 'YYYYMMDDHH24MISSMS') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.tenant_credit_orders (
    tenant_id,
    order_no,
    idempotency_key,
    credits,
    amount_fen,
    bonus_credits,
    channel,
    status,
    paid_at,
    created_by,
    remark,
    metadata
  )
  VALUES (
    p_tenant_id,
    v_order_no,
    p_idempotency_key,
    p_credits,
    p_amount_fen,
    coalesce(p_bonus_credits, 0),
    'manual',
    'paid',
    now(),
    p_operator_user_id,
    p_remark,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_order;

  UPDATE public.tenant_credit_accounts
  SET
    balance_credits = balance_credits + v_total_credits,
    total_recharged_credits = total_recharged_credits + p_credits,
    total_granted_credits = total_granted_credits + coalesce(p_bonus_credits, 0),
    last_recharged_at = now(),
    last_activity_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  INSERT INTO public.tenant_credit_ledger (
    tenant_id,
    account_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    source_type,
    source_id,
    source_no,
    remark,
    operator_user_id
  )
  VALUES (
    p_tenant_id,
    v_account.id,
    'in',
    v_total_credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    'manual_recharge',
    'tenant_credit_order',
    v_order.id::text,
    v_order.order_no,
    p_remark,
    p_operator_user_id
  )
  RETURNING * INTO v_ledger;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger),
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_freeze_credits(
  p_tenant_id uuid,
  p_change_credits bigint,
  p_event_type text,
  p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
BEGIN
  IF p_change_credits <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT';
  END IF;

  PERFORM public.billing_ensure_account(p_tenant_id);

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE tenant_id = p_tenant_id
      AND source_type = p_source_type
      AND source_id = p_source_id
      AND event_type = p_event_type
    LIMIT 1;

    IF FOUND THEN
      SELECT *
      INTO v_account_balance
      FROM public.tenant_credit_account_balances
      WHERE id = v_account.id;

      RETURN jsonb_build_object(
        'account', to_jsonb(v_account_balance),
        'ledger', to_jsonb(v_ledger),
        'idempotent', true
      );
    END IF;
  END IF;

  IF v_account.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_BILLING_DISABLED';
  END IF;

  IF v_account.balance_credits - v_account.frozen_credits < p_change_credits THEN
    RAISE EXCEPTION 'TENANT_CREDITS_INSUFFICIENT';
  END IF;

  UPDATE public.tenant_credit_accounts
  SET
    frozen_credits = frozen_credits + p_change_credits,
    last_activity_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  INSERT INTO public.tenant_credit_ledger (
    tenant_id,
    account_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    correlation_id,
    source_type,
    source_id,
    remark
  )
  VALUES (
    p_tenant_id,
    v_account.id,
    'freeze',
    p_change_credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    p_event_type,
    p_correlation_id,
    p_source_type,
    p_source_id,
    p_remark
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_ledger;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_unfreeze_credits(
  p_tenant_id uuid,
  p_change_credits bigint,
  p_event_type text,
  p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
  v_release_credits bigint;
BEGIN
  IF p_change_credits <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT';
  END IF;

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_BILLING_ACCOUNT_MISSING';
  END IF;

  IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE tenant_id = p_tenant_id
      AND source_type = p_source_type
      AND source_id = p_source_id
      AND event_type = p_event_type
    LIMIT 1;

    IF FOUND THEN
      SELECT *
      INTO v_account_balance
      FROM public.tenant_credit_account_balances
      WHERE id = v_account.id;

      RETURN jsonb_build_object(
        'account', to_jsonb(v_account_balance),
        'ledger', to_jsonb(v_ledger),
        'idempotent', true
      );
    END IF;
  END IF;

  v_release_credits := least(v_account.frozen_credits, p_change_credits);

  IF v_release_credits <= 0 THEN
    SELECT *
    INTO v_account_balance
    FROM public.tenant_credit_account_balances
    WHERE id = v_account.id;

    RETURN jsonb_build_object('account', to_jsonb(v_account_balance), 'ledger', NULL);
  END IF;

  UPDATE public.tenant_credit_accounts
  SET
    frozen_credits = frozen_credits - v_release_credits,
    last_activity_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  INSERT INTO public.tenant_credit_ledger (
    tenant_id,
    account_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    correlation_id,
    source_type,
    source_id,
    remark
  )
  VALUES (
    p_tenant_id,
    v_account.id,
    'unfreeze',
    v_release_credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    p_event_type,
    p_correlation_id,
    p_source_type,
    p_source_id,
    p_remark
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_ledger;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_charge_credits(
  p_tenant_id uuid,
  p_change_credits bigint,
  p_event_type text,
  p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_pricing_snapshot jsonb DEFAULT '{}'::jsonb,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
BEGIN
  IF p_change_credits <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT';
  END IF;

  PERFORM public.billing_ensure_account(p_tenant_id);

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE tenant_id = p_tenant_id
      AND source_type = p_source_type
      AND source_id = p_source_id
      AND event_type = p_event_type
    LIMIT 1;

    IF FOUND THEN
      SELECT *
      INTO v_account_balance
      FROM public.tenant_credit_account_balances
      WHERE id = v_account.id;

      RETURN jsonb_build_object(
        'account', to_jsonb(v_account_balance),
        'ledger', to_jsonb(v_ledger),
        'idempotent', true
      );
    END IF;
  END IF;

  IF v_account.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_BILLING_DISABLED';
  END IF;

  IF v_account.balance_credits - v_account.frozen_credits < p_change_credits THEN
    RAISE EXCEPTION 'TENANT_CREDITS_INSUFFICIENT';
  END IF;

  UPDATE public.tenant_credit_accounts
  SET
    balance_credits = balance_credits - p_change_credits,
    total_consumed_credits = total_consumed_credits + p_change_credits,
    last_activity_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  INSERT INTO public.tenant_credit_ledger (
    tenant_id,
    account_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    correlation_id,
    source_type,
    source_id,
    pricing_snapshot,
    remark
  )
  VALUES (
    p_tenant_id,
    v_account.id,
    'out',
    p_change_credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    p_event_type,
    p_correlation_id,
    p_source_type,
    p_source_id,
    coalesce(p_pricing_snapshot, '{}'::jsonb),
    p_remark
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_ledger;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_settle_event(
  p_billing_event_id uuid,
  p_correlation_id uuid DEFAULT NULL,
  p_operator_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.tenant_billing_events%ROWTYPE;
  v_account public.tenant_credit_accounts%ROWTYPE;
  v_account_balance public.tenant_credit_account_balances%ROWTYPE;
  v_ledger public.tenant_credit_ledger%ROWTYPE;
BEGIN
  SELECT *
  INTO v_event
  FROM public.tenant_billing_events
  WHERE id = p_billing_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_BILLING_EVENT_NOT_FOUND';
  END IF;

  IF v_event.status = 'charged' THEN
    SELECT *
    INTO v_account_balance
    FROM public.tenant_credit_account_balances
    WHERE tenant_id = v_event.tenant_id;

    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE source_type = 'tenant_billing_event'
      AND source_id = v_event.id::text
      AND event_type = 'billing_charge'
    LIMIT 1;

    RETURN jsonb_build_object(
      'event', to_jsonb(v_event),
      'account', to_jsonb(v_account_balance),
      'ledger', to_jsonb(v_ledger),
      'idempotent', true
    );
  END IF;

  IF v_event.status = ANY (ARRAY['waived'::text, 'refunded'::text]) THEN
    RAISE EXCEPTION 'TENANT_BILLING_EVENT_INVALID_STATUS';
  END IF;

  PERFORM public.billing_ensure_account(v_event.tenant_id);

  SELECT *
  INTO v_account
  FROM public.tenant_credit_accounts
  WHERE tenant_id = v_event.tenant_id
  FOR UPDATE;

  IF v_account.status <> 'active' THEN
    UPDATE public.tenant_billing_events
    SET
      status = 'failed',
      failure_code = 'TENANT_BILLING_DISABLED',
      failure_message = '租户计费账户已禁用'
    WHERE id = v_event.id
    RETURNING * INTO v_event;

    RETURN jsonb_build_object('event', to_jsonb(v_event), 'account', to_jsonb(v_account), 'ledger', NULL);
  END IF;

  IF v_account.is_test THEN
    UPDATE public.tenant_billing_events
    SET
      status = 'estimated',
      settled_at = NULL,
      failure_code = NULL,
      failure_message = NULL
    WHERE id = v_event.id
    RETURNING * INTO v_event;

    SELECT *
    INTO v_account_balance
    FROM public.tenant_credit_account_balances
    WHERE id = v_account.id;

    RETURN jsonb_build_object('event', to_jsonb(v_event), 'account', to_jsonb(v_account_balance), 'ledger', NULL);
  END IF;

  IF v_account.balance_credits - v_account.frozen_credits < v_event.credits THEN
    UPDATE public.tenant_billing_events
    SET
      status = 'failed',
      failure_code = 'TENANT_CREDITS_INSUFFICIENT',
      failure_message = '租户积分余额不足'
    WHERE id = v_event.id
    RETURNING * INTO v_event;

    SELECT *
    INTO v_account_balance
    FROM public.tenant_credit_account_balances
    WHERE id = v_account.id;

    RETURN jsonb_build_object('event', to_jsonb(v_event), 'account', to_jsonb(v_account_balance), 'ledger', NULL);
  END IF;

  UPDATE public.tenant_credit_accounts
  SET
    balance_credits = balance_credits - v_event.credits,
    total_consumed_credits = total_consumed_credits + v_event.credits,
    last_activity_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  INSERT INTO public.tenant_credit_ledger (
    tenant_id,
    account_id,
    direction,
    change_credits,
    balance_after,
    frozen_after,
    event_type,
    correlation_id,
    source_type,
    source_id,
    pricing_snapshot,
    operator_user_id
  )
  VALUES (
    v_event.tenant_id,
    v_account.id,
    'out',
    v_event.credits,
    v_account.balance_credits,
    v_account.frozen_credits,
    'billing_charge',
    p_correlation_id,
    'tenant_billing_event',
    v_event.id::text,
    v_event.pricing_snapshot,
    p_operator_user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_ledger;

  UPDATE public.tenant_billing_events
  SET
    status = 'charged',
    settled_at = now(),
    failure_code = NULL,
    failure_message = NULL
  WHERE id = v_event.id
  RETURNING * INTO v_event;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'event', to_jsonb(v_event),
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger),
    'idempotent', false
  );
END;
$$;

COMMENT ON TABLE public.tenant_credit_accounts IS '租户积分账户';
COMMENT ON VIEW public.tenant_credit_account_balances IS '租户积分账户余额视图，计算可用积分';
COMMENT ON TABLE public.tenant_credit_orders IS '租户积分充值订单';
COMMENT ON TABLE public.tenant_credit_ledger IS '租户积分总账流水';
COMMENT ON TABLE public.tenant_billing_events IS '租户业务计费事件';
COMMENT ON TABLE public.tenant_pricing_rules IS '租户计费价格规则';
