import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { accessFactsSchema, type TenantServiceAccessFacts } from "./tenant-service-access";
import { SupabaseDB } from "@/utils/supabase";

type BatchClient = {
  rpc(name: string, params: { p_tenant_ids: string[] }): PromiseLike<{
    data: unknown; error: unknown;
  }>;
};

export class TenantServiceAccessBatchRepository {
  constructor(private readonly clientProvider: () => BatchClient = () =>
    SupabaseDB.getAdminClient() as unknown as BatchClient) {}

  async getByTenantIds(tenantIds: string[]): Promise<Map<string, TenantServiceAccessFacts>> {
    const ids = [...new Set(tenantIds)];
    if (ids.length > 100) throw Errors.badRequest("一次最多查询 100 个租户服务状态");
    if (!ids.length) return new Map();
    let result: Awaited<ReturnType<BatchClient["rpc"]>>;
    try {
      result = await this.clientProvider().rpc(
        "platform_service_trial_access_facts_batch", { p_tenant_ids: ids },
      );
    } catch {
      throw Errors.dbError("批量查询租户服务状态失败");
    }
    const { data, error } = result;
    if (error) throw Errors.dbError("批量查询租户服务状态失败");
    const parsed = z.array(accessFactsSchema).max(100).safeParse(data);
    if (!parsed.success || parsed.data.length !== ids.length
      || new Set(parsed.data.map((item) => item.tenant_id)).size !== ids.length
      || parsed.data.some((item) => !ids.includes(item.tenant_id)
        || item.current_trial && item.current_trial.tenant_id !== item.tenant_id
        || item.latest_trial && item.latest_trial.tenant_id !== item.tenant_id)) {
      throw Errors.dbError("批量查询租户服务状态失败");
    }
    return new Map(parsed.data.map((item) => [item.tenant_id, {
      evaluatedAt: item.server_time,
      tenantStatus: item.tenant_status,
      serviceAccessPolicy: item.service_access_policy,
      contract: item.contract,
      paidOnboardingOrder: item.paid_onboarding_order,
      legacySubscriptionStatus: item.legacy_subscription_status,
      currentTrial: item.current_trial,
      latestTrial: item.latest_trial ?? null,
    }]));
  }
}

export const tenantServiceAccessBatchRepository = new TenantServiceAccessBatchRepository();
