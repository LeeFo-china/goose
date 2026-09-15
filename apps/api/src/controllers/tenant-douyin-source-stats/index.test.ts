import { expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("registers the tenant statistics route and validates pagination before auth", async () => {
  const module = await import(".").catch(() => ({
    TenantDouyinSourceStatsController: undefined,
  }));
  const Controller = module.TenantDouyinSourceStatsController;
  expect(Controller).toBeDefined();
  if (!Controller) return;
  const getStats = mock(async () => ({ overview: { entries: 0 } }));
  const controller = new Controller({ getStats } as never);
  const auth = { tenantId: "11111111-1111-4111-8111-111111111111" };
  const getRequiredTenantContext = mock(async () => auth);
  (controller as unknown as Record<string, unknown>).getRequiredTenantContext =
    getRequiredTenantContext;
  const routes: string[] = [];
  controller.registerExtraRoutes({ get: (path: string) => routes.push(path) } as never);
  expect(routes).toEqual(["/tenant/douyin-miniapp/source-stats"]);
  await expect(controller.getStats({ query: { pageSize: 101 } } as never))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(getRequiredTenantContext).not.toHaveBeenCalled();
  await expect(controller.getStats({ query: {} } as never)).resolves.toMatchObject({
    data: { overview: { entries: 0 } },
  });
  expect(getStats).toHaveBeenCalledWith(auth, { days: 7, groupBy: "content",
    page: 1, pageSize: 20 });
  const registry = await Bun.file(new URL("../../routes/index.ts", import.meta.url)).text();
  expect(registry).toContain("TenantDouyinSourceStatsController.registerExtraRoutes(app)");
});
