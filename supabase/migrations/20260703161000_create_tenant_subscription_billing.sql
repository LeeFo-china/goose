CREATE TABLE IF NOT EXISTS public.tenant_billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  period text NOT NULL DEFAULT 'monthly',
  monthly_fee_credits bigint NOT NULL,
  reminder_days_before_due integer NOT NULL DEFAULT 7,
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_plans_period_check CHECK (period = 'monthly'),
  CONSTRAINT tenant_billing_plans_fee_check CHECK (monthly_fee_credits > 0),
  CONSTRAINT tenant_billing_plans_reminder_check CHECK (reminder_days_before_due >= 0)
);

CREATE TABLE IF NOT EXISTS public.tenant_billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id),
  plan_id uuid NOT NULL REFERENCES public.tenant_billing_plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_start date NOT NULL,
  current_period_end date NOT NULL,
  next_charge_at timestamptz NOT NULL,
  locked_at timestamptz NULL,
  lock_reason text NULL,
  last_invoice_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_billing_subscriptions_status_check CHECK (
    status = ANY (ARRAY['active'::text, 'past_due'::text, 'locked'::text, 'canceled'::text])
  ),
  CONSTRAINT tenant_billing_subscriptions_period_check CHECK (
    current_period_end > current_period_start
  )
);

