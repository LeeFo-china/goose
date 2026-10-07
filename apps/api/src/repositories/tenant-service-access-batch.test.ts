import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const facts = (tenant_id: string) => ({
  tenant_id, server_time: "2026-10-07T08:00:00Z", tenant_status: "active",
  service_access_policy: "entitlement_required", contract: null,
  paid_onboarding_order: null, legacy_subscription_status: null,
  current_trial: null, latest_trial: null,
});

describe("bounded tenant access batch", () => {
  test.each([20, 100])("fetches %i tenant states with one bounded RPC", async (size) => {
    const { TenantServiceAccessBatchRepository } = await import("./tenant-service-access-batch");
    const ids = Array.from({ length: size }, (_, index) => tenantId(index));
    const rpc = mock(async () => ({ data: ids.map(facts), error: null }));
    const repository = new TenantServiceAccessBatchRepository(() => ({ rpc }));
    const result = await repository.getByTenantIds(ids);
    expect(result.size).toBe(size);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("platform_service_trial_access_facts_batch", { p_tenant_ids: ids });
  });

  test("does not query for empty or oversized pages", async () => {
    const { TenantServiceAccessBatchRepository } = await import("./tenant-service-access-batch");
    const rpc = mock(async () => ({ data: [], error: null }));
    const repository = new TenantServiceAccessBatchRepository(() => ({ rpc }));
    expect((await repository.getByTenantIds([])).size).toBe(0);
    await expect(repository.getByTenantIds(Array.from({ length: 101 }, (_, i) => tenantId(i))))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    [], [facts(tenantId(2))], [facts(tenantId(1)), facts(tenantId(1))],
  ])("rejects missing or mismatched tenant facts", async (...rows) => {
    const { TenantServiceAccessBatchRepository } = await import("./tenant-service-access-batch");
    const repository = new TenantServiceAccessBatchRepository(() => ({
      rpc: async () => ({ data: rows, error: null }),
    }));
    await expect(repository.getByTenantIds([tenantId(1)])).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});
