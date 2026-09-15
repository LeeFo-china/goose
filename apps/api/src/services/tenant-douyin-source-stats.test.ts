import { expect, mock, test } from "bun:test";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

test("binds source statistics to the signed-in tenant and requires tenant-wide read", async () => {
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  const module = await import("./tenant-douyin-source-stats").catch(() => ({
    TenantDouyinSourceStatsService: undefined,
  }));
  const Service = module.TenantDouyinSourceStatsService;
  expect(Service).toBeDefined();
  if (!Service) return;
  const load = mock(async () => ({ sources: { list: [] } }));
  const assertTenantContext = mock(() => TENANT_ID);
  const assertPermission = mock(() => "all");
  const service = new Service({ repository: { load }, accessPolicy: {
    assertTenantContext, assertPermission,
  } } as never);
  const auth = { tenantId: TENANT_ID, permissions: [] } as never;
  await service.getStats(auth, { days: 30, groupBy: "account",
    page: 2, pageSize: 20 });
  expect(assertPermission).toHaveBeenCalledWith(auth, "douyin_miniapp.read");
  expect(load).toHaveBeenCalledWith({ tenantId: TENANT_ID,
    days: 30, groupBy: "account", page: 2, pageSize: 20 });
  assertPermission.mockImplementationOnce(() => "own");
  await expect(service.getStats(auth, { days: 7, groupBy: "content",
    page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  expect(load).toHaveBeenCalledTimes(1);
});
