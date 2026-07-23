-- Rollback:
-- UPDATE public.tenant_wechat_pay_applyments
-- SET merchant_short_name = application_no
-- WHERE merchant_short_name IS NULL;
-- ALTER TABLE public.tenant_wechat_pay_applyments
--   ALTER COLUMN merchant_short_name SET NOT NULL;
-- COMMENT ON COLUMN public.tenant_wechat_pay_applyments.merchant_short_name
-- IS NULL;

-- The existing CHECK evaluates to UNKNOWN for NULL and still rejects blank
-- strings, so keep it to avoid a full-table revalidation and extra DDL locks.

ALTER TABLE public.tenant_wechat_pay_applyments
  ALTER COLUMN merchant_short_name DROP NOT NULL;

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.merchant_short_name
IS '商户简称；草稿阶段可为空，正式提交前由 readiness 强制要求';
