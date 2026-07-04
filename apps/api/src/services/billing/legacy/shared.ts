import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
  billingRepository,
  type BillingAccountBalance,
  type BillingAiShadowRow,
  type BillingAiUsageStatsRow,
  type BillingEventCreateInput,
  type BillingLedgerRow,
  type BillingPricingRuleRow,
  type BillingSmsShadowRow,
  type BillingSocialVideoShadowRow,
  type BillingTenantLite,
} from "@/repositories/billing";
import type { SmsSendLogRecord } from "@/repositories/sms-send-logs";
import type { SocialVideoTranscriptionRecord } from "@/repositories/social-video-transcriptions";
import type {
  BillingDateRangeQuery,
  BillingSubscriptionInvoiceQuery,
  BillingEventQuery,
  BillingAiUsageStatsQuery,
  BillingLedgerQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingShadowRunInput,
  BillingTenantListQuery,
} from "@/schema/billing";
import type { PlatformAuditLogAction } from "@/schema/platform-audit-logs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

export const LOW_BALANCE_THRESHOLD = Number(process.env.BILLING_LOW_BALANCE_CREDITS || 5000);

export const BILLING_EVENT_SOURCE = {
  ai: "ai_call_log",
  sms: "sms_send_log",
  socialVideo: "social_video_transcription",
} as const;

export type ShadowBillingContext = {
  rules: BillingPricingRuleRow[];
  limit: number;
  startDate?: string;
  endDate?: string;
};

export function emptyAccount(tenantId: string): BillingAccountBalance {
  return {
    id: "",
    tenant_id: tenantId,
    balance_credits: 0,
    frozen_credits: 0,
    available_credits: 0,
    total_recharged_credits: 0,
    total_consumed_credits: 0,
    status: "active",
    last_activity_at: null,
    updated_at: null,
  };
}

export function sumCredits(rows: BillingLedgerRow[], direction: BillingLedgerRow["direction"]) {
  return rows
    .filter((item) => item.direction === direction)
    .reduce((total, item) => total + Number(item.change_credits || 0), 0);
}

export function groupByMetric(rows: Array<{ metric_code: string | null; credits: number }>) {
  const metrics = new Map<string, number>();
  for (const row of rows) {
    const key = row.metric_code || "unknown";
    metrics.set(key, (metrics.get(key) || 0) + Number(row.credits || 0));
  }

  return Array.from(metrics.entries()).map(([metric_code, credits]) => ({
    metric_code,
    credits,
  }));
}

export function enrichLedger(rows: BillingLedgerRow[], tenants: BillingTenantLite[]) {
  const tenantMap = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return rows.map((item) => ({
    ...item,
    tenant: tenantMap.get(item.tenant_id) || null,
  }));
}

export function sortStrings(values: Iterable<string>) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function ceilCredits(units: number, unitCredits: number, minChargeCredits = 0) {
  if (units <= 0 || unitCredits <= 0) return 0;
  return Math.max(Math.ceil(units * unitCredits), minChargeCredits);
}

export function toNumber(value: number | null | undefined) {
  return Number(value || 0);
}

export function percentileDisc(values: number[], percentile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[Math.min(index, sorted.length - 1)] ?? 0;
}


export { Errors, ErrorCodes, billingRepository, accessPolicyService, platformAuditLogService };
export type {
  BillingAccountBalance,
  BillingAiShadowRow,
  BillingAiUsageStatsRow,
  BillingEventCreateInput,
  BillingLedgerRow,
  BillingPricingRuleRow,
  BillingSmsShadowRow,
  BillingSocialVideoShadowRow,
  BillingTenantLite,
  SmsSendLogRecord,
  SocialVideoTranscriptionRecord,
  BillingDateRangeQuery,
  BillingSubscriptionInvoiceQuery,
  BillingEventQuery,
  BillingAiUsageStatsQuery,
  BillingLedgerQuery,
  BillingManualRechargeInput,
  BillingPricingRuleCreateInput,
  BillingPricingRuleQuery,
  BillingPricingRuleUpdateInput,
  BillingShadowRunInput,
  BillingTenantListQuery,
  PlatformAuditLogAction,
  AuthContext,
};
