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
  ORDER BY due_at ASC, id ASC
  LIMIT 1
  FOR UPDATE;

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

REVOKE ALL ON FUNCTION public.billing_recover_subscription_after_recharge(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_recover_subscription_after_recharge(uuid)
TO service_role;

CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  p_order_id uuid,
  p_transaction_id text,
  p_paid_amount_fen integer,
  p_paid_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmation jsonb;
  v_recovery jsonb;
  v_tenant_id uuid;
  v_recovery_invoice public.tenant_subscription_invoices%ROWTYPE;
  v_recovery_subscription public.tenant_billing_subscriptions%ROWTYPE;
BEGIN
  SELECT orders.tenant_id
  INTO v_tenant_id
  FROM public.tenant_credit_orders AS orders
  WHERE orders.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BILLING_RECHARGE_ORDER_NOT_FOUND';
  END IF;

  -- 与 billing_charge_subscription_invoice 保持 invoice -> subscription
  -- -> credit account 的唯一锁顺序，避免充值确认与月费扣款互相等待。
  SELECT invoices.*
  INTO v_recovery_invoice
  FROM public.tenant_subscription_invoices AS invoices
  WHERE invoices.tenant_id = v_tenant_id
    AND invoices.status = ANY (ARRAY['past_due'::text, 'failed'::text])
  ORDER BY invoices.due_at ASC, invoices.id ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT subscriptions.*
    INTO v_recovery_subscription
    FROM public.tenant_billing_subscriptions AS subscriptions
    WHERE subscriptions.id = v_recovery_invoice.subscription_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_SUBSCRIPTION_NOT_ACTIVE';
    END IF;
  END IF;

  SELECT public.billing_confirm_wechat_recharge(
    p_order_id,
    p_transaction_id,
    p_paid_amount_fen,
    p_paid_at,
    p_notification_id,
    p_metadata
  )
  INTO v_confirmation;

  SELECT public.billing_recover_subscription_after_recharge(v_tenant_id)
  INTO v_recovery;

  RETURN v_confirmation || jsonb_build_object('recovery', v_recovery);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_confirm_wechat_recharge(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM service_role;

REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) TO service_role;

COMMENT ON FUNCTION public.billing_confirm_wechat_recharge_and_recover(
  uuid, text, integer, timestamptz, uuid, jsonb
) IS '在同一事务中确认微信充值入账并恢复该订单租户的订阅。';
