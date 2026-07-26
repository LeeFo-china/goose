-- Rollback: in a new migration, drop
-- tr_wechat_pay_settlement_rules_updated_at, then drop
-- public.wechat_pay_settlement_rules. Existing applyment rows keep their saved
-- settlement_id and qualification_type values, but tenant-side selectable
-- industry options become unavailable until the table is recreated.

BEGIN;

CREATE TABLE public.wechat_pay_settlement_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  settlement_id text NOT NULL,
  qualification_type text NOT NULL,
  label text NOT NULL,
  rate_label text NOT NULL DEFAULT '',
  settlement_cycle_label text NOT NULL DEFAULT '',
  requires_special_qualification boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wechat_pay_settlement_rules_subject_type_check
    CHECK (subject_type IN ('SUBJECT_TYPE_ENTERPRISE', 'SUBJECT_TYPE_INDIVIDUAL')),
  CONSTRAINT wechat_pay_settlement_rules_settlement_id_not_blank_check
    CHECK (btrim(settlement_id) <> ''),
  CONSTRAINT wechat_pay_settlement_rules_qualification_type_not_blank_check
    CHECK (btrim(qualification_type) <> ''),
  CONSTRAINT wechat_pay_settlement_rules_label_not_blank_check
    CHECK (btrim(label) <> ''),
  CONSTRAINT wechat_pay_settlement_rules_status_check
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT wechat_pay_settlement_rules_sort_order_check
    CHECK (sort_order >= 0),
  CONSTRAINT wechat_pay_settlement_rules_version_check
    CHECK (version > 0),
  CONSTRAINT wechat_pay_settlement_rules_subject_settlement_industry_key
    UNIQUE (subject_type, settlement_id, qualification_type)
);

CREATE INDEX wechat_pay_settlement_rules_active_order_idx
ON public.wechat_pay_settlement_rules(subject_type, sort_order, id)
WHERE status = 'active';

CREATE TRIGGER tr_wechat_pay_settlement_rules_updated_at
BEFORE UPDATE ON public.wechat_pay_settlement_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wechat_pay_settlement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wechat_pay_settlement_rules FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wechat_pay_settlement_rules
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.wechat_pay_settlement_rules FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wechat_pay_settlement_rules
TO service_role;

COMMENT ON TABLE public.wechat_pay_settlement_rules IS
  '微信支付特约商户进件经营行业与结算规则字典。qualification_type 必须保存微信官方行业名，不保存内部路径。';
COMMENT ON COLUMN public.wechat_pay_settlement_rules.qualification_type IS
  '微信支付 settlement_info.qualification_type，必须填写官方行业名，例如 零售、餐饮。';

INSERT INTO public.wechat_pay_settlement_rules (
  id,
  subject_type,
  settlement_id,
  qualification_type,
  label,
  rate_label,
  settlement_cycle_label,
  requires_special_qualification,
  status,
  sort_order
) VALUES
  (
    '00000000-0000-4000-8000-000000000716',
    'SUBJECT_TYPE_ENTERPRISE',
    '716',
    '零售',
    '零售',
    '0.6%',
    'T+1',
    false,
    'active',
    10
  ),
  (
    '00000000-0000-4000-8000-000000000719',
    'SUBJECT_TYPE_INDIVIDUAL',
    '719',
    '零售',
    '零售',
    '0.6%',
    'T+1',
    false,
    'active',
    20
  )
ON CONFLICT (subject_type, settlement_id, qualification_type) DO UPDATE SET
  label = EXCLUDED.label,
  rate_label = EXCLUDED.rate_label,
  settlement_cycle_label = EXCLUDED.settlement_cycle_label,
  requires_special_qualification = EXCLUDED.requires_special_qualification,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

COMMIT;
