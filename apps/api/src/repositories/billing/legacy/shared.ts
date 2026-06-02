import { Errors } from "@/errors/error-factory";
import { randomUUID } from "node:crypto";
import type {
  BillingLedgerQuery,
  BillingEventQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingTenantListQuery,
} from "@/schema/billing";
import { SupabaseDB } from "@/utils/supabase";

export type BillingAccountBalance = {
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

export type BillingTenantLite = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
  created_at?: string | null;
};

export type BillingLedgerRow = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  direction: "in" | "out" | "freeze" | "unfreeze";
  change_credits: number;
  balance_after: number;
  frozen_after: number;
  event_type: string;
  metric_code: string | null;
  correlation_id: string | null;
  source_type: string | null;
  source_id: string | null;
  order_no: string | null;
  remark: string | null;
  operator_user_id: string | null;
  created_at: string | null;
};

export type BillingPricingRuleRow = {
  id: string;
  scope: "platform_default" | "tenant_override";
  rule_group_id: string | null;
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
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type BillingPricingRuleDbRow = {
  id: string;
  scope?: "platform_default" | "tenant_override" | null;
  rule_group_id?: string | null;
  tenant_id: string | null;
  metric_code: string;
  scene_code: string | null;
  provider?: string | null;
  provider_code?: string | null;
  model?: string | null;
  model_code?: string | null;
  unit?: string | null;
  unit_name?: string | null;
  unit_credits?: number | string | null;
  unit_price_credits?: number | string | null;
  min_charge_credits: number | string;
  priority: number;
  version: number;
  enabled: boolean;
  effective_at: string | null;
  expires_at: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BillingEventRow = {
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
  pricing_snapshot?: Record<string, unknown>;
  raw_usage?: unknown;
  failure_code: string | null;
  failure_message: string | null;
  settled_at: string | null;
  created_at: string | null;
};

export type BillingEventCreateInput = {
  tenant_id: string;
  metric_code: string;
  scene_code?: string | null;
  provider?: string | null;
  model?: string | null;
  source_type: string;
  source_id: string;
  source_sub_id?: string | null;
  billable_units: number;
  unit_name: string;
  unit_price_credits: number;
  credits: number;
  status: "estimated" | "failed";
  pricing_rule_id?: string | null;
  pricing_snapshot?: Record<string, unknown>;
  raw_usage?: Record<string, unknown>;
  failure_code?: string | null;
  failure_message?: string | null;
};

export type BillingAiShadowRow = {
  id: string;
  tenant_id: string | null;
  scene_code: string;
  provider_code: string | null;
  model_code: string | null;
  model_name: string | null;
  status: "success" | "failure";
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cached_input_tokens: number | null;
  reasoning_tokens: number | null;
  raw_usage: unknown;
  billable: boolean | null;
  source: string | null;
  created_at: string | null;
};

export type BillingAiUsageStatsRow = BillingAiShadowRow;

export type BillingAiUsageFilterOptionRow = Pick<
  BillingAiShadowRow,
  "tenant_id" | "scene_code" | "provider_code" | "model_code" | "model_name"
>;

export type BillingAiRoutingFilterOptionRow = {
  scene_code: string;
  name: string | null;
  status: string | null;
  primary_model?: {
    code: string;
    name: string | null;
    model_name: string | null;
    provider?: {
      code: string;
      name: string | null;
    } | null;
  } | null;
  fallback_model?: {
    code: string;
    name: string | null;
    model_name: string | null;
    provider?: {
      code: string;
      name: string | null;
    } | null;
  } | null;
};

export type BillingSmsShadowRow = {
  id: string;
  tenant_id: string | null;
  provider: string;
  channel_mode: string | null;
  purpose: string;
  template_code: string | null;
  status: string;
  request_id: string | null;
  sms_count: number;
  metadata: unknown;
  created_at: string | null;
};

export type BillingSocialVideoShadowRow = {
  id: string;
  tenant_id: string | null;
  platform: string;
  status: string;
  provider: string | null;
  audio_duration_seconds: number | null;
  billable: boolean | null;
  billing_duration_seconds: number | null;
  billing_minutes: number | null;
  billing_source: string | null;
  created_at: string | null;
  completed_at: string | null;
};

export { Errors, randomUUID, SupabaseDB };
export type {
  BillingLedgerQuery,
  BillingEventQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingTenantListQuery,
};
