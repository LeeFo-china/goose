CREATE TABLE IF NOT EXISTS public.platform_partner_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  tenant_recharge_commission_bps integer NOT NULL,
  lead_service_fee_commission_bps integer NOT NULL,
  lead_service_fee_default_rate_bps integer NOT NULL DEFAULT 250,
  settlement_cycle text NOT NULL DEFAULT 'monthly',
  settlement_method text NOT NULL DEFAULT 'manual',
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  version integer NOT NULL DEFAULT 1,
  effective_at timestamptz NOT NULL DEFAULT now(),
  expired_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_levels_status_check CHECK (
    status IN ('active', 'inactive')
  ),
  CONSTRAINT platform_partner_levels_recharge_rate_check CHECK (
    tenant_recharge_commission_bps BETWEEN 0 AND 10000
  ),
  CONSTRAINT platform_partner_levels_lead_rate_check CHECK (
    lead_service_fee_commission_bps BETWEEN 0 AND 10000
  ),
  CONSTRAINT platform_partner_levels_service_fee_rate_check CHECK (
    lead_service_fee_default_rate_bps BETWEEN 0 AND 10000
  ),
  CONSTRAINT platform_partner_levels_settlement_cycle_check CHECK (
    settlement_cycle = 'monthly'
  ),
  CONSTRAINT platform_partner_levels_settlement_method_check CHECK (
    settlement_method = 'manual'
  )
);

CREATE TABLE IF NOT EXISTS public.platform_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject_type text NOT NULL,
  contact_name text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  level_id uuid NOT NULL REFERENCES public.platform_partner_levels(id),
  region_codes text[] NOT NULL DEFAULT '{}'::text[],
  contract_status text NOT NULL DEFAULT 'pending',
  settlement_account_status text NOT NULL DEFAULT 'pending',
  settlement_account jsonb NOT NULL DEFAULT '{}'::jsonb,
  remark text NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partners_status_check CHECK (
    status IN ('pending', 'active', 'suspended', 'terminated')
  ),
  CONSTRAINT platform_partners_subject_type_check CHECK (
    subject_type IN ('personal', 'individual_business', 'company')
  )
);

CREATE TABLE IF NOT EXISTS public.platform_partner_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  code text NOT NULL UNIQUE,
  region_code text NULL,
  campaign_code text NULL,
  status text NOT NULL DEFAULT 'active',
  scan_count integer NOT NULL DEFAULT 0,
  submitted_count integer NOT NULL DEFAULT 0,
  approved_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NULL,
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_partner_invite_codes_status_check CHECK (
    status IN ('active', 'disabled', 'expired')
  )
);

