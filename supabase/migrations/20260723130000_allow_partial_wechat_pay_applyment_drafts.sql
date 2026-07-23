-- Rollback:
-- UPDATE public.tenant_wechat_pay_applyments
-- SET merchant_short_name = application_no
-- WHERE merchant_short_name IS NULL;
-- ALTER TABLE public.tenant_wechat_pay_applyments
--   ALTER COLUMN merchant_short_name SET NOT NULL;

ALTER TABLE public.tenant_wechat_pay_applyments
  ALTER COLUMN merchant_short_name DROP NOT NULL;

ALTER TABLE public.tenant_wechat_pay_applyments
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_merchant_short_name_not_blank;

ALTER TABLE public.tenant_wechat_pay_applyments
  ADD CONSTRAINT tenant_wechat_pay_applyments_merchant_short_name_not_blank
  CHECK (
    merchant_short_name IS NULL OR
    btrim(merchant_short_name) <> ''
  );

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.merchant_short_name
IS '商户简称；草稿阶段可为空，正式提交前由 readiness 强制要求';