CREATE TABLE IF NOT EXISTS public.tenant_subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  subscription_id uuid NOT NULL REFERENCES public.tenant_billing_subscriptions(id),
  plan_id uuid NOT NULL REFERENCES public.tenant_billing_plans(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_at timestamptz NOT NULL,
  amount_credits bigint NOT NULL,
  status text NOT NULL DEFAULT 'upcoming',
  reminder_due_at timestamptz NOT NULL,
  reminded_at timestamptz NULL,
  paid_at timestamptz NULL,
  ledger_id uuid NULL REFERENCES public.tenant_credit_ledger(id),
  failure_code text NULL,
  failure_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_subscription_invoices_amount_check CHECK (amount_credits > 0),
  CONSTRAINT tenant_subscription_invoices_status_check CHECK (
    status = ANY (
      ARRAY[
        'upcoming'::text,
        'reminded'::text,
        'paid'::text,
        'past_due'::text,
        'failed'::text,
        'void'::text
      ]
    )
  ),
  CONSTRAINT tenant_subscription_invoices_period_check CHECK (
    period_end > period_start
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscription_invoices_tenant_period_unique_idx
ON public.tenant_subscription_invoices(tenant_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS tenant_subscription_invoices_due_status_idx
ON public.tenant_subscription_invoices(status, due_at);

CREATE INDEX IF NOT EXISTS tenant_subscription_invoices_tenant_status_idx
ON public.tenant_subscription_invoices(tenant_id, status, due_at DESC);

CREATE INDEX IF NOT EXISTS tenant_billing_subscriptions_status_next_charge_idx
ON public.tenant_billing_subscriptions(status, next_charge_at);

DROP TRIGGER IF EXISTS tr_tenant_billing_plans_updated_at ON public.tenant_billing_plans;
CREATE TRIGGER tr_tenant_billing_plans_updated_at
BEFORE UPDATE ON public.tenant_billing_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_billing_subscriptions_updated_at ON public.tenant_billing_subscriptions;
CREATE TRIGGER tr_tenant_billing_subscriptions_updated_at
BEFORE UPDATE ON public.tenant_billing_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tr_tenant_subscription_invoices_updated_at ON public.tenant_subscription_invoices;
CREATE TRIGGER tr_tenant_subscription_invoices_updated_at
BEFORE UPDATE ON public.tenant_subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tenant_billing_plans (
  code,
  name,
  period,
  monthly_fee_credits,
  reminder_days_before_due,
  enabled,
  version
)
VALUES (
  'system_monthly_1000',
  '系统月度使用费',
  'monthly',
  1000,
  7,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;

DROP FUNCTION IF EXISTS public.billing_charge_credits(uuid, bigint, text, text, text, uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.billing_charge_credits(
  p_tenant_id uuid,
  p_change_credits bigint,
  p_event_type text,
  p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_correlation_id uuid DEFAULT NULL,
  p_pricing_snapshot jsonb DEFAULT '{}'::jsonb,
  p_remark text DEFAULT NULL,
  p_operator_user_id uuid DEFAULT NULL
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
    remark,
    operator_user_id
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
    p_remark,
    p_operator_user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_ledger;

  IF v_ledger.id IS NULL AND p_source_type IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT *
    INTO v_ledger
    FROM public.tenant_credit_ledger
    WHERE tenant_id = p_tenant_id
      AND source_type = p_source_type
      AND source_id = p_source_id
      AND event_type = p_event_type
    LIMIT 1;
  END IF;

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

CREATE OR REPLACE FUNCTION public.billing_charge_subscription_invoice(
  p_invoice_id uuid,
  p_operator_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.tenant_subscription_invoices%ROWTYPE;
  v_subscription public.tenant_billing_subscriptions%ROWTYPE;
  v_charge_result jsonb;
  v_ledger_id uuid;
  v_failure_code text;
  v_failure_message text;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.tenant_subscription_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_INVOICE_NOT_FOUND';
  END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN jsonb_build_object(
      'invoice', to_jsonb(v_invoice),
      'ledger_id', v_invoice.ledger_id,
      'charged', false,
      'idempotent', true
    );
  END IF;

  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_INVOICE_VOID';
  END IF;

  SELECT *
  INTO v_subscription
  FROM public.tenant_billing_subscriptions
  WHERE id = v_invoice.subscription_id
  FOR UPDATE;

  IF NOT FOUND OR v_subscription.status = 'canceled' THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_NOT_ACTIVE';
  END IF;

  BEGIN
    SELECT public.billing_charge_credits(
      p_tenant_id => v_invoice.tenant_id,
      p_change_credits => v_invoice.amount_credits,
      p_event_type => 'subscription_monthly_fee',
      p_source_type => 'tenant_subscription_invoice',
      p_source_id => v_invoice.id::text,
      p_correlation_id => NULL,
      p_pricing_snapshot => jsonb_build_object(
        'plan_id', v_invoice.plan_id,
        'period_start', v_invoice.period_start,
        'period_end', v_invoice.period_end
      ),
      p_remark => '系统月度使用费',
      p_operator_user_id => p_operator_user_id
    )
    INTO v_charge_result;
  EXCEPTION WHEN OTHERS THEN
    v_failure_code := SQLERRM;
    v_failure_message := SQLERRM;

    UPDATE public.tenant_subscription_invoices
    SET
      status = CASE
        WHEN v_failure_code = 'TENANT_CREDITS_INSUFFICIENT' THEN 'past_due'
        ELSE 'failed'
      END,
      failure_code = v_failure_code,
      failure_message = v_failure_message
    WHERE id = v_invoice.id
    RETURNING * INTO v_invoice;

    UPDATE public.tenant_billing_subscriptions
    SET
      status = 'locked',
      locked_at = now(),
      lock_reason = 'credits_insufficient',
      last_invoice_id = v_invoice.id
    WHERE id = v_subscription.id
    RETURNING * INTO v_subscription;

    RETURN jsonb_build_object(
      'invoice', to_jsonb(v_invoice),
      'subscription', to_jsonb(v_subscription),
      'charged', false,
      'failure_code', v_failure_code
    );
  END;

  v_ledger_id := (v_charge_result->'ledger'->>'id')::uuid;

  UPDATE public.tenant_subscription_invoices
  SET
    status = 'paid',
    paid_at = now(),
    ledger_id = v_ledger_id,
    failure_code = NULL,
    failure_message = NULL
  WHERE id = v_invoice.id
  RETURNING * INTO v_invoice;

  UPDATE public.tenant_billing_subscriptions
  SET
    status = 'active',
    locked_at = NULL,
    lock_reason = NULL,
    last_invoice_id = v_invoice.id,
    current_period_start = v_invoice.period_end,
    current_period_end = (v_invoice.period_end + interval '1 month')::date,
    next_charge_at = v_invoice.period_end::timestamptz + interval '1 month'
  WHERE id = v_subscription.id
  RETURNING * INTO v_subscription;

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'subscription', to_jsonb(v_subscription),
    'ledger_id', v_ledger_id,
    'charged', true,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_recover_subscription_after_recharge(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.tenant_subscription_invoices%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.tenant_subscription_invoices
  WHERE tenant_id = p_tenant_id
    AND status = ANY (ARRAY['past_due'::text, 'failed'::text])
  ORDER BY due_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'recovered', false,
      'reason', 'no_past_due_invoice'
    );
  END IF;

  SELECT public.billing_charge_subscription_invoice(v_invoice.id, NULL)
  INTO v_result;

  RETURN v_result || jsonb_build_object(
    'recovered',
    coalesce((v_result->>'charged')::boolean, false)
  );
END;
$$;
