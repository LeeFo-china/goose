export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type BillingAccount = {
  id: string;
  tenant_id: string;
  balance_credits: number;
  frozen_credits: number;
  available_credits: number;
  total_recharged_credits: number;
  total_consumed_credits: number;
  status: string;
  last_activity_at: string | null;
  updated_at: string | null;
};

export type BillingTenant = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  billing_account: BillingAccount;
  low_balance: boolean;
};

export type BillingTenantListData = {
  list: BillingTenant[];
  pagination: Pagination;
  low_balance_threshold: number;
};

export type BillingPlatformSummary = {
  tenant_count: number;
  active_account_count: number;
  total_balance_credits: number;
  total_frozen_credits: number;
  total_available_credits: number;
  total_consumed_credits: number;
  low_balance_count: number;
  low_balance_threshold: number;
};

export type BillingLedger = {
  id: string;
  tenant_id: string;
  direction: "in" | "out" | "freeze" | "unfreeze";
  change_credits: number;
  balance_after: number;
  frozen_after: number;
  event_type: string;
  metric_code: string | null;
  source_type: string | null;
  source_id: string | null;
  order_no: string | null;
  remark: string | null;
  created_at: string | null;
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

export type BillingLedgerListData = {
  list: BillingLedger[];
  pagination: Pagination;
};

export type BillingPricingRule = {
  id: string;
  scope: "platform_default" | "tenant_override";
  tenant_id: string | null;
  metric_code: string;
  scene_code: string | null;
  provider: string | null;
  model: string | null;
  unit: string;
  unit_credits: number;
  min_charge_credits: number;
  priority: number;
  version: number;
  enabled: boolean;
  effective_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BillingPricingRuleListData = {
  list: BillingPricingRule[];
  pagination: Pagination;
};

export type PlatformWechatPayConfigView = {
  id: string;
  provider: "wechat_pay";
  principal_type: "platform";
  merchant_mode: "direct_merchant";
  merchant_name: string | null;
  merchant_id: string | null;
  app_id: string | null;
  encrypted_config_ref: string | null;
  serial_no_masked: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: "pending" | "active" | "disabled" | "suspended";
  validation_status: "unchecked" | "valid" | "invalid";
  last_validated_at: string | null;
  has_encrypted_config_ref: boolean;
  created_at: string;
  updated_at: string;
};

export type PlatformWechatPayConfigResult = {
  configured: boolean;
  can_manage: boolean;
  config: PlatformWechatPayConfigView | null;
};

export type PlatformRechargeProduct = {
  id: string;
  code: string;
  title: string;
  amount_fen: number;
  credits: number;
  bonus_credits: number;
  enabled: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PlatformRechargeProductListData = {
  list: PlatformRechargeProduct[];
  pagination: Pagination;
};

export type PlatformRechargeOrder = {
  id: string;
  tenant_id: string;
  order_no: string;
  package_code: string | null;
  credits: number;
  bonus_credits: number;
  amount_fen: number;
  paid_amount_fen: number;
  status: "pending" | "paid" | "closed" | "refunded";
  out_trade_no: string | null;
  transaction_id: string | null;
  paid_at: string | null;
  created_at: string;
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

export type PlatformRechargeOrderListData = {
  list: PlatformRechargeOrder[];
  pagination: Pagination;
};

export type PlatformRechargeNotification = {
  id: string;
  tenant_id: string;
  credit_order_id: string | null;
  notify_id: string;
  event_type: string;
  resource_type: string | null;
  raw_payload: Record<string, unknown>;
  signature_valid: boolean;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformRechargeAuditLog = {
  id: string;
  action: string;
  actor_employee_id: string | null;
  actor_user_id: string | null;
  target_tenant_id: string | null;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  status: string;
  summary: string | null;
  metadata: unknown;
  created_at: string;
};

export type PlatformRechargeOrderDetailData = {
  order: PlatformRechargeOrder;
  notifications: PlatformRechargeNotification[];
  audit_logs: PlatformRechargeAuditLog[];
};

export type BillingEvent = {
  id: string;
  tenant_id: string;
  metric_code: string;
  scene_code: string | null;
  provider: string | null;
  model: string | null;
  source_type: string;
  source_id: string;
  source_sub_id: string | null;
  billable_units: number;
  unit_name: string;
  unit_price_credits: number;
  credits: number;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string | null;
  tenant?: {
    id: string;
    name: string | null;
    slug: string | null;
  } | null;
};

export type BillingEventListData = {
  list: BillingEvent[];
  pagination: Pagination;
};

export type BillingAiUsageStats = {
  range: {
    start_date: string | null;
    end_date: string | null;
  };
  controls: {
    limit: number;
    min_sample_count: number;
    safety_factor: number;
  };
  totals: {
    groups: number;
    logs: number;
    billable_samples: number;
    missing_usage: number;
    ready_groups: number;
    watch_groups: number;
    pricing_rule_missing_groups: number;
    usage_missing_groups: number;
  };
  list: Array<{
    scene_code: string;
    provider_code: string | null;
    model_code: string | null;
    model_name: string | null;
    total_logs: number;
    billable_sample_count: number;
    sample_gap: number;
    missing_usage_count: number;
    missing_pricing_rule_count: number;
    pricing_rule_matched: boolean;
    cached_input_token_call_count: number;
    reasoning_token_call_count: number;
    token_percentiles: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
    credit_percentiles: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
    suggested_min_charge_credits: number;
    blocking_reasons: string[];
    ready_for_phase6: boolean;
  }>;
};

export type BillingAiUsageFilterOptions = {
  tenants: Array<{
    id: string;
    name: string;
    slug: string | null;
  }>;
  scene_codes: string[];
  scene_options: Array<{
    code: string;
    name: string | null;
  }>;
  provider_codes: string[];
  provider_options: Array<{
    code: string;
    name: string | null;
  }>;
  models: Array<{
    code: string;
    name: string | null;
    provider_code: string | null;
  }>;
};

export type TenantBillingSummary = {
  account: BillingAccount;
  period: {
    start_date: string | null;
    end_date: string | null;
  };
  totals: {
    recharged_credits: number;
    consumed_credits: number;
    frozen_credits: number;
    available_credits: number;
  };
  metrics: Array<{
    metric_code: string;
    credits: number;
  }>;
};

export type TenantFeatureEstimates = {
  sms: {
    metric_code: string;
    unit: string;
    unit_credits: number;
    min_charge_credits: number;
  };
  social_video: {
    metric_code: string;
    unit: string;
    unit_credits: number;
    min_charge_credits: number;
  };
  ai: {
    input_token_1k_credits: number;
    output_token_1k_credits: number;
    min_charge_credits: number;
  };
};
