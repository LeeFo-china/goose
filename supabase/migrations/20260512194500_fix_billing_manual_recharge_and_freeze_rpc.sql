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
  RETURNING * INTO v_ledger;

  SELECT *
  INTO v_account_balance
  FROM public.tenant_credit_account_balances
  WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'account', to_jsonb(v_account_balance),
    'ledger', to_jsonb(v_ledger),
    'idempotent', false
  );
END;
$$;
