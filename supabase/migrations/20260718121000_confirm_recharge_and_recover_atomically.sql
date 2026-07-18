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
BEGIN
  SELECT public.billing_confirm_wechat_recharge(
    p_order_id,
    p_transaction_id,
    p_paid_amount_fen,
    p_paid_at,
    p_notification_id,
    p_metadata
  )
  INTO v_confirmation;

  v_tenant_id := nullif(
    v_confirmation->'order'->>'tenant_id',
    ''
  )::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'BILLING_RECHARGE_CONFIRMATION_TENANT_REQUIRED';
  END IF;

  SELECT public.billing_recover_subscription_after_recharge(v_tenant_id)
  INTO v_recovery;

  RETURN v_confirmation || jsonb_build_object('recovery', v_recovery);
END;
$$;

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
