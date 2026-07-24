-- Atomically transitions a tenant applyment into platform review and records
-- the matching audit event. A retry after commit returns idempotently, while an
-- event insert failure rolls the status transition back with the transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_tenant_wechat_pay_applyment(
  p_applyment_id uuid,
  p_tenant_id uuid,
  p_employee_id uuid,
  p_idempotency_key uuid,
  p_expected_updated_at timestamptz,
  p_remark text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_applyment public.tenant_wechat_pay_applyments%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.role() <> 'service_role' OR auth.role() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_TENANT_SUBMIT_FORBIDDEN';
  END IF;

  IF p_applyment_id IS NULL OR p_tenant_id IS NULL OR
     p_employee_id IS NULL OR p_idempotency_key IS NULL OR
     p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_TENANT_SUBMIT_INVALID';
  END IF;

  IF p_idempotency_key IS DISTINCT FROM p_applyment_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_IDEMPOTENCY_MISMATCH';
  END IF;

  SELECT applyment.*
  INTO v_applyment
  FROM public.tenant_wechat_pay_applyments AS applyment
  WHERE applyment.id = p_applyment_id
    AND applyment.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_FOUND';
  END IF;

  IF v_applyment.status IN ('draft', 'rejected', 'wechat_editing') THEN
    IF v_applyment.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'WECHAT_PAY_APPLYMENT_STATE_CHANGED';
    END IF;

    UPDATE public.tenant_wechat_pay_applyments
    SET
      status = 'submitted',
      applyment_state = 'submitted',
      submitted_at = v_now,
      rejected_at = NULL,
      rejected_reason = NULL,
      remark = COALESCE(p_remark, remark),
      updated_by_employee_id = p_employee_id,
      updated_at = v_now
    WHERE id = v_applyment.id;

    INSERT INTO public.tenant_wechat_pay_applyment_events (
      tenant_id,
      applyment_id,
      event_type,
      from_status,
      to_status,
      message,
      operator_employee_id,
      metadata
    )
    VALUES (
      v_applyment.tenant_id,
      v_applyment.id,
      'submitted',
      v_applyment.status,
      'submitted',
      '租户提交微信支付开通申请',
      p_employee_id,
      jsonb_build_object('idempotency_key', p_idempotency_key)
    );

    RETURN 'submitted';
  END IF;

  IF v_applyment.submitted_at IS NOT NULL THEN
    RETURN 'idempotent';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'WECHAT_PAY_APPLYMENT_NOT_EDITABLE';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tenant_wechat_pay_applyment(
  uuid, uuid, uuid, uuid, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_wechat_pay_applyment(
  uuid, uuid, uuid, uuid, timestamptz, text
) TO service_role;

COMMENT ON FUNCTION public.submit_tenant_wechat_pay_applyment(
  uuid, uuid, uuid, uuid, timestamptz, text
) IS '原子提交租户微信支付进件草稿并记录一次 submitted 审计事件；已提交重试幂等返回。';

COMMIT;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.submit_tenant_wechat_pay_applyment(
--   uuid, uuid, uuid, uuid, timestamptz, text
-- );