CREATE TABLE IF NOT EXISTS public.tenant_partner_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  invite_code_id uuid NULL REFERENCES public.platform_partner_invite_codes(id),
  source_type text NOT NULL,
  source_id text NULL,
  status text NOT NULL DEFAULT 'active',
  bound_at timestamptz NOT NULL DEFAULT now(),
  unbound_at timestamptz NULL,
  changed_by_employee_id uuid NULL REFERENCES public.employees(id),
  change_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_partner_bindings_status_check CHECK (
    status IN ('active', 'pending_transfer', 'ended')
  ),
  CONSTRAINT tenant_partner_bindings_source_type_check CHECK (
    source_type IN ('invite_code', 'manual', 'lead_source')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_partner_bindings_one_active_idx
  ON public.tenant_partner_bindings(tenant_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.platform_revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_type text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  partner_id uuid NULL REFERENCES public.platform_partners(id),
  partner_level_id uuid NULL REFERENCES public.platform_partner_levels(id),
  binding_id uuid NULL REFERENCES public.tenant_partner_bindings(id),
  source_type text NOT NULL,
  source_id text NOT NULL,
  gross_amount_fen bigint NOT NULL,
  revenue_amount_fen bigint NOT NULL,
  paid_amount_fen bigint NOT NULL DEFAULT 0,
  service_fee_rate_bps integer NULL,
  commission_rate_bps integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_at timestamptz NULL,
  paid_at timestamptz NULL,
  refundable_until timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_employee_id uuid NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_revenue_events_type_check CHECK (
    revenue_type IN ('tenant_recharge', 'lead_service_fee')
  ),
  CONSTRAINT platform_revenue_events_status_check CHECK (
    status IN ('pending', 'confirmed', 'refunded', 'reversed', 'blocked')
  ),
  CONSTRAINT platform_revenue_events_amount_check CHECK (
    gross_amount_fen >= 0
    AND revenue_amount_fen >= 0
    AND paid_amount_fen >= 0
  ),
  CONSTRAINT platform_revenue_events_rate_check CHECK (
    commission_rate_bps BETWEEN 0 AND 10000
  ),
  CONSTRAINT platform_revenue_events_service_fee_rate_check CHECK (
    service_fee_rate_bps IS NULL
    OR service_fee_rate_bps BETWEEN 0 AND 10000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_revenue_events_source_unique_idx
  ON public.platform_revenue_events(revenue_type, source_type, source_id);

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  revenue_event_id uuid NOT NULL REFERENCES public.platform_revenue_events(id),
  revenue_type text NOT NULL,
  base_amount_fen bigint NOT NULL,
  commission_rate_bps integer NOT NULL,
  commission_amount_fen bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NULL,
  settlement_batch_id uuid NULL,
  blocked_reason text NULL,
  failure_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_commission_ledger_type_check CHECK (
    revenue_type IN ('tenant_recharge', 'lead_service_fee')
  ),
  CONSTRAINT partner_commission_ledger_status_check CHECK (
    status IN (
      'pending',
      'blocked',
      'available',
      'settling',
      'settled',
      'failed',
      'reversed'
    )
  ),
  CONSTRAINT partner_commission_ledger_amount_check CHECK (
    base_amount_fen >= 0
    AND commission_amount_fen >= 0
  ),
  CONSTRAINT partner_commission_ledger_rate_check CHECK (
    commission_rate_bps BETWEEN 0 AND 10000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_commission_ledger_event_unique_idx
  ON public.partner_commission_ledger(revenue_event_id);

CREATE TABLE IF NOT EXISTS public.partner_settlement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no text NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_amount_fen bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  settlement_method text NOT NULL DEFAULT 'manual',
  payment_reference text NULL,
  payment_proof_url text NULL,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id),
  paid_by_employee_id uuid NULL REFERENCES public.employees(id),
  paid_at timestamptz NULL,
  remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_settlement_batches_status_check CHECK (
    status IN ('draft', 'reviewing', 'paid', 'canceled')
  ),
  CONSTRAINT partner_settlement_batches_method_check CHECK (
    settlement_method = 'manual'
  ),
  CONSTRAINT partner_settlement_batches_period_check CHECK (
    period_end >= period_start
  )
);

CREATE TABLE IF NOT EXISTS public.partner_settlement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.partner_settlement_batches(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES public.partner_commission_ledger(id),
  revenue_event_id uuid NOT NULL REFERENCES public.platform_revenue_events(id),
  amount_fen bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_settlement_items_amount_check CHECK (amount_fen >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_settlement_items_ledger_unique_idx
  ON public.partner_settlement_items(ledger_id);

DO $$
BEGIN
  ALTER TABLE public.partner_commission_ledger
    ADD CONSTRAINT partner_commission_ledger_settlement_batch_fk
    FOREIGN KEY (settlement_batch_id)
    REFERENCES public.partner_settlement_batches(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS platform_partners_status_created_idx
  ON public.platform_partners(status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_partners_phone_idx
  ON public.platform_partners(phone);

CREATE INDEX IF NOT EXISTS platform_partner_invite_codes_partner_idx
  ON public.platform_partner_invite_codes(partner_id, status);

CREATE INDEX IF NOT EXISTS tenant_partner_bindings_partner_idx
  ON public.tenant_partner_bindings(partner_id, status, bound_at DESC);

CREATE INDEX IF NOT EXISTS platform_revenue_events_partner_created_idx
  ON public.platform_revenue_events(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_revenue_events_tenant_created_idx
  ON public.platform_revenue_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_revenue_events_status_created_idx
  ON public.platform_revenue_events(status, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_commission_ledger_partner_status_idx
  ON public.partner_commission_ledger(partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS partner_settlement_batches_partner_period_idx
  ON public.partner_settlement_batches(
    partner_id,
    period_start DESC,
    period_end DESC
  );

INSERT INTO public.platform_partner_levels (
  code,
  name,
  tenant_recharge_commission_bps,
  lead_service_fee_commission_bps,
  lead_service_fee_default_rate_bps,
  settlement_cycle,
  settlement_method,
  sort_order,
  requirements
)
VALUES
  (
    'certified_partner',
    '认证合伙人',
    1000,
    2500,
    250,
    'monthly',
    'manual',
    10,
    '{"description":"完成主体认证和合作协议"}'::jsonb
  ),
  (
    'city_partner',
    '城市合伙人',
    1500,
    3500,
    250,
    'monthly',
    'manual',
    20,
    '{"description":"有效装企数和月平台收入达标"}'::jsonb
  ),
  (
    'city_operation_center',
    '城市运营中心',
    2000,
    4500,
    250,
    'monthly',
    'manual',
    30,
    '{"description":"具备团队化区域运营能力"}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  tenant_recharge_commission_bps = EXCLUDED.tenant_recharge_commission_bps,
  lead_service_fee_commission_bps = EXCLUDED.lead_service_fee_commission_bps,
  lead_service_fee_default_rate_bps = EXCLUDED.lead_service_fee_default_rate_bps,
  settlement_cycle = EXCLUDED.settlement_cycle,
  settlement_method = EXCLUDED.settlement_method,
  sort_order = EXCLUDED.sort_order,
  requirements = EXCLUDED.requirements,
  updated_at = now();
