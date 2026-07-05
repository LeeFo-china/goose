-- Align tenant WeChat Pay applyments with official bank_account_info fields.
-- The raw bank account number is intentionally not persisted here; backend
-- only stores the masked display value until real WeChat Pay API encryption is
-- wired to a secret boundary.

ALTER TABLE public.tenant_wechat_pay_applyments
  ADD COLUMN IF NOT EXISTS settlement_account_type text NULL,
  ADD COLUMN IF NOT EXISTS settlement_account_number_masked text NULL,
  ADD COLUMN IF NOT EXISTS settlement_bank_full_name text NULL,
  ADD COLUMN IF NOT EXISTS settlement_bank_branch_id text NULL;

ALTER TABLE public.tenant_wechat_pay_applyments
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_settlement_account_type_check,
  ADD CONSTRAINT tenant_wechat_pay_applyments_settlement_account_type_check
  CHECK (
    settlement_account_type IS NULL OR
    settlement_account_type IN (
      'BANK_ACCOUNT_TYPE_CORPORATE',
      'BANK_ACCOUNT_TYPE_PERSONAL'
    )
  );

ALTER TABLE public.tenant_wechat_pay_applyments
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_settlement_account_number_masked_not_blank,
  ADD CONSTRAINT tenant_wechat_pay_applyments_settlement_account_number_masked_not_blank
  CHECK (
    settlement_account_number_masked IS NULL OR
    btrim(settlement_account_number_masked) <> ''
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_settlement_bank_full_name_not_blank,
  ADD CONSTRAINT tenant_wechat_pay_applyments_settlement_bank_full_name_not_blank
  CHECK (
    settlement_bank_full_name IS NULL OR
    btrim(settlement_bank_full_name) <> ''
  ),
  DROP CONSTRAINT IF EXISTS tenant_wechat_pay_applyments_settlement_bank_branch_id_not_blank,
  ADD CONSTRAINT tenant_wechat_pay_applyments_settlement_bank_branch_id_not_blank
  CHECK (
    settlement_bank_branch_id IS NULL OR
    btrim(settlement_bank_branch_id) <> ''
  );

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.settlement_account_type
  IS '微信支付 bank_account_info.bank_account_type：对公账户或经营者个人银行卡。';

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.settlement_account_number_masked
  IS '银行账号掩码展示值；不保存租户提交的明文银行账号。';

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.settlement_bank_full_name
  IS '微信支付 bank_account_info.bank_name：开户银行全称（含支行）。';

COMMENT ON COLUMN public.tenant_wechat_pay_applyments.settlement_bank_branch_id
  IS '微信支付 bank_account_info.bank_branch_id：开户银行联行号。';
