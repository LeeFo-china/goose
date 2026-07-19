CREATE OR REPLACE FUNCTION public.billing_ensure_subscription_invoices(
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription record;
  v_invoice public.tenant_subscription_invoices%ROWTYPE;
  v_target_period_start date;
  v_target_period_end date;
  v_target_due_at timestamptz;
  v_limit integer;
  v_scanned integer := 0;
  v_created integer := 0;
BEGIN
  v_limit := greatest(1, least(coalesce(p_limit, 100), 100));

  FOR v_subscription IN
    SELECT
      s.id,
      s.tenant_id,
      s.plan_id,
      s.current_period_start,
      s.current_period_end,
      s.next_charge_at,
      p.monthly_fee_credits,
      p.reminder_days_before_due
    FROM public.tenant_billing_subscriptions s
    JOIN public.tenant_billing_plans p ON p.id = s.plan_id
    WHERE s.status = 'active'
      AND p.enabled = true
      AND s.current_period_end > s.current_period_start
    ORDER BY s.next_charge_at ASC, s.created_at ASC
    LIMIT v_limit
  LOOP
    v_scanned := v_scanned + 1;

    SELECT *
    INTO v_invoice
    FROM public.tenant_subscription_invoices
    WHERE tenant_id = v_subscription.tenant_id
      AND period_start = v_subscription.current_period_start
      AND period_end = v_subscription.current_period_end
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_invoice.id IS NOT NULL AND v_invoice.status <> 'paid' THEN
      v_invoice := NULL;
      CONTINUE;
    END IF;

    IF v_invoice.id IS NOT NULL AND v_invoice.status = 'paid' THEN
      v_target_period_start := v_subscription.current_period_end;
      v_target_period_end := (v_subscription.current_period_end + interval '1 month')::date;
      v_target_due_at := v_subscription.current_period_end::timestamptz;
      v_invoice := NULL;
    ELSE
      v_target_period_start := v_subscription.current_period_start;
      v_target_period_end := v_subscription.current_period_end;
      v_target_due_at := v_subscription.next_charge_at;
    END IF;

    INSERT INTO public.tenant_subscription_invoices (
      tenant_id,
      subscription_id,
      plan_id,
      period_start,
      period_end,
      due_at,
      amount_credits,
      status,
      reminder_due_at,
      metadata
    )
    VALUES (
      v_subscription.tenant_id,
      v_subscription.id,
      v_subscription.plan_id,
      v_target_period_start,
      v_target_period_end,
      v_target_due_at,
      v_subscription.monthly_fee_credits,
      'upcoming',
      v_target_due_at -
        make_interval(days => greatest(coalesce(v_subscription.reminder_days_before_due, 0), 0)),
      jsonb_build_object(
        'source', 'billing_ensure_subscription_invoices',
        'ensured_at', p_now
      )
    )
    ON CONFLICT (tenant_id, period_start, period_end) DO NOTHING
    RETURNING * INTO v_invoice;

    IF v_invoice.id IS NOT NULL THEN
      v_created := v_created + 1;
      v_invoice := NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'scanned', v_scanned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_ensure_subscription_invoices(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_ensure_subscription_invoices(timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.billing_ensure_subscription_invoices(timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_ensure_subscription_invoices(timestamptz, integer) TO service_role;

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_NOT_ACTIVE';
  END IF;

  IF v_subscription.tenant_id <> v_invoice.tenant_id THEN
    RAISE EXCEPTION 'TENANT_SUBSCRIPTION_INVOICE_TENANT_MISMATCH';
  END IF;

  IF v_subscription.status = 'canceled' THEN
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
    GET STACKED DIAGNOSTICS v_failure_code = MESSAGE_TEXT;
    v_failure_message := v_failure_code;

    IF v_failure_code <> 'TENANT_CREDITS_INSUFFICIENT' THEN
      RAISE;
    END IF;

    UPDATE public.tenant_subscription_invoices
    SET
      status = 'past_due',
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
    current_period_start = v_invoice.period_start,
    current_period_end = v_invoice.period_end,
    next_charge_at = v_invoice.period_end::timestamptz
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

REVOKE ALL ON FUNCTION public.billing_charge_subscription_invoice(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_charge_subscription_invoice(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.billing_charge_subscription_invoice(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_charge_subscription_invoice(uuid, uuid) TO service_role;
