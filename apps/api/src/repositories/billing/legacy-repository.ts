import { SupabaseDB } from "./legacy/shared";
import {
  ensureAccount,
  getAccountByTenantId,
  listAccountsByTenantIds,
  listTenantCandidates,
  listTenantIdsByKeyword,
  listTenantsByIds,
  countTenants,
  listAllAccounts,
  manualRecharge,
} from "./legacy/accounts";
import {
  listLedger,
  listBillingEvents,
  listExistingBillingEventKeys,
  buildEventKey,
  createBillingEvent,
  findBillingEventBySource,
  settleBillingEvent,
  freezeCredits,
  unfreezeCredits,
} from "./legacy/events";
import {
  listAiShadowRows,
  listAiUsageStatsRows,
  listAiUsageFilterOptionRows,
  listAiRoutingFilterOptionRows,
  listSmsShadowRows,
  listSocialVideoShadowRows,
} from "./legacy/shadow-logs";
import {
  listPricingRules,
  createPricingRule,
  updatePricingRule,
} from "./legacy/pricing-rules";
import type {
  BillingPricingRuleDbRow,
  BillingPricingRuleRow,
} from "./legacy/shared";

export type {
  BillingAccountBalance,
  BillingAiRoutingFilterOptionRow,
  BillingAiShadowRow,
  BillingAiUsageFilterOptionRow,
  BillingAiUsageStatsRow,
  BillingEventCreateInput,
  BillingEventRow,
  BillingLedgerRow,
  BillingPricingRuleRow,
  BillingSmsShadowRow,
  BillingSocialVideoShadowRow,
  BillingTenantLite,
} from "./legacy/shared";

class BillingRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string) {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from(table);
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (this.client as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc(name, params);
  }

  private mapPricingRule(row: BillingPricingRuleDbRow): BillingPricingRuleRow {
    return {
      id: row.id,
      scope: row.scope || (row.tenant_id ? "tenant_override" : "platform_default"),
      rule_group_id: row.rule_group_id || null,
      tenant_id: row.tenant_id,
      metric_code: row.metric_code,
      scene_code: row.scene_code,
      provider: row.provider ?? row.provider_code ?? null,
      model: row.model ?? row.model_code ?? null,
      unit: row.unit ?? row.unit_name ?? "event",
      unit_credits: Number(row.unit_credits ?? row.unit_price_credits ?? 0),
      min_charge_credits: Number(row.min_charge_credits || 0),
      priority: row.priority,
      version: row.version,
      enabled: row.enabled,
      effective_at: row.effective_at,
      expires_at: row.expires_at,
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  ensureAccount = ensureAccount;
  getAccountByTenantId = getAccountByTenantId;
  listAccountsByTenantIds = listAccountsByTenantIds;
  listTenantCandidates = listTenantCandidates;
  listTenantIdsByKeyword = listTenantIdsByKeyword;
  listTenantsByIds = listTenantsByIds;
  countTenants = countTenants;
  listAllAccounts = listAllAccounts;
  manualRecharge = manualRecharge;
  listLedger = listLedger;
  listBillingEvents = listBillingEvents;
  listExistingBillingEventKeys = listExistingBillingEventKeys;
  buildEventKey = buildEventKey;
  createBillingEvent = createBillingEvent;
  findBillingEventBySource = findBillingEventBySource;
  settleBillingEvent = settleBillingEvent;
  freezeCredits = freezeCredits;
  unfreezeCredits = unfreezeCredits;
  listAiShadowRows = listAiShadowRows;
  listAiUsageStatsRows = listAiUsageStatsRows;
  listAiUsageFilterOptionRows = listAiUsageFilterOptionRows;
  listAiRoutingFilterOptionRows = listAiRoutingFilterOptionRows;
  listSmsShadowRows = listSmsShadowRows;
  listSocialVideoShadowRows = listSocialVideoShadowRows;
  listPricingRules = listPricingRules;
  createPricingRule = createPricingRule;
  updatePricingRule = updatePricingRule;
}

export const billingRepository = new BillingRepository();
